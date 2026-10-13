// SPDX-License-Identifier: MIT
// SF101 selected recovery request -> original SF74 saved case and whole source package.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir} from 'node:fs/promises';
import {join,dirname,isAbsolute,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {openCaseStore,retainCaseArtifact} from '../../sf74-merchant-support-console/case-store.mjs';
import {parseWorkspace,MAX_WORKSPACE_BYTES} from '../../sf74-merchant-support-console/workspace-file.mjs';
import {parseRuntime,encodeRuntimeSource,exportRuntimeHandoff,MAX_RUNTIME_BYTES} from '../../sf74-merchant-support-console/runtime-support.mjs';
import {createRecoveryObservationFiles,recoveryEvidenceReferences} from '../../sf74-merchant-support-console/recovery-runtime.mjs';
import {exportCaseSourcePackage,inspectCaseSourcePackage} from '../../sf74-merchant-support-console/case-source-package.mjs';
import {createCaseSourceDelivery} from '../../sf74-merchant-support-console/case-source-delivery.mjs';

const SCHEMA='stellar-forge.sf101.support-transfer.v1';
const REVIEW_SCHEMA='stellar-forge.sf101.support-review.v1';
const ID=/^[a-z0-9][a-z0-9_-]{0,63}$/,PROFILE=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/,MAX_REQUEST=2*1024*1024,MAX_COHORT=64*1024*1024;
// Matches the original case-store version reader; normalized native metadata is <40 KiB.
const MAX_CASE_METADATA=65000;
const json=value=>JSON.stringify(value,null,2)+'\n';
const hash=value=>createHash('sha256').update(value).digest('hex');
const pin=value=>({bytes:value.length,sha256:hash(value)});
const clone=value=>JSON.parse(JSON.stringify(value));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const inside=(root,path)=>path===root||path.startsWith(root+sep);
const same=(a,b)=>isDeepStrictEqual(a,b);
function need(ok,code,message=code,status=409){
  if(!ok)throw Object.assign(new Error(message),{code,status});
}
function fields(value,keys){
  need(object(value)&&Object.keys(value).every(key=>keys.includes(key)),'WORKSPACE_SUPPORT_INPUT_INVALID',undefined,400);
}
async function privateDirectory(path,create=false){
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!==sep,'WORKSPACE_SUPPORT_PATH_INVALID');
  if(create)await mkdir(path,{recursive:true,mode:0o700});
  const st=await lstat(path);
  need(st.isDirectory()&&!st.isSymbolicLink()&&!(st.mode&0o077)&&
    (typeof process.getuid!=='function'||st.uid===process.getuid())&&await realpath(path)===path,
    'WORKSPACE_SUPPORT_PRIVATE_DIRECTORY_REQUIRED');
  return {dev:st.dev,ino:st.ino};
}
async function bytes(path,maximum){
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await fd.stat({bigint:true});
    need(before.isFile()&&before.nlink===1n&&!(before.mode&0o077n)&&before.size>0n&&
      before.size<=BigInt(maximum),'WORKSPACE_SUPPORT_PRIVATE_FILE_REQUIRED');
    const result=await fd.readFile(),after=await fd.stat({bigint:true});
    need(BigInt(result.length)===before.size&&result.length<=maximum&&
      ['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),
      'WORKSPACE_SUPPORT_FILE_CHANGED');
    return result;
  }finally{await fd.close();}
}
async function optional(path,maximum){
  try{return await bytes(path,maximum);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function decode(value){return new TextDecoder('utf-8',{fatal:true}).decode(value);}
async function retained(path,value){
  const raw=Buffer.isBuffer(value)?value:Buffer.from(value);
  await retainCaseArtifact(path,raw);return pin(raw);
}
async function selectedBytes(root,name,identity,maximum){
  need(SHA.test(identity?.sha256)&&Number.isSafeInteger(identity.bytes)&&identity.bytes>0&&identity.bytes<=maximum,
    'WORKSPACE_SUPPORT_SAVED_IDENTITY_INVALID');
  const raw=await bytes(join(root,name),maximum);
  need(same(pin(raw),identity),'WORKSPACE_SUPPORT_SAVED_BYTES_CHANGED');return raw;
}
function selection(input){
  fields(input,['profileId','id','transferId','caseId','expectedRevision','slot','expectedReviewHash','afterAttempt']);
  need(PROFILE.test(input.profileId??'')&&PROFILE.test(input.id??'')&&ID.test(input.transferId??'')&&
    UUID.test(input.caseId??'')&&SHA.test(input.expectedRevision??'')&&
    SHA.test(input.expectedReviewHash??'')&&Number.isSafeInteger(input.afterAttempt)&&input.afterAttempt>=0&&
    ['before','after'].includes(input.slot),'WORKSPACE_SUPPORT_SELECTION_INVALID',undefined,400);
  return {profileId:input.profileId,id:input.id,transferId:input.transferId,caseId:input.caseId,
    expectedRevision:input.expectedRevision,slot:input.slot,expectedReviewHash:input.expectedReviewHash,
    afterAttempt:input.afterAttempt};
}
function reviewHash(review){const {reviewSha256,...body}=review;return hash(json(body));}
function publicReview(review){
  return {...clone(review),bundle:{...clone(review.bundle),
    note:'The native encrypted backup is external. This case capture contains the complete saved request and native evidence, not the backup bytes.'}};
}

/**
 * The original workspace serializes these methods under its writer lease.
 * No recovery command, acquisition, notification or automatic save replay occurs.
 */
export function createRecoverySupport({directory,workspaceId,profiles,currentHost,readRequestBytes,
  readEvidenceBytes,isActive,isClosing=()=>false,readOnly=false,environment=process.env}){
  const root=join(directory,'support-transfers'),shutdown=new AbortController(),pending=new Set(),sources=new Map();
  const identities=new Map();let closed=false,closePromise=null;
  function available(write=false){
    need(!closed&&!isClosing(),'WORKSPACE_CLOSING');
    if(write)need(!readOnly,'WORKSPACE_READ_ONLY');
  }
  function tracked(action,write=false){
    available(write);
    const task=Promise.resolve().then(async()=>{shutdown.signal.throwIfAborted();await currentHost();return action(shutdown.signal);});
    pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;
  }
  async function profile(id){
    need(PROFILE.test(id??''),'WORKSPACE_PROFILE_INVALID');
    const value=profiles.find(row=>row.id===id);
    need(value&&value.casesDirectory,'WORKSPACE_SUPPORT_NOT_CONFIGURED',
      'The host must declare an existing Support case directory for this profile.');
    const identity=await privateDirectory(value.casesDirectory);
    if(identities.has(id))need(same(identity,identities.get(id)),'WORKSPACE_SUPPORT_CASE_STORE_CHANGED');
    else identities.set(id,identity);
    return value;
  }
  async function storeFor(id){const selected=await profile(id);return {profile:selected,store:await openCaseStore(selected.casesDirectory)};}
  async function transferRoot(profileId,id,create=false){
    await profile(profileId);need(ID.test(id??''),'WORKSPACE_SUPPORT_TRANSFER_ID_INVALID');
    const path=join(root,profileId,id);
    await privateDirectory(path,create);return path;
  }
  async function readReview(profileId,id,expected){
    const folder=await transferRoot(profileId,id),raw=await bytes(join(folder,'review.json'),MAX_REQUEST);
    const review=JSON.parse(decode(raw));
    need(review.schema===REVIEW_SCHEMA&&review.workspaceId===workspaceId&&review.profileId===profileId&&
      review.transferId===id&&SHA.test(review.reviewSha256)&&reviewHash(review)===review.reviewSha256&&
      (expected===undefined||review.reviewSha256===expected),'WORKSPACE_SUPPORT_REVIEW_CHANGED');
    const original=JSON.parse(decode(await bytes(join(folder,'selection.json'),MAX_REQUEST)));
    need(same(review.selection,original),'WORKSPACE_SUPPORT_ORIGINAL_SELECTION_CHANGED');
    return {folder,review};
  }
  async function payload(folder,review){
    const workspaceText=decode(await selectedBytes(folder,'workspace.json',review.files.workspace,MAX_WORKSPACE_BYTES));
    const supportText=decode(await selectedBytes(folder,'support.json',review.files.support,MAX_RUNTIME_BYTES));
    const metadata=JSON.parse(decode(await selectedBytes(folder,'metadata.json',review.files.metadata,MAX_CASE_METADATA)));
    const request=await selectedBytes(folder,'recovery-request.json',review.request,MAX_REQUEST);
    need(same(pin(request),review.request),'WORKSPACE_SUPPORT_REQUEST_CHANGED');
    await parseWorkspace(workspaceText);parseRuntime(supportText);
    return {workspaceText,supportText,metadata};
  }
  function resultBody(review,saved){
    return {schema:SCHEMA,status:'SAVED',workspaceId,profileId:review.profileId,transferId:review.transferId,
      reviewSha256:review.reviewSha256,sourceRequest:review.request,sourceRequestId:review.selection.id,
      sourceReviewHash:review.selection.expectedReviewHash,sourceAttempt:review.selection.afterAttempt,
      caseId:saved.id,revision:saved.revision,previousRevision:saved.previousRevision,
      slot:review.selection.slot,workspaceSha256:review.files.workspace.sha256,
      supportSha256:review.files.support.sha256,bundle:review.bundle};
  }
  async function recordedResult(folder,review){
    const raw=await optional(join(folder,'result.json'),MAX_REQUEST);if(!raw)return null;
    const result=JSON.parse(decode(raw));
    need(result.caseId===review.selection.caseId&&SHA.test(result.revision??'')&&
      (result.previousRevision===review.selection.expectedRevision||result.revision===review.selection.expectedRevision)&&
      same(result,resultBody(review,{id:result.caseId,revision:result.revision,previousRevision:result.previousRevision})),
      'WORKSPACE_SUPPORT_RESULT_CHANGED');return result;
  }
  async function resultFor(folder,review,saved,reused){
    const body=resultBody(review,saved);
    const path=join(folder,'result.json'),prior=await optional(path,MAX_REQUEST);
    if(prior)need(same(JSON.parse(decode(prior)),body),'WORKSPACE_SUPPORT_RESULT_CHANGED');
    else await retained(path,json(body));
    return {...body,reused,currentRevision:(await (await storeFor(review.profileId)).store.read(saved.id)).revision};
  }
  async function reconcile(store,review,prepared,signal){
    // Follow one immutable chain from the observed head. Never move or replace it.
    let before=null,count=0;
    for(;;){
      signal.throwIfAborted();
      const page=await store.history(review.selection.caseId,{before,limit:100});
      for(const row of page.revisions){
        if(++count>50000)throw Object.assign(new Error('The retained case history exceeds the complete review bound.'),{code:'WORKSPACE_SUPPORT_HISTORY_LIMIT'});
        if(row.previousRevision!==review.selection.expectedRevision&&row.revision!==review.selection.expectedRevision)continue;
        const found=await store.read(review.selection.caseId,row.revision);
        if(found.workspaceText===prepared.workspaceText&&found.supportText===prepared.supportText&&same(found.metadata,prepared.metadata))
          return found;
      }
      if(page.nextBefore===null)return null;
      need(SHA.test(page.nextBefore)&&page.nextBefore!==before,'WORKSPACE_SUPPORT_HISTORY_INVALID');
      before=page.nextBefore;
    }
  }
  async function prepare(input,signal){
    const chosen=selection(input),{store}=await storeFor(chosen.profileId);
    const folder=await transferRoot(chosen.profileId,chosen.transferId,true);
    // Freeze the exact selection before capturing any source. A different request
    // cannot adopt this transfer ID even if the first publication was interrupted.
    await retained(join(folder,'selection.json'),json(chosen));
    const existing=await optional(join(folder,'review.json'),MAX_REQUEST);
    if(existing){
      const {review}=await readReview(chosen.profileId,chosen.transferId);await payload(folder,review);
      return publicReview(review);
    }
    let requestBytes=await optional(join(folder,'recovery-request.json'),MAX_REQUEST);
    if(!requestBytes){
      need(!isActive(chosen.profileId,chosen.id),'WORKSPACE_SUPPORT_SOURCE_RUNNING','Wait for the selected original request to stop before capturing it.');
      requestBytes=await readRequestBytes(chosen.profileId,chosen.id);
      const request=JSON.parse(decode(requestBytes));
      need(request.review?.reviewHash===chosen.expectedReviewHash&&request.attempts===chosen.afterAttempt,
        'WORKSPACE_SUPPORT_SOURCE_CHANGED','Read the current saved request and explicitly review its actual attempt.');
      await retained(join(folder,'recovery-request.json'),requestBytes);
    }
    const request=JSON.parse(decode(requestBytes));
    need(request.review?.profileId===chosen.profileId&&request.review?.operationId===chosen.id&&
      request.review?.reviewHash===chosen.expectedReviewHash&&request.attempts===chosen.afterAttempt,
      'WORKSPACE_SUPPORT_SOURCE_CHANGED');
    const evidenceBytes=new Map();let evidenceTotal=0;
    for(const ref of recoveryEvidenceReferences(request)){
      signal.throwIfAborted();
      const name=ref.sha256+'.evidence.json',prior=await optional(join(folder,name),16*1024*1024);
      const raw=prior??await readEvidenceBytes(ref.sha256);
      need(same(pin(raw),{sha256:ref.sha256,bytes:ref.bytes}),'WORKSPACE_SUPPORT_EVIDENCE_CHANGED');
      if(!prior)await retained(join(folder,name),raw);
      evidenceTotal+=raw.length;need(evidenceTotal<=MAX_COHORT,'WORKSPACE_SUPPORT_CAPTURE_TOO_LARGE');
      evidenceBytes.set(ref.sha256,raw);
    }
    const timePath=join(folder,'capture-time.json'),time=await optional(timePath,1024);
    const capturedAt=time?JSON.parse(decode(time)).capturedAt:new Date().toISOString();
    if(!time)await retained(timePath,json({capturedAt}));
    const files=createRecoveryObservationFiles({capturedAt,workspaceId,requestBytes,evidenceBytes:[...evidenceBytes.values()]});
    let total=0;for(const data of Object.values(files))total+=data.length;
    need(total<=MAX_COHORT,'WORKSPACE_SUPPORT_CAPTURE_TOO_LARGE');
    const record=await store.read(chosen.caseId,chosen.expectedRevision);
    // A changed current head is visible before publication; a prior completed
    // prepare is still recoverable and its later commit uses the native CAS.
    need(record.currentRevision===chosen.expectedRevision,'CASE_CONFLICT','Open the current case revision before reviewing this transfer.');
    const workspace=await parseWorkspace(record.workspaceText);
    if(record.supportText)parseRuntime(record.supportText);
    const support=record.supportText?JSON.parse(record.supportText):null;
    const capture={scope:{inputs:clone(workspace.inputs),routeId:chosen.id},
      files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,encodeRuntimeSource(data,MAX_COHORT)]))};
    const body={schema:'stellar-forge.merchant-runtime-case.v1',
      before:support?.before??null,after:support?.after??null,[chosen.slot]:capture};
    const supportText=json(body);parseRuntime(supportText);
    const observation=JSON.parse(decode(files['recovery-observation.json']));
    const selected={
      workspace:await retained(join(folder,'workspace.json'),record.workspaceText),
      support:await retained(join(folder,'support.json'),supportText),
      metadata:await retained(join(folder,'metadata.json'),json(record.metadata)),
    };
    for(const [name,data]of Object.entries(files))await retained(join(folder,name),data);
    const reviewed={schema:REVIEW_SCHEMA,workspaceId,profileId:chosen.profileId,transferId:chosen.transferId,
      selection:chosen,capturedAt,request:pin(requestBytes),phase:request.phase,attempts:request.attempts,
      command:request.review.command,sessionId:observation.sessionId,objectSessionId:observation.objectSessionId,
      evidence:observation.evidence,bundle:observation.bundle,
      case:{id:record.id,revision:record.revision,name:record.name,metadata:record.metadata},
      replacing:record.supportText?{slot:chosen.slot,present:!!support?.[chosen.slot],
        supportSha256:hash(record.supportText)}:{slot:chosen.slot,present:false,supportSha256:null},
      files:selected};
    reviewed.reviewSha256=reviewHash(reviewed);
    signal.throwIfAborted();await retained(join(folder,'review.json'),json(reviewed));return publicReview(reviewed);
  }
  async function save(input,signal){
    fields(input,['profileId','transferId','expectedReviewSha256']);
    need(SHA.test(input.expectedReviewSha256??''),'WORKSPACE_SUPPORT_REVIEW_REQUIRED');
    const {folder,review}=await readReview(input.profileId,input.transferId,input.expectedReviewSha256);
    const prepared=await payload(folder,review),{store}=await storeFor(input.profileId);
    const previous=await optional(join(folder,'result.json'),MAX_REQUEST);
    if(previous){
      const result=JSON.parse(decode(previous)),found=await store.read(review.selection.caseId,result.revision);
      need(found.workspaceText===prepared.workspaceText&&found.supportText===prepared.supportText&&
        same(found.metadata,prepared.metadata),'WORKSPACE_SUPPORT_SAVED_CASE_CHANGED');
      return resultFor(folder,review,found,true);
    }
    const dispatch={schema:SCHEMA,workspaceId,profileId:input.profileId,transferId:input.transferId,
      reviewSha256:review.reviewSha256,caseId:review.selection.caseId,expectedRevision:review.selection.expectedRevision,
      files:review.files};
    const hadDispatch=await optional(join(folder,'save-request.json'),MAX_REQUEST);
    if(hadDispatch){
      need(same(JSON.parse(decode(hadDispatch)),dispatch),'WORKSPACE_SUPPORT_ORIGINAL_SAVE_CHANGED');
      const found=await reconcile(store,review,prepared,signal);
      if(found)return resultFor(folder,review,found,true);
    }else await retained(join(folder,'save-request.json'),json(dispatch));
    signal.throwIfAborted();
    const saved=await store.save({id:review.selection.caseId,expectedRevision:review.selection.expectedRevision,...prepared});
    const found=await store.read(saved.case.id,saved.case.revision);
    need(found.workspaceText===prepared.workspaceText&&found.supportText===prepared.supportText&&
      same(found.metadata,prepared.metadata),'WORKSPACE_SUPPORT_SAVED_CASE_CHANGED');
    return resultFor(folder,review,found,saved.unchanged===true);
  }
  async function originalResult(profileId,id){
    const {folder,review}=await readReview(profileId,id),prepared=await payload(folder,review);
    const result=await recordedResult(folder,review);
    if(!result)return {folder,review,prepared,result:null};
    const {store}=await storeFor(profileId),found=await store.read(result.caseId,result.revision);
    need(result.reviewSha256===review.reviewSha256&&result.caseId===review.selection.caseId&&
      found.workspaceText===prepared.workspaceText&&found.supportText===prepared.supportText&&same(found.metadata,prepared.metadata),
      'WORKSPACE_SUPPORT_SAVED_CASE_CHANGED');
    return {folder,review,prepared,result};
  }
  async function sourceDelivery(profile){
    if(!profile.caseSourceDirectory)return null;
    if(!sources.has(profile.id)){
      await privateDirectory(profile.caseSourceDirectory);
      sources.set(profile.id,await createCaseSourceDelivery({store:await openCaseStore(profile.casesDirectory),
        directory:profile.caseSourceDirectory,environment}));
    }
    return sources.get(profile.id);
  }
  return {
    cases:(profileId,query={})=>tracked(async()=>{fields(query,['q','offset','limit']);return (await storeFor(profileId)).store.list(query);}),
    read:(profileId,id)=>tracked(async()=>{
      const folder=await transferRoot(profileId,id),raw=await optional(join(folder,'review.json'),MAX_REQUEST);
      if(!raw){
        const saved=selection(JSON.parse(decode(await bytes(join(folder,'selection.json'),MAX_REQUEST))));
        need(saved.profileId===profileId&&saved.transferId===id,'WORKSPACE_SUPPORT_ORIGINAL_SELECTION_CHANGED');
        return {status:'PREPARATION_INCOMPLETE',selection:saved,result:null};
      }
      const {review,result}=await originalResult(profileId,id);
      return {review:publicReview(review),result,status:result?'SAVED':'PREPARED'};
    }),
    list:(profileId)=>tracked(async()=>{
      await profile(profileId);let entries;try{entries=await readdir(join(root,profileId));}
      catch(error){if(error.code==='ENOENT')return {transfers:[]};throw error;}
      need(entries.filter(name=>ID.test(name)).length<=1024,'WORKSPACE_SUPPORT_TRANSFER_LIMIT');
      const transfers=[];
      for(const id of entries.filter(name=>ID.test(name)).sort()){
        try{
          const folder=await transferRoot(profileId,id),raw=await optional(join(folder,'review.json'),MAX_REQUEST);
          if(!raw){
            const selected=selection(JSON.parse(decode(await bytes(join(folder,'selection.json'),MAX_REQUEST))));
            need(selected.profileId===profileId&&selected.transferId===id,'WORKSPACE_SUPPORT_ORIGINAL_SELECTION_CHANGED');
            transfers.push({transferId:id,status:'PREPARATION_INCOMPLETE',requestId:selected.id,caseId:selected.caseId});
            continue;
          }
          const {review}=await readReview(profileId,id),result=await recordedResult(folder,review);
          transfers.push({transferId:id,reviewSha256:review.reviewSha256,requestId:review.selection.id,
            case:review.case,slot:review.selection.slot,capturedAt:review.capturedAt,
            status:result?'SAVED_RECORDED':'PREPARED',caseReopened:false,result});
        }catch(error){transfers.push({transferId:id,status:'UNREADABLE',
          error:{code:error.code??'READ_FAILED',message:String(error.message).slice(0,400)}});}
      }return {transfers};
    }),
    prepare:input=>tracked(signal=>prepare(input,signal),true),
    save:input=>tracked(signal=>save(input,signal),true),
    handoff:(profileId,id)=>tracked(async()=>{
      const {review,prepared,result}=await originalResult(profileId,id);
      need(result,'WORKSPACE_SUPPORT_SAVE_REQUIRED','Save the reviewed original case before exporting it.');
      const value=await exportRuntimeHandoff({...prepared,generatedAt:review.capturedAt});
      return {filename:id+'.merchant-support.json',content:value.handoff,
        bytes:Buffer.byteLength(value.handoff),sha256:hash(value.handoff),case:{id:result.caseId,revision:result.revision}};
    }),
    export:input=>tracked(async signal=>{
      fields(input,['profileId','transferId','expectedReviewSha256']);
      const {folder,review,result}=await originalResult(input.profileId,input.transferId);
      need(review.reviewSha256===input.expectedReviewSha256&&result,'WORKSPACE_SUPPORT_SAVE_REQUIRED');
      const {profile:selected,store}=await storeFor(input.profileId),delivery=await sourceDelivery(selected);
      return exportCaseSourcePackage({store,casesDirectory:selected.casesDirectory,id:result.caseId,
        revision:result.revision,directory:join(folder,'package'),exportId:'recovery-'+input.transferId.slice(0,55),
        sourceDelivery:delivery,generatedAt:review.capturedAt,environment,signal});
    },true),
    inspectPackage:(profileId,id)=>tracked(async signal=>{
      const {folder,result}=await originalResult(profileId,id);need(result,'WORKSPACE_SUPPORT_SAVE_REQUIRED');
      return inspectCaseSourcePackage({directory:join(folder,'package'),environment,signal});
    }),
    close(){
      if(!closePromise){
        closed=true;shutdown.abort();
        closePromise=(async()=>{await Promise.allSettled([...pending]);
          const outcomes=await Promise.allSettled([...sources.values()].map(source=>source.close()));
          const failed=outcomes.filter(row=>row.status==='rejected');
          if(failed.length)throw Object.assign(failed[0].reason,{supportCloseErrors:failed.map(row=>String(row.reason?.message??row.reason))});})();
      }return closePromise;
    }
  };
}
