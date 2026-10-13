// MIT. Complete programme jobs borrow the original admitted Research transport.
import {QUOTE_REQUEST_LIMIT,QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,fields,id,hash,need,fingerprint}
 from './contracts.mjs';
import {captureResearchQuoteInput} from './client.mjs';
import {researchQuoteHandoverPath} from './programme-files.mjs';
import {researchQuoteProgrammeStepId} from './programme.mjs';
import {researchQuoteProgrammeJobInput} from './programme-job.mjs';
import {RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT} from './programme-archive.mjs';
import {RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK} from './programme-upload.mjs';

const PREFIX='/api/customer-quote-programmes',SCHEMA='sf88-research-quotation-programme-desk/v1';
const KINDS=['CREATE','SUBMIT','APPLY','REPLAY','EXPORT','IMPORT','ARCHIVE','RECEIVE_REVIEW','RECEIVE'];
const FILE_LIMIT=Math.max(QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT+65536);
const options=value=>({signal:value?.signal});
function query(value){
 const result=new URLSearchParams();
 for(const [key,item]of Object.entries(value))if(item!==undefined)result.set(key,String(item));
 return result.size?'?'+result.toString():'';
}
function paging(value={},extra=[]){
 const selected=captureResearchQuoteInput(value);fields(selected,['offset','limit','snapshot',...extra],[]);
 for(const key of ['offset','limit'])if(selected[key]!==undefined)need(Number.isSafeInteger(selected[key])&&
  selected[key]>=(key==='limit'?1:0)&&(key!=='limit'||selected[key]<=100),'RESEARCH_QUOTE_PROGRAMME_PAGE_INVALID');
 if(selected.snapshot!==undefined)hash(selected.snapshot);
 if(selected.kind!==undefined)need(KINDS.includes(selected.kind),'RESEARCH_QUOTE_PROGRAMME_JOB_KIND_REQUIRED');
 return selected;
}
function fileDescriptor(value,maximum=FILE_LIMIT){
 need(value&&typeof value.name==='string'&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=maximum,
  'RESEARCH_QUOTE_PROGRAMME_FILE_CHANGED');
 researchQuoteHandoverPath(value.name);hash(value.sha256);return value;
}
function selectedFile(value={}){
 need(typeof value.file==='string'&&value.file.length>0,'RESEARCH_QUOTE_DESTINATION_REQUIRED');
 if(value.expectedSha256!==undefined)hash(value.expectedSha256);
 if(value.expectedBytes!==undefined)need(Number.isSafeInteger(value.expectedBytes)&&value.expectedBytes>=0,
  'RESEARCH_QUOTE_FILE_SIZE_INVALID');
 return {file:value.file,expectedSha256:value.expectedSha256,expectedBytes:value.expectedBytes,signal:value.signal};
}
/** run admits the entire metadata/download or upload operation once. This factory never closes its host. */
export function createResearchQuoteProgrammesClient({request,download,upload,range,run:originalRun}={}){
 need([request,download,upload,originalRun].every(value=>typeof value==='function'),'RESEARCH_QUOTE_ORIGINAL_CLIENT_REQUIRED');
 let workspaceId;
 const bound=value=>{
  need(/^research_[a-f0-9]{64}$/.test(value?.workspaceId??'')&&
   (workspaceId===undefined||workspaceId===value.workspaceId),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
  workspaceId??=value.workspaceId;return value;
 };
 const desk=value=>{need(value?.schema===SCHEMA,'RESEARCH_QUOTE_PROGRAMME_REPLY_CHANGED');return bound(value);};
 const job=(value,key,requestSha256)=>{
  desk(value);id(value.id);hash(value.requestSha256);
  need(value.id===key&&KINDS.includes(value.request?.kind)&&value.request.id===key&&
   ['READY','RUNNING','RETRY_REQUIRED','COMPLETE'].includes(value.status)&&
   (requestSha256===undefined||value.requestSha256===requestSha256),'RESEARCH_QUOTE_PROGRAMME_JOB_CHANGED');
  if(value.status==='COMPLETE'){
   need(value.summary?.id===key&&value.summary.kind===value.request.kind,'RESEARCH_QUOTE_PROGRAMME_JOB_RESULT_CHANGED');
   hash(value.summary.resultSha256);fileDescriptor(value.resultFile,QUOTE_FILE_LIMIT);
  }
  return value;
 };
 const page=(value,selected)=>{
  desk(value);hash(value.snapshot);
  need(Array.isArray(value.items)&&Number.isSafeInteger(value.total)&&value.total>=0&&
   value.offset===(selected.offset??0)&&value.limit===(selected.limit??20)&&value.items.length<=value.limit&&
   (value.nextOffset===null||value.nextOffset===value.offset+value.items.length&&value.nextOffset>value.offset)&&
   (selected.snapshot===undefined||selected.snapshot===value.snapshot),'RESEARCH_QUOTE_PROGRAMME_PAGE_CHANGED');
  return value;
 };
 const programme=(value,key)=>{
  need(value?.schema==='sf88-research-quotation-programme/v1'&&value.programme?.input?.id===key,
   'RESEARCH_QUOTE_PROGRAMME_CHANGED');
  bound({workspaceId:value.programme.workspaceId});hash(value.programme.inputSha256);return value;
 };
 const metadata=(value,key,name)=>{
  desk(value);need(value.id===key&&value.descriptor?.name===name,'RESEARCH_QUOTE_PROGRAMME_FILE_CHANGED');
  fileDescriptor(value.descriptor);return value;
 };
 const archive=(value,key)=>{
  desk(value);need(value.id===key&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT&&
   typeof value.name==='string'&&value.name==='research-programme-'+value.sha256+'.sf88q.gz',
   'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');hash(value.sha256);hash(value.manifestSha256);return value;
 };
 const uploaded=(value,key,selected)=>{
  need(value&&value.id===key&&typeof value.name==='string'&&Number.isSafeInteger(value.totalBytes)&&
   value.totalBytes>0&&value.totalBytes<=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT&&
   Number.isSafeInteger(value.receivedBytes)&&value.receivedBytes>=0&&value.receivedBytes<=value.totalBytes&&
   value.chunkBytes===RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK&&
   ['UPLOADING','READY_TO_FINISH','COMPLETE'].includes(value.state),'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
  if(selected)need(value.name===selected.name&&value.totalBytes===selected.bytes,
   'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
  if(value.pendingChunk)need(Number.isSafeInteger(value.pendingChunk.offset)&&value.pendingChunk.offset>=0&&
   Number.isSafeInteger(value.pendingChunk.bytes)&&value.pendingChunk.bytes>0&&
   value.pendingChunk.bytes<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK&&
   value.pendingChunk.offset+value.pendingChunk.bytes<=value.totalBytes&&
   /^[a-f0-9]{64}$/.test(value.pendingChunk.sha256),'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
  if(value.state==='COMPLETE'){
   hash(value.sha256);need(value.bytes===value.totalBytes&&typeof value.path==='string'&&
    (!selected||value.sha256===selected.sha256),'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHANGED');
  }
  return value;
 };
 const pinned=(value,selected)=>{
  need((selected.expectedSha256===undefined||selected.expectedSha256===value.sha256)&&
   (selected.expectedBytes===undefined||selected.expectedBytes===value.bytes),'RESEARCH_QUOTE_PROGRAMME_FILE_CHANGED');
 };
 const transfer=async(route,selected,metadata,descriptor)=>{
  pinned(descriptor,selected);
  try{
   const saved=await download(route,selected.file,{signal:selected.signal,expectedSha256:descriptor.sha256});
   if(saved?.bytes!==descriptor.bytes||saved?.sha256!==descriptor.sha256)
    throw Object.assign(new Error('RESEARCH_QUOTE_DOWNLOADED_FILE_CHANGED'),{
     code:'RESEARCH_QUOTE_DOWNLOADED_FILE_CHANGED',destinationPublished:true,file:saved});
   return {...saved,metadata};
  }catch(error){
   if(error?.destinationPublished&&error.file&&typeof error.file==='object')error.file={...error.file,metadata};
   throw error;
  }
 };
 const make=run=>{
 const fileInfo=(key,name,callOptions,jobFile)=>{
  id(key);researchQuoteHandoverPath(name);const o=options(callOptions),route=PREFIX+'/'+(jobFile?'jobs':'bundles')+'/'+key+'/files';
  return run(async()=>metadata(await request(route+query({name,metadata:true}),undefined,o),key,name));
 };
 const fileDownload=(key,name,callOptions,jobFile)=>{
  id(key);researchQuoteHandoverPath(name);const o=selectedFile(callOptions),
   route=PREFIX+'/'+(jobFile?'jobs':'bundles')+'/'+key+'/files';
  return run(async()=>{
   const selected=metadata(await request(route+query({name,metadata:true}),undefined,{signal:o.signal}),key,name);
   return transfer(route+query({name}),o,selected,selected.descriptor);
  });
 };
 return Object.freeze({
  /** Trusted SDK continuation. The admitted view expires when its callback returns. */
  withWork(callback){
   need(typeof callback==='function','RESEARCH_QUOTE_PROGRAMME_WORK_REQUIRED');
   return run(async()=>{
    let accepting=true,result,failure;const pending=new Set();
    const admitted=work=>{
     need(accepting,'RESEARCH_QUOTE_PROGRAMME_WORK_CLOSED');
     const task=Promise.resolve().then(work);pending.add(task);
     task.then(()=>pending.delete(task),()=>pending.delete(task));
     return task;
    };
    try{result=await callback(make(admitted));}catch(error){failure=error;}
    accepting=false;
    while(pending.size)await Promise.allSettled([...pending]);
    if(failure)throw failure;
    // The callback owns its handled errors; every accepted inner call still drains.
    return result;
   });
  },
  info(callOptions={}){
   const o=options(callOptions);return run(async()=>desk(await request(PREFIX+'/info',undefined,o)));
  },
  jobs(value={},callOptions={}){
   const selected=paging(value,['kind']),o=options(callOptions);
   return run(async()=>page(await request(PREFIX+'/jobs'+query(selected),undefined,o),selected));
  },
  job(key,{result=false,...callOptions}={}){
   id(key);need(typeof result==='boolean','RESEARCH_QUOTE_PROGRAMME_QUERY_INVALID');const o=options(callOptions);
   return run(async()=>job(await request(PREFIX+'/jobs/'+key+query(result?{result:true}:{}),undefined,o),key));
  },
  submit(value,callOptions={}){
   const maximum=value?.kind==='SUBMIT'&&value.command==='prepare-case-transfer'?QUOTE_CASE_TRANSFER_LIMIT+65536:QUOTE_REQUEST_LIMIT+65536,
    selected=researchQuoteProgrammeJobInput(captureResearchQuoteInput(value,{maximum})),o=options(callOptions);
   id(selected.id);need(KINDS.includes(selected.kind),'RESEARCH_QUOTE_PROGRAMME_JOB_KIND_REQUIRED');
   const requestSha256=fingerprint(selected),route=PREFIX+'/jobs'+
    (selected.kind==='SUBMIT'&&selected.command==='prepare-case-transfer'?'/case-transfer':'');
   return run(async()=>job(await request(route,selected,o),selected.id,requestSha256));
  },
  resume(key,callOptions={}){
   id(key);const o=options(callOptions);return run(async()=>job(await request(PREFIX+'/jobs/'+key+'/resume',{},o),key));
  },
  programme(key,callOptions={}){
   id(key);const o=options(callOptions);
   return run(async()=>programme(await request(PREFIX+'/programmes/'+key,undefined,o),key));
  },
  step(key,stepId,callOptions={}){
   id(key);researchQuoteProgrammeStepId(stepId);const o=options(callOptions);
   return run(async()=>{
    const value=await request(PREFIX+'/programmes/'+key+'/steps/'+stepId,undefined,o);
    need(value?.schema==='sf88-research-quotation-programme-step/v1'&&value.record?.programmeId===key&&
     value.record.stepId===stepId&&value.summary?.stepId===stepId,'RESEARCH_QUOTE_PROGRAMME_STEP_CHANGED');
    bound({workspaceId:value.record.workspaceId});hash(value.record.selectionSha256);return value;
   });
  },
  receiving(key,callOptions={}){
   id(key);const o=options(callOptions);return run(async()=>{
    const value=await request(PREFIX+'/receiving/'+key,undefined,o);
    need(value?.schema==='sf88-research-quotation-programme-receiving/v1'&&value.request?.input?.requestId===key&&
     ['PREPARING','REVIEWED','COMPLETE'].includes(value.status),'RESEARCH_QUOTE_PROGRAMME_RECEIVING_CHANGED');
    bound({workspaceId:value.request.input.expectedWorkspaceId});return value;
   });
  },
  bundle(key,{manifestSha256,...callOptions}={}){
   id(key);if(manifestSha256!==undefined)hash(manifestSha256);const o=options(callOptions);
   return run(async()=>{
    const value=await request(PREFIX+'/bundles/'+key+query({manifestSha256}),undefined,o);
    need(value?.schema==='sf88-research-quotation-handover-inspected/v1'&&value.selection&&
     Array.isArray(value.files)&&value.files.length<=40000&&
     (manifestSha256===undefined||manifestSha256===value.manifestSha256),'RESEARCH_QUOTE_HANDOVER_CHANGED');
    hash(value.manifestSha256);return value;
   });
  },
  files(key,value={},callOptions={}){
   id(key);const selected=paging(value),o=options(callOptions);
   return run(async()=>{
    const value=page(await request(PREFIX+'/bundles/'+key+'/files'+query(selected),undefined,o),selected);
    need(value.id===key,'RESEARCH_QUOTE_HANDOVER_CHANGED');hash(value.manifestSha256);
    value.items.forEach(file=>fileDescriptor(file));return value;
   });
  },
  fileInfo:(key,name,o)=>fileInfo(key,name,o,false),
  jobFileInfo:(key,name,o)=>fileInfo(key,name,o,true),
  download:(key,name,o)=>fileDownload(key,name,o,false),
  downloadJobFile:(key,name,o)=>fileDownload(key,name,o,true),
  archive(key,callOptions={}){
   id(key);const o=options(callOptions);return run(async()=>archive(
    await request(PREFIX+'/archives/'+key+'?metadata=true',undefined,o),key));
  },
  readArchiveRange(key,value={}){
   need(typeof range==='function','RESEARCH_QUOTE_PROGRAMME_RANGE_TRANSPORT_REQUIRED');
   id(key);
   const selected={offset:value.offset,limit:value.limit,bytes:value.bytes,sha256:value.sha256,signal:value.signal};
   hash(selected.sha256);
   need(Number.isSafeInteger(selected.bytes)&&selected.bytes>0&&selected.bytes<=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT&&
    Number.isSafeInteger(selected.offset)&&selected.offset>=0&&Number.isSafeInteger(selected.limit)&&
    selected.limit>0&&selected.limit<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK&&
    selected.offset+selected.limit<=selected.bytes,'RESEARCH_QUOTE_PROGRAMME_RANGE_INVALID');
   return run(async()=>{
    const body=await range(PREFIX+'/archives/'+key,selected);
    need(body instanceof Uint8Array&&body.length===selected.limit,'RESEARCH_QUOTE_PROGRAMME_ARCHIVE_CHANGED');
    return Buffer.from(body);
   });
  },
  downloadArchive(key,callOptions={}){
   id(key);const o=selectedFile(callOptions),route=PREFIX+'/archives/'+key;
   return run(async()=>{
    const selected=archive(await request(route+'?metadata=true',undefined,{signal:o.signal}),key);
    return transfer(route,o,selected,selected);
   });
  },
  startUpload(value,callOptions={}){
   const selected=captureResearchQuoteInput(value,{maximum:65536}),o=options(callOptions);
   id(selected.id);hash(selected.sha256);return run(async()=>uploaded(await request(PREFIX+'/uploads',selected,o),selected.id,selected));
  },
  upload(key,callOptions={}){
   id(key);const o=options(callOptions);return run(async()=>uploaded(await request(PREFIX+'/uploads/'+key,undefined,o),key));
  },
  appendUpload(key,{offset,data,sha256,...callOptions}={}){
   id(key);hash(sha256);need(Number.isSafeInteger(offset)&&offset>=0&&data instanceof Uint8Array&&data.length>0&&data.length<=RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK,
    'RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK_REQUIRED');
   const body=Buffer.from(data),o=options(callOptions);
   return run(async()=>uploaded(await upload(PREFIX+'/uploads/'+key+query({offset,sha256}),body,o),key));
  },
  finishUpload(key,callOptions={}){
   id(key);const o=options(callOptions);return run(async()=>uploaded(await request(PREFIX+'/uploads/'+key+'/finish',{},o),key));
  },
 });
 };
 return make(originalRun);
}
