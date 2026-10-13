// MIT. Exact customer requests retained in the original Zotero SQLite history.
import {LIMIT,need,plain,clone,json,sha256,requestId,now,safeCode} from './contracts.mjs';
export const ZOTERO_AGENT_SCHEMA='stellar-forge.zotero-agent-request.v1';
export const ZOTERO_AGENT_ACTIONS=Object.freeze(['profile.save','capture.prepare','capture.control','documents.import','project.save','project.decide','edition.compare','research.prepare','research.receive','project.return.prepare','project.return.import','project.return.review','project.return.apply']);
export const ZOTERO_AGENT_VIEWS=Object.freeze(['state','record.get','record.list','record.history','edition.get','project.get','project.page','capture.get','research.get','research.preview','project.return.preview']);
export function createZoteroAgentRequests({store,invoke,admit}){
 const active=new Map();let closing=false;
 const recordId=op=>'agent:'+requestId(op);
 const current=op=>{try{return store.get('agent-request',recordId(op));}catch(error){if(error.code==='ZOTERO_RECORD_NOT_FOUND')return null;throw error;}};
 const observed=record=>record?{...clone(record),active:active.has(record.requestId),displayStatus:record.status==='RUNNING'&&!active.has(record.requestId)?'INTERRUPTED':record.status}:null;
 function put(record,changes){return store.transaction(()=>{const latest=current(record.requestId);return store.put('agent-request',latest.id,latest.revision,{...latest,...changes});});}
 const keys={
  'profile.save':['id','expectedRevision','definition'],'capture.prepare':['profileId','profileRevision'],'capture.control':['id','operation'],
  'documents.import':['profileId','profileRevision'],'project.save':['id','expectedRevision','editionId','title','description','scope','decisions','findings'],
  'project.decide':['projectId','expectedRevision','changes'],'edition.compare':['before','after'],
  'project.return.prepare':['projectId','projectRevision'],'project.return.import':['projectId'],
  'project.return.review':['id','expectedRevision','expectedProjectRevision','previewSha256','choices','note'],
  'project.return.apply':['id','expectedRevision','expectedProjectRevision','previewSha256'],
  'research.prepare':['projectId','projectRevision','dossierId','questionId'],'research.receive':['id','expectedDossierRevision']
 };
 function checked(value){
  const request=clone(value);need(plain(request)&&Object.keys(request).every(k=>['requestId','method','input','source'].includes(k)),'ZOTERO_AGENT_REQUEST_INVALID');
  request.requestId=requestId(request.requestId);need(ZOTERO_AGENT_ACTIONS.includes(request.method)&&plain(request.input),'ZOTERO_AGENT_REQUEST_INVALID');
  need(Object.keys(request.input).every(key=>keys[request.method].includes(key)),'ZOTERO_AGENT_INPUT_FIELDS');
  if(request.method==='profile.save'){
   const definition=request.input.definition;
   need(plain(definition)&&Object.keys(definition).every(key=>['schema','title','library','apiKeyEnv','sourceTerms','scope','includeTrashed','timeoutMs','maxPageBytes','maxCaptureBytes','maxItems'].includes(key)),'ZOTERO_AGENT_PROFILE_FIELDS');
   need(plain(definition.library)&&Object.keys(definition.library).every(key=>['type','id'].includes(key)),'ZOTERO_AGENT_LIBRARY_FIELDS');
   if(definition.scope!==undefined)need(plain(definition.scope)&&Object.keys(definition.scope).every(key=>['collectionKeys','includeDescendants'].includes(key)),'ZOTERO_AGENT_SCOPE_FIELDS');
  }
  if(['documents.import','project.return.import'].includes(request.method)){need(plain(request.source)&&Object.keys(request.source).length===2&&/^[a-f0-9]{64}$/.test(request.source.sha256)&&Number.isSafeInteger(request.source.bytes)&&request.source.bytes>0&&request.source.bytes<=(request.method==='project.return.import'?LIMIT.transfer:LIMIT.capture),'ZOTERO_AGENT_FILE_REQUIRED');}
  else need(request.source===undefined,'ZOTERO_AGENT_SOURCE_UNEXPECTED');
  need(json(request).length<=LIMIT.control,'ZOTERO_HTTP_BODY_LIMIT');return request;
 }
 function get(op){return observed(current(op));}
 function start(record){
  need(!closing,'ZOTERO_WORKSPACE_CLOSING');
  if(record.status==='COMPLETE'||active.has(record.requestId))return observed(record);
  // The durable admission precedes the in-memory job. A failed write cannot create a phantom job.
  const running=put(record,{status:'RUNNING',attempt:(record.attempt??0)+1,lastError:null,startedAt:now()});
  const job={requestId:record.requestId,promise:null};active.set(record.requestId,job);
  job.promise=admit(async()=>{
   try{
    const input=clone(running.request.input);if(running.request.source)input.bytes=await store.objectBytes(running.request.source);
    const result=await invoke(running.request.method,input,running.requestId);
    return put(running,{status:'COMPLETE',completedAt:now(),result:clone(result),lastError:null});
   }catch(error){
    try{put(running,{status:'RESUME_REQUIRED',lastError:safeCode(error),stoppedAt:now()});}
    catch(persistError){job.persistenceError=persistError;}
    throw error;
   }finally{active.delete(running.requestId);}
  });
  void job.promise.catch(()=>{});return observed(running);
 }
 async function save(value,bytes=null){
  const supplied=clone(value),originalBytes=bytes===null?null:Buffer.from(bytes);need(!closing,'ZOTERO_WORKSPACE_CLOSING');
  const request=checked(supplied),digest=sha256(json(request));let record=current(request.requestId);
  if(record){need(record.requestSha256===digest,'ZOTERO_REQUEST_INPUT_CHANGED');return start(record);}
  if(request.source){
   need(originalBytes&&originalBytes.length===request.source.bytes&&sha256(originalBytes)===request.source.sha256,'ZOTERO_AGENT_SOURCE_CHANGED');
   const retained=await store.putObject(originalBytes);need(retained.sha256===request.source.sha256,'ZOTERO_AGENT_SOURCE_CHANGED');
  }
  need(!closing,'ZOTERO_WORKSPACE_CLOSING');
  // Another concurrent request can have finished the same object write.
  record=current(request.requestId);
  if(record){need(record.requestSha256===digest,'ZOTERO_REQUEST_INPUT_CHANGED');return start(record);}
  record=store.transaction(()=>store.put('agent-request',recordId(request.requestId),0,{schema:ZOTERO_AGENT_SCHEMA,requestId:request.requestId,requestSha256:digest,request,status:'PREPARED',attempt:0,result:null,lastError:null}));
  return start(record);
 }
 function resume(op){const record=current(requestId(op));need(record,'ZOTERO_AGENT_REQUEST_NOT_FOUND');return start(record);}
 return{get,save,resume,summary:()=>({active:active.size}),requestClose(){closing=true;},async drain(){await Promise.allSettled([...active.values()].map(job=>job.promise));}};
}
