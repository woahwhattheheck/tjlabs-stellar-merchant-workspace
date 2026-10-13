// SPDX-License-Identifier: MIT
// One operator host over the original OpenAQ Buyer, Dataset, approval and receiving APIs.
import {join,dirname} from 'node:path';
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {acquireStateLease} from '../../../merchant-fleet-gateway/state-lease.mjs';
import {createBrowserApprovalBroker} from '../../../sf81-buyer-operator-bridge/browser-approval.mjs';
import {workspaceConfiguration} from '../../queue.mjs';
import {canonical} from '../../dataset-page.mjs';
import {MAX_DATASET_PAGES,MAX_DATASET_PAGE_BYTES} from '../../../sf100-buyer-dataset-delivery/deliver.mjs';
import {readOpenAQHandoff,prepareOpenAQDatasetRequest} from '../handoff.mjs';
import {prepareOpenAQBuyer,inspectOpenAQBuyer,runOpenAQBuyer,recoverOpenAQBuyer,
 accountOpenAQBuyer,deliverOpenAQBuyer} from '../customer.mjs';
import {exportOpenAQBuyerDelivery,inspectOpenAQBuyerDelivery,receiveOpenAQBuyerDelivery,
 reopenOpenAQBuyerDelivery,openOpenAQBuyerDataset} from '../delivery.mjs';
import * as F from '../files.mjs';
import {readConsoleConfiguration,consolePaths,CONSOLE_SCHEMA} from './config.mjs';

const clone=value=>structuredClone(value);
const sha=value=>F.digest(Buffer.from(canonical(value)));
const code=error=>/^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code??'')?error.code:
 /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.message??'')?error.message:'OPENAQ_CUSTOMER_OPERATION_FAILED';
const only=(value,keys)=>F.need(F.object(value)&&Object.keys(value).every(k=>keys.includes(k)),'OPENAQ_CUSTOMER_INPUT_INVALID');
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const actions=new Set(['prepare','resumePreparation','run','recover','account','finalize',
 'deliver','export','receive','reopen','inspect']);
function selection(input){
 only(input,['intentId','acceptIndex','query','maxPages','maxTotalAtomic','maxRows','maxPageBytes']);
 const value={intentId:F.id(input.intentId),acceptIndex:input.acceptIndex,query:input.query??'',
  maxPages:input.maxPages,maxTotalAtomic:input.maxTotalAtomic,maxRows:input.maxRows??1000000,maxPageBytes:input.maxPageBytes??1048576};
 F.need(integer(value.acceptIndex,0,1000)&&typeof value.query==='string'&&value.query.length<=8192&&
  integer(value.maxPages,1,MAX_DATASET_PAGES)&&integer(value.maxRows,1,1000000)&&
  integer(value.maxPageBytes,1024,MAX_DATASET_PAGE_BYTES)&&typeof value.maxTotalAtomic==='string'&&
  /^[1-9][0-9]{0,38}$/.test(value.maxTotalAtomic)&&BigInt(value.maxTotalAtomic)<=170141183460469231731687303715884105727n,
 'OPENAQ_BUYER_LIMITS_REQUIRED');
 return value;
}
export async function openCustomerConsole({directory,expectedConfiguration,environment=process.env,brokerDirectory}={}){
 const settings=await readConsoleConfiguration(directory,expectedConfiguration),paths=consolePaths(settings);
 const lease=await acquireStateLease(settings.directory);
 let closing=false,closed=false,closePromise,broker=null,brokerPromise=null,active=null,refreshPromise=null;
 const reads=new Set(),jobs=new Map();
 let cache={source:null,sourceFiles:[],selection:null,inspection:null,inspectionError:null,delivery:null,deliveryFiles:[],received:null,accounting:null};
 function live(){F.need(!closing&&!closed,'OPENAQ_CUSTOMER_CLOSED');lease.assertHeld();}
 function track(work){
  live();const promise=Promise.resolve().then(work);reads.add(promise);
  promise.then(()=>reads.delete(promise),()=>reads.delete(promise));return promise;
 }
 function idle(){F.need(!active,'OPENAQ_CUSTOMER_BUSY');}
 async function handoff(){
  F.need(settings.mode!=='receive','OPENAQ_CUSTOMER_SOURCE_MODE_REQUIRED');
  const saved=join(paths.customer,'handoff');
  return readOpenAQHandoff({directory:await F.exists(join(saved,'handoff.json'))?saved:settings.handoffDirectory,sha256:settings.handoffSha256});
 }
 async function savedSelection(){
  if(!await F.exists(join(paths.customer,'request.json')))return null;
  const value=await F.json(join(paths.customer,'request.json'),262144);
  F.need(value.schema==='stellar-forge.openaq-buyer.v1.request'&&value.directory===paths.customer&&
   value.handoffSha256===settings.handoffSha256&&value.operatorDirectory===settings.operatorDirectory,
  'OPENAQ_CUSTOMER_SELECTION_CHANGED');
  return {value,selection:selection({...value.limits,intentId:value.intentId,acceptIndex:value.acceptIndex,query:value.query}),
   requestSha256:F.digest(await F.read(join(paths.customer,'request.json'),262144))};
 }
 async function delivered(){
  const local=join(paths.received,'files');
  if(await F.exists(join(local,'delivery.json')))return inspectOpenAQBuyerDelivery({directory:local,
   ...(settings.mode==='receive'?{manifestSha256:settings.deliverySha256}:{})});
  const source=settings.mode==='receive'?settings.deliveryDirectory:paths.delivery;
  if(!await F.exists(join(source,'delivery.json')))return null;
  return inspectOpenAQBuyerDelivery({directory:source,...(settings.mode==='receive'?{manifestSha256:settings.deliverySha256}:{})});
 }
 async function refresh(){
  if(active)return cache;
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
   lease.assertHeld();
   const next={...cache,inspectionError:null};
   if(settings.mode!=='receive'){
    const selected=await handoff();next.source=selected.handoff;
    next.sourceFiles=[{name:'handoff.json',bytes:selected.bytes,sha256:selected.sha256},
     {name:'study.tgz',bytes:selected.handoff.study.bytes,sha256:selected.handoff.study.sha256}];
    next.selection=settings.mode==='acquire'?await savedSelection():null;
    if(next.selection)try{next.inspection=await inspectOpenAQBuyer({directory:paths.customer});}
    catch(error){next.inspection=null;next.inspectionError=code(error);}
   }
   next.delivery=await delivered();
   next.deliveryFiles=next.delivery?[...next.delivery.manifest.files,{name:'delivery.json',
    ...await F.filePin(join(next.delivery.directory,'delivery.json'),{expected:{sha256:next.delivery.manifestSha256,
     bytes:(await F.read(join(next.delivery.directory,'delivery.json'),2*1024*1024)).length}})}]:[];
   if(settings.mode==='receive'&&next.delivery){
    next.source=await F.json(join(next.delivery.directory,'handoff.json'),262144);
   }
   if(await F.exists(join(paths.received,'received.json')))next.received=await F.json(join(paths.received,'received.json'),32*1024*1024);
   cache=next;return cache;
  })();
  try{return await refreshPromise;}finally{refreshPromise=null;}
 }
 function publicJob(job){return clone({id:job.id,action:job.action,input:job.input,state:job.state,createdAt:job.createdAt,
  completedAt:job.completedAt??null,result:job.result??null,error:job.error??null});}
 async function view(){
  return track(async()=>{await refresh();return {schema:CONSOLE_SCHEMA,id:settings.id,label:settings.label,mode:settings.mode,
   configurationSha256:settings.configurationSha256,paths:{directory:settings.directory,customer:paths.customer,
    received:paths.received,delivery:paths.delivery},...clone(cache),
   active:active?publicJob(active):null,jobs:[...jobs.values()].map(publicJob),
   approvals:broker?.pending()??[],capabilities:{maxPages:MAX_DATASET_PAGES,maxPageBytes:MAX_DATASET_PAGE_BYTES,
    paymentAuthority:'ORIGINAL_SF36_AND_SF88',sourceAuthority:'ORIGINAL_OPENAQ_STUDY',
    approvals:'ORIGINAL_SF81_BROWSER_REVIEW',archiveAuthority:'ORIGINAL_OPENAQ_BUYER_DELIVERY',
    terminalAlternative:'openaq-buyer run --dir '+paths.customer}};});
 }
 async function createReview(input){
  F.need(settings.mode==='acquire','OPENAQ_CUSTOMER_ACQUIRE_MODE_REQUIRED');
  const selected=selection(input),source=await handoff(),prepared=prepareOpenAQDatasetRequest(source.handoff,selected);
  const operator=await workspaceConfiguration(settings.operatorDirectory,{configuration:{...prepared.draft,responseFile:undefined}});
  const configuration=clone(operator.configuration);delete configuration.responseFile;
  const body={schema:CONSOLE_SCHEMA+'.selection-review',consoleId:settings.id,
   consoleConfigurationSha256:settings.configurationSha256,handoffSha256:settings.handoffSha256,
   operatorConfigurationSha256:sha(configuration),selection:selected,release:source.handoff.release,
   snapshot:source.handoff.dataset.baselineSnapshot,capture:source.handoff.capture,sourceReview:source.handoff.sourceReview,
   originalRequest:prepared.draft,originalRequestSha256:prepared.configSha256};
  return {...body,reviewSha256:sha(body)};
 }
 function review(input){return track(async()=>{idle();return createReview(input);});}
 async function approvals(){
  F.need(settings.mode==='acquire','OPENAQ_CUSTOMER_ACQUIRE_MODE_REQUIRED');
  if(broker)return broker;
  brokerPromise??=createBrowserApprovalBroker(brokerDirectory?{directory:brokerDirectory}:{}).then(value=>{
   F.need(typeof value.pending==='function','OPENAQ_CUSTOMER_APPROVAL_ACCESSOR_REQUIRED');broker=value;return value;
  });
  try{return await brokerPromise;}finally{brokerPromise=null;}
 }
 async function requestSelection(expected){
  const saved=await savedSelection();F.need(saved&&saved.requestSha256===F.hash(expected),'OPENAQ_CUSTOMER_REQUEST_CHANGED');return saved;
 }
 async function perform(job){
  const input=job.input,signal=job.controller.signal,opts={environment,signal,python:settings.python};
  if(['prepare','resumePreparation'].includes(job.action)){
   only(input,['selection','reviewSha256']);
   const reviewed=await createReview(input.selection);
   F.need(reviewed.reviewSha256===F.hash(input.reviewSha256),'OPENAQ_CUSTOMER_REVIEW_CHANGED');
   return prepareOpenAQBuyer({directory:paths.customer,handoffDirectory:settings.handoffDirectory,
    handoffSha256:settings.handoffSha256,operatorDirectory:settings.operatorDirectory,...reviewed.selection,
    resumePreparation:job.action==='resumePreparation',signal});
  }
  if(job.action==='inspect'){only(input,[]);return null;}
  if(job.action==='receive'){
   only(input,['receivingId','manifestSha256']);F.id(input.receivingId);F.hash(input.manifestSha256);
   const source=await delivered();F.need(source&&source.manifestSha256===input.manifestSha256,'OPENAQ_CUSTOMER_DELIVERY_CHANGED');
   return receiveOpenAQBuyerDelivery({sourceDirectory:source.directory,manifestSha256:input.manifestSha256,
    directory:paths.received,receivingId:input.receivingId,...opts});
  }
  if(job.action==='reopen'){only(input,[]);return reopenOpenAQBuyerDelivery({directory:paths.received,...opts});}
  F.need(settings.mode==='acquire','OPENAQ_CUSTOMER_ACQUIRE_MODE_REQUIRED');
  await requestSelection(input.requestSha256);
  if(job.action==='run'){
   only(input,['requestSha256','retryUnpaid','retryExpired','expectedAttemptSha256']);
   // A challenge-only handoff describes a seller without native settlement.
   F.need((await handoff()).handoff.release.mode==='NATIVE_X402','OPENAQ_CUSTOMER_NATIVE_RELEASE_REQUIRED');
   const channel=await approvals();
   return runOpenAQBuyer({directory:paths.customer,environment:{...environment,...channel.environment},signal,
    ...(input.retryUnpaid===undefined?{}:{retryUnpaid:input.retryUnpaid}),
    ...(input.retryExpired===undefined?{}:{retryExpired:input.retryExpired}),
    ...(input.expectedAttemptSha256===undefined?{}:{expectedAttemptSha256:input.expectedAttemptSha256})});
  }
  if(job.action==='recover'){only(input,['requestSha256']);return recoverOpenAQBuyer({directory:paths.customer});}
  if(['account','finalize'].includes(job.action)){
   only(input,['requestSha256']);cache.accounting=await accountOpenAQBuyer({directory:paths.customer,finalize:job.action==='finalize',signal});
   return cache.accounting;
  }
  await F.directory(paths.outputs,{create:true});
  if(job.action==='deliver'){only(input,['requestSha256']);return deliverOpenAQBuyer({directory:paths.customer,destination:paths.dataset});}
  if(job.action==='export'){
   only(input,['requestSha256','exportId']);return exportOpenAQBuyerDelivery({directory:paths.customer,
    destination:paths.delivery,exportId:F.id(input.exportId),...opts});
  }
  F.need(false,'OPENAQ_CUSTOMER_ACTION_INVALID');
 }
 async function submit({id,action,input={}}={}){
  live();F.uuid(id);F.need(actions.has(action),'OPENAQ_CUSTOMER_ACTION_INVALID');F.need(F.object(input),'OPENAQ_CUSTOMER_INPUT_INVALID');
  const bound=clone(input),fingerprint=sha({action,input:bound}),prior=jobs.get(id);
  if(prior){F.need(prior.fingerprint===fingerprint,'OPENAQ_CUSTOMER_REQUEST_ID_REUSED');return publicJob(prior);}
  idle();
  while(jobs.size>=128){
   const first=[...jobs.values()].find(value=>value!==active&&['COMPLETE','ERROR'].includes(value.state));
   F.need(first,'OPENAQ_CUSTOMER_JOB_LIMIT');jobs.delete(first.id);
  }
  const job={id,action,input:bound,fingerprint,state:'RUNNING',createdAt:new Date().toISOString(),controller:new AbortController()};
  active=job;jobs.set(id,job);
  job.promise=(async()=>{
   try{
    // Reads already accepted by this host finish before the native mutation;
    // subsequent status reads observe the cached original state during it.
    if(refreshPromise)await refreshPromise;
    await Promise.allSettled([...reads]);
    lease.assertHeld();job.result=await perform(job);lease.assertHeld();job.state='COMPLETE';
   }catch(error){job.error={code:code(error)};job.state='ERROR';}
   finally{
    job.completedAt=new Date().toISOString();active=null;
    try{await refresh();}catch(error){cache.inspectionError=code(error);}
   }
  })();
  return publicJob(job);
 }
 function job(id){live();F.uuid(id);const found=jobs.get(id);return found?publicJob(found):null;}
 function decide(input){
  live();F.need(active?.action==='run'&&broker,'OPENAQ_CUSTOMER_NO_ACTIVE_APPROVAL');
  only(input,['intent','approvalId','requestSha256','decision']);
  return broker.decide(input);
 }
 function cancel(id){live();F.need(active?.id===F.uuid(id),'OPENAQ_CUSTOMER_ACTIVE_JOB_CHANGED');
  active.controller.abort();for(const entry of broker?.pending()??[])broker.revoke(entry.intentId);
  return publicJob(active);
 }
 function rows({limit=100}={}){return track(async()=>{
  idle();F.need(integer(limit,1,1000),'OPENAQ_CUSTOMER_ROW_LIMIT');
  const selected=await delivered();F.need(selected,'OPENAQ_CUSTOMER_DELIVERY_REQUIRED');
  const dataset=await openOpenAQBuyerDataset({directory:selected.directory,manifestSha256:selected.manifestSha256});
  const preview=[];for await(const row of dataset.rows()){preview.push(row);if(preview.length>=limit)break;}
  return {manifestSha256:selected.manifestSha256,snapshot:selected.manifest.dataset.snapshot,
   totalRows:selected.manifest.dataset.rows,rows:preview,semantics:await dataset.readSemantics()};
 });}
 async function selectedFile({kind,name}){
  F.member(name);
  if(kind==='source'){
   const source=await handoff();
   F.need(name==='handoff.json'||name==='study.tgz','OPENAQ_CUSTOMER_FILE_NOT_DECLARED');
   return {path:join(source.directory,name),name,...(name==='handoff.json'?{bytes:source.bytes,sha256:source.sha256}:source.handoff.study)};
  }
  F.need(kind==='delivery','OPENAQ_CUSTOMER_FILE_KIND_INVALID');
  const selected=await delivered();F.need(selected,'OPENAQ_CUSTOMER_DELIVERY_REQUIRED');
  const member=name==='delivery.json'?{name,...await F.filePin(join(selected.directory,name))}:
   selected.manifest.files.find(value=>value.name===name);
  F.need(member,'OPENAQ_CUSTOMER_FILE_NOT_DECLARED');
  if(name==='delivery.json')F.need(member.sha256===selected.manifestSha256,'OPENAQ_CUSTOMER_DELIVERY_CHANGED');
  return {path:join(selected.directory,name),...member};
 }
 function streamFile(input,consume){
  return track(async()=>{
   idle();only(input,['kind','name']);F.need(typeof consume==='function','OPENAQ_CUSTOMER_FILE_CONSUMER_REQUIRED');
   const selected=await selectedFile(input);await F.filePin(selected.path,{expected:selected});
   F.need(await realpath(dirname(selected.path))===dirname(selected.path),'OPENAQ_CUSTOMER_FILE_CHANGED');
   const handle=await open(selected.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
   try{
    const before=await handle.stat(),named=await lstat(selected.path);
    F.need(before.isFile()&&before.dev===named.dev&&before.ino===named.ino&&before.size===selected.bytes&&
     (before.mode&0o077)===0&&(!process.getuid||before.uid===process.getuid()),'OPENAQ_CUSTOMER_FILE_CHANGED');
    let completed=false;
    async function* chunks(){
     const buffer=Buffer.allocUnsafe(65536),hasher=createHash('sha256');let count=0;
     while(true){const {bytesRead:n}=await handle.read(buffer,0,buffer.length,count);if(!n)break;
      count+=n;F.need(count<=selected.bytes,'OPENAQ_CUSTOMER_FILE_CHANGED');hasher.update(buffer.subarray(0,n));
      yield Buffer.from(buffer.subarray(0,n));
     }
     const after=await handle.stat(),current=await lstat(selected.path);
     F.need(count===selected.bytes&&hasher.digest('hex')===selected.sha256&&current.dev===before.dev&&
      current.ino===before.ino&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs,
     'OPENAQ_CUSTOMER_FILE_CHANGED');completed=true;
    }
    const result=await consume({name:selected.name,bytes:selected.bytes,sha256:selected.sha256},chunks());
    F.need(completed,'OPENAQ_CUSTOMER_DOWNLOAD_INTERRUPTED');return result;
   }finally{await handle.close();}
  });
 }
 function close(){
  if(closed)return Promise.resolve();if(closePromise)return closePromise;
  closing=true;
  closePromise=(async()=>{
   const failures=[];
   if(active){active.controller.abort();for(const entry of broker?.pending()??[])broker.revoke(entry.intentId);}
   if(brokerPromise)try{await brokerPromise;}catch(error){failures.push(error);}
   await Promise.allSettled([...reads,active?.promise].filter(Boolean));
   if(broker)try{await broker.close();broker=null;}catch(error){failures.push(error);}
   // Keep the original host lease while an owned broker failed to close.
   if(!broker)try{await lease.close();closed=true;}catch(error){failures.push(error);}
   if(failures.length)throw new AggregateError(failures,'OPENAQ_CUSTOMER_CLOSE_INCOMPLETE');
  })().finally(()=>{if(!closed)closePromise=null;});
  return closePromise;
 }
 try{await refresh();}catch(error){try{await lease.close();}catch{}throw error;}
 return Object.freeze({settings,paths,view,review,submit,job,decide,cancel,rows,streamFile,close});
}
