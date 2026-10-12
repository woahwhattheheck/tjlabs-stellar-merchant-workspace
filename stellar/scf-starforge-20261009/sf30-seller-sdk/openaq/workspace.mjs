// SPDX-License-Identifier: MIT
// Complete project workflow over retained OpenAQ reads and the maintained source/dataset/customer engines.
import { readdir, lstat, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { privateDirectory, readPrivate, readJson, hashPrivate, createFile, atomicJson, acquireWorkspace, bytes, digest, identity, object, fault, stamp, absolute } from '../postgres/publisher/files.mjs';
import { configuration, plan, metadataContext, review as validateReview, reportPlan, need, uuid, whole, text, SCHEMA, UUID, SEMANTICS } from './contract.mjs';
import { createOpenAQSource } from './source.mjs';
import { decodeRows } from './projection.mjs';
import { buildReport, reportFiles } from './reports.mjs';
import { openOpenAQPublication } from './publisher.mjs';
import { createOpenAQMerchant } from './merchant.mjs';
import { exportOpenAQProject, receiveOpenAQProject } from './package.mjs';
const MAX_RECORD=16*1024*1024;
async function exists(p){try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function immutable(path,b){await privateDirectory(dirname(path),true);try{await createFile(path,b);}catch(e){if(e.code!=='EEXIST')throw e;need((await readPrivate(path,Math.max(b.length,1))).equals(b),'OPENAQ_RECORD_CHANGED',undefined,409);}}
const safeError=e=>({code:typeof e?.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)?e.code:'OPENAQ_OPERATION_FAILED',
 message:typeof e?.code==='string'?String(e.message).slice(0,4000):'Inspect the retained original request and source result.',
 ...(Number.isFinite(e?.status)?{status:e.status}:{}),...(Number.isFinite(e?.retryAfter)?{retryAfter:e.retryAfter}:{})});
const publicOperation=v=>({id:v.id,action:v.action,state:v.state,createdAt:v.createdAt,updatedAt:v.updatedAt,attempt:v.attempt,
 progress:v.progress??null,result:v.result??null,error:v.error??null,previousAttempts:v.previousAttempts??[]});
const ACTIONS=new Set(['study.save','capture','review','report','publication.prepare','publication.review','publication.publish','publication.recover',
 'release.prepare','release.stage','customer.start','customer.resume','export','receive']);
export const OPENAQ_ACTIONS=Object.freeze([...ACTIONS]);
export async function openOpenAQWorkspace({directory,create=false,config,environment=process.env,fetchImpl=globalThis.fetch}={}){
 absolute(directory);
 if(create)need(!await exists(join(directory,'workspace.json')),'OPENAQ_WORKSPACE_EXISTS','Open this project without --create.',409);
 await privateDirectory(directory,create);
 const unlock=await acquireWorkspace(directory);let settings,source,merchant,closed=false,closing=null,admission=Promise.resolve(),active=null;
 const pending=new Set(),publications=new Map(),publicationOpening=new Map();
 try{
  if(create){
   const selected=configuration(config);settings={schema:SCHEMA,id:randomUUID(),createdAt:stamp(),configuration:selected,configurationSha256:identity(selected)};
   for(const name of ['captures','reviews','reports','operations','studies','publications','exports','imports'])await privateDirectory(join(directory,name),true);
   await immutable(join(directory,'workspace.json'),bytes(settings));
  }else settings=await readJson(join(directory,'workspace.json'),262144);
  need(settings.schema===SCHEMA&&UUID.test(settings.id??'')&&identity(configuration(settings.configuration))===settings.configurationSha256,'OPENAQ_WORKSPACE_CHANGED');
  if(config!==undefined)need(identity(configuration(config))===settings.configurationSha256,'OPENAQ_CONFIGURATION_CHANGED','Reopen with the original project declaration.',409);
  for(const name of ['captures','reviews','reports','operations','studies','publications','exports','imports'])await privateDirectory(join(directory,name));
  source=createOpenAQSource({configuration:settings.configuration,environment,fetchImpl});
  merchant=createOpenAQMerchant({directory,workspaceId:settings.id,configurationSha256:settings.configurationSha256,readOperation:internalOperation,environment});
  const check=()=>need(!closed,'OPENAQ_WORKSPACE_CLOSING','The original project owner is closing.',409);
  const cp=id=>join(directory,'captures',uuid(id)),op=id=>join(directory,'operations',uuid(id)+'.json');
  function tracked(fn){check();const p=Promise.resolve().then(fn);pending.add(p);p.finally(()=>pending.delete(p)).catch(()=>{});return p;}
  function serial(fn){const p=admission.then(()=>{check();return fn();});admission=p.catch(()=>{});return p;}
  async function internalOperation(id){try{return await readJson(op(id),MAX_RECORD);}catch(e){if(e.code==='ENOENT')throw fault('OPENAQ_OPERATION_NOT_FOUND','No request is retained under this ID.',404);throw e;}}
  async function operation(id){return publicOperation(await internalOperation(id));}
  async function capture(id){
   const c=await readJson(join(cp(id),'capture.json'),MAX_RECORD);const{captureSha256,...body}=c;
   need(c.id===id&&c.schema===SCHEMA+'.capture'&&c.state==='COMPLETE'&&identity(body)===captureSha256,'OPENAQ_CAPTURE_CHANGED',undefined,409);
   const p=await hashPrivate(join(cp(id),'measurements.csv'),64*1024*1024);
   need(p.hash===c.projection.sha256&&p.bytes===c.projection.bytes,'OPENAQ_MEASUREMENTS_CHANGED',undefined,409);return c;
  }
  async function captureRows(id){const c=await capture(id);return{capture:c,rows:decodeRows(await readPrivate(join(cp(id),'measurements.csv'),64*1024*1024))};}
  async function review(id){const r=await readJson(join(directory,'reviews',uuid(id)+'.json'),MAX_RECORD);need(r.schema===SCHEMA+'.review'&&r.id===id,'OPENAQ_REVIEW_CHANGED');return r;}
  async function report(id){const r=await readJson(join(directory,'reports',uuid(id),'report.json'),MAX_RECORD);const{reportSha256,...body}=r;need(r.id===id&&r.schema==='stellar-forge.openaq-report.v1'&&identity(body)===reportSha256,'OPENAQ_REPORT_CHANGED',undefined,409);return r;}
  async function list(folder,{offset=0,limit=30}={},read){
   whole(offset,'offset',0,1000000);whole(limit,'page size',1,100);
   const names=(await readdir(join(directory,folder))).filter(x=>UUID.test(x.replace(/\.json$/,''))).sort();
   const rows=[];for(const name of names.slice(offset,offset+limit))try{rows.push(await read(name.replace(/\.json$/,'')));}catch(e){if(e.code!=='ENOENT')throw e;}
   return {items:rows,offset,total:names.length,nextOffset:offset+limit<names.length?offset+limit:null};
  }
  async function status(options={}){
   const captures=await list('captures',options,async id=>{
    if(await exists(join(cp(id),'capture.json'))){const c=await readJson(join(cp(id),'capture.json'),MAX_RECORD);return{id:c.id,label:c.plan.label,mode:c.plan.mode,locationId:c.plan.locationId,state:c.state,rows:c.projection.rows,captureSha256:c.captureSha256,createdAt:c.createdAt,completedAt:c.completedAt};}
    const r=await readJson(join(cp(id),'request.json'));return{id:r.id,label:r.plan.label,mode:r.plan.mode,locationId:r.plan.locationId,state:(await internalOperation(id)).state,rows:null,createdAt:r.createdAt};
   });
   return {schema:SCHEMA,id:settings.id,project:settings.configuration.project,configurationSha256:settings.configurationSha256,
    account:settings.configuration.api?{account:settings.configuration.api.account,keyEnvironment:settings.configuration.api.apiKeyEnv,
     localPolicy:{requestsPerSecond:settings.configuration.api.requestsPerSecond,callsPerDay:settings.configuration.api.callsPerDay,window:'rolling24hours',basis:'Conservative local original quota-controller ceiling; not a claim about remaining OpenAQ account credits.'}}:null,
    customer:settings.configuration.customer??null,semantics:SEMANTICS,active:active?publicOperation(active.record):null,captures,
    studies:await list('studies',options,study),reviews:await list('reviews',options,review),reports:await list('reports',options,async id=>{const r=await report(id);return{id:r.id,title:r.title,createdAt:r.createdAt,reportSha256:r.reportSha256,sources:r.sources.length};}),
    operations:await list('operations',options,async id=>{const v=await internalOperation(id);return {id:v.id,action:v.action,state:v.state,createdAt:v.createdAt,updatedAt:v.updatedAt,attempt:v.attempt,progress:v.progress??null,error:v.error??null,resultAvailable:v.result!==undefined};})};
  }
  async function study(id){const current=await readJson(join(directory,'studies',uuid(id),'current.json'));need(current.id===id,'OPENAQ_STUDY_CHANGED');return current;}
  async function saveStudy(input,record){
   uuid(input.id);need(typeof input.expectedRevision==='string'||input.expectedRevision===null,'OPENAQ_EXPECTED_REVISION_REQUIRED');
   const value={id:input.id,name:text(input.name,'monitoring study name',160),purpose:text(input.purpose,'monitoring purpose',4000),plan:plan(input.plan)};
   const dir=join(directory,'studies',input.id);await privateDirectory(dir,true);
   let before=null;try{before=await study(input.id);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(before?.operationId===record.id)return before;
   need((before?.revision??null)===input.expectedRevision,'OPENAQ_STUDY_REVIEW_CHANGED','Refresh the saved study before changing its future capture plan.',409);
   const edition={...value,version:(before?.version??0)+1,previous:before?.revision??null,operationId:record.id,updatedAt:record.createdAt};
   edition.revision=identity(edition);await immutable(join(dir,String(edition.version).padStart(6,'0')+'.json'),bytes(edition));await atomicJson(dir,'current.json',edition);return edition;
  }
  async function publisherFor(captureId,reviewId,create=false){
   const c=await capture(captureId),r=await review(reviewId);
   need(r.captureId===c.id&&r.captureSha256===c.captureSha256,'OPENAQ_REVIEW_FROM_ANOTHER_CAPTURE',undefined,409);
   const key=c.id+'/'+r.id;
   if(publications.has(key))return publications.get(key);
   let opening=publicationOpening.get(key);
   if(!opening){
    opening=(async()=>{
     const pub=await openOpenAQPublication({directory:join(directory,'publications',c.id,r.id),captureDirectory:cp(c.id),capture:c,review:r,
      customer:settings.configuration.customer,environment,create});
     publications.set(key,pub);return pub;
    })();
    publicationOpening.set(key,opening);
    opening.finally(()=>{if(publicationOpening.get(key)===opening)publicationOpening.delete(key);}).catch(()=>{});
   }
   return opening;
  }
  async function logical(name,maximum=MAX_RECORD){
   need(typeof name==='string'&&!name.startsWith('/')&&!/[\\\0]/.test(name)&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'),'OPENAQ_FILE_PATH_INVALID');
   return readPrivate(join(directory,name),maximum);
  }
  async function perform(record,signal){
   const input=record.input;
   if(record.action==='study.save')return saveStudy(input,record);
   if(record.action==='capture'){
    const path=cp(record.id),selected=plan(input.plan);
    if(await exists(join(path,'capture.json')))return capture(record.id);
    const context=selected.mode==='archive'?metadataContext(input.context,selected):null;
    const request={schema:SCHEMA+'.capture',id:record.id,sourceWorkspaceId:settings.id,createdAt:record.createdAt,plan:selected,context,
     ...(input.study?{study:structuredClone(input.study)}:{})};
    if(input.study){const retained=await study(uuid(input.study.id));need(retained.revision===input.study.revision&&identity(retained.plan)===identity(selected),'OPENAQ_STUDY_EDITION_CHANGED','Review the selected saved study edition before capturing.',409);}
    await privateDirectory(path,true);await immutable(join(path,'request.json'),bytes(request));
    return source.capture(request,path,{signal,onProgress:p=>{record.progress=p;}});
   }
   if(record.action==='review'){
    const c=await capture(uuid(input.captureId)),value=validateReview(input,c);
    const result={schema:SCHEMA+'.review',id:record.id,createdAt:record.createdAt,...value};
    await immutable(join(directory,'reviews',record.id+'.json'),bytes(result));return result;
   }
   if(record.action==='report'){
    need(Array.isArray(input.captureIds)&&input.captureIds.length<=40,'OPENAQ_REPORT_SELECTION_REQUIRED');
    const captures=[],reviews=[],rows=[];
    for(let i=0;i<input.captureIds.length;i++){const selected=await captureRows(input.captureIds[i]),r=await review(input.reviewIds[i]);need(r.captureId===selected.capture.id&&r.captureSha256===selected.capture.captureSha256&&r.decision!=='revise','OPENAQ_REPORT_REVIEW_REQUIRED',undefined,409);captures.push(selected.capture);reviews.push(r);rows.push(...selected.rows);need(rows.length<=500000,'OPENAQ_REPORT_ROW_LIMIT');}
    const selected=reportPlan(input,captures),result=buildReport({id:record.id,createdAt:record.createdAt,plan:selected,captures,reviews,rows});
    for(const[name,data]of Object.entries(reportFiles(result)))await immutable(join(directory,'reports',record.id,name),data);return result;
   }
   if(record.action.startsWith('publication.')){
    const pub=await publisherFor(uuid(input.captureId),uuid(input.sourceReviewId),record.action==='publication.prepare');
    if(record.action==='publication.prepare')return {publication:await pub.prepare(record.id),captureId:input.captureId,sourceReviewId:input.sourceReviewId};
    if(record.action==='publication.review')return pub.review(uuid(input.runId),{requestId:record.id,reviewer:text(input.reviewer,'publisher reviewer',128),note:text(input.note,'publisher review',2000),
     initialize:input.initialize===true,...(input.initialize===true?{}:{expectedSnapshot:input.expectedSnapshot,expectedRevision:input.expectedRevision})});
    if(record.action==='publication.publish')return pub.publish(uuid(input.runId),uuid(input.publicationReviewId));
    if(record.action==='publication.recover')return pub.recover(uuid(input.runId));
   }
   if(record.action==='release.prepare'){
    const pub=await publisherFor(uuid(input.captureId),uuid(input.sourceReviewId));
    const output=join(directory,'release-packages',record.id);
    return pub.prepareRelease(uuid(input.runId),output,input.payment,input.origin,input.path??'/data');
   }
   if(record.action==='release.stage'){
    const prepared=await internalOperation(uuid(input.preparationId));need(prepared.action==='release.prepare'&&prepared.state==='COMPLETE','OPENAQ_RELEASE_PREPARATION_REQUIRED');
    const original=prepared.input,pub=await publisherFor(original.captureId,original.sourceReviewId);
    const packageDirectory=prepared.result?.directory;
    need(packageDirectory===join(directory,'release-packages',prepared.id)||
     packageDirectory===join(directory,'publications',original.captureId,original.sourceReviewId,'releases',prepared.id),
    'OPENAQ_RELEASE_PREPARATION_CHANGED','Use the package retained by this original preparation.',409);
    // The original SF82 console owns deployment from this project's retained store.
    return pub.stageRelease({packageDirectory,releaseDirectory:join(directory,'release-store'),id:text(input.id,'release ID',100),label:text(input.label,'release label',200),runtime:input.runtime??{port:0}});
   }
   if(record.action==='customer.start'||record.action==='customer.resume'){
    const pub=await publisherFor(uuid(input.captureId),uuid(input.sourceReviewId)),local=await pub.customerWorkspace();
    const nativeId=record.action==='customer.resume'?uuid(input.operationId):record.id;
    let accepted;
    if(record.action==='customer.resume')accepted=await local.resume({workspaceId:local.workspaceId,requestId:nativeId});
    else{
     need(['prepare','continue','customer','package'].includes(input.kind)&&object(input.arguments??{}),'OPENAQ_CUSTOMER_ACTION_INVALID');
     accepted=await local.start(input.kind,{...structuredClone(input.arguments??{}),workspaceId:local.workspaceId,requestId:nativeId});
    }
    const result=await local.wait(nativeId);
    return {accepted,operation:result,workspaceId:local.workspaceId,customer:local.customer};
   }
   if(record.action==='export'){
    need(Array.isArray(input.captureIds)&&input.captureIds.length>0&&input.captureIds.length<=20&&Array.isArray(input.reviewIds)&&input.reviewIds.length===input.captureIds.length&&Array.isArray(input.reportIds)&&input.reportIds.length<=20,'OPENAQ_EXPORT_SELECTION_REQUIRED');
    const captures=[],reviews=[],reports=[];const seen=new Set();
    for(let i=0;i<input.captureIds.length;i++){const c=await capture(uuid(input.captureIds[i])),r=await review(uuid(input.reviewIds[i]));
     need(!seen.has(c.id)&&r.captureId===c.id&&r.captureSha256===c.captureSha256&&r.decision==='accepted'&&r.allowDerivedDelivery===true,'OPENAQ_EXPORT_REVIEW_REQUIRED');seen.add(c.id);captures.push(c);reviews.push(r);}
    for(const id of input.reportIds){const r=await report(uuid(id));need(r.sources.every(s=>seen.has(s.id)&&captures.find(c=>c.id===s.id).captureSha256===s.captureSha256),'OPENAQ_REPORT_SOURCE_NOT_SELECTED');reports.push(r);}
    return exportOpenAQProject({directory:join(directory,'exports',record.id),workspaceId:settings.id,project:settings.configuration.project,
     selection:{requestId:record.id,...input},captures,reviews,reports,readLogical:logical,environment,signal});
   }
   if(record.action==='receive'){
    // archivePath is selected by a local CLI/host; HTTP accepts a privately staged upload instead.
    const archivePath=absolute(input.archivePath),root=join(directory,'imports',record.id);
    const received=await receiveOpenAQProject({archive:archivePath,sha256:input.sha256,directory:root,environment,signal});
    for(const item of received.manifest.files){
     need(/^(?:captures\/[a-f0-9-]{36}\/|reviews\/[a-f0-9-]{36}\.json$|reports\/[a-f0-9-]{36}\/)/.test(item.path),'OPENAQ_IMPORT_MEMBER_INVALID');
     const data=await readPrivate(join(received.selectedDirectory,item.path),Math.max(1,item.bytes));need(digest(data)===item.sha256&&data.length===item.bytes,'OPENAQ_IMPORT_MEMBER_CHANGED');
     await immutable(join(directory,item.path),data);
    }
    await immutable(join(root,'project-import.json'),bytes({workspaceId:settings.id,sourceWorkspaceId:received.manifest.sourceWorkspaceId,bundleSha256:input.sha256,captures:received.manifest.captures}));
    return {workspaceId:settings.id,sourceWorkspaceId:received.manifest.sourceWorkspaceId,bundleSha256:input.sha256,captures:received.manifest.captures,reports:received.manifest.reports,receivedFiles:received.receivedFiles};
   }
   throw fault('OPENAQ_ACTION_NOT_FOUND');
  }
  async function launch(record){
   check();need(!active,'OPENAQ_WORKSPACE_BUSY','The original project operation is still active.',409);
   const controller=new AbortController(),item={record,controller,promise:null};active=item;
   record.state='RUNNING';record.updatedAt=stamp();record.attempt=(record.attempt??0)+1;delete record.error;
   try{await atomicJson(join(directory,'operations'),record.id+'.json',record);}
   catch(e){if(active===item)active=null;throw e;}
   item.promise=(async()=>{
    try{record.result=await perform(record,controller.signal);record.state='COMPLETE';}
    catch(e){record.error=safeError(e);record.state=controller.signal.aborted||/PAUSED|COOLDOWN|PROVIDER|UNAVAILABLE|BUSY|UNKNOWN|TIMEOUT|OWNER/.test(record.error.code)?'INTERRUPTED':'FAILED';}
    finally{record.updatedAt=stamp();try{await atomicJson(join(directory,'operations'),record.id+'.json',record);}finally{if(active===item)active=null;}}
   })();item.promise.catch(()=>{});return publicOperation(record);
  }
  async function start(action,input){
   need(ACTIONS.has(action)&&object(input)&&input.workspaceId===settings.id,'OPENAQ_ACTION_OR_WORKSPACE_INVALID',undefined,409);
   const id=uuid(input.requestId),payload=structuredClone(input);delete payload.workspaceId;delete payload.requestId;
   if(await exists(op(id))){const old=await internalOperation(id);need(old.action===action&&identity(old.input)===identity(payload),'OPENAQ_REQUEST_CHANGED','Keep the original request unchanged; use a new ID for changed reviewed input.',409);return publicOperation(old);}
   need(!active,'OPENAQ_WORKSPACE_BUSY',undefined,409);
   const record={schema:SCHEMA+'.operation',id,workspaceId:settings.id,action,input:payload,state:'PREPARED',createdAt:stamp(),updatedAt:stamp(),attempt:0,previousAttempts:[]};
   await immutable(op(id),bytes(record));return launch(record);
  }
  async function resume(input){
   need(input.workspaceId===settings.id,'OPENAQ_WORKSPACE_CHANGED',undefined,409);
   const old=await internalOperation(uuid(input.requestId));if(old.state==='COMPLETE')return publicOperation(old);
   need(['PREPARED','FAILED','INTERRUPTED'].includes(old.state),'OPENAQ_OPERATION_RUNNING',undefined,409);
   old.previousAttempts.push({attempt:old.attempt,state:old.state,updatedAt:old.updatedAt,error:old.error??null});return launch(old);
  }
  for(const name of await readdir(join(directory,'operations'))){
   if(!UUID.test(name.replace(/\.json$/,'')))continue;const record=await readJson(join(directory,'operations',name),MAX_RECORD);
   if(record.state==='RUNNING'){record.state='INTERRUPTED';record.updatedAt=stamp();record.error={code:'OPENAQ_OWNER_ENDED',message:'Inspect this original operation and explicitly resume its unchanged request.'};await atomicJson(join(directory,'operations'),name,record);}
  }
  async function cancel(input){need(input.workspaceId===settings.id&&active?.record.id===uuid(input.requestId),'OPENAQ_ACTIVE_REQUEST_REQUIRED',undefined,409);need(['capture','export'].includes(active.record.action),'OPENAQ_CANCEL_NOT_AVAILABLE','The original publication/customer engine owns this operation; inspect its retained result.',409);active.controller.abort();return{requestId:input.requestId,pauseRequested:true};}
  async function file(kind,id,name){
   let path,expected;
   if(kind==='capture'){
    const c=await capture(id);
    if(name==='measurements.csv'){path=join(cp(id),name);expected=c.projection;}
    else if(name==='capture.json'){path=join(cp(id),name);}
    else {const r=c.receipts.find(x=>x.file===name);need(r,'OPENAQ_FILE_NOT_FOUND',undefined,404);path=join(cp(id),r.file);expected={sha256:r.sha256,bytes:r.bytes};}
   }else if(kind==='report'){await report(id);need(['report.json','report.html'].includes(name),'OPENAQ_FILE_NOT_FOUND',undefined,404);path=join(directory,'reports',id,name);}
   else if(kind==='export'){const selected=await internalOperation(id);need(selected.action==='export'&&selected.state==='COMPLETE'&&selected.result.file===name,'OPENAQ_EXPORT_NOT_COMPLETE',undefined,409);path=join(directory,'exports',id,name);expected=selected.result;}
   else throw fault('OPENAQ_FILE_NOT_FOUND',undefined,404);
   const actual=await hashPrivate(path,256*1024*1024);if(expected)need(expected.sha256===actual.hash&&expected.bytes===actual.bytes,'OPENAQ_FILE_CHANGED',undefined,409);
   return{name,path,sha256:actual.hash,bytes:actual.bytes};
  }
  async function read(action,input={}){
   if(action==='status')return status(input);
   if(action==='operation')return operation(uuid(input.id));
   if(action==='request')return internalOperation(uuid(input.id));
   if(action==='capture')return capture(uuid(input.id));
   if(action==='preview'){const{capture:c,rows}=await captureRows(uuid(input.id));const offset=whole(input.offset??0,'offset',0,1000000),limit=whole(input.limit??50,'page size',1,250);return{captureId:c.id,captureSha256:c.captureSha256,rows:rows.slice(offset,offset+limit),offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null};}
   if(action==='review')return review(uuid(input.id));
   if(action==='report')return report(uuid(input.id));
   if(action==='study')return study(uuid(input.id));
   if(action==='account')return source.account();
   if(action==='merchant.status')return merchant.status(input);
   if(action==='merchant.release')return merchant.inspect(input);
   if(action==='merchant.open')return merchant.open(input);
   if(action==='merchant.close')return merchant.stop(input);
   if(action==='publication'){const pub=await publisherFor(uuid(input.captureId),uuid(input.sourceReviewId));return{binding:pub.binding,directory:pub.directory,status:pub.status()};}
   if(action==='publication.inspect'){const pub=await publisherFor(uuid(input.captureId),uuid(input.sourceReviewId));return pub.inspect(uuid(input.runId),input.query??'limit=20');}
   if(action==='customer.status'||action==='customer.read'||action==='customer.operation'||action==='customer.browser'){
    const pub=await publisherFor(uuid(input.captureId),uuid(input.sourceReviewId));
    if(action==='customer.browser')return pub.customerBrowser();
    const local=await pub.customerWorkspace();
    if(action==='customer.status')return local.status(input.options??{});
    if(action==='customer.operation')return local.operation(uuid(input.id));
    return local.customerRead(uuid(input.deliveryId),input.operation,input.arguments??{});
   }
   throw fault('OPENAQ_READ_NOT_FOUND','This project read does not exist.',404);
  }
  const api={directory,id:settings.id,configuration:settings.configuration,configurationSha256:settings.configurationSha256,
   read:(...args)=>tracked(()=>read(...args)),file:(...args)=>tracked(()=>file(...args)),
   start:(...args)=>serial(()=>start(...args)),resume:(...args)=>serial(()=>resume(...args)),cancel:(...args)=>serial(()=>cancel(...args)),
   async wait(id){const current=active;if(current?.record.id===id)await current.promise;return operation(id);},
   close(){
    if(closing)return closing;closed=true;if(active&&['capture','export'].includes(active.record.action))active.controller.abort();
    closing=(async()=>{const errors=[];await admission;await active?.promise?.catch(e=>errors.push(e));await Promise.allSettled([...pending]);await Promise.allSettled([...publicationOpening.values()]);
     try{await merchant.close();}catch(e){errors.push(e);}
     try{await source.close();}catch(e){errors.push(e);}
     for(const[key,value]of publications)try{await value.close();publications.delete(key);}catch(e){errors.push(e);}
     if(errors.length){closing=null;throw new AggregateError(errors,'OpenAQ owned operations or original resources did not close.');}
     await unlock();
    })();return closing;
   }};
  return Object.freeze(api);
 }catch(e){await merchant?.close().catch(()=>{});await source?.close().catch(()=>{});await unlock();throw e;}
}
