// MIT. Reviewed source-to-target plans; actual native transport is separate.
import {KINDS,RELATIONS,WRITABLE,REQUIRED,exact,exactParse,plain,identity,clone,typedId,issue,fail,cleanBody,sourceDocument} from './common.mjs';
import {normalizeRelations} from './sources.mjs';
export function issueIdentity(value){return {...value,id:identity(value)};}
function issueFor(code,node,details={},blocking=false){return issue(code,{sourceKey:node.sourceKey,entityKind:node.entityKind,...details},blocking);}
function mergeOverrides(kind,body,overrides,issues,node){
 for(const [key,value]of Object.entries(overrides??{})){
  if(!WRITABLE[kind].includes(key)){issues.push(issueFor('OVERRIDE_FIELD_UNSUPPORTED',node,{field:key},true));continue;}
  body[key]=value;
 }
 return body;
}
function marker(body,node,configuration,projectId){
 const field=node.entityKind==='Observations'?'parameters':node.entityKind==='HistoricalLocations'?null:'properties';
 if(!field||Object.hasOwn(body,field)&&!plain(body[field]))return {body,marker:null};
 const original=body[field]??{};
 if(Object.hasOwn(original,configuration.markerProperty))return {body,marker:null,collision:true};
 const value={namespace:configuration.namespace,project:projectId,sourceKey:node.sourceKey,sourceSha256:node.semanticSha256};
 body[field]={...original,[configuration.markerProperty]:value};return {body,marker:{field,property:configuration.markerProperty,value}};
}
function requiredRelations(step,issues){
 const relation=step.relations;
 const required=step.entityKind==='Datastreams'?['Thing','Sensor','ObservedProperty']:
  step.entityKind==='MultiDatastreams'?['Thing','Sensor','ObservedProperties']:
  step.entityKind==='HistoricalLocations'?['Thing','Locations']:step.entityKind==='Observations'?['FeatureOfInterest']:[];
 for(const name of required)if(!relation[name]?.values.length)issues.push(issueFor('REQUIRED_RELATION_UNRESOLVED',step,{relation:name},true));
 if(step.entityKind==='Observations'&&Number(Boolean(relation.Datastream?.values.length))+Number(Boolean(relation.MultiDatastream?.values.length))!==1)
  issues.push(issueFor('OBSERVATION_STREAM_UNRESOLVED',step,{},true));
}
function selectedVariants(normalized,configuration,issues){
 const bindings=new Map(configuration.bindings.map(x=>[x.sourceKey,x])),groups=new Map(),out=[];
 for(const row of normalized.records){const group=groups.get(row.sourceKey)??[];group.push(row);groups.set(row.sourceKey,group);}
 for(const [key,variants]of groups){
  const binding=bindings.get(key),choice=binding?.sourceOccurrenceId;
  if(variants.length===1){if(choice&&!variants[0].occurrenceIds.includes(choice))issues.push(issue('SELECTED_OCCURRENCE_MISSING',{sourceKey:key,occurrenceId:choice},true));out.push(variants[0]);continue;}
  const selected=choice?variants.find(x=>x.occurrenceIds.includes(choice)):null;
  if(!selected){issues.push(issue('CONFLICTING_SOURCE_ID',{sourceKey:key,occurrenceIds:variants.flatMap(x=>x.occurrenceIds)},true));out.push(variants[0]);}
  else{out.push({...selected,resolvedVariants:variants.map(x=>({semanticSha256:x.semanticSha256,occurrenceIds:x.occurrenceIds}))});issues.push(issue('SOURCE_CONFLICT_EXPLICITLY_SELECTED',{sourceKey:key,occurrenceId:choice}));}
 }
 for(const binding of configuration.bindings)if(!groups.has(binding.sourceKey))issues.push(issue('UNKNOWN_MAPPING_BINDING',{sourceKey:binding.sourceKey},true));
 return {nodes:out,bindings};
}
export function targetRelations(kind,bodyText){
 const doc=exactParse(bodyText),out={};
 for(const [name,spec]of Object.entries(RELATIONS[kind]??{})){
  const raw=doc[name];if(raw===undefined)continue;
  const list=Array.isArray(raw)?raw:[raw],values=list.map(value=>{
   if(!plain(value)||!Object.hasOwn(value,'@iot.id'))throw fail('TARGET_RELATION','The retained target inspection has no typed expanded relationship identifier.',409);
   return {targetIdJson:typedId(exact(value['@iot.id']))};
  });
  out[name]={kind:spec.kind,many:spec.many===true,values};
 }
 return out;
}
export async function inspectionIndex(store,inspection){
 const index=new Map();if(!inspection)return index;
 const journal=JSON.parse((await store.object(inspection.journal.sha256)).toString('utf8'));
 for(const entry of journal.steps??[]){
  const step=entry.record?JSON.parse((await store.object(entry.record.sha256)).toString('utf8')):entry;
  const attempt=step.attempts?.filter(x=>x.response&&x.response.status>=200&&x.response.status<300).at(-1);
  if(!attempt||!step.entityKind||!step.targetIdJson)continue;
  const body=await store.object(attempt.response.body.sha256),document=sourceDocument(body);
  if(!plain(document))continue;
  index.set(step.entityKind+'/'+typedId(step.targetIdJson),{entityKind:step.entityKind,targetIdJson:typedId(step.targetIdJson),
   response:clone(attempt.response),bodyText:body.toString('utf8'),bodySha256:attempt.response.body.sha256,etag:attempt.response.headers?.etag??null,
   targetRelations:targetRelations(step.entityKind,body.toString('utf8')),inspectionId:inspection.id,sourceJobId:inspection.jobId??inspection.id,stepId:step.stepId});
 }
 return index;
}
export async function preparePlan({store,projectId,source,mapping,target,normalized,inspection,createdAt}){
 const configuration=mapping.configuration,issues=(normalized.issues??[]).filter(x=>x.code!=='CONFLICTING_SOURCE_ID').map(clone),
  {nodes,bindings}=selectedVariants(normalized,configuration,issues),before=await inspectionIndex(store,inspection),steps=[];
 for(const node of nodes){
  const binding=bindings.get(node.sourceKey)??{mode:'create'},body=mergeOverrides(node.entityKind,exactParse(node.bodyText),binding.overrides,issues,node);
  const mode=binding.mode,targetIdJson=mode==='create'?null:typedId(binding.targetIdJson),
   relations=binding.relations?normalizeRelations(node.entityKind,binding.relations):clone(node.relations);
  const managed=mode==='create'?marker(body,node,configuration,projectId):{body,marker:null};
  if(managed.collision)issues.push(issueFor('PROVENANCE_PROPERTY_COLLISION',node,{property:configuration.markerProperty},true));
  else if(mode==='create'&&!managed.marker)issues.push(issueFor('RECONCILIATION_NEEDS_RETURNED_ID',node,{reason:'The original nullable/non-object metadata remains unchanged.'}));
  if(node.omittedFields?.length)issues.push(issueFor('SOURCE_FIELDS_OUTSIDE_WRITE_MODEL',node,{fields:node.omittedFields}));
  const step={stepId:identity({projectId,mappingId:mapping.id,sourceKey:node.sourceKey,mode}),entityKind:node.entityKind,sourceKey:node.sourceKey,
   sourceRefs:clone(node.sourceRefs),occurrenceIds:clone(node.occurrenceIds),sourceRowCount:node.sourceRowCount,semanticSha256:node.semanticSha256,
   sourceJson:node.sourceJson,bodyText:exact(managed.body),relations,mode,targetIdJson,marker:managed.marker,
   authored:node.authored===true,omittedFields:node.omittedFields??[],resolvedVariants:node.resolvedVariants??null,issues:[]};
  if(mode!=='bind'){
   for(const key of REQUIRED[node.entityKind])if(!Object.hasOwn(managed.body,key)||(managed.body[key]===null&&!(node.entityKind==='Observations'&&key==='result')))
    issues.push(issueFor('REQUIRED_SOURCE_FIELD',step,{field:key},true));
   requiredRelations(step,issues);
  }
  if(mode==='update'||mode==='bind'){
   const selected=before.get(node.entityKind+'/'+targetIdJson);
   if(!selected)issues.push(issueFor(mode==='bind'?'BIND_BEFORE_IMAGE_REQUIRED':'UPDATE_BEFORE_IMAGE_REQUIRED',step,{targetIdJson},true));
   else step.beforeImage={...selected,comparisonFields:Object.keys(cleanBody(node.entityKind,exactParse(selected.bodyText)).values),comparisonPolicy:'exact-decimal-field-subset'};
  }
  steps.push(step);
 }
 const index=new Map(steps.map(x=>[x.sourceKey,x]));
 for(const step of steps)for(const [name,relation]of Object.entries(step.relations)){
  if(!RELATIONS[step.entityKind]?.[name])issues.push(issueFor('UNDECLARED_RELATION',step,{relation:name},true));
  for(const value of relation.values){
   if(value.sourceKey){
    const targetStep=index.get(value.sourceKey);
    if(!targetStep)issues.push(issueFor('SOURCE_RELATION_MISSING',step,{relation:name,targetSourceKey:value.sourceKey},true));
    else if(targetStep.entityKind!==relation.kind)issues.push(issueFor('SOURCE_RELATION_KIND',step,{relation:name,targetSourceKey:value.sourceKey},true));
   }else if(value.targetIdJson!==undefined)value.targetIdJson=typedId(value.targetIdJson);
  }
 }
 const ordered=[],done=new Set(),pending=[...steps].sort((a,b)=>KINDS.indexOf(a.entityKind)-KINDS.indexOf(b.entityKind)||a.sourceKey.localeCompare(b.sourceKey));
 while(pending.length){
  const pos=pending.findIndex(step=>step.mode==='bind'||Object.values(step.relations).every(r=>r.values.every(v=>!v.sourceKey||done.has(v.sourceKey)||!index.has(v.sourceKey))));
  if(pos<0){issues.push(issue('RELATION_CYCLE',{sourceKeys:pending.map(x=>x.sourceKey)},true));ordered.push(...pending);break;}
  const [step]=pending.splice(pos,1);ordered.push(step);done.add(step.sourceKey);
 }
 const uniqueIssues=[...new Map(issues.map(x=>{const item=issueIdentity(x);return [item.id,item];})).values()];
 for(const step of ordered)step.issues=uniqueIssues.filter(x=>x.sourceKey===step.sourceKey).map(x=>x.id);
 const counts={sourceRows:normalized.sourceRows,selectedRows:normalized.selectedRows,excludedRows:normalized.excludedRows,
  duplicateOccurrences:normalized.duplicateOccurrences,conflictingSourceKeys:normalized.conflictingSourceKeys,
  entities:ordered.length,observations:ordered.filter(x=>x.entityKind==='Observations').length,
  create:ordered.filter(x=>x.mode==='create').length,bind:ordered.filter(x=>x.mode==='bind').length,update:ordered.filter(x=>x.mode==='update').length,
  blockingIssues:uniqueIssues.filter(x=>x.blocking).length,reviewIssues:uniqueIssues.filter(x=>!x.blocking).length};
 const body={schema:'stellar-forge.sensorthings-commissioning-plan.v1',kind:'commission',projectId,sourceId:source.id,
  sourceIdentity:source.raw??{editionId:source.editionId},normalizedSha256:mapping.normalized.sha256,mappingId:mapping.id,mappingSha256:mapping.document.sha256,
  targetId:target.id,targetIdentity:identity(target.profile),target:clone(target.profile),namespace:configuration.namespace,
  createdAt,inspectionId:inspection?.id??null,inspectionIdentity:inspection?.journal??null,counts,issues:uniqueIssues,steps:ordered,
  policy:{sourceValues:'Exact original JSON numeric lexemes, explicit null and source time roles.',
   invocation:'Native FROST-Python-Client execute with exact retained request bytes.',
   uncertainWrite:'Retain and reconcile; never auto-repeat an unobserved provider write.'}};
 return {...body,id:identity(body)};
}
export function reviewPlan(plan,input){
 if(!['accept','revise'].includes(input.decision)||typeof input.actor!=='string'||!input.actor.trim()||typeof input.note!=='string'||!input.note.trim())throw fail('REVIEW','Record a named operator and substantive source/target review.');
 if(!Array.isArray(input.acknowledgeIssues)||input.acknowledgeIssues.some(x=>typeof x!=='string'))throw fail('REVIEW','Record the exact issue identities reviewed.');
 if(input.decision==='accept'&&plan.issues.some(x=>x.blocking))throw fail('PLAN_BLOCKED','Resolve the actual source/target mapping conflicts before accepting this plan.',409,{issues:plan.issues.filter(x=>x.blocking)});
 if(input.decision==='accept'&&plan.issues.some(x=>!input.acknowledgeIssues.includes(x.id)))throw fail('REVIEW','Acknowledge each actual source/target issue on this exact plan.',409);
 return {planId:plan.id,planSha256:identity(plan),decision:input.decision,actor:input.actor,note:input.note,acknowledgeIssues:[...input.acknowledgeIssues]};
}
export function verificationPlan(original,journal,{id,createdAt}){
 const steps=[];
 for(const step of original.steps){
  const result=journal.steps.find(x=>x.stepId===step.stepId);
  if(result?.state!=='COMPLETE'||!result.targetIdJson)continue;
  steps.push({...step,stepId:identity({verify:id,originalStepId:step.stepId}),originalStepId:step.stepId,mode:step.mode==='delete'?'verify-delete':'verify',
   targetIdJson:result.targetIdJson,expectedBodyText:result.materializedBodyText??step.bodyText,expectedRelations:result.materializedRelations??{},expectedAbsentFields:step.removeFields??[],
   originalMode:step.mode});
 }
 return {schema:'stellar-forge.sensorthings-commissioning-native-plan.v1',id,kind:'verify',projectId:original.projectId,target:clone(original.target),
  targetId:original.targetId,sourcePlanId:original.id,createdAt,steps,policy:original.policy};
}
export async function rollbackPlan({store,original,journal,verification,createdAt}){
 if(!verification||verification.kind!=='verify'||verification.sourceJobId!==journal.jobId||verification.state!=='COMPLETE')throw fail('ROLLBACK_VERIFICATION','Select the completed original target verification before preparing compensation.',409);
 const current=JSON.parse((await store.object(verification.journal.sha256)).toString('utf8')),steps=[],issues=[];
 for(let i=0;i<(current.steps??[]).length;i++)if(current.steps[i].record)current.steps[i]=JSON.parse((await store.object(current.steps[i].record.sha256)).toString('utf8'));
 for(const step of [...original.steps].reverse()){
  const previous=journal.steps.find(x=>x.stepId===step.stepId);
  if(previous?.state!=='COMPLETE'||step.mode==='bind')continue;
  const observed=current.steps.find(x=>x.originalStepId===step.stepId),last=observed?.attempts?.filter(x=>x.response?.status>=200&&x.response.status<300).at(-1);
  if(!last||!observed.targetIdJson){issues.push(issue('ROLLBACK_CURRENT_TARGET_MISSING',{sourceKey:step.sourceKey},true));continue;}
  const body=await store.object(last.response.body.sha256);
  if(observed.verification?.matched!==true){issues.push(issue('ROLLBACK_TARGET_CHANGED',{sourceKey:step.sourceKey,differences:observed.verification?.differences??[]},true));continue;}
  const beforeImage={bodyText:body.toString('utf8'),bodySha256:last.response.body.sha256,etag:last.response.headers?.etag??null,response:last.response,
   comparisonFields:Object.keys(cleanBody(step.entityKind,sourceDocument(body)).values),targetRelations:targetRelations(step.entityKind,body.toString('utf8'))};
  if(step.mode==='create'){
   if(!step.marker){issues.push(issue('ROLLBACK_MANAGED_ID_REVIEW',{sourceKey:step.sourceKey,reason:'No metadata marker; exact original create receipt and returned identifier are retained.'}));}
   steps.push({...step,stepId:identity({rollback:original.id,sourceStepId:step.stepId,target:observed.targetIdJson,receipt:last.response.body.sha256}),
    sourceStepId:step.stepId,mode:'delete',targetIdJson:observed.targetIdJson,beforeImage,bodyText:'{}',relations:{}});
  }else if(step.mode==='update'){
   if(!step.beforeImage){issues.push(issue('ROLLBACK_BEFORE_IMAGE_MISSING',{sourceKey:step.sourceKey},true));continue;}
   steps.push({...step,stepId:identity({rollback:original.id,sourceStepId:step.stepId,target:observed.targetIdJson,receipt:last.response.body.sha256}),
    sourceStepId:step.stepId,mode:'restore',targetIdJson:observed.targetIdJson,beforeImage,
    bodyText:exact(cleanBody(step.entityKind,exactParse(step.beforeImage.bodyText)).values),relations:step.beforeImage.targetRelations??{},
    removeFields:Object.keys(cleanBody(step.entityKind,exactParse(beforeImage.bodyText)).values).filter(key=>!Object.hasOwn(cleanBody(step.entityKind,exactParse(step.beforeImage.bodyText)).values,key))});
  }
 }
 const body={schema:'stellar-forge.sensorthings-commissioning-plan.v1',kind:'rollback',projectId:original.projectId,sourceId:original.sourceId,
  sourcePlanId:original.id,sourceJobId:journal.jobId,targetId:original.targetId,targetIdentity:original.targetIdentity,target:clone(original.target),
  mappingId:original.mappingId,mappingSha256:original.mappingSha256,createdAt,counts:{entities:steps.length,delete:steps.filter(x=>x.mode==='delete').length,restore:steps.filter(x=>x.mode==='restore').length,
   blockingIssues:issues.filter(x=>x.blocking).length,reviewIssues:issues.filter(x=>!x.blocking).length},
  issues:issues.map(issueIdentity),steps,policy:{compensation:'Separately reviewed managed-set compensation with current-target/before-image checks; native writes are not a database-wide transaction.'}};
 return {...body,id:identity(body)};
}
