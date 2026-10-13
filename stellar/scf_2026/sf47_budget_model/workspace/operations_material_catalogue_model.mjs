// SPDX-License-Identifier: MIT
// Retained review copies only. Catalogue validation and Installation writes stay native.
import {validateSupplierState,mergeSupplierState} from './operations_material_supplier_intake_model.mjs';
import {Sha256} from './operations_installation_source_hash.mjs';
import {validateMaterialFollowing,materialFollowingInput} from './operations_material_following_model.mjs';
export const SCHEMA='stellar-forge.material-catalogue-working-copies.v1';
export const COPY='stellar-forge.material-catalogue-working-copy.v1';
export const SELECTION='stellar-forge.material-customer-installation.v1.selection';
export const MAX_SOURCE=128*1024*1024,MAX_ARCHIVE=512*1024*1024;
export const clone=x=>structuredClone(x);
export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const need=(ok,message)=>{if(!ok)throw Error(message);};
export const canonical=x=>JSON.stringify(x,(_,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const same=(a,b)=>canonical(a)===canonical(b);
export const utf8=s=>new TextEncoder().encode(s);
export const hashBytes=b=>new Sha256().update(b).hex();
export const identity=s=>({bytes:utf8(s).length,sha256:hashBytes(utf8(s))});
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=(x,max)=>typeof x==='string'&&x.length<=max;
export function originalSource(metadata,raw,inspection){
 need(object(metadata)&&typeof raw==='string'&&object(inspection),'Retain the original complete catalogue and native inspection.');
 const file=identity(raw);
 need(file.bytes>0&&file.bytes<=MAX_SOURCE&&file.bytes===metadata.bytes&&file.sha256===metadata.sha256,'Original catalogue bytes differ from their attached source identity.');
 need(inspection.schema==='stellar-forge.material-source-desk-inspection.v1','Use the native complete material catalogue inspection.');
 need(same(inspection.file,file)&&object(inspection.catalogue)&&Array.isArray(inspection.editions)&&Array.isArray(inspection.sources)&&Array.isArray(inspection.supplierPlans)&&Array.isArray(inspection.supplierReviews),'Keep the full catalogue, source, edition and supplier inventory.');
 need(typeof metadata.id==='string'&&metadata.id&&hex(file.sha256),'Keep the original attached source ID.');
 return {metadata:clone(metadata),raw,inspection:clone(inspection)};
}
export function selectionOf(copy,source){
 const s=JSON.parse(copy.selectionText);
 const c=source.inspection.catalogue;
 need(object(s)&&s.schema===SELECTION&&Object.keys(s).length===9,'Select the complete native material preparation selection.');
 const keys=['schema','operationId','catalogId','catalogRevision','activeEditionId','bundleSha256','supplierPlanId','supplierPlanRevision','supplierReviewId'];
 need(Object.keys(s).every(k=>keys.includes(k))&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(s.operationId),'Keep the original selection fields and a stable operation ID.');
 need(s.catalogId===c.id&&s.catalogRevision===c.revision&&s.activeEditionId===c.activeEditionId&&s.bundleSha256===source.metadata.sha256,'The selected catalogue, revision, active edition or bundle changed.');
 const plans=source.inspection.supplierPlans,reviews=source.inspection.supplierReviews;
 if(s.supplierPlanId===null)need(s.supplierPlanRevision===null&&s.supplierReviewId===null,'Select an original supplier plan before a review.');
 else{
  const p=plans.find(x=>x.id===s.supplierPlanId);
  need(p&&p.revision===s.supplierPlanRevision,'Select the retained exact supplier plan revision.');
  if(s.supplierReviewId!==null){const r=reviews.find(x=>x.id===s.supplierReviewId);need(r&&(r.planId??r.record?.planId)===p.id,'Select an original review belonging to that supplier plan.');}
 }
 return s;
}
export function newCopy({id,name,scope,source,at}){
 need(typeof id==='string'&&id&&text(name,300)&&name.trim(),'Name the complete material source review.');
 return {schema:COPY,id,name,scope:clone(scope),sourceId:source.metadata.id,sourceSha256:source.metadata.sha256,
 createdAt:at,updatedAt:at,operationId:'material-'+id,notes:'',document:null,template:null,
 selectionText:'',bindingsText:'',prepared:null,preparedInput:null,history:[],handoffs:[],packages:[]};
}
export function sourceFor(state,c){
 const s=state.sources.find(x=>x.metadata.id===c.sourceId&&x.metadata.sha256===c.sourceSha256);
 need(s,'The complete original source for this review is absent.');return s;
}
export function inputValue(c,s){
 need(object(c.document)&&object(c.document.workshare)&&c.template,'Receive the complete original Workshare draft first.');
 const selection=selectionOf(c,s),bindings=JSON.parse(c.bindingsText);
 need(object(bindings),'Keep complete Installation bindings as an object.');
 return {document:clone(c.document),selection,bindings,...materialFollowingInput(c)};
}
export function inputHash(c,s){return identity(canonical(inputValue(c,s))).sha256;}
export function checkpoint(c,label,at){
 need(text(label,300)&&label.trim()&&c.history.length<100,'Name a bounded checkpoint, or fork a new complete review.');
 const next=clone(c),snapshot=clone(c);delete snapshot.history;
 next.history.push({label,at,sha256:identity(canonical(snapshot)).sha256,snapshot});
 next.updatedAt=at;return next;
}
export function validateCopy(c,sources,{history=true}={}){
 validateMaterialFollowing(c,sources);
 need(object(c)&&c.schema===COPY&&text(c.id,200)&&c.id&&text(c.name,300)&&object(c.scope)&&text(c.scope.caseId,200)&&text(c.scope.planId,200)&&text(c.scope.createdAt,100),'Keep the original complete review identity and case scope.');
 const s=sources.find(x=>x.metadata.id===c.sourceId&&x.metadata.sha256===c.sourceSha256);
 need(s&&text(c.operationId,200)&&text(c.notes,16000)&&text(c.selectionText,2*1024*1024)&&text(c.bindingsText,2*1024*1024),'Keep the original source and complete unfinished selection/binding text.');
 need(c.document===null||object(c.document),'Retain the complete original Workshare document.');
 need(c.template===null||object(c.template),'Retain the complete original preparation template.');
 need(Array.isArray(c.history)&&c.history.length<=100&&Array.isArray(c.handoffs)&&c.handoffs.length<=100&&Array.isArray(c.packages)&&c.packages.length<=100,'Retain bounded complete preparation, handoff and download history.');
 if(history)for(const h of c.history){
  need(object(h)&&text(h.label,300)&&h.sha256===identity(canonical(h.snapshot)).sha256,'A retained checkpoint changed.');
  validateCopy({...h.snapshot,history:[]},sources,{history:false});
 }
 if(c.prepared){
  if(c.following)need(same(c.preparedInput.followingReview,JSON.parse(c.following.reviewText))&&same(Object.fromEntries(Object.keys(c.following.request).map(k=>[k,c.preparedInput[k]])),c.following.request),'Changed following review needs a new original preparation.');
  need(object(c.prepared)&&object(c.prepared.scope)&&c.prepared.scope.caseId===c.scope.caseId&&object(c.prepared.source)&&c.prepared.source.id===c.sourceId&&c.prepared.source.sha256===c.sourceSha256&&object(c.preparedInput),'Keep the exact source-bound native preparation and request.');
  need(same(c.preparedInput.document,c.document)&&same(c.preparedInput.selection,JSON.parse(c.selectionText))&&same(c.preparedInput.bindings,JSON.parse(c.bindingsText)),'Changed bindings require a new preparation; retain old editions in history.');
 }
 return c;
}
export function validateIntake(v){
 need(object(v)&&text(v.id,200)&&object(v.scope)&&['PREPARED','COMMITTED','REJECTED'].includes(v.state)&&object(v.identity)&&v.identity.bytes>0&&v.identity.bytes<=MAX_SOURCE&&hex(v.identity.sha256),'Keep the complete original typed file intake.');
 const b=v.body,d=b?.data;
 need(object(b)&&text(b.requestId,200)&&b.requestId&&Number.isSafeInteger(b.expectedVersion)&&b.expectedVersion>0&&text(b.actor,300)&&b.actor.trim()&&b.action==='material-catalog-source.add'&&text(b.note,12000)&&object(d),'Keep the exact original material source command.');
 need(Object.keys(b).every(k=>['requestId','expectedVersion','actor','action','note','data'].includes(k))&&Object.keys(d).every(k=>['filename','mediaType','kind','sourceUrl','observedAt','expectedSha256','contentBase64'].includes(k)),'Unexpected original attachment command fields.');
 need(text(d.filename,240)&&d.filename&&!/[\/\\\u0000-\u001f]/.test(d.filename)&&d.kind==='deployment'&&['application/json','application/x-ndjson'].includes(d.mediaType)&&d.expectedSha256===v.identity.sha256&&typeof d.contentBase64==='string'&&text(d.observedAt,100)&&text(d.sourceUrl,4000),'Retain the complete original filename, metadata and encoded source.');
 need(d.contentBase64.length<=4*Math.ceil(MAX_SOURCE/3),'The encoded original command exceeds its complete source bound.');
 const binary=atob(d.contentBase64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 need(bytes.length===v.identity.bytes&&hashBytes(bytes)===v.identity.sha256,'The retained original command bytes differ.');
 if(v.state==='COMMITTED')need(object(v.result)&&text(v.result.recordId,200)&&v.result.recordId,'Keep the actual committed source receipt.');
 if(v.state==='REJECTED')need(object(v.error)&&text(v.error.code,200)&&text(v.error.message,16000),'Keep the explicit no-effect original rejection.');
 return v;
}
export function emptyState(){return {schema:SCHEMA,revision:0,sources:[],copies:[],selected:null,intakes:[]};}
export function validateState(v){
 need(object(v)&&v.schema===SCHEMA&&Number.isSafeInteger(v.revision)&&v.revision>=0&&Array.isArray(v.sources)&&v.sources.length<=50&&Array.isArray(v.copies)&&v.copies.length<=100&&Array.isArray(v.intakes)&&v.intakes.length<=100,'Use the complete bounded material review archive.');
 const sources=new Set();for(const s of v.sources){originalSource(s.metadata,s.raw,s.inspection);const key=s.metadata.id+':'+s.metadata.sha256;need(!sources.has(key),'Duplicate complete source identity.');sources.add(key);}
 const ids=new Set();for(const c of v.copies){validateCopy(c,v.sources);need(!ids.has(c.id),'Duplicate working copy.');ids.add(c.id);}
 need(v.selected===null||ids.has(v.selected),'Keep the selected complete review.');
 const requests=new Set();for(const i of v.intakes){validateIntake(i);need(!requests.has(i.body.requestId),'Duplicate source command.');requests.add(i.body.requestId);}
 validateSupplierState(v);return v;
}
export function archive(v){validateState(v);const raw=JSON.stringify(v,null,2)+'\n';need(utf8(raw).length<=MAX_ARCHIVE,'Keep the full archive within512 MiB; retain this complete copy and start another original case review when needed.');return raw;}
export function readArchive(raw){need(typeof raw==='string'&&utf8(raw).length<=MAX_ARCHIVE,'Select the bounded complete archive.');return validateState(JSON.parse(raw));}
export function mergeState(current,incoming,{fork=false,newId=()=>crypto.randomUUID()}={}){
 validateState(current);validateState(incoming);const n=clone(current);
 for(const s of incoming.sources){const p=n.sources.find(x=>x.metadata.id===s.metadata.id&&x.metadata.sha256===s.metadata.sha256);if(p)need(same(p,s),'The same source identity has conflicting original bytes or inspection.');else n.sources.push(clone(s));}
 for(const item of incoming.intakes){const p=n.intakes.find(x=>x.body.requestId===item.body.requestId);
  if(!p)n.intakes.push(clone(item));else{
   need(same(p.body,item.body)&&same(p.scope,item.scope),'One original request has conflicting complete input.');
   if(p.state==='PREPARED'&&item.state!=='PREPARED')n.intakes[n.intakes.indexOf(p)]=clone(item);
   else if(p.state!==item.state&&item.state!=='PREPARED')need(false,'Preserve the conflicting actual receipts.');
   else if(p.state===item.state&&p.state!=='PREPARED')need(same(p,item),'The exact accepted/rejected receipt differs.');
  }
 }
 for(const c of incoming.copies){const p=n.copies.find(x=>x.id===c.id);if(!p)n.copies.push(clone(c));else if(!same(p,c)){
  need(fork,'A same-ID review differs. Receive it as an explicit separate alternative.');
  const next=clone(c);next.id=newId();next.name=(next.name.slice(0,280)+' · alternative');n.copies.push(next);
 }}
 const joined=mergeSupplierState(n,incoming,{fork,newId});archive(joined);return joined;
}
export async function openStore(key){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf47-material-catalogue-source',1);r.onupgradeneeded=()=>r.result.createObjectStore('work');r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close the older material desk before opening its journal.'));});
 const read=()=>new Promise((resolve,reject)=>{const tx=db.transaction('work','readonly'),r=tx.objectStore('work').get(key);r.onsuccess=()=>{try{resolve(validateState(r.result??emptyState()));}catch(e){reject(e);}};r.onerror=()=>reject(r.error);});
 const write=(expected,value)=>new Promise((resolve,reject)=>{
  const snapshot=clone(value);archive(snapshot);
  const tx=db.transaction('work','readwrite'),s=tx.objectStore('work'),r=s.get(key);let result,problem;
  r.onsuccess=()=>{try{const prior=r.result??emptyState();need(prior.revision===expected,'Another tab saved this complete source review. Download current work or preserve it as a separate alternative.');result={...snapshot,revision:expected+1};s.put(result,key);}catch(e){problem=e;problem.code='MATERIAL_COPY_CONFLICT';tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem||tx.error||Error('Complete material review save interrupted.'));tx.onerror=()=>{};
 });
 return {read,write,close:()=>db.close()};
}
