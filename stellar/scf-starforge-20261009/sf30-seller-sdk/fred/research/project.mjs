// MIT. Catalogue actions share the original economic project journal and revision.
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { readFredProject, transactFredProject } from '../project.mjs';
import { need, catalogue, clone, digest, canonical, key, text, definition, instant, normalizeProduct,
  currentDefinition, latestSource, sourceStatus, productCoverage, validateResearchState,
  makeCapture, normalizeCapture, sourceSummary, importDefinitions, exportDefinitions, MAX_SOURCE_BYTES, MAX_TOTAL_BYTES } from './model.mjs';
import { acquirePublicResearchSource } from './source.mjs';
const JSON_LIMIT=Math.ceil(MAX_SOURCE_BYTES/3)*4+128000;
const sourcePath=(root,id)=>{need(/^[a-f0-9]{64}$/.test(id),'Select an original source identity.');return join(resolve(root),'research','sources',id+'.json');};
async function optional(path,limit){try{return await readPrivateJson(path,limit);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function retain(root,capture){capture=normalizeCapture(capture);const dir=await privateDirectory(join(resolve(root),'research','sources')),name=capture.id+'.json',previous=await optional(join(dir,name),JSON_LIMIT);
if(previous)need(canonical(normalizeCapture(previous))===canonical(capture),'The retained source changed.','RESEARCH_SOURCE_CHANGED',409);
else await atomicJson(dir,name,capture,{exclusive:true});return capture;}
export async function readResearchSource(directory,id){return normalizeCapture(await readPrivateJson(sourcePath(directory,id),JSON_LIMIT));}
function mutable(state){validateResearchState(state);return state.research??=clone(catalogue(state));}
function adopt(cat,capture){const s=sourceSummary(capture),existing=cat.sources.find(x=>x.id===s.id);if(existing){need(canonical(existing)===canonical(s),'Source summary changed.');return existing;}need(cat.sources.reduce((n,s)=>n+s.bytes,0)+s.bytes<=MAX_TOTAL_BYTES,'The complete source catalogue exceeds128MiB; use a new project for additional source collections.');cat.sources.push(s);return s;}
function saveDefinition(cat,d,at){let entry=cat.entries.find(x=>x.id===d.entryId);if(!entry){entry={id:d.entryId,currentId:null,versions:[]};cat.entries.push(entry);}const id=digest(d);if(!entry.versions.some(v=>v.id===id))entry.versions.push({id,definition:d,savedAt:at});entry.currentId=id;return {entryId:entry.id,definitionId:id};}
function checkedDefinition(state,entryId,definitionId){const v=currentDefinition(catalogue(state),entryId);need(v.id===definitionId,'The source definition changed; reopen it before collecting.','RESEARCH_DEFINITION_CHANGED',409);need(!v.definition.retired,'Reactivate this source record before acquiring another edition.');return v;}
export const RESEARCH_ACTIONS=['research-entry-save','research-import','research-source-upload','research-source-acquire','research-review','research-product-save','research-product-issue'];
export async function runResearchAction({directory,request,signal}){
need(RESEARCH_ACTIONS.includes(request?.action),'Select an original research action.');const id=key(request.id),expectedRevision=request.expectedRevision,action=request.action;let payload;
if(request.resume===true){const original=await readFredProject(directory);need(original.pending?.id===id&&original.pending.kind===action&&original.pending.expectedRevision===expectedRevision,'Continue the exact original pending research operation.','RESEARCH_OPERATION_CHANGED',409);payload=clone(original.pending.payload);}else {
if(action==='research-entry-save')payload={definition:definition(request.definition)};
if(action==='research-import')payload={definitions:importDefinitions(request.csv??request.definitions)};
if(action==='research-source-acquire')payload={entryId:key(request.entryId),definitionId:text(request.definitionId,64,true)};
if(action==='research-source-upload'){
const entryId=key(request.entryId),definitionId=text(request.definitionId,64,true);
const original={entryId,definitionId,filename:text(request.filename,180,true),contentType:text(request.contentType??'application/octet-stream',250,true),bodyBase64:text(request.bodyBase64,Math.ceil(MAX_SOURCE_BYTES/3)*4+4),retrievedAt:request.retrievedAt===undefined?null:instant(request.retrievedAt)};
const requestHash=digest(original),prior=(await readFredProject(directory)).operations.find(op=>op.id===id);
if(prior){need(prior.kind==='research-source-upload','This operation ID retains another action.','FRED_OPERATION_CONFLICT',409);payload={entryId,definitionId,requestHash,captureId:prior.result.source.id};}
else {const stage=await privateDirectory(join(resolve(directory),'research','uploads')),file=join(stage,id+'.json');
let record=await optional(file,JSON_LIMIT);if(record)need(record.requestHash===requestHash,'The original upload operation contains different source bytes.','RESEARCH_OPERATION_CHANGED',409);
else {const state=await readFredProject(directory),entry=checkedDefinition(state,entryId,definitionId).definition;
const bytes=Buffer.from(original.bodyBase64,'base64');need(bytes.toString('base64')===original.bodyBase64,'Upload the complete original source bytes.');
const capture=makeCapture({entry,definitionId,retrievedAt:original.retrievedAt??new Date().toISOString(),bytes,filename:original.filename,contentType:original.contentType});
record={requestHash,capture};await atomicJson(stage,id+'.json',record,{exclusive:true});}
payload={entryId,definitionId,requestHash,captureId:record.capture.id};}}
if(action==='research-review'){need(['ACCEPT','NEEDS_WORK','REJECT'].includes(request.decision),'Select a recorded review decision.');payload={snapshotId:text(request.snapshotId,64,true),decision:request.decision,reviewer:text(request.reviewer,200,true),note:text(request.note,12000,true)};}
if(action==='research-product-save')payload={definition:normalizeProduct(request.definition)};
if(action==='research-product-issue')payload={productId:key(request.productId),issuedBy:text(request.issuedBy,200,true),note:text(request.note??'',12000)};
}
// Reject editable operator choices before reserving the original operation; recheck inside its lock.
const current=await readFredProject(directory);
if(!current.operations.some(op=>op.id===id)&&!current.pending){
need(current.revision===expectedRevision,'The project changed; read its current revision.','FRED_REVISION_CONFLICT',409);
const cat=catalogue(current);
if(action==='research-source-acquire'||action==='research-source-upload')checkedDefinition(current,payload.entryId,payload.definitionId);
if(action==='research-review'){
const source=cat.sources.find(s=>s.id===payload.snapshotId);need(source,'Choose a retained original source.');
const selected=currentDefinition(cat,source.entryId);need(selected.id===source.definitionId&&latestSource(cat,source.entryId,selected.id)?.id===source.id,'Review the latest source for its current definition.','RESEARCH_REVIEW_CHANGED',409);
need(payload.decision!=='ACCEPT'||source.status>=200&&source.status<300,'An unavailable source response cannot be accepted.');}
if(action==='research-product-save')for(const requirement of payload.definition.requirements)for(const entryId of requirement.entryIds)currentDefinition(cat,entryId);
if(action==='research-product-issue'){
const product=cat.products.find(p=>p.id===payload.productId);need(product,'Select an original research product.');
const definition=product.versions.find(v=>v.id===product.currentId).definition;
need(!definition.retired,'Reactivate this research product before issuing another edition.');
need(productCoverage(cat,definition).every(r=>r.state==='COVERED'),'Resolve every selected source gap and review before issuing this research product.','RESEARCH_PRODUCT_GAPS',409);}
}
need(Buffer.byteLength(JSON.stringify(payload))<=2*1024*1024,'Split the selected catalogue import into explicit operations within2MiB.');
return transactFredProject(directory,{id,expectedRevision,kind:action,payload},async(state,root)=>{
const cat=mutable(state),at=state.pending.startedAt;let result;
if(action==='research-entry-save')result=saveDefinition(cat,payload.definition,at);
if(action==='research-import')result={entries:payload.definitions.map(d=>saveDefinition(cat,d,at))};
if(action==='research-source-upload'||action==='research-source-acquire'){
const selected=checkedDefinition(state,payload.entryId,payload.definitionId);let capture;
if(action==='research-source-upload'){const record=await readPrivateJson(join(root,'research','uploads',id+'.json'),JSON_LIMIT);need(record.requestHash===payload.requestHash&&record.capture.id===payload.captureId,'The complete original upload changed.');capture=normalizeCapture(record.capture);}
else {const acquired=await privateDirectory(join(root,'research','acquisitions')),saved=await optional(join(acquired,id+'.json'),JSON_LIMIT);
if(saved){need(saved.definitionId===payload.definitionId&&saved.entryId===payload.entryId,'The original acquisition belongs to another source.');capture=normalizeCapture(saved);}
else {const response=await acquirePublicResearchSource(selected.definition.url,{signal});capture=makeCapture({entry:selected.definition,definitionId:payload.definitionId,retrievedAt:at,...response,mode:'HTTP'});await atomicJson(acquired,id+'.json',capture,{exclusive:true});}}
need(capture.entryId===selected.definition.entryId&&capture.definitionId===selected.id&&capture.requestedUrl===selected.definition.url,'Source capture does not match the retained definition.');
await retain(root,capture);adopt(cat,capture);result={source:sourceSummary(capture),status:capture.status>=200&&capture.status<300?'REVIEW_NEEDED':'SOURCE_UNAVAILABLE'};}
if(action==='research-review'){const source=cat.sources.find(s=>s.id===payload.snapshotId);need(source,'Choose a retained original source.');const active=currentDefinition(cat,source.entryId);need(active.id===source.definitionId&&latestSource(cat,source.entryId,active.id)?.id===source.id,'Review the latest source for its current definition.','RESEARCH_REVIEW_CHANGED',409);need(payload.decision!=='ACCEPT'||source.status>=200&&source.status<300,'An unavailable source response cannot be accepted.');const review={entryId:source.entryId,definitionId:source.definitionId,snapshotId:source.id,decision:payload.decision,reviewer:payload.reviewer,note:payload.note,reviewedAt:at},record={...review,id:digest(review)};if(!cat.reviews.some(r=>r.id===record.id))cat.reviews.push(record);result={review:record};}
if(action==='research-product-save'){const d=payload.definition;for(const r of d.requirements)for(const entryId of r.entryIds)currentDefinition(cat,entryId);let product=cat.products.find(p=>p.id===d.productId);if(!product){product={id:d.productId,currentId:null,versions:[],editions:[]};cat.products.push(product);}const definitionId=digest(d);if(!product.versions.some(v=>v.id===definitionId))product.versions.push({id:definitionId,definition:d,savedAt:at});product.currentId=definitionId;result={productId:product.id,definitionId,coverage:productCoverage(cat,d,at)};}
if(action==='research-product-issue'){const product=cat.products.find(p=>p.id===payload.productId);need(product,'Select an original research product.');const d=product.versions.find(v=>v.id===product.currentId).definition;need(!d.retired,'Reactivate this research product before issuing another edition.');const coverage=productCoverage(cat,d,at);need(coverage.every(r=>r.state==='COVERED'),'Resolve every selected source gap and review before issuing this research product.','RESEARCH_PRODUCT_GAPS',409);
const edition={productId:product.id,definitionId:product.currentId,issuedAt:at,issuedBy:payload.issuedBy,note:payload.note,sources:coverage.flatMap(r=>r.selected.map(s=>({requirementId:r.id,entryId:s.entryId,definitionId:s.definitionId,snapshotId:s.sourceId,reviewId:s.reviewId})))},record={...edition,id:digest(edition)};if(!product.editions.some(e=>e.id===record.id))product.editions.push(record);result={edition:record};}
validateResearchState(state);return result;});}
export async function researchView(directory,{query='',topic='',geography='',status='',due=false,offset=0,limit=100,asOf=new Date().toISOString()}={}){
const state=await readFredProject(directory),cat=catalogue(state);validateResearchState(state);need(Number.isInteger(offset)&&offset>=0&&Number.isInteger(limit)&&limit>=1&&limit<=500,'Choose a valid catalogue page.');query=text(query,1000).toLowerCase();topic=text(topic,160);geography=text(geography,160);status=text(status,40);instant(asOf);
const rows=cat.entries.map(e=>sourceStatus(cat,e.id,asOf)).filter(r=>(!query||[r.entryId,r.title,r.publisher,r.url,...r.topics,...r.geographies,currentDefinition(cat,r.entryId).definition.notes].join(' ').toLowerCase().includes(query))&&(!topic||r.topics.includes(topic))&&(!geography||r.geographies.includes(geography))&&(!status||r.status===status)&&(!due||r.due)).sort((a,b)=>a.title.localeCompare(b.title)||a.entryId.localeCompare(b.entryId));
return {projectId:state.id,revision:state.revision,asOf,total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),topics:[...new Set(cat.entries.flatMap(e=>currentDefinition(cat,e.id).definition.topics))].sort(),geographies:[...new Set(cat.entries.flatMap(e=>currentDefinition(cat,e.id).definition.geographies))].sort(),products:cat.products.map(p=>{const current=p.versions.find(v=>v.id===p.currentId);return {id:p.id,currentId:p.currentId,definition:current.definition,coverage:productCoverage(cat,current.definition,asOf),editions:clone(p.editions)};}),counts:{entries:cat.entries.length,sources:cat.sources.length,reviews:cat.reviews.length,products:cat.products.length,bytes:cat.sources.reduce((n,s)=>n+s.bytes,0)}};}
export async function researchEntry(directory,entryId){const state=await readFredProject(directory),cat=catalogue(state);const entry=cat.entries.find(e=>e.id===entryId);need(entry,'Select an original catalogue entry.');return {projectId:state.id,revision:state.revision,entry:clone(entry),sources:clone(cat.sources.filter(s=>s.entryId===entryId)),reviews:clone(cat.reviews.filter(r=>r.entryId===entryId)),current:sourceStatus(cat,entryId)};}
export async function researchCsv(directory){const state=await readFredProject(directory);return exportDefinitions(catalogue(state));}
export async function researchSourceDownload(directory,id){const state=await readFredProject(directory);need(catalogue(state).sources.some(s=>s.id===id),'Choose a source in this original project.');const source=await readResearchSource(directory,id);return {bytes:Buffer.from(source.bodyBase64,'base64'),filename:source.filename,contentType:source.contentType};}
