// MIT. Durable merchant operations under the original single-writer workspace lease.
import {join} from 'node:path';
import {acquireStateLease} from '../../../merchant-fleet-gateway/state-lease.mjs';
import {writeBytes,jsonBytes as stateBytes} from '../../../sf88-operator-buyer-cli/node/store.mjs';
import {need,STATE_SCHEMA,UUID,HASH,REF,MAX_STATE,ownedDirectory,ownedBytes,encoded,parse,canonical,digest,
 now,newId,safeError,readSelectedSource,offerDraft,writeExact} from './configuration.mjs';
import {native,originalApplication,originalExecution,startServices} from './native.mjs';
import {readExport,exportView,existingJson} from './exports.mjs';
import {validateAction,executeMerchantOperation,offerView,offerContext,ensureOfferRuntime,KINDS} from './operations.mjs';

const STATES=new Set(['QUEUED','RUNNING','COMPLETED','ATTENTION','CANCELLED']);
const summary=operation=>({id:operation.id,kind:operation.kind,status:operation.status,requestSha256:operation.requestSha256,
 createdAt:operation.createdAt,updatedAt:operation.updatedAt,result:operation.result,error:operation.error});
function validateState(value,configuration,expectedId){
 need(value&&value.schema===STATE_SCHEMA&&UUID.test(value.id)&&(!expectedId||value.id===expectedId)&&
  value.configurationSha256===configuration.sha256&&Number.isSafeInteger(value.revision)&&value.revision>=1&&
  value.source&&HASH.test(value.source.sha256)&&value.source.view,
  'API_MERCHANT_WORKSPACE_CHANGED',409);
 for(const key of ['offers','orders','operations','exports','backups'])need(Array.isArray(value[key]),'API_MERCHANT_WORKSPACE_CHANGED',409);
 const offers=new Set(),orders=new Set(),operations=new Set(),exports=new Set(),backups=new Set();
 for(const offer of value.offers){
  need(UUID.test(offer.id)&&!offers.has(offer.id)&&['PREPARED','READY','ATTENTION'].includes(offer.status)&&
   HASH.test(offer.sourceSha256)&&HASH.test(offer.planSha256)&&Number.isSafeInteger(offer.planBytes)&&offer.planBytes>0,
   'API_MERCHANT_WORKSPACE_CHANGED',409);offers.add(offer.id);
 }
 for(const order of value.orders){
  need(REF.test(order.orderReference)&&!orders.has(order.orderReference)&&offers.has(order.offerId)&&UUID.test(order.handoffExportId),
   'API_MERCHANT_WORKSPACE_CHANGED',409);orders.add(order.orderReference);
 }
 for(const operation of value.operations){
  need(UUID.test(operation.id)&&!operations.has(operation.id)&&KINDS.includes(operation.kind)&&STATES.has(operation.status)&&
   HASH.test(operation.requestSha256)&&Array.isArray(operation.attempts)&&operation.attempts.length<=100&&
   operation.attempts.every(attempt=>UUID.test(attempt.id)&&typeof attempt.startedAt==='string'),
   'API_MERCHANT_WORKSPACE_CHANGED',409);operations.add(operation.id);
 }
 for(const item of value.exports){need(UUID.test(item.id)&&!exports.has(item.id),'API_MERCHANT_WORKSPACE_CHANGED',409);exports.add(item.id);}
 for(const item of value.backups){need(UUID.test(item.id)&&!backups.has(item.id)&&offers.has(item.offerId)&&
  HASH.test(item.encryptedManifestSha256)&&HASH.test(item.sidecarSha256),'API_MERCHANT_WORKSPACE_CHANGED',409);backups.add(item.id);}
 return value;
}
export async function openMerchantWorkspace(configuration,{environment=process.env,expectedWorkspaceSha256}={}){
 await ownedDirectory(configuration.directory,{create:true});
 const lease=await acquireStateLease(configuration.directory);
 const workspace=new MerchantWorkspace(configuration,environment,lease);
 try{await workspace.initialize(expectedWorkspaceSha256);return workspace;}
 catch(error){
  try{await workspace.close();}
  catch{
   Object.defineProperty(error,'recovery',{value:Object.freeze({close:()=>workspace.close()}),enumerable:false,configurable:true});
  }
  throw error;
 }
}
export class MerchantWorkspace{
 constructor(configuration,environment,lease){
  this.configuration=configuration;this.environment={...environment};this.lease=lease;
  this.state=null;this.tail=Promise.resolve();this.reloadRequired=false;this.closing=false;this.closed=false;
  this.pumping=null;this.pendingFinal=null;this.currentService=null;this.serviceOfferId=null;
  this.servicePhase='STOPPED';this.serviceFault=null;this.fault=null;this.closePromise=null;
 }
 get statePath(){return join(this.configuration.directory,'workspace.json');}
 async initialize(expectedWorkspaceSha256){
  for(const part of ['operations','offers','orders','exports','restored'])await ownedDirectory(join(this.configuration.directory,part),{create:true});
  let bytes;
  try{bytes=await ownedBytes(this.statePath,MAX_STATE);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(bytes){
   if(expectedWorkspaceSha256!==undefined)need(digest(bytes)===expectedWorkspaceSha256,'API_MERCHANT_REVIEWED_WORKSPACE_CHANGED',409);
   this.state=validateState(parse(bytes),this.configuration);
  }else{
   need(expectedWorkspaceSha256===undefined||expectedWorkspaceSha256==='new','API_MERCHANT_REVIEWED_WORKSPACE_CHANGED',409);
   const selected=await readSelectedSource(this.configuration);
   this.state={schema:STATE_SCHEMA,id:newId(),revision:1,configurationSha256:this.configuration.sha256,
    createdAt:now(),updatedAt:now(),source:{sha256:selected.sha256,view:selected.view},offers:[],orders:[],operations:[],exports:[],backups:[]};
   const initial=stateBytes(this.state);need(initial.length<=MAX_STATE,'API_MERCHANT_WORKSPACE_TOO_LARGE',413);
   try{await writeBytes(this.statePath,initial);}
   catch(error){
    const actual=await ownedBytes(this.statePath,MAX_STATE);
    need(actual.equals(initial),'API_MERCHANT_WORKSPACE_PUBLICATION_UNCERTAIN',503);
   }
  }
  if(this.state.operations.some(operation=>operation.status==='RUNNING')){
   await this.change(state=>{
    for(const operation of state.operations)if(operation.status==='RUNNING'){
     operation.status='ATTENTION';operation.updatedAt=now();operation.error={code:'API_MERCHANT_PROCESS_INTERRUPTED',status:409};
     const attempt=operation.attempts.at(-1);if(attempt){attempt.finishedAt=now();attempt.error=operation.error;attempt.status='ATTENTION';}
    }
   });
  }
  this.wake();
 }
 assertOpen(){need(!this.closed,'API_MERCHANT_WORKSPACE_CLOSED',503);this.lease.assertHeld();}
 async reload(){
  const actual=validateState(parse(await ownedBytes(this.statePath,MAX_STATE)),this.configuration,this.state?.id);
  this.state=actual;this.reloadRequired=false;
 }
 serial(work){
  const pending=this.tail.then(async()=>{this.assertOpen();if(this.reloadRequired)await this.reload();return work();});
  this.tail=pending.catch(()=>{});return pending;
 }
 async commit(change){
  this.assertOpen();if(this.reloadRequired)await this.reload();
  const next=structuredClone(this.state);change(next);next.revision++;
  need(Number.isSafeInteger(next.revision),'API_MERCHANT_REVISION_EXHAUSTED',409);next.updatedAt=now();
  validateState(next,this.configuration,this.state.id);const bytes=stateBytes(next);
  need(bytes.length<=MAX_STATE,'API_MERCHANT_WORKSPACE_TOO_LARGE',413);
  try{await writeBytes(this.statePath,bytes);this.state=next;}
  catch(error){
   this.reloadRequired=true;
   try{
    const actual=await ownedBytes(this.statePath,MAX_STATE);
    this.state=validateState(parse(actual),this.configuration,this.state.id);this.reloadRequired=false;
    if(actual.equals(bytes))return;
   }catch{}
   throw error;
  }
 }
 change(work){return this.serial(()=>this.commit(work));}
 offer(id){const result=this.state.offers.find(offer=>offer.id===id);need(result,'API_MERCHANT_OFFER_NOT_FOUND',404);return structuredClone(result);}
 findOrder(ref){const value=this.state.orders.find(order=>order.orderReference===ref);return value?structuredClone(value):null;}
 order(ref){const value=this.findOrder(ref);need(value,'API_MERCHANT_ORDER_NOT_SELECTED',404);return value;}
 backup(id){const value=this.state.backups.find(item=>item.id===id);need(value,'API_MERCHANT_BACKUP_NOT_FOUND',404);return structuredClone(value);}
 async addOffer(offer){
  await this.change(state=>{
   const old=state.offers.find(item=>item.id===offer.id);
   if(old){
    const identity=value=>{const {status,exportId,profileSha256,applicationSource,error,orderMapping,...fixed}=value;return fixed;};
    need(canonical(identity(old))===canonical(identity(offer)),'API_MERCHANT_RETAINED_OFFER_CHANGED',409);
    if(old.status==='READY'&&offer.status==='READY')need(old.profileSha256===offer.profileSha256&&
     canonical(old.applicationSource)===canonical(offer.applicationSource),'API_MERCHANT_RETAINED_OFFER_CHANGED',409);
    // Reopening the original preparation must preserve a later published edition.
    if(old.status!=='READY'&&offer.status==='READY')Object.assign(old,offer);
    return;
   }
   need(state.offers.length<1000,'API_MERCHANT_OFFER_CAPACITY',429);state.offers.push(offer);
  });
 }
 async rememberExport(manifest){
  await this.change(state=>{
   const view=exportView(manifest),old=state.exports.find(item=>item.id===manifest.id);
   if(old){need(canonical(old)===canonical(view),'API_MERCHANT_RETAINED_EXPORT_CHANGED',409);return;}
   state.exports.push(view);
  });
 }
 serviceView(){
  if(this.currentService){
   const value=this.currentService.view();
   return {...value,offerId:this.serviceOfferId,...(this.serviceFault?{status:'ATTENTION',error:this.serviceFault}:{})};
  }
  return {status:this.servicePhase,offerId:this.serviceOfferId,workerOrigin:null,apiUrl:null,consoleUrl:null,worker:null,error:this.serviceFault};
 }
 async startService(offer){
  need(!this.closing,'API_MERCHANT_WORKSPACE_CLOSING',409);
  if(this.currentService&&this.serviceOfferId===offer.id&&this.serviceView().status==='RUNNING')return this.serviceView();
  if(this.currentService)await this.stopService();
  const runtime=await ensureOfferRuntime(this,offer);
  this.serviceOfferId=offer.id;this.servicePhase='STARTING';this.serviceFault=null;
  try{
   this.currentService=await startServices(this.configuration,runtime.profilePath,offer.ports.api,{
    environment:this.environment,onFault:error=>{this.serviceFault=error;this.servicePhase='ATTENTION';}});
   this.servicePhase='RUNNING';return this.serviceView();
  }catch(error){
   // A failed startup can still own the original child/worker. Stop and workspace
   // close keep that exact owner until its retained cleanup actually finishes.
   this.currentService=error.recoveryService??null;
   this.serviceFault=safeError(error);this.servicePhase='ATTENTION';throw error;
  }
 }
 async stopService(){
  const current=this.currentService;this.servicePhase='STOPPING';
  try{await current?.stop();this.currentService=null;this.servicePhase='STOPPED';this.serviceFault=null;return this.serviceView();}
  catch(error){this.servicePhase='ATTENTION';this.serviceFault=safeError(error);throw error;}
 }
 async view(){
  const value=await this.serial(()=>({
   workspace:{id:this.state.id,revision:this.state.revision,source:structuredClone(this.state.source.view),
    offers:this.state.offers.map(offerView),orders:structuredClone(this.state.orders),
    operations:this.state.operations.map(summary),exports:structuredClone(this.state.exports),
    backups:this.state.backups.map(item=>({id:item.id,offerId:item.offerId,label:item.label,createdAt:item.createdAt,
     snapshotManifestSha256:item.snapshotManifestSha256,encryptedManifestSha256:item.encryptedManifestSha256})),
    fault:this.fault},service:this.serviceView()}));
  this.wake();return value;
 }
 async preview(body){
  const selected=await readSelectedSource(this.configuration),draft=offerDraft(body,selected);
  const plan=await native(this.configuration,'plan',{plan:{schema:'stellar-forge.sf101.api-pass.v1',title:draft.title,
   allowanceUnits:draft.allowanceUnits,routes:draft.routes.map(({id,method,path,units})=>({id,method,path,units}))}},
   {environment:this.environment});
  return {sourceSha256:selected.sha256,plan,functions:structuredClone(selected.view.functions),
   checkout:selected.view.checkout,limits:{routes:64,maxRequestBytes:1048576,maxResponseBytes:4194304},ports:{worker:draft.workerPort,api:draft.apiPort}};
 }
 async readOffer(id){
  const offer=await this.serial(()=>this.offer(id)),files=[];
  if(offer.exportId){
   const manifest=await readExport(this.configuration,offer.exportId);
   files.push(...exportView(manifest).files);
  }
  return {offer:offerView(offer),files};
 }
 async readOrder(ref,{after,limit=100}={}){
  const order=await this.serial(()=>this.order(ref)),offer=await this.serial(()=>this.offer(order.offerId));
  const {checkout}=await offerContext(this,offer);
  try{
   const nativeValue=await native(this.configuration,'order',{context:checkout.context,orderReference:ref,...(after?{after}:{}),limit},
    {environment:this.environment});
   return {order,native:nativeValue.native,pass:nativeValue.pass,calls:nativeValue.calls};
  }catch(error){return {order,native:null,pass:null,calls:{calls:[],nextAfter:null},error:safeError(error)};}
 }
 async executions(offerId,{after,limit=50}={}){
  const offer=await this.serial(()=>this.offer(offerId));await ensureOfferRuntime(this,offer);
  return originalApplication(this.configuration,['list','--config',offer.profilePath,'--limit',String(limit),
   ...(after?['--after',after]:[])],{environment:this.environment});
 }
 async execution(offerId,id){
  const offer=await this.serial(()=>this.offer(offerId));await ensureOfferRuntime(this,offer);
  return originalExecution(this.configuration,offer.profilePath,id,{body:false});
 }
 async operation(id){
  const operation=await this.serial(()=>{
   need(UUID.test(id),'API_MERCHANT_OPERATION_ID_REQUIRED');
   const value=this.state.operations.find(item=>item.id===id);need(value,'API_MERCHANT_OPERATION_NOT_FOUND',404);
   return structuredClone(value);
  });
  const request=parse(await ownedBytes(join(this.configuration.directory,'operations',id,'request.json'),4*1024*1024));
  need(digest(canonical(request))===operation.requestSha256,'API_MERCHANT_RETAINED_REQUEST_CHANGED',409);
  this.wake();return {...operation,request};
 }
 async act(kind,body){
  const request=validateAction(kind,body),requestSha256=digest(canonical(request));
  const outcome=await this.serial(async()=>{
   need(!this.closing,'API_MERCHANT_WORKSPACE_CLOSING',409);
   const existing=this.state.operations.find(item=>item.id===request.operationId);
   if(existing){
    need(existing.kind===kind&&existing.requestSha256===requestSha256,'API_MERCHANT_OPERATION_ID_REUSED',409);
    return {operation:structuredClone(existing),workspaceRevision:this.state.revision,replayed:true};
   }
   need(request.expectedRevision===this.state.revision,'API_MERCHANT_WORKSPACE_REVISION_CHANGED',409);
   need(this.state.operations.length<10000,'API_MERCHANT_OPERATION_CAPACITY',429);
   const directory=join(this.configuration.directory,'operations',request.operationId);await ownedDirectory(directory,{create:true});
   await writeExact(join(directory,'request.json'),encoded(request));
   const operation={id:request.operationId,kind,status:'QUEUED',requestSha256,createdAt:now(),updatedAt:now(),attempts:[],result:null,error:null};
   await this.commit(state=>{state.operations.push(operation);});
   return {operation:structuredClone(operation),workspaceRevision:this.state.revision,replayed:false};
  });
  this.wake();return outcome;
 }
 async resume(id,requestSha256){
  const outcome=await this.serial(async()=>{
   need(!this.closing,'API_MERCHANT_WORKSPACE_CLOSING',409);
   const operation=this.state.operations.find(item=>item.id===id);
   need(operation&&UUID.test(id),'API_MERCHANT_OPERATION_NOT_FOUND',404);
   need(operation.requestSha256===requestSha256,'API_MERCHANT_RETAINED_REQUEST_CHANGED',409);
   if(operation.status==='ATTENTION')need(operation.attempts.length<100,'API_MERCHANT_ATTEMPT_LIMIT',409);
   if(operation.status==='ATTENTION')await this.commit(state=>{
    const current=state.operations.find(item=>item.id===id);current.status='QUEUED';current.error=null;current.updatedAt=now();
   });
   return {operation:structuredClone(this.state.operations.find(item=>item.id===id)),workspaceRevision:this.state.revision};
  });
  this.wake();return outcome;
 }
 async cancel(id,requestSha256){
  const result=await this.serial(async()=>{
   const operation=this.state.operations.find(item=>item.id===id);need(operation,'API_MERCHANT_OPERATION_NOT_FOUND',404);
   need(operation.requestSha256===requestSha256,'API_MERCHANT_RETAINED_REQUEST_CHANGED',409);
   if(operation.status==='CANCELLED')return;
   need(operation.status==='QUEUED','API_MERCHANT_OPERATION_ALREADY_DISPATCHED',409);
   await this.commit(state=>{const current=state.operations.find(item=>item.id===id);current.status='CANCELLED';current.updatedAt=now();});
  });
  return this.operation(id);
 }
 wake(){
  if(this.closed||this.closing||this.pumping)return;
  this.pumping=Promise.resolve().then(()=>this.pump()).catch(error=>{this.fault=safeError(error);})
   .finally(()=>{this.pumping=null;
    if(!this.fault&&!this.closing&&!this.closed&&this.state.operations.some(operation=>operation.status==='QUEUED'))this.wake();
   });
 }
 async finishPending(){
  if(!this.pendingFinal)return;
  const pending=this.pendingFinal;
  await this.change(state=>{
   const operation=state.operations.find(item=>item.id===pending.id);need(operation,'API_MERCHANT_OPERATION_NOT_FOUND',404);
   if(operation.status==='COMPLETED')return;
   need(operation.attempts.at(-1)?.id===pending.attemptId,'API_MERCHANT_ATTEMPT_CHANGED',409);
   operation.status=pending.error?'ATTENTION':'COMPLETED';operation.error=pending.error;operation.result=pending.result;
   operation.updatedAt=now();const attempt=operation.attempts.at(-1);
   attempt.finishedAt=now();attempt.status=operation.status;attempt.error=pending.error;
  });
  this.pendingFinal=null;this.fault=null;
 }
 async pump(){
  await this.finishPending();
  while(!this.closing){
   const selected=await this.serial(async()=>{
    const next=this.state.operations.find(operation=>operation.status==='QUEUED');if(!next)return null;
    need(next.attempts.length<100,'API_MERCHANT_ATTEMPT_LIMIT',409);
    const attempt={id:newId(),startedAt:now(),finishedAt:null,status:'RUNNING',error:null};
    await this.commit(state=>{
     const operation=state.operations.find(item=>item.id===next.id);
     operation.status='RUNNING';operation.updatedAt=now();operation.attempts.push(attempt);
    });
    return {operation:structuredClone(this.state.operations.find(item=>item.id===next.id)),attempt};
   });
   if(!selected)return;
   let result=null,error=null;
   try{
    const body=parse(await ownedBytes(join(this.configuration.directory,'operations',selected.operation.id,'request.json'),4*1024*1024));
    need(digest(canonical(body))===selected.operation.requestSha256,'API_MERCHANT_RETAINED_REQUEST_CHANGED',409);
    validateAction(selected.operation.kind,body);
    const resultFile=join(this.configuration.directory,'operations',selected.operation.id,'result.json');
    result=await existingJson(resultFile);
    if(result===null){
     result=await executeMerchantOperation(this,selected.operation,body,selected.attempt);
     // A named result reopens every committed native effect after an uncertain workspace write.
     await writeExact(resultFile,encoded(result));
    }
   }catch(failure){error=safeError(failure);}
   this.pendingFinal={id:selected.operation.id,attemptId:selected.attempt.id,result,error};
   await this.finishPending();
  }
 }
 close({beforeRelease}={}){
  if(this.closed)return Promise.resolve();
  if(this.closePromise)return this.closePromise;
  need(beforeRelease===undefined||typeof beforeRelease==='function','API_MERCHANT_CLOSE_CALLBACK_REQUIRED');
  if(beforeRelease!==undefined)this.beforeRelease=beforeRelease;
  this.closing=true;
  this.closePromise=(async()=>{
   await this.pumping;await this.stopService();await this.tail;
   // The native launcher publishes STOPPED while this same workspace lease is still held.
   await this.beforeRelease?.();await this.lease.close();this.closed=true;
  })().catch(error=>{this.closePromise=null;throw error;});
  return this.closePromise;
 }
}
