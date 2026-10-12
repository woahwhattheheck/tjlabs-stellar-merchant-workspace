// MIT. A complete source/decision handover through the original two provider owners.
import {randomUUID} from 'node:crypto';
import {parseWorkspace,serializeWorkspace,workspaceDraft} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/workspace-file.mjs';
import {newCommissioning,applyCommissioningCommand} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commissioning.mjs';
import {
 SCHEMA,MAX_CAPTURE_BYTES,MAX_RETAINED_MATERIAL_BYTES,MAX_SOURCE_BYTES,MAX_FILE_RANGE,KINDS,bytesHash,valueHash,
 bridgeError,requireValue,object,text,uuid,hash,alias,revision,caseIdentity,
 normalizeCaptureRequest,normalizeReturnRequest,createContext,previewCapture,previewReturn,
 captureMaterial,returnMaterial,outcomeMaterial,readMaterials,materialSummary,originalFile,materialBytes,validateMaterial
} from './model.mjs';

const clone=value=>structuredClone(value);
const json=value=>JSON.stringify(value,null,2)+'\n';
const TOOLS=new Set(['sources','preview','save','read','return_preview','return_prepare','return_execute','file','export']);
const PREFIX='merchant_lineage_support_';
const conflict=record=>bridgeError('LINEAGE_SUPPORT_CASE_CHANGED','The original case changed. Read its current revision and review the proposed operation again.',409,
 {caseId:record?.id??null,currentRevision:record?.revision??null});
function sameWorkspace(value,expected){
 requireValue(value?.workspaceId===expected.workspaceId&&value.createdAt===expected.createdAt,'LINEAGE_SUPPORT_WORKSPACE_CHANGED',
  'This source is a different original Lineage workspace. Select the configured owner of the saved workspace.',409);
}
function selectedMaterial(materials,id,kind){
 const value=materials.find(row=>row.id===id&&(!kind||row.kind===kind));
 requireValue(value,'LINEAGE_SUPPORT_MATERIAL','Select an original retained '+(kind??'Lineage')+' material.',404);
 return value;
}
function page(value){
 const offset=value.offset??0,limit=value.limit??50;
 requireValue(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'LINEAGE_SUPPORT_INPUT','Use a nonnegative offset and a limit from 1 to 100.');
 return {offset,limit};
}
function originalRequest(materials,request,kind){
 const existing=materials.find(row=>row.kind===kind&&row.request.requestId===request.requestId);
 if(existing)requireValue(existing.requestSha256===valueHash(request),'LINEAGE_SUPPORT_REQUEST_CONFLICT',
  'This request UUID belongs to different original case/source arguments.',409);
 return existing??null;
}
async function readCase(store,id,{missing=false,at=null}={}){
 try{const record=await store.read(id,at),workspace=await parseWorkspace(record.workspaceText);return {record,workspace,materials:readMaterials(workspace,id)};}
 catch(error){if(missing&&error.code==='CASE_NOT_FOUND')return {record:null,workspace:null,materials:[]};throw error;}
}
function resultView(record,material,{replayed=false}={}){
 return {schema:SCHEMA,case:caseIdentity(record),material:materialSummary(material),replayed,
  ...(material.kind==='outcome'?{state:material.state,result:clone(material.result),rejection:clone(material.rejection)}:{})};
}
async function collectRecords(client,collection,identity,wanted){
 if(!wanted.size)return [];
 const found=[],seen=new Set();let offset=0,total=null,bytes=0;
 for(;;){
  const response=await client.action('records.read',{collection,expectedRevision:identity.revision,offset,limit:50});
  requireValue(response.workspaceId===identity.workspaceId&&response.revision===identity.revision&&response.collection===collection&&response.offset===offset&&
   Array.isArray(response.items)&&response.returned===response.items.length&&Number.isSafeInteger(response.total)&&response.total>=0&&
   (total===null||response.total===total),'LINEAGE_SUPPORT_SOURCE_CHANGED','The original paged collection changed during capture.',409);
  total=response.total;
  for(const row of response.items)if(wanted.has(row.id)){
   requireValue(!seen.has(row.id),'LINEAGE_SUPPORT_SOURCE_CHANGED','The original collection returned a duplicate identity.',409);
   seen.add(row.id);found.push(row);bytes+=Buffer.byteLength(JSON.stringify(row));
   requireValue(bytes<=MAX_CAPTURE_BYTES,'LINEAGE_SUPPORT_LIMIT','The selected original record collection exceeds the case capture capacity.',413);
  }
  if(response.nextOffset===null)break;
  requireValue(Number.isSafeInteger(response.nextOffset)&&response.nextOffset===offset+response.items.length&&response.nextOffset>offset&&response.nextOffset<total,
   'LINEAGE_SUPPORT_SOURCE_CHANGED','The original collection continuation is incomplete.',409);
  offset=response.nextOffset;
 }
 requireValue(seen.size===wanted.size,'LINEAGE_SUPPORT_SOURCE_CHANGED','A saved assessment refers to an absent original '+collection+' record.',409);
 return found;
}
async function collectObject(client,source){
 requireValue(Number.isSafeInteger(source.bytes)&&source.bytes>=1&&source.bytes<=MAX_SOURCE_BYTES,'LINEAGE_SUPPORT_LIMIT','The selected original source exceeds the retained capture capacity.',413);
 const chunks=[];let offset=0;
 while(offset<source.bytes){
  const response=await client.action('object.read',{id:source.id,offset,length:Math.min(MAX_FILE_RANGE,source.bytes-offset)});
  const bytes=Buffer.from(response.base64??'','base64');
  requireValue(response.id===source.id&&response.totalBytes===source.bytes&&response.offset===offset&&response.bytes===bytes.length&&bytes.length>0&&
   bytes.toString('base64')===response.base64&&offset+bytes.length<=source.bytes,'LINEAGE_SUPPORT_SOURCE_CHANGED','An original source range changed or is incomplete.',409);
  offset+=bytes.length;
  requireValue(response.complete===(offset===source.bytes)&&response.nextOffset===offset,
   'LINEAGE_SUPPORT_SOURCE_CHANGED','The original source range continuation changed.',409);
  chunks.push(bytes);
 }
 const bytes=Buffer.concat(chunks);requireValue(bytesHash(bytes)===source.id,'LINEAGE_SUPPORT_SOURCE_CHANGED','The complete original source hash changed.',409);return bytes;
}
/** Every context is constructed from one native revision and the original source object reader. */
export async function captureLineageContext(client,workspaceAlias,incidentId){
 const first=await client.action('workspace.metadata');
 requireValue(first&&Number.isSafeInteger(first.revision),'LINEAGE_SUPPORT_SOURCE_CHANGED','The original workspace metadata is incomplete.',409);
 const native=await client.action('service-levels.read');
 requireValue(native.workspaceId===first.workspaceId&&native.revision===first.revision,'LINEAGE_SUPPORT_SOURCE_CHANGED',
  'The original workspace changed while selecting its incident. Review the current native version.',409);
 const {workspaceId,revision:sourceRevision,...serviceLevels}=native;
 requireValue(Array.isArray(serviceLevels.assessments)&&Array.isArray(serviceLevels.incidents)&&serviceLevels.incidents.some(row=>row.id===incidentId),
  'LINEAGE_SUPPORT_INCIDENT','Select an existing original Service Levels incident.',404);
 const sourceIds=new Set(),eventIds=new Set(),editionIds=new Set();
 for(const saved of serviceLevels.assessments){
  for(const id of saved.assessment.sourceIds)sourceIds.add(id);
  for(const id of saved.assessment.eventIds)eventIds.add(id);
  if(saved.assessment.editionId!==null)editionIds.add(saved.assessment.editionId);
 }
 const sources=await collectRecords(client,'sources',first,sourceIds);
 const sourceBytes=sources.reduce((n,row)=>n+row.bytes,0);
 requireValue(Number.isSafeInteger(sourceBytes)&&sourceBytes<=MAX_SOURCE_BYTES,'LINEAGE_SUPPORT_LIMIT','This complete original assessment source exceeds the case capture limit of 16 MiB.',413);
 for(const source of sources)for(const id of source.eventIds)eventIds.add(id);
 const events=await collectRecords(client,'events',first,eventIds);
 const editions=await collectRecords(client,'editions',first,editionIds),objects=new Map();
 for(const original of sources)objects.set(original.id,await collectObject(client,original));
 const last=await client.action('workspace.metadata');sameWorkspace(last,first);
 requireValue(last.revision===first.revision,'LINEAGE_SUPPORT_SOURCE_CHANGED','The source changed before the complete capture finished. Review its current version.',409);
 return createContext({workspace:{alias:workspaceAlias,workspaceId,title:first.title,revision:sourceRevision,createdAt:first.createdAt,updatedAt:first.updatedAt},
  serviceLevels,sources,events,editions,objects,incidentId});
}
/** Use the original pure command and workspace codec for both preview admission and save. */
async function prepareMaterial(selected,material,{metadata,name,commandId}={}){
 const state=selected.workspace?.commissioning??newCommissioning();
 validateMaterial(material,{caseId:material.request?.id??material.caseId,materials:selected.materials});
 const payload={id:material.id,name:material.id+'.json',mediaType:'application/json',data:materialBytes(material).toString('base64'),
  kind:KINDS[material.kind],description:material.kind==='outcome'?'Original native incident return and its saved result':'Complete original Lineage '+material.kind,
  taskIds:[],editionId:null,reference:material.request?.reference??selected.materials.find(row=>row.id===material.intentId)?.request.reference??''};
 const actor=material.request?.actor??selected.materials.find(row=>row.id===material.intentId)?.request.actor;
 const next=await applyCommissioningCommand(state,{type:'add_material',requestId:commandId??material.request.requestId,
  expectedRevision:state.revision,actor,payload});
 const draft=selected.workspace?workspaceDraft(selected.workspace,{commissioning:next.state,...(name?{name}:{})}):{name,commissioning:next.state};
 const workspaceText=await serializeWorkspace(draft,selected.workspace?{now:selected.workspace.savedAt}:{});
 return {input:{id:material.request?.id??material.caseId,expectedRevision:selected.record?.revision??null,workspaceText,
  supportText:selected.record?.supportText??null,metadata:metadata??selected.record.metadata},replayed:next.replayed};
}
async function appendMaterial(store,selected,material,options={}){
 const prepared=await prepareMaterial(selected,material,options);
 const saved=await store.save(prepared.input);
 const retained=await readCase(store,saved.case.id,{at:saved.case.revision});
 const actual=selectedMaterial(retained.materials,material.id,material.kind);
 requireValue(actual.sha256===material.sha256,'LINEAGE_SUPPORT_MATERIAL_CHANGED','The saved material differs from the original operation.',409);
 return resultView(retained.record,actual,{replayed:prepared.replayed||saved.unchanged});
}
function checkedCase(selected,expected){
 if((selected.record?.revision??null)!==expected)throw conflict(selected.record);
}
function rejectionOf(error,intent){
 const details=error.details??{};
 if(!['REJECTED','REVISION_CONFLICT'].includes(details.outcome)||![400,404,409,422].includes(error.status)||
  details.operationId!==intent.native.args.operationId||details.workspaceId!==intent.context.workspace.workspaceId)return null;
 return {code:String(error.code??'OPENLINEAGE_REJECTED'),message:String(error.message),status:error.status,outcome:details.outcome,
  operationId:details.operationId,workspaceId:details.workspaceId,expectedRevision:intent.native.args.expectedRevision,
  ...(Number.isSafeInteger(details.currentRevision)?{currentRevision:details.currentRevision}:{})};
}

export class MerchantLineageSupport {
 #support;#lineage;#tasks=new Set();#closed=false;#close;
 constructor({support,lineage}={}){
  requireValue(typeof support?.withCaseStore==='function'&&typeof lineage?.withWorkspace==='function',
   'LINEAGE_SUPPORT_OWNER','Select the complete original Support and Lineage provider owners.',503);
  this.#support=support;this.#lineage=lineage;
 }
 get summary(){return {configured:!this.#closed,activeCalls:this.#tasks.size,closed:this.#closed};}
 call(name,args={}){
  requireValue(!this.#closed,'LINEAGE_SUPPORT_CLOSED','The original Lineage Support owner is closing.',409);
  const method=typeof name==='string'&&name.startsWith(PREFIX)?name.slice(PREFIX.length):'';
  requireValue(TOOLS.has(method),'LINEAGE_SUPPORT_TOOL','Choose a declared Lineage Support operation.');
  requireValue(args&&typeof args==='object'&&!Array.isArray(args),'LINEAGE_SUPPORT_INPUT','Supply the complete original request object.');
  const captured=clone(args);
  requireValue(Buffer.byteLength(JSON.stringify(captured))<=128*1024,'LINEAGE_SUPPORT_LIMIT','Use the bounded original selection request.',413);
  const task=Promise.resolve().then(()=>this.#call(method,captured));
  this.#tasks.add(task);task.finally(()=>this.#tasks.delete(task)).catch(()=>{});return task;
 }
 async #call(method,args){
  if(method==='sources'){
   object(args,[]);
   const lineage=await this.#lineage.call('merchant_lineage_workspaces',{});
   return {schema:SCHEMA,lineage,support:{configured:this.#support.summary.configured},limits:{captureBytes:MAX_CAPTURE_BYTES,materialBytes:MAX_RETAINED_MATERIAL_BYTES,sourceBytes:MAX_SOURCE_BYTES,fileRangeBytes:MAX_FILE_RANGE}};
  }
  if(method==='export'){
   object(args,['id','expectedRevision','exportId']);
   uuid(args.id,'case');revision(args.expectedRevision);text(args.exportId,'original export ID',160);
   return this.#support.call('merchant_case_export',{...args,includeWorkorder:false});
  }
  return this.#support.withCaseStore(async store=>{
   if(method==='preview'||method==='save'){
    const saving=method==='save',request=normalizeCaptureRequest(args,{saving});
    const selected=await readCase(store,request.id,{missing:request.expectedRevision===null});
    if(saving){const retained=originalRequest(selected.materials,request,'capture');if(retained)return resultView(selected.record,retained,{replayed:true});}
    checkedCase(selected,request.expectedRevision);
    return this.#lineage.withWorkspace(request.workspace,async client=>{
     const context=await captureLineageContext(client,request.workspace,request.incidentId);
     const preview=previewCapture(request,caseIdentity(selected.record),context);
     if(!saving){
      // UUIDs and digests have fixed encoded lengths; this is the exact eventual
      // material shape, checked through the native per-file and whole-case limits.
      const candidate=captureMaterial({...request,requestId:randomUUID(),expectedPreviewSha256:preview.previewSha256},preview,context);
      await prepareMaterial(selected,candidate,{metadata:request.metadata,name:request.name});
      return preview;
     }
     const material=captureMaterial(request,preview,context);
     try{return await appendMaterial(store,selected,material,{metadata:request.metadata,name:request.name});}
     catch(error){
      if(error.code==='CASE_CONFLICT'){
       const current=await readCase(store,request.id),retained=originalRequest(current.materials,request,'capture');
       if(retained)return resultView(current.record,retained,{replayed:true});
      }
      throw error;
     }
    });
   }
   if(method==='return_preview'||method==='return_prepare'){
    const saving=method==='return_prepare',request=normalizeReturnRequest(args,{saving});
    const selected=await readCase(store,request.id);
    if(saving){const retained=originalRequest(selected.materials,request,'intent');if(retained)return resultView(selected.record,retained,{replayed:true});}
    checkedCase(selected,request.expectedRevision);
    const capture=selectedMaterial(selected.materials,request.captureId,'capture');
    return this.#lineage.withWorkspace(request.workspace,async client=>{
     const context=await captureLineageContext(client,request.workspace,capture.context.incidentId);
     const preview=previewReturn(request,caseIdentity(selected.record),capture,context);
     if(!saving){
      const candidate=returnMaterial({...request,requestId:randomUUID(),expectedPreviewSha256:preview.previewSha256},preview,capture,context);
      await prepareMaterial(selected,candidate);
      return preview;
     }
     const material=returnMaterial(request,preview,capture,context);
     try{return await appendMaterial(store,selected,material);}
     catch(error){
      if(error.code==='CASE_CONFLICT'){
       const current=await readCase(store,request.id),retained=originalRequest(current.materials,request,'intent');
       if(retained)return resultView(current.record,retained,{replayed:true});
      }
      throw error;
     }
    });
   }
   if(method==='return_execute'){
    object(args,['id','intentId','expectedIntentSha256','workspace']);
    uuid(args.id,'case');text(args.intentId,'original intent ID',160);hash(args.expectedIntentSha256);alias(args.workspace);
    const selected=await readCase(store,args.id),intent=selectedMaterial(selected.materials,args.intentId,'intent');
    requireValue(intent.sha256===args.expectedIntentSha256,'LINEAGE_SUPPORT_INTENT_CHANGED','The selected saved intent changed.',409);
    const previous=selected.materials.find(row=>row.kind==='outcome'&&row.intentId===intent.id);
    if(previous)return resultView(selected.record,previous,{replayed:true});
    return this.#lineage.withWorkspace(args.workspace,async client=>{
     const identity=await client.action('workspace.metadata');sameWorkspace(identity,intent.context.workspace);
     let result,rejection;
     try{result=await client.action(intent.native.action,clone(intent.native.args));}
     catch(error){
      rejection=rejectionOf(error,intent);
      if(!rejection){
       error.details={...error.details,caseId:args.id,intentId:intent.id,intentSha256:intent.sha256,
        originalOperationId:intent.native.args.operationId,recovery:'Keep this original saved intent. Reconnect the existing Lineage owner if required, then execute the same intent again.'};
       throw error;
      }
     }
     const outcome=outcomeMaterial(intent,result??null,{rejection:rejection??null});
     for(let attempt=0;attempt<4;attempt++){
      const current=await readCase(store,args.id);
      const retained=selectedMaterial(current.materials,intent.id,'intent');
      requireValue(retained.sha256===intent.sha256,'LINEAGE_SUPPORT_INTENT_CHANGED','The saved intent no longer matches this native return.',409);
      const existing=current.materials.find(row=>row.kind==='outcome'&&row.intentId===intent.id);
      if(existing){
       requireValue(existing.sha256===outcome.sha256,'LINEAGE_SUPPORT_OUTCOME_CHANGED','The native return conflicts with its already retained original outcome.',409);
       return resultView(current.record,existing,{replayed:true});
      }
      try{return await appendMaterial(store,current,outcome,{commandId:'lineage-support-outcome:'+intent.request.requestId});}
      catch(error){if(error.code==='CASE_CONFLICT'&&attempt<3)continue;
       throw bridgeError('LINEAGE_SUPPORT_APPEND_PENDING','The original native return is known, but its case append did not complete. Execute the same saved intent to retain its original result.',503,
        {caseId:args.id,intentId:intent.id,intentSha256:intent.sha256,operationId:intent.native.args.operationId,nativeOutcome:outcome.state,
         outcomeSha256:outcome.sha256,causeCode:error.code??'CASE_STORAGE_UNAVAILABLE'});}
     }
    });
   }
   if(method==='read'){
    object(args,['id','revision','kind','offset','limit']);
    uuid(args.id,'case');if(args.revision!==undefined)revision(args.revision);
    requireValue(args.kind===undefined||['capture','intent','outcome'].includes(args.kind),'LINEAGE_SUPPORT_INPUT','Choose a captured source, intent or outcome.');
    const selected=await readCase(store,args.id,{at:args.revision??null}),{offset,limit}=page(args);
    const rows=selected.materials.filter(row=>args.kind===undefined||row.kind===args.kind);
    return {schema:SCHEMA,case:caseIdentity(selected.record),metadata:clone(selected.record.metadata),name:selected.workspace.name,
     materials:rows.slice(offset,offset+limit).map(materialSummary),total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null,
     counts:Object.fromEntries(['capture','intent','outcome'].map(kind=>[kind,selected.materials.filter(row=>row.kind===kind).length]))};
   }
   if(method==='file'){
    object(args,['id','revision','materialId','expectedMaterialSha256','name','offset','length']);
    uuid(args.id,'case');revision(args.revision);text(args.materialId,'original material ID',160);hash(args.expectedMaterialSha256);
    text(args.name,'original file name',512);const offset=args.offset??0,length=args.length??MAX_FILE_RANGE;
    requireValue(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(length)&&length>0&&length<=MAX_FILE_RANGE,
     'LINEAGE_SUPPORT_INPUT','Read an original file with nonnegative offset and at most 262144 bytes.');
    const selected=await readCase(store,args.id,{at:args.revision}),material=selectedMaterial(selected.materials,args.materialId);
    requireValue(material.sha256===args.expectedMaterialSha256,'LINEAGE_SUPPORT_MATERIAL_CHANGED','The selected original material changed.',409);
    const file=originalFile(material,args.name),bytes=Buffer.from(file.base64,'base64');
    requireValue(offset<=bytes.length,'LINEAGE_SUPPORT_INPUT','The offset is outside this original file.');
    const part=bytes.subarray(offset,Math.min(bytes.length,offset+length)),end=offset+part.length;
    return {schema:SCHEMA,case:caseIdentity(selected.record),materialId:material.id,materialSha256:material.sha256,
     name:file.name,mediaType:file.mediaType,totalBytes:bytes.length,sha256:file.sha256,offset,bytes:part.length,base64:part.toString('base64'),
     complete:end===bytes.length,nextOffset:end<bytes.length?end:null};
   }
   throw bridgeError('LINEAGE_SUPPORT_TOOL','Unknown original Lineage Support operation.');
  });
 }
 close(){
  if(!this.#close){this.#closed=true;this.#close=Promise.allSettled([...this.#tasks]).then(()=>undefined);}
  return this.#close;
 }
}
