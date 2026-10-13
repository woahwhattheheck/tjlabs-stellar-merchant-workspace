// MIT — Reviewed dossier returns on the original immutable Research history.
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {privateDirectory,writeJson,readJson,digest,jsonBytes,object,BuyerError} from '../../node/store.mjs';
import {RETURN_LIMITS,RETURN_SCHEMAS,ReturnError,validateReturnId} from './contracts.mjs';
import {buildReturnComparison,resolveReturnComparison} from './engine.mjs';
import {validateReturnSourceDescriptor,returnSourceChunks} from './source.mjs';

const copy=value=>structuredClone(value);
const requireReturn=(condition,code,details={})=>{if(!condition)throw new ReturnError(code,details);};
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const canonicalBytes=value=>jsonBytes(canonical(value));
const same=(a,b)=>digest(canonicalBytes(a))===digest(canonicalBytes(b));
const pin=envelope=>({revision:envelope.state.revision,sha256:envelope.sha256});
const time=()=>new Date().toISOString();
const validSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const eventRows=state=>state.dossierReturnEvents===undefined?[]:state.dossierReturnEvents;
const eventLabel='review-dossier-return';
function blobMetadata(row,maximum=RETURN_LIMITS.chunkBytes){
  requireReturn(object(row)&&validSha(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=maximum,
    'RETURN_SOURCE_INVALID',{reason:'Invalid retained return metadata'});
  return row;
}
async function readObject(metadata,readContent,maximum=RETURN_LIMITS.chunkBytes){
  blobMetadata(metadata,maximum);
  const body=await readContent(metadata);
  requireReturn(Buffer.isBuffer(body)&&body.length===metadata.bytes&&digest(body)===metadata.sha256,
    'RETURN_SOURCE_INVALID',{reason:'Retained return bytes changed'});
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
  catch{throw new ReturnError('RETURN_SOURCE_INVALID',{reason:'Retained return JSON is invalid'});}
}
function normalizeRequest(input){
  requireReturn(object(input)&&Object.keys(input).every(key=>['requestId','reviewId','expectedRevision',
    'comparisonSha256','reviewedBy','reviewNote','decisions'].includes(key)),'RETURN_DECISION_INVALID');
  const {requestId,reviewId,expectedRevision,comparisonSha256,reviewedBy,reviewNote='',decisions}=input;
  validateReturnId(reviewId,'review');
  requireReturn(typeof requestId==='string'&&requestId.trim().length>0&&requestId.length<=RETURN_LIMITS.requestId&&
    !requestId.includes('\0')&&Number.isSafeInteger(expectedRevision)&&expectedRevision>0&&validSha(comparisonSha256)&&
    typeof reviewedBy==='string'&&reviewedBy.trim().length>0&&reviewedBy.length<=RETURN_LIMITS.reviewedBy&&
    typeof reviewNote==='string'&&reviewNote.length<=RETURN_LIMITS.reviewNote&&Array.isArray(decisions),
  'RETURN_DECISION_INVALID');
  const request={schema:RETURN_SCHEMAS.request,requestId,reviewId,expectedRevision,comparisonSha256,
    reviewedBy,reviewNote,decisions:copy(decisions)};
  requireReturn(canonicalBytes(request).length<=RETURN_LIMITS.reviewBytes,'RETURN_DECISION_INVALID',
    {reason:'Complete review request exceeds its supported size',maxBytes:RETURN_LIMITS.reviewBytes});
  return request;
}
function requestInput(request){
  const {requestId,reviewId,expectedRevision,comparisonSha256,reviewedBy,reviewNote,decisions}=request;
  return{requestId,reviewId,expectedRevision,comparisonSha256,reviewedBy,reviewNote,decisions};
}
function eventId(dossierId,requestSha256){return'drr_'+digest(canonicalBytes({dossierId,requestSha256}));}
function installState(target,source){
  for(const key of Object.keys(target))delete target[key];
  for(const [key,value]of Object.entries(source))
    Object.defineProperty(target,key,{value:copy(value),writable:true,enumerable:true,configurable:true});
}
function candidateState(resolved,current,event,updatedAt){
  const state=copy(resolved.state);
  state.revision=current.state.revision+1;state.previous=current.sha256;
  state.updatedAt=updatedAt;state.change=eventLabel;
  if(event)state.dossierReturnEvents=[...copy(eventRows(current.state)),copy(event)];
  return state;
}
function projection(comparison,offset=0,limit=RETURN_LIMITS.defaultPage){
  requireReturn(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=RETURN_LIMITS.maxPage,
    'RETURN_DECISION_INVALID',{reason:'Invalid comparison page',maxPage:RETURN_LIMITS.maxPage});
  const items=comparison.items.slice(offset,offset+limit).map(item=>{
    const result=copy(item);
    for(const side of ['base','current','returned']){
      if(result[side]?.present&&Object.hasOwn(result[side],'value')&&jsonBytes(result[side].value).length>32768){
        delete result[side].value;result[side].valueOmitted=true;
      }
    }
    return result;
  });
  return{schema:comparison.schema,reviewId:comparison.reviewId??comparison.id,
    comparisonSha256:comparison.comparisonSha256,dossierId:comparison.dossierId,
    source:copy(comparison.source),current:copy(comparison.current),returned:copy(comparison.returned),
    base:copy(comparison.base),counts:copy(comparison.counts??{}),items,total:comparison.items.length,offset,limit};
}

export function dossierReturnBlobMetadata(state){
  const result=[];
  for(const event of eventRows(state)){
    validateReturnSourceDescriptor(event.source);
    result.push(blobMetadata(event.request,RETURN_LIMITS.reviewBytes),blobMetadata(event.comparison),...event.source.chunks);
  }
  return result;
}

export async function validateDossierReturnState(state,readContent,cache=new Map()){
  const events=eventRows(state);
  requireReturn(Array.isArray(events),'RETURN_SOURCE_INVALID',{reason:'Return history must be an array'});
  const ids=new Set(),requests=new Set(),reviews=new Set();let previousRevision=0;
  for(const event of events){
    requireReturn(object(event)&&event.schema===RETURN_SCHEMAS.event,'RETURN_SOURCE_INVALID');
    validateReturnId(event.id,'return');validateReturnId(event.reviewId,'review');validateReturnId(event.sourceId,'source');
    requireReturn(typeof event.requestId==='string'&&event.requestId.trim().length>0&&event.requestId.length<=RETURN_LIMITS.requestId&&
      validSha(event.requestSha256)&&validSha(event.comparisonSha256)&&validSha(event.originalRevisionSha256)&&
      Number.isSafeInteger(event.originalRevision)&&event.originalRevision>0&&event.revision===event.originalRevision+1&&
      event.revision>previousRevision&&event.revision<=state.revision&&typeof event.reviewedAt==='string'&&
      Number.isFinite(Date.parse(event.reviewedAt))&&Number.isSafeInteger(event.changeCount)&&event.changeCount>=0&&
      Number.isSafeInteger(event.proposalCount)&&event.proposalCount>=0&&
      !ids.has(event.id)&&!requests.has(event.requestId)&&!reviews.has(event.reviewId),'RETURN_SOURCE_INVALID',
    {reason:'Invalid immutable return event'});
    validateReturnSourceDescriptor(event.source);
    blobMetadata(event.request,RETURN_LIMITS.reviewBytes);blobMetadata(event.comparison);
    requireReturn(event.source.dossierId===state.id&&event.source.id===event.sourceId&&
      event.id===eventId(state.id,event.requestSha256)&&event.request.sha256===event.requestSha256,'RETURN_SOURCE_INVALID');
    ids.add(event.id);requests.add(event.requestId);reviews.add(event.reviewId);previousRevision=event.revision;
    for(const metadata of [blobMetadata(event.request,RETURN_LIMITS.reviewBytes),blobMetadata(event.comparison),...event.source.chunks]){
      const key='return-blob:'+metadata.sha256+':'+metadata.bytes;
      if(!cache.has(key)){
        const bytes=await readContent(metadata);
        requireReturn(Buffer.isBuffer(bytes)&&bytes.length===metadata.bytes&&digest(bytes)===metadata.sha256,'RETURN_SOURCE_INVALID',
          {reason:'Required return source is missing or changed',sha256:metadata.sha256});
        cache.set(key,true);
      }
    }
  }
}

/** Validate a source-aware return as its own native transition.
 * All current typed histories remain exact; selected returned typed changes are
 * retained proposals, with their complete original branch and revision authority. */
export async function validateDossierReturnTransition(previous,state,{readContent,withPortableBranch,historyPin}){
  const old=previous?eventRows(previous):[],events=eventRows(state);
  requireReturn(Array.isArray(old)&&Array.isArray(events)&&events.length>=old.length&&events.length<=old.length+1&&
    old.every((row,index)=>digest(jsonBytes(row))===digest(jsonBytes(events[index]))),'RETURN_SOURCE_INVALID',
  {reason:'Original return history changed'});
  if(events.length===old.length)return false;
  requireReturn(previous&&state.id===previous.id&&state.revision===previous.revision+1,'RETURN_SOURCE_INVALID');
  const event=events.at(-1),current={sha256:digest(jsonBytes(previous)),state:previous};
  requireReturn(state.change===eventLabel&&state.previous===current.sha256&&event.originalRevision===previous.revision&&
    event.originalRevisionSha256===current.sha256&&event.revision===state.revision,'RETURN_SOURCE_INVALID',
  {reason:'Return is bound to a different local predecessor'});
  const request=await readObject(event.request,readContent,RETURN_LIMITS.reviewBytes);
  requireReturn(request.schema===RETURN_SCHEMAS.request&&same(normalizeRequest(requestInput(request)),request)&&
    digest(canonicalBytes(request))===event.requestSha256&&request.requestId===event.requestId&&
    request.reviewId===event.reviewId&&request.expectedRevision===previous.revision&&
    request.comparisonSha256===event.comparisonSha256,'RETURN_SOURCE_INVALID',
  {reason:'Return request identity changed'});
  const snapshot=await readObject(event.comparison,readContent);
  requireReturn(object(snapshot)&&snapshot.schema===RETURN_SCHEMAS.comparison&&same(snapshot.current,current)&&
    same(snapshot.source,event.source)&&digest(jsonBytes(snapshot.current.state))===snapshot.current.sha256,
  'RETURN_SOURCE_INVALID',{reason:'Frozen comparison source changed'});
  await withPortableBranch(Readable.from(returnSourceChunks(event.source,readContent)),async branch=>{
    requireReturn(branch.id===state.id&&branch.head.state.revision===event.source.incomingHead.revision&&
      branch.head.sha256===event.source.incomingHead.sha256,'RETURN_SOURCE_INVALID');
    const matches=branch.pins.filter(row=>row.revision<=previous.revision&&historyPin(row.revision)===row.sha256);
    requireReturn(matches.length>0,'RETURN_NO_COMMON_ANCESTOR');
    const base=await branch.readRevision(matches.at(-1).revision);
    const rebuilt=buildReturnComparison({source:event.source,current,returned:branch.head,base});
    requireReturn(same(snapshot.base,base)&&same(snapshot.returned,branch.head)&&same(snapshot.comparison,rebuilt)&&
      (rebuilt.reviewId??rebuilt.id)===event.reviewId&&rebuilt.comparisonSha256===event.comparisonSha256,
    'RETURN_SOURCE_INVALID',{reason:'Complete frozen comparison does not replay'});
    const resolved=resolveReturnComparison(rebuilt,request.decisions,
      {currentState:previous,returnedState:branch.head.state,baseState:base.state});
    requireReturn(event.changeCount===resolved.changes.length&&event.proposalCount===resolved.proposals.length,
      'RETURN_SOURCE_INVALID',{reason:'Saved dispositions differ'});
    const expected=candidateState(resolved,current,event,state.updatedAt);
    requireReturn(digest(jsonBytes(expected))===digest(jsonBytes(state)),'RETURN_SOURCE_INVALID',
      {reason:'Reviewed authored state does not replay'});
  });
  return true;
}

export function createDossierReturnStore({directory,dossierDirectory,head,history,readRevision,commit,blob,putBlob,
  sourceAdapter,validateCandidate,validateCapacity}){
  const returnsDirectory=async id=>privateDirectory(join(await privateDirectory(dossierDirectory(id)),'returns'));
  const reviewDirectory=async id=>privateDirectory(join(await returnsDirectory(id),'reviews'));
  async function saveObject(value,maximum=RETURN_LIMITS.chunkBytes,sorted=false){
    const bytes=sorted?canonicalBytes(value):jsonBytes(value);
    requireReturn(bytes.length<=maximum,'RETURN_DECISION_INVALID',
      {reason:'Complete retained review exceeds its supported size',maxBytes:maximum});
    return putBlob(bytes);
  }
  async function findEvent(id,selector){
    const events=eventRows((await head(id)).state);
    return events.find(row=>Object.entries(selector).every(([key,value])=>row[key]===value))??null;
  }
  async function readSnapshot(id,reviewId){
    validateReturnId(reviewId,'review');let pointer;
    try{pointer=await readJson(join(await reviewDirectory(id),reviewId+'.json'),1048576);}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      const event=await findEvent(id,{reviewId});
      if(event)pointer={reviewId,comparison:event.comparison};
    }
    requireReturn(pointer,'RETURN_REVIEW_NOT_FOUND',{reviewId});
    const snapshot=await readObject(pointer.comparison,blob);
    requireReturn(snapshot.schema===RETURN_SCHEMAS.comparison&&snapshot.current.state.id===id&&
      (snapshot.comparison.reviewId??snapshot.comparison.id)===reviewId&&
      [snapshot.current,snapshot.returned,snapshot.base].every(envelope=>digest(jsonBytes(envelope.state))===envelope.sha256),
    'RETURN_SOURCE_INVALID');
    return{snapshot,metadata:pointer.comparison};
  }
  async function receipt(id,event){
    const request=await readObject(event.request,blob,RETURN_LIMITS.reviewBytes);
    const snapshot=await readObject(event.comparison,blob);
    const envelope=await readRevision(id,event.revision);
    requireReturn(eventRows(envelope.state).some(row=>same(row,event)),'RETURN_SOURCE_INVALID');
    return{id:event.id,requestId:event.requestId,reviewId:event.reviewId,sourceId:event.sourceId,
      comparisonSha256:event.comparisonSha256,revision:event.revision,revisionSha256:envelope.sha256,
      reviewedAt:event.reviewedAt,reviewedBy:request.reviewedBy,reviewNote:request.reviewNote,decisions:copy(request.decisions),
      source:copy(event.source),current:copy(snapshot.comparison.current),base:copy(snapshot.comparison.base),
      returned:copy(snapshot.comparison.returned),changeCount:event.changeCount,proposalCount:event.proposalCount};
  }
  async function recover(id,request,requestSha256){
    const event=await findEvent(id,{requestId:request.requestId});
    if(!event)return null;
    requireReturn(event.requestSha256===requestSha256,'RETURN_REQUEST_CONFLICT',
      {requestId:request.requestId,reviewId:event.reviewId,returnId:event.id});
    const saved=await readObject(event.request,blob,RETURN_LIMITS.reviewBytes);
    requireReturn(same(saved,request),'RETURN_REQUEST_CONFLICT',{requestId:request.requestId,returnId:event.id});
    return{return:await receipt(id,event),replayed:true};
  }
  async function previewDossierReturn(id,{sourceId,expectedRevision}={}){
    const current=await head(id);
    requireReturn(Number.isSafeInteger(expectedRevision)&&current.state.revision===expectedRevision,'REVISION_CONFLICT',
      {expectedRevision:expectedRevision??null,current:pin(current)});
    const source=await sourceAdapter.readSource(id,sourceId);
    const branches=await sourceAdapter.comparisonBranches(id,source,current);
    const comparison=buildReturnComparison(branches);
    const reviewId=comparison.reviewId??comparison.id;
    const snapshot={schema:RETURN_SCHEMAS.comparison,source:branches.source,current:branches.current,
      returned:branches.returned,base:branches.base,comparison};
    const metadata=await saveObject(snapshot);
    const path=join(await reviewDirectory(id),reviewId+'.json');
    const pointer={schema:RETURN_SCHEMAS.comparison,reviewId,comparisonSha256:comparison.comparisonSha256,comparison:metadata};
    try{await writeJson(path,pointer,{exclusive:true});}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const existing=await readJson(path,1048576);
      requireReturn(same(existing,pointer),'RETURN_COMPARISON_MISMATCH',{reviewId});
    }
    const event=await findEvent(id,{reviewId});
    return{...projection(comparison),status:event?'APPLIED':'OPEN',return:event?await receipt(id,event):null};
  }
  async function dossierReturns(id,{reviewId,requestId,offset=0,limit=RETURN_LIMITS.defaultPage}={}){
    requireReturn(!(reviewId&&requestId),'RETURN_DECISION_INVALID');
    if(requestId){
      requireReturn(typeof requestId==='string'&&requestId.length<=RETURN_LIMITS.requestId,'RETURN_DECISION_INVALID');
      const event=await findEvent(id,{requestId});return{return:event?await receipt(id,event):null};
    }
    if(reviewId){
      const {snapshot}=await readSnapshot(id,reviewId),event=await findEvent(id,{reviewId});
      return{...projection(snapshot.comparison,offset,limit),status:event?'APPLIED':'OPEN',return:event?await receipt(id,event):null};
    }
    requireReturn(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=RETURN_LIMITS.maxPage,
      'RETURN_DECISION_INVALID');
    const events=[...eventRows((await head(id)).state)].reverse();
    const items=events.slice(offset,offset+limit).map(event=>({id:event.id,requestId:event.requestId,reviewId:event.reviewId,
      sourceId:event.sourceId,comparisonSha256:event.comparisonSha256,revision:event.revision,reviewedAt:event.reviewedAt,
      current:{revision:event.originalRevision,sha256:event.originalRevisionSha256},returned:copy(event.source.incomingHead),
      changeCount:event.changeCount,proposalCount:event.proposalCount}));
    return{items,total:events.length,offset,limit};
  }
  function identity(snapshot,event=null,revisionSha256=null){
    return{reviewId:snapshot.comparison.reviewId??snapshot.comparison.id,returnId:event?.id??null,
      sourceId:snapshot.source.id,comparisonSha256:snapshot.comparison.comparisonSha256,revisionSha256};
  }
  function download(filename,contentType,body,binding){
    const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);
    return{filename,contentType,bytes:bytes.length,sha256:digest(bytes),body:bytes,identity:binding};
  }
  async function dossierReturnValue(id,{reviewId,itemId,side}={}){
    validateReturnId(itemId,'item');requireReturn(['base','current','returned'].includes(side),'RETURN_DECISION_INVALID');
    const {snapshot}=await readSnapshot(id,reviewId);
    const item=snapshot.comparison.items.find(row=>row.id===itemId);
    requireReturn(item,'RETURN_REVIEW_NOT_FOUND',{reviewId,itemId});
    const selected=item[side],value={reviewId,itemId,side,present:selected.present,sha256:selected.sha256};
    if(selected.present)value.value=copy(selected.value);
    return download(itemId+'-'+side+'.json','application/json; charset=utf-8',jsonBytes(value),identity(snapshot));
  }
  async function prepareChoices(id,{reviewId,expectedRevision,comparisonSha256,decisions}={}){
    const {snapshot,metadata}=await readSnapshot(id,reviewId);
    requireReturn(comparisonSha256===snapshot.comparison.comparisonSha256,'RETURN_COMPARISON_MISMATCH',{reviewId});
    const current=await head(id);
    requireReturn(expectedRevision===snapshot.current.state.revision&&current.state.revision===expectedRevision&&
      current.sha256===snapshot.current.sha256,'REVISION_CONFLICT',
    {expectedRevision:expectedRevision??null,current:pin(current),reviewId});
    const resolved=resolveReturnComparison(snapshot.comparison,decisions,
      {currentState:snapshot.current.state,returnedState:snapshot.returned.state,baseState:snapshot.base.state});
    const proposed=candidateState(resolved,current,null,time());
    try{await validateCandidate(id,proposed,{withTransition:false});}
    catch(error){
      if(error instanceof ReturnError)throw error;
      throw new ReturnError('RETURN_DECISION_INVALID',{reason:error.code??'Native proposed state is invalid',
        requirements:[{itemId:null,reason:error.code??'Native source binding is invalid'}]});
    }
    return{snapshot,metadata,current,resolved};
  }
  async function previewDossierReturnChoices(id,request={}){
    const {snapshot,current,resolved}=await prepareChoices(id,request);
    return{reviewId:snapshot.comparison.reviewId??snapshot.comparison.id,
      comparisonSha256:snapshot.comparison.comparisonSha256,current:pin(current),decisions:copy(resolved.decisions),
      valid:true,requirements:[],result:{sha256:digest(jsonBytes(resolved.state)),changeCount:resolved.changes.length,
        proposalCount:resolved.proposals.length}};
  }
  async function reviewDossierReturn(id,input={}){
    const request=normalizeRequest(input),requestSha256=digest(canonicalBytes(request));
    const recovered=await recover(id,request,requestSha256);if(recovered)return recovered;
    const prepared=await prepareChoices(id,requestInput(request));
    const {snapshot,metadata,current,resolved}=prepared;
    const requestMetadata=await saveObject(request,RETURN_LIMITS.reviewBytes,true);
    const event={schema:RETURN_SCHEMAS.event,id:eventId(id,requestSha256),requestId:request.requestId,
      reviewId:request.reviewId,sourceId:snapshot.source.id,comparisonSha256:request.comparisonSha256,
      originalRevision:current.state.revision,originalRevisionSha256:current.sha256,revision:current.state.revision+1,
      reviewedAt:time(),requestSha256,request:requestMetadata,comparison:metadata,source:copy(snapshot.source),
      changeCount:resolved.changes.length,proposalCount:resolved.proposals.length};
    const candidate=candidateState(resolved,current,event,event.reviewedAt);
    await validateCandidate(id,candidate,{withTransition:true});
    await validateCapacity(id,candidate);
    try{
      await commit(id,request.expectedRevision,eventLabel,(next,original)=>{
        requireReturn(digest(jsonBytes(original))===current.sha256,'REVISION_CONFLICT',{reviewId:request.reviewId});
        const installed=copy(resolved.state);
        installed.dossierReturnEvents=[...copy(eventRows(original)),copy(event)];
        installState(next,installed);
      },{projection:'metadata'});
    }catch(error){
      if(error.code==='REVISION_CONFLICT'){
        const observed=await recover(id,request,requestSha256);if(observed)return observed;
      }
      throw error;
    }
    const accepted=await findEvent(id,{requestId:request.requestId});
    requireReturn(accepted&&accepted.requestSha256===requestSha256,'RETURN_REQUEST_CONFLICT',
      {requestId:request.requestId,reason:'Accepted result requires reconciliation'});
    return{return:await receipt(id,accepted),replayed:false};
  }
  async function drafts(id,reviewId){
    await readSnapshot(id,reviewId);
    const directory=await privateDirectory(join(await returnsDirectory(id),'drafts',reviewId));
    const versions=(await readdir(directory)).filter(name=>/^[0-9]{8}\.json$/.test(name))
      .map(name=>Number(name.slice(0,8))).sort((a,b)=>a-b);
    requireReturn(versions.every((value,index)=>value===index+1),'RETURN_DRAFT_CONFLICT',
      {reviewId,reason:'Saved draft history is incomplete'});
    return{directory,versions};
  }
  async function dossierReturnDraft(id,{reviewId}={}){
    const {snapshot}=await readSnapshot(id,reviewId),{directory,versions}=await drafts(id,reviewId);
    if(!versions.length)return{reviewId,dossierId:id,sourceId:snapshot.source.id,
      comparisonSha256:snapshot.comparison.comparisonSha256,draftVersion:0,draft:null,savedAt:null};
    const value=await readJson(join(directory,String(versions.at(-1)).padStart(8,'0')+'.json'),RETURN_LIMITS.draftBytes);
    requireReturn(value.schema===RETURN_SCHEMAS.draft&&value.reviewId===reviewId&&value.dossierId===id&&
      value.sourceId===snapshot.source.id&&value.comparisonSha256===snapshot.comparison.comparisonSha256&&
      value.draftVersion===versions.at(-1),'RETURN_DRAFT_CONFLICT');
    return value;
  }
  async function saveDossierReturnDraft(id,{reviewId,expectedDraftVersion,draft}={}){
    const {snapshot}=await readSnapshot(id,reviewId);
    requireReturn(object(draft)&&Number.isSafeInteger(expectedDraftVersion)&&expectedDraftVersion>=0,
      'RETURN_DECISION_INVALID');
    for(const [key,value]of Object.entries({reviewId,dossierId:id,sourceId:snapshot.source.id,
      comparisonSha256:snapshot.comparison.comparisonSha256}))
      requireReturn(draft[key]===undefined||draft[key]===value,'RETURN_COMPARISON_MISMATCH',{reviewId,field:key});
    const pending=draft.pendingRequest??draft.request;
    if(pending!==undefined&&pending!==null){
      const request=normalizeRequest(pending);
      requireReturn(request.reviewId===reviewId&&request.comparisonSha256===snapshot.comparison.comparisonSha256&&
        request.expectedRevision===snapshot.current.state.revision,'RETURN_COMPARISON_MISMATCH',{reviewId});
    }
    const {directory,versions}=await drafts(id,reviewId),current=versions.at(-1)??0;
    requireReturn(current===expectedDraftVersion,'RETURN_DRAFT_CONFLICT',{reviewId,expectedDraftVersion,currentDraftVersion:current});
    const saved={schema:RETURN_SCHEMAS.draft,reviewId,dossierId:id,sourceId:snapshot.source.id,
      comparisonSha256:snapshot.comparison.comparisonSha256,draftVersion:current+1,draft:copy(draft),savedAt:time()};
    requireReturn(jsonBytes(saved).length<=RETURN_LIMITS.draftBytes,'RETURN_DECISION_INVALID',{maxBytes:RETURN_LIMITS.draftBytes});
    try{await writeJson(join(directory,String(saved.draftVersion).padStart(8,'0')+'.json'),saved,{exclusive:true});}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      throw new ReturnError('RETURN_DRAFT_CONFLICT',{reviewId,expectedDraftVersion,currentDraftVersion:current+1});
    }
    return saved;
  }
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function fenceFor(raw){let size=3;for(const match of raw.matchAll(/~+/g))size=Math.max(size,match[0].length+1);return'~'.repeat(size);}
  const markdownText=value=>String(value).replace(/\\/g,'\\\\').replace(/([`*_{}\[\]()#+.!<>|-])/g,'\\$1');
  function markdown(report){
    const lines=['# Research dossier return','',
      'Review: '+report.identity.reviewId,'','Source: '+report.identity.sourceId,'',
      'Comparison SHA256: '+report.identity.comparisonSha256,'',
      'Current revision: '+report.comparison.current.revision+' / '+report.comparison.current.sha256,
      'Returned revision: '+report.comparison.returned.revision+' / '+report.comparison.returned.sha256,
      'Common ancestor: '+report.comparison.base.revision+' / '+report.comparison.base.sha256,''];
    if(report.return){const raw=JSON.stringify(report.return,null,2),fence=fenceFor(raw);lines.push('## Accepted review','',fence+'json',raw,fence,'');}
    for(const item of report.comparison.items){
      lines.push('## '+markdownText(item.label??item.kind??item.id).replace(/[\r\n]/g,' '),'',item.id,'',
        'Treatment: '+item.treatment,'',item.effect??'');
      for(const side of ['base','current','returned']){
        const value=item[side],raw=value.present?JSON.stringify(value.value,null,2):'(absent)';
        const fence=fenceFor(raw);
        lines.push('### '+side,'','SHA256: '+value.sha256,'',fence+'json',raw,fence,'');
      }
    }
    return lines.join('\n')+'\n';
  }
  function html(report){
    const summary='<h1>Research dossier return</h1><dl><dt>Review</dt><dd>'+escape(report.identity.reviewId)+
      '</dd><dt>Source</dt><dd>'+escape(report.identity.sourceId)+'</dd><dt>Comparison SHA256</dt><dd>'+
      escape(report.identity.comparisonSha256)+'</dd></dl>';
    const accepted=report.return?'<h2>Accepted review</h2><pre>'+escape(JSON.stringify(report.return,null,2))+'</pre>':'';
    const items=report.comparison.items.map(item=>'<section><h2>'+escape(item.label??item.kind??item.id)+
      '</h2><p>'+escape(item.id)+'</p><p>'+escape(item.treatment)+'</p><p>'+escape(item.effect??'')+'</p>'+
      ['base','current','returned'].map(side=>'<h3>'+side+'</h3><p>'+escape(item[side].sha256)+
        '</p><pre>'+escape(item[side].present?JSON.stringify(item[side].value,null,2):'(absent)')+'</pre>').join('')+'</section>').join('');
    return'<!doctype html><html lang="en"><meta charset="utf-8"><title>Research dossier return</title>'+
      '<style>body{font:16px/1.5 system-ui,sans-serif;color:#171717;background:#fff;max-width:1100px;margin:40px auto;padding:0 24px}'+
      'section{border-top:1px solid #ccc;margin-top:32px;padding-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;'+
      'background:#f5f5f5;border:1px solid #ddd;padding:16px}dd{overflow-wrap:anywhere}h1,h2,h3{line-height:1.25}</style>'+
      '<body>'+summary+accepted+items+'</body></html>\n';
  }
  async function exportDossierReturn(id,{reviewId,returnId,format='json'}={}){
    requireReturn(['json','md','html','source'].includes(format),'RETURN_DECISION_INVALID');
    const {snapshot}=await readSnapshot(id,reviewId);let event=null,accepted=null;
    if(returnId!==undefined){
      validateReturnId(returnId,'return');event=await findEvent(id,{id:returnId,reviewId});
      requireReturn(event,'RETURN_REVIEW_NOT_FOUND',{reviewId,returnId});accepted=await receipt(id,event);
    }
    const binding=identity(snapshot,event,accepted?.revisionSha256??null);
    if(format==='source')return{filename:snapshot.source.filename,contentType:snapshot.source.contentType,
      bytes:snapshot.source.bytes,sha256:snapshot.source.sha256,
      stream:Readable.from(returnSourceChunks(snapshot.source,blob)),identity:binding};
    const report={schema:RETURN_SCHEMAS.report,identity:binding,comparison:copy(snapshot.comparison),return:accepted};
    const body=format==='json'?jsonBytes(report):format==='md'?markdown(report):html(report);
    return download((returnId??reviewId)+'.'+format,
      format==='json'?'application/json; charset=utf-8':format==='md'?'text/markdown; charset=utf-8':'text/html; charset=utf-8',
      body,binding);
  }
  return Object.freeze({receiveDossierReturnSource:sourceAdapter.receiveDossierReturnSource,previewDossierReturn,
    dossierReturns,dossierReturnValue,previewDossierReturnChoices,reviewDossierReturn,saveDossierReturnDraft,
    dossierReturnDraft,exportDossierReturn});
}
