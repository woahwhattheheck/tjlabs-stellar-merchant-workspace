// MIT. Saved customer-agent work on the original Directus project and native engines.
import {join} from 'node:path';
import {open,link,unlink,copyFile,readdir,rmdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readJson,readPrivate,hashPrivate,privateDirectory,saveExact,syncDirectory,MiB} from '../dspace/merchant-files.mjs';
import {hash,canonical,fault,object,MAX_SOURCE_BYTES} from './source.mjs';
import {performDirectusOperation,DIRECTUS_NATIVE_ACTIONS} from './operations.mjs';
import {prepareDirectusMerchant,readDirectusMerchant,publishDirectusMerchant} from './merchant.mjs';
import {directusProjectLocations} from './project.mjs';
import {directusBuyerSessionLocations} from './sessions.mjs';
import {reviewDirectusBuyer,prepareDirectusBuyer,receiveDirectusBuyer,inspectDirectusDelivery} from './customer.mjs';
export const DIRECTUS_AGENT_MAX_FILE=32*1024*MiB;
export const DIRECTUS_AGENT_ACTIONS=Object.freeze(['import-source','save-edition','review-edition','select-edition','compare-editions',...DIRECTUS_NATIVE_ACTIONS,'prepare-merchant','publish','prepare-buyer','buyer-session-init','buyer-session-run','buyer-session-recover','receive-buyer']);
export const DIRECTUS_AGENT_KINDS=Object.freeze(['sources','editions','reviews','comparisons','publications','native-events','merchant-packages','buyer-configurations','customer-deliveries','buyer-sessions']);
const ID=/^[A-Za-z0-9_.:-]{8,128}$/, SHA=/^[a-f0-9]{64}$/;
export function agentId(value){if(typeof value!=='string'||!ID.test(value))throw fault('DIRECTUS_AGENT_ID','Retain the original operation ID of 8–128 safe characters.');return value;}
export const same=(a,b)=>canonical(a)===canonical(b);
const bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const identity=v=>hash(canonical(v));
const key=id=>'agent_request:'+agentId(id);
export function agentSummary(workspace){
 return {schema:workspace.meta('schema'),workspaceId:workspace.meta('workspace_id'),revision:workspace.revision(),selectedEditionId:workspace.meta('selected_edition_id'),
  selectedReviewId:workspace.meta('selected_review_id'),counts:Object.fromEntries(DIRECTUS_AGENT_KINDS.map(kind=>[kind,workspace.db.prepare('SELECT COUNT(*) AS n FROM records WHERE kind=?').get(kind).n])),
  operationCount:workspace.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n,agentRequestCount:workspace.db.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'agent_request:%'").get().n,projectRuntime:{...directusProjectLocations(workspace),sessions:directusBuyerSessionLocations(workspace)}};
}
export function agentPage(workspace,{kind,offset=0,limit=50}={}){
 if(![...DIRECTUS_AGENT_KINDS,'operations','agent-requests'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw fault('DIRECTUS_AGENT_PAGE','Choose the original collection and a page of 1–100 records.');
 let total,items;
 if(kind==='agent-requests'){
  total=workspace.db.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'agent_request:%'").get().n;
  items=workspace.db.prepare("SELECT value FROM meta WHERE key LIKE 'agent_request:%' ORDER BY rowid LIMIT ? OFFSET ?").all(limit,offset).map(row=>{const v=JSON.parse(row.value);return{operationId:v.request.input.operationId,action:v.request.action,state:v.state,requiresOperationRead:v.state==='running',workspaceId:v.workspaceId,createdAt:v.createdAt,updatedAt:v.updatedAt,error:v.error??null};});
 }else if(kind==='operations'){
  total=workspace.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n;
  items=workspace.db.prepare('SELECT id,request_sha256,input FROM operations ORDER BY rowid LIMIT ? OFFSET ?').all(limit,offset).map(row=>{const input=JSON.parse(row.input);return{id:row.id,requestSha256:row.request_sha256,action:input.action,actor:input.actor,expectedRevision:input.expectedRevision};});
 }else{
  total=workspace.db.prepare('SELECT COUNT(*) AS n FROM records WHERE kind=?').get(kind).n;
  items=workspace.db.prepare('SELECT summary FROM records WHERE kind=? ORDER BY rowid LIMIT ? OFFSET ?').all(kind,limit,offset).map(row=>JSON.parse(row.summary));
 }
 if(offset>total)throw fault('DIRECTUS_AGENT_PAGE','The offset exceeds this original collection.');
 return{...agentSummary(workspace),kind,items,range:{offset,limit,total,nextOffset:offset+items.length<total?offset+items.length:null}};
}
export function agentRequest(workspace,id){const value=workspace.meta(key(id));if(!value)throw fault('DIRECTUS_AGENT_REQUEST_MISSING','Choose an original saved customer request.',404);if(value.schema!=='stellar-forge.directus-agent-request.v1'||value.workspaceId!==workspace.meta('workspace_id')||value.request?.input?.operationId!==id||identity(value.request)!==value.requestSha256)throw fault('DIRECTUS_AGENT_REQUEST_CHANGED','The saved original request identity differs.',409);return value;}
function retainRequest(workspace,request,{connection,runtime}){
 if(!object(request)||!DIRECTUS_AGENT_ACTIONS.includes(request.action)||!object(request.input)||!Number.isSafeInteger(request.input.expectedRevision)||request.input.expectedRevision<0||
 typeof request.input.actor!=='string'||!request.input.actor.trim()||request.input.actor.length>256)throw fault('DIRECTUS_AGENT_REQUEST','Use a complete original action/input with operationId, actor and current expectedRevision.');
 const logical=structuredClone(request),id=agentId(logical.input.operationId);
 if(bytes(logical).length>2*MiB)throw fault('DIRECTUS_AGENT_REQUEST_LIMIT','The full encoded customer request exceeds 2 MiB.',413);
 const prior=workspace.meta(key(id));
 if(prior){agentRequest(workspace,id);if(prior.workspaceId!==workspace.meta('workspace_id')||!same(prior.request,logical))throw fault('DIRECTUS_AGENT_REQUEST_CHANGED','This original request ID belongs to different project input.',409);return prior;}
 if(workspace.revision()!==logical.input.expectedRevision)throw fault('DIRECTUS_REVISION_CHANGED','Review the current original project revision before new work.',409);
 const selected={schema:'stellar-forge.directus-agent-request.v1',workspaceId:workspace.meta('workspace_id'),workspaceDirectory:workspace.directory,request:logical,requestSha256:identity(logical),
  connectionBaseUrl:DIRECTUS_NATIVE_ACTIONS.includes(logical.action)?connection.baseUrl:null,runtime:runtime??null,state:'prepared',createdAt:new Date().toISOString()};
 workspace.setMeta(key(id),selected);return selected;
}
function location(workspace,kind,id){workspace.get(kind,id);const value=workspace.meta('runtime_locations')?.[kind]?.[id];if(!value)throw fault('DIRECTUS_AGENT_LOCATION','Reopen the complete original project to restore this customer artifact.',409);return value;}
export function merchantLocation(workspace,id){return location(workspace,'merchant-packages',id);}
export function buyerLocation(workspace,id){return location(workspace,'buyer-configurations',id);}
function sessionLocation(workspace,buyerId){
 const saved=directusBuyerSessionLocations(workspace).filter(v=>v.buyerId===buyerId);
 if(saved.length>1)throw fault('DIRECTUS_AGENT_SESSION','Choose the original single buyer session; this buyer has multiple saved acquisitions.',409);
 return saved[0]?.directory??join(workspace.directory,'project-runtime','agent','sessions',agentId(buyerId));
}
async function originalSession(workspace,input,signal){
 const buyer=workspace.get('buyer-configurations',input.buyerId),place=buyerLocation(workspace,buyer.id),directory=sessionLocation(workspace,buyer.id);
 const native=await import('../../sf88-operator-buyer-cli/dataset-session.mjs');
 if(input.kind==='buyer-session-init'){
  const limits={maxPages:input.maxPages,maxTotalAtomic:input.maxTotalAtomic,maxRows:input.maxRows??1000000,maxPageBytes:input.maxPageBytes??1048576};
  const config=JSON.parse((await readPrivate(place.configuration,MAX_SOURCE_BYTES)).toString('utf8'));
  const guard={schema:'stellar-forge.directus-agent-session.v1',operationId:input.operationId,buyerId:buyer.id,configurationSha256:buyer.configuration_sha256,limits,expectedSnapshot:buyer.edition.snapshot};
  const root=join(workspace.directory,'project-runtime','agent','sessions');await privateDirectory(root,true);
  let saved;try{saved=await readJson(join(directory,'session.json'),MiB);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(saved){
   if(!same(saved.config,config)||!same(saved.limits,limits)||saved.expectedSnapshot!==buyer.edition.snapshot)throw fault('DIRECTUS_AGENT_SESSION_CHANGED','The retained original session has different configuration, limits or snapshot.',409);
  }else{
   const guardFile=join(root,buyer.id+'.initialization.json');let previous;
   try{previous=await readJson(guardFile,MiB);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(previous&&!same(previous,guard))throw fault('DIRECTUS_AGENT_SESSION_CHANGED','Continue the original session initialization request.',409);
   if(!previous){try{await readdir(directory);throw fault('DIRECTUS_AGENT_SESSION_CHANGED','The existing partial session belongs to its original initializer.',409);}catch(error){if(error.code!=='ENOENT')throw error;}await saveExact(guardFile,guard);}
   else{
    let names;try{names=await readdir(directory);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(names){
     if(names.some(name=>!['pages','evidence'].includes(name)&&!/^\.session-[a-f0-9-]{36}\.json$/.test(name)))throw fault('DIRECTUS_AGENT_SESSION_CHANGED','Preserve the existing session files for their original recovery.',409);
     for(const name of ['pages','evidence'])if((await readdir(join(directory,name)).catch(error=>{if(error.code==='ENOENT')return [];throw error;})).length)throw fault('DIRECTUS_AGENT_SESSION_CHANGED','The incomplete original session already contains acquired pages.',409);
     let candidate;
     for(const name of names.filter(name=>name.startsWith('.session-'))){
      let document;try{document=await readJson(join(directory,name),MiB);}catch(error){if(!(error instanceof SyntaxError))throw error;await saveExact(join(root,buyer.id+'-interrupted-'+name.slice(1)),await readPrivate(join(directory,name),MiB));await unlink(join(directory,name));await syncDirectory(directory);continue;}
      if(!same(document.config,config)||!same(document.limits,limits)||document.expectedSnapshot!==buyer.edition.snapshot||document.directory!==directory||candidate)throw fault('DIRECTUS_AGENT_SESSION_CHANGED','The original atomic session definition differs.',409);candidate=name;
     }
     if(candidate){await rename(join(directory,candidate),join(directory,'session.json'));saved=true;}
     else{for(const name of ['pages','evidence'])await rmdir(join(directory,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}
    }
   }
   if(!saved)await native.createDatasetSession({directory,configPath:place.configuration,...limits,expectedSnapshot:buyer.edition.snapshot});
  }
 }else if(input.kind==='buyer-session-recover')await native.recoverDatasetSession(directory);
 else await native.runDatasetSession(directory,{signal,environment:input.environment,emitPageSummaries:false,retryUnpaid:input.retryUnpaid??false,expectedAttemptSha256:input.expectedAttemptSha256});
 const result=await native.inspectDatasetSession(directory);
 if(signal?.aborted)throw fault('DIRECTUS_AGENT_INTERRUPTED','The original customer session is retained for its same continuation.',409);
 const retained=await workspace.retainBuyerSession({buyerId:buyer.id,directory,signal});
 return{buyerId:buyer.id,projectSessionId:retained.id,session:result};
}
export class DirectusAgentOperations{
 constructor({environment=process.env}={}){this.jobs=new Map();this.closed=false;this.environment=environment;}
 get active(){return [...this.jobs.values()].filter(v=>v.state==='running').length;}
 start({workspace,request,connection,merchant,upload}){
  if(this.closed)throw fault('DIRECTUS_AGENT_CLOSING','The original operator is closing.',409);
  const requestedId=agentId(request?.input?.operationId);
  if(this.active&&!workspace.meta(key(requestedId)))throw fault('DIRECTUS_AGENT_RUNNING','Continue the current saved customer operation before preparing another.',409);
  const saved=retainRequest(workspace,request,{connection}),id=saved.request.input.operationId,jobKey=workspace.directory+'\n'+workspace.meta('workspace_id')+'\n'+id,previous=this.jobs.get(jobKey);
  if(previous?.state==='running'||saved.state==='complete')return this.describe(workspace,id);
  if(saved.workspaceDirectory!==workspace.directory)throw fault('DIRECTUS_AGENT_RELOCATED','Prepare new work in this received project; an incomplete original request retains its former runtime.',409);
  if(saved.connectionBaseUrl&&saved.connectionBaseUrl!==connection.baseUrl)throw fault('DIRECTUS_AGENT_CONNECTION_CHANGED','Resume against the same original Directus service.',409);
  if(this.active)throw fault('DIRECTUS_AGENT_RUNNING','Continue the current saved customer operation before starting another.',409);
  const controller=new AbortController(),job={state:'running',controller};this.jobs.set(jobKey,job);
  const input=structuredClone(saved.request.input),action=saved.request.action;
  workspace.setMeta(key(id),{...saved,state:'running',updatedAt:new Date().toISOString()});
  job.pending=(async()=>{
   try{
    let result;
    if(DIRECTUS_NATIVE_ACTIONS.includes(action)){const{expectedRevision,...nativeInput}=input;result=await performDirectusOperation({workspace,connection:{...connection},action,input:nativeInput,signal:controller.signal});}
    else if(['import-source','save-edition','review-edition','select-edition','compare-editions'].includes(action)){
     if(action==='import-source'){const received=await upload(input.uploadId);if(received.sha256!==input.sha256||received.bytes>MAX_SOURCE_BYTES)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','Use the complete original captured source up to 256 MiB.',409);const raw=await readPrivate(received.file,MAX_SOURCE_BYTES);if(hash(raw)!==received.sha256)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The retained capture changed.',409);delete input.uploadId;delete input.sha256;input.sourceBase64=raw.toString('base64');}
     controller.signal.throwIfAborted();result=await workspace.dispatch(action,input);
    }else if(action==='prepare-merchant'){
     const {operationId,expectedRevision,actor,versionMerchantId,...selection}=input,root=join(workspace.directory,'project-runtime','agent','merchants',id);
     const versionDirectory=versionMerchantId?merchantLocation(workspace,versionMerchantId).versionDirectory:join(workspace.directory,'project-runtime','agent','versions',id);
     await prepareDirectusMerchant({...selection,workspace,directory:root,versionDirectory});
     const record=await workspace.retainMerchant({directory:root});result={merchant:record.id,edition:record.edition,directory:root};
    }else if(action==='publish'){
     const selected=merchantLocation(workspace,input.merchantId);result=await publishDirectusMerchant({directory:selected.directory,expectedSnapshot:input.expectedSnapshot,expectedRevision:input.publisherRevision});
     const recordId='agent-publication-'+hash(id).slice(0,48);let prior;try{prior=workspace.operation(recordId);}catch(error){if(error.code!=='DIRECTUS_OPERATION_MISSING')throw error;}
     const edition=workspace.get('merchant-packages',input.merchantId).edition;
     if(prior){if(prior.input.editionId!==edition.id||prior.input.publication?.snapshot!==result.snapshot)throw fault('DIRECTUS_AGENT_PUBLICATION_CHANGED','The retained native publication belongs to another edition.',409);result=prior.input.publication;}
     else await workspace.dispatch('record-publication',{operationId:recordId,actor:input.actor,expectedRevision:workspace.revision(),editionId:edition.id,publication:result});
    }else if(action==='prepare-buyer'){
     const selected=merchantLocation(workspace,input.merchantId),service=await merchant('inspect-running',input.merchantId),destination=join(workspace.directory,'project-runtime','agent','buyers',id+'.json');
     result=await prepareDirectusBuyer({directory:selected.directory,seller:service.url,query:input.query??{},intentId:input.intentId,acceptIndex:input.acceptIndex,offerSha256:input.offerSha256,destination,workspace});
    }else if(action.startsWith('buyer-session-'))result=await originalSession(workspace,{...input,kind:action,environment:this.environment},controller.signal);
    else if(action==='receive-buyer'){
     const selected=merchantLocation(workspace,input.merchantId),sessionDirectory=sessionLocation(workspace,input.buyerId);
     result=await receiveDirectusBuyer({directory:selected.directory,sessionDirectory,destination:join(workspace.directory,'project-runtime','agent','deliveries',id),includeSourceCaptures:input.includeSourceCaptures??false,workspace});
    }else throw fault('DIRECTUS_AGENT_ACTION','Choose an original customer operation.');
    const record={...saved,state:'complete',result,updatedAt:new Date().toISOString()};workspace.setMeta(key(id),record);job.state='complete';
   }catch(error){job.state='failed';workspace.setMeta(key(id),{...saved,state:'resumable',error:{code:error.code??'DIRECTUS_AGENT_FAILURE',message:error.message},updatedAt:new Date().toISOString()});}
  })();
  return this.describe(workspace,id);
 }
 describe(workspace,id){const saved=agentRequest(workspace,id),job=this.jobs.get(workspace.directory+'\n'+workspace.meta('workspace_id')+'\n'+id);return{...saved,state:job?.state==='running'?'running':saved.state==='running'?'resumable':saved.state};}
 cancel(workspace,id){const saved=agentRequest(workspace,id),job=this.jobs.get(workspace.directory+'\n'+workspace.meta('workspace_id')+'\n'+id);job?.controller.abort();return{operationId:id,state:job?.state??saved.state,cancelRequested:Boolean(job&&job.state==='running')};}
 requestClose(){this.closed=true;for(const job of this.jobs.values())job.controller.abort();}
 async close(){this.requestClose();await Promise.allSettled([...this.jobs.values()].map(job=>job.pending));}
}
export async function agentView(workspace,view,input,{merchant}){
 if(view==='state')return agentSummary(workspace);
 if(view==='page')return agentPage(workspace,input);
 if(view==='record')return workspace.read(input.kind,input.id,{offset:input.offset??0,limit:input.limit??50});
 if(view==='query'){const result=await workspace.query(input.editionId,input.query??{});return result;}
 if(view==='native-history')return workspace.nativeHistory(agentId(input.id));
 if(view==='buyer-offer'){const selected=merchantLocation(workspace,input.merchantId),running=await merchant('inspect-running',input.merchantId);return reviewDirectusBuyer({directory:selected.directory,seller:running.url,query:input.query??{}});}
 if(view==='buyer-status'){const {inspectDatasetSession}=await import('../../sf88-operator-buyer-cli/dataset-session.mjs');return inspectDatasetSession(sessionLocation(workspace,input.buyerId));}
 if(view==='delivery')return inspectDirectusDelivery(location(workspace,'customer-deliveries',input.id).directory);
 throw fault('DIRECTUS_AGENT_VIEW','Choose an original customer view.');
}
function exportKey(id){return 'agent_export:'+agentId(id);}
export async function readDirectusAgentExport(workspace,id){
 const saved=workspace.meta(exportKey(id));
 if(!saved?.file||saved.workspaceId!==workspace.meta('workspace_id'))throw fault('DIRECTUS_AGENT_EXPORT_MISSING','Select the original completed export.',404);
 const file=join(workspace.directory,'downloads','agent-'+agentId(id)+'.bin'),pin=await hashPrivate(file,DIRECTUS_AGENT_MAX_FILE);
 if(pin.hash!==saved.file.sha256||pin.bytes!==saved.file.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The retained complete export differs from its original receipt.',409);
 return {...saved,file:{...saved.file,path:file}};
}
export async function prepareDirectusAgentExport(workspace,id,selection){
 agentId(id);
 if(!selection||typeof selection!=='object'||Array.isArray(selection))throw fault('DIRECTUS_AGENT_EXPORT','Choose the complete original file.');
 const kinds=['project','source','dataset','config','comparison','buyer-config','record','native-response','delivery'];
 if(!kinds.includes(selection.kind))throw fault('DIRECTUS_AGENT_EXPORT','Choose an original project, source, record or customer file.');
 if(selection.kind==='project'&&(!Number.isSafeInteger(selection.expectedRevision)||selection.expectedRevision<0))
  throw fault('DIRECTUS_AGENT_EXPORT_REVISION','Select the current original project revision.');
 const request={schema:'stellar-forge.directus-agent-export.v1',id,workspaceId:workspace.meta('workspace_id'),selection:JSON.parse(JSON.stringify(selection))};
 const old=workspace.meta(exportKey(id));
 if(old){if(!same(old.request,request))throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','This export ID belongs to another original selection.',409);return readDirectusAgentExport(workspace,id);}
 const intentKey=exportKey(id)+':intent',intent=workspace.meta(intentKey);
 if(intent&&!same(intent,request))throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','This export ID belongs to another saved selection.',409);
 if(!intent)workspace.setMeta(intentKey,request);
 const root=join(workspace.directory,'downloads');await privateDirectory(root,true);
 const file=join(root,'agent-'+id+'.bin'),descriptorFile=join(root,'agent-'+id+'.json');
 let retained;
 try{retained=await readJson(descriptorFile,16384);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(retained){
  if(!same(retained.request,request))throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The retained export request differs.',409);
  const pin=await hashPrivate(file,DIRECTUS_AGENT_MAX_FILE);
  if(pin.hash!==retained.file.sha256||pin.bytes!==retained.file.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The complete retained export changed.',409);
 }else{
  let item,candidate;
  const candidateFile=join(root,'agent-'+id+'.candidate.json');
  try{candidate=await readJson(candidateFile,32768);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(candidate){if(!same(candidate.request,request))throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The retained original export candidate differs.',409);item=candidate.item;}
  else if(['project','source','dataset','config','comparison','buyer-config'].includes(selection.kind))
   item=await workspace.exportFile(selection.kind,selection.id,{expectedRevision:selection.expectedRevision});
  else item=await workspace.run(async()=>{
   let raw,name,type='application/json; charset=utf-8';
   if(selection.kind==='record'){
    if(!DIRECTUS_AGENT_KINDS.includes(selection.recordKind))throw fault('DIRECTUS_AGENT_RECORD','Choose an original record collection.');
    raw=bytes(workspace.get(selection.recordKind,selection.id));name=selection.recordKind+'-'+agentId(selection.id)+'.json';
   }else if(selection.kind==='native-response'){
    const event=workspace.get('native-events',selection.id),response=event.event.response;
    if(!response||!SHA.test(selection.sha256??'')||response.body_sha256!==selection.sha256)throw fault('DIRECTUS_AGENT_RESPONSE','Choose the complete original response from this native event.');
    raw=Buffer.from(response.body_text,'utf8');if(hash(raw)!==response.body_sha256||raw.length!==response.body_bytes)throw fault('DIRECTUS_AGENT_RESPONSE','The original native body differs.',409);
    name='response-'+selection.sha256+'.json';
   }else{
    const delivery=workspace.get('customer-deliveries',selection.id),member=delivery.files.find(row=>row.path===selection.name);
    if(!member)throw fault('DIRECTUS_AGENT_DELIVERY','Choose an exact member from this complete customer delivery.');
    raw=workspace.bytes(member.sha256);
    if(raw.length!==member.bytes)throw fault('DIRECTUS_AGENT_DELIVERY_CHANGED','The original customer file changed.',409);
    name=selection.name.split('/').at(-1);type='application/octet-stream';
   }
   const staged=join(root,'agent-source-'+hash(raw)+'.bin');await saveExact(staged,raw);
   return{path:staged,filename:name,bytes:raw.length,sha256:hash(raw),contentType:type};
  });
  if(!candidate)await saveExact(candidateFile,{request,item});
  // A lost response after the stable link reuses those exact bytes. Never select
  // another workspace generation under an already-written original export ID.
  const temporary=file+'.partial-'+randomUUID();
  try{
   await copyFile(item.path,temporary);const handle=await open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
   const copied=await hashPrivate(temporary,DIRECTUS_AGENT_MAX_FILE);
   if(copied.hash!==item.sha256||copied.bytes!==item.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The original export changed during complete receiving.',409);
   try{await link(temporary,file);}catch(error){
    if(error.code!=='EEXIST')throw error;
    const pin=await hashPrivate(file,DIRECTUS_AGENT_MAX_FILE);
    if(pin.hash!==item.sha256||pin.bytes!==item.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The original export ID already retains another complete file.',409);
   }
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  retained={request,workspaceId:request.workspaceId,file:{name:item.filename,bytes:item.bytes,sha256:item.sha256,contentType:item.contentType}};
  await saveExact(descriptorFile,retained);
 }
 workspace.setMeta(exportKey(id),retained);
 return readDirectusAgentExport(workspace,id);
}
