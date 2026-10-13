// MIT. One durable receiving journal; no payment, API request or customer queue.
import {randomUUID} from 'node:crypto';
import {open,readdir,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {acquireStateLease} from '../../../merchant-fleet-gateway/state-lease.mjs';
import {initializationDirectory,retainInitializationRecord,syncInitializationDirectory} from '../../../sf88-operator-buyer-cli/initialization.mjs';
import {recoverySource,inspectApiPassRecovery,snapshotApiPassRecovery,verifyApiPassRecovery,restoreApiPassRecovery,reconcileApiPassRestore,restoredApiPassLaunch,apiPassEncryptedFiles} from './recovery.mjs';
import {absolute,inside,need,HASH,UUID,same,sha,canonical,codeOf,file,jsonFile,present,optionalJson} from './recovery-files.mjs';

export const API_PASS_RECOVERY_OPERATION_SCHEMA='stellar-forge.sf101.api-customer-recovery-operation.v1';
const SCHEMA=API_PASS_RECOVERY_OPERATION_SCHEMA,PASS=/^[A-Z][A-Z0-9_]{4,63}$/;
const STATES=new Set(['COMPLETED','FAILED','CANCELLED']);
function choose(kind,value){
 need(['SNAPSHOT','VERIFY','RESTORE'].includes(kind)&&value&&typeof value==='object'&&!Array.isArray(value),'API_RECOVERY_REQUEST_INVALID');
 const keys=kind==='SNAPSHOT'?['output','expectedReviewSha256','passEnv','quiesced']:kind==='VERIFY'?['bundle','passEnv','python']:['verifiedRequestId','expectedStateRoot','passEnv','python'];
 need(Object.keys(value).every(k=>keys.includes(k)),'API_RECOVERY_REQUEST_INVALID');
 const out={passEnv:value.passEnv??'SF88_BACKUP_PASSPHRASE'};need(PASS.test(out.passEnv),'API_RECOVERY_PASSPHRASE_NAME_INVALID');
 if(kind==='SNAPSHOT'){
  need(value.quiesced===true&&HASH.test(value.expectedReviewSha256??''),'API_RECOVERY_REVIEW_REQUIRED');
  Object.assign(out,{output:absolute(value.output),expectedReviewSha256:value.expectedReviewSha256,quiesced:true});
 }else{
  out.python=value.python??'/usr/bin/python3';absolute(out.python);
  if(kind==='VERIFY')out.bundle=absolute(value.bundle);
  else{need(UUID.test(value.verifiedRequestId??''),'API_RECOVERY_VERIFIED_REQUEST_REQUIRED');out.verifiedRequestId=value.verifiedRequestId;out.expectedStateRoot=absolute(value.expectedStateRoot);}
 }
 return out;
}
const selected=request=>sha(canonical({kind:request.kind,options:request.options,source:request.source??null}));
const publicSummary=(request,result,active)=>({schema:SCHEMA,requestId:request.requestId,kind:request.kind,options:request.options,createdAt:request.createdAt,
 state:active?.state??result?.state??'UNFINISHED',result:result?.result??active?.native?.result??null,error:result?.error??active?.error??null,
 progress:active?.progress??[],persistenceError:active?.persistenceError??null,completedAt:result?.completedAt??null,executionStarted:false});

/** The OS lease covers the entire journal lifetime, including background returns. */
export async function openApiPassRecovery({directory,source,environment=process.env}={}){
 directory=absolute(directory);source=source===undefined?null:recoverySource(source);
 if(source)need(!inside(source.stateRoot,directory)&&!inside(directory,source.stateRoot),'API_RECOVERY_JOURNAL_OVERLAPS_SOURCE');
 await initializationDirectory(directory,{create:true});
 const lease=await acquireStateLease(directory),operations=join(directory,'operations');
 let active=null,closing=false,closed=false,admitting=false,admission=null,closePromise;
 const memory=new Map(),readCache=new Map();let journalId;
 try{
  await initializationDirectory(operations,{create:true});
  const metadata=await optionalJson(join(directory,'recovery.json'),65536);
  if(metadata){need(metadata.schema===SCHEMA&&metadata.directory===directory&&same(metadata.source,source)&&UUID.test(metadata.journalId??''),'API_RECOVERY_JOURNAL_CHANGED');journalId=metadata.journalId;}
  else{journalId=randomUUID();await retainInitializationRecord(join(directory,'recovery.json'),{schema:SCHEMA,journalId,directory,source});}
 }catch(e){await lease.close();throw e;}
 function checkOpen(){need(!closing&&!closed,'API_RECOVERY_CLOSING');lease.assertHeld();}
 function pathFor(id){need(UUID.test(id??''),'API_RECOVERY_REQUEST_ID_REQUIRED');return join(operations,id);}
 async function retained(id){
  const path=pathFor(id),request=await optionalJson(join(path,'request.json'),65536);
  need(request&&request.schema===SCHEMA&&request.requestId===id&&same(request.options,choose(request.kind,request.options))&&request.selection===selected(request)&&same(request.source,source),'API_RECOVERY_REQUEST_CHANGED');
  const result=await optionalJson(join(path,'result.json'));
  need(!result||result.schema===SCHEMA&&result.requestId===id&&result.selection===request.selection&&STATES.has(result.state),'API_RECOVERY_RESULT_CHANGED');
  const native=await optionalJson(join(path,'native-return.json'));
  need(!native||native.schema===SCHEMA&&native.requestId===id&&native.selection===request.selection&&native.state==='RETURNED'&&native.result,'API_RECOVERY_NATIVE_RETURN_CHANGED');
  const pending=await optionalJson(join(path,'dispatch.json'),65536);
  need(!pending||pending.schema===SCHEMA&&pending.requestId===id&&pending.selection===request.selection,'API_RECOVERY_DISPATCH_CHANGED');
  return {path,request,result,native,pending};
 }
 async function inspect(id){const r=await retained(id);return publicSummary(r.request,r.result,active?.requestId===id?active:memory.get(id));}
 async function list({offset=0,limit=50}={}){
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'API_RECOVERY_PAGE_INVALID');
  const entries=await readdir(operations,{withFileTypes:true}),rows=[];
  for(const e of entries)if(UUID.test(e.name)){
   need(e.isDirectory()&&!e.isSymbolicLink(),'API_RECOVERY_JOURNAL_CHANGED');
   const r=await optionalJson(join(operations,e.name,'request.json'),65536);if(r)rows.push({id:e.name,createdAt:r.createdAt});
  }
  rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const items=[];for(const r of rows.slice(offset,offset+limit)){const v=await inspect(r.id),result=v.result;items.push({...v,result:result?{status:result.status,recordSha256:result.recordSha256,workspaceId:result.application?.profile?.workspaceId,revision:result.application?.profile?.revision,bundle:result.bundle,encryptedFileCount:result.encryptedFiles?.length,executionStarted:false}:null});}
  return {schema:SCHEMA,directory,sourceConfigured:!!source,offset,limit,total:rows.length,nextOffset:offset+items.length<rows.length?offset+items.length:null,items,activeRequestId:active?.requestId??null};
 }
 async function review(){checkOpen();need(!active&&!admitting,'API_RECOVERY_BUSY');need(source,'API_RECOVERY_SOURCE_NOT_CONFIGURED');return inspectApiPassRecovery(source);}
 async function restoreOptions(request){
  const prior=await retained(request.options.verifiedRequestId),result=prior.result?.result;
  need(prior.request.kind==='VERIFY'&&prior.result?.state==='COMPLETED'&&HASH.test(result?.recordSha256??'')&&Array.isArray(result.encryptedFiles),'API_RECOVERY_VERIFIED_REQUEST_REQUIRED');
  need(result.application.profile.stateRoot===request.options.expectedStateRoot,'API_RECOVERY_TARGET_CHANGED');
  return {bundle:result.bundle,expected:result.recordSha256,expectedStateRoot:request.options.expectedStateRoot,receivingDirectory:directory,
   passEnv:request.options.passEnv,python:request.options.python,expectedFiles:result.encryptedFiles};
 }
 async function persistOutcome(saved,running){
  // The exact native return is published before a terminal application result.
  if(running.native)await retainInitializationRecord(join(saved.path,'native-return.json'),running.native,{resume:true});
  if(!running.terminal){
   running.terminal={schema:SCHEMA,requestId:saved.request.requestId,selection:saved.request.selection,state:running.native?'COMPLETED':running.state,
    completedAt:new Date().toISOString(),result:running.native?.result??null,error:running.native?null:running.error};
  }
  await retainInitializationRecord(join(saved.path,'result.json'),running.terminal,{resume:true});
  await syncInitializationDirectory(saved.path);
  running.persistenceError=null;running.state=running.terminal.state;return publicSummary(saved.request,running.terminal,running);
 }
 async function launch(saved){
  const {request,path}=saved,controller=new AbortController();
  const running=memory.get(request.requestId)??{requestId:request.requestId,state:'RUNNING',progress:[],native:saved.native,terminal:null,error:null,persistenceError:null};
  Object.assign(running,{controller,state:'RUNNING',error:null});active=running;memory.set(request.requestId,running);
  running.completion=(async()=>{
   try{
    if(!running.native&&!running.terminal){
     await retainInitializationRecord(join(path,'dispatch.json'),{schema:SCHEMA,requestId:request.requestId,selection:request.selection,dispatchedAt:new Date().toISOString()},{resume:true,ignore:['dispatchedAt']});
     const context={environment,signal:controller.signal,onProgress:v=>{running.progress.push({observedAt:new Date().toISOString(),...v});if(running.progress.length>64)running.progress.shift();}};
     let result;
     if(request.kind==='SNAPSHOT'){
      need(source,'API_RECOVERY_SOURCE_NOT_CONFIGURED');
      if(await present(request.options.output)){
       need(saved.pending,'API_RECOVERY_OUTPUT_ALREADY_EXISTS');
       result=await verifyApiPassRecovery({bundle:request.options.output,passEnv:request.options.passEnv},context);
       need(result.application.operationId===request.requestId&&result.application.profile.reviewSha256===request.options.expectedReviewSha256,'API_RECOVERY_OUTPUT_BINDING_CHANGED');
       result={...result,status:'API_CUSTOMER_CAPTURE_PUBLICATION_RECOVERED',publicationRecovered:true};
      }else result=await snapshotApiPassRecovery({source,...request.options,operationId:request.requestId},context);
     }else if(request.kind==='VERIFY')result=await verifyApiPassRecovery(request.options,context);
     else{
      const options=await restoreOptions(request);
      await apiPassEncryptedFiles(options.bundle,{expectedRecordSha256:options.expected,expectedFiles:options.expectedFiles});
      const target=await present(options.expectedStateRoot);
      if(target&&(await readdir(options.expectedStateRoot)).length){
       need(saved.pending,'API_RECOVERY_TARGET_NOT_EMPTY');
       result=await reconcileApiPassRestore(options,context);
      }else result=await restoreApiPassRecovery(options,context);
     }
     running.native={schema:SCHEMA,requestId:request.requestId,selection:request.selection,state:'RETURNED',returnedAt:new Date().toISOString(),result};
    }
    return await persistOutcome(saved,running);
   }catch(e){
    if(running.native||running.terminal){
     running.state='RETURN_PENDING';running.persistenceError=codeOf(e);
     return publicSummary(request,null,running);
    }
    // A failed archive operation may have published before its response failed.
    // Keep an unfinished dispatch; explicit resume reconciles its destination.
    running.error={code:codeOf(e)};running.state=controller.signal.aborted?'CANCELLED':'FAILED';
    running.terminal={schema:SCHEMA,requestId:request.requestId,selection:request.selection,state:running.state,completedAt:new Date().toISOString(),result:null,error:running.error};
    try{await retainInitializationRecord(join(path,'attempt-error-'+randomUUID()+'.json'),running.terminal);}
    catch(writeError){running.persistenceError=codeOf(writeError);}
    // Error history is terminal for this attempt, not permission to replace the
    // original immutable request. resume() uses the exact request and dispatch.
    running.terminal=null;return publicSummary(request,null,running);
   }finally{if(active===running)active=null;if(running.terminal?.state==='COMPLETED'&&!running.persistenceError)memory.delete(request.requestId);}
  })();
  return publicSummary(request,null,running);
 }
 async function admit(operation){
  checkOpen();need(!active&&!admitting,'API_RECOVERY_BUSY');admitting=true;
  let done;admission=new Promise(r=>{done=r;});
  try{return await operation();}finally{admitting=false;done();admission=null;}
 }
 async function start({requestId=randomUUID(),kind,options}={}){
  const chosen=choose(kind,options),path=pathFor(requestId);
  checkOpen();
  if(await present(join(path,'request.json'))){
   const saved=await retained(requestId);need(saved.request.kind===kind&&same(saved.request.options,chosen),'API_RECOVERY_REQUEST_REUSED');
   return {...publicSummary(saved.request,saved.result,active?.requestId===requestId?active:memory.get(requestId)),reused:true};
  }
  return admit(async()=>{
   const before=await optionalJson(join(path,'request.json'),65536);
   if(before){const saved=await retained(requestId);need(saved.request.kind===kind&&same(saved.request.options,chosen),'API_RECOVERY_REQUEST_REUSED');return {...publicSummary(saved.request,saved.result,memory.get(requestId)),reused:true};}
   if(kind==='SNAPSHOT')need(source,'API_RECOVERY_SOURCE_NOT_CONFIGURED');
   const request={schema:SCHEMA,requestId,kind,options:chosen,source,createdAt:new Date().toISOString()};request.selection=selected(request);
   if(kind==='RESTORE'){
    const selected=await restoreOptions(request),target=await present(selected.expectedStateRoot);
    need(!target||target.isDirectory()&&!target.isSymbolicLink()&&(await readdir(selected.expectedStateRoot)).length===0,'API_RECOVERY_TARGET_NOT_EMPTY');
   }
   if(kind==='SNAPSHOT')need(!inside(source.stateRoot,chosen.output)&&!inside(chosen.output,source.stateRoot)&&!inside(directory,chosen.output)&&!inside(chosen.output,directory),'API_RECOVERY_OUTPUT_OVERLAPS_STATE');
   await initializationDirectory(path,{create:true});await retainInitializationRecord(join(path,'request.json'),request);
   return launch({path,request,result:null,native:null,pending:null});
  });
 }
 async function resume(requestId){
  checkOpen();if(active?.requestId===requestId)return {...await inspect(requestId),reused:true};
  return admit(async()=>{
   const saved=await retained(requestId);
   if(saved.result){const held=memory.get(requestId);if(held?.native&&held.persistenceError)return persistOutcome(saved,held);return {...publicSummary(saved.request,saved.result,null),reused:true};}
   return launch(saved);
  });
 }
 async function wait(requestId){const p=active?.requestId===requestId?active.completion:null;return p?await p:inspect(requestId);}
 async function cancel(requestId){checkOpen();need(active?.requestId===requestId,'API_RECOVERY_NOT_ACTIVE');active.state='CANCELLING';active.controller.abort();return inspect(requestId);}
 async function openResult(requestId){
  checkOpen();const saved=await retained(requestId);
  need(saved.request.kind==='RESTORE'&&saved.result?.state==='COMPLETED','API_RECOVERY_COMPLETED_RESTORE_REQUIRED');
  return restoredApiPassLaunch(saved.result.result);
 }
 async function encryptedFiles(requestId){
  const saved=await retained(requestId);need(saved.result?.state==='COMPLETED'&&saved.result.result?.encryptedFiles,'API_RECOVERY_COMPLETE_BUNDLE_REQUIRED');
  const result=saved.result.result;return {requestId,recordSha256:result.recordSha256,bundle:result.bundle,
   files:await apiPassEncryptedFiles(result.bundle,{expectedRecordSha256:result.recordSha256,expectedFiles:result.encryptedFiles})};
 }
 async function readEncryptedFile(requestId,{name,offset=0,limit=262144}={}){
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=1048576,'API_RECOVERY_FILE_PAGE_INVALID');
  const saved=await retained(requestId),result=saved.result?.result;
  need(saved.result?.state==='COMPLETED'&&Array.isArray(result?.encryptedFiles),'API_RECOVERY_COMPLETE_BUNDLE_REQUIRED');
  need(name==='manifest.json'||/^objects\/[0-9]{6}\.gcm$/.test(name??''),'API_RECOVERY_ENCRYPTED_FILE_NOT_FOUND');
  const item=result.encryptedFiles.find(x=>x.name===name);
  need(item&&item.path===join(result.bundle,name)&&HASH.test(item.sha256??''),'API_RECOVERY_ENCRYPTED_FILE_NOT_FOUND');
  need(offset<=item.bytes&&await realpath(item.path)===item.path,'API_RECOVERY_FILE_OFFSET_INVALID');
  const f=await open(item.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stamp=st=>Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,st[k].toString()]));
  try{
   const a=await f.stat({bigint:true}),st=await f.stat();
   need(st.isFile()&&st.nlink===1&&st.uid===process.getuid()&&!(st.mode&0o077)&&st.size===item.bytes,'API_RECOVERY_PRIVATE_FILE_REQUIRED');
   const observed=stamp(a),cacheKey=requestId+'\n'+name,prior=readCache.get(cacheKey);
   if(!prior||!same(prior.stamp,observed)||prior.sha256!==item.sha256){
    const verified=await file(item.path,{maximum:2*1024**3+64,withStamp:true});
    need(verified.bytes===item.bytes&&verified.sha256===item.sha256&&same(verified.stamp,observed),'API_RECOVERY_ENCRYPTED_FILE_CHANGED');
    readCache.set(cacheKey,{stamp:observed,sha256:item.sha256});
   }
   const bytes=Buffer.alloc(Math.min(limit,item.bytes-offset));let n=0;
   while(n<bytes.length){const r=await f.read(bytes,n,bytes.length-n,offset+n);need(r.bytesRead>0,'API_RECOVERY_ENCRYPTED_FILE_CHANGED');n+=r.bytesRead;}
   const b=await f.stat({bigint:true}),named=await lstat(item.path,{bigint:true});
   need(same(observed,stamp(b))&&same(observed,stamp(named)),'API_RECOVERY_ENCRYPTED_FILE_CHANGED');
   return {requestId,name,offset,bytes:n,totalBytes:item.bytes,sha256:item.sha256,chunkSha256:sha(bytes),base64:bytes.toString('base64'),nextOffset:offset+n<item.bytes?offset+n:null,recordSha256:result.recordSha256};
  }finally{await f.close();}
 }
 return {directory,source,journalId,review,start,resume,inspect,list,wait,cancel,openResult,encryptedFiles,readEncryptedFile,
  get busy(){return !!active||admitting;},
  close(){
   if(closed)return Promise.resolve();if(closePromise)return closePromise;closing=true;
   closePromise=(async()=>{await admission;if(active){active.controller.abort();await active.completion;}
    // A known return remains in memory until it is durably acknowledged.
    for(const [id,r]of memory)if(r.native&&r.persistenceError)await persistOutcome(await retained(id),r);
    await lease.close();closed=true;
   })().catch(e=>{closePromise=null;throw e;});return closePromise;
  }};
}
