// MIT. Original Lineage observations and decisions retained in the SF74 material journal.
import {createHash} from 'node:crypto';
import {canonical,parseSource} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/model.mjs';
import {parseRetainedSource} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/source-encoding.mjs';
import {validateServiceLevels,serviceLevelReport} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/service-levels.mjs';
import {caseMetadata} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-store.mjs';
import {commissioningFileBytes,MAX_MATERIAL_BYTES as NATIVE_MATERIAL_BYTES} from '../../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commissioning.mjs';

export const SCHEMA='stellar-forge.lineage-support.v1';
export const MAX_CAPTURE_BYTES=24*1024*1024;
export const MAX_RETAINED_MATERIAL_BYTES=Math.min(25*1024*1024,NATIVE_MATERIAL_BYTES);
export const MAX_SOURCE_BYTES=16*1024*1024;
export const MAX_FILE_RANGE=262144;
export const KINDS=Object.freeze({capture:'lineage-support-capture',intent:'lineage-support-intent',outcome:'lineage-support-outcome'});
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ALIAS=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const json=value=>JSON.stringify(value,null,2)+'\n';
const copy=value=>JSON.parse(JSON.stringify(value));
export const bytesHash=value=>createHash('sha256').update(value).digest('hex');
export const valueHash=value=>bytesHash(canonical(value));
export function bridgeError(code,message,status=400,details){return Object.assign(new Error(message),{code,status,...(details?{details}:{})});}
export function requireValue(value,code,message,status=400,details){if(!value)throw bridgeError(code,message,status,details);}
export function object(value,keys,label='request'){
 requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key)),'LINEAGE_SUPPORT_INPUT','Use the declared '+label+' fields.');
 return value;
}
export function text(value,label,maximum=8000,{empty=false}={}){
 requireValue(typeof value==='string'&&(empty||value.trim())&&Buffer.byteLength(value)<=maximum&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'LINEAGE_SUPPORT_INPUT','Use a valid '+label+'.');
 return value;
}
export function uuid(value,label='identifier'){requireValue(typeof value==='string'&&UUID.test(value),'LINEAGE_SUPPORT_INPUT','Use the original UUID for '+label+'.');return value;}
export function hash(value,label='digest'){requireValue(typeof value==='string'&&HASH.test(value),'LINEAGE_SUPPORT_INPUT','Use the complete '+label+'.');return value;}
export function alias(value){requireValue(typeof value==='string'&&ALIAS.test(value),'LINEAGE_SUPPORT_INPUT','Select an existing workspace alias.');return value;}
export function revision(value,{nullable=false}={}){if(nullable&&value===null)return null;return hash(value,'case revision');}
export function caseIdentity(record){
 return record?{id:record.id,revision:record.revision,workspaceSha256:bytesHash(record.workspaceText),supportSha256:record.supportText===null?null:bytesHash(record.supportText)}:null;
}
export function normalizeCaptureRequest(value,{saving=false}={}){
 object(value,['id','expectedRevision','workspace','incidentId','name','metadata','actor','reference',...(saving?['requestId','expectedPreviewSha256']:[])]);
 const result={id:uuid(value.id,'case'),expectedRevision:revision(value.expectedRevision,{nullable:true}),workspace:alias(value.workspace),
  incidentId:hash(value.incidentId,'original incident ID'),name:text(value.name,'case name',480),metadata:caseMetadata(value.metadata),
  actor:text(value.actor,'operator',200),reference:text(value.reference??'','source reference',4096,{empty:true})};
 if(saving){result.requestId=uuid(value.requestId,'request');result.expectedPreviewSha256=hash(value.expectedPreviewSha256,'reviewed preview SHA-256');}
 return result;
}
export function normalizeReturnRequest(value,{saving=false}={}){
 object(value,['id','expectedRevision','captureId','workspace','decision','owner','reason','actor','reference',...(saving?['requestId','expectedPreviewSha256']:[])]);
 requireValue(['acknowledge','assign','resolve','accept','reopen'].includes(value.decision),'LINEAGE_SUPPORT_INPUT','Choose an original Service Levels incident decision.');
 const result={id:uuid(value.id,'case'),expectedRevision:revision(value.expectedRevision),captureId:text(value.captureId,'capture ID',160),
  workspace:alias(value.workspace),decision:value.decision,owner:text(value.owner??'','incident owner',400,{empty:true}),
  reason:text(value.reason,'incident decision reason',6000),actor:text(value.actor,'operator',200),
  reference:text(value.reference??'','decision reference',4096,{empty:true})};
 if(result.decision==='assign')requireValue(result.owner,'LINEAGE_SUPPORT_INPUT','An assignment requires an owner.');
 if(saving){result.requestId=uuid(value.requestId,'request');result.expectedPreviewSha256=hash(value.expectedPreviewSha256,'reviewed preview SHA-256');}
 return result;
}
function previewRequest(request){const {requestId,expectedPreviewSha256,...value}=request;return value;}
export function seal(value){return {...value,sha256:valueHash(value)};}
function unseal(value){
 requireValue(value&&value.schema===SCHEMA&&['capture','intent','outcome'].includes(value.kind),'LINEAGE_SUPPORT_RECORD','Choose a complete original Lineage Support material.',409);
 const {sha256,...body}=value;hash(sha256);requireValue(valueHash(body)===sha256,'LINEAGE_SUPPORT_RECORD','The retained material content changed.',409);return body;
}
function safeName(value){return String(value??'events.json').split(/[\\/]/).at(-1).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180)||'events.json';}
export function fileRecord(name,bytes,mediaType,extra={}){
 const buffer=Buffer.from(bytes);
 return {name,mediaType,bytes:buffer.length,sha256:bytesHash(buffer),base64:buffer.toString('base64'),...extra};
}
export function contextState(context){
 return {...context.workspace,sources:context.sources,events:context.events,editions:context.editions,reviews:[],results:[],
  serviceLevels:context.serviceLevels};
}
/** One native revision, its original source objects, and native report renderings. */
export function createContext({workspace,serviceLevels,sources,events,editions,objects,incidentId}){
 const context={workspace:copy(workspace),incidentId,serviceLevels:copy(serviceLevels),sources:copy(sources),events:copy(events),editions:copy(editions),files:[]};
 for(const source of sources){
  const bytes=objects.get(source.id);
  requireValue(bytes&&bytesHash(bytes)===source.id&&bytes.length===source.bytes,'LINEAGE_SUPPORT_SOURCE','An original source differs from its selected content identity.',409);
  context.files.push(fileRecord('sources/'+source.id+'-'+safeName(source.name),bytes,source.contentEncoding==='gzip'?'application/gzip':'application/json',
   {kind:'source',sourceId:source.id}));
 }
 const state=contextState(context),incident=serviceLevels.incidents.find(row=>row.id===incidentId);
 requireValue(incident,'LINEAGE_SUPPORT_INCIDENT','Select an incident from the original Service Levels desk.',404);
 const ids=[...new Set([incident.firstAssessmentId,incident.lastObservedAssessmentId,incident.lastAssessmentId])];
 for(const assessmentId of ids)for(const format of ['json','csv','html']){
  const report=serviceLevelReport(state,{assessmentId,format});
  context.files.push(fileRecord('reports/'+assessmentId+'.'+format,Buffer.from(report.text),report.mediaType,{kind:'report',assessmentId,format}));
 }
 context.files.push(fileRecord('service-levels.json',Buffer.from(json({workspace:context.workspace,...serviceLevels})),'application/json',{kind:'service-levels'}));
 validateContext(context);
 return context;
}
export function validateContext(value){
 object(value,['workspace','incidentId','serviceLevels','sources','events','editions','files'],'captured context');
 requireValue(Buffer.byteLength(JSON.stringify(value))<=MAX_CAPTURE_BYTES,'LINEAGE_SUPPORT_LIMIT','This complete incident capture exceeds 24 MiB; retain the original native workspace export and select a smaller source workspace.',413);
 const w=value.workspace;requireValue(w&&UUID.test(w.workspaceId??'')&&Number.isSafeInteger(w.revision)&&w.revision>=0,'LINEAGE_SUPPORT_SOURCE','Invalid original workspace identity.',409);
 hash(value.incidentId,'incident ID');
 for(const key of ['sources','events','editions','files'])requireValue(Array.isArray(value[key]),'LINEAGE_SUPPORT_SOURCE','Missing original '+key+'.',409);
 const sourceIds=new Set(),fileNames=new Set(),sourceFiles=new Map(),sourceFileRecords=new Map(),originalEvents=new Map(),sourceEventIds=new Map(),originalReferences=new Map();
 let total=0;
 for(const file of value.files){
  requireValue(file&&typeof file.name==='string'&&file.name.length<=512&&!file.name.startsWith('/')&&file.name.split('/').every(part=>part&&part!=='.'&&part!=='..')&&!/[\\\0]/.test(file.name)&&!fileNames.has(file.name),'LINEAGE_SUPPORT_SOURCE','Invalid or duplicate original file name.',409);
  fileNames.add(file.name);hash(file.sha256);
  const bytes=Buffer.from(file.base64??'','base64');
  requireValue(bytes.toString('base64')===file.base64&&bytes.length===file.bytes&&bytesHash(bytes)===file.sha256,'LINEAGE_SUPPORT_SOURCE','Retained original file bytes changed.',409);
  if(file.kind==='source'){requireValue(!sourceFiles.has(file.sourceId),'LINEAGE_SUPPORT_SOURCE','Duplicate original source file.',409);sourceFiles.set(file.sourceId,bytes);sourceFileRecords.set(file.sourceId,file);total+=bytes.length;}
 }
 requireValue(total<=MAX_SOURCE_BYTES,'LINEAGE_SUPPORT_LIMIT','The original source selection exceeds the case capture limit of 16 MiB.',413);
 for(const source of value.sources){
  hash(source.id);requireValue(!sourceIds.has(source.id),'LINEAGE_SUPPORT_SOURCE','Duplicate original source identity.',409);sourceIds.add(source.id);
  const bytes=sourceFiles.get(source.id),file=sourceFileRecords.get(source.id);
  requireValue(file?.name==='sources/'+source.id+'-'+safeName(source.name)&&file.mediaType===(source.contentEncoding==='gzip'?'application/gzip':'application/json'),
   'LINEAGE_SUPPORT_SOURCE','The original source filename or media type changed.',409);
  requireValue(bytes&&bytes.length===source.bytes&&bytesHash(bytes)===source.id,'LINEAGE_SUPPORT_SOURCE','Source metadata differs from its original bytes.',409);
  const parsed=(source.contentEncoding??'identity')==='identity'?parseSource(bytes,source.name):parseRetainedSource(bytes,source.name,{contentEncoding:source.contentEncoding,maxDecodedBytes:MAX_CAPTURE_BYTES});
  requireValue(parsed.id===source.id&&canonical(parsed.events.map(row=>row.id))===canonical(source.eventIds),'LINEAGE_SUPPORT_SOURCE','Original source event references changed.',409);
  requireValue(source.format===parsed.format&&source.diagnosticCount===parsed.events.filter(row=>row.diagnostics.length).length&&
   (source.contentEncoding!=='gzip'||source.decodedBytes===parsed.decodedBytes&&source.decodedSha256===parsed.decodedSha256),
   'LINEAGE_SUPPORT_SOURCE','Original source format, diagnostics or decoded identity changed.',409);
  sourceEventIds.set(source.id,new Set(parsed.events.map(row=>row.id)));
  for(const row of parsed.events){
   const prior=originalEvents.get(row.id);requireValue(!prior||canonical(prior.event)===canonical(row.event),'LINEAGE_SUPPORT_SOURCE','An original event identity conflicts.',409);
   originalEvents.set(row.id,row);
   const refs=originalReferences.get(row.id)??[];refs.push({sourceId:source.id,...(row.line?{line:row.line}:{index:row.index})});originalReferences.set(row.id,refs);
  }
 }
 requireValue(sourceFiles.size===sourceIds.size,'LINEAGE_SUPPORT_SOURCE','The capture contains an unselected source file.',409);
 const eventIds=new Set();
 for(const row of value.events){
  const original=originalEvents.get(row.id);
  requireValue(original&&!eventIds.has(row.id)&&canonical(original.event)===canonical(row.event)&&original.supported===row.supported&&original.kind===row.kind&&canonical(original.diagnostics)===canonical(row.diagnostics),'LINEAGE_SUPPORT_SOURCE','A captured event differs from its original producer bytes.',409);
  eventIds.add(row.id);
  requireValue(Array.isArray(row.sources)&&row.sources.some(ref=>sourceIds.has(ref.sourceId))&&row.sources.every(ref=>!sourceIds.has(ref.sourceId)||sourceEventIds.get(ref.sourceId).has(row.id)),'LINEAGE_SUPPORT_SOURCE','Event provenance references a missing original source.',409);
  requireValue(canonical(row.sources.filter(ref=>sourceIds.has(ref.sourceId)))===canonical(originalReferences.get(row.id)),
   'LINEAGE_SUPPORT_SOURCE','An original event source position changed.',409);
 }
 requireValue(eventIds.size===originalEvents.size&&[...originalEvents.keys()].every(id=>eventIds.has(id)),
  'LINEAGE_SUPPORT_SOURCE','The capture omits events from its complete original source files.',409);
 const state=contextState(value);
 validateServiceLevels(state,{deep:true});
 const incident=value.serviceLevels.incidents.find(row=>row.id===value.incidentId);
 requireValue(incident,'LINEAGE_SUPPORT_INCIDENT','The captured original incident is absent.',409);
 const reportIds=[...new Set([incident.firstAssessmentId,incident.lastObservedAssessmentId,incident.lastAssessmentId])];
 const expected=new Set([...value.sources.map(source=>'sources/'+source.id+'-'+safeName(source.name)),'service-levels.json']);
 for(const assessmentId of reportIds)for(const format of ['json','csv','html']){
  const name='reports/'+assessmentId+'.'+format,actual=value.files.find(file=>file.name===name),report=serviceLevelReport(state,{assessmentId,format});
  requireValue(actual&&actual.kind==='report'&&actual.assessmentId===assessmentId&&actual.format===format&&actual.mediaType===report.mediaType&&actual.sha256===bytesHash(report.text),'LINEAGE_SUPPORT_SOURCE','The report differs from the original native rendering.',409);expected.add(name);
 }
 const levels=value.files.find(file=>file.name==='service-levels.json');
 requireValue(levels?.kind==='service-levels'&&levels.mediaType==='application/json'&&levels.sha256===bytesHash(json({workspace:value.workspace,...value.serviceLevels}))&&expected.size===fileNames.size&&[...expected].every(name=>fileNames.has(name)),'LINEAGE_SUPPORT_SOURCE','The complete Service Levels capture is inconsistent.',409);
 return value;
}
export function contextSummary(context){
 const incident=context.serviceLevels.incidents.find(row=>row.id===context.incidentId);
 return {workspace:copy(context.workspace),incident:copy(incident),policy:copy(context.serviceLevels.policies.find(row=>row.id===incident.policyId)),
  assessments:context.serviceLevels.assessments.map(row=>({id:row.id,asOf:row.assessment.asOf,sourceRevision:row.assessment.sourceRevision,sha256:row.assessmentSha256,appliedToIncidents:row.appliedToIncidents})),
  originals:{sources:context.sources.length,events:context.events.length,sourceBytes:context.files.filter(row=>row.kind==='source').reduce((n,row)=>n+row.bytes,0)},
  files:context.files.map(({base64,...metadata})=>metadata)};
}
export function previewCapture(request,selectedCase,context){
 const binding={schema:'stellar-forge.lineage-support-preview.v1',kind:'capture',request:previewRequest(request),case:selectedCase,contextSha256:valueHash(context)};
 return { ...binding,previewSha256:valueHash(binding),...contextSummary(context)};
}
export function previewReturn(request,selectedCase,capture,context){
 requireValue(capture.kind==='capture'&&capture.id===request.captureId&&capture.request.id===request.id,'LINEAGE_SUPPORT_BINDING','Choose this case’s original capture.',409);
 requireValue(context.workspace.workspaceId===capture.context.workspace.workspaceId&&context.workspace.createdAt===capture.context.workspace.createdAt&&context.incidentId===capture.context.incidentId,'LINEAGE_SUPPORT_BINDING','The current workspace or incident differs from the saved case source.',409);
 const incident=context.serviceLevels.incidents.find(row=>row.id===context.incidentId);
 if(request.decision==='resolve')requireValue(!incident.active,'LINEAGE_SUPPORT_CONDITION_ACTIVE','The original saved assessment still observes this condition. Record a later native clear assessment before resolving it, or review an explicit acceptance.',409);
 const binding={schema:'stellar-forge.lineage-support-preview.v1',kind:'return',request:previewRequest(request),case:selectedCase,captureSha256:capture.sha256,contextSha256:valueHash(context)};
 return {...binding,previewSha256:valueHash(binding),...contextSummary(context)};
}
export function captureMaterial(request,preview,context){
 requireValue(request.expectedPreviewSha256===preview.previewSha256,'LINEAGE_SUPPORT_PREVIEW_CHANGED','Review the current case and original source before saving this capture.',409);
 return seal({schema:SCHEMA,kind:'capture',id:'capture-'+request.requestId,request:copy(request),requestSha256:valueHash(request),preview:copy(preview),context:copy(context)});
}
export function returnMaterial(request,preview,capture,context){
 requireValue(request.expectedPreviewSha256===preview.previewSha256,'LINEAGE_SUPPORT_PREVIEW_CHANGED','Review the current case and original incident before saving this return.',409);
 const id='intent-'+request.requestId,operationId='lineage-support:'+valueHash({id:request.id,requestId:request.requestId});
 const native={action:'service-levels.incident.review',args:{operationId,expectedRevision:context.workspace.revision,id:context.incidentId,decision:request.decision,owner:request.owner,
  reason:request.reason+'\n\nSupport case '+request.id+'; reviewed revision '+request.expectedRevision+'; saved intent '+id+'.'}};
 return seal({schema:SCHEMA,kind:'intent',id,request:copy(request),requestSha256:valueHash(request),captureId:capture.id,captureSha256:capture.sha256,
  preview:copy(preview),context:copy(context),native});
}
export function outcomeMaterial(intent,result,{rejection=null}={}){
 const actual=result?copy(result):null;if(actual)delete actual.replayed;
 return seal({schema:SCHEMA,kind:'outcome',id:'outcome-'+intent.id,requestId:intent.request.requestId,caseId:intent.request.id,
  intentId:intent.id,intentSha256:intent.sha256,native:copy(intent.native),state:rejection?'REJECTED':'CONFIRMED',result:actual,rejection:rejection?copy(rejection):null});
}
export function materialBytes(value){
 const bytes=Buffer.from(json(value));
 requireValue(bytes.length<=MAX_RETAINED_MATERIAL_BYTES,'LINEAGE_SUPPORT_LIMIT',
  'The complete serialized Lineage material exceeds its original case limit. Select a source workspace whose complete capture fits this case.',413,
  {materialBytes:bytes.length,maximumBytes:MAX_RETAINED_MATERIAL_BYTES});
 return bytes;
}
export function validateMaterial(value,{caseId,materials=[]}={}){
 materialBytes(value);
 const body=unseal(value);
 requireValue(typeof body.id==='string'&&body.id.length<=160,'LINEAGE_SUPPORT_RECORD','Invalid original material ID.',409);
 if(body.kind==='capture'){
  const request=normalizeCaptureRequest(body.request,{saving:true});
  requireValue((!caseId||request.id===caseId)&&body.id==='capture-'+request.requestId&&body.requestSha256===valueHash(request),'LINEAGE_SUPPORT_BINDING','The capture belongs to a different original case or request.',409);
  validateContext(body.context);
  const rebuilt=previewCapture(request,body.preview.case,body.context);
  requireValue(canonical(request)===canonical(body.request)&&canonical(rebuilt)===canonical(body.preview),'LINEAGE_SUPPORT_BINDING','The retained capture preview changed.',409);
  requireValue(request.expectedRevision===null?body.preview.case===null:body.preview.case?.id===request.id&&body.preview.case.revision===request.expectedRevision,'LINEAGE_SUPPORT_BINDING','The captured case precondition changed.',409);
  requireValue(body.context.workspace.alias===request.workspace,'LINEAGE_SUPPORT_BINDING','The original configured source alias changed.',409);
  requireValue(body.preview.previewSha256===request.expectedPreviewSha256&&body.context.incidentId===request.incidentId,'LINEAGE_SUPPORT_BINDING','The captured original incident or review differs.',409);
 }else if(body.kind==='intent'){
  const request=normalizeReturnRequest(body.request,{saving:true});
  const capture=materials.find(row=>row.kind==='capture'&&row.id===body.captureId);
  requireValue(capture&&(!caseId||request.id===caseId)&&body.id==='intent-'+request.requestId&&body.requestSha256===valueHash(request)&&body.captureSha256===capture.sha256,'LINEAGE_SUPPORT_BINDING','The return’s original capture or request differs.',409);
  validateContext(body.context);
  requireValue(canonical(request)===canonical(body.request)&&body.preview.case?.id===request.id&&body.preview.case.revision===request.expectedRevision&&body.context.workspace.alias===request.workspace,'LINEAGE_SUPPORT_BINDING','The reviewed case or configured source precondition changed.',409);
  const preview=previewReturn(request,body.preview.case,capture,body.context),rebuilt=returnMaterial(request,preview,capture,body.context);
  requireValue(canonical(rebuilt)===canonical(value),'LINEAGE_SUPPORT_BINDING','The retained native return is not the originally reviewed operation.',409);
 }else{
  const intent=materials.find(row=>row.kind==='intent'&&row.id===body.intentId);
  requireValue(intent&&(!caseId||body.caseId===caseId)&&body.intentSha256===intent.sha256&&body.caseId===intent.request.id&&['CONFIRMED','REJECTED'].includes(body.state),'LINEAGE_SUPPORT_BINDING','The outcome’s original intent is absent or changed.',409);
  if(body.state==='CONFIRMED')requireValue(body.result&&body.result.workspaceId===intent.context.workspace.workspaceId&&body.result.operationId===intent.native.args.operationId&&Number.isSafeInteger(body.result.revision)&&body.result.revision>intent.native.args.expectedRevision&&body.result.incident?.id===intent.context.incidentId,'LINEAGE_SUPPORT_BINDING','The native result belongs to a different original decision.',409);
  else requireValue(body.result===null&&body.rejection&&[400,404,409,422].includes(body.rejection.status),'LINEAGE_SUPPORT_BINDING','A rejected return requires its definite native rejection.',409);
  requireValue(canonical(outcomeMaterial(intent,body.result,{rejection:body.rejection}))===canonical(value),'LINEAGE_SUPPORT_BINDING','The outcome’s native request changed.',409);
 }
 return value;
}
export function readMaterials(workspace,caseId){
 const selected=[];
 for(const kind of ['capture','intent','outcome'])for(const material of workspace.commissioning?.materials??[]){
  if(material.kind!==KINDS[kind])continue;
  const bytes=Buffer.from(commissioningFileBytes(workspace.commissioning,material.sha256));
  requireValue(bytes.length<=MAX_RETAINED_MATERIAL_BYTES,'LINEAGE_SUPPORT_LIMIT','The retained Lineage material exceeds its complete byte limit.',413);
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw bridgeError('LINEAGE_SUPPORT_RECORD','The retained original Lineage material is not UTF-8 JSON.',409);}
  requireValue(value.id===material.id&&value.kind===kind,'LINEAGE_SUPPORT_BINDING','Material metadata differs from its original record.',409);
  validateMaterial(value,{caseId,materials:selected});selected.push(value);
 }
 return selected;
}
export function materialSummary(value){
 return {id:value.id,kind:value.kind,sha256:value.sha256,requestId:value.request?.requestId??value.requestId,
  ...(value.kind==='outcome'?{intentId:value.intentId,state:value.state,nativeRevision:value.result?.revision??null,decision:value.native.args.decision,rejection:value.rejection}:
   {caseId:value.request.id,actor:value.request.actor,reference:value.request.reference,workspaceId:value.context.workspace.workspaceId,sourceRevision:value.context.workspace.revision,incidentId:value.context.incidentId,
    ...(value.kind==='intent'?{captureId:value.captureId,decision:value.request.decision,operationId:value.native.args.operationId}:{}),
    files:value.context.files.map(({base64,...metadata})=>metadata)})};
}
export function originalFile(value,name){
 if(name==='material.json')return fileRecord(name,materialBytes(value),'application/json');
 const found=value.context?.files.find(file=>file.name===name);
 requireValue(found,'LINEAGE_SUPPORT_FILE','Choose a complete original file from the retained material manifest.',404);return found;
}
