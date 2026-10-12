// SPDX-License-Identifier: MIT
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openWorkspaceStore,inspectWorkspaceIdentity,privateDirectory,readOwned} from '../stellar-expert/store.mjs';
import {WORKSPACE_SCHEMA,CONTRACT_SCHEMA,RESPONSE_SCHEMA,REPORT_SCHEMA,configuration,contract,forecastRequest,responseHeaders,usage,
  inspectForecast,reviewInput,identity,bytes,hash,need,fault,exact,text,uuid,sha,whole,stamp,safeError,MAX_RESPONSE} from './contract.mjs';
import {providerAccount,requireProviderKey,captureForecast} from './provider.mjs';
import {buildReport,inspectReport,compareReports,reportFiles} from './reports.mjs';
import {prepareForecastDataset,nativePublishers,queryNativeDataset,prepareNativeRelease,inspectNativeRelease,controlNativeRelease,inspectBuyer,receiveBuyer,readBuyerOutput} from './dataset.mjs';
export const ACTIONS=Object.freeze(['contract.save','capture.fetch','capture.import','capture.reconcile','report.prepare','report.review','report.export',
  'dataset.prepare','release.prepare','release.activate','release.start','release.stop','release.rollback','buyer.receive','project.export']);
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
  const existing=await inspectWorkspaceIdentity(directory,{allowMissing:create,schema:WORKSPACE_SCHEMA});
  if(!existing)need(create,'PIRATE_INITIALIZATION_REQUIRED','Initialize this original workspace before opening it.',409);
  const requested=config?configuration(config):null;
  const store=await openWorkspaceStore(directory,{schema:WORKSPACE_SCHEMA,initialState:{
    providerReference:requested??{name:'Pirate Weather',apiKeyEnv:'PIRATE_WEATHER_API_KEY'},contractEditions:[],currentContractSha256:null,
    reportIds:[],selectedReportId:null,reviews:[],fileIndex:{},providerHold:null,receiving:[]}});
  try{
    configuration(store.read().providerReference);
    if(requested)need(identity(requested)===identity(store.read().providerReference),'PIRATE_CONNECTION_CHANGED','This workspace retains another original provider reference.',409);
  }catch(error){await store.close();throw error;}
  const publishers=nativePublishers(store);let tail=Promise.resolve(),closing=false,poisoned=false,activeAbort=null;
  const assertOpen=()=>need(!closing&&!poisoned,'PIRATE_REOPEN_REQUIRED','Close and reopen this original workspace before continuing an uncertain save.',503);
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
  async function normalize(action,p){
    let source=null,context={};p=clone(p);
    const actor=()=>text(p.actor,'the named operator',120);
    switch(action){
      case 'contract.save':
        exact(p,['value','previousContractSha256','actor','note'],['value','previousContractSha256','actor','note']);contract(p.value);actor();text(p.note,'the contract revision reason',8000);
        if(p.previousContractSha256!==null)sha(p.previousContractSha256);break;
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
      case 'buyer.receive':
        exact(p,['intentIds'],['intentIds']);need(Array.isArray(p.intentIds)&&p.intentIds.length>0&&p.intentIds.length<=100,'PIRATE_BUYER_SELECTION','Select the original buyer intent IDs.');
        p.intentIds.forEach(v=>text(v,'an original buyer intent ID',240));context.inboxDirectory=inboxDirectory;break;
      case 'project.export':
        exact(p,['title'],['title']);text(p.title,'the complete project title',160);context.applicationSource=applicationSource;break;
      default:throw fault('PIRATE_ACTION','Choose a supported operation.');
    }
    return {payload:p,source,context};
  }
  async function reserve(request){
    exact(request,['operationId','expectedRevision','action','payload'],['operationId','expectedRevision','action','payload']);
    uuid(request.operationId);whole(request.expectedRevision,'the original workspace revision');
    need(ACTIONS.includes(request.action),'PIRATE_ACTION','Choose a supported operation.');
    const input=await normalize(request.action,request.payload),payloadSha256=identity({action:request.action,payload:input.payload});
    let retained=store.read().operations[request.operationId];
    if(retained){need(retained.payloadSha256===payloadSha256&&retained.action===request.action,'PIRATE_REQUEST_ID_REUSED','This UUID belongs to another exact original request.',409);return retained;}
    need(store.read().revision===request.expectedRevision,'PIRATE_REVISION_CHANGED','The workspace changed; review the current source and submit a new request UUID.',409);
    if(input.source)await object(input.source);
    await mutate(s=>{
      need(s.revision===request.expectedRevision,'PIRATE_REVISION_CHANGED','The workspace changed before this request was accepted.',409);
      if(request.action==='contract.save')need(s.currentContractSha256===input.payload.previousContractSha256,'PIRATE_CONTRACT_CHANGED','The contract edition changed; review its exact current source.',409);
      if(request.action==='capture.fetch'){
        requireProviderKey(s.providerReference,environment);
        if(s.providerHold){
          const until=s.providerHold.retryAt;
          need(until&&Date.parse(until)<=Date.now(),'PIRATE_PROVIDER_DEADLINE','The original provider response still defers source calls. Retain its deadline and original request.',429);
        }
      }
      if(request.action==='project.export')input.context.snapshot=clone(s);
      retained={operationId:request.operationId,action:request.action,payload:input.payload,payloadSha256,expectedRevision:request.expectedRevision,
        createdAt:now(),state:'RUNNING',stages:{},context:input.context};
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
    const old=store.read().captures.find(c=>c.sourceIdentity===sourceIdentity);
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
    if(op.stages.result)return commit(op,op.stages.result);
    switch(op.action){
      case 'contract.save':{
        if(store.read().contractEditions.length){const old=await contractEdition(p.previousContractSha256);need(old.value.id===p.value.id,'PIRATE_CONTRACT_ID_CHANGED','Retain this customer contract ID across its revisions.',409);}
        const body={schema:CONTRACT_SCHEMA,workspaceId:store.read().workspaceId,ordinal:store.read().contractEditions.length+1,previousSha256:p.previousContractSha256,
          value:p.value,actor:p.actor,note:p.note,createdAt:op.createdAt,operationId:op.operationId},digest=identity(body),value={...body,id:digest,sha256:digest};
        await edition(value);
        return commit(op,value,s=>{s.contractEditions.push({id:digest,ordinal:value.ordinal,createdAt:value.createdAt,title:p.value.title,units:p.value.units,contractId:p.value.id});s.currentContractSha256=digest;});
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
        return commit(op,description,s=>{s.reportIds.push(description);s.selectedReportId=value.id;});
      }
      case 'report.review':{
        await report(p.reportId);
        const body={...p,at:op.createdAt,operationId:op.operationId},review={...body,id:identity(body)};
        return commit(op,review,s=>s.reviews.push(review));
      }
      case 'report.export':
      case 'dataset.prepare':{
        const value=await report(p.reportId),review=choice(store.read().reviews,p.reviewId,'review');
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
        const output=await prepareNativeRelease(store,{dataset:choice(store.read().datasets,p.datasetId,'dataset'),origin:p.origin,path:p.path,payment:p.payment,id:'pirate-'+id,runtime:op.context.releaseRuntime,publishers});
        await checkpoint(op,'nativeResult',output);return commit(op,output,s=>s.releases.push(output));
      }
      case 'release.activate':case 'release.start':case 'release.stop':case 'release.rollback':{
        if(op.stages.nativeInvoking&&!op.stages.nativeResult)throw fault('PIRATE_NATIVE_RECONCILIATION_REQUIRED','Inspect the original release generation before continuing its interrupted control request.',409);
        if(op.stages.nativeResult)return commit(op,op.stages.nativeResult);
        await checkpoint(op,'nativeInvoking',{releaseId:p.releaseId,expectedGeneration:p.expectedGeneration,action:op.action});
        const output=await controlNativeRelease(store,choice(store.read().releases,p.releaseId,'release'),op.action.split('.')[1],p,publishers);
        await checkpoint(op,'nativeResult',output);return commit(op,output);
      }
      case 'buyer.receive':{
        const output=await receiveBuyer(store,op.context.inboxDirectory,p.intentIds,'buyer-'+id);await checkpoint(op,'nativeResult',output);
        return commit(op,output,s=>s.receipts.push(output));
      }
      case 'project.export':{
        const {exportProject}=await import('./package.mjs');
        const output=await exportProject({store,operation:op,applicationSource:op.context.applicationSource,publishers});
        return commit(op,output,s=>{s.exports.push(output);for(const f of output.files??[])s.fileIndex[f.id]=f;});
      }
    }
  }
  async function act(request){
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
  async function view(){
    const s=store.read();
    return {schema:WORKSPACE_SCHEMA,workspaceId:s.workspaceId,revision:s.revision,createdAt:s.createdAt,provider:providerAccount(s.providerReference,environment),
      currentContractSha256:s.currentContractSha256,contractEditions:s.contractEditions,captures:s.captures,reports:s.reportIds,reviews:s.reviews,
      datasets:s.datasets,releases:s.releases.map(({handoff,...r})=>r),buyerReceipts:s.receipts,exports:s.exports,
      providerHold:s.providerHold,selectedReportId:s.selectedReportId,closing,requiresReopen:poisoned,
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
    if(method==='compare')return compareReports(await report(input.beforeId),await report(input.afterId));
    if(method==='operation'){
      const op=operation(input.operationId),{context,...publicOp}=op;
      return {...publicOp,...(op.state==='COMPLETE'?{acceptedResult:await resultOf(op)}:{})};
    }
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
  return {directory:store.root,workspaceId:store.read().workspaceId,act,read,file,
    async close(){if(closing)return;activeAbort?.abort();await tail;closing=true;try{await publishers.close();}finally{await store.close();}},
    requestClose(){activeAbort?.abort();},get closed(){return closing;}};
}
