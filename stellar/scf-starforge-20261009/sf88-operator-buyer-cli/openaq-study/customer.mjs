// SPDX-License-Identifier: MIT
// One saved OpenAQ selection around the original SF88 Dataset session.
import {join} from 'node:path';
import {lstat,readdir,link,unlink} from 'node:fs/promises';
import {canonical} from '../dataset-page.mjs';
import {workspaceConfiguration} from '../queue.mjs';
import {createDatasetSession,validateDatasetDefinition,inspectDatasetSession,runDatasetSession,
 recoverDatasetSession,accountDatasetSession,deliverDatasetSession} from '../dataset-session.mjs';
import {MAX_DATASET_PAGES,MAX_DATASET_PAGE_BYTES} from '../../sf100-buyer-dataset-delivery/deliver.mjs';
import {readOpenAQHandoff,prepareOpenAQDatasetRequest} from './handoff.mjs';
import {object,need,path,id,hash,digest,bytes,parse,read,json,retained,retainJson,
 directory,disjoint,exists,emptyIntake,withOwner,copyPinned,sync,signal as checkSignal} from './files.mjs';

export const CUSTOMER_SCHEMA='stellar-forge.openaq-buyer.v1';
const equal=(a,b)=>canonical(a)===canonical(b);
const semantic=value=>digest(Buffer.from(canonical(value)));
const count=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const numberName=i=>String(i).padStart(6,'0');
const maximumAtomic=170141183460469231731687303715884105727n;
function limits(value){
 need(object(value)&&count(value.maxPages,1,MAX_DATASET_PAGES)&&count(value.maxRows,1,1000000)&&
  count(value.maxPageBytes,1024,MAX_DATASET_PAGE_BYTES)&&typeof value.maxTotalAtomic==='string'&&
  /^[1-9][0-9]{0,38}$/.test(value.maxTotalAtomic)&&BigInt(value.maxTotalAtomic)<=maximumAtomic,
 'OPENAQ_BUYER_LIMITS_REQUIRED');
 return {maxPages:value.maxPages,maxTotalAtomic:value.maxTotalAtomic,maxRows:value.maxRows,maxPageBytes:value.maxPageBytes};
}
function requestValue(input){
 const value={schema:CUSTOMER_SCHEMA+'.request',directory:path(input.directory),
  handoffDirectory:path(input.handoffDirectory),handoffSha256:hash(input.handoffSha256),
  operatorDirectory:path(input.operatorDirectory),intentId:id(input.intentId),
  acceptIndex:input.acceptIndex,query:input.query??'',
  limits:limits({maxPages:input.maxPages,maxTotalAtomic:input.maxTotalAtomic,
   maxRows:input.maxRows??1000000,maxPageBytes:input.maxPageBytes??1048576})};
 need(count(value.acceptIndex,0,1000)&&typeof value.query==='string'&&value.query.length<=8192,'OPENAQ_BUYER_SELECTION_REQUIRED');
 disjoint(value.directory,value.operatorDirectory);disjoint(value.directory,value.handoffDirectory);
 return value;
}
function definitionMatches(value,context,target){
 validateDatasetDefinition(value,target);
 need(value.configurationSha256===context.configuration.configurationSha256&&
  equal(value.config,context.config)&&equal(value.limits,context.request.limits)&&
  value.expectedSnapshot===context.handoff.dataset.baselineSnapshot&&value.workspaceDirectory===undefined,
 'OPENAQ_BUYER_NATIVE_SESSION_CHANGED');
 return value;
}
async function attempts(context){
 const root=join(context.directory,'attempts');await directory(root);
 const names=(await readdir(root)).filter(x=>/^[0-9]{6}\.json$/.test(x)).sort();
 need(names.length<=1000&&names.every((n,i)=>n===numberName(i+1)+'.json'),'OPENAQ_BUYER_PREPARATION_LINEAGE_INVALID');
 const result=[];let previous=null;
 for(const name of names){
  const raw=await read(join(root,name),262144),value=parse(raw),sequence=result.length+1;
  need(value.schema===CUSTOMER_SCHEMA+'.session-attempt'&&value.sequence===sequence&&
   value.directory===join(context.directory,'session-'+numberName(sequence))&&
   value.requestSha256===context.requestSha256&&value.configurationSha256===context.configuration.configurationSha256&&
   (sequence===1?value.predecessor===null:
    value.predecessor?.sequence===sequence-1&&value.predecessor.recordSha256===previous.sha256&&object(value.predecessor.observation)),
  'OPENAQ_BUYER_PREPARATION_LINEAGE_CHANGED');
  result.push({raw,value,sha256:digest(raw)});previous=result.at(-1);
 }
 return result;
}
/** Recognize only the original initializer's uncommitted definition. No page
 * attempt, evidence or live run lock can be retired by this preparation path. */
async function initialization(context,attempt,{adopt=false}={}){
 const target=attempt.value.directory;
 if(!await exists(target))return {condition:'ABSENT'};
 await directory(target);
 const entries=(await readdir(target)).sort(),pending=[];
 const final=join(target,'session.json'),hasDefinition=await exists(final);
 for(const name of entries){
  if(['pages','evidence','session.json'].includes(name)||hasDefinition&&name==='run.lock')continue;
  need(/^\.session-[a-f0-9-]{36}\.json$/.test(name),'OPENAQ_BUYER_ORIGINAL_SESSION_RECONCILIATION_REQUIRED');
  pending.push(name);
 }
 if(hasDefinition){
  const raw=await read(final,262144),value=definitionMatches(parse(raw),context,target),named=await lstat(final);
  // A crash between exclusive-link and unlink retains the same complete native
  // definition twice. Retire only that exact pending link under this owner.
  for(const name of pending){
   const source=join(target,name),held=await lstat(source);
   need(held.dev===named.dev&&held.ino===named.ino&&(await read(source,262144)).equals(raw),
    'OPENAQ_BUYER_ORIGINAL_SESSION_RECONCILIATION_REQUIRED');
   if(adopt)await unlink(source);
  }
  if(adopt&&pending.length)await sync(target);
  return {condition:'READY',definition:value};
 }
 const children=[];
 for(const name of ['pages','evidence']){
  if(!entries.includes(name))continue;
  await directory(join(target,name));
  need((await readdir(join(target,name))).length===0,'OPENAQ_BUYER_ORIGINAL_SESSION_RECONCILIATION_REQUIRED');
  children.push(name);
 }
 const observed=[];
 for(const name of pending){
  const source=join(target,name),raw=await read(source,262144);let value,complete=false;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));complete=true;}catch{}
  if(complete){
   // A parseable incompatible definition, including null, is preserved as an
   // error. Only a genuinely interrupted byte write can use a new attempt.
   definitionMatches(value,context,target);
   need(pending.length===1&&children.length===2,'OPENAQ_BUYER_ORIGINAL_SESSION_RECONCILIATION_REQUIRED');
   if(adopt){
    const held=await lstat(source);
    try{await link(source,final);}catch(error){if(error.code!=='EEXIST')throw error;}
    const selected=await lstat(final),current=await lstat(source);
    need(selected.dev===held.dev&&selected.ino===held.ino&&current.dev===held.dev&&current.ino===held.ino&&
     (await read(final,262144)).equals(raw),'OPENAQ_BUYER_NATIVE_DEFINITION_CHANGED');
    await unlink(source);await sync(target);
   }
   return {condition:'NATIVE_DEFINITION_PENDING',name,bytes:raw.length,sha256:digest(raw),definition:value};
  }
  observed.push({name,bytes:raw.length,sha256:digest(raw),condition:raw.length?'INVALID_JSON':'EMPTY'});
 }
 const held=await lstat(target);
 return {condition:'INCOMPLETE',device:String(held.dev),inode:String(held.ino),directories:children,files:observed};
}
async function selectInitial(context,{resumePreparation=false}={}){
 let lineage=await attempts(context),selected=lineage.at(-1);
 if(!selected){
  const value={schema:CUSTOMER_SCHEMA+'.session-attempt',sequence:1,
   directory:join(context.directory,'session-000001'),requestSha256:context.requestSha256,
   configurationSha256:context.configuration.configurationSha256,predecessor:null};
  await retainJson(join(context.directory,'attempts','000001.json'),value);
  lineage=await attempts(context);selected=lineage.at(-1);
 }
 let observation=await initialization(context,selected,{adopt:true});
 if(observation.condition==='INCOMPLETE'){
  need(resumePreparation===true,'OPENAQ_BUYER_PREPARATION_INTERRUPTED_USE_RESUME');
  const rechecked=await initialization(context,selected);
  need(equal(rechecked,observation),'OPENAQ_BUYER_PREPARATION_CHANGED');
  const sequence=selected.value.sequence+1;need(sequence<=1000,'OPENAQ_BUYER_PREPARATION_LIMIT');
  const value={schema:CUSTOMER_SCHEMA+'.session-attempt',sequence,
   directory:join(context.directory,'session-'+numberName(sequence)),requestSha256:context.requestSha256,
   configurationSha256:context.configuration.configurationSha256,
   predecessor:{sequence:selected.value.sequence,recordSha256:selected.sha256,observation}};
  await retainJson(join(context.directory,'attempts',numberName(sequence)+'.json'),value);
  selected={value,sha256:digest(bytes(value))};observation=await initialization(context,selected,{adopt:true});
 }
 if(observation.condition==='ABSENT'){
  await createDatasetSession({directory:selected.value.directory,configPath:join(context.directory,'configuration.json'),
   ...context.request.limits,expectedSnapshot:context.handoff.dataset.baselineSnapshot});
 }
 const final=await initialization(context,selected,{adopt:true});
 need(final.condition==='READY','OPENAQ_BUYER_NATIVE_PREPARATION_REQUIRED');
 return selected.value.directory;
}
async function readContext(root){
 root=await directory(path(root));
 const raw=await read(join(root,'request.json'),262144),request=parse(raw);
 need(request.schema===CUSTOMER_SCHEMA+'.request'&&equal(requestValue({...request,...request.limits}),request)&&request.directory===root,
 'OPENAQ_BUYER_REQUEST_CHANGED');
 const source=await readOpenAQHandoff({directory:join(root,'handoff'),sha256:request.handoffSha256});
 const configuration=await json(join(root,'configuration-selection.json'),262144);
 const configRaw=await read(join(root,'configuration.json'),262144),config=parse(configRaw);
 need(configuration.schema===CUSTOMER_SCHEMA+'.configuration'&&configuration.requestSha256===digest(raw)&&
  configuration.handoffSha256===request.handoffSha256&&configuration.operatorDirectory===request.operatorDirectory&&
  configuration.fileSha256===digest(configRaw)&&configuration.configurationSha256===semantic(config),
 'OPENAQ_BUYER_CONFIGURATION_CHANGED');
 const prepared=prepareOpenAQDatasetRequest(source.handoff,request);
 need(equal(config.operation,prepared.draft.operation)&&config.captureBody===false&&config.responseFile===undefined&&
  equal(config.preparedFrom,prepared.draft.preparedFrom),'OPENAQ_BUYER_ORIGINAL_REQUEST_CHANGED');
 return {directory:root,request,requestSha256:digest(raw),configuration,config,
  handoff:source.handoff,handoffRaw:source.raw,handoffDirectory:source.directory};
}
/** Internal composition seam: one wrapper lease, then the unchanged native
 * session acquires its own original lock for each operation. */
export async function withOpenAQBuyer(root,work){
 return withOwner(root,async()=>{
  const context=await readContext(root),lineage=await attempts(context),selected=lineage.at(-1);
  need(selected,'OPENAQ_BUYER_NATIVE_PREPARATION_REQUIRED');
  const state=await initialization(context,selected,{adopt:true});
  need(state.condition==='READY','OPENAQ_BUYER_NATIVE_PREPARATION_REQUIRED');
  context.sessionDirectory=selected.value.directory;
  context.sessionAttempt=selected.value;
  return work(context);
 });
}
export async function prepareOpenAQBuyer(input={}){
 const request=requestValue(input),resumePreparation=input.resumePreparation??false;
 need(typeof resumePreparation==='boolean','OPENAQ_BUYER_RESUME_BOOLEAN_REQUIRED');
 const abort=checkSignal(input.signal);
 return withOwner(request.directory,async()=>{
  const root=request.directory;
  if(!await exists(join(root,'request.json')))await emptyIntake(root,['lease.lock']);
  await retainJson(join(root,'request.json'),request);
  const local=join(root,'handoff');await directory(local,{create:true});
  let source;
  if(await exists(join(local,'handoff.json')))source=await readOpenAQHandoff({directory:local,sha256:request.handoffSha256});
  else{
   source=await readOpenAQHandoff({directory:request.handoffDirectory,sha256:request.handoffSha256});
   await copyPinned(join(source.directory,'study.tgz'),join(local,'study.tgz'),source.handoff.study,{signal:abort,maxBytes:256*1024*1024});
   await retained(join(local,'handoff.json'),source.raw);
  }
  const prepared=prepareOpenAQDatasetRequest(source.handoff,request),configPath=join(root,'configuration.json');
  let config;
  if(await exists(configPath))config=parse(await read(configPath,262144));
  else{
   const selected=await workspaceConfiguration(request.operatorDirectory,{configuration:{...prepared.draft,responseFile:undefined}});
   config=structuredClone(selected.configuration);delete config.responseFile;
   await retained(configPath,bytes(config));
  }
  need(equal(config.operation,prepared.draft.operation)&&config.captureBody===false&&
   config.responseFile===undefined&&equal(config.preparedFrom,prepared.draft.preparedFrom),
  'OPENAQ_BUYER_ORIGINAL_REQUEST_CHANGED');
  // Recheck the original current signer/transport/policy/cap binding without
  // opening its keys or changing that workspace's saved operator configuration.
  await workspaceConfiguration(request.operatorDirectory,{configuration:config});
  const configRaw=await read(configPath,262144);
  const configuration={schema:CUSTOMER_SCHEMA+'.configuration',requestSha256:digest(bytes(request)),
   handoffSha256:request.handoffSha256,operatorDirectory:request.operatorDirectory,
   fileSha256:digest(configRaw),configurationSha256:semantic(config)};
  await retainJson(join(root,'configuration-selection.json'),configuration);
  await directory(join(root,'attempts'),{create:true});
  const context=await readContext(root),sessionDirectory=await selectInitial(context,{resumePreparation});
  const native=await inspectDatasetSession(sessionDirectory);
  return {schema:CUSTOMER_SCHEMA,directory:root,requestSha256:context.requestSha256,
   handoffSha256:request.handoffSha256,configurationSha256:configuration.configurationSha256,
   sessionDirectory,operatorDirectory:request.operatorDirectory,status:native.status,native};
 },{create:true});
}
export async function inspectOpenAQBuyer({directory:root}={}){
 return withOpenAQBuyer(root,async context=>({
  schema:CUSTOMER_SCHEMA,directory:context.directory,requestSha256:context.requestSha256,
  handoffSha256:context.request.handoffSha256,release:context.handoff.release,
  capture:context.handoff.capture,sourceReview:context.handoff.sourceReview,
  query:context.config.operation.url,terms:context.config.operation.expect,limits:context.request.limits,
  sessionDirectory:context.sessionDirectory,operatorDirectory:context.request.operatorDirectory,
  native:await inspectDatasetSession(context.sessionDirectory)}));
}
export async function runOpenAQBuyer({directory:root,environment=process.env,signal,
 retryUnpaid=false,retryExpired,expectedAttemptSha256}={}){
 checkSignal(signal);
 need(typeof retryUnpaid==='boolean'&&(retryExpired===undefined||object(retryExpired))&&
  !(retryUnpaid&&retryExpired!==undefined),'OPENAQ_BUYER_ONE_ORIGINAL_CONTINUATION_REQUIRED');
 const continuation=retryExpired===undefined?undefined:structuredClone(retryExpired);
 if(retryUnpaid||continuation!==undefined)hash(expectedAttemptSha256);
 else need(expectedAttemptSha256===undefined,'OPENAQ_BUYER_UNEXPECTED_ATTEMPT_SELECTION');
 return withOpenAQBuyer(root,context=>runDatasetSession(context.sessionDirectory,{
  workspace:context.request.operatorDirectory,environment,signal,emitPageSummaries:false,
  retryUnpaid,retryExpired:continuation,expectedAttemptSha256}));
}
export async function recoverOpenAQBuyer({directory:root}={}){
 return withOpenAQBuyer(root,context=>recoverDatasetSession(context.sessionDirectory));
}
export async function accountOriginalOpenAQContext(context,{finalize=false,signal}={}){
 need(typeof finalize==='boolean','OPENAQ_BUYER_FINALIZE_BOOLEAN_REQUIRED');checkSignal(signal);
 const pages=[];let offset=0,total=null;
 do{
  const page=await accountDatasetSession(context.sessionDirectory,{
   workspace:context.request.operatorDirectory,offset,limit:250,finalize,signal});
  need(page.configurationSha256===context.configuration.configurationSha256&&page.range.offset===offset&&
   (total===null||page.range.total===total),'OPENAQ_BUYER_ACCOUNTING_CHANGED');
  total=page.range.total;pages.push(page);
  if(page.interrupted)break;
  const next=page.range.nextOffset;
  need(next===null||Number.isSafeInteger(next)&&next>offset,'OPENAQ_BUYER_ACCOUNTING_NO_PROGRESS');
  offset=next;
 }while(offset!==null);
 return {schema:CUSTOMER_SCHEMA+'.accounting',requestSha256:context.requestSha256,
  sessionId:context.request.intentId,configurationSha256:context.configuration.configurationSha256,
  mode:finalize?'FINALIZE':'VIEW',pages,entries:pages.flatMap(x=>x.entries),
  interrupted:pages.some(x=>x.interrupted),recordAuthority:'ORIGINAL_SF36_LEDGER_AND_ORIGINAL_DATASET_ACCOUNTING'};
}
export async function accountOpenAQBuyer({directory:root,finalize=false,signal}={}){
 need(typeof finalize==='boolean','OPENAQ_BUYER_FINALIZE_BOOLEAN_REQUIRED');checkSignal(signal);
 return withOpenAQBuyer(root,context=>accountOriginalOpenAQContext(context,{finalize,signal}));
}
export async function deliverOpenAQBuyer({directory:root,destination}={}){
 destination=path(destination);disjoint(root,destination);
 return withOpenAQBuyer(root,context=>deliverDatasetSession(context.sessionDirectory,destination));
}
