// MIT. Complete source-aware dossier return comparison on the original Research API.
import {
  RETURN_BROWSER_DRAFT,RETURN_BROWSER_REQUEST,returnClone,returnCanonical,returnSha256,
  assertReturnBindings,assertReturnDraft,assertReturnRequest,assertReturnReceipt,
  createDossierReturnDraftStore,closeDossierReturnStorage,
} from './dossier-return-drafts.js';

const RECOVERY='sf88-research-dossier-return-browser-recovery-v1',SOURCE_LIMIT=256*1024*1024;
const PAGE=25,MAX_PAGE=100;
const DEFINITE_REJECTIONS=new Set([
  'AUTH_REQUIRED','HOST_REFUSED','ORIGIN_REFUSED','RESEARCH_WORKSPACE_CHANGED','RESEARCH_INSTANCE_CHANGED',
  'REVISION_CONFLICT','RETURN_SOURCE_NOT_FOUND','RETURN_REVIEW_NOT_FOUND','RETURN_COMPARISON_MISMATCH',
  'RETURN_REQUEST_CONFLICT','RETURN_DECISION_REQUIRED','RETURN_DECISION_INVALID','RETURN_NO_COMMON_ANCESTOR',
  'RETURN_SOURCE_INVALID','RETURN_REVIEW_REQUIRED','RETURN_REVIEW_INVALID','RETURN_REQUEST_INVALID','RETURN_REQUEST_TOO_LARGE',
  'UPLOAD_SIZE_LIMIT','CONTENT_TYPE_REQUIRED','JSON_BODY_REQUIRED',
]);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const array=value=>Array.isArray(value)?value:[];
const same=(a,b)=>returnCanonical(a)===returnCanonical(b);
const uid=prefix=>prefix+crypto.randomUUID();
const need=(value,code,details)=>{if(!value)throw Object.assign(new Error(code),{code,details});};
const message=error=>error?.code??error?.message??'RETURN_BROWSER_OPERATION_FAILED';
const safeError=error=>({code:message(error),...(Number.isInteger(error?.status)?{status:error.status}:{}),
  ...(plain(error?.details)?{details:returnClone(error.details)}:{})});
const node=(tag,text,classes)=>{
  const result=document.createElement(tag);if(text!==undefined&&text!==null)result.textContent=String(text);
  if(classes)result.className=classes;return result;
};
const short=value=>typeof value==='string'?value:JSON.stringify(value);
const formatBytes=value=>Number.isSafeInteger(value)?value.toLocaleString()+' bytes':'Unknown size';
const stamp=value=>value?new Date(value).toLocaleString():'';
const field=(label,input)=>{const out=node('label',null,'dr-field');out.append(node('span',label),input);return out;};
const binding=(owner,review)=>assertReturnBindings({
  workspaceId:owner.workspaceId,dossierId:owner.dossierId,
  reviewId:review.reviewId??review.id,comparisonSha256:review.comparisonSha256,
  source:returnClone(review.source),base:returnClone(review.base),
  current:returnClone(review.current),returned:returnClone(review.returned),
});
const encoded=input=>{
  const params=new URLSearchParams();
  for(const[key,value]of Object.entries(input??{}))if(value!==undefined&&value!==null)params.set(key,String(value));
  return params.size?'?'+params.toString():'';
};
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadJson(value,filename){downloadBlob(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),filename);}
function filename(response,fallback){
  const disposition=response.headers.get('content-disposition')??'';
  const utf=disposition.match(/filename\*=UTF-8''([^;]+)/i);let value;
  if(utf){try{value=decodeURIComponent(utf[1]);}catch{need(false,'RETURN_BROWSER_DOWNLOAD_FILENAME_INVALID');}}
  else value=disposition.match(/filename="([^"]+)"/i)?.[1]??fallback;
  need(typeof value==='string'&&value.length>0&&value.length<=512&&!/[\u0000-\u001f\u007f/\\]/.test(value),
    'RETURN_BROWSER_DOWNLOAD_FILENAME_INVALID');
  return value;
}
export function createDossierReturnsPanel({root,tab,api,task,notify,getDossier,getWorkspace,isBusy,onReceived}){
  const sessions=new Map();let session=null,visible=false,valueDialog=null;
  const selected=owner=>owner?.drafts.get(owner.currentId)??null;
  const pendingFor=(owner,draft=selected(owner))=>draft?.pendingRequestId?owner.requests.get(draft.pendingRequestId)?.value:
    (draft?.pending??null);
  const activePending=owner=>[...owner.requests.values()].filter(row=>['PENDING','OUTCOME_UNKNOWN'].includes(row.value.state));
  const endpoint=(owner,suffix='')=>'/api/dossiers/'+encodeURIComponent(owner.dossierId)+'/returns'+suffix;
  const request=(owner,suffix='',options={})=>api(endpoint(owner,suffix),{
    ...options,sourceProjection:'full',workspaceId:owner.workspaceId,
  });
  function newSession(workspaceId,dossierId,view){
    return {
      workspaceId,dossierId,view,store:createDossierReturnDraftStore({workspaceId,dossierId}),
      drafts:new Map(),versions:new Map(),requests:new Map(),sources:new Map(),sourceMemory:new Map(),
      sourceUnack:new Map(),unack:new Map(),conflicts:new Map(),accepted:new Map(),
      currentId:null,review:null,items:new Map(),page:0,pageItems:[],total:0,
      history:[],historyOffset:0,historyTotal:0,sourceId:null,sourceReceipt:null,
      validation:null,requirements:[],storageError:null,error:null,notice:null,
      loaded:false,loading:null,writer:Promise.resolve(),timer:null,busy:0,sourceBusy:false,
    };
  }
  function setDossier(view){
    const workspaceId=getWorkspace()?.workspaceId;
    if(!view||!workspaceId){session=null;if(visible)render();return;}
    const key=JSON.stringify([workspaceId,view.id]);let owner=sessions.get(key);
    if(!owner){owner=newSession(workspaceId,view.id,view);sessions.set(key,owner);}
    owner.view=view;session=owner;
    if(visible){render();if(!owner.loaded&&!owner.loading)load(owner).catch(error=>showError(owner,error));}
  }
  function showError(owner,error){
    owner.error=safeError(error);
    if(Array.isArray(error?.details?.requirements))owner.requirements=returnClone(error.details.requirements);
    if(owner===session)render();
  }
  function go(owner,work){
    if(isBusy()||owner.busy)return;
    return task(async()=>{
      owner.busy++;owner.error=null;if(owner===session)render();
      try{return await work(owner);}
      catch(error){showError(owner,error);throw error;}
      finally{owner.busy--;if(owner===session)render();}
    });
  }
  function local(owner,work){
    return Promise.resolve().then(()=>work(owner)).catch(error=>showError(owner,error));
  }
  async function loadLocal(owner){
    const [drafts,requests,sources]=await Promise.all([
      owner.store.listDrafts(),owner.store.listPending(),owner.store.listSources(),
    ]);
    for(const record of drafts){
      // Snapshot and its CAS revision always advance together. A local branch
      // awaiting acknowledgement remains complete and cannot adopt a newer CAS.
      if(!owner.unack.has(record.id)){
        assertReturnDraft(record.value);owner.drafts.set(record.id,record.value);
        owner.versions.set(record.id,record.version);
      }else if((owner.versions.get(record.id)??0)!==record.version)owner.conflicts.set(record.id,record);
    }
    for(const record of requests){
      assertReturnRequest(record.value);
      if(record.value.state==='COMPLETE')assertReturnReceipt({return:record.value.receipt},record.value);
      const candidate=owner.accepted.get(record.id);
      if(!candidate)owner.requests.set(record.id,record);
    }
    // A complete native workspace request can be stored inside its locked
    // browser branch before its separate request transaction is acknowledged.
    // Reopening keeps that exact request visible; retry still requires the
    // original atomic request transaction to finish before any POST.
    for(const draft of owner.drafts.values())if(draft.pending&&!owner.requests.has(draft.pending.requestId)){
      const pending=assertReturnRequest(draft.pending);
      owner.requests.set(pending.requestId,{id:pending.requestId,value:{...returnClone(pending),state:'PENDING'}});
    }
    for(const row of sources)owner.sources.set(row.id,row.meta);
    if(!owner.currentId&&owner.drafts.size)owner.currentId=[...owner.drafts.values()]
      .sort((a,b)=>String(b.updatedAt??b.createdAt).localeCompare(String(a.updatedAt??a.createdAt)))[0].id;
  }
  async function loadHistory(owner,offset=owner.historyOffset){
    const result=await request(owner,encoded({offset,limit:PAGE}));
    need(Array.isArray(result.items)&&Number.isSafeInteger(result.total)&&result.total>=result.items.length&&
      result.offset===offset,'RETURN_BROWSER_HISTORY_CHANGED');
    owner.history=result.items;owner.historyTotal=result.total;owner.historyOffset=offset;
  }
  async function load(owner){
    if(owner.loading)return owner.loading;
    owner.loading=(async()=>{
      try{await loadLocal(owner);}catch(error){owner.storageError=safeError(error);}
      await loadHistory(owner);
      const draft=selected(owner);
      if(draft)await loadReview(owner,draft.reviewId,{draftId:draft.id});
      owner.loaded=true;if(owner===session)render();
    })().finally(()=>{owner.loading=null;if(owner===session)render();});
    return owner.loading;
  }
  function touch(owner,changes){
    const draft=selected(owner);need(draft&&!draft.pendingRequestId&&!draft.pending,'RETURN_BROWSER_PENDING_LOCKED');
    const next={...draft,...changes,editId:uid('edit_'),updatedAt:new Date().toISOString()};
    assertReturnDraft(next);owner.drafts.set(next.id,next);owner.unack.set(next.id,next);
    owner.validation=null;owner.requirements=[];
    clearTimeout(owner.timer);owner.timer=setTimeout(()=>flush(owner).catch(()=>{}),250);
    updateBusy();renderStorageStatus();
    return next;
  }
  function flush(owner){
    clearTimeout(owner.timer);owner.timer=null;
    owner.writer=owner.writer.catch(()=>{}).then(async()=>{
      for(const id of [...owner.unack.keys()]){
        while(owner.unack.has(id)){
          const snapshot=owner.unack.get(id),expectedVersion=owner.versions.get(id)??0;
          try{
            const record=await owner.store.saveDraft(snapshot,{expectedVersion});
            owner.versions.set(id,record.version);
            if(owner.unack.get(id)?.editId===snapshot.editId&&same(owner.unack.get(id),snapshot)){
              owner.unack.delete(id);owner.drafts.set(id,record.value);owner.conflicts.delete(id);
            }
            owner.storageError=null;
          }catch(error){
            owner.storageError=safeError(error);
            if(error?.details?.record)owner.conflicts.set(id,error.details.record);
            if(owner===session)renderStorageStatus();throw error;
          }
        }
      }
      if(owner===session)renderStorageStatus();
    });
    return owner.writer;
  }
  function newDraft(owner,review,prior=null){
    const now=new Date().toISOString(),draft={
      schema:RETURN_BROWSER_DRAFT,id:uid('drdraft_'),editId:uid('edit_'),...binding(owner,review),
      choices:prior?returnClone(prior.choices):{},reviewedBy:prior?.reviewedBy??'',reviewNote:prior?.reviewNote??'',
      createdAt:now,updatedAt:now,serverDraftVersion:0,
    };
    owner.currentId=draft.id;owner.drafts.set(draft.id,draft);owner.versions.set(draft.id,0);owner.unack.set(draft.id,draft);
    owner.validation=null;owner.requirements=[];flush(owner).catch(()=>{});
    return draft;
  }
  function checkPage(owner,value,reviewId){
    const next=binding(owner,value);
    need(next.reviewId===reviewId&&Array.isArray(value.items)&&Number.isSafeInteger(value.total)&&value.total>=0&&
      Number.isSafeInteger(value.offset)&&value.offset>=0,'RETURN_BROWSER_COMPARISON_CHANGED');
    if(owner.review&&(owner.review.reviewId??owner.review.id)===reviewId)
      need(same(binding(owner,owner.review),next),'RETURN_BROWSER_COMPARISON_CHANGED');
    for(const item of value.items){
      need(/^dri_[a-f0-9]{64}$/.test(item.id??'')&&Array.isArray(item.allowedChoices)&&
        item.allowedChoices.every(choice=>['CURRENT','RETURNED','EDIT'].includes(choice))&&
        ['base','current','returned'].every(side=>typeof item[side]?.present==='boolean'),'RETURN_BROWSER_ITEM_INVALID');
      const prior=owner.items.get(item.id);if(prior)need(same(prior,item),'RETURN_BROWSER_ITEM_CHANGED');
      owner.items.set(item.id,returnClone(item));
    }
    return value;
  }
  async function loadReview(owner,reviewId,{draftId=null,offset=0,create=false}={}){
    if((owner.review?.reviewId??owner.review?.id)!==reviewId){owner.review=null;owner.items=new Map();owner.validation=null;}
    const value=await request(owner,encoded({reviewId,offset,limit:PAGE}));
    checkPage(owner,value,reviewId);owner.review=value;owner.page=offset;owner.pageItems=value.items;owner.total=value.total;
    if(draftId){
      const draft=owner.drafts.get(draftId);need(draft&&same(binding(owner,value),binding(owner,draft)),'RETURN_BROWSER_DRAFT_COMPARISON_CHANGED');
      owner.currentId=draftId;
    }else if(create||selected(owner)?.reviewId!==reviewId){
      const saved=[...owner.drafts.values()].find(draft=>draft.reviewId===reviewId);
      if(saved)owner.currentId=saved.id;else if(value.status!=='APPLIED')newDraft(owner,value);else owner.currentId=null;
    }
    owner.sourceId=value.source.id;owner.sourceReceipt=value.source;
    if(value.status==='APPLIED'&&value.return)owner.notice='This comparison has an accepted return at revision '+value.return.revision+'.';
    if(owner===session)render();
    return value;
  }
  async function allItems(owner){
    const reviewId=owner.review?.reviewId??owner.review?.id;need(reviewId,'RETURN_BROWSER_REVIEW_REQUIRED');
    let total=owner.total;
    for(let offset=0;offset<total;offset+=MAX_PAGE){
      const page=await request(owner,encoded({reviewId,offset,limit:MAX_PAGE}));
      checkPage(owner,page,reviewId);need(page.total===total&&page.offset===offset&&page.items.length===Math.min(MAX_PAGE,total-offset),
        'RETURN_BROWSER_COMPARISON_CHANGED');
    }
    need(owner.items.size===total,'RETURN_BROWSER_COMPARISON_INCOMPLETE');
    return [...owner.items.values()];
  }
  function decisions(owner,draft){
    const out=[];
    for(const item of owner.items.values()){
      const selected=draft.choices[item.id];if(!selected?.choice)continue;
      need(item.allowedChoices.includes(selected.choice),'RETURN_BROWSER_DECISION_INVALID',{requirements:[{itemId:item.id,reason:'This choice is not allowed.'}]});
      const decision={itemId:item.id,choice:selected.choice};
      if(selected.choice==='EDIT'){
        try{decision.value=JSON.parse(selected.editText??'');}
        catch{throw Object.assign(new Error('RETURN_BROWSER_EDIT_JSON_INVALID'),{code:'RETURN_BROWSER_EDIT_JSON_INVALID',
          details:{requirements:[{itemId:item.id,reason:'The edited value must be complete valid JSON.'}]}});}
      }
      out.push(decision);
    }
    for(const id of Object.keys(draft.choices))need(owner.items.has(id),'RETURN_BROWSER_DECISION_UNKNOWN');
    return out.sort((a,b)=>a.itemId.localeCompare(b.itemId));
  }
  async function previewChoices(owner){
    await allItems(owner);const draft=selected(owner);need(draft&&!pendingFor(owner),'RETURN_BROWSER_PENDING_LOCKED');
    await flush(owner);
    const body={reviewId:draft.reviewId,expectedRevision:draft.current.revision,
      comparisonSha256:draft.comparisonSha256,decisions:decisions(owner,draft)};
    const result=await request(owner,'/choices',{method:'POST',body});
    need(result.reviewId===draft.reviewId&&result.comparisonSha256===draft.comparisonSha256&&
      same(result.current,draft.current)&&result.valid===true&&
      same(result.decisions.slice().sort((a,b)=>a.itemId.localeCompare(b.itemId)),body.decisions),
      'RETURN_BROWSER_CHOICES_CHANGED');
    if(selected(owner)?.id===draft.id&&selected(owner)?.editId===draft.editId){
      owner.validation={editId:draft.editId,body:returnClone(body),result:returnClone(result)};
      owner.requirements=[];owner.notice='All changed items have an explicit, valid resolution.';
    }
    if(owner===session)render();
  }
  async function chooseFile(owner,file){
    need(file&&file.size>0&&file.size<=SOURCE_LIMIT,'RETURN_SOURCE_TOO_LARGE');
    need(file.name.length>0&&file.name.length<=512&&!/[\u0000-\u001f\u007f/\\]/.test(file.name),'RETURN_SOURCE_FILENAME_INVALID');
    owner.sourceBusy=true;
    try{
      const sha256=await returnSha256(await file.arrayBuffer()),id='drs_'+sha256;
      let meta=owner.sources.get(id),retained=owner.sourceMemory.get(id);
      if(!meta){
        const saved=await owner.store.readSource(id).catch(()=>null);
        if(saved){meta=saved.value;retained=saved.blob;}
      }
      if(!meta)meta={id,sha256,bytes:file.size,filename:file.name,contentType:'application/octet-stream',
        workspaceId:owner.workspaceId,dossierId:owner.dossierId,selectedAt:new Date().toISOString()};
      need(meta.bytes===file.size&&meta.sha256===sha256,'RETURN_BROWSER_SOURCE_CHANGED');
      owner.sources.set(id,meta);owner.sourceMemory.set(id,retained??file);owner.sourceId=id;owner.sourceReceipt=null;
      try{await owner.store.saveSource(meta,retained??file);owner.sourceUnack.delete(id);owner.sourceMemory.delete(id);}
      catch(error){owner.sourceUnack.set(id,{meta,blob:retained??file});owner.storageError=safeError(error);}
      owner.notice='Original file selected. Its checksum identifies these bytes; it does not establish who authored them.';
    }finally{owner.sourceBusy=false;if(owner===session)render();}
  }
  async function sourceFile(owner,id){
    const meta=owner.sources.get(id);need(meta,'RETURN_BROWSER_SOURCE_NOT_FOUND');
    const blob=owner.sourceMemory.get(id)??(await owner.store.readSource(id))?.blob;
    need(blob instanceof Blob&&blob.size===meta.bytes,'RETURN_BROWSER_SOURCE_NOT_FOUND');
    return {meta,blob};
  }
  async function uploadSource(owner){
    need(!owner.sourceUnack.has(owner.sourceId),'RETURN_BROWSER_SOURCE_STORAGE_REQUIRED');
    const {meta,blob}=await sourceFile(owner,owner.sourceId);
    const result=await request(owner,'/sources'+encoded({filename:meta.filename,sha256:meta.sha256,bytes:meta.bytes}),{method:'POST',file:blob});
    need(result?.source?.id===meta.id&&result.source.sha256===meta.sha256&&result.source.bytes===meta.bytes,
      'RETURN_BROWSER_SOURCE_CHANGED');
    owner.sourceReceipt=result.source;
    owner.notice='The complete original file is retained by this Research workspace.';
    if(owner===session)render();
  }
  async function previewSource(owner){
    need(owner.sourceId,'RETURN_BROWSER_SOURCE_REQUIRED');
    if(!owner.sourceReceipt)await uploadSource(owner);
    const sourceId=owner.sourceId,revision=owner.view.revision;
    const result=await request(owner,'/preview',{method:'POST',body:{sourceId,expectedRevision:revision}});
    const selected=binding(owner,result);need(selected.source.id===sourceId&&selected.current.revision===revision,
      'RETURN_BROWSER_COMPARISON_CHANGED');
    owner.review=null;owner.items=new Map();checkPage(owner,result,selected.reviewId);
    owner.review=result;owner.page=result.offset;owner.pageItems=result.items;owner.total=result.total;
    newDraft(owner,result);owner.notice='Review every changed item against the common base before saving.';
    if(owner===session)render();
  }
  async function acceptResult(owner,pending,result){
    // The first received result remains in memory before any validation or local
    // acknowledgement. A storage failure cannot turn it into a second request.
    owner.accepted.set(pending.requestId,{pending:returnClone(pending),result:returnClone(result)});
    const receipt=assertReturnReceipt(result,pending);
    const previous=owner.requests.get(pending.requestId);
    owner.requests.set(pending.requestId,{...previous,id:pending.requestId,value:{...pending,state:'COMPLETE',receipt:returnClone(receipt)}});
    try{
      const saved=await owner.store.completePending(pending.requestId,result);
      owner.requests.set(pending.requestId,saved);owner.accepted.delete(pending.requestId);
    }catch(error){owner.storageError=safeError(error);owner.notice='The return was accepted. Keep or download the receipt until browser storage acknowledges it.';}
    if((owner.review?.reviewId??owner.review?.id)===receipt.reviewId)
      owner.review={...owner.review,status:'APPLIED',return:returnClone(receipt)};
    owner.notice=owner.accepted.has(pending.requestId)?owner.notice:'Return accepted at revision '+receipt.revision+'. The original request remains available for recovery.';
    await loadHistory(owner,0);
    if(owner===session&&getWorkspace()?.workspaceId===owner.workspaceId&&getDossier()?.id===owner.dossierId){
      const view=await api('/api/dossiers/'+encodeURIComponent(owner.dossierId),{
        sourceProjection:'full',workspaceId:owner.workspaceId,
      });
      if(owner===session&&getWorkspace()?.workspaceId===owner.workspaceId&&getDossier()?.id===owner.dossierId)
        await onReceived(view);
    }
    if(owner===session)render();
    return receipt;
  }
  async function sendPending(owner,pending){
    assertReturnRequest(pending);
    const candidate=owner.accepted.get(pending.requestId);
    if(candidate){await acceptResult(owner,candidate.pending,candidate.result);return;}
    let retained=await owner.store.readPending(pending.requestId);
    if(!retained){
      // A native draft import may have retained its full locked branch before a
      // failed IndexedDB request transaction. A retry first finishes that exact
      // original transaction; it never sends an unacknowledged request.
      await flush(owner);
      const draft=owner.drafts.get(pending.draftId);
      need(draft?.pending&&same(draft.pending.body,pending.body)&&same(binding(owner,draft),binding(owner,pending)),
        'RETURN_BROWSER_REQUEST_NOT_RETAINED');
      const saved=await owner.store.preparePending(pending,draft,{expectedVersion:owner.versions.get(draft.id)});
      owner.requests.set(pending.requestId,saved.pending);owner.drafts.set(draft.id,saved.draft.value);
      owner.versions.set(draft.id,saved.draft.version);retained=saved.pending;
    }
    need(retained&&same(retained.value.body,pending.body)&&same(binding(owner,retained.value),binding(owner,pending)),
      'RETURN_BROWSER_REQUEST_NOT_RETAINED');
    if(retained.value.state==='COMPLETE'){
      await acceptResult(owner,retained.value,{return:retained.value.receipt,replayed:true});return;
    }
    try{
      const result=await request(owner,'/reviews',{method:'POST',body:returnClone(pending.body)});
      owner.accepted.set(pending.requestId,{pending:returnClone(pending),result:returnClone(result)});
      await acceptResult(owner,pending,result);
    }catch(error){
      if(owner.requests.get(pending.requestId)?.value.state==='COMPLETE')throw error;
      const definite=Number.isInteger(error.status)&&error.status>=400&&error.status<500&&DEFINITE_REJECTIONS.has(error.code);
      const state=definite?'REJECTED':'OUTCOME_UNKNOWN';
      owner.requests.set(pending.requestId,{...retained,value:{...retained.value,state,lastError:safeError(error)}});
      try{await owner.store.notePending(pending.requestId,{state,lastError:safeError(error)});}
      catch(storage){owner.storageError=safeError(storage);}
      owner.notice=definite?'The native service rejected this exact request. Its complete original body is retained.':
        'The outcome is unknown. Check the original request ID or retry its unchanged body.';
      throw error;
    }
  }
  async function submitReview(owner){
    const current=selected(owner);
    need(current&&owner.validation?.editId===current.editId,'RETURN_BROWSER_CHOICES_PREVIEW_REQUIRED');
    need(!pendingFor(owner)&&activePending(owner).length===0,'RETURN_BROWSER_PENDING_REQUEST_EXISTS');
    await flush(owner);
    const draft=selected(owner);need(draft?.editId===current.editId,'RETURN_BROWSER_DRAFT_CHANGED');
    const body={requestId:uid('return_'),...returnClone(owner.validation.body),
      reviewedBy:draft.reviewedBy,reviewNote:draft.reviewNote};
    const pending={schema:RETURN_BROWSER_REQUEST,...binding(owner,draft),draftId:draft.id,
      requestId:body.requestId,body,preparedAt:new Date().toISOString()};
    assertReturnRequest(pending);
    const saved=await owner.store.preparePending(pending,draft,{expectedVersion:owner.versions.get(draft.id)});
    owner.requests.set(pending.requestId,saved.pending);owner.drafts.set(draft.id,saved.draft.value);
    owner.versions.set(draft.id,saved.draft.version);owner.unack.delete(draft.id);owner.validation=null;
    if(owner===session)render();
    await sendPending(owner,saved.pending.value);
  }
  async function recoverRequest(owner,pending){
    assertReturnRequest(pending);
    const result=await request(owner,encoded({requestId:pending.requestId}));
    need(result&&Object.hasOwn(result,'return'),'RETURN_BROWSER_REQUEST_STATUS_INVALID');
    if(result.return===null){
      owner.notice='No accepted receipt is currently recorded for '+pending.requestId+'. Its original request can be retried unchanged.';
      if(owner===session)render();return;
    }
    await acceptResult(owner,pending,{...result,replayed:true});
  }
  function portableDraft(draft){
    const {remoteAttempt,serverReceipt,...body}=draft;
    return returnClone(body);
  }
  function recovery(owner,draft=selected(owner)){
    const pending=pendingFor(owner,draft),candidate=pending?owner.accepted.get(pending.requestId):null;
    return {
      schema:RECOVERY,workspaceId:owner.workspaceId,dossierId:owner.dossierId,
      draft:draft?returnClone(draft):null,
      pending:pending?returnClone(pending):null,
      receivedResult:candidate?returnClone(candidate.result):null,
      exportedAt:new Date().toISOString(),
    };
  }
  async function saveServerDraft(owner){
    const draft=selected(owner);need(draft&&!pendingFor(owner),'RETURN_BROWSER_PENDING_LOCKED');
    if(draft.remoteAttempt){await recoverServerDraft(owner);return;}
    await flush(owner);
    const input={reviewId:draft.reviewId,expectedDraftVersion:draft.serverDraftVersion??0,draft:portableDraft(draft)};
    need(new TextEncoder().encode(JSON.stringify(input)).length<=16*1024*1024,'RETURN_BROWSER_DRAFT_TOO_LARGE');
    const next=touch(owner,{remoteAttempt:{input,preparedAt:new Date().toISOString()}});
    await flush(owner);
    await sendServerDraft(owner,next.id,input);
  }
  async function acknowledgeServerDraft(owner,draftId,input,result){
    need(result.reviewId===input.reviewId&&Number.isSafeInteger(result.draftVersion)&&
      result.draftVersion>=input.expectedDraftVersion+1&&same(result.draft,input.draft),'RETURN_BROWSER_SERVER_DRAFT_CHANGED');
    const current=owner.drafts.get(draftId);
    need(current?.remoteAttempt&&same(current.remoteAttempt.input,input),'RETURN_BROWSER_SERVER_DRAFT_INPUT_CHANGED');
    const next={...current,editId:uid('edit_'),serverDraftVersion:result.draftVersion,
      serverReceipt:{reviewId:result.reviewId,draftVersion:result.draftVersion,savedAt:result.savedAt},
      remoteAttempt:undefined,updatedAt:new Date().toISOString()};
    owner.drafts.set(draftId,next);owner.unack.set(draftId,next);await flush(owner);
    owner.notice='Workspace draft version '+result.draftVersion+' is saved. The full browser branch remains available.';
  }
  async function sendServerDraft(owner,draftId,input){
    const result=await request(owner,'/draft',{method:'POST',body:returnClone(input)});
    // Retain the actual reply in the already-saved original attempt before the
    // local acknowledgement. Lost replies are reconciled by exact draft bytes.
    const draft=owner.drafts.get(draftId);
    need(draft?.remoteAttempt&&same(draft.remoteAttempt.input,input),'RETURN_BROWSER_SERVER_DRAFT_INPUT_CHANGED');
    owner.drafts.set(draftId,{...draft,remoteAttempt:{...draft.remoteAttempt,result:returnClone(result)}});
    owner.unack.set(draftId,owner.drafts.get(draftId));
    await acknowledgeServerDraft(owner,draftId,input,result);
  }
  async function recoverServerDraft(owner){
    const draft=selected(owner),attempt=draft?.remoteAttempt;
    need(attempt,'RETURN_BROWSER_SERVER_DRAFT_ATTEMPT_REQUIRED');
    if(attempt.result){await acknowledgeServerDraft(owner,draft.id,attempt.input,attempt.result);return;}
    const result=await request(owner,'/draft'+encoded({reviewId:draft.reviewId}));
    if(result.draft&&same(result.draft,attempt.input.draft)){
      await acknowledgeServerDraft(owner,draft.id,attempt.input,result);return;
    }
    if(result.draftVersion===attempt.input.expectedDraftVersion){
      owner.notice='The workspace has not advanced beyond the saved draft base. Retry the exact retained draft save when ready.';
      owner.remoteConflict={result,input:attempt.input,canRetry:true};
    }else{
      owner.remoteConflict={result,input:attempt.input,canRetry:false};
      throw Object.assign(new Error('RETURN_DRAFT_CONFLICT'),{code:'RETURN_DRAFT_CONFLICT',
        details:{expectedDraftVersion:attempt.input.expectedDraftVersion,actualDraftVersion:result.draftVersion}});
    }
    if(owner===session)render();
  }
  async function readServerDraft(owner){
    const reviewId=owner.review?.reviewId??owner.review?.id;need(reviewId,'RETURN_BROWSER_REVIEW_REQUIRED');
    const result=await request(owner,'/draft'+encoded({reviewId}));
    owner.serverDraftRead=result;
    const selectedBinding=binding(owner,owner.review);
    need(result.reviewId===reviewId&&result.dossierId===owner.dossierId&&result.sourceId===selectedBinding.source.id&&
      result.comparisonSha256===selectedBinding.comparisonSha256&&Number.isSafeInteger(result.draftVersion)&&
      result.draftVersion>=0,'RETURN_BROWSER_SERVER_DRAFT_CHANGED');
    if(result.draft===null){owner.notice='No workspace draft is saved for this comparison.';return;}
    need(result.draftVersion>0&&plain(result.draft),'RETURN_BROWSER_SERVER_DRAFT_CHANGED');
    const incoming=result.draft,browserDraft=incoming.schema===RETURN_BROWSER_DRAFT?assertReturnDraft(incoming):null;
    if(browserDraft)need(same(binding(owner,incoming),selectedBinding),'RETURN_BROWSER_DRAFT_COMPARISON_CHANGED');
    for(const [key,value]of Object.entries({workspaceId:owner.workspaceId,dossierId:owner.dossierId,reviewId,
      sourceId:selectedBinding.source.id,comparisonSha256:selectedBinding.comparisonSha256}))
      need(incoming[key]===undefined||incoming[key]===value,'RETURN_BROWSER_DRAFT_COMPARISON_CHANGED');
    const wrapped=incoming.pending?assertReturnRequest(incoming.pending):null;
    if(wrapped)need(same(binding(owner,wrapped),selectedBinding),'RETURN_BROWSER_DRAFT_REQUEST_CHANGED');
    const requestBody=incoming.pendingRequest??incoming.request??wrapped?.body??null;
    if(incoming.pendingRequest&&incoming.request)
      need(same(incoming.pendingRequest,incoming.request),'RETURN_BROWSER_DRAFT_REQUEST_CHANGED');
    if(wrapped&&requestBody)need(same(wrapped.body,requestBody),'RETURN_BROWSER_DRAFT_REQUEST_CHANGED');
    need(!incoming.pendingRequestId||requestBody&&incoming.pendingRequestId===requestBody.requestId,
      'RETURN_BROWSER_SERVER_DRAFT_PENDING');
    const now=new Date().toISOString();
    let draft={...(browserDraft?returnClone(browserDraft):{}),schema:RETURN_BROWSER_DRAFT,
      id:uid('drdraft_'),editId:uid('edit_'),...selectedBinding,
      choices:browserDraft?returnClone(browserDraft.choices):plain(incoming.choices)?returnClone(incoming.choices):{},
      reviewedBy:browserDraft?.reviewedBy??(typeof incoming.reviewedBy==='string'?incoming.reviewedBy:''),
      reviewNote:browserDraft?.reviewNote??(typeof incoming.reviewNote==='string'?incoming.reviewNote:''),
      createdAt:browserDraft?.createdAt??now,updatedAt:now,serverDraftVersion:result.draftVersion,
      serverReceipt:{reviewId,draftVersion:result.draftVersion,savedAt:result.savedAt},
      originalWorkspaceDraft:returnClone(result),...(browserDraft?{importedFromDraft:browserDraft.id}:{}),
      remoteAttempt:undefined};
    delete draft.pendingRequestId;delete draft.pending;
    let pending=null;
    if(requestBody){
      pending=assertReturnRequest({schema:RETURN_BROWSER_REQUEST,...selectedBinding,draftId:draft.id,
        requestId:requestBody.requestId,body:returnClone(requestBody),preparedAt:now});
      const retained=await owner.store.readPending(pending.requestId);
      if(retained){
        need(same(retained.value.body,pending.body)&&same(binding(owner,retained.value),selectedBinding),
          'RETURN_BROWSER_REQUEST_CONFLICT');
        owner.requests.set(retained.id,retained);await loadLocal(owner);
        await loadReview(owner,reviewId,{draftId:retained.value.draftId});
        owner.notice='The same workspace request is already retained in this browser. Its original body and branch remain selected.';
        return;
      }
      // Native and CLI drafts have no browser IDs. Preserve the entire native
      // envelope and original request order, then freeze that request locally.
      draft.choices=Object.fromEntries(pending.body.decisions.map(item=>[item.itemId,{
        choice:item.choice,...(item.choice==='EDIT'?{editText:JSON.stringify(item.value,null,2)}:{}),
      }]));
      draft.reviewedBy=pending.body.reviewedBy;draft.reviewNote=pending.body.reviewNote??'';
      draft.pending=returnClone(pending);
    }
    assertReturnDraft(draft);owner.currentId=draft.id;owner.drafts.set(draft.id,draft);
    owner.versions.set(draft.id,0);owner.unack.set(draft.id,draft);owner.validation=null;
    if(pending)owner.requests.set(pending.requestId,{id:pending.requestId,value:{...pending,state:'PENDING'}});
    await flush(owner);
    if(pending){
      const saved=await owner.store.preparePending(pending,draft,{expectedVersion:owner.versions.get(draft.id)});
      owner.requests.set(pending.requestId,saved.pending);owner.drafts.set(draft.id,saved.draft.value);
      owner.versions.set(draft.id,saved.draft.version);owner.unack.delete(draft.id);
      owner.notice='The complete workspace draft and its exact original request are retained. Check that request before retrying.';
    }else owner.notice='The complete workspace draft was opened as a separate browser branch. Existing local branches were preserved.';
  }
  async function importRecovery(owner,file){
    need(file,'RETURN_BROWSER_RECOVERY_REQUIRED');
    const input=JSON.parse(await file.text());
    need(input?.schema===RECOVERY&&input.workspaceId===owner.workspaceId&&input.dossierId===owner.dossierId,
      'RETURN_BROWSER_RECOVERY_SCOPE_CHANGED');
    const original=assertReturnDraft(input.draft);
    need(original.workspaceId===owner.workspaceId&&original.dossierId===owner.dossierId,'RETURN_BROWSER_RECOVERY_SCOPE_CHANGED');
    const pending=input.pending?assertReturnRequest(input.pending):null;
    if(pending){
      need(same(binding(owner,pending),binding(owner,original))&&pending.draftId===original.id,
        'RETURN_BROWSER_DRAFT_REQUEST_CHANGED');
      const prior=await owner.store.readPending(pending.requestId);
      if(prior){
        need(same(prior.value.body,pending.body)&&same(binding(owner,prior.value),binding(owner,pending)),
          'RETURN_BROWSER_REQUEST_CONFLICT');
        owner.requests.set(prior.id,prior);
        await loadLocal(owner);
        await loadReview(owner,pending.reviewId,{draftId:prior.value.draftId});
        if(input.receivedResult)await acceptResult(owner,prior.value,input.receivedResult);
        owner.notice='The identical original request is already retained in this browser.';return;
      }
    }
    const copy=returnClone(original);
    if(pending){
      // The displayed locked choices/reviewer come from the intact request.
      copy.choices=Object.fromEntries(pending.body.decisions.map(item=>[item.itemId,{
        choice:item.choice,...(item.choice==='EDIT'?{editText:JSON.stringify(item.value,null,2)}:{}),
      }]));
      copy.reviewedBy=pending.body.reviewedBy;copy.reviewNote=pending.body.reviewNote??'';
      delete copy.pendingRequestId;delete copy.pending;
    }else{
      copy.id=uid('drdraft_');copy.editId=uid('edit_');delete copy.pendingRequestId;delete copy.pending;
      copy.importedFromDraft=original.id;
    }
    const previous=await owner.store.readDraft(copy.id);
    need(!previous||same(previous.value,copy),'RETURN_BROWSER_DRAFT_CONFLICT',{record:previous});
    owner.currentId=copy.id;owner.drafts.set(copy.id,copy);owner.versions.set(copy.id,previous?.version??0);
    if(!previous)owner.unack.set(copy.id,copy);
    await loadReview(owner,copy.reviewId,{draftId:copy.id});await flush(owner);
    if(pending){
      const saved=await owner.store.preparePending(pending,copy,{expectedVersion:owner.versions.get(copy.id)});
      owner.requests.set(pending.requestId,saved.pending);owner.drafts.set(copy.id,saved.draft.value);owner.versions.set(copy.id,saved.draft.version);
      if(input.receivedResult)await acceptResult(owner,pending,input.receivedResult);
      else if(pending.receipt)await acceptResult(owner,pending,{return:pending.receipt,replayed:true});
      owner.notice='The original submitted request is restored. Check its status before retrying.';
    }else owner.notice='The complete recovery draft is retained as a separate local branch.';
    if(owner===session)render();
  }
  async function keepLocalBranch(owner,id){
    const localDraft=owner.unack.get(id);need(localDraft,'RETURN_BROWSER_LOCAL_BRANCH_REQUIRED');
    need(!localDraft.pendingRequestId&&!localDraft.pending,'RETURN_BROWSER_PENDING_LOCKED');
    const current=owner.conflicts.get(id);
    const copy={...returnClone(localDraft),id:uid('drdraft_'),editId:uid('edit_'),forkedFrom:id,updatedAt:new Date().toISOString()};
    owner.drafts.set(copy.id,copy);owner.versions.set(copy.id,0);owner.unack.set(copy.id,copy);owner.currentId=copy.id;
    // The old local branch has been copied in full before adopting any newer
    // saved snapshot. A failed write keeps the copied branch unacknowledged.
    owner.unack.delete(id);
    if(current){owner.drafts.set(id,current.value);owner.versions.set(id,current.version);}
    owner.conflicts.delete(id);await flush(owner);
    owner.notice='Your complete edits are kept in a separate branch; the other saved draft remains intact.';
  }
  function expectedIdentity(owner,reviewId,returnId=null){
    const review=owner.review;
    need((review?.reviewId??review?.id)===reviewId,'RETURN_BROWSER_REVIEW_REQUIRED');
    const receipt=returnId?review.return:null;
    need(!returnId||receipt?.id===returnId,'RETURN_BROWSER_RETURN_SELECTION_CHANGED');
    return {reviewId,returnId,sourceId:review.source.id,comparisonSha256:review.comparisonSha256,
      revisionSha256:receipt?.revisionSha256??null};
  }
  async function receiveDownload(owner,suffix,{identity,itemId,side,source=false,fallback}){
    const response=await request(owner,suffix,{download:true}),headers=response.headers;
    try{
    const actual={
      reviewId:headers.get('x-research-return-review-id'),returnId:headers.get('x-research-return-id'),
      sourceId:headers.get('x-research-return-source-id'),comparisonSha256:headers.get('x-research-return-comparison-sha256'),
      revisionSha256:headers.get('x-research-return-revision-sha256'),
    };
    need(same(actual,identity),'RETURN_BROWSER_EXPORT_SELECTION_CHANGED');
    if(itemId)need(headers.get('x-research-return-item-id')===itemId&&headers.get('x-research-return-side')===side,
      'RETURN_BROWSER_VALUE_SELECTION_CHANGED');
    const expectedSha= headers.get('x-content-sha256'),declared=headers.get('content-length');
    need(/^[a-f0-9]{64}$/.test(expectedSha??'')&&declared!==null&&/^[0-9]+$/.test(declared)&&
      Number(declared)<=SOURCE_LIMIT,'RETURN_BROWSER_EXPORT_DESCRIPTOR_INVALID');
    const chunks=[];let bytes=0;
      for await(const chunk of response.body){
        bytes+=chunk.length;need(bytes<=Number(declared)&&bytes<=SOURCE_LIMIT,'RETURN_BROWSER_EXPORT_TOO_LARGE');chunks.push(chunk);
      }
      need(bytes===Number(declared),'RETURN_BROWSER_EXPORT_INCOMPLETE');
      const blob=new Blob(chunks,{type:headers.get('content-type')??'application/octet-stream'});
      chunks.length=0;
      const sha256=await returnSha256(await blob.arrayBuffer());
      need(sha256===expectedSha,'RETURN_BROWSER_EXPORT_CHANGED');
      if(source)need(sha256===owner.review.source.sha256&&bytes===owner.review.source.bytes,'RETURN_BROWSER_SOURCE_CHANGED');
      return {blob,filename:filename(response,fallback),bytes,sha256,selection:actual};
    }finally{
      if(typeof response.body?.cancel==='function'&&!response.body.locked)await response.body.cancel().catch(()=>{});
    }
  }
  async function exportReview(owner,format,returnId=null){
    const reviewId=owner.review?.reviewId??owner.review?.id,identity=expectedIdentity(owner,reviewId,returnId);
    const saved=await receiveDownload(owner,'/export'+encoded({reviewId,returnId,format}),{
      identity,source:format==='source',fallback:'Dossier_Return_'+reviewId+'.'+format,
    });
    downloadBlob(saved.blob,saved.filename);owner.notice='Downloaded '+saved.filename+' — '+formatBytes(saved.bytes)+', SHA-256 '+saved.sha256+'.';
    if(owner===session)render();
  }
  async function readValue(owner,item,side,{download=false}={}){
    const reviewId=owner.review?.reviewId??owner.review?.id;
    const saved=await receiveDownload(owner,'/value'+encoded({reviewId,itemId:item.id,side}),{
      identity:expectedIdentity(owner,reviewId),itemId:item.id,side,fallback:item.id+'_'+side+'.json',
    });
    const value=JSON.parse(await saved.blob.text());
    need(value.reviewId===reviewId&&value.itemId===item.id&&value.side===side&&
      value.present===item[side].present&&value.sha256===item[side].sha256&&
      (value.present?Object.hasOwn(value,'value'):!Object.hasOwn(value,'value')),'RETURN_BROWSER_VALUE_CHANGED');
    if(download){downloadBlob(saved.blob,saved.filename);return;}
    if(valueDialog){valueDialog.close();valueDialog.remove();}
    const dialog=node('dialog',null,'dr-value-dialog');valueDialog=dialog;
    const heading=node('h2',side.charAt(0).toUpperCase()+side.slice(1)+' value — '+(item.label??item.kind??item.id));
    heading.id='dr-value-dialog-title';dialog.setAttribute('aria-labelledby',heading.id);
    const close=node('button','Close');close.type='button';close.onclick=()=>{dialog.close();dialog.remove();if(valueDialog===dialog)valueDialog=null;};
    const top=node('header');top.append(heading,close);
    const text=node('textarea');text.readOnly=true;text.spellcheck=false;text.value=JSON.stringify(value,null,2);
    text.setAttribute('aria-label','Complete original value envelope');
    const detail=node('p','The envelope preserves the complete native component. Component identity: '+String(value.sha256)+
      '. Download byte identity: '+saved.sha256+'.','dr-meta');
    const buttons=node('div',null,'dr-actions');
    const get=node('button','Download full value');get.type='button';get.onclick=()=>downloadBlob(saved.blob,saved.filename);buttons.append(get);
    if(value.present&&item.allowedChoices.includes('EDIT')&&!pendingFor(owner)&&owner.review.status!=='APPLIED'){
      const edit=node('button','Use this complete value as an edit');edit.type='button';
      edit.onclick=()=>{
        need(owner===session&&(owner.review?.reviewId??owner.review?.id)===reviewId,'RETURN_BROWSER_REVIEW_CHANGED');
        const draft=selected(owner);touch(owner,{choices:{...draft.choices,[item.id]:{choice:'EDIT',editText:JSON.stringify(value.value,null,2)}}});
        dialog.close();dialog.remove();valueDialog=null;render();
      };buttons.append(edit);
    }
    dialog.append(top,detail,text,buttons);document.body.append(dialog);dialog.showModal();
  }
  function button(owner,label,work,{disabled=false,primary=false,focus=null,localOnly=false}={}){
    const result=node('button',label,primary?'primary':null);result.type='button';
    result.dataset.drControl='';result.dataset.drDisabled=disabled?'1':'0';
    if(focus)result.dataset.drFocus=focus;
    result.disabled=disabled||owner.busy>0||!!owner.loading||isBusy();
    result.onclick=()=>localOnly?local(owner,work):go(owner,work);
    return result;
  }
  function control(owner,input,{disabled=false,focus}={}){
    input.dataset.drControl='';input.dataset.drDisabled=disabled?'1':'0';
    if(focus)input.dataset.drFocus=focus;
    input.disabled=disabled||owner.busy>0||!!owner.loading||isBusy();
    return input;
  }
  function updateBusy(){
    if(!root)return;
    const busy=!session||session.busy>0||!!session.loading||isBusy();
    root.setAttribute('aria-busy',String(!!busy));
    root.querySelectorAll('[data-dr-control]').forEach(input=>{input.disabled=busy||input.dataset.drDisabled==='1';});
    const draft=selected(session),submit=root.querySelector('[data-dr-focus="submit-return"]');
    if(submit)submit.disabled=busy||submit.dataset.drDisabled==='1'||!draft||session.validation?.editId!==draft.editId;
    const validation=root.querySelector('[data-dr-validation]');
    if(validation&&session.validation?.editId!==draft?.editId){
      validation.textContent='Check the complete choice set after editing. Saving freezes its original request before sending it.';
      validation.className='dr-meta';
    }
  }
  function labelFor(item,choice){
    const native=item.choiceLabels?.[choice];
    if(typeof native==='string'&&native.length)return native;
    if(plain(native)&&typeof native.label==='string')return native.label;
    if(item.treatment==='RETAINED_TYPED_PROPOSAL'||item.treatment==='RETAINED_EXTENSION')
      return choice==='RETURNED'?'Retain returned proposal':'Keep current authority';
    if(choice==='CURRENT')return item.current.present?'Keep current value':'Decline incoming addition';
    if(choice==='RETURNED')return item.returned.present?'Use returned value':'Remove current value';
    return 'Use reviewed edit';
  }
  function effectFor(item,choice){
    const effect=plain(item.effect)?item.effect[choice]:item.effect;
    if(typeof effect==='string')return effect;
    if(typeof item.choiceLabels?.[choice]?.effect==='string')return item.choiceLabels[choice].effect;
    if(item.treatment==='RETAINED_TYPED_PROPOSAL'||item.treatment==='RETAINED_EXTENSION')
      return choice==='RETURNED'?'The returned branch is retained as a reviewed proposal. Current native authority remains active.':
        'The current native authority remains active. The complete original returned source stays retained.';
    if(choice==='RETURNED'&&!item.returned.present)return 'The current authored value is removed if its native dependencies allow this change.';
    return '';
  }
  function identityTable(review){
    const table=node('table',null,'dr-identities'),head=node('thead'),header=node('tr');
    for(const title of ['Branch','Revision','Original history identity'])header.append(node('th',title));
    head.append(header);const body=node('tbody');
    for(const [key,label]of [['base','Common base'],['current','Current reviewed branch'],['returned','Returned branch']]){
      const row=node('tr');row.append(node('th',label),node('td',review[key].revision),node('td',review[key].sha256,'dr-digest'));body.append(row);
    }
    table.append(head,body);return table;
  }
  function storagePanel(){
    const area=node('section',null,'dr-storage');area.dataset.drStorage='';
    for(const owner of sessions.values()){
      const outstanding=owner.unack.size+owner.sourceUnack.size+owner.accepted.size;
      if(!outstanding&&!owner.storageError)continue;
      const header=node('h3',outstanding?'Browser work awaiting storage':'Browser storage');
      area.append(header,node('p',(owner.view?.title??owner.dossierId)+' · '+owner.workspaceId,'dr-meta'));
      if(owner.storageError)area.append(node('p',owner.storageError.code,'dr-warning'));
      for(const [id,draft]of owner.unack){
        const row=node('div',null,'dr-recovery-row');
        row.append(node('span','Complete draft branch '+id));
        row.append(button(owner,'Download this branch',()=>downloadJson(recovery(owner,draft),'Dossier_Return_Draft_'+id+'.json'),{localOnly:true}));
        if(owner.conflicts.has(id))row.append(button(owner,'Keep local edits as a new branch',()=>keepLocalBranch(owner,id),{localOnly:true}));
        area.append(row);
      }
      for(const [id,source]of owner.sourceUnack){
        const row=node('div',null,'dr-recovery-row');
        row.append(node('span','Original file '+source.meta.filename+' · '+formatBytes(source.meta.bytes)));
        row.append(button(owner,'Download original bytes',()=>downloadBlob(source.blob,source.meta.filename),{localOnly:true}));
        area.append(row);
      }
      for(const [id,candidate]of owner.accepted){
        const row=node('div',null,'dr-recovery-row');
        row.append(node('span','Original reply for '+id));
        row.append(button(owner,'Download request and reply',()=>{
          const draft=owner.drafts.get(candidate.pending.draftId);
          downloadJson(recovery(owner,draft),'Dossier_Return_Reply_'+id+'.json');
        },{localOnly:true}));
        row.append(button(owner,'Acknowledge retained reply',()=>acceptResult(owner,candidate.pending,candidate.result)));
        area.append(row);
      }
      area.append(button(owner,'Retry browser storage',async()=>{
        await flush(owner);
        for(const [id,item]of [...owner.sourceUnack]){
          await owner.store.saveSource(item.meta,item.blob);owner.sourceUnack.delete(id);owner.sourceMemory.delete(id);
        }
        await loadLocal(owner);owner.storageError=null;if(owner===session)render();
      },{localOnly:true}));
    }
    return area;
  }
  function renderStorageStatus(){
    if(!visible)return;
    const existing=root.querySelector('[data-dr-storage]');
    if(existing)existing.replaceWith(storagePanel());
    const note=root.querySelector('[data-dr-save-state]');
    if(note&&session){
      const draft=selected(session);
      note.textContent=draft?(session.unack.has(draft.id)?'Complete edits are retained in memory; browser save pending.':
        'Browser draft '+(session.versions.get(draft.id)??0)+' is retained.'):
        'Open a comparison to begin a review.';
    }
    updateBusy();
  }
  function renderSource(owner){
    const box=node('section',null,'dr-source');
    box.append(node('h3','Returned dossier source'),node('p',
      'Choose the complete JSON or gzip dossier returned by your collaborator. The original bytes and both branches stay available throughout this review.'));
    const file=control(owner,node('input'),{focus:'source-file'});file.type='file';file.accept='.json,.gz,.gzip,application/json,application/gzip';
    file.setAttribute('aria-label','Original returned dossier JSON or gzip');
    file.onchange=()=>{const selectedFile=file.files?.[0];if(selectedFile)go(owner,()=>chooseFile(owner,selectedFile));};
    const saved=control(owner,node('select'),{focus:'source-selection'});
    saved.append(new Option('Choose a retained original file',''));
    for(const meta of owner.sources.values())saved.append(new Option(meta.filename+' · '+formatBytes(meta.bytes),meta.id));
    saved.value=owner.sources.has(owner.sourceId)?owner.sourceId:'';
    saved.onchange=()=>{owner.sourceId=saved.value||null;owner.sourceReceipt=null;owner.notice=null;render();};
    box.append(field('New original file · up to 256 MiB',file),field('Files already retained in this browser',saved));
    const meta=owner.sources.get(owner.sourceId),received=owner.sourceReceipt;
    if(meta||received){
      const selected=meta??received;
      box.append(node('p',(selected.filename??'Original file')+' · '+formatBytes(selected.bytes),'dr-meta'));
      box.append(node('p','SHA-256 '+selected.sha256,'dr-digest'));
      box.append(node('p','A checksum identifies file bytes. It does not establish authorship or endorsement.','dr-meta'));
    }
    const actions=node('div',null,'dr-actions');
    actions.append(button(owner,'Retain original source',()=>uploadSource(owner),{disabled:!owner.sources.has(owner.sourceId)||owner.sourceUnack.has(owner.sourceId)}));
    actions.append(button(owner,'Compare with current dossier',()=>previewSource(owner),{
      disabled:!owner.sourceId||owner.sourceUnack.has(owner.sourceId)||activePending(owner).length>0,primary:true,
    }));
    if(owner.sources.has(owner.sourceId))actions.append(button(owner,'Download browser original',async()=>{
      const {meta,blob}=await sourceFile(owner,owner.sourceId);downloadBlob(blob,meta.filename);
    },{localOnly:true}));
    box.append(actions);
    if(owner.sourceUnack.has(owner.sourceId))box.append(node('p','The complete file is still held in this browser session. Retry browser storage before sending it; the original-byte download above remains available.','dr-warning'));
    if(owner.sourceBusy)box.append(node('p','Reading and hashing the complete selected file…','dr-meta'));
    if(activePending(owner).length)box.append(node('p','Resolve the retained pending review before starting a new comparison.','dr-warning'));
    return box;
  }
  function renderDrafts(owner){
    const box=node('section',null,'dr-draft-tools'),select=control(owner,node('select'),{focus:'draft-selection'});
    select.append(new Option('Choose a saved browser branch',''));
    for(const draft of owner.drafts.values()){
      const pending=pendingFor(owner,draft);
      select.append(new Option((pending?'Submitted · ':'Draft · ')+stamp(draft.updatedAt??draft.createdAt)+
        ' · '+draft.reviewId.slice(0,20)+(owner.unack.has(draft.id)?' · awaiting storage':''),draft.id));
    }
    select.value=owner.currentId??'';
    select.onchange=()=>{const id=select.value,draft=owner.drafts.get(id);if(draft)go(owner,()=>loadReview(owner,draft.reviewId,{draftId:id}));};
    box.append(field('Saved browser reviews',select));
    const actions=node('div',null,'dr-actions'),draft=selected(owner);
    actions.append(button(owner,'Reload saved branches',async()=>{await loadLocal(owner);if(owner===session)render();},{localOnly:true}));
    actions.append(button(owner,'Download full recovery',()=>downloadJson(recovery(owner),'Dossier_Return_Recovery_'+draft.id+'.json'),{disabled:!draft,localOnly:true}));
    const input=control(owner,node('input'),{focus:'recovery-file'});input.type='file';input.accept='.json,application/json';
    input.setAttribute('aria-label','Import full return draft or request recovery');
    input.onchange=()=>{const file=input.files?.[0];if(file)go(owner,()=>importRecovery(owner,file));};
    box.append(actions,field('Import full draft or request recovery',input));
    const status=node('p',draft?(owner.unack.has(draft.id)?'Complete edits are retained in memory; browser save pending.':
      'Browser draft '+(owner.versions.get(draft.id)??0)+' is retained.'):'Open a comparison to begin a review.','dr-meta');
    status.dataset.drSaveState='';box.append(status);
    return box;
  }
  function renderPending(owner){
    const box=node('section',null,'dr-pending');
    if(!owner.requests.size)return box;
    box.append(node('h3','Original review requests'));
    for(const row of owner.requests.values()){
      const pending=row.value,draft=owner.drafts.get(pending.draftId),card=node('article',null,'dr-request');
      card.append(node('h4',pending.state==='COMPLETE'?'Accepted return':'Retained request'),
        node('p',pending.requestId,'dr-digest'),
        node('p',(pending.state??'PENDING')+' · comparison '+pending.reviewId+' · reviewed current revision '+pending.current.revision,'dr-meta'));
      if(pending.receipt)card.append(node('p','Accepted revision '+pending.receipt.revision+' · '+pending.receipt.revisionSha256,'dr-digest'));
      if(pending.lastError)card.append(node('p',pending.lastError.code,'dr-warning'));
      const actions=node('div',null,'dr-actions');
      actions.append(button(owner,'Check original request',()=>recoverRequest(owner,pending)));
      if(pending.state!=='COMPLETE')actions.append(button(owner,'Retry exact saved request',()=>sendPending(owner,pending)));
      if(draft)actions.append(button(owner,'Open this review',()=>loadReview(owner,pending.reviewId,{draftId:draft.id})));
      actions.append(button(owner,'Download original request',()=>downloadJson({
        schema:RECOVERY,workspaceId:owner.workspaceId,dossierId:owner.dossierId,
        draft:draft??null,pending,receivedResult:owner.accepted.get(pending.requestId)?.result??null,
        exportedAt:new Date().toISOString(),
      },'Dossier_Return_Request_'+pending.requestId.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json'),{localOnly:true}));
      card.append(actions);box.append(card);
    }
    box.append(node('p','An unknown outcome keeps its original request ID and complete body. Checking status does not create another review.','dr-meta'));
    return box;
  }
  function renderItem(owner,item,index){
    const draft=selected(owner),pending=pendingFor(owner,draft);
    const locked=!draft||!!pending||!!draft?.pendingRequestId||owner.review?.status==='APPLIED';
    const selectedChoice=pending?pending.body.decisions.find(row=>row.itemId===item.id):draft?.choices[item.id];
    const choice=selectedChoice?.choice,card=node('article',null,'dr-item');card.id='dr-item-'+item.id;
    const title=node('h3',(index+1)+'. '+(item.label??item.kind??item.id));
    const type=node('span',item.status??(item.conflict?'Conflict':'Changed'),'dr-tag');
    const head=node('header');head.append(title,type);card.append(head);
    if(item.subject)card.append(node('p',short(item.subject),'dr-meta'));
    const details=node('details',null,'dr-item-identity');details.append(node('summary','Comparison identity and treatment'));
    details.append(node('p',item.id,'dr-digest'),node('p',item.treatment??'AUTHORED_VALUE','dr-meta'));
    if(Array.isArray(item.path))details.append(node('p',item.path.map(String).join(' / '),'dr-meta'));
    if(Array.isArray(item.editFields)&&item.editFields.length)
      details.append(node('p','An edited object must preserve its original fields and bindings. Editable fields: '+item.editFields.join(', ')+'.','dr-meta'));
    card.append(details);
    const grid=node('div',null,'dr-sides');
    for(const [side,label]of [['base','Common base'],['current','Current reviewed value'],['returned','Returned value']]){
      const value=item[side],cell=node('section',null,'dr-side');
      cell.append(node('h4',label),node('span',value.present?'Present':'Absent','dr-tag'));
      const preview=value.summary??(value.present&&Object.hasOwn(value,'value')?short(value.value):value.present?'Use full value to inspect this component.':'This branch has no value.');
      const text=short(preview)??'';
      cell.append(node('p',text.length>650?text.slice(0,650)+'…':text,'dr-summary'));
      if(value.sha256!==undefined)cell.append(node('p',String(value.sha256),'dr-digest'));
      const tools=node('div',null,'dr-actions');
      tools.append(button(owner,'View full value',()=>readValue(owner,item,side)));
      tools.append(button(owner,'Download value',()=>readValue(owner,item,side,{download:true})));
      cell.append(tools);grid.append(cell);
    }
    card.append(grid);
    const choices=node('fieldset',null,'dr-choices');choices.append(node('legend','Reviewed resolution'));
    for(const option of item.allowedChoices){
      const radio=control(owner,node('input'),{disabled:locked,focus:'choice-'+item.id+'-'+option});
      radio.type='radio';radio.name='return-choice-'+item.id;radio.value=option;radio.checked=choice===option;
      radio.onchange=()=>{
        if(!radio.checked)return;
        const current=selected(owner),prior=current.choices[item.id];
        const value={choice:option,...(option==='EDIT'?{editText:prior?.editText??''}:{})};
        touch(owner,{choices:{...current.choices,[item.id]:value}});render();
      };
      const label=node('label',null,'dr-radio');label.append(radio,node('span',labelFor(item,option)));choices.append(label);
    }
    if(!choice)choices.append(node('p','Choose a resolution explicitly. Suggestions do not submit a choice.','dr-meta'));
    if(item.suggestedChoice&&!choice)choices.append(node('p','Native suggestion: '+labelFor(item,item.suggestedChoice)+'.','dr-meta'));
    if(choice){const effect=effectFor(item,choice);if(effect)choices.append(node('p',effect,'dr-effect'));}
    if(choice==='EDIT'){
      const edit=control(owner,node('textarea'),{disabled:locked,focus:'edit-'+item.id});edit.spellcheck=false;edit.rows=10;
      edit.value=pending?JSON.stringify(selectedChoice.value,null,2):selectedChoice.editText??'';
      edit.oninput=()=>{
        const current=selected(owner);
        touch(owner,{choices:{...current.choices,[item.id]:{choice:'EDIT',editText:edit.value}}});
      };
      choices.append(field('Complete edited JSON value',edit));
      choices.append(node('p','Use “View full value” to copy a complete original object into this editor. Native validation preserves required bindings and checks dependencies.','dr-meta'));
    }
    for(const requirement of owner.requirements.filter(row=>row.itemId===item.id))
      choices.append(node('p',requirement.reason,'dr-error'));
    card.append(choices);return card;
  }
  function renderComparison(owner){
    const review=owner.review,box=node('section',null,'dr-comparison');if(!review)return box;
    const reviewId=review.reviewId??review.id,draft=selected(owner),pending=pendingFor(owner,draft);
    const locked=!draft||!!pending||!!draft?.pendingRequestId||review.status==='APPLIED';
    box.append(node('h2','Review returned changes'),node('p',reviewId,'dr-digest'),
      node('p','Comparison SHA-256 '+review.comparisonSha256,'dr-digest'),identityTable(review));
    const original=node('div',null,'dr-original');
    original.append(node('strong',review.source.filename??'Original returned dossier'),
      node('span',formatBytes(review.source.bytes)),node('span',review.source.sha256,'dr-digest'));
    box.append(original,node('p','The source, common base, current branch and returned branch are retained. Typed histories and extension data use the supplied proposal treatment; authored values use their explicit native choices.','dr-meta'));
    if(owner.view.revision!==review.current.revision){
      box.append(node('p','The dossier is now at revision '+owner.view.revision+'. This comparison remains bound to reviewed revision '+
        review.current.revision+'. Its source and any pending request are unchanged.','dr-warning'));
    }
    const exports=node('div',null,'dr-actions');
    for(const [format,label]of [['json','Comparison JSON'],['md','Comparison Markdown'],['html','Comparison HTML'],['source','Original returned dossier']])
      exports.append(button(owner,label,()=>exportReview(owner,format)));
    box.append(exports);
    if(review.return){
      const receipt=review.return;
      box.append(node('h3','Accepted return'),node('p','Revision '+receipt.revision+' · reviewer '+receipt.reviewedBy+' · '+stamp(receipt.reviewedAt),'dr-meta'),
        node('p',receipt.id,'dr-digest'));
      const accepted=node('div',null,'dr-actions');
      for(const [format,label]of [['json','Accepted return JSON'],['md','Accepted return Markdown'],['html','Accepted return HTML']])
        accepted.append(button(owner,label,()=>exportReview(owner,format,receipt.id)));
      box.append(accepted);
    }
    const page=node('div',null,'dr-pagination');
    page.append(button(owner,'Previous changes',()=>loadReview(owner,reviewId,{draftId:draft?.id,offset:Math.max(0,owner.page-PAGE)}),{disabled:owner.page===0}));
    page.append(node('span',owner.total?(owner.page+1)+'–'+Math.min(owner.page+PAGE,owner.total)+' of '+owner.total+' changed items':'No differing components'));
    page.append(button(owner,'Next changes',()=>loadReview(owner,reviewId,{draftId:draft?.id,offset:owner.page+PAGE}),{disabled:owner.page+PAGE>=owner.total}));
    box.append(page);
    for(const [index,item]of owner.pageItems.entries())box.append(renderItem(owner,item,owner.page+index));
    if(!draft)box.append(button(owner,'Open workspace draft as branch',()=>readServerDraft(owner)));
    if(draft){
      const editor=node('section',null,'dr-review-editor');
      const by=control(owner,node('input'),{disabled:locked,focus:'reviewed-by'});by.type='text';by.maxLength=512;by.value=draft.reviewedBy;
      by.autocomplete='name';by.oninput=()=>touch(owner,{reviewedBy:by.value});
      const note=control(owner,node('textarea'),{disabled:locked,focus:'review-note'});note.rows=4;note.maxLength=16000;note.value=draft.reviewNote;
      note.oninput=()=>touch(owner,{reviewNote:note.value});
      editor.append(node('h3','Review record'),field('Reviewed by',by),field('Review note',note));
      const actions=node('div',null,'dr-actions');
      actions.append(button(owner,'Keep current for unresolved items',async()=>{
        await allItems(owner);const current=selected(owner),choices={...current.choices};
        for(const item of owner.items.values())if(!choices[item.id]?.choice&&item.allowedChoices.includes('CURRENT'))choices[item.id]={choice:'CURRENT'};
        touch(owner,{choices});render();
      },{disabled:locked}));
      actions.append(button(owner,'Check all reviewed choices',()=>previewChoices(owner),{disabled:locked}));
      actions.append(button(owner,'Save reviewed return',()=>submitReview(owner),{disabled:locked||
        owner.validation?.editId!==draft.editId||activePending(owner).length>0,primary:true,focus:'submit-return'}));
      editor.append(actions);
      if(!locked){
        const valid=owner.validation?.editId===draft.editId,validation=node('p',valid?
          'Native preview is valid. Proposed change count: '+owner.validation.result.result.changeCount+'. Saving records this exact reviewed choice set.':
          'Check the complete choice set after editing. Saving freezes its original request before sending it.',valid?'dr-success':'dr-meta');
        validation.dataset.drValidation='';editor.append(validation);
      }
      if(owner.requirements.length){
        const list=node('ul',null,'dr-requirements');
        for(const row of owner.requirements)list.append(node('li',(row.itemId??'Review')+': '+row.reason));
        editor.append(list);
      }
      const draftTools=node('div',null,'dr-actions');
      draftTools.append(button(owner,'Save workspace draft',()=>saveServerDraft(owner),{disabled:locked||!!draft.remoteAttempt}));
      draftTools.append(button(owner,'Open workspace draft as branch',()=>readServerDraft(owner),{disabled:!!pending||!!draft.pendingRequestId||!!draft.remoteAttempt}));
      if(draft.remoteAttempt){
        draftTools.append(button(owner,'Reconcile original draft save',()=>recoverServerDraft(owner)));
        if(owner.remoteConflict?.canRetry)draftTools.append(button(owner,'Retry exact draft save',()=>sendServerDraft(owner,draft.id,draft.remoteAttempt.input)));
      }
      editor.append(draftTools,node('p','Workspace draft version '+(draft.serverDraftVersion??0)+'. Browser branches and workspace drafts have separate version checks.','dr-meta'));
      if(owner.serverDraftRead)editor.append(button(owner,'Download original workspace draft',()=>downloadJson(owner.serverDraftRead,
        'Dossier_Return_Workspace_Draft_'+reviewId+'.json'),{localOnly:true}));
      if(owner.remoteConflict)editor.append(button(owner,'Download both draft versions',()=>downloadJson(owner.remoteConflict,
        'Dossier_Return_Draft_Conflict_'+reviewId+'.json'),{localOnly:true}));
      box.append(editor);
    }
    return box;
  }
  function renderHistory(owner){
    const box=node('section',null,'dr-history');box.append(node('h3','Accepted return history'));
    if(!owner.history.length)box.append(node('p','No accepted returns are recorded on this page.','dr-meta'));
    for(const item of owner.history){
      const receipt=item.return??item,card=node('article',null,'dr-history-row');
      card.append(node('strong','Revision '+receipt.revision),node('span',receipt.reviewedBy??''),
        node('span',stamp(receipt.reviewedAt)),node('p',receipt.requestId??receipt.id,'dr-digest'));
      if(receipt.reviewId)card.append(button(owner,'Inspect original comparison',()=>loadReview(owner,receipt.reviewId)));
      box.append(card);
    }
    const pages=node('div',null,'dr-pagination');
    pages.append(button(owner,'Previous returns',()=>loadHistory(owner,Math.max(0,owner.historyOffset-PAGE)),{disabled:owner.historyOffset===0}),
      node('span',owner.historyTotal?(owner.historyOffset+1)+'–'+Math.min(owner.historyOffset+PAGE,owner.historyTotal)+' of '+owner.historyTotal:'0 returns'),
      button(owner,'Next returns',()=>loadHistory(owner,owner.historyOffset+PAGE),{disabled:owner.historyOffset+PAGE>=owner.historyTotal}));
    box.append(pages);
    const form=node('div',null,'dr-actions'),requestId=control(owner,node('input'),{focus:'request-lookup'});
    requestId.type='text';requestId.maxLength=200;requestId.placeholder='Original request ID';requestId.setAttribute('aria-label','Original return request ID');
    form.append(requestId,button(owner,'Find request',async()=>{
      need(requestId.value.length>0,'RETURN_BROWSER_REQUEST_ID_REQUIRED');
      const result=await request(owner,encoded({requestId:requestId.value}));
      owner.requestLookup={requestId:requestId.value,result};
      if(result.return?.reviewId)await loadReview(owner,result.return.reviewId);
      else owner.notice='No accepted receipt is currently recorded for this request ID.';
    }));
    box.append(form);
    if(owner.requestLookup)box.append(button(owner,'Download request status',()=>downloadJson(owner.requestLookup,'Dossier_Return_Request_Status.json'),{localOnly:true}));
    return box;
  }
  function render(){
    if(!visible)return;
    const active=document.activeElement,focus=active&&root.contains(active)?{
      key:active.dataset.drFocus,start:active.selectionStart,end:active.selectionEnd,
    }:null;
    const owner=session,parts=[];
    const header=node('header',null,'dr-heading'),text=node('div');
    text.append(node('p','COLLABORATOR RETURN','dr-eyebrow'),node('h2','Returned dossiers'),
      node('p','Compare both edited branches, record explicit resolutions, and preserve the complete original source.'));
    header.append(text);
    if(owner)header.append(button(owner,'Refresh return status',async()=>{
      await loadLocal(owner);await loadHistory(owner);
      const draft=selected(owner);
      if(owner.review)await loadReview(owner,owner.review.reviewId??owner.review.id,{draftId:draft?.id,offset:owner.page});
    }));
    parts.push(header,storagePanel());
    if(!owner){parts.push(node('p','Select a dossier in the current Research workspace.','dr-empty'));root.replaceChildren(...parts);return;}
    if(owner.notice){const status=node('p',owner.notice,'dr-notice');status.setAttribute('role','status');parts.push(status);}
    if(owner.error){const error=node('p',owner.error.code,'dr-error');error.setAttribute('role','alert');parts.push(error);}
    parts.push(renderSource(owner),renderDrafts(owner),renderPending(owner),renderComparison(owner),renderHistory(owner));
    root.replaceChildren(...parts);
    if(focus?.key){
      const target=[...root.querySelectorAll('[data-dr-focus]')].find(input=>input.dataset.drFocus===focus.key);
      if(target&&!target.disabled){
        target.focus({preventScroll:true});
        if(typeof focus.start==='number'&&typeof target.setSelectionRange==='function'){
          try{target.setSelectionRange(focus.start,focus.end);}catch{}
        }
      }
    }
    updateBusy();
  }
  return {
    setDossier,
    show(value){
      const changed=visible!==value;visible=value;
      if(value){setDossier(getDossier());const owner=session;if(changed&&owner?.loaded)local(owner,async()=>{
        await loadLocal(owner);if(owner===session)render();
      });}
    },
    updateBusy,
    hasUnsaved:()=>[...sessions.values()].some(owner=>owner.unack.size||owner.sourceUnack.size||owner.accepted.size||owner.busy||owner.sourceBusy),
    async drain(){await Promise.all([...sessions.values()].map(owner=>flush(owner)));},
    close(){
      for(const owner of sessions.values())clearTimeout(owner.timer);
      if(valueDialog){valueDialog.close();valueDialog.remove();valueDialog=null;}
      closeDossierReturnStorage();
    },
  };
}
