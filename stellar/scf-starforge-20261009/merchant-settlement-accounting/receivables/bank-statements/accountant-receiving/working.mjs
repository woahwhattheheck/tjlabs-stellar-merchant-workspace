// SPDX-License-Identifier: MIT
// Complete private working copies. Financial records and original review semantics stay in core.mjs.
import {need,plain,copy,json,bytes,digest,parseJson,readTar,writeTar,inspectBankClose,validateReview,reviewTarget,MAX_BUNDLE_BYTES} from './core.mjs';
export const WORKING_SCHEMA='stellar-forge.bank-accountant-working.v1';
export const WORKING_BUNDLE_SCHEMA='stellar-forge.bank-accountant-working-bundle.v1';
export const SOURCE_SCHEMA='stellar-forge.bank-accountant-working-source.v1';
export const MAX_WORKING_BYTES=MAX_BUNDLE_BYTES;
export const MAX_DRAFTS=1000;
export const VIEW_KEYS=['selected','tab','transaction','customer','search','page','compare','history','pageImport','pageOffset'];
export const SOURCE_NAMES=['core.mjs','core.d.mts','storage.mjs','working.mjs','working.d.mts','portable.mjs','app.mjs','index.html','style.css','cli.mjs','browser-assets.json','ACCOUNTANT_RECEIVING.md','EXERCISE.mjs'];
const ID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,HEX=/^[a-f0-9]{64}$/;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const time=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const string=(x,max)=>typeof x==='string'&&x.length<=max;
export function defaultView(){return {selected:'',tab:'overview',transaction:'',customer:'',search:'',page:0,compare:'',history:'',pageImport:'',pageOffset:0};}
export async function validateSource(source){
 need(plain(source)&&source.schema===SOURCE_SCHEMA&&Array.isArray(source.files)&&source.files.length===SOURCE_NAMES.length,'WORKING_SOURCE','Keep the complete original accountant source edition.');
 const found=new Set();for(const f of source.files){need(plain(f)&&SOURCE_NAMES.includes(f.path)&&!found.has(f.path)&&typeof f.content==='string','WORKING_SOURCE','Source members must be complete, unique and originally named.');found.add(f.path);const raw=new TextEncoder().encode(f.content);need(raw.length===f.bytes&&HEX.test(f.sha256??'')&&await digest(raw)===f.sha256,'WORKING_SOURCE_CHANGED','The complete '+f.path+' source changed.');}
 need(json(source).length<=8_000_000,'WORKING_SOURCE_SIZE','Keep source editions within the supported complete source size.');return source;
}
export async function sourceEdition(files){const list=[];for(const path of SOURCE_NAMES){need(typeof files[path]==='string','WORKING_SOURCE','The complete '+path+' source is required.');const raw=new TextEncoder().encode(files[path]);list.push({path,content:files[path],bytes:raw.length,sha256:await digest(raw)});}return {schema:SOURCE_SCHEMA,files:list};}
export async function validateWorking(working,archives,sources){
 need(plain(working)&&working.schema===WORKING_SCHEMA&&ID.test(working.id??'')&&time(working.createdAt)&&time(working.updatedAt),'WORKING_SCHEMA','Choose a complete original working review.');
 await validateReview(working.review,archives);
 need(Array.isArray(working.drafts)&&working.drafts.length<=MAX_DRAFTS,'WORKING_DRAFTS','Keep the complete bounded set of unfinished note drafts.');
 const ids=new Set();for(const d of working.drafts){need(plain(d)&&ID.test(d.requestId??'')&&!ids.has(d.requestId)&&time(d.createdAt),'WORKING_DRAFT','Keep each original unfinished request identity and time.');ids.add(d.requestId);
  need(string(d.actor,160)&&string(d.note,12000)&&string(d.summary,12000)&&string(d.status,80),'WORKING_DRAFT','Keep every unfinished field within its original editor bounds.');
  const archive=archives.find(a=>a.archiveId===d.target?.archiveId);need(archive,'WORKING_TARGET','An unfinished note has no original close.');need(same(await reviewTarget(archive,d.target.kind,d.target.id),d.target),'WORKING_TARGET','An unfinished note no longer binds its original record.');
 }
 need(working.activeDraftId===null||ids.has(working.activeDraftId),'WORKING_DRAFT','The active draft must be retained in full.');
 const v=working.view;need(plain(v)&&[8,10].includes(Object.keys(v).length)&&VIEW_KEYS.slice(0,8).every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>VIEW_KEYS.includes(k))&&(Object.hasOwn(v,'pageImport')===Object.hasOwn(v,'pageOffset')),'WORKING_VIEW','Keep the complete original operator selection.');
 need(['overview','transactions','sources','customers','compare','review'].includes(v.tab)&&Number.isSafeInteger(v.page)&&v.page>=0&&v.page<=1000000,'WORKING_VIEW','The selected view is invalid.');
 for(const k of VIEW_KEYS.filter(k=>!['page','tab','pageImport','pageOffset'].includes(k)))need(string(v[k],k==='search'?12000:200),'WORKING_VIEW','Keep the complete '+k+' field.');
 for(const k of ['selected','compare'])need(v[k]===''||archives.some(a=>a.archiveId===v[k]),'WORKING_VIEW','The selected close must accompany this working file.');
 const current=archives.find(a=>a.archiveId===v.selected);need(string(v.pageImport??'',200)&&Number.isSafeInteger(v.pageOffset??0)&&(v.pageOffset??0)>=0&&(v.pageOffset??0)<=1000000&&(v.pageOffset??0)%50===0,'WORKING_VIEW','Keep the original page-entry selection.');need(!v.pageImport||current?.report.sourceClosing?.assembly?.pages?.some(p=>p.importId===v.pageImport),'WORKING_VIEW','The selected original CAMT page is missing.');need(!v.transaction||current?.report.transactions.some(t=>t.id===v.transaction),'WORKING_VIEW','The selected original transaction is missing.');need(!v.customer||current?.customers.some(c=>c.id===v.customer),'WORKING_VIEW','The selected customer is missing.');need(!v.history||working.review.editions.some(e=>e.id===v.history),'WORKING_VIEW','The selected original review edition is missing.');
 need(Array.isArray(working.sourceEditions)&&working.sourceEditions.length>0&&working.sourceEditions.length<=64&&new Set(working.sourceEditions).size===working.sourceEditions.length&&working.sourceEditions.includes(working.runningSourceSha256),'WORKING_SOURCE','Keep complete original and running source editions.');
 need(sources.length===working.sourceEditions.length,'WORKING_SOURCE','The complete source set differs from this working review.');
 const sourceIndex=new Map();for(const source of sources){await validateSource(source);const sha=await digest(json(source));need(!sourceIndex.has(sha),'WORKING_SOURCE','The source edition is repeated.');sourceIndex.set(sha,source);need(working.sourceEditions.includes(sha),'WORKING_SOURCE','A source edition differs from its recorded identity.');}
 need(Array.isArray(working.received)&&working.received.length<=1000,'WORKING_RECEIVING','Keep the original working-file history.');for(const r of working.received)need(plain(r)&&HEX.test(r.sha256??'')&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=MAX_WORKING_BYTES&&ID.test(r.workingId??'')&&ID.test(r.reviewId??'')&&time(r.receivedAt)&&string(r.filename,255),'WORKING_RECEIVING','An original file receiving entry is invalid.');
 const known=new Map();for(const r of working.received){need(!known.has(r.sha256)&&plain(r.snapshot)&&Array.isArray(r.receivedIds)&&r.receivedIds.every(id=>known.has(id)),'WORKING_RECEIVING','Retain ordered original receiving snapshots without cycles.');need(!Object.hasOwn(r.snapshot,'received'),'WORKING_RECEIVING','Original input histories are flat references, not nested copies.');need(r.snapshot.id===r.workingId&&r.snapshot.review?.id===r.reviewId,'WORKING_RECEIVING','The original receiving snapshot identifies a different working review.');const originalSources=r.snapshot.sourceEditions?.map(id=>sourceIndex.get(id));need(originalSources?.every(Boolean),'WORKING_RECEIVING','An original input source edition is missing.');await validateWorking({...copy(r.snapshot),received:[]},archives.filter(a=>r.snapshot.review?.archives?.some(x=>x.archiveId===a.archiveId)),originalSources);known.set(r.sha256,r);}
 for(const r of working.received){const original={...copy(r.snapshot),received:r.receivedIds.map(id=>copy(known.get(id)))},originalArchives=archives.filter(a=>original.review.archives.some(x=>x.archiveId===a.archiveId)),originalSources=original.sourceEditions.map(id=>sourceIndex.get(id)),raw=await packWorking(original,originalArchives,originalSources);need(raw.length===r.bytes&&await digest(raw)===r.sha256,'WORKING_RECEIVING_CHANGED','A retained original input differs from its complete recorded bytes. Keep the unchanged original working file.');}
 return working;
}
export async function makeWorking({id,createdAt,updatedAt,review,archives,drafts=[],activeDraftId=null,view=defaultView(),sources,runningSourceSha256,received=[]}){
 const unique=new Map();for(const source of sources){await validateSource(source);unique.set(await digest(json(source)),source);}const result={schema:WORKING_SCHEMA,id,createdAt,updatedAt,review:copy(review),drafts:copy(drafts),activeDraftId,view:copy(view),sourceEditions:[...unique.keys()],runningSourceSha256,received:copy(received)};
 await validateWorking(result,archives,[...unique.values()]);return result;
}
export async function exportWorking(working,archives,sources){await validateWorking(working,archives,sources);return packWorking(working,archives,sources);}
async function packWorking(working,archives,sources){
 const files=new Map([['working.json',json(working)]]);
 for(const a of archives)files.set('close-'+a.archiveId+'.tar',a.raw);
 for(const s of sources)files.set('source-'+await digest(json(s))+'.json',json(s));
 const manifest={schema:WORKING_BUNDLE_SCHEMA,workingId:working.id,reviewId:working.review.id,revision:working.review.revision,files:{}};
 for(const [name,raw] of files)manifest.files[name]={name,bytes:raw.length,sha256:await digest(raw)};
 files.set('manifest.json',json(manifest));return writeTar(files,{maximum:MAX_WORKING_BYTES});
}
export async function receiveWorking(input){
 const raw=bytes(input),files=readTar(raw,{maximum:MAX_WORKING_BYTES}),manifest=parseJson(files.get('manifest.json')??new Uint8Array(),'working manifest');
 need(manifest.schema===WORKING_BUNDLE_SCHEMA&&plain(manifest.files)&&files.size===Object.keys(manifest.files).length+1&&!Object.hasOwn(manifest.files,'manifest.json'),'WORKING_MANIFEST','Choose the complete original working TAR.');
 for(const [name,pin] of Object.entries(manifest.files)){const body=files.get(name);need(plain(pin)&&pin.name===name&&body&&body.length===pin.bytes&&HEX.test(pin.sha256??'')&&await digest(body)===pin.sha256,'WORKING_FILE_CHANGED','Original working member '+name+' is incomplete or changed.');}
 const working=parseJson(files.get('working.json')??new Uint8Array(),'working review');need(working.id===manifest.workingId&&working.review?.id===manifest.reviewId&&working.review?.revision===manifest.revision,'WORKING_IDENTITY','The manifest identifies another original working review.');
 const archives=[],sources=[];for(const a of working.review?.archives??[])archives.push(await inspectBankClose(files.get('close-'+a.archiveId+'.tar')??new Uint8Array(),{filename:a.filename}));
 for(const sha of working.sourceEditions??[]){need(HEX.test(sha),'WORKING_SOURCE','Keep exact original source identities.');sources.push(parseJson(files.get('source-'+sha+'.json')??new Uint8Array(),'source edition'));}
 need(files.size===2+archives.length+sources.length,'WORKING_MEMBERS','The working TAR contains additional or missing members.');await validateWorking(working,archives,sources);const canonical=await exportWorking(working,archives,sources);need(canonical.length===raw.length&&await digest(canonical)===await digest(raw),'WORKING_CANONICAL','Choose the unchanged complete working file produced by this reader. Preserve any differently packaged original separately.');return {working,archives,sources,sha256:await digest(raw),bytes:raw.length};
}
export function mergeDrafts(drafts,active){
 const result=new Map();for(const d of drafts){need(!result.has(d.requestId)||same(result.get(d.requestId),d),'WORKING_DRAFT_CONFLICT','Two retained drafts use the same original request with different fields. Keep both copies before receiving.');result.set(d.requestId,copy(d));}
 if(active)result.set(active.requestId,copy(active));return [...result.values()];
}
export function workingSummary(value){const w=value.working;return {workingId:w.id,reviewId:w.review.id,name:w.review.name,revision:w.review.revision,closes:w.review.archives.length,drafts:w.drafts.length,activeDraftId:w.activeDraftId,view:copy(w.view),sourceEditions:copy(w.sourceEditions),sha256:value.sha256,bytes:value.bytes};}

export function workingArchiveSize(working,archives,sources){
 const members=[{name:'working.json',bytes:json(working).length}];
 for(const a of archives)members.push({name:'close-'+a.archiveId+'.tar',bytes:a.bytes});
 for(let i=0;i<sources.length;i++)members.push({name:'source-'+working.sourceEditions[i]+'.json',bytes:json(sources[i]).length});
 const manifest={schema:WORKING_BUNDLE_SCHEMA,workingId:working.id,reviewId:working.review.id,revision:working.review.revision,files:{}};
 let size=1024;for(const f of members){manifest.files[f.name]={...f,sha256:'0'.repeat(64)};size+=512+Math.ceil(f.bytes/512)*512;}size+=512+Math.ceil(json(manifest).length/512)*512;
 need(size<=MAX_WORKING_BYTES,'WORKING_CAPACITY','The complete working file exceeds 384 MB. Keep the visible draft with Download draft fields, then split additional original closes into another private review.');return size;
}

export async function retainIncoming(value,{filename,receivedAt}){
 const rows=copy(value.working.received),snapshot=copy(value.working);delete snapshot.received;
 if(!rows.some(x=>x.sha256===value.sha256))rows.push({sha256:value.sha256,bytes:value.bytes,filename,receivedAt,workingId:value.working.id,reviewId:value.working.review.id,snapshot,receivedIds:value.working.received.map(x=>x.sha256)});
 return rows;
}
export async function exportIncoming(working,archives,sources,sha256){
 const sourceIndex=new Map();for(const source of sources)sourceIndex.set(await digest(json(source)),source);const map=new Map(working.received.map(x=>[x.sha256,x])),entry=map.get(sha256);need(entry,'WORKING_RECEIVING','Choose an original received file.');
 const original={...copy(entry.snapshot),received:entry.receivedIds.map(id=>copy(map.get(id)))},selected=[];
 for(const id of original.sourceEditions){const source=sourceIndex.get(id);need(source,'WORKING_SOURCE','The original input source edition is missing.');selected.push(source);}
 const raw=await exportWorking(original,archives.filter(a=>original.review.archives.some(x=>x.archiveId===a.archiveId)),selected);
 need(raw.length===entry.bytes&&await digest(raw)===entry.sha256,'WORKING_RECEIVING_CHANGED','The original input reconstruction differs; keep the full working file.');return {raw,filename:entry.filename};
}
