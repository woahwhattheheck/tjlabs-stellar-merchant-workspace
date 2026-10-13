// SPDX-License-Identifier: MIT
// Trusted aliases over the original standalone SF88/SF101 recovery engine.
import {createHash,randomUUID} from 'node:crypto';
import {readdir,lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {ObjectSessionRecovery} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/workspace-recovery.mjs';
import {initializationDirectory as privateDirectory,initializationBytes as bytes,
 optionalInitializationBytes as optionalBytes,retainInitializationRecord as retain,
 acquireInitialization} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/initialization.mjs';
import {nativeObjectRecoveryOperations} from './native-object-recovery-schema.mjs';
export {nativeObjectRecoveryActions,nativeObjectRecoverySchema} from './native-object-recovery-schema.mjs';

export const NATIVE_OBJECT_RECOVERY_SCHEMA='stellar-forge.mcp-native-object-recovery.v1';
export const NATIVE_OBJECT_RECOVERY_PROFILE='stellar-forge.mcp-native-object-recovery-profile.v1';
const SCHEMA=NATIVE_OBJECT_RECOVERY_SCHEMA,PROFILE=NATIVE_OBJECT_RECOVERY_PROFILE;
const NATIVE='stellar-forge.sf88.object-session-recovery.v1';
const ALIAS=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/,HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KINDS=['snapshot','verify','restore'],MAX_JSON=16*1024*1024;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const sha=v=>createHash('sha256').update(v).digest('hex');
const encoded=v=>Buffer.from(JSON.stringify(v));
const fail=code=>{throw Object.assign(new Error(code),{code});};
const need=(value,code)=>{if(!value)fail(code);};
const code=e=>/^[A-Z0-9_]{1,160}$/.test(e?.code??'')?e.code:'MCP_OBJECT_RECOVERY_FAILED';
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>v?.[k]!==undefined).map(k=>[k,v[k]]));
function fields(v,keys){
 need(object(v)&&Object.keys(v).every(k=>keys.includes(k)),'MCP_OBJECT_RECOVERY_ARGUMENTS_INVALID');return v;
}
function alias(v){need(typeof v==='string'&&ALIAS.test(v),'MCP_OBJECT_RECOVERY_PROFILE_REQUIRED');return v;}
function hash(v){need(typeof v==='string'&&HASH.test(v),'MCP_OBJECT_RECOVERY_HASH_REQUIRED');return v;}
function uuid(v){need(typeof v==='string'&&UUID.test(v),'MCP_OBJECT_RECOVERY_REQUEST_ID_REQUIRED');return v;}
function absolute(v){
 need(typeof v==='string'&&isAbsolute(v)&&resolve(v)===v&&v!=='/'&&!v.includes('\0'),
  'MCP_OBJECT_RECOVERY_CANONICAL_PATH_REQUIRED');return v;
}
function inside(root,path){const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);}
function parse(raw){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('MCP_OBJECT_RECOVERY_JSON_INVALID');}}
async function json(path,optional=false){const raw=optional?await optionalBytes(path,MAX_JSON):await bytes(path,MAX_JSON);return raw===null?null:parse(raw);}
function page(items,args){
 const offset=args.offset??0,limit=args.limit??25;
 need(Number.isSafeInteger(offset)&&offset>=0&&offset<=items.length&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
  'MCP_OBJECT_RECOVERY_PAGE_INVALID');
 return {items:items.slice(offset,offset+limit),offset,total:items.length,nextOffset:offset+limit<items.length?offset+limit:null};
}
function selection(native){
 need(native?.schema===NATIVE&&native.absentLedger?.state==='ABSENT'&&object(native.objectSession),
  'MCP_OBJECT_RECOVERY_NATIVE_SELECTION_INVALID');
 return {...native.objectSession}; // Complete native definition/configuration history binding.
}
function checkpoint(v){
 return v?pick(v,['sessionId','status','progressStatus','configurationSha256','sessionSha256','objectSha256',
  'bytes','chunkCount','completeChunks','attemptedChunks','downloadedBytes','capAllocatedAtomic']):null;
}
function publicResult(result){
 if(!result)return null;
 const n=result.native;
 return {operation:result.operation,ok:result.ok===true,completionReported:result.completionReported===true,
  process:result.process??null,native:n?{...pick(n,['schema','status','recordSha256','reviewSha256','createdAt',
   'files','bytes','reused','originalStateRetained','executionStarted','publicationSyncError','restoreMode','walletEnvironmentExported']),
   session:pick(n.objectSession,['sessionId','definitionSha256','configurationsSha256','configurationSha256','bytes','chunkCount',
    'expectedSnapshot','expectedSha256','limits']),
   absentLedger:n.absentLedger?.state,checkpoint:checkpoint(n.checkpoint),current:checkpoint(n.current),
   nativeReopenErrors:(n.nativeReopenErrors??[]).map(e=>({code:e.code})),
   cleanupErrors:(n.cleanupErrors??[]).map(e=>({code:e.code})),
   leaseReleaseErrors:(n.leaseReleaseErrors??[]).map(e=>({code:e.code}))}:null};
}
function compactProfile(record){
 return {name:record.profile.name,label:record.profile.label,sha256:record.profileSha256,kinds:record.profile.kinds,
  session:pick(record.selection,['sessionId','configurationSha256','definitionSha256','configurationsSha256','bytes','chunkCount']),
  registeredAt:record.registeredAt,passphraseSource:'HOST_ENVIRONMENT',restoreMode:'ORIGINAL_CANONICAL_STATE_ROOT'};
}

/**
 * Host registration supplies canonical paths and the environment variable NAME.
 * Tool calls only select a retained alias/hash and original operation inputs.
 * This module does not acquire data, create a buyer/ledger, remove source state,
 * or start a restored session. All capture/restore effects belong to SF88/SF101.
 */
export function createNativeObjectRecovery({manifest,currentWorkspace,runOwned,isClosed=()=>false,
 environment=process.env}={}){
 need(object(manifest)&&typeof currentWorkspace==='function'&&typeof runOwned==='function',
  'MCP_OBJECT_RECOVERY_NATIVE_WORKSPACE_REQUIRED');
 const host=absolute(manifest.directory),buyer=absolute(manifest.workspace);
 const root=join(host,'object-recovery'),profiles=join(root,'profiles'),requests=join(root,'requests'),reviews=join(root,'reviews');
 const runtimeDirectory=fileURLToPath(new URL('../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/',import.meta.url));
 const recovery=new ObjectSessionRecovery({runtimeDirectory,node:process.execPath,environment});
 const shutdown=new AbortController(),pending=new Set(),active=new Map();let closed=false;
 function available(){need(!closed&&!isClosed(),'MCP_NATIVE_WORKSPACE_CLOSING');}
 function tracked(task){pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;}
 async function setup(){
  await privateDirectory(host);await privateDirectory(root,{create:true});
  for(const dir of [profiles,requests,reviews])await privateDirectory(dir,{create:true});
 }
 async function owner(task,signal){
  available();const current=await currentWorkspace();await setup();
  const lease=await acquireInitialization(root,{python:current.config.operator.python,resume:true});
  const assert=async()=>{
   available();signal?.throwIfAborted();
   const now=await privateDirectory(root);
   need(now.dev===lease.identity.dev&&now.ino===lease.identity.ino,'MCP_OBJECT_RECOVERY_OWNER_CHANGED');
  };
  try{await assert();const value=await task(assert);await assert();return value;}finally{await lease.close();}
 }
 function normalize(value){
  fields(value,['schema','name','label','directory','stateRoot','include','bundle','passphraseEnv','kinds','expectedRecordSha256']);
  need(value.schema===PROFILE,'MCP_OBJECT_RECOVERY_PROFILE_INVALID');
  const p={schema:PROFILE,name:alias(value.name),label:value.label??'',directory:absolute(value.directory),
   stateRoot:absolute(value.stateRoot),include:value.include??[],bundle:absolute(value.bundle),
   passphraseEnv:value.passphraseEnv??'SF88_BACKUP_PASSPHRASE',kinds:value.kinds};
  need(typeof p.label==='string'&&p.label.length<=240&&Array.isArray(p.include)&&p.include.length<=64&&
   p.include.every(v=>absolute(v)===v)&&new Set(p.include).size===p.include.length,'MCP_OBJECT_RECOVERY_PROFILE_INVALID');
  need(inside(p.stateRoot,p.directory)&&p.stateRoot!==p.directory&&p.include.every(v=>inside(p.stateRoot,v)),
   'MCP_OBJECT_RECOVERY_SOURCE_OUTSIDE_ROOT');
  need(!inside(p.stateRoot,host)&&!inside(host,p.stateRoot)&&!inside(p.stateRoot,buyer)&&!inside(buyer,p.stateRoot)&&
   !inside(p.stateRoot,p.bundle)&&!inside(p.bundle,p.stateRoot)&&!inside(host,p.bundle)&&!inside(p.bundle,host),
   'MCP_OBJECT_RECOVERY_CONTROL_OVERLAP');
  need(typeof p.passphraseEnv==='string'&&/^[A-Z][A-Z0-9_]{4,63}$/.test(p.passphraseEnv),
   'MCP_OBJECT_RECOVERY_PASSPHRASE_NAME_INVALID');
  need(Array.isArray(p.kinds)&&p.kinds.length>0&&p.kinds.length<=3&&new Set(p.kinds).size===p.kinds.length&&
   p.kinds.every(k=>KINDS.includes(k)),'MCP_OBJECT_RECOVERY_PROFILE_KINDS_REQUIRED');
  p.include=[...p.include].sort();p.kinds=[...p.kinds].sort();
  if(value.expectedRecordSha256!==undefined)p.expectedRecordSha256=hash(value.expectedRecordSha256);
  need(p.kinds.includes('snapshot')||p.expectedRecordSha256,'MCP_OBJECT_RECOVERY_RECEIVED_RECORD_REQUIRED');
  return p;
 }
 async function readProfile(name,expected){
  const record=await json(join(profiles,sha(alias(name))+'.json'));
  need(record.schema===SCHEMA&&record.profile.name===name&&same(normalize(record.profile),record.profile)&&
   sha(encoded(record.profile))===record.profileSha256&&HASH.test(record.registrationResultSha256??''),
   'MCP_OBJECT_RECOVERY_PROFILE_CHANGED');
  const result=await json(join(reviews,record.registrationResultSha256+'.registration.json'));
  need(sha(encoded(result))===record.registrationResultSha256&&same(selection(result.native),record.selection)&&
   result.native.directory===record.profile.directory&&result.native.stateRoot===record.profile.stateRoot,
   'MCP_OBJECT_RECOVERY_PROFILE_CHANGED');
  if(expected!==undefined)need(record.profileSha256===hash(expected),'MCP_OBJECT_RECOVERY_PROFILE_CHANGED');
  return record;
 }
 function checkedNative(record,result){
  need(result?.native?.stateRoot===record.profile.stateRoot&&result.native.directory===record.profile.directory&&
   same(selection(result.native),record.selection),'MCP_OBJECT_RECOVERY_SOURCE_CHANGED');
  return result;
 }
 const archive=(p,expected)=>({bundle:p.bundle,passphraseEnv:p.passphraseEnv,expectedRecordSha256:expected??p.expectedRecordSha256});
 async function register(value){
  return tracked(owner(async assert=>{
   const p=normalize(value),profileSha256=sha(encoded(p)),path=join(profiles,sha(p.name)+'.json');
   const existing=await json(path,true);
   if(existing){const saved=await readProfile(p.name,profileSha256);return {...compactProfile(saved),status:'REGISTERED',reused:true};}
   need(await realpath(dirname(p.bundle))===dirname(p.bundle),'MCP_OBJECT_RECOVERY_BUNDLE_PARENT_CHANGED');
   const result=p.kinds.includes('snapshot')?await recovery.inspect({directory:p.directory,stateRoot:p.stateRoot,include:p.include,signal:shutdown.signal}):
    await recovery.verify({...archive(p),signal:shutdown.signal});
   need(result.ok,'MCP_OBJECT_RECOVERY_REGISTRATION_NOT_VERIFIED');
   const selected=selection(result.native);
   need(result.native.stateRoot===p.stateRoot&&result.native.directory===p.directory,'MCP_OBJECT_RECOVERY_SOURCE_CHANGED');
   await assert();
   const resultId=sha(encoded(result));
   await retain(join(reviews,resultId+'.registration.json'),result,{resume:true});
   const record={schema:SCHEMA,profile:p,profileSha256,selection:selected,
    registrationResultSha256:resultId,registeredAt:new Date().toISOString()};
   await retain(path,record);
   return {...compactProfile(record),status:'REGISTERED'};
  },shutdown.signal));
 }
 function requestPath(id){return join(requests,uuid(id)+'.request.json');}
 async function readRequest(id,record){
  const request=await json(requestPath(id));
  need(request.schema===SCHEMA&&request.requestId===id&&KINDS.includes(request.kind)&&
   request.profile===record.profile.name&&request.profileSha256===record.profileSha256&&
   sha(encoded(request.input))===request.inputSha256,'MCP_OBJECT_RECOVERY_REQUEST_CHANGED');
  return {request,requestSha256:sha(encoded(request))};
 }
 async function attempts(id){
  const rows=[];
  for(const name of (await readdir(requests)).filter(n=>n.startsWith(id+'.attempt-')&&n.endsWith('.json')&&!n.endsWith('.result.json')).sort()){
   const row=await json(join(requests,name));
   need(row.schema===SCHEMA&&row.requestId===id&&UUID.test(row.attemptId??''),'MCP_OBJECT_RECOVERY_ATTEMPT_CHANGED');
   const result=await json(join(requests,id+'.attempt-'+row.attemptId+'.result.json'),true);
   if(result)need(result.requestId===id&&result.attemptId===row.attemptId&&result.requestSha256===row.requestSha256,
    'MCP_OBJECT_RECOVERY_ATTEMPT_CHANGED');
   rows.push({attempt:row,result});
  }
  rows.sort((a,b)=>a.attempt.sequence-b.attempt.sequence);
  need(rows.every((v,i)=>v.attempt.sequence===i+1),'MCP_OBJECT_RECOVERY_ATTEMPT_SEQUENCE_CHANGED');
  return rows;
 }
 async function view(id,record,args={}){
  const saved=await readRequest(id,record),rows=await attempts(id),last=rows.at(-1);
  need(rows.every(v=>v.attempt.requestSha256===saved.requestSha256),'MCP_OBJECT_RECOVERY_REQUEST_CHANGED');
  const state=!last?'PREPARED':!last.result?'RECONCILIATION_REQUIRED':
   last.result.result?.ok&&!last.result.error?'COMPLETED':last.result.result?.completionReported?'PUBLISHED_WITH_ERRORS':'RECONCILIATION_REQUIRED';
  const selected=page(rows,args);
  return {schema:SCHEMA,requestId:id,requestSha256:saved.requestSha256,profile:record.profile.name,profileSha256:record.profileSha256,
   kind:saved.request.kind,input:saved.request.input,state,active:active.has(id),createdAt:saved.request.createdAt,
   lastAttemptId:last?.attempt.attemptId??null,
   attempts:selected.items.map(v=>({attemptId:v.attempt.attemptId,sequence:v.attempt.sequence,startedAt:v.attempt.startedAt,
    completedAt:v.result?.completedAt??null,error:v.result?.error??null,result:publicResult(v.result?.result)})),
   offset:selected.offset,totalAttempts:selected.total,nextOffset:selected.nextOffset,retry:'EXPLICIT_SAME_REQUEST_CONTINUATION'};
 }
 function inputFor(kind,input,record){
  const keys=kind==='snapshot'?['expectedReviewSha256','quiesced']:['expectedRecordSha256'];
  fields(input,keys);
  if(kind==='snapshot'){
   need(input.quiesced===true,'MCP_OBJECT_RECOVERY_QUIESCED_SOURCE_REQUIRED');
   hash(input.expectedReviewSha256);
  }else hash(input.expectedRecordSha256);
  if(record.profile.expectedRecordSha256&&kind!=='snapshot')
   need(input.expectedRecordSha256===record.profile.expectedRecordSha256,'MCP_OBJECT_RECOVERY_RECORD_CHANGED');
  return structuredClone(input);
 }
 async function execute(record,saved,rows,signal,assert){
  const {request,requestSha256}=saved,p=record.profile,attemptId=randomUUID();
  const attempt={schema:SCHEMA,requestId:request.requestId,requestSha256,attemptId,sequence:rows.length+1,startedAt:new Date().toISOString()};
  await retain(join(requests,request.requestId+'.attempt-'+attemptId+'.json'),attempt);
  let result=null,error=null;
  try{
   await assert();signal.throwIfAborted();
   if(request.kind==='snapshot'){
    // The original engine recognizes the exact published bundle on continuation.
    result=await recovery.snapshot({directory:p.directory,stateRoot:p.stateRoot,include:p.include,output:p.bundle,
     passphraseEnv:p.passphraseEnv,...request.input,signal});
   }else{
    // Verify full native selection BEFORE any original restore is dispatched.
    const verified=await recovery.verify({...archive(p,request.input.expectedRecordSha256),signal});
    checkedNative(record,verified);
    result=request.kind==='verify'?verified:await recovery.restore({...archive(p,request.input.expectedRecordSha256),signal});
   }
   checkedNative(record,result);
  }catch(problem){error={code:code(problem)};result=problem?.result??result;}
  const returned={schema:SCHEMA,requestId:request.requestId,requestSha256,attemptId,completedAt:new Date().toISOString(),result,error};
  // Save returned publication and process facts before emitting any response.
  await retain(join(requests,request.requestId+'.attempt-'+attemptId+'.result.json'),returned);
  return view(request.requestId,record);
 }
 async function invoke(args,context={}){
  available();fields(args,['action','objectRecoveryOperation','objectRecoveryProfile','objectRecoveryProfileSha256',
   'objectRecoveryRequestId','objectRecoveryInput','offset','limit']);
  need(args.action==='object-recovery'&&nativeObjectRecoveryOperations.includes(args.objectRecoveryOperation),
   'MCP_OBJECT_RECOVERY_ARGUMENTS_INVALID');
  const op=args.objectRecoveryOperation;
  const common=['action','objectRecoveryOperation'];
  const profileFields=['objectRecoveryProfile','objectRecoveryProfileSha256'];
  const permitted=op==='profiles'?[...common,'offset','limit']:
   ['inspect','history'].includes(op)?[...common,...profileFields,'offset','limit']:
   op==='show'?[...common,...profileFields,'objectRecoveryRequestId','offset','limit']:
   op==='cancel'?[...common,...profileFields,'objectRecoveryRequestId']:
   [...common,...profileFields,'objectRecoveryRequestId','objectRecoveryInput'];
  fields(args,permitted);
  need(context.signal===undefined||context.signal instanceof AbortSignal,'MCP_OBJECT_RECOVERY_ARGUMENTS_INVALID');
  if(op==='cancel'){
   const record=await readProfile(args.objectRecoveryProfile,args.objectRecoveryProfileSha256);
   await readRequest(uuid(args.objectRecoveryRequestId),record);
   const entry=active.get(args.objectRecoveryRequestId);
   if(entry){entry.controller.abort();await entry.promise.catch(()=>{});}
   return {...await view(args.objectRecoveryRequestId,record,args),cancelRequested:!!entry,
    cancellationScope:'THIS_HOST_OWNED_COMMAND_ONLY'};
  }
  const key=op==='profiles'?'profiles':alias(args.objectRecoveryProfile);
  const controller=new AbortController();let signal=AbortSignal.any([shutdown.signal,controller.signal,...(context.signal?[context.signal]:[])]);
  const id=['snapshot','verify','restore','show','continue'].includes(op)?uuid(args.objectRecoveryRequestId):null;
  const task=runOwned('object-recovery:'+key,sha(encoded(args)),{signal},ownedSignal=>{signal=ownedSignal;return owner(async assert=>{
   if(op==='profiles'){
    need(Object.keys(args).every(k=>['action','objectRecoveryOperation','offset','limit'].includes(k)),
     'MCP_OBJECT_RECOVERY_ARGUMENTS_INVALID');
    const found=[];
    for(const name of (await readdir(profiles)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort()){
     const record=await json(join(profiles,name));found.push(compactProfile(await readProfile(record.profile.name)));
    }
    const result=page(found,args);return {schema:SCHEMA,profiles:result.items,...pick(result,['offset','total','nextOffset'])};
   }
   const record=await readProfile(key,hash(args.objectRecoveryProfileSha256));
   if(op==='inspect'){
    need(args.objectRecoveryInput===undefined&&args.objectRecoveryRequestId===undefined,'MCP_OBJECT_RECOVERY_ARGUMENTS_INVALID');
    const result=checkedNative(record,await recovery.inspect({directory:record.profile.directory,stateRoot:record.profile.stateRoot,
     include:record.profile.include,signal}));
    const review={schema:SCHEMA,profile:key,profileSha256:record.profileSha256,result};
    await retain(join(reviews,result.native.reviewSha256+'.json'),review,{resume:true});
    const files=page(result.native.sourceFiles,args);
    return {schema:SCHEMA,profile:key,profileSha256:record.profileSha256,result:publicResult(result),
     files:files.items,totalFiles:files.total,offset:files.offset,nextOffset:files.nextOffset};
   }
   if(op==='history'){
    const all=[];
    for(const name of (await readdir(requests)).filter(n=>n.endsWith('.request.json')).sort()){
     const request=await json(join(requests,name));
     if(request.profile===key&&request.profileSha256===record.profileSha256)all.push(request.requestId);
    }
    const p=page(all,args),records=[];
    for(const selected of p.items)records.push(await view(selected,record,{limit:1}));
    return {schema:SCHEMA,profile:key,records,offset:p.offset,total:p.total,nextOffset:p.nextOffset};
   }
   if(op==='show')return view(id,record,args);
   if(op==='continue'){
    fields(args.objectRecoveryInput,['expectedRequestSha256','afterAttempt']);
    const saved=await readRequest(id,record),rows=await attempts(id),last=rows.at(-1);
    need(saved.requestSha256===hash(args.objectRecoveryInput.expectedRequestSha256),'MCP_OBJECT_RECOVERY_REQUEST_CHANGED');
    need(args.objectRecoveryInput.afterAttempt===null||UUID.test(args.objectRecoveryInput.afterAttempt??''),'MCP_OBJECT_RECOVERY_ATTEMPT_REQUIRED');
    if(!last){need(args.objectRecoveryInput.afterAttempt===null,'MCP_OBJECT_RECOVERY_ATTEMPT_CHANGED');return execute(record,saved,[],signal,assert);}
    if(last.attempt.attemptId!==args.objectRecoveryInput.afterAttempt){
     need(rows.some(v=>v.attempt.attemptId===args.objectRecoveryInput.afterAttempt),'MCP_OBJECT_RECOVERY_ATTEMPT_CHANGED');
     return {...await view(id,record,args),continuationAlreadyRecorded:true};
    }
    if(last.result?.result?.ok&&!last.result.error)return view(id,record,args);
    need(record.profile.kinds.includes(saved.request.kind),'MCP_OBJECT_RECOVERY_OPERATION_NOT_REGISTERED');
    return execute(record,saved,rows,signal,assert);
   }
   need(record.profile.kinds.includes(op),'MCP_OBJECT_RECOVERY_OPERATION_NOT_REGISTERED');
   const input=inputFor(op,args.objectRecoveryInput,record),existing=await json(requestPath(id),true);
   if(existing){
    const saved=await readRequest(id,record);
    need(saved.request.kind===op&&same(saved.request.input,input),'MCP_OBJECT_RECOVERY_REQUEST_CHANGED');
    return view(id,record,args);
   }
   if(op==='snapshot'){
    const review=await json(join(reviews,input.expectedReviewSha256+'.json'));
    need(review.profile===key&&review.profileSha256===record.profileSha256&&
     review.result?.native?.reviewSha256===input.expectedReviewSha256,'MCP_OBJECT_RECOVERY_REVIEW_REQUIRED');
    checkedNative(record,review.result);
   }
   const request={schema:SCHEMA,requestId:id,profile:key,profileSha256:record.profileSha256,kind:op,input,
    inputSha256:sha(encoded(input)),createdAt:new Date().toISOString()};
   await retain(requestPath(id),request); // Flat durable request: no orphan operation directory.
   return execute(record,{request,requestSha256:sha(encoded(request))},[],signal,assert);
  },signal);});
  if(id&&['snapshot','verify','restore','continue'].includes(op)&&!active.has(id)){
   const entry={controller,promise:task};active.set(id,entry);
   task.finally(()=>{if(active.get(id)===entry)active.delete(id);}).catch(()=>{});
  }
  return task;
 }
 return {register,call:(args,context)=>tracked(invoke(args,context)),
  async close(){if(closed)return;closed=true;shutdown.abort();await Promise.allSettled([...pending]);}};
}
