// SPDX-License-Identifier: MIT
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openWorkspaceStore,inspectWorkspaceIdentity,privateDirectory,readOwned} from '../stellar-expert/store.mjs';
import {ACTIONS,WORKSPACE_SCHEMA,CONTRACT_SCHEMA,RESPONSE_SCHEMA,REPORT_SCHEMA,configuration,contract,forecastRequest,responseHeaders,usage,
  inspectForecast,reviewInput,identity,bytes,hash,need,fault,exact,text,uuid,sha,whole,stamp,safeError,MAX_RESPONSE} from './contract.mjs';
import {providerAccount,requireProviderKey,captureForecast} from './provider.mjs';
import {buildReport,inspectReport,compareReports,reportFiles} from './reports.mjs';
import {prepareForecastDataset,nativePublishers,queryNativeDataset,prepareNativeRelease,inspectNativeRelease,controlNativeRelease,inspectBuyer,receiveBuyer,readBuyerOutput} from './dataset.mjs';
export {ACTIONS} from './contract.mjs';
const now=()=>new Date().toISOString(),key=id=>identity({operationId:id}).slice(0,24),clone=structuredClone;
function choice(list,id,label){const value=list.find(x=>x.id===id);need(value,'PIRATE_NOT_FOUND','Choose a retained '+label+'.',404);return value;}
function decodeBase64(value){
  need(typeof value==='string'&&value.length<=Math.ceil(MAX_RESPONSE/3)*4,'PIRATE_RESPONSE_SIZE','Select a response file of up to 8 MiB.',413);
  const raw=Buffer.from(value,'base64');need(raw.toString('base64')===value,'PIRATE_RESPONSE_BASE64','Use the exact base64 of the selected file.');
  return raw;
}
function responseInput(p){
  const raw=decodeBase64(p.bodyBase64);sha(p.expectedBodySha256);need(hash(raw)===p.expectedBodySha256,'PIRATE_SOURCE_CHANGED','The selected response bytes differ from the preview.',409);
  text(p.filename,'the original source filename',240);text(p.actor,'the named source operator',120);text(p.note,'the original source context',8000);
  stamp(p.startedAt);stamp(p.observedAt);need(Date.parse(p.observedAt)>=Date.parse(p.startedAt),'PIRATE_RESPONSE_TIME','The response observation precedes its original start.');
  if(p.status!==null)whole(p.status,'the original HTTP status',100,599);
  need(typeof p.bodyComplete==='boolean'&&(!p.bodyComplete||p.status!==null),'PIRATE_RESPONSE_COMPLETENESS','Retain the explicit HTTP/body outcome.');
  const headers=responseHeaders(p.headers);
  return {raw,normalized:{filename:p.filename,actor:p.actor,note:p.note,startedAt:p.startedAt,observedAt:p.observedAt,status:p.status,
    bodyComplete:p.bodyComplete,headers,source:{sha256:hash(raw),bytes:raw.length}}};
}
export async function openPirateWorkspace(directory,{create=false,config=null,environment=process.env,fetchImpl=globalThis.fetch,
  inboxDirectory=null,releaseRuntime={port:0},applicationSource=null}={}){
  const existing=await inspectWorkspaceIdentity(directory,{allowMissing:true,schema:WORKSPACE_SCHEMA});
  if(!existing)need(create,'PIRATE_INITIALIZATION_REQUIRED','Initialize this original workspace before opening it.',409);
  const requested=config?configuration(config):null;
  const store=await openWorkspaceStore(directory,{schema:WORKSPACE_SCHEMA,initialState:{
    providerReference:requested??{name:'Pirate Weather',apiKeyEnv:'PIRATE_WEATHER_API_KEY'},contractEditions:[],currentContractSha256:null,
    reportIds:[],selectedReportId:null,reviews:[],fileIndex:{},providerHold:null,providerHoldHistory:[],receiving:[]}});
  try{
    configuration(store.read().providerReference);
    if(requested)need(identity(requested)===identity(store.read().providerReference),'PIRATE_CONNECTION_CHANGED','This workspace retains another original provider reference.',409);
  }catch(error){await store.close();throw error;}
  const publishers=nativePublishers(store);let tail=Promise.resolve(),accepting=true,closing=false,closePromise=null,poisoned=false,activeAbort=null;
  const assertOpen=()=>need(!closing&&!poisoned,'PIRATE_REOPEN_REQUIRED','Close and reopen this original workspace before continuing an uncertain save.',503);
  const assertAccepting=()=>{assertOpen();need(accepting,'PIRATE_CLOSING','The workspace is draining its accepted original requests.',503);};
  async function mutate(fn){
    assertOpen();let callbackError=false;
    try{return await store.mutate(async state=>{try{return await fn(state);}catch(error){callbackError=true;throw error;}});}
    catch(error){if(!callbackError)poisoned=true;throw error;}
  }
  async function object(raw){assertOpen();try{return await store.putObject(raw);}catch(error){if(['ENOSPC','EDQUOT','EIO'].includes(error.code))poisoned=true;throw error;}}
  async function edition(value){assertOpen();try{return await store.saveEdition(value);}catch(error){if(['ENOSPC','EDQUOT','EIO'].includes(error.code))poisoned=true;throw error;}}
  async function contractEdition(id=store.read().currentContractSha256){
    sha(id);choice(store.read().contractEditions,id,'contract edition');const value=await store.edition(id);
    const {id:stored,sha256,...body}=value;
    need(value.schema===CONTRACT_SCHEMA&&stored===id&&sha256===id&&identity(body)===id,'PIRATE_CONTRACT_CHANGED','The retained contract edition differs.',409);
    contract(value.value);return value;
  }
  async function capture(id){
    sha(id);choice(store.read().captures,id,'source capture');const c=await store.edition(id),{id:stored,...body}=c;
    need(c.schema===RESPONSE_SCHEMA&&stored===id&&identity(body)===id,'PIRATE_CAPTURE_CHANGED','The retained source capture differs.',409);return c;
  }
  async function report(id){
    sha(id);choice(store.read().reportIds,id,'report');const ref=await store.edition(id);
    need(ref.kind==='report'&&ref.id===id,'PIRATE_REPORT_CHANGED','The report object reference differs.',409);
    const raw=await store.object(ref.object.sha256);need(raw.length===ref.object.bytes,'PIRATE_REPORT_CHANGED','The report bytes differ.',409);
    return inspectReport(JSON.parse(raw));
  }
  const operation=(id)=>{uuid(id);const op=store.read().operations[id];need(op,'PIRATE_REQUEST_NOT_FOUND','This original request is not retained.',404);return op;};
  async function checkpoint(op,name,value){
    await mutate(s=>{const current=s.operations[op.operationId];need(current?.payloadSha256===op.payloadSha256,'PIRATE_REQUEST_CHANGED','The original request changed.',409);
      if(Object.hasOwn(current.stages,name))need(identity(current.stages[name])===identity(value),'PIRATE_STAGE_CHANGED','The original operation stage differs.',409);
      else current.stages[name]=clone(value);});
    return value;
  }
  async function fileDescriptor(op,label,filename,type,raw,context={}){
    const saved=await object(raw),id=identity({workspaceId:store.read().workspaceId,operationId:op.operationId,label,sha256:saved.sha256});
    return {id,filename,type,...saved,storage:{kind:'object',sha256:saved.sha256},...context};
  }
  async function normalize(action,p,retained=null){
    let source=null,context={};p=clone(p);
    const actor=()=>text(p.actor,'the named operator',120);
    switch(action){
      case 'contract.save':
        exact(p,['value','previousContractSha256','actor','note'],['value','previousContractSha256','actor','note']);contract(p.value);actor();text(p.note,'the contract revision reason',8000);
        if(p.previousContractSha256!==null)sha(p.previousContractSha256);break;
      case 'provider.reconcile':
        exact(p,['captureId','expectedHoldSha256','actor','note'],['captureId','expectedHoldSha256','actor','note']);
        sha(p.captureId);sha(p.expectedHoldSha256);actor();text(p.note,'the source-grounded quota recovery decision',8000);
        if(!retained){context.quotaRecovery=await quotaRecovery(p.captureId);
          need(context.quotaRecovery.holdSha256===p.expectedHoldSha256&&context.quotaRecovery.canRelease,
          'PIRATE_QUOTA_RECOVERY_SOURCE','Use a later complete original response with explicit positive remaining quota, after any known deadline.',409);}break;
      case 'capture.fetch':
        exact(p,['contractSha256','locationId','expectedRequestSha256','actor','note'],['contractSha256','locationId','expectedRequestSha256','actor','note']);
        context.contract=await contractEdition(p.contractSha256);context.request=forecastRequest(context.contract.value,p.locationId);
        sha(p.expectedRequestSha256);need(identity(context.request)===p.expectedRequestSha256,'PIRATE_REQUEST_CHANGED','Review the exact original request again.',409);
        actor();text(p.note,'the source request purpose',8000);break;
      case 'capture.import':
      case 'capture.reconcile':{
        const fields=['contractSha256','locationId','bodyBase64','expectedBodySha256','filename','actor','note','startedAt','observedAt','status','headers','bodyComplete'];
        if(action==='capture.reconcile')fields.push('originalOperationId');
        exact(p,fields,fields);context.contract=await contractEdition(p.contractSha256);context.request=forecastRequest(context.contract.value,p.locationId);
        const decoded=responseInput(p);source=decoded.raw;p={contractSha256:p.contractSha256,locationId:p.locationId,...decoded.normalized,
          ...(action==='capture.reconcile'?{originalOperationId:uuid(p.originalOperationId)}:{})};break;
      }
      case 'report.prepare':
        exact(p,['contractSha256','captureIds','title','windowStart','previousReportId','actor'],['contractSha256','captureIds','title','windowStart','previousReportId','actor']);
        context.contract=await contractEdition(p.contractSha256);actor();text(p.title,'the report title',160);whole(p.windowStart,'the report window Unix start',0,253402127999);
        need(Array.isArray(p.captureIds)&&p.captureIds.length===context.contract.value.locations.length&&new Set(p.captureIds).size===p.captureIds.length,'PIRATE_CAPTURE_SELECTION','Choose exactly one distinct original source for every contract location.');
        p.captureIds.forEach(sha);if(p.previousReportId!==null)sha(p.previousReportId);break;
      case 'report.review':reviewInput(p);break;
      case 'report.export':
      case 'dataset.prepare':
        exact(p,action==='dataset.prepare'?['reportId','reviewId','name']:['reportId','reviewId'],action==='dataset.prepare'?['reportId','reviewId','name']:['reportId','reviewId']);
        sha(p.reportId);sha(p.reviewId);if(action==='dataset.prepare')text(p.name,'the native dataset name',128);break;
      case 'release.prepare':
        exact(p,['datasetId','origin','path','payment'],['datasetId','origin','path','payment']);
        choice(store.read().datasets,p.datasetId,'native dataset');text(p.origin,'the original public origin',2048);text(p.path,'the explicit report endpoint',1024);
        need(p.payment&&typeof p.payment==='object'&&!Array.isArray(p.payment),'PIRATE_PAYMENT_CONFIGURATION','Use the original native seller payment configuration.');
        context.releaseRuntime=clone(releaseRuntime);break;
      case 'release.activate':
      case 'release.start':
      case 'release.stop':
      case 'release.rollback':
        exact(p,['releaseId','expectedGeneration'],['releaseId','expectedGeneration']);choice(store.read().releases,p.releaseId,'native release');whole(p.expectedGeneration,'the original release generation');break;
      case 'release.reconcile':
        exact(p,['originalOperationId','expectedObservationSha256','disposition','actor','note'],['originalOperationId','expectedObservationSha256','disposition','actor','note']);
        uuid(p.originalOperationId);sha(p.expectedObservationSha256);actor();text(p.note,'the native reconciliation decision',8000);
        need(['RECONCILE_OBSERVED_STATE','RETAIN_UNRESOLVED'].includes(p.disposition),'PIRATE_RECONCILIATION_DECISION','Choose the retained native observation disposition.');break;
      case 'buyer.receive':
        exact(p,['intentIds'],['intentIds']);need(Array.isArray(p.intentIds)&&p.intentIds.length>0&&p.intentIds.length<=100,'PIRATE_BUYER_SELECTION','Select the original buyer intent IDs.');
        need(new Set(p.intentIds).size===p.intentIds.length&&p.intentIds.every(v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)),'PIRATE_BUYER_SELECTION','Select distinct original Inbox intent IDs.');context.inboxDirectory=inboxDirectory;break;
      case 'project.export':
        exact(p,['title'],['title']);text(p.title,'the complete project title',160);context.applicationSource=applicationSource;break;
      case 'project.receive':{
        exact(p,['uploadId','expectedArchiveSha256','expectedPreviewSha256','actor','note'],['uploadId','expectedArchiveSha256','expectedPreviewSha256','actor','note']);
        uuid(p.uploadId);sha(p.expectedArchiveSha256);sha(p.expectedPreviewSha256);actor();text(p.note,'the receiving source decision',8000);
        need(applicationSource,'PIRATE_APPLICATION_REQUIRED','Use the current trusted installed package before receiving a complete project.',409);
        context.applicationSource=applicationSource;
        if(!retained){const {previewUpload}=await import('./package.mjs');const preview=await previewUpload(store.root,{...p,applicationSource});
          need(preview.previewSha256===p.expectedPreviewSha256,'PIRATE_PROJECT_PREVIEW_CHANGED','Review the complete selected project again.',409);}
        break;
      }
      default:throw fault('PIRATE_ACTION','Choose a supported operation.');
    }
    return {payload:p,source,context};
  }
  async function reserve(request){
    exact(request,['operationId','expectedRevision','action','payload'],['operationId','expectedRevision','action','payload']);
    uuid(request.operationId);whole(request.expectedRevision,'the original workspace revision');
    need(ACTIONS.includes(request.action),'PIRATE_ACTION','Choose a supported operation.');
    let retained=store.read().operations[request.operationId];
    const input=await normalize(request.action,request.payload,retained),payloadSha256=identity({action:request.action,payload:input.payload});
    if(retained){need(retained.payloadSha256===payloadSha256&&retained.action===request.action,'PIRATE_REQUEST_ID_REUSED','This UUID belongs to another exact original request.',409);return retained;}
    need(store.read().revision===request.expectedRevision,'PIRATE_REVISION_CHANGED','The workspace changed; review the current source and submit a new request UUID.',409);
    if(input.source)await object(input.source);
    if(request.action==='project.export'){
      need(applicationSource,'PIRATE_APPLICATION_REQUIRED','Open with the selected installed application source before preparing a complete project.',409);
      // Freeze the complete original state outside the mutable request table.
      // Repeated exports retain object references, never recursive snapshots.
      input.context.snapshot=await object(bytes(store.read()));
      const {exportProject}=await import('./package.mjs');
      const prepared=await exportProject({store,operation:{operationId:request.operationId,expectedRevision:request.expectedRevision,
        createdAt:now(),payload:input.payload,context:input.context},applicationSource,publishers});
      input.context.projectExport=await object(bytes(prepared));input.context.projectPreparedAt=prepared.createdAt;
    }
    await mutate(s=>{
      need(s.revision===request.expectedRevision,'PIRATE_REVISION_CHANGED','The workspace changed before this request was accepted.',409);
      if(request.action==='contract.save'){
        need(s.currentContractSha256===input.payload.previousContractSha256,'PIRATE_CONTRACT_CHANGED','The contract edition changed; review its exact current source.',409);
        input.context.ordinal=s.contractEditions.length+1;
      }
      if(request.action==='report.review')input.context.previousReviewId=s.reviews.filter(r=>r.reportId===input.payload.reportId).at(-1)?.id??null;
      if(['report.export','dataset.prepare'].includes(request.action)){
        const approved=choice(s.reviews,input.payload.reviewId,'review'),latest=s.reviews.filter(r=>r.reportId===input.payload.reportId).at(-1);
        need(approved.reportId===input.payload.reportId&&approved.disposition==='APPROVED'&&latest?.id===approved.id,'PIRATE_REVIEW_REQUIRED','Use the current named approval for this exact report.',409);
        input.context.review=clone(approved);
      }
      if(request.action==='provider.reconcile')need(identity(s.providerHold)===input.payload.expectedHoldSha256,'PIRATE_PROVIDER_HOLD_CHANGED','The provider hold changed after review.',409);
      if(request.action==='capture.fetch'){
        requireProviderKey(s.providerReference,environment);
        if(s.providerHold){
          const until=s.providerHold.retryAt;
          need(until&&Date.parse(until)<=Date.now(),'PIRATE_PROVIDER_DEADLINE','The original provider response still defers source calls. Retain its deadline and original request.',429);
        }
      }
      retained={operationId:request.operationId,action:request.action,payload:input.payload,payloadSha256,expectedRevision:request.expectedRevision,
        createdAt:input.context.projectPreparedAt??now(),state:'RUNNING',stages:{},context:input.context};
      s.operations[request.operationId]=retained;
    });return clone(retained);
  }
  async function commit(op,result,apply=()=>{}){
    const saved=await object(bytes(result));
    await mutate(s=>{const current=s.operations[op.operationId];if(current.state==='COMPLETE')return;
      apply(s);current.state='COMPLETE';current.result=saved;current.completedAt=now();current.error=null;});
    return result;
  }
  async function resultOf(op){return JSON.parse(await store.object(op.result.sha256));}
  async function materializeCapture(op,response,origin){
    const request=op.context.request,sourceIdentity=identity({request,status:response.status,observedAt:response.observedAt,headers:response.headers,
      body:response.body,bodyComplete:response.bodyComplete});
    const old=store.read().captures.find(c=>c.sourceIdentity===sourceIdentity&&c.contractSha256===op.context.contract.sha256);
    if(old)return {capture:await capture(old.id),files:[],reused:true};
    let summary=null,validation=null;
    if(response.status===200&&response.bodyComplete){
      try{summary=inspectForecast(await store.object(response.body.sha256),request).summary;}
      catch(error){validation=safeError(error);}
    }
    const state=!response.bodyComplete?(response.status===null?'OUTCOME_UNKNOWN':'BODY_INCOMPLETE'):response.status!==200?'HTTP_ERROR':validation?'SOURCE_EXCEPTION':'COMPLETE';
    const body={schema:RESPONSE_SCHEMA,workspaceId:store.read().workspaceId,operationId:op.operationId,contractSha256:op.context.contract.sha256,
      request,requestSha256:identity(request),sourceIdentity,origin,actor:op.payload.actor,note:op.payload.note,
      filename:op.payload.filename??('forecast-'+request.locationId+'.json'),startedAt:response.startedAt,observedAt:response.observedAt,
      status:response.status,headers:response.headers,usage:response.usage??usage(response.headers,response.observedAt),
      body:response.body,bodyComplete:response.bodyComplete,state,summary,validation,transportError:response.error??null,
      ...(op.payload.originalOperationId?{originalOperationId:op.payload.originalOperationId}:{})};
    const value={...body,id:identity(body)};await edition(value);
    const files=[await fileDescriptor(op,'response','Original_'+request.locationId+'_'+response.body.sha256.slice(0,12)+'.json',
      'application/octet-stream',await store.object(response.body.sha256),{captureId:value.id,role:'original-response'}),
      await fileDescriptor(op,'capture-receipt','Capture_'+value.id.slice(0,12)+'.json','application/json',bytes(value),{captureId:value.id,role:'source-receipt'})];
    return {capture:value,files,reused:false};
  }
  async function execute(op){
    op=operation(op.operationId);const p=op.payload,id=key(op.operationId);
    switch(op.action){
      case 'contract.save':{
        if(p.previousContractSha256!==null){const old=await contractEdition(p.previousContractSha256);need(old.value.id===p.value.id,'PIRATE_CONTRACT_ID_CHANGED','Retain this customer contract ID across its revisions.',409);}
        const body={schema:CONTRACT_SCHEMA,workspaceId:store.read().workspaceId,ordinal:op.context.ordinal,previousSha256:p.previousContractSha256,
          value:p.value,actor:p.actor,note:p.note,createdAt:op.createdAt,operationId:op.operationId},digest=identity(body),value={...body,id:digest,sha256:digest};
        await edition(value);
        return commit(op,value,s=>{
          need(s.currentContractSha256===p.previousContractSha256&&s.contractEditions.length+1===value.ordinal,'PIRATE_CONTRACT_CHANGED','A later contract decision is retained. Keep this original request and review a new revision.',409);
          s.contractEditions.push({id:digest,ordinal:value.ordinal,createdAt:value.createdAt,title:p.value.title,units:p.value.units,contractId:p.value.id});s.currentContractSha256=digest;
        });
      }
      case 'provider.reconcile':{
        const proof=await quotaRecovery(p.captureId);
        need(proof.canRelease&&proof.holdSha256===p.expectedHoldSha256,'PIRATE_PROVIDER_HOLD_CHANGED','Review the current original hold and source evidence.',409);
        const result={schema:'stellar-forge.pirate-weather-quota-recovery.v1',captureId:p.captureId,hold:proof.hold,holdSha256:proof.holdSha256,
          source:proof.source,actor:p.actor,note:p.note,at:op.createdAt,operationId:op.operationId,providerInvocations:0,
          disposition:'EXPLICIT_LATER_SOURCE_RELEASE',authority:'NAMED_REVIEW_OF_RETAINED_ORIGINAL_RESPONSE_HEADERS'};
        return commit(op,result,s=>{need(identity(s.providerHold)===p.expectedHoldSha256,'PIRATE_PROVIDER_HOLD_CHANGED','A newer provider hold remains active.',409);
          s.providerHoldHistory??=[];s.providerHoldHistory.push(result);s.providerHold=null;});
      }
      case 'capture.fetch':
      case 'capture.import':
      case 'capture.reconcile':{
        let response=op.stages.response;
        if(!response&&op.action==='capture.fetch'){
          need(!op.stages.invoking,'PIRATE_CALL_OUTCOME_UNKNOWN','This original provider invocation has no complete saved outcome. Reconcile its original response; the request will not be repeated.',409);
          activeAbort=new AbortController();await checkpoint(op,'invoking',{at:now(),requestSha256:identity(op.context.request),automaticRetries:0});
          try{
            const received=await captureForecast({config:store.read().providerReference,request:op.context.request,environment,fetchImpl,signal:activeAbort.signal,
              onHeaders:metadata=>checkpoint(op,'headers',metadata)});
            const body=await object(received.body);response={...received,body};delete response.bodySha256;
            await checkpoint(op,'response',response);
          }finally{activeAbort=null;}
        }else if(!response){
          if(op.action==='capture.reconcile'){
            const original=operation(p.originalOperationId);
            need(original.action==='capture.fetch'&&original.context.contract.sha256===p.contractSha256&&identity(original.context.request)===identity(op.context.request),
              'PIRATE_RECONCILIATION_SCOPE','Match the original provider request and contract exactly.',409);
            const prior=original.stages.headers;
            if(prior)for(const f of ['startedAt','observedAt','status','headers'])need(identity(prior[f])===identity(p[f]),'PIRATE_RECONCILIATION_SOURCE','The received original metadata differs from the retained provider return.',409);
            if(original.stages.response?.body){
              const prefix=await store.object(original.stages.response.body.sha256),full=await store.object(p.source.sha256);
              need(full.subarray(0,prefix.length).equals(prefix),'PIRATE_RECONCILIATION_PREFIX','The original retained response prefix differs.',409);
              need(!original.stages.response.bodyComplete,'PIRATE_RECONCILIATION_COMPLETE','The original response is already complete; use its retained capture.',409);
            }
          }
          response={startedAt:p.startedAt,observedAt:p.observedAt,status:p.status,headers:p.headers,usage:usage(p.headers,p.observedAt),body:p.source,bodyComplete:p.bodyComplete};
          await checkpoint(op,'response',response);
        }
        const made=await materializeCapture(op,response,op.action==='capture.fetch'?'NATIVE_PROVIDER':op.action==='capture.reconcile'?'RECONCILED_ORIGINAL_RESPONSE':'IMPORTED_ORIGINAL_RESPONSE');
        const value={captureId:made.capture.id,state:made.capture.state,body:made.capture.body,files:made.files,reusedOriginalSource:made.reused,providerInvocations:op.action==='capture.fetch'?1:0};
        return commit(op,value,s=>{
          if(!made.reused)s.captures.push({id:made.capture.id,sourceIdentity:made.capture.sourceIdentity,contractSha256:made.capture.contractSha256,locationId:made.capture.request.locationId,
            state:made.capture.state,status:made.capture.status,observedAt:made.capture.observedAt,body:made.capture.body,operationId:op.operationId,origin:made.capture.origin});
          for(const f of made.files)s.fileIndex[f.id]=f;
          if((response.status===429||made.capture.usage?.remaining==='0')&&
            (!s.providerHold||Date.parse(response.observedAt)>=Date.parse(s.providerHold.observedAt)))
            s.providerHold={captureId:made.capture.id,observedAt:response.observedAt,retryAt:made.capture.usage.retryAt,status:response.status,remaining:made.capture.usage.remaining};
          if(op.action==='capture.reconcile'){
            const original=s.operations[p.originalOperationId];original.reconciliations??=[];original.reconciliations.push({operationId:op.operationId,captureId:made.capture.id});
          }
        });
      }
      case 'report.prepare':{
        const captures=await Promise.all(p.captureIds.map(capture));
        if(p.previousReportId){const previous=await report(p.previousReportId);need(previous.contractId===op.context.contract.value.id&&previous.units===op.context.contract.value.units,
          'PIRATE_REPORT_COMPARISON_SCOPE','The previous report belongs to another contract or unit system.',409);}
        const value=await buildReport({contractEdition:op.context.contract,captures,loadObject:x=>store.object(x),title:p.title,windowStart:p.windowStart,createdAt:op.createdAt,previousReportId:p.previousReportId});
        const raw=bytes(value);need(raw.length<=64*1024*1024,'PIRATE_REPORT_CAPACITY','The complete report exceeds 64 MiB; all original source responses remain retained.',413);
        const saved=await object(raw);await edition({kind:'report',id:value.id,object:saved});
        const description={id:value.id,title:value.title,createdAt:value.createdAt,contractSha256:value.contractSha256,rows:value.rows.length,coverage:value.coverage,previousReportId:value.previousReportId};
        return commit(op,description,s=>{s.reportIds.push(description);const selected=s.reportIds.find(r=>r.id===s.selectedReportId);if(!selected||Date.parse(selected.createdAt)<=Date.parse(op.createdAt))s.selectedReportId=value.id;});
      }
      case 'report.review':{
        await report(p.reportId);
        const body={...p,at:op.createdAt,operationId:op.operationId},review={...body,id:identity(body)};
        return commit(op,review,s=>{need((s.reviews.filter(r=>r.reportId===p.reportId).at(-1)?.id??null)===op.context.previousReviewId,
          'PIRATE_REVIEW_CHANGED','A later review for this report is retained. Preserve this original interrupted request and review the current edition.',409);s.reviews.push(review);});
      }
      case 'report.export':
      case 'dataset.prepare':{
        const value=await report(p.reportId),review=op.context.review;
        need(review.reportId===value.id&&review.disposition==='APPROVED','PIRATE_REVIEW_REQUIRED','Select the named approval for this exact report.',409);
        if(op.action==='dataset.prepare'){
          const captures=await Promise.all(value.sources.map(x=>capture(x.captureId)));
          const output=await prepareForecastDataset(store,{report:value,review,captures,name:p.name,id:'dataset-'+id});
          return commit(op,output,s=>s.datasets.push(output));
        }
        const files=[];for(const output of reportFiles(value,review))files.push(await fileDescriptor(op,output.name,output.name,output.type,output.bytes,{reportId:value.id,reviewId:review.id,role:'reviewed-report'}));
        return commit(op,{reportId:value.id,reviewId:review.id,files},s=>{for(const f of files)s.fileIndex[f.id]=f;s.exports.push({id:op.operationId,kind:'report',reportId:value.id,reviewId:review.id,files:files.map(x=>x.id),createdAt:op.createdAt});});
      }
      case 'release.prepare':{
        const output=op.stages.nativeResult??await prepareNativeRelease(store,{dataset:choice(store.read().datasets,p.datasetId,'dataset'),origin:p.origin,path:p.path,payment:p.payment,id:'pirate-'+id,runtime:op.context.releaseRuntime,publishers});
        if(!op.stages.nativeResult)await checkpoint(op,'nativeResult',output);return commit(op,output,s=>s.releases.push(output));
      }
      case 'release.activate':case 'release.start':case 'release.stop':case 'release.rollback':{
        if(op.stages.nativeInvoking&&!op.stages.nativeResult)throw fault('PIRATE_NATIVE_RECONCILIATION_REQUIRED','Inspect the original release generation before continuing its interrupted control request.',409);
        if(op.stages.nativeResult)return commit(op,op.stages.nativeResult);
        const before=await inspectNativeRelease(store,choice(store.read().releases,p.releaseId,'release'),publishers);
        need(before.selection.generation===p.expectedGeneration,'PIRATE_NATIVE_GENERATION','Review the current original release generation.',409);
        await checkpoint(op,'nativeInvoking',{releaseId:p.releaseId,expectedGeneration:p.expectedGeneration,action:op.action,before,at:now()});
        const output=await controlNativeRelease(store,choice(store.read().releases,p.releaseId,'release'),op.action.split('.')[1],p,publishers);
        await checkpoint(op,'nativeResult',output);return commit(op,output);
      }
      case 'release.reconcile':{
        const observed=await releaseRecovery(p.originalOperationId);
        need(observed.observationSha256===p.expectedObservationSha256,'PIRATE_NATIVE_OBSERVATION_CHANGED','The original native state changed; review its current observation.',409);
        need(p.disposition==='RETAIN_UNRESOLVED'||observed.canReconcile,'PIRATE_NATIVE_UNRESOLVED','The original engine does not currently demonstrate the selected state; retain this observation without claiming completion.',409);
        const result={originalOperationId:p.originalOperationId,disposition:p.disposition,actor:p.actor,note:p.note,at:op.createdAt,
          observation:observed,providerInvocations:0,nativeControlInvocations:0,authority:'ORIGINAL_ENGINE_OBSERVATION_WITH_NAMED_RECONCILIATION',
          causality:'The current native state is observed. The missing original call acknowledgement is not reconstructed.'};
        const accepted=await object(bytes(result));
        return commit(op,result,s=>{const original=s.operations[p.originalOperationId];original.reconciliations??=[];original.reconciliations.push({operationId:op.operationId,observationSha256:observed.observationSha256,disposition:p.disposition});
          if(p.disposition==='RECONCILE_OBSERVED_STATE'){original.state='COMPLETE';original.result=accepted;original.completedAt=op.createdAt;original.error=null;original.completionAuthority=result.authority;}
        });
      }
      case 'buyer.receive':{
        if(!op.stages.nativeResult)need(inboxDirectory&&inboxDirectory===op.context.inboxDirectory,'PIRATE_BUYER_ORIGINAL_SOURCE_REQUIRED','Resume this original Buyer receipt only with its same explicitly configured Inbox; receiving never opens a sender path automatically.',409);
        const output=op.stages.nativeResult??await receiveBuyer(store,inboxDirectory,p.intentIds,'buyer-'+id);if(!op.stages.nativeResult)await checkpoint(op,'nativeResult',output);
        const files=[];for(const download of output.downloads){const original=await readBuyerOutput(store,output,download.name);files.push(await fileDescriptor(op,'buyer-'+download.name,download.name,download.type,original.bytes,{receiptId:output.id,role:'original-buyer-output'}));}
        const result={...output,files};return commit(op,result,s=>{s.receipts.push(result);for(const f of files)s.fileIndex[f.id]=f;});
      }
      case 'project.export':{
        need(op.context.projectExport,'PIRATE_PROJECT_PREPARATION_MISSING','Preserve the original prepared export; its accepted request is incomplete.',409);
        const output=JSON.parse(await store.object(op.context.projectExport.sha256));
        const {readProjectSource}=await import('./package.mjs');for(const file of output.files)await readProjectSource(store,file);
        return commit(op,output,s=>{s.exports.push(output);for(const f of output.files??[])s.fileIndex[f.id]=f;});
      }
      case 'project.receive':{
        const {receiveProject}=await import('./package.mjs');
        const output=await receiveProject({store,operation:op,applicationSource:applicationSource??op.context.applicationSource});
        return commit(op,output,s=>{if(!s.receiving.some(r=>r.archive.sha256===output.archive.sha256))s.receiving.push(output);});
      }
    }
  }
  async function quotaRecovery(captureId){
    const hold=store.read().providerHold;need(hold,'PIRATE_PROVIDER_HOLD_MISSING','There is no retained provider hold to release.',409);
    const source=await capture(captureId),remaining=source.usage?.remaining;
    const positive=typeof remaining==='string'&&/^\d{1,100}$/.test(remaining)&&BigInt(remaining)>0n;
    const afterKnownDeadline=hold.retryAt===null||Date.now()>=Date.parse(hold.retryAt);
    return {hold,holdSha256:identity(hold),source:{captureId:source.id,sourceIdentity:source.sourceIdentity,origin:source.origin,request:source.request,
      body:source.body,status:source.status,observedAt:source.observedAt,usage:source.usage},
      canRelease:source.status===200&&source.bodyComplete===true&&positive&&Date.parse(source.observedAt)>Date.parse(hold.observedAt)&&afterKnownDeadline,
      knownDeadlineElapsed:afterKnownDeadline,providerInvocations:0,
      note:'A named operator may release an undated hold using a later original complete response with positive quota. The original limited call and source remain retained.'};
  }
  async function releaseRecovery(operationId){
    const original=operation(operationId);
    need(['release.activate','release.start','release.stop','release.rollback'].includes(original.action)&&original.stages.nativeInvoking&&!original.stages.nativeResult&&original.state!=='COMPLETE',
      'PIRATE_NATIVE_RECOVERY_SCOPE','Select the original interrupted native control request.',409);
    const p=original.payload,before=original.stages.nativeInvoking.before,observed=await inspectNativeRelease(store,choice(store.read().releases,p.releaseId,'release'),publishers);
    const selection=observed.selection,history=selection.history??[],prior=before?.selection?.history??[],action=original.action.split('.')[1],runtime=observed.publisher?.releases?.runtime;
    const extendsOnce=history.length===prior.length+1&&identity(history.slice(0,-1))===identity(prior)&&history.at(-1)?.operation===action&&selection.generation===p.expectedGeneration+1;
    const canReconcile=action==='activate'?extendsOnce&&selection.active===p.releaseId:
      action==='rollback'?extendsOnce:
      action==='start'?selection.generation===p.expectedGeneration&&selection.active===p.releaseId&&runtime?.state==='RUNNING'&&runtime.observed?.releaseId===p.releaseId:
      selection.generation===p.expectedGeneration&&runtime?.state==='STOPPED';
    const proof={originalOperationId:operationId,action,releaseId:p.releaseId,expectedGeneration:p.expectedGeneration,before,observed,canReconcile};
    return {...proof,observationSha256:identity(proof)};
  }
  async function act(request){
    assertAccepting();
    const pending=tail.then(async()=>{
      assertOpen();let op;
      try{
        op=await reserve(request);op=operation(op.operationId);
        if(op.state==='COMPLETE')return {operationId:op.operationId,reused:true,result:await resultOf(op),revision:store.read().revision};
        const result=await execute(op);return {operationId:op.operationId,reused:false,result,revision:store.read().revision};
      }catch(error){
        const info=safeError(error);
        if(op&&!poisoned)await mutate(s=>{const current=s.operations[op.operationId];if(current&&current.state!=='COMPLETE'){current.state='INTERRUPTED';current.error=info;current.failedAt=now();}}).catch(()=>{});
        throw Object.assign(fault(info.code,info.message,info.status),{operationId:op?.operationId??request?.operationId??null,currentRevision:store.read().revision});
      }
    });tail=pending.catch(()=>{});return pending;
  }
  async function resume(operationId){
    assertAccepting();uuid(operationId);
    const pending=tail.then(async()=>{
      assertOpen();const original=operation(operationId);
      if(original.state==='COMPLETE')return {operationId,reused:true,result:await resultOf(original),revision:store.read().revision};
      try{return {operationId,reused:false,result:await execute(original),revision:store.read().revision};}
      catch(error){const info=safeError(error);
        if(!poisoned)await mutate(state=>{const value=state.operations[operationId];if(value.state!=='COMPLETE'){value.state='INTERRUPTED';value.error=info;value.failedAt=now();}}).catch(()=>{});
        throw Object.assign(fault(info.code,info.message,info.status),{operationId,currentRevision:store.read().revision});}
    });tail=pending.catch(()=>{});return pending;
  }
  async function view(){
    const s=store.read();
    return {schema:WORKSPACE_SCHEMA,workspaceId:s.workspaceId,revision:s.revision,createdAt:s.createdAt,provider:providerAccount(s.providerReference,environment),
      currentContractSha256:s.currentContractSha256,contractEditions:s.contractEditions,captures:s.captures,reports:s.reportIds,reviews:s.reviews,
      datasets:s.datasets,releases:s.releases.map(({handoff,...r})=>r),buyerReceipts:s.receipts,exports:s.exports,
      files:Object.values(s.fileIndex),receiving:s.receiving,providerHoldHistory:s.providerHoldHistory??[],providerHold:s.providerHold,selectedReportId:s.selectedReportId,closing:!accepting,requiresReopen:poisoned,
      requests:Object.values(s.operations).map(({context,payload,stages,result,...o})=>({...o,stageNames:Object.keys(stages),result:result??null})),
      counts:{captures:s.captures.length,reports:s.reportIds.length,reviews:s.reviews.length,datasets:s.datasets.length}};
  }
  async function read(method,input={}){
    if(method==='state')return view();
    if(method==='contract')return contractEdition(input.id);
    if(method==='capture')return capture(input.id);
    if(method==='report'){
      const value=await report(input.id),offset=whole(input.offset??0,'the first row'),limit=whole(input.limit??100,'the row count',1,500);
      const {rows,...metadata}=value;return {...metadata,rows:rows.slice(offset,offset+limit),total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null};
    }
    if(method==='compare'){
      const value=compareReports(await report(input.beforeId),await report(input.afterId)),offset=whole(input.offset??0,'the first change'),limit=whole(input.limit??100,'the change count',1,500);
      return {...value,added:value.added.slice(offset,offset+limit),removed:value.removed.slice(offset,offset+limit),changed:value.changed.slice(offset,offset+limit),offset,limit};
    }
    if(method==='operation'){
      const op=operation(input.operationId),{context,...publicOp}=op;
      return {...publicOp,...(op.state==='COMPLETE'?{acceptedResult:await resultOf(op)}:{})};
    }
    if(method==='provider.recovery-preview')return quotaRecovery(input.captureId);
    if(method==='project.preview'){const {previewUpload}=await import('./package.mjs');return previewUpload(store.root,{...input,applicationSource});}
    if(method==='request-preview'){
      const c=await contractEdition(input.contractSha256),request=forecastRequest(c.value,input.locationId);
      return {contractSha256:c.sha256,request,requestSha256:identity(request),provider:providerAccount(store.read().providerReference,environment),
        providerHold:store.read().providerHold,previousCaptures:store.read().captures.filter(x=>x.locationId===input.locationId).slice(-5),automaticRetries:0};
    }
    if(method==='source-preview'){
      const c=await contractEdition(input.contractSha256),request=forecastRequest(c.value,input.locationId),selected=responseInput(input);
      let summary=null,error=null;if(selected.normalized.status===200&&selected.normalized.bodyComplete)try{summary=inspectForecast(selected.raw,request).summary;}catch(e){error=safeError(e);}
      return {request,requestSha256:identity(request),source:selected.normalized.source,summary,error,retainedOnImport:true,providerInvocations:0};
    }
    if(method==='dataset.query')return queryNativeDataset(store,choice(store.read().datasets,input.datasetId,'dataset'),input.query);
    if(method==='release.recovery-preview')return releaseRecovery(input.operationId);
    if(method==='release.inspect')return inspectNativeRelease(store,choice(store.read().releases,input.releaseId,'release'),publishers);
    if(method==='buyer.inspect')return inspectBuyer(inboxDirectory,input.intentIds);
    throw fault('PIRATE_READ','Choose a supported retained workspace view.');
  }
  async function file(id){
    sha(id);const value=store.read().fileIndex[id];need(value,'PIRATE_FILE_NOT_FOUND','Select a retained workspace file.',404);
    if(value.storage.kind==='object'){
      const raw=await store.object(value.storage.sha256);need(raw.length===value.bytes&&hash(raw)===value.sha256,'PIRATE_FILE_CHANGED','The original output bytes differ.',409);return {descriptor:clone(value),bytes:raw};
    }
    const {readProjectFile}=await import('./package.mjs');return readProjectFile(store,value);
  }
  async function fileSource(id){
    sha(id);const value=store.read().fileIndex[id];need(value,'PIRATE_FILE_NOT_FOUND','Select a retained original output.',404);
    if(value.storage.kind==='object')return {path:join(store.root,'objects',sha(value.storage.sha256)),...clone(value)};
    const {readProjectSource}=await import('./package.mjs');return readProjectSource(store,value);
  }
  const close=()=>{
    if(closePromise)return closePromise;accepting=false;activeAbort?.abort();
    closePromise=(async()=>{await tail;closing=true;try{await publishers.close();}finally{await store.close();}})();return closePromise;
  };
  return {directory:store.root,workspaceId:store.read().workspaceId,configurationSha256:identity(store.read().providerReference),act,resume,read,file,fileSource,close,
    requestClose(){accepting=false;activeAbort?.abort();},get closed(){return closing;}};

}
