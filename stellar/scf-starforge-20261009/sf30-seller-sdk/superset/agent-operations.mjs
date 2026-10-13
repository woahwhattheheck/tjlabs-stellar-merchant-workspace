// MIT. Saved customer-agent requests and original Superset operation continuation.
import {open,link,unlink,copyFile,readdir,rmdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {bytes,digest,identity,readJson,readPrivate,hashPrivate,privateDirectory,saveExact,separated,syncDirectory,fault,MiB} from './files.mjs';
export const SUPERSET_AGENT_ACTIONS=Object.freeze(['source','capture','edition','review','compare','select','replay','prepare-merchant','publish','prepare-buyer','receive-buyer','buyer-session-init','buyer-session-run','buyer-session-recover','receive-workspace']);
export const SUPERSET_RECORD_KINDS=Object.freeze(['sources','captures','editions','reviews','comparisons','merchants','publications','buyers','deliveries']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/,SHA=/^[a-f0-9]{64}$/;
export const SUPERSET_MAX_FILE=2*1024*MiB;
export function agentId(value){if(typeof value!=='string'||!ID.test(value))throw fault('SUPERSET_AGENT_ID','Use the original stable operation or export ID.');return value;}
const same=(a,b)=>identity(a)===identity(b);
const key=id=>'agent_request:'+agentId(id);
export function readSupersetAgentRequest(workspace,id){return workspace.meta(key(id));}
export function retainSupersetAgentRequest(workspace,document,{actual=document}={}){
 if(!document||typeof document!=='object'||Array.isArray(document)||!SUPERSET_AGENT_ACTIONS.includes(document.action)||
   !document.input||typeof document.input!=='object'||Array.isArray(document.input)||
   !Number.isSafeInteger(document.input.expectedRevision)||document.input.expectedRevision<0||document.input.retry!==undefined)
  throw fault('SUPERSET_AGENT_REQUEST','Use one complete original action/input with operationId and expectedRevision; resume supplies retry.');
 const value=JSON.parse(JSON.stringify(document));agentId(value.input.operationId);
 if(bytes(value).length>MiB)throw fault('SUPERSET_AGENT_REQUEST_LIMIT','The complete original request exceeds 1 MiB.',413);
 const saved={schema:'stellar-forge.superset-agent-request.v1',workspaceId:workspace.meta('workspace_id'),workspaceDirectory:workspace.directory,logical:value,request:JSON.parse(JSON.stringify(actual)),sha256:identity(actual),logicalSha256:identity(value)};
 const prior=readSupersetAgentRequest(workspace,value.input.operationId);
 if(prior){if(prior.workspaceId!==saved.workspaceId||!same(prior.logical,value))throw fault('SUPERSET_AGENT_REQUEST_CHANGED','This original request ID belongs to different customer input.',409);return prior;}
 if(workspace.closing||workspace.closed)throw fault('SUPERSET_WORKSPACE_CLOSED','The original workspace is closing.',409);
 workspace.setMeta(key(value.input.operationId),saved);return saved;
}
export function supersetAgentSummary(workspace){
 return {schema:workspace.meta('schema'),workspaceId:workspace.meta('workspace_id'),revision:workspace.revision(),
  selectedEditionId:workspace.meta('selected_edition_id'),createdAt:workspace.meta('created_at'),
  counts:Object.fromEntries(SUPERSET_RECORD_KINDS.map(kind=>[kind,workspace.db.prepare('SELECT COUNT(*) AS n FROM records WHERE kind=?').get(kind).n])),
  operationCount:workspace.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n};
}
export function supersetAgentPage(workspace,{kind,offset=0,limit=50}={}){
 if(![...SUPERSET_RECORD_KINDS,'operations'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||
   !Number.isSafeInteger(limit)||limit<1||limit>250)throw fault('SUPERSET_AGENT_PAGE','Choose the original collection, offset and a limit of 1–250.');
 let total,items;
 if(kind==='operations'){
  total=workspace.db.prepare('SELECT COUNT(*) AS n FROM operations').get().n;
  items=workspace.db.prepare('SELECT id,status,started_at,updated_at,error FROM operations ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limit,offset)
   .map(row=>({id:row.id,status:row.status,startedAt:row.started_at,updatedAt:row.updated_at,error:row.error?JSON.parse(row.error):null}));
 }else{
  total=workspace.db.prepare('SELECT COUNT(*) AS n FROM records WHERE kind=?').get(kind).n;
  items=workspace.db.prepare('SELECT summary FROM records WHERE kind=? ORDER BY rowid LIMIT ? OFFSET ?').all(kind,limit,offset).map(row=>JSON.parse(row.summary));
 }
 if(offset>total)throw fault('SUPERSET_AGENT_PAGE','The offset exceeds this original collection.');
 return {...supersetAgentSummary(workspace),kind,items,range:{offset,limit,total,nextOffset:offset+items.length<total?offset+items.length:null}};
}
export async function executeSupersetAgentOperation(workspace,action,input,{signal,update}){
 if(action==='receive-workspace'){
  const pin=await hashPrivate(input.file,SUPERSET_MAX_FILE);
  if(!SHA.test(input.sha256??'')||pin.hash!==input.sha256)throw fault('SUPERSET_AGENT_SOURCE_CHANGED','Receive the exact complete original project bytes.',409);
  separated(workspace.directory,input.destination);separated(input.file,input.destination);
  const {receiveSupersetWorkspace}=await import('./workspace.mjs');
  const result=await receiveSupersetWorkspace({file:input.file,directory:input.destination});
  return{extra:{received:{workspaceId:result.workspaceId,revision:result.revision,receiving:result.receiving,directory:input.destination}}};
 }
 if(!['buyer-session-init','buyer-session-run','buyer-session-recover'].includes(action))return null;
 const buyer=workspace.get('buyers',input.buyerId),root=join(workspace.directory,buyer.relative),directory=join(root,'session');
 if(buyer.relative!=='buyers/'+buyer.id)throw fault('SUPERSET_BUYER_PATH','The original customer session path changed.',409);
 const native=await import('../../sf88-operator-buyer-cli/dataset-session.mjs');
 let result;
 if(action==='buyer-session-init'){
  const limits={maxPages:input.maxPages,maxTotalAtomic:input.maxTotalAtomic,maxRows:input.maxRows??1000000,maxPageBytes:input.maxPageBytes??1048576};
  const original=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(workspace.bytes(buyer.configurationSha256)));
  await privateDirectory(root,true);await saveExact(join(root,'buyer.json'),workspace.bytes(buyer.configurationSha256));
  let saved;try{saved=await readJson(join(directory,'session.json'),262144);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(saved){
   const {canonical}=await import('../../sf88-operator-buyer-cli/dataset-page.mjs');
   if(canonical(saved.config)!==canonical(original)||canonical(saved.limits)!==canonical(limits)||saved.expectedSnapshot!==buyer.snapshot)
    throw fault('SUPERSET_BUYER_SESSION_CHANGED','The retained session belongs to different original configuration, limits or snapshot.',409);
   result=await native.inspectDatasetSession(directory);
  }else{
   const guard={schema:'stellar-forge.superset-buyer-session-initialization.v1',operationId:input.operationId,buyerId:buyer.id,configurationSha256:buyer.configurationSha256,limits,expectedSnapshot:buyer.snapshot};
   const guardFile=join(root,'agent-session-initialization.json'),previous=await readJson(guardFile,32768).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(previous&&!same(previous,guard))throw fault('SUPERSET_BUYER_SESSION_INITIALIZATION','Continue the original saved session initialization operation.',409);
   if(!previous){
    try{await readdir(directory);throw fault('SUPERSET_BUYER_SESSION_INITIALIZATION','The existing incomplete session belongs to its original initializer.',409);}catch(error){if(error.code!=='ENOENT')throw error;}
    await saveExact(guardFile,guard);
   }else{
    let names;try{names=await readdir(directory);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(names){
     if(names.some(name=>!['pages','evidence'].includes(name)&&!/^\.session-[a-f0-9-]{36}\.json$/.test(name)))throw fault('SUPERSET_BUYER_SESSION_INITIALIZATION','The original partial session contains other retained work.',409);
     for(const name of ['pages','evidence']){const entries=await readdir(join(directory,name)).catch(error=>{if(error.code==='ENOENT')return [];throw error;});if(entries.length)throw fault('SUPERSET_BUYER_SESSION_INITIALIZATION','Keep the original partial session work for its existing recovery.',409);}
     const candidates=names.filter(name=>name.startsWith('.session-'));let candidate;
     for(const name of candidates){
      let definition;
      try{definition=await readJson(join(directory,name),262144);}
      catch(error){
       if(!(error instanceof SyntaxError))throw error;
       // Preserve a torn original atomic-write candidate outside the empty
       // session before retrying its same guarded native initializer.
       const originalFile=join(directory,name),recovered=join(root,'agent-interrupted-'+name.slice(1));
       await saveExact(recovered,await readPrivate(originalFile,262144));
       await unlink(originalFile);await syncDirectory(root);await syncDirectory(directory);continue;
      }
      const {canonical}=await import('../../sf88-operator-buyer-cli/dataset-page.mjs');
      if(canonical(definition.config)!==canonical(original)||canonical(definition.limits)!==canonical(limits)||definition.expectedSnapshot!==buyer.snapshot||definition.directory!==directory)
       throw fault('SUPERSET_BUYER_SESSION_INITIALIZATION','The original saved session definition differs.',409);
      if(candidate)throw fault('SUPERSET_BUYER_SESSION_INITIALIZATION','Inspect the multiple original saved session definitions.',409);candidate=name;
     }
     if(candidate){await rename(join(directory,candidate),join(directory,'session.json'));result=await native.inspectDatasetSession(directory);}
     else{for(const name of ['pages','evidence'])await rmdir(join(directory,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}
    }
   }
   if(!result)result=await native.createDatasetSession({directory,configPath:join(root,'buyer.json'),...limits,expectedSnapshot:buyer.snapshot});
  }
 }else if(action==='buyer-session-recover')result=await native.recoverDatasetSession(directory);
 else{
  if(input.retryUnpaid!==undefined&&typeof input.retryUnpaid!=='boolean')throw fault('SUPERSET_BUYER_RETRY','Use the original explicit unpaid continuation.');
  result=await native.runDatasetSession(directory,{signal,environment:workspace.env,emitPageSummaries:false,
   retryUnpaid:input.retryUnpaid??false,expectedAttemptSha256:input.expectedAttemptSha256,
   onPage:report=>update({kind:'buyer-session',buyerId:buyer.id,status:report.status,completedPages:report.completedPages,acquiredRows:report.acquiredRows})});
 }
 if(signal?.aborted)throw fault('SUPERSET_PROCESS_INTERRUPTED','The original customer operation was interrupted; its native session and pages remain available.',409);
 return {extra:{buyerId:buyer.id,session:result}};
}
function exportKey(id){return 'agent_export:'+agentId(id);}
export async function readSupersetAgentExport(workspace,id){
 const saved=workspace.meta(exportKey(id));
 if(!saved?.file||saved.workspaceId!==workspace.meta('workspace_id'))throw fault('SUPERSET_AGENT_EXPORT_MISSING','Select the original completed export.',404);
 const file=join(workspace.directory,'downloads','agent-'+agentId(id)+'.bin'),pin=await hashPrivate(file,SUPERSET_MAX_FILE);
 if(pin.hash!==saved.file.sha256||pin.bytes!==saved.file.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The retained complete export differs from its original receipt.',409);
 return {...saved,file:{...saved.file,path:file}};
}
export async function prepareSupersetAgentExport(workspace,id,selection){
 agentId(id);
 if(!selection||typeof selection!=='object'||Array.isArray(selection))throw fault('SUPERSET_AGENT_EXPORT','Choose the complete original file.');
 const kinds=['workspace','capture','comparison','csv','lineage','record','response','delivery'];
 if(!kinds.includes(selection.kind))throw fault('SUPERSET_AGENT_EXPORT','Choose an original project, source, record or customer file.');
 if(selection.kind==='workspace'&&(!Number.isSafeInteger(selection.expectedRevision)||selection.expectedRevision<0))
  throw fault('SUPERSET_AGENT_EXPORT_REVISION','Select the current original project revision.');
 const request={schema:'stellar-forge.superset-agent-export.v1',id,workspaceId:workspace.meta('workspace_id'),selection:JSON.parse(JSON.stringify(selection))};
 const old=workspace.meta(exportKey(id));
 if(old){if(!same(old.request,request))throw fault('SUPERSET_AGENT_EXPORT_CHANGED','This export ID belongs to another original selection.',409);return readSupersetAgentExport(workspace,id);}
 const intentKey=exportKey(id)+':intent',intent=workspace.meta(intentKey);
 if(intent&&!same(intent,request))throw fault('SUPERSET_AGENT_EXPORT_CHANGED','This export ID belongs to another saved selection.',409);
 if(!intent)workspace.setMeta(intentKey,request);
 const root=join(workspace.directory,'downloads');await privateDirectory(root,true);
 const file=join(root,'agent-'+id+'.bin'),descriptorFile=join(root,'agent-'+id+'.json');
 let retained;
 try{retained=await readJson(descriptorFile,16384);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(retained){
  if(!same(retained.request,request))throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The retained export request differs.',409);
  const pin=await hashPrivate(file,SUPERSET_MAX_FILE);
  if(pin.hash!==retained.file.sha256||pin.bytes!==retained.file.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The complete retained export changed.',409);
 }else{
  let item,candidate;
  const candidateFile=join(root,'agent-'+id+'.candidate.json');
  try{candidate=await readJson(candidateFile,32768);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(candidate){if(!same(candidate.request,request))throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The retained original export candidate differs.',409);item=candidate.item;}
  else if(['workspace','capture','comparison','csv','lineage'].includes(selection.kind))
   item=await workspace.exportFile(selection.kind,selection.id,{expectedRevision:selection.expectedRevision});
  else item=await workspace.serial(async()=>{
   let raw,name,type='application/json; charset=utf-8';
   if(selection.kind==='record'){
    if(!SUPERSET_RECORD_KINDS.includes(selection.recordKind))throw fault('SUPERSET_AGENT_RECORD','Choose an original record collection.');
    raw=bytes(workspace.get(selection.recordKind,selection.id));name=selection.recordKind+'-'+agentId(selection.id)+'.json';
   }else if(selection.kind==='response'){
    const capture=workspace.get('captures',selection.id);
    if(!SHA.test(selection.sha256??'')||!capture.entries.some(entry=>entry.body.sha256===selection.sha256))
     throw fault('SUPERSET_AGENT_RESPONSE','Choose a complete original response in this capture.');
    raw=workspace.bytes(selection.sha256);name='response-'+selection.sha256+'.json';
   }else{
    const delivery=workspace.get('deliveries',selection.id),member=delivery.files.find(row=>row.path===selection.name);
    if(!member)throw fault('SUPERSET_AGENT_DELIVERY','Choose an exact member from this complete customer delivery.');
    raw=workspace.bytes(member.sha256);
    if(raw.length!==member.bytes)throw fault('SUPERSET_AGENT_DELIVERY_CHANGED','The original customer file changed.',409);
    name=selection.name.split('/').at(-1);type='application/octet-stream';
   }
   const staged=join(root,'agent-source-'+digest(raw)+'.bin');await saveExact(staged,raw);
   return{file:staged,name,bytes:raw.length,sha256:digest(raw),contentType:type};
  });
  if(!candidate)await saveExact(candidateFile,{request,item});
  // A lost response after the stable link reuses those exact bytes. Never select
  // another workspace generation under an already-written original export ID.
  const temporary=file+'.partial-'+randomUUID();
  try{
   await copyFile(item.file,temporary);const handle=await open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
   const copied=await hashPrivate(temporary,SUPERSET_MAX_FILE);
   if(copied.hash!==item.sha256||copied.bytes!==item.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The original export changed during complete receiving.',409);
   try{await link(temporary,file);}catch(error){
    if(error.code!=='EEXIST')throw error;
    const pin=await hashPrivate(file,SUPERSET_MAX_FILE);
    if(pin.hash!==item.sha256||pin.bytes!==item.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The original export ID already retains another complete file.',409);
   }
  }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  retained={request,workspaceId:request.workspaceId,file:{name:item.name,bytes:item.bytes,sha256:item.sha256,contentType:item.contentType}};
  await saveExact(descriptorFile,retained);
 }
 workspace.setMeta(exportKey(id),retained);
 return readSupersetAgentExport(workspace,id);
}
