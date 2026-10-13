// MIT. Retained browser jobs use the original quotation programme and receiving writers.
import {join,resolve,basename} from 'node:path';
import {readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {exists,digest} from '../../node/store.mjs';
import {customerDirectory,withCustomerOperation,retainCustomerBytes,describeCustomerFile}
 from '../customer-updates/files.mjs';
import {readResearchHostFile,openResearchSource} from '../workspace-files.mjs';
import {QUOTE_REQUEST_LIMIT,QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,fields,id,hash,need,fingerprint,same}
 from './contracts.mjs';
import {quoteDirectoryIdentity,assertQuoteDirectory} from './configuration.mjs';
import {captureResearchQuoteInput} from './client.mjs';
import {RESEARCH_QUOTE_PROGRAMME_JOB_FIELDS as KIND,researchQuoteProgrammeJobInput as jobInput} from './programme-job.mjs';
import {researchQuoteProgrammeStepId,readResearchQuoteProgrammeJson,
 readResearchQuoteProgrammeHeader,createResearchQuoteProgramme,readResearchQuoteProgramme,
 readResearchQuoteProgrammeStep,submitResearchQuoteProgramme,applyResearchQuoteProgrammeReview,replayResearchQuoteProgramme}
 from './programme.mjs';
import {researchQuoteHandoverInput,researchQuoteHandoverPath,createResearchQuoteHandover,inspectResearchQuoteHandover}
 from './programme-files.mjs';
import {prepareResearchQuoteProgrammeReceiving,
 receiveResearchQuoteProgramme,readResearchQuoteProgrammeReceiving} from './programme-receiving.mjs';
import {createResearchQuoteProgrammeArchive,receiveResearchQuoteProgrammeArchive,openResearchQuoteProgrammeArchive}
 from './programme-archive.mjs';
import {RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,startResearchQuoteProgrammeUpload,inspectResearchQuoteProgrammeUpload,
 appendResearchQuoteProgrammeUpload,finishResearchQuoteProgrammeUpload} from './programme-upload.mjs';

export const RESEARCH_QUOTE_PROGRAMME_DESK='sf88-research-quotation-programme-desk/v1';
const REQUEST='sf88-research-quotation-programme-job-request/v1',RESULT='sf88-research-quotation-programme-job-result/v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FILE_LIMIT=Math.max(QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT+65536);
const clone=value=>JSON.parse(JSON.stringify(value));
const bytes=value=>Buffer.from(JSON.stringify(value));
const now=()=>new Date().toISOString();
function limits(value){
 return value.kind==='SUBMIT'&&value.command==='prepare-case-transfer'?QUOTE_CASE_TRANSFER_LIMIT+65536:QUOTE_REQUEST_LIMIT+65536;
}
async function retain(root,name,value,maximum=QUOTE_FILE_LIMIT){
 const body=bytes(value);need(body.length<=maximum,'RESEARCH_QUOTE_PROGRAMME_RECORD_LIMIT',413);
 return retainCustomerBytes(root,name,body);
}
function requestSelection(input){
 const {value,...routing}=input;
 if(value===undefined)return routing;
 const identity={};
 for(const key of ['schema','id','requestId','caseId','dossierId','projectId','revision','caseMode','deliveryId'])
  if(typeof value[key]==='string'&&value[key].length<=240||Number.isSafeInteger(value[key]))identity[key]=value[key];
 return {...routing,valueSha256:fingerprint(value),valueIdentity:identity};
}
function originalRequest(value,workspaceId){
 need(value?.schema===REQUEST&&value.workspaceId===workspaceId&&Object.hasOwn(KIND,value.request?.kind)&&
  value.selectionSha256===fingerprint(value.request)&&value.inputFile?.name==='job-input.json'&&
  Number.isSafeInteger(value.inputFile.bytes)&&value.inputFile.bytes>0&&value.inputFile.bytes<=limits(value.request),
  'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
 id(value.request.id);hash(value.requestSha256);hash(value.inputFile.sha256);return value;
}
async function readRequest(root,workspaceId,{full=false}={}){
 const saved=originalRequest(await readResearchQuoteProgrammeJson(root,'request.json'),workspaceId);
 if(!full)return saved;
 const body=await readResearchHostFile(join(root,'job-input.json'),limits(saved.request),{sha256:saved.inputFile.sha256}),
  input=jobInput(JSON.parse(body));
 need(body.length===saved.inputFile.bytes&&fingerprint(input)===saved.requestSha256&&
  same(requestSelection(input),saved.request),'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
 return {...saved,input};
}
function resultRecord(value,request){
 need(value?.schema===RESULT&&value.workspaceId===request.workspaceId&&value.id===request.request.id&&
  value.requestSha256===request.requestSha256&&value.resultSha256===fingerprint(value.result),
  'RESEARCH_QUOTE_PROGRAMME_JOB_RESULT_CHANGED');return value;
}
function resultSummary(request,result){
 const value=result.result,selected=value.selection??value.source??null;
 return {id:request.request.id,kind:request.request.kind,programmeId:value.programme?.input?.id??
  selected?.programmeId??request.request.programmeId??null,
  programmeName:value.programme?.input?.name??null,stepId:value.summary?.stepId??request.request.stepId??null,
  status:value.status??value.summary?.status??null,nativeState:value.summary?.nativeState??null,
  requestId:value.summary?.requestId??value.request?.input?.requestId??null,
  reviewSha256:value.review?.reviewSha256??null,next:value.summary?.next??null,
  manifestSha256:value.manifestSha256??value.source?.manifestSha256??null,
  files:value.files?.length??value.source?.files?.length??null,
  caseId:value.destination?.caseId??selected?.caseId??value.programme?.input?.caseId??null,
  dossierId:value.destination?.dossierId??selected?.dossierId??value.programme?.input?.dossierId??null,
  destination:value.destination??value.result?.destination??null,
  resultSha256:result.resultSha256,completedAt:result.completedAt};
}
async function stepProjection(value){
 const {input,...selected}=value,file=value.record.inputFile,
  maximum=value.record.selection.command==='prepare-case-transfer'?QUOTE_CASE_TRANSFER_LIMIT:QUOTE_REQUEST_LIMIT;
 const inputFile=await describeCustomerFile(join(value.directory,file.name),{bytes:file.bytes,sha256:file.sha256,maximum});
 return {...selected,inputFile};
}
function bundleProjection(value){
 const {caseRecord,operations,...selected}=value;
 const caseRecordFile=value.files.find(file=>file.name===value.selection.caseRecord.name);
 need(caseRecordFile,'RESEARCH_QUOTE_HANDOVER_CASE_CHANGED');
 return {...selected,caseRecordFile,operations:operations.map(row=>{
  const item=value.selection.operations.find(item=>item.id===row.id),
   operationFile=value.files.find(file=>file.name===item?.name);
  need(operationFile,'RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
  return {...item,directory:row.directory,files:row.files,operationFile};
 })};
}
async function completedJob(root,request,{full=false}={}){
 let completion=await readResearchQuoteProgrammeJson(root,'completion.json'),result=null;
 if(!completion&&await exists(join(root,'result.json'))){
  result=resultRecord(await readResearchQuoteProgrammeJson(root,'result.json'),request);
  const file=await describeCustomerFile(join(root,'result.json'),{maximum:QUOTE_FILE_LIMIT});
  const summary=resultSummary(request,result);
  completion={schema:'sf88-research-quotation-programme-job-complete/v1',workspaceId:request.workspaceId,
   id:request.request.id,requestSha256:request.requestSha256,resultSha256:result.resultSha256,
   file:{name:'result.json',bytes:file.bytes,sha256:file.sha256},summary,summarySha256:fingerprint(summary)};
  await retain(root,'completion.json',completion);
 }
 if(!completion)return null;
 need(completion.schema==='sf88-research-quotation-programme-job-complete/v1'&&
  completion.workspaceId===request.workspaceId&&completion.id===request.request.id&&
  completion.requestSha256===request.requestSha256&&completion.file?.name==='result.json'&&
  Number.isSafeInteger(completion.file.bytes)&&completion.file.bytes>0&&completion.file.bytes<=QUOTE_FILE_LIMIT&&
  completion.summarySha256===fingerprint(completion.summary),'RESEARCH_QUOTE_PROGRAMME_JOB_RESULT_CHANGED');
 hash(completion.file.sha256);hash(completion.resultSha256);
 if(full&&!result){
  const body=await readResearchHostFile(join(root,'result.json'),QUOTE_FILE_LIMIT,{sha256:completion.file.sha256});
  need(body.length===completion.file.bytes,'RESEARCH_QUOTE_PROGRAMME_JOB_RESULT_CHANGED');
  result=resultRecord(JSON.parse(body),request);
 }
 if(result)need(result.resultSha256===completion.resultSha256&&same(resultSummary(request,result),completion.summary),
  'RESEARCH_QUOTE_PROGRAMME_JOB_RESULT_CHANGED');
 return {...completion,...(result?{result}:{}),file:{...completion.file,path:join(root,'result.json')}};
}
function fault(error){
 return {code:/^[A-Z0-9_]{1,140}$/.test(error?.code??'')?error.code:'RESEARCH_QUOTE_PROGRAMME_JOB_FAILED',
  message:String(error?.message??error).slice(0,2000),outcomeUnknown:error?.outcomeUnknown!==false,
  ...(error?.requestState?{requestState:error.requestState}:{})};
}
function paging(input={}){
 fields(input,['offset','limit','snapshot','kind'],[]);
 const offset=input.offset??0,limit=input.limit??20;
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
  'RESEARCH_QUOTE_PROGRAMME_PAGE_INVALID');
 if(input.snapshot!==undefined)hash(input.snapshot);
 if(input.kind!==undefined)need(Object.hasOwn(KIND,input.kind),'RESEARCH_QUOTE_PROGRAMME_JOB_KIND_REQUIRED');
 return {offset,limit,...(input.snapshot?{snapshot:input.snapshot}:{}),...(input.kind?{kind:input.kind}:{})};
}
function page(items,input){
 const {offset,limit,snapshot:expected}=paging(input),snapshot=fingerprint(items);
 need(expected===undefined||expected===snapshot,'RESEARCH_QUOTE_PROGRAMME_PAGE_CHANGED',409);
 return {items:items.slice(offset,offset+limit),offset,limit,total:items.length,snapshot,
  nextOffset:offset+limit<items.length?offset+limit:null};
}
function collected(errors){
 if(!errors.length)return null;const first=errors[0];
 if(errors.length>1)first.researchQuoteProgrammeCloseErrors=errors.slice(1).map(fault);return first;
}

class ResearchQuoteProgrammeDesk {
 constructor({directory,workspaceId,identity,client}){
  Object.assign(this,{directory,workspaceId,identity,clientFactory:client});
  this.pending=new Set();this.active=new Map();this.serial=new Map();this.sources=new Set();this.bundleIndexes=new Map();
  this.clientPromise=null;this.clientOwner=null;this.stopping=false;this.closing=null;this.closed=false;
 }
 run(work){
  need(!this.stopping,'RESEARCH_QUOTE_PROGRAMME_DESK_CLOSING',409);
  const operation=(async()=>{await assertQuoteDirectory(this.identity);return work();})();
  this.pending.add(operation);operation.then(()=>this.pending.delete(operation),()=>this.pending.delete(operation));return operation;
 }
 async client(){
  if(!this.clientPromise)this.clientPromise=(async()=>{
   const client=this.clientOwner??(typeof this.clientFactory==='function'?await this.clientFactory():this.clientFactory);
   need(client&&typeof client.status==='function'&&typeof client.customerQuotes==='function'&&typeof client.close==='function',
    'RESEARCH_QUOTE_PROGRAMME_ORIGINAL_CLIENT_REQUIRED');
   this.clientOwner=client;
   const status=await client.status();
   need(status.workspaceId===this.workspaceId,'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');return client;
  })();
  try{return await this.clientPromise;}catch(error){
   this.clientPromise=null;throw error;
  }
 }
 path(kind,key){id(key);return join(this.directory,kind,key);}
 async exclusive(key,work){
  const prior=this.serial.get(key)??Promise.resolve(),next=prior.catch(()=>{}).then(work);
  this.serial.set(key,next);
  try{return await next;}finally{if(this.serial.get(key)===next)this.serial.delete(key);}
 }
 async rawJob(key,{result=false}={}){
  const root=await customerDirectory(this.path('jobs',key),{create:false});
  return this.exclusive(key,()=>withCustomerOperation(root,async()=>{
   const request=await readRequest(root,this.workspaceId),saved=await completedJob(root,request,{full:result}),
    entries=await readdir(root),names=entries.filter(name=>/^error-[a-f0-9-]{36}\.json$/.test(name)),errors=[],
    attempts=entries.filter(name=>/^attempt-[a-f0-9-]{36}\.json$/.test(name)).length;
   for(const name of names)errors.push(await readResearchQuoteProgrammeJson(root,name));
   errors.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.attemptId.localeCompare(b.attemptId));
   return {schema:RESEARCH_QUOTE_PROGRAMME_DESK,workspaceId:this.workspaceId,id:key,
    request:clone(request.request),requestSha256:request.requestSha256,createdAt:request.createdAt,
    status:saved?'COMPLETE':this.active.has(key)?'RUNNING':errors.length?'RETRY_REQUIRED':'READY',
    error:errors.at(-1)?.error??null,attempts,summary:saved?.summary??null,
    resultFile:saved?.file??null,...(result&&saved?{result:saved.result.result}:{}),
    inputFile:{...request.inputFile,path:join(root,request.inputFile.name)}};

  }));
 }
 info(){return this.run(async()=>({schema:RESEARCH_QUOTE_PROGRAMME_DESK,workspaceId:this.workspaceId,
  directory:this.directory,uploadChunkBytes:RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,
  inputLimit:QUOTE_REQUEST_LIMIT,caseInputLimit:QUOTE_CASE_TRANSFER_LIMIT,fileLimit:FILE_LIMIT,
  capabilities:{jobs:true,programmes:true,originalQuotationForms:true,archives:true,receiving:true},
  configuration:await (await this.client()).customerQuotes().configuration()}));}
 jobs(input={}){
  const selected=paging(input);
  return this.run(async()=>{
   const rows=[];
   for(const key of (await readdir(join(this.directory,'jobs'))).filter(name=>UUID.test(name)).sort()){
    const requestPath=join(this.path('jobs',key),'request.json');if(!await exists(requestPath))continue;
    const item=await this.rawJob(key);
    if(!selected.kind||item.request.kind===selected.kind)rows.push({id:item.id,kind:item.request.kind,
     status:item.status,createdAt:item.createdAt,requestSha256:item.requestSha256,summary:item.summary,error:item.error,
     programmeId:item.request.programmeId??item.request.valueIdentity?.id??null});
   }
   rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
   return {schema:RESEARCH_QUOTE_PROGRAMME_DESK,workspaceId:this.workspaceId,...page(rows,selected)};
  });
 }
 job(key,options={}){id(key);const selected={result:options.result===true};return this.run(()=>this.rawJob(key,selected));}
 async prepare(input){
  return this.exclusive(input.id,()=>withCustomerOperation(this.path('jobs',input.id),async root=>{
   const old=await readResearchQuoteProgrammeJson(root,'request.json');
   if(old){
    const original=await readRequest(root,this.workspaceId);
    need(original.requestSha256===fingerprint(input)&&same(original.request,requestSelection(input)),
     'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');return original;
   }
   need(!await exists(join(root,'result.json')),'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
   const body=bytes(input);need(body.length<=limits(input),'RESEARCH_QUOTE_PROGRAMME_INPUT_LIMIT',413);
   const request=requestSelection(input),record={schema:REQUEST,workspaceId:this.workspaceId,
    request,selectionSha256:fingerprint(request),requestSha256:fingerprint(input),
    inputFile:{name:'job-input.json',bytes:body.length,sha256:digest(body)},createdAt:now()};
   originalRequest(record,this.workspaceId);
   await retainCustomerBytes(root,'job-input.json',body);await retain(root,'request.json',record,limits(input));return record;
  }));
 }
 submit(value){
  const input=jobInput(value);
  return this.run(async()=>{await this.prepare(input);this.schedule(input.id);return this.rawJob(input.id);});
 }
 resume(key){id(key);return this.run(async()=>{
  const saved=await this.rawJob(key);if(saved.status!=='COMPLETE')this.schedule(key);return this.rawJob(key);
 });}
 schedule(key){
  if(this.active.has(key))return;
  const operation=(async()=>{
   let request,attemptId=randomUUID(),root=this.path('jobs',key);
   try{
    const saved=await this.rawJob(key);if(saved.status==='COMPLETE')return;
    request=await this.exclusive(key,()=>withCustomerOperation(root,async root=>{
     request=await readRequest(root,this.workspaceId);
     const current=await readRequest(root,this.workspaceId,{full:true});
     await retain(root,'attempt-'+attemptId+'.json',{schema:'sf88-research-quotation-programme-job-attempt/v1',
      id:key,workspaceId:this.workspaceId,requestSha256:current.requestSha256,attemptId,createdAt:now()});return current;
    }));
    const result=await this.execute(request.input),
     complete={schema:RESULT,workspaceId:this.workspaceId,id:key,requestSha256:request.requestSha256,
      result,resultSha256:fingerprint(result),completedAt:now(),attemptId};
    await this.exclusive(key,()=>withCustomerOperation(root,async root=>{
     const old=await readResearchQuoteProgrammeJson(root,'result.json');
     if(old){resultRecord(old,request);return;}
     await retain(root,'result.json',complete);await completedJob(root,request);
    }));
   }catch(error){
    if(error?.close&&typeof error.close==='function')this.sources.add(error);
    if(request)try{await this.exclusive(key,()=>withCustomerOperation(root,root=>retain(root,'error-'+attemptId+'.json',
     {schema:'sf88-research-quotation-programme-job-error/v1',id:key,workspaceId:this.workspaceId,
      requestSha256:request.requestSha256,attemptId,createdAt:now(),error:fault(error)})));}catch{}
    // The complete original request and native phase remain the retry authority.
   }
  })();
  this.active.set(key,operation);this.pending.add(operation);
  operation.then(()=>{this.active.delete(key);this.pending.delete(operation);},
   ()=>{this.active.delete(key);this.pending.delete(operation);});
 }
 async execute(request){
  await assertQuoteDirectory(this.identity);
  const client=()=>this.client(),directory=this.path('programmes',request.programmeId??request.value?.id??request.id);
  switch(request.kind){
   case 'CREATE':return createResearchQuoteProgramme({client,directory,input:request.value});
   case 'SUBMIT':return stepProjection(await submitResearchQuoteProgramme({client,directory,stepId:request.stepId,
    command:request.command,input:request.value,action:request.action,profile:request.profile}));
   case 'APPLY':return stepProjection(await applyResearchQuoteProgrammeReview({client,directory,
    stepId:request.stepId,sourceStepId:request.sourceStepId,reviewSha256:request.reviewSha256}));
   case 'REPLAY':return stepProjection(await replayResearchQuoteProgramme({client,directory,
    stepId:request.stepId,sourceStepId:request.sourceStepId}));
   case 'EXPORT':return bundleProjection(await createResearchQuoteHandover({client,directory:this.path('exports',request.id),
    input:researchQuoteHandoverInput({...request.value,programmeDirectory:directory})}));
   case 'IMPORT':{
    const upload=await this.exclusive(request.id,()=>withCustomerOperation(this.path('jobs',request.id),async root=>{
     let source=await readResearchQuoteProgrammeJson(root,'source-upload.json');
     if(!source){
      const original=await inspectResearchQuoteProgrammeUpload(this.path('uploads',request.uploadId));
      need(original.state==='COMPLETE','RESEARCH_QUOTE_PROGRAMME_UPLOAD_INCOMPLETE');
      source={schema:'sf88-research-quotation-programme-upload-selection/v1',workspaceId:this.workspaceId,
       id:request.id,requestSha256:fingerprint(request),uploadId:request.uploadId,
       path:original.path,bytes:original.bytes,sha256:original.sha256};
      await retain(root,'source-upload.json',source);
     }
     need(source.schema==='sf88-research-quotation-programme-upload-selection/v1'&&source.workspaceId===this.workspaceId&&
      source.id===request.id&&source.requestSha256===fingerprint(request)&&source.uploadId===request.uploadId&&
      typeof source.path==='string'&&resolve(source.path)===source.path&&
      source.path.startsWith(this.path('uploads',request.uploadId)+'/')&&
      Number.isSafeInteger(source.bytes)&&source.bytes>0,'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
     hash(source.sha256);return source;
    }));
    const saved=await receiveResearchQuoteProgrammeArchive({directory:this.path('imports',request.id),
     path:upload.path,bytes:upload.bytes,sha256:upload.sha256});
    if(request.manifestSha256)need(saved.manifestSha256===request.manifestSha256,'RESEARCH_QUOTE_HANDOVER_CHANGED');
    return bundleProjection(saved);
   }
   case 'ARCHIVE':{
    const sourceDirectory=await this.bundleDirectory(request.bundleId,request.manifestSha256);
    return createResearchQuoteProgrammeArchive({directory:this.path('archives',request.id),
     sourceDirectory,manifestSha256:request.manifestSha256});
   }
   case 'RECEIVE_REVIEW':{
    need(request.value.expectedWorkspaceId===this.workspaceId,'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
    const sourceDirectory=await this.bundleDirectory(request.bundleId,request.manifestSha256);
    return prepareResearchQuoteProgrammeReceiving({client,directory:this.path('receiving',request.id),
     sourceDirectory,manifestSha256:request.manifestSha256,input:request.value});
   }
   case 'RECEIVE':return receiveResearchQuoteProgramme({client,directory:this.path('receiving',request.receivingId),
    reviewSha256:request.reviewSha256});
   default:need(false,'RESEARCH_QUOTE_PROGRAMME_JOB_KIND_REQUIRED');
  }
 }
 programme(key){id(key);return this.run(()=>readResearchQuoteProgramme(this.path('programmes',key)));}
 step(key,stepId){id(key);researchQuoteProgrammeStepId(stepId);
  return this.run(async()=>stepProjection(await readResearchQuoteProgrammeStep({directory:this.path('programmes',key),stepId})));
 }
 receiving(key){id(key);return this.run(()=>readResearchQuoteProgrammeReceiving(this.path('receiving',key)));}
 async bundleDirectory(key,manifestSha256){
  id(key);hash(manifestSha256);
  const job=await this.rawJob(key),kind=job.request.kind;
  need(job.status==='COMPLETE'&&(kind==='EXPORT'||kind==='IMPORT')&&job.summary?.manifestSha256===manifestSha256,
   'RESEARCH_QUOTE_PROGRAMME_BUNDLE_REQUIRED');
  // The native creator/receiver resolves its own retained input before reopening
  // this original donor. A lost outer reply must preserve that recovery path.
  return join(this.path(kind==='EXPORT'?'exports':'imports',key),'package');
 }
 async bundleIndex(key,manifestSha256){
  id(key);if(manifestSha256!==undefined)hash(manifestSha256);
  const job=await this.rawJob(key),kind=job.request.kind;
  need(job.status==='COMPLETE'&&(kind==='EXPORT'||kind==='IMPORT'),'RESEARCH_QUOTE_PROGRAMME_BUNDLE_REQUIRED');
  const directory=await customerDirectory(join(this.path(kind==='EXPORT'?'exports':'imports',key),'package'),{create:false}),
   identity=await quoteDirectoryIdentity(directory),cacheKey=key+':'+job.resultFile.sha256;
  let cached=this.bundleIndexes.get(cacheKey);
  if(cached)need(same(cached.identity,identity),'RESEARCH_QUOTE_HANDOVER_SOURCE_CHANGED');
  else{
   const result=(await this.rawJob(key,{result:true})).result;
   need(result?.schema==='sf88-research-quotation-handover-inspected/v1'&&result.manifest?.files&&
    result.manifestBytes>0&&Array.isArray(result.files)&&
    same(result.files.map(({name,bytes,sha256})=>({name,bytes,sha256})),result.manifest.files),
    'RESEARCH_QUOTE_HANDOVER_CHANGED');
   hash(result.manifestSha256);
   cached={identity,result:{...result,directory,
    files:result.files.map(file=>({...file,path:join(directory,researchQuoteHandoverPath(file.name))}))}};
   if(this.bundleIndexes.size>=8)this.bundleIndexes.delete(this.bundleIndexes.keys().next().value);
   this.bundleIndexes.set(cacheKey,cached);
  }
  const value=cached.result,body=await readResearchHostFile(join(directory,'quotation-programme.json'),
   QUOTE_FILE_LIMIT,{sha256:value.manifestSha256});
  need(body.length===value.manifestBytes&&same(JSON.parse(body),value.manifest)&&
   (manifestSha256===undefined||manifestSha256===value.manifestSha256),'RESEARCH_QUOTE_HANDOVER_CHANGED');
  return value;
 }
 bundle(key,manifestSha256){id(key);return this.run(()=>this.bundleIndex(key,manifestSha256));}
 files(key,input={}){
  id(key);const selected=paging(input);need(!selected.kind,'RESEARCH_QUOTE_PROGRAMME_PAGE_INVALID');
  return this.run(async()=>{
   const bundle=await this.bundleIndex(key),manifest={name:'quotation-programme.json',bytes:bundle.manifestBytes,
    sha256:bundle.manifestSha256,path:join(bundle.directory,'quotation-programme.json')},
    rows=[manifest,...bundle.files].map(({name,bytes,sha256})=>({name,bytes,sha256}));
   return {schema:RESEARCH_QUOTE_PROGRAMME_DESK,workspaceId:this.workspaceId,id:key,manifestSha256:bundle.manifestSha256,
    selection:bundle.selection,...page(rows,selected)};
  });
 }
 async selectedFile(key,name,{job=false}={}){
  id(key);
  if(job){
   need(['job-input.json','request.json','result.json'].includes(name),'RESEARCH_QUOTE_PROGRAMME_FILE_REQUIRED');
   const saved=await this.rawJob(key),root=this.path('jobs',key),maximum=name==='result.json'?QUOTE_FILE_LIMIT:limits(saved.request);
   const file=await describeCustomerFile(join(root,name),{maximum});return {...file,name,maximum};
  }
  researchQuoteHandoverPath(name);
  const bundle=await this.bundleIndex(key),file=name==='quotation-programme.json'?
   {name,path:join(bundle.directory,name),bytes:bundle.manifestBytes,sha256:bundle.manifestSha256}:
   bundle.files.find(item=>item.name===name);
  need(file,'RESEARCH_QUOTE_HANDOVER_FILE_MISSING',404);
  const parts=researchQuoteHandoverPath(name).split('/');let parent=bundle.directory;
  for(const part of parts.slice(0,-1))parent=await customerDirectory(join(parent,part),{create:false});
  return {...file,path:join(parent,parts.at(-1)),maximum:FILE_LIMIT,manifestSha256:bundle.manifestSha256};
 }
 fileInfo(key,name,options={}){
  const input={job:options.job===true};return this.run(async()=>({schema:RESEARCH_QUOTE_PROGRAMME_DESK,
   workspaceId:this.workspaceId,id:key,descriptor:await this.selectedFile(key,name,input)}));
 }
 streamFile(key,name,consume,options={}){
  const input={job:options.job===true};need(typeof consume==='function','RESEARCH_QUOTE_PROGRAMME_STREAM_REQUIRED');
  return this.run(async()=>{
   const file=await this.selectedFile(key,name,input),source=await openResearchSource(file.path,file.maximum,{sha256:file.sha256});
   this.sources.add(source);let failure,result;
   try{result=await consume({...source,...file,name:basename(file.name),
    contentType:file.name.endsWith('.json')?'application/json':file.name.endsWith('.md')?'text/markdown':'application/octet-stream'});}
   catch(error){failure=error;}
   try{await source.close();this.sources.delete(source);}catch(error){if(failure)failure.researchQuoteProgrammeClose=fault(error);else failure=error;}
   if(failure)throw failure;return result;
  });
 }
 async originalArchive(key){
  const job=await this.rawJob(key,{result:true});
  need(job.request.kind==='ARCHIVE'&&job.status==='COMPLETE','RESEARCH_QUOTE_PROGRAMME_ARCHIVE_REQUIRED');
  const result=job.result;hash(result.sha256);hash(result.manifestSha256);
  const root=this.path('archives',key);
  need(typeof result.path==='string'&&resolve(result.path)===result.path&&result.path.startsWith(root+'/'),
   'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');
  return {...result,name:'research-programme-'+result.sha256+'.sf88q.gz'};
 }
 archive(key){id(key);return this.run(async()=>({schema:RESEARCH_QUOTE_PROGRAMME_DESK,workspaceId:this.workspaceId,
  id:key,...await this.originalArchive(key)}));}
 streamArchive(key,consume){
  id(key);need(typeof consume==='function','RESEARCH_QUOTE_PROGRAMME_STREAM_REQUIRED');
  return this.run(async()=>{
   const metadata=await this.originalArchive(key),source=await openResearchQuoteProgrammeArchive(metadata);
   this.sources.add(source);let failure,result;
   try{result=await consume({...metadata,...source});}catch(error){failure=error;}
   try{await source.close();this.sources.delete(source);}catch(error){if(failure)failure.researchQuoteProgrammeClose=fault(error);else failure=error;}
   if(failure)throw failure;return result;
  });
 }
 startUpload(value){
  const input=captureResearchQuoteInput(value);id(input.id);
  return this.run(()=>startResearchQuoteProgrammeUpload({directory:this.path('uploads',input.id),input}));
 }
 upload(key){id(key);return this.run(()=>inspectResearchQuoteProgrammeUpload(this.path('uploads',key)));}
 appendUpload(key,{offset,data,sha256}={}){
  id(key);hash(sha256);const body=Buffer.from(data);
  need(body.length<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK_LIMIT',413);
  return this.run(()=>appendResearchQuoteProgrammeUpload({directory:this.path('uploads',key),offset,data:body,sha256}));
 }
 finishUpload(key){id(key);return this.run(()=>finishResearchQuoteProgrammeUpload({directory:this.path('uploads',key)}));}
 close(){
  this.stopping=true;if(this.closed)return Promise.resolve();if(this.closing)return this.closing;
  this.closing=(async()=>{
   while(this.pending.size)await Promise.allSettled([...this.pending]);
   const failures=[];
   for(const source of [...this.sources])try{await source.close();this.sources.delete(source);}catch(error){failures.push(error);}
   if(this.clientOwner)try{await this.clientOwner.close();this.clientOwner=null;}catch(error){failures.push(error);}
   const error=collected(failures);if(error)throw error;this.closed=true;
  })();
  this.closing.catch(()=>{this.closing=null;});return this.closing;
 }
}
export async function openResearchQuoteProgrammeDesk({directory,workspaceId,client}={}){
 need(typeof directory==='string'&&resolve(directory)===directory&&directory!=='/'&&
  /^research_[a-f0-9]{64}$/.test(workspaceId??''),'RESEARCH_QUOTE_PROGRAMME_DESK_REQUIRED');
 const root=await customerDirectory(directory);
 await withCustomerOperation(root,async root=>{
  const expected={schema:RESEARCH_QUOTE_PROGRAMME_DESK,workspaceId},
   saved=await readResearchQuoteProgrammeJson(root,'desk.json');
  if(saved)need(same(saved,expected),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
  else await retain(root,'desk.json',expected);
  for(const name of ['jobs','programmes','exports','imports','receiving','archives','uploads'])await customerDirectory(join(root,name));
 });
 return new ResearchQuoteProgrammeDesk({directory:root,workspaceId,identity:await quoteDirectoryIdentity(root),client});
}
