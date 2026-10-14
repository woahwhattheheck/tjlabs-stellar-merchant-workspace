// MIT. A companion workspace owned by the existing CRM lease and serial operation queue.
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {privateDirectory,readJSON,readBytes,writeJSON,need,json,sha,decode} from './io.mjs';
import runtime from '../cutover/runtime.cjs';
const {workspace:model,comparison,core}=runtime;
export function attachCutover({directory,crmWorkspaceId,guard,currentCrm}){
 const path=join(directory,'cutover.workspace.json'),editions=join(directory,'cutover-editions'),requests=join(directory,'cutover-requests'),checks=join(directory,'cutover-reversals'),rejections=join(directory,'cutover-rejections');
 let originalId=null;
 async function folders(){await guard();for(const d of [editions,requests,checks,rejections])await privateDirectory(d,{create:true});}
 async function existing(){await guard();let r;try{r=(await readJSON(path)).value;}catch(e){if(e.code==='ENOENT')return null;throw e;}
 need(r.schema==='crm-migration.attached-cutover.v1'&&r.crmWorkspaceId===crmWorkspaceId,'CUTOVER_OWNER','This cutover belongs to another original CRM workspace.',409);const ws=model.restore(r.archive);need(originalId===null||ws.id===originalId,'CUTOVER_WORKSPACE_CHANGED','Original cutover identity changed.',409);originalId=ws.id;return ws;}
 async function save(ws){await folders();model.validate(ws);need(originalId===null||originalId===ws.id,'CUTOVER_WORKSPACE_CHANGED','Keep the original cutover identity.',409);
 const archive=model.archive(ws);await guard();await writeJSON(join(editions,archive.sha256+'.json'),archive);await guard();await writeJSON(path,{schema:'crm-migration.attached-cutover.v1',crmWorkspaceId,archive},{replace:true});originalId=ws.id;return archive;}
 async function read(){let ws=await existing();if(!ws){ws=model.create('cutover-'+comparison.digest(crmWorkspaceId).slice(0,24),(await currentCrm()).title+' — cutover');await save(ws);}return ws;}
 function rejectionError(message){return Object.assign(new Error(message+' The original rejected request is retained. Refresh the workspace and select the current source edition before trying again.'),{code:'CRM_OPERATION_REJECTED',status:409});}
 async function rejectBridge(op,baseSha256,ws,error){
 // A rejection can release the browser's pending request only after proving that
 // none of this original bridge's operations is in the current workspace.
 need(!ws.operations.some(e=>e.id===op.id||e.id.startsWith(op.id+':')),'CUTOVER_REQUEST_UNRESOLVED','An original intake operation exists; retain this request for reconciliation.',409);
 const record={schema:'crm-migration.rejected-cutover-request.v1',crmWorkspaceId,workspaceId:ws.id,baseSha256,currentWorkspaceSha256:comparison.digest(ws),operation:op,reasonCode:error.code||'CUTOVER_VALIDATION',reason:error.message,committed:false};
 await folders();await guard();await writeJSON(join(rejections,op.id+'.json'),record);
 throw rejectionError(error.message);
 }
 async function bridgeRequest(op,baseSha256,ws){
 need(typeof op.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(op.id),'CUTOVER_OPERATION_ID','Use an original operation ID, at most 100 characters.');
 let rejected;try{rejected=(await readJSON(join(rejections,op.id+'.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(rejected){need(rejected.workspaceId===ws.id&&rejected.baseSha256===baseSha256&&comparison.digest(rejected.operation)===comparison.digest(op),'CUTOVER_REQUEST_CHANGED','The original rejected intake request differs.',409);need(!ws.operations.some(e=>e.id===op.id||e.id.startsWith(op.id+':')),'CUTOVER_REQUEST_UNRESOLVED','Rejected intake has conflicting operations; preserve its request for reconciliation.',409);throw rejectionError(rejected.reason);}
 const file=join(requests,op.id+'.json');let saved;try{saved=(await readJSON(file)).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(saved){need(saved.workspaceId===ws.id&&saved.baseSha256===baseSha256&&comparison.digest(saved.operation)===comparison.digest(op),'CUTOVER_REQUEST_CHANGED','The original source intake request differs.',409);return saved;}
 need(!ws.operations.some(e=>e.id===op.id||e.id.startsWith(op.id+':')),'CUTOVER_REQUEST_UNRESOLVED','Original intake operations exist without their retained request; preserve the request for reconciliation.',409);
 if(baseSha256!==comparison.digest(ws)||op.expected_revision!==ws.revision)return rejectBridge(op,baseSha256,ws,Object.assign(Error('Source intake belongs to another cutover edition.'),{code:'CRM_BASE_CHANGED'}));
 const crm=await currentCrm(),p=op.payload;let operations;
 try{
 need(p?.crmSha256===comparison.digest(crm)&&Array.isArray(p.sources)&&p.sources.length>0&&p.sources.length<=100,'CUTOVER_CRM_SOURCE','Select the complete current CRM edition and 1–100 original sources.',409);
 need(new Set(p.sources.map(x=>x.sourceId)).size===p.sources.length,'CUTOVER_SOURCE_IDS','Use distinct receiving source IDs.');
 operations=p.sources.map((selection,i)=>{const s=crm.sourceWorkspace.sources[selection.crmSourceId];need(s,'CUTOVER_CRM_SOURCE','Selected CRM source is absent.',404);return {id:op.id+':'+i,actor:op.actor,at:op.at,expected_revision:ws.revision+i,kind:'ingest',payload:{id:selection.sourceId,filename:s.filename,content:s.content}};});
 let trial=ws;for(const operation of operations)trial=model.apply(trial,operation);
 }catch(e){return rejectBridge(op,baseSha256,ws,e);}
 saved={schema:'crm-migration.cutover-source-request.v1',crmWorkspaceId,crmSha256:p.crmSha256,workspaceId:ws.id,baseSha256,operation:op,operations};
 await folders();await guard();await writeJSON(file,saved);return saved;
 }
 async function action({operation:op,baseSha256}){
 let ws=await read();need(/^[a-f0-9]{64}$/.test(baseSha256||''),'CRM_BASE_HASH','Retain the complete original cutover base SHA.');
 if(op?.kind==='bridge_crm_sources'){
 const saved=await bridgeRequest(op,baseSha256,ws),earlier=saved.operations.map(o=>ws.operations.find(e=>e.id===o.id));
 if(earlier.every(Boolean)){for(let i=0;i<earlier.length;i++)need(comparison.digest(earlier[i].request)===comparison.digest(saved.operations[i]),'CUTOVER_REQUEST_CHANGED','Committed source intake differs.',409);return {archive:model.archive(ws),receipt:{id:op.id,operationIds:earlier.map(x=>x.id)},reused:true};}
 need(earlier.every(x=>!x),'CUTOVER_REQUEST_UNRESOLVED','Only part of the original source intake is present; preserve its request for reconciliation.',409);
 if(comparison.digest(ws)!==saved.baseSha256)return rejectBridge(op,baseSha256,ws,Object.assign(Error('The original source intake belongs to a different cutover edition.'),{code:'CRM_BASE_CHANGED'}));
 for(const operation of saved.operations)ws=model.apply(ws,operation);
 return {archive:await save(ws),receipt:{id:op.id,operationIds:saved.operations.map(x=>x.id)},reused:false};
 }
 const earlier=ws.operations.find(x=>x.id===op?.id);let next;
 try{if(!earlier)need(baseSha256===comparison.digest(ws),'CRM_BASE_CHANGED','This request belongs to a different cutover edition or branch.',409);next=model.apply(ws,op);}
 catch(e){throw Object.assign(e,{code:'CRM_OPERATION_REJECTED',status:409});}
 return {archive:earlier?model.archive(ws):await save(next),receipt:next.operations.find(x=>x.id===op.id),reused:!!earlier};
 }
 async function requestStatus({operation:op,baseSha256}){
 const ws=await read();need(typeof op?.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(op.id),'CUTOVER_OPERATION_ID','Use the retained original operation ID.');need(/^[a-f0-9]{64}$/.test(baseSha256||''),'CRM_BASE_HASH','Retain the original base SHA.');
 if(op?.kind==='bridge_crm_sources'){
 let rejected;try{rejected=(await readJSON(join(rejections,op.id+'.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(rejected){need(rejected.workspaceId===ws.id&&rejected.baseSha256===baseSha256&&comparison.digest(rejected.operation)===comparison.digest(op),'CUTOVER_REQUEST_CHANGED','Original rejected intake request differs.',409);need(!ws.operations.some(e=>e.id===op.id||e.id.startsWith(op.id+':')),'CUTOVER_REQUEST_UNRESOLVED','Rejected intake has conflicting operations.',409);return {recoverable:true,committed:false,rejected:true,reason:rejected.reason};}
 let saved;try{saved=(await readJSON(join(requests,op.id+'.json'))).value;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(saved){need(saved.workspaceId===ws.id&&saved.baseSha256===baseSha256&&comparison.digest(saved.operation)===comparison.digest(op),'CUTOVER_REQUEST_CHANGED','Saved intake request differs.',409);const earlier=saved.operations.map(o=>ws.operations.find(e=>e.id===o.id));need(earlier.every((e,i)=>e&&comparison.digest(e.request)===comparison.digest(saved.operations[i]))||earlier.every(e=>!e)&&comparison.digest(ws)===baseSha256,'CRM_BASE_CHANGED','Saved intake belongs to another original branch.',409);return {recoverable:true,committed:earlier.every(Boolean)};}
 }else{const earlier=ws.operations.find(x=>x.id===op?.id);if(earlier){need(comparison.digest(earlier.request)===comparison.digest(op),'CUTOVER_REQUEST_CHANGED','Original committed operation differs.',409);return {recoverable:true,committed:true};}}
 need(comparison.digest(ws)===baseSha256,'CRM_BASE_CHANGED','Uncommitted request belongs to another original branch.',409);return {recoverable:true,committed:false};
 }
 async function reversal({expectedSha256,packetId,observed,actor,at}){
 const ws=await read();need(expectedSha256===comparison.digest(ws),'CRM_REVISION_CHANGED','Select the exact current cutover edition.',409);
 need(typeof actor==='string'&&actor.trim()&&typeof at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(at)&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString().replace('.000Z','Z')===at.replace('.000Z','Z'),'CUTOVER_OPERATOR','Name the recording operator and UTC timestamp.');
 const packet=ws.packets[packetId];need(packet,'CUTOVER_PACKET','Select an issued packet.',404);const values={};
 for(const [entity,roles]of Object.entries(observed||{})){values[entity]={};for(const [role,id]of Object.entries(roles)){need(ws.originals[id],'CUTOVER_SOURCE','Select a retained observed source.',404);values[entity][role]=ws.originals[id].content;}}
 const output=core.reversalCheck(packet.output,values),record={schema:'crm-migration.retained-reversal.v1',workspaceId:ws.id,workspaceSha256:expectedSha256,packetId,packetSha256:packet.output.sha256,observed,actor,at,output},id=comparison.digest(record);
 await folders();await guard();await writeJSON(join(checks,id+'.json'),record);return {...record,sha256:id};
 }
 async function files(){
 const ws=await existing();if(!ws)return {};await folders();const out=runtime.exportFiles(ws);
 for(const [dir,label]of [[requests,'source-intake-requests'],[checks,'reversal-checks'],[rejections,'rejected-source-intake-requests']])for(const name of await readdir(dir)){need(/^[A-Za-z0-9][A-Za-z0-9_.:-]*\.json$/.test(name),'CUTOVER_MEMBER','Unexpected retained cutover member.');out[label+'/'+name]=decode((await readBytes(join(dir,name))).bytes);}
 return out;
 }
 return {state:async()=>model.archive(await read()),action,requestStatus,reversal,files,
 async reversalState(id){need(/^[a-f0-9]{64}$/.test(id||''),'CUTOVER_REVERSAL_ID','Select a retained reversal check by SHA.');await guard();const value=(await readJSON(join(checks,id+'.json'))).value;need(comparison.digest(value)===id&&value.workspaceId===(await read()).id,'CUTOVER_REVERSAL_CHANGED','The retained reversal check differs.',409);return {...value,sha256:id};},
 async receive(archive){const ws=model.restore(archive),old=await existing();need(!old||comparison.digest(old)===archive.sha256,'CUTOVER_RECEIVE_CONFLICT','This original CRM host already contains another cutover edition.',409);return old?{archive:model.archive(old),reused:true}:{archive:await save(ws),reused:false};},
 async summary(){const ws=await read();return {id:ws.id,title:ws.title,revision:ws.revision,sha256:comparison.digest(ws),sources:Object.values(ws.originals).map(x=>({id:x.id,filename:x.filename,sha256:x.sha256,bytes:x.bytes})),configurations:Object.keys(ws.configurations),plans:Object.values(ws.plans).map(x=>({id:x.id,issues:x.output.issues.length,changes:x.output.items.length,decisions:x.decisions.length})),packets:Object.values(ws.packets).map(x=>({id:x.id,steps:x.output.steps.length,sha256:x.output.sha256})),reconciliations:Object.values(ws.reconciliations).map(x=>({id:x.id,findings:x.output.findings.length})),executions:ws.executions.length};},
 async crmSources(){const ws=await currentCrm();return {workspaceId:ws.id,sha256:comparison.digest(ws),sources:Object.values(ws.sourceWorkspace.sources).map(x=>({id:x.id,filename:x.filename,sha256:x.sha256,bytes:x.bytes,role:x.role,edition:x.edition}))};}
 };
}
