// SPDX-License-Identifier: MIT
// Saved customer operations around the maintained OData client and native receiver.
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {exportCustomerPacket,sourceManifestIdentity} from './portable.mjs';
import * as client from '../odata-subscription-client.mjs';
import {
 need,plain,shape,text,integer,HASH,sha,same,bytes,identity,parse,read,readJSON,maybeJSON,
 privateDirectory,pathAt,atomic,immutable,inventory,measureChecked,leased
} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/files.mjs';

export const SCHEMA='stellar-forge.odata-customer-desk.v1';
export const CONFIG_SCHEMA='stellar-forge.odata-customer-desk-connection.v1';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const MUTATIONS=new Set(['review','receive','backup','analysis','restore','mapping','accept','package']);
const clone=value=>parse(bytes(value));
const now=()=>new Date().toISOString();
const id=value=>{need(typeof value==='string'&&ID.test(value),'DESK_REQUEST','Keep a stable original request ID.',400);return value;};
const key=value=>sha(Buffer.from(id(value)));
const selectedCustomer=value=>value?{revision:value.revision,editionSha256:value.editionSha256,definitionSha256:value.definitionSha256,rows:value.rows}:null;
const publicValue=value=>{
 if(Array.isArray(value))return value.map(publicValue);
 if(!plain(value))return value;
 return Object.fromEntries(Object.entries(value).filter(([name])=>!['directory','customerDirectory','downloadDirectory','sourceManifest','artifactRecord','nativeManifest','output','tokenEnv'].includes(name)).map(([name,v])=>[name,publicValue(v)]));
};
function errorValue(error){return {code:error.code??'ODATA_DESK_OPERATION',message:String(error.message??error),
 ...Object.fromEntries(['applied','outcomeUnknown','reopenRequired','commitUncertainty'].filter(k=>error[k]!==undefined).map(k=>[k,error[k]]))};}
function endpoint(value){
 let u;try{u=new URL(value);}catch{need(false,'DESK_CONNECTION','Choose the original merchant MCP URL.',400);}
 need(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)),
 'DESK_CONNECTION','Use HTTPS or the actual loopback merchant endpoint.',400);
 need(!u.username&&!u.password&&!u.search&&!u.hash,'DESK_CONNECTION','Keep credentials in the host environment.',400);
 return u.href;
}
export async function readDeskConnection(filename){
 const raw=await read(resolve(filename),1048576),value=parse(raw);
 shape(value,['schema','title','profiles'],'customer desk connection');
 need(value.schema===CONFIG_SCHEMA&&Array.isArray(value.profiles)&&value.profiles.length>0&&value.profiles.length<=64,
 'DESK_CONNECTION','Configure between one and 64 original merchant profiles.',400);
 text(value.title,'desk title');const seen=new Set();
 const profiles=value.profiles.map(p=>{
  shape(p,['id','label','url','publisher','tokenEnv'],'merchant profile');
  need(ALIAS.test(p.id)&&!seen.has(p.id)&&ALIAS.test(p.publisher),'DESK_PROFILE','Use distinct profile aliases and the original publisher alias.',400);seen.add(p.id);
  text(p.label,'profile label');need(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(p.tokenEnv),'DESK_CREDENTIAL','Configure the existing token environment variable.',400);
  return {...p,url:endpoint(p.url)};
 });
 return {schema:CONFIG_SCHEMA,title:value.title,profiles,source:identity(raw)};
}
function validatePayload(request){
 const p=request.payload;
 const edition=()=>{integer(p.expectedRevision,1,10000,'customer edition');need(HASH.test(p.expectedEditionSha256),'DESK_EDITION','Select the actual customer edition SHA.',400);};
 if(request.action==='review'){
  shape(p,['toRevision','expectedEditionSha256','mode','note'],'edition review');
  integer(p.toRevision,1,10000,'ending edition');need(HASH.test(p.expectedEditionSha256)&&['baseline','continue','historical'].includes(p.mode),'DESK_REVIEW','Select the exact edition and supported receiving mode.',400);text(p.note,'review note',4000);
 }else if(request.action==='receive'){
  shape(p,['reviewRequestId','note'],'reviewed receiving');id(p.reviewRequestId);text(p.note,'receiving note',4000);
 }else if(['backup','analysis'].includes(request.action)){
  shape(p,['expectedRevision','expectedEditionSha256','title'],'selected customer output');edition();text(p.title,'output title',160);
 }else if(request.action==='restore'){
  shape(p,['exportRequestId','note'],'independent restore');id(p.exportRequestId);text(p.note,'restore note',4000);
 }else if(request.action==='mapping'){
  shape(p,['source','sourceRevision','expectedRevision','expectedEditionSha256'],'registered Analysis mapping');edition();text(p.source,'registered Analysis source',64);
  need(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(p.source),'ANALYSIS_SOURCE','Choose the actual registered source alias.',400);integer(p.sourceRevision,1,Number.MAX_SAFE_INTEGER,'registered source revision');
 }else if(request.action==='package'){
  shape(p,['exportRequestId','expectedSourceSha256'],'complete customer package');id(p.exportRequestId);need(HASH.test(p.expectedSourceSha256),'DESK_SOURCE','Select the complete installed source SHA.',400);
 }else{
  shape(p,['receivingRequestId','decision','note'],'customer acceptance');id(p.receivingRequestId);
  need(['accepted','changes-requested'].includes(p.decision),'DESK_ACCEPTANCE','Choose a customer review decision.',400);text(p.note,'acceptance note',8000);
 }
}
export class CustomerDesk {
 #root;#config;#source;#active=null;#pending=new Set();#closing=false;#abort=null;#closePromise=null;
 constructor(root,config,source){this.#root=root;this.#config=config;this.#source=source;}
 get directory(){return this.#root;}
 #profile(name){const p=this.#config.profiles.find(p=>p.id===name);need(p,'DESK_PROFILE','Select a configured merchant profile.',404);return p;}
 #remote(profile){return {url:profile.url,tokenEnv:profile.tokenEnv,signal:this.#abort?.signal};}
 #binding(profile){return sha(bytes({id:profile.id,url:profile.url,publisher:profile.publisher,tokenEnv:profile.tokenEnv}));}
 #customer(profile){return join(this.#root,'customers',profile.id);}
 #requestPath(requestId){return 'requests/'+key(requestId)+'/request.json';}
 async #state(){const state=await readJSON(this.#root,'desk.json');need(state.schema===SCHEMA,'DESK_STATE','Open the original customer desk.');return state;}
 async #request(requestId){return readJSON(this.#root,this.#requestPath(requestId));}
 async #local(directory){try{return await client.inspectReceivedODataSubscription({directory});}catch(e){if(e.code==='ODATA_SUBSCRIPTION_CUSTOMER_MISSING')return null;throw e;}}
 async #commit(state,record){
  need(record.state==='COMPLETE'&&record.committedRevision===record.request.expectedRevision+1,'DESK_RECEIPT','The original committed request is incomplete.');
  if(state.completed.includes(record.request.requestId))return state;
  need(state.revision===record.request.expectedRevision&&state.pending===record.request.requestId,'DESK_REVISION','Reconcile the original pending request before another change.');
  const next={...state,revision:record.committedRevision,pending:null,updatedAt:record.completedAt,
   completed:[...state.completed,record.request.requestId]};
  await atomic(this.#root,'desk.json',next);return next;
 }
 async initialize(){
  return leased(this.#root,async()=>{
   let state=await maybeJSON(this.#root,'desk.json');
   const bindings=Object.fromEntries(this.#config.profiles.map(p=>[p.id,this.#binding(p)]));
   if(!state){state={schema:SCHEMA,id:randomUUID(),title:this.#config.title,revision:0,createdAt:now(),updatedAt:now(),bindings,pending:null,completed:[]};await atomic(this.#root,'desk.json',state);}
   need(state.schema===SCHEMA&&same(state.bindings,bindings),'DESK_CONNECTION_CHANGED','Reopen with the original merchant/profile bindings. A changed merchant needs a separately selected desk.');
   if(state.pending){const pending=await this.#request(state.pending);if(pending.state==='COMPLETE')state=await this.#commit(state,pending);}
   return this.status();
  });
 }
 async status(){
  const state=await this.#state(),pending=state.pending?await this.#request(state.pending):null;
  return {...state,title:this.#config.title,profiles:this.#config.profiles.map(({tokenEnv,...p})=>p),
   sourceManifest:this.#source?.identity??null,pending:pending?this.#publicRecord(pending):null,active:this.#active?.requestId??null,closing:this.#closing};
 }
 #publicRecord(record){return {...publicValue(record),progress:record.progress??null,result:record.result?publicValue(record.result):null};}
 async request(requestId){return this.#publicRecord(await this.#request(requestId));}
 async history({profile,offset=0,limit=30}={}){
  if(profile)this.#profile(profile);integer(offset,0,100000,'history offset');integer(limit,1,100,'history page');
  const state=await this.#state(),rows=[];
  for(const requestId of [...state.completed,...(state.pending?[state.pending]:[])]){const r=await this.#request(requestId);if(!profile||r.request.profile===profile)rows.push(r);}
  rows.reverse();const items=rows.slice(offset,offset+limit).map(r=>this.#publicRecord(r));
  return {offset,total:rows.length,items,nextOffset:offset+items.length<rows.length?offset+items.length:null};
 }
 async customer(profile){return this.#local(this.#customer(this.#profile(profile)));}
 async rows({profile,offset=0,limit=100,restoredRequestId}){
  const p=this.#profile(profile);let directory=this.#customer(p);
  if(restoredRequestId){const r=await this.#request(restoredRequestId);need(r.state==='COMPLETE'&&r.request.profile===profile&&
   (r.request.action==='restore'||(r.request.action==='receive'&&r.result.mode==='historical')),'DESK_RESTORE','Choose a completed independent receiving request.');directory=r.result.customerDirectory;}
  return client.readReceivedODataSubscriptionRows({directory,offset,limit});
 }
 async publisher(profile){const p=this.#profile(profile);return client.inspectMerchantODataSubscriptionPublisher({...this.#remote(p),publisher:p.publisher});}
 async editions({profile,offset=0,limit=50}){const p=this.#profile(profile);return client.listMerchantODataSubscriptionEditions({...this.#remote(p),publisher:p.publisher,offset,limit});}
 async publishedRows({profile,revision,expectedEditionSha256,kind='changes',offset=0,limit=100}){
  const p=this.#profile(profile);return client.readMerchantODataSubscriptionRows({...this.#remote(p),publisher:p.publisher,revision,expectedEditionSha256,kind,offset,limit});
 }
 run(input){
  // Reject deterministic input errors before selecting a pending effect.
  let request;
  try{
   request=clone(input);shape(request,['requestId','expectedRevision','action','profile','payload'],'customer desk request');
   id(request.requestId);integer(request.expectedRevision,0,100000,'desk revision');
   need(MUTATIONS.has(request.action)&&plain(request.payload),'DESK_ACTION','Choose a supported customer action.',400);this.#profile(request.profile);
   validatePayload(request);need(!this.#closing,'DESK_CLOSING','The customer desk is closing.');
  }catch(error){throw Object.assign(error,{requestNotSelected:true,requestId:request?.requestId??input?.requestId??null});}
  const operation=this.#execute(request);this.#pending.add(operation);
  operation.then(()=>this.#pending.delete(operation),()=>this.#pending.delete(operation));return operation;
 }
 async #preflight(request,profile){
  const p=request.payload,local=await this.#local(this.#customer(profile));
  if(request.action==='review'){
   need(p.mode!=='baseline'||local===null,'DESK_BASELINE','This customer already has a baseline; choose continuation or an independent historical customer.');
   need(p.mode!=='continue'||local&&p.toRevision>local.revision&&p.toRevision-local.revision<=100,'DESK_CHAIN','Choose up to 100 later editions from this saved customer.');
  }else if(['backup','analysis','mapping'].includes(request.action)){
   need(local&&local.revision===p.expectedRevision&&local.editionSha256===p.expectedEditionSha256,'DESK_CUSTOMER_CHANGED','Refresh and select the current saved customer edition.');
  }else{
   const priorId=p.reviewRequestId??p.exportRequestId??p.receivingRequestId,prior=await this.#request(priorId);
   const allowed=request.action==='receive'?['review']:['restore','package'].includes(request.action)?['backup','analysis']:['receive','restore'];
   need(prior.state==='COMPLETE'&&prior.request.profile===profile.id&&allowed.includes(prior.request.action),'DESK_REFERENCE','Select a completed original request for this customer and action.');
   if(request.action==='receive'&&prior.result.mode!=='historical')need(same(selectedCustomer(local),prior.result.customer),'DESK_CUSTOMER_CHANGED','The customer advanced after this review; review the actual edition.');
   if(request.action==='package')need(this.#source&&p.expectedSourceSha256===this.#source.identity.sha256,'DESK_SOURCE','Select the actual complete installed source manifest.');
  }
 }
 async #execute(request){
  return leased(this.#root,async()=>{
   need(!this.#closing,'DESK_CLOSING','The original customer desk is closing.');
   let state=await this.#state();const profile=this.#profile(request.profile),requestPath=this.#requestPath(request.requestId);
   let record=await maybeJSON(this.#root,requestPath);
   if(record){
    need(same(record.request,request)&&record.binding===this.#binding(profile),'DESK_REQUEST_CHANGED','Retry the exact original request body and merchant profile.');
    if(record.state==='COMPLETE'){const current=await this.#commit(state,record);return {...this.#publicRecord(record),replayed:true,currentRevision:current.revision};}
    if(state.pending===null&&state.revision===request.expectedRevision){state={...state,pending:request.requestId};await atomic(this.#root,'desk.json',state);}
    need(state.pending===request.requestId,'DESK_PENDING','Continue the original pending operation.');
   }else{
    try{
     need(state.pending===null&&state.revision===request.expectedRevision,'DESK_REVISION','Refresh the saved desk and complete its original pending request.');
     need(state.completed.length<10000,'DESK_LIMIT','Archive this complete customer desk before starting another.');
     await this.#preflight(request,profile);
    }catch(error){throw Object.assign(error,{requestNotSelected:true,requestId:request.requestId});}
    record={schema:'stellar-forge.odata-customer-desk-request.v1',request,binding:this.#binding(profile),state:'SELECTED',createdAt:now(),stage:'selected',progress:null,result:null,error:null};
    await atomic(this.#root,requestPath,record);
    await atomic(this.#root,'desk.json',{...state,pending:request.requestId});
   }
   this.#active={requestId:request.requestId};this.#abort=new AbortController();
   const save=async patch=>{record={...record,...clone(patch)};await atomic(this.#root,requestPath,record);};
   try{
    await save({state:'RUNNING',error:null});
    const result=await this.#perform(request,profile,record,save);
    await save({state:'COMPLETE',stage:'complete',progress:null,result,completedAt:now(),committedRevision:request.expectedRevision+1});
    const current=await this.#commit(await this.#state(),record);
    return {...this.#publicRecord(record),replayed:false,currentRevision:current.revision};
   }catch(error){
    // COMPLETE is the durable effect result. A desk-index failure must never
    // replace it: initialize/replay finishes that original index commit.
    if(record.state!=='COMPLETE')await save({state:'INTERRUPTED',error:errorValue(error)});
    throw error;
   }
   finally{this.#abort=null;this.#active=null;}
  });
 }
 async #perform(request,profile,record,save){
  const p=request.payload,root=this.#root,customerDirectory=this.#customer(profile),remote=this.#remote(profile);
  const requestDirectory=join(root,'requests',key(request.requestId));
  await privateDirectory(requestDirectory,{create:true});
  if(request.action==='review'){
   shape(p,['toRevision','expectedEditionSha256','mode','note'],'edition review');
   need(['baseline','continue','historical'].includes(p.mode)&&HASH.test(p.expectedEditionSha256),'DESK_REVIEW','Select the exact ending edition and receiving mode.',400);
   integer(p.toRevision,1,10000,'ending edition');text(p.note,'review note',4000);
   // A saved candidate survives a lost response without substituting a newer observation.
   const candidate=await maybeJSON(requestDirectory,'review-candidate.json');if(candidate)return candidate;
   const local=await this.#local(customerDirectory),publisher=await client.inspectMerchantODataSubscriptionPublisher({...remote,publisher:profile.publisher});
   const page=await client.listMerchantODataSubscriptionEditions({...remote,publisher:profile.publisher,offset:p.toRevision-1,limit:1});
   const edition=page.items[0];need(edition?.revision===p.toRevision&&edition.manifestSha256===p.expectedEditionSha256,'DESK_EDITION','The selected publisher edition changed.');
   need(p.mode!=='baseline'||local===null,'DESK_BASELINE','This customer already has a baseline. Continue it or select an independent historical customer.');
   need(p.mode!=='continue'||local&&p.toRevision>local.revision&&p.toRevision-local.revision<=100,'DESK_CHAIN','Select up to 100 later consecutive editions from this exact customer.');
   if(local&&p.mode==='continue')need(local.definitionSha256===publisher.definitionSha256,'DESK_DEFINITION','The remote publisher differs from the original customer definition.');
   const result={mode:p.mode,profile:profile.id,publisher:profile.publisher,endpoint:profile.url,note:p.note,observedAt:now(),
    customer:p.mode==='continue'?selectedCustomer(local):null,definition:publisher.definition,definitionSha256:publisher.definitionSha256,
    edition,fromRevision:p.mode==='continue'?local.revision:0,toRevision:p.toRevision,
    expectedFromEditionSha256:p.mode==='continue'?local.editionSha256:null,expectedEditionSha256:p.expectedEditionSha256};
   await immutable(requestDirectory,'review-candidate.json',bytes(result));return result;
  }
  if(request.action==='receive'){
   shape(p,['reviewRequestId','note'],'reviewed receiving');id(p.reviewRequestId);text(p.note,'receiving note',4000);
   const review=await this.#request(p.reviewRequestId);need(review.state==='COMPLETE'&&review.request.action==='review'&&review.request.profile===profile.id,'DESK_REVIEW','Choose the saved completed review for this customer.');
   const selection=review.result,artifact='desk-'+profile.id.slice(0,20)+'-'+key(request.requestId).slice(0,32);
   const destination=selection.mode==='historical'?join(root,'historical',key(request.requestId)):customerDirectory;
   const downloadDirectory=join(root,'downloads',key(request.requestId));
   if(!record.delivery){
    if(selection.mode!=='historical')need(same(selectedCustomer(await this.#local(customerDirectory)),selection.customer),'DESK_CUSTOMER_CHANGED','The customer advanced after this review; retain it and review the actual saved edition.');
    const delivery=await client.createMerchantODataSubscriptionDelivery({...remote,publisher:profile.publisher,artifact,
     fromRevision:selection.fromRevision,toRevision:selection.toRevision,expectedEditionSha256:selection.expectedEditionSha256,
     expectedFromEditionSha256:selection.expectedFromEditionSha256});
    await save({stage:'delivery-selected',delivery});record.delivery=delivery;
   }
   if(!record.download){
    let last=0;
    const download=await client.downloadMerchantODataSubscriptionArtifact({...remote,artifact,expectedSha256:record.delivery.artifactSha256,directory:downloadDirectory,
     onProgress:async progress=>{if(Date.now()-last>500||progress.bytes===progress.total){last=Date.now();await save({stage:'downloading',progress});}}});
    await save({stage:'downloaded',download,progress:null});record.download=download;
   }
   // Always reopen the exact retained files before native receiving/replay.
   await client.inspectODataSubscriptionDownload({directory:downloadDirectory,expectedSha256:record.delivery.artifactSha256});
   await save({stage:'receiving'});
   const received=await client.receiveODataSubscriptionDownload({directory:downloadDirectory,customerDirectory:destination,expectedSha256:record.delivery.artifactSha256,signal:this.#abort.signal});
   const current=await client.inspectReceivedODataSubscription({directory:destination});
   return {mode:selection.mode,reviewRequestId:p.reviewRequestId,note:p.note,selection,delivery:record.delivery,download:record.download,
    receiving:received,customerDirectory:destination,customer:current};
  }
  if(['backup','analysis'].includes(request.action)){
   shape(p,['expectedRevision','expectedEditionSha256','title'],'selected customer output');
   integer(p.expectedRevision,1,10000,'customer edition');need(HASH.test(p.expectedEditionSha256),'DESK_EDITION','Select the actual customer edition SHA.',400);
   text(p.title,'output title',160);const output=join(root,'exports',key(request.requestId));
   const fn=request.action==='backup'?client.backupReceivedODataSubscription:client.exportReceivedODataSubscription;
   const manifest=request.action==='backup'?'backup.json':'source.json';
   let result=record.outputResult??null,recoveredFromOriginalManifest=false,prior=null;
   try{prior=parse(await read(join(output,manifest)));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(prior){
    let saved=prior;
    if(request.action==='analysis'){
     try{saved=parse(await read(join(output,'customer.json')));}
     catch(error){
      if(error.code!=='ENOENT')throw error;
      // The original exporter publishes source.json immediately before its
      // final customer.json. Resume that exact native export if interrupted here.
      result=await fn({directory:customerDirectory,output,expectedRevision:p.expectedRevision,expectedEditionSha256:p.expectedEditionSha256,title:p.title});
      await save({stage:'native-output-complete',outputResult:result});record.outputResult=result;
      saved=parse(await read(join(output,'customer.json')));
     }
    }
    need(saved.revision===p.expectedRevision&&saved.editionSha256===p.expectedEditionSha256,'DESK_OUTPUT_CHANGED','The existing original output selects another customer edition.');
    need(request.action==='backup'?prior.schema==='stellar-forge.odata-subscription-customer-backup.v1':prior.schema==='stellar-forge.analysis-source-document.v1'&&prior.complete===true,'DESK_OUTPUT_CHANGED','The selected native output is incomplete.');
    recoveredFromOriginalManifest=result===null;
   }else{
    result=await fn({directory:customerDirectory,output,expectedRevision:p.expectedRevision,expectedEditionSha256:p.expectedEditionSha256,title:p.title});
    await save({stage:'native-output-complete',outputResult:result});record.outputResult=result;
   }
   const raw=await read(join(output,manifest)),value=parse(raw);
   const names=request.action==='backup'?[manifest,...value.files.map(f=>f.path)]:[manifest,'dataset.csv','customer.json',value.document.path,...value.originals.map(f=>f.path)];
   // Native declarations remain authoritative after a lost export response.
   const declared=request.action==='backup'?value.files:[value.document,...value.originals];
   need(Array.isArray(declared)&&declared.length>0&&declared.length<=2048,'DESK_OUTPUT_CHANGED','The original native output inventory is missing.');
   const declaredPaths=new Set();
   for(const file of declared){
    need(plain(file)&&typeof file.path==='string'&&!declaredPaths.has(file.path)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&HASH.test(file.sha256),
     'DESK_OUTPUT_CHANGED','The native output inventory contains an invalid or repeated file.');
    declaredPaths.add(file.path);await measureChecked(await pathAt(output,file.path),{bytes:file.bytes,sha256:file.sha256});
   }
   if(request.action==='analysis'){
    await measureChecked(join(output,'dataset.csv'),{bytes:value.document.bytes,sha256:value.document.sha256});
    const proofFile=value.originals.find(f=>f.role==='customer-proof-manifest');
    need(proofFile,'DESK_OUTPUT_CHANGED','The native analytical proof manifest is absent.');
    const proof=parse(await read(await pathAt(output,proofFile.path)));
    const customerProof=proof.files?.find(f=>f.path==='customer.json');
    need(proof.schema==='stellar-forge.odata-subscription-proof.v1'&&proof.revision===p.expectedRevision&&proof.editionSha256===p.expectedEditionSha256&&customerProof,
     'DESK_OUTPUT_CHANGED','The native analytical proof selects another customer.');
    await measureChecked(join(output,'customer.json'),{bytes:customerProof.bytes,sha256:customerProof.sha256});
    const saved=parse(await read(join(output,'customer.json')));
    need(saved.revision===p.expectedRevision&&saved.editionSha256===p.expectedEditionSha256,'DESK_OUTPUT_CHANGED','The analytical customer identity differs.');
   }
   const files=await inventory(output,names);
   return {kind:request.action==='backup'?'customer-backup':'analysis',title:p.title,customerRevision:p.expectedRevision,editionSha256:p.expectedEditionSha256,
    manifest:{path:manifest,...identity(raw)},files,bytesTotal:files.reduce((n,f)=>n+f.bytes,0),directory:output,native:result,recoveredFromOriginalManifest};
  }
  if(request.action==='restore'){
   shape(p,['exportRequestId','note'],'independent restore');id(p.exportRequestId);text(p.note,'restore note',4000);
   const selected=await this.#request(p.exportRequestId);need(selected.state==='COMPLETE'&&['backup','analysis'].includes(selected.request.action)&&selected.request.profile===profile.id,
    'DESK_EXPORT','Select a complete native output from this customer.');
   const output=selected.result;for(const file of output.files)await measureChecked(await pathAt(output.directory,file.path),{bytes:file.bytes,sha256:file.sha256});
   const destination=join(root,'restored',key(request.requestId));
   const native=await client.restoreODataSubscriptionCustomer({sourceDirectory:output.directory,customerDirectory:destination,kind:output.kind,expectedSha256:output.manifest.sha256,signal:this.#abort.signal});
   const customer=await client.inspectReceivedODataSubscription({directory:destination});
   return {exportRequestId:p.exportRequestId,note:p.note,customerDirectory:destination,native,customer};
  }
  if(request.action==='mapping'){
   shape(p,['source','sourceRevision','expectedRevision','expectedEditionSha256'],'registered Analysis mapping');
   const local=await this.#local(customerDirectory);need(local&&local.revision===p.expectedRevision&&local.editionSha256===p.expectedEditionSha256,'DESK_CUSTOMER_CHANGED','Select the current customer and actual registered Analysis source.');
   const mapping=await client.receivedODataSubscriptionAnalysisMapping({directory:customerDirectory,source:p.source,sourceRevision:p.sourceRevision});
   return {customer:selectedCustomer(local),mapping};
  }
  if(request.action==='package'){
   shape(p,['exportRequestId','expectedSourceSha256'],'complete customer package');id(p.exportRequestId);
   need(this.#source&&p.expectedSourceSha256===this.#source.identity.sha256,'DESK_SOURCE','Select the actual complete installed source manifest.');
   const selected=await this.#request(p.exportRequestId);need(selected.state==='COMPLETE'&&['backup','analysis'].includes(selected.request.action)&&selected.request.profile===profile.id,'DESK_EXPORT','Select a complete native output for this customer.');
   const directory=join(root,'packages',key(request.requestId)),output=join(directory,'customer-output.ndjson');
   const packet=await exportCustomerPacket({directory:selected.result.directory,output,request:selected.result,...this.#source});
   return {exportRequestId:p.exportRequestId,directory,packet,sourceManifest:this.#source.identity};
  }
  shape(p,['receivingRequestId','decision','note'],'customer acceptance');
  need(['accepted','changes-requested'].includes(p.decision),'DESK_ACCEPTANCE','Choose a customer review decision.',400);text(p.note,'acceptance note',8000);
  const selected=await this.#request(p.receivingRequestId);need(selected.state==='COMPLETE'&&['receive','restore'].includes(selected.request.action)&&selected.request.profile===profile.id,
   'DESK_RECEIPT','Select an actual completed native receiving result.');
  return {receivingRequestId:p.receivingRequestId,decision:p.decision,note:p.note,reviewedAt:now(),customer:selectedCustomer(selected.result.customer)};
 }
 async file({requestId,path,expectedSha256}){
  const record=await this.#request(requestId);need(record.state==='COMPLETE'&&['backup','analysis','package'].includes(record.request.action),'DESK_OUTPUT','Select a complete native customer output.');
  if(record.request.action==='package'){const p=record.result.packet;need(path===p.filename&&expectedSha256===p.sha256,'DESK_FILE','Select the saved complete package.');return {path:join(record.result.directory,p.filename),file:{path:p.filename,bytes:p.bytes,sha256:p.sha256}};}
  const file=record.result.files.find(f=>f.path===path);need(file&&file.sha256===expectedSha256,'DESK_FILE','Select an original output member and digest.');
  return {path:await pathAt(record.result.directory,path),file};
 }
 async output(requestId){const r=await this.#request(requestId);need(r.state==='COMPLETE'&&['backup','analysis'].includes(r.request.action),'DESK_OUTPUT','Choose a complete original export.');return r.result;}
 async close(){
  return this.#closePromise??=(async()=>{this.#closing=true;this.#abort?.abort(new Error('The original customer desk is closing at its checkpoint.'));
   await Promise.allSettled([...this.#pending]);})();
 }
}
export async function openCustomerDesk({directory,connection,sourceRoot,sourceManifest}){
 const config=typeof connection==='string'?await readDeskConnection(connection):connection;
 need(config?.schema===CONFIG_SCHEMA,'DESK_CONNECTION','Load the original desk connection.');
 const source=sourceManifest?{sourceRoot,sourceManifest:resolve(sourceManifest),identity:await sourceManifestIdentity(sourceManifest)}:null;
 const root=await privateDirectory(resolve(directory),{create:true}),desk=new CustomerDesk(root,config,source);await desk.initialize();return desk;
}
