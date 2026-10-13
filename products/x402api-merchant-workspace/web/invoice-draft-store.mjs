// MIT. Atomic per-working-copy browser storage; no merchant credential is retained.
import {validate,identity,same,MAX_DRAFTS} from './invoice-drafts.mjs';
const DATABASE='merchant-invoice-working-copies-v1',TABLE='drafts';
const key=record=>record.owner.storeId+':'+record.owner.tenantId+':'+record.id;
const ownerKey=owner=>identity(owner).storeId+':'+owner.tenantId;
let opening=null;
function database(){
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{const store=request.result.createObjectStore(TABLE,{keyPath:'key'});store.createIndex('owner','owner');};
  request.onerror=()=>{opening=null;reject(request.error||new Error('Browser storage could not open. Download the complete working copy.'));};
  request.onblocked=()=>{opening=null;reject(new Error('Close the older merchant tab, then reopen browser draft storage.'));};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
 });return opening;
}
export async function list(owner){
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction(TABLE,'readonly'),request=tx.objectStore(TABLE).index('owner').getAll(ownerKey(owner));let result;
  request.onsuccess=()=>{try{result=request.result.map(r=>validate(r.value,owner)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));}catch(error){reject(error);}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Read the retained browser drafts again.'));
 });
}
export async function save(record,expectedRevision){
 const value=validate(record),db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE),request=store.get(key(value));let result,failure;
  function fail(message){failure=new Error(message);tx.abort();}
  request.onsuccess=()=>{
   try{
    const prior=request.result?validate(request.result.value,value.owner):null;
    if(expectedRevision===null?!!prior:!prior||prior.revision!==expectedRevision)return fail('Another tab changed this working copy. Download your entered copy, then reopen the saved revision.');
    if(prior?.request&&!same(prior.request,value.request))return fail('Keep the exact original submitted invoice request.');
    if(prior?.receipt&&!same(prior.receipt,value.receipt))return fail('Keep the original saved-invoice receipt.');
    const write=()=>{
     result=validate({...value,revision:(prior?.revision||0)+1,updatedAt:new Date().toISOString()});
     store.put({key:key(result),owner:ownerKey(result.owner),value:result});
    };
    if(!prior){const count=store.index('owner').count(ownerKey(value.owner));count.onsuccess=()=>count.result>=MAX_DRAFTS?fail('Keep at most 128 working copies in this browser. Download and remove completed copies to make room.'):write();}
    else write();
   }catch(error){failure=error;tx.abort();}
  };
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('The working copy was not saved. Keep this page open and download it.'));
 });
}
export async function remove(record){
 const value=validate(record),db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction(TABLE,'readwrite'),store=tx.objectStore(TABLE),request=store.get(key(value));let failure;
  request.onsuccess=()=>{const current=request.result?.value;if(!current||current.revision!==value.revision){failure=new Error('Another tab changed this working copy. Reopen the saved revision first.');tx.abort();return;}
   if(current.request&&!current.receipt){failure=new Error('Resolve the original invoice request before removing its working copy.');tx.abort();return;}store.delete(key(value));};
  tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(failure||tx.error||new Error('The working copy could not be removed.'));
 });
}
