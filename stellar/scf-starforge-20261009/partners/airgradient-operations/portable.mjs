// SPDX-License-Identifier: MIT
import {need,encoded,digest,sha,envelope,verifyEnvelope,canonical,MAX_PACKAGE,MAX_BODY,normalizeProject,period,now} from './contract.mjs';
import {verifyConnection,acquisitionTasks,normalizeCapture} from './source.mjs';
import {reviewReport} from './analysis.mjs';
import {readDeliveryZip} from './exports.mjs';

function reportTasks(report,plan){
 const captures=new Map(report.sources.map(c=>[c.taskKey,c])),issues=new Map(report.issues.map(x=>[x.task,x]));
 return plan.tasks.map(task=>{const capture=captures.get(task.key),issue=issues.get(task.key);
  return {plan_id:plan.id,task_key:task.key,status:capture?'COMPLETE':issue?.status??'PENDING',capture_id:capture?.id??null,error:issue?.code??null};
 });
}
export function createHandover(store,root){
 const reports=new Map(),plans=new Map(),projects=new Map(),connections=new Map(),captures=new Map(),visiting=new Set();
 function capture(id){if(captures.has(id))return captures.get(id);const c=store.capture(id),item={metadata:c.metadata,rawBase64:c.raw.toString('base64')};captures.set(id,item);return item;}
 function project(id){if(projects.has(id))return;const v=store.object('project-revision',id);need(v,'PROJECT_HISTORY_MISSING');projects.set(id,v);if(v.parentId)project(v.parentId);connections.set(v.value.connectionId,store.object('connection',v.value.connectionId));}
 function report(id){
  need(!visiting.has(id),'REPORT_BASELINE_CYCLE');if(reports.has(id))return;visiting.add(id);
  const v=store.object('report',id);need(v,'REPORT_HISTORY_MISSING');if(v.baselineReportId)report(v.baselineReportId);reports.set(id,v);visiting.delete(id);
  const plan=store.object('plan',v.planId);need(plan,'REPORT_PLAN_MISSING');plans.set(plan.id,plan);project(plan.projectId);connections.set(plan.connectionId,store.object('connection',plan.connectionId));
  for(const source of v.sources)need(capture(source.id).metadata.sha256===source.sha256,'FROZEN_SOURCE_CHANGED');
 }
 report(root.id);
 const attempts=[...plans.values()].flatMap(p=>store.attempts(p.id)),taskStates=[...plans.values()].flatMap(p=>store.tasks(p.id));
 for(const attempt of attempts)if(attempt.capture_id)capture(attempt.capture_id);
 for(const task of taskStates)if(task.capture_id)capture(task.capture_id);
 const body={originWorkspaceId:store.workspaceId,rootReportId:root.id,createdAt:root.createdAt,
  reports:[...reports.values()],plans:[...plans.values()],projects:[...projects.values()],connections:[...connections.values()],captures:[...captures.values()],
  attempts,taskStates,
  receivingHistory:store.objects('receiving').filter(v=>reports.has(v.reportId))};
 const result=envelope('handover',{id:'handover_'+digest(body),...body});need(encoded(result).length<=MAX_PACKAGE,'HANDOVER_TOO_LARGE');return result;
}
export function inspectHandover(input){
 if(input instanceof Uint8Array&&!Buffer.isBuffer(input))input=Buffer.from(input);
 if(Buffer.isBuffer(input)&&input.length>=4&&input.readUInt32LE(0)===0x04034b50)input=readDeliveryZip(input);
 const value=Buffer.isBuffer(input)?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input)):input;
 need(encoded(value).length<=MAX_PACKAGE,'HANDOVER_TOO_LARGE');verifyEnvelope(value,'handover');
 const map=(array,kind)=>{need(Array.isArray(array),'HANDOVER_COLLECTION_REQUIRED');const result=new Map();for(const v of array){verifyEnvelope(v,kind);need(!result.has(v.id),'DUPLICATE_HANDOVER_OBJECT');result.set(v.id,v);}return result;};
 const connections=map(value.connections,'connection'),projects=map(value.projects,'project-revision'),plans=map(value.plans,'plan'),reports=map(value.reports,'report');
 for(const connection of connections.values())verifyConnection(connection);
 const captures=new Map();need(Array.isArray(value.captures),'CAPTURES_REQUIRED');let total=0;
 for(const item of value.captures){
  verifyEnvelope(item.metadata,'capture');need(!captures.has(item.metadata.id)&&Number.isInteger(item.metadata.status)&&item.metadata.status>=100&&item.metadata.status<=599,'INVALID_HANDOVER_CAPTURE');
  need(typeof item.rawBase64==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.rawBase64),'INVALID_CAPTURE_ENCODING');
  const raw=Buffer.from(item.rawBase64,'base64');total+=raw.length;need(total<=MAX_PACKAGE&&raw.length<=MAX_BODY&&raw.length===item.metadata.bytes&&sha(raw)===item.metadata.rawSha256,'CAPTURE_BYTES_CHANGED');captures.set(item.metadata.id,{metadata:item.metadata,raw});
 }
 for(const project of projects.values()){
  need(canonical(normalizeProject(project.value))===canonical(project.value),'PROJECT_SELECTION_CHANGED');need(connections.has(project.value.connectionId),'PROJECT_CONNECTION_MISSING');let current=project,seen=new Set();
  while(current.parentId){need(!seen.has(current.id),'PROJECT_HISTORY_CYCLE');seen.add(current.id);current=projects.get(current.parentId);need(current,'PROJECT_HISTORY_MISSING');}
 }
 for(const plan of plans.values()){
  need(canonical(period(plan.period,plan.period.bucket))===canonical(plan.period),'PLAN_PERIOD_CHANGED');
  const project=projects.get(plan.projectId),connection=connections.get(plan.connectionId);need(project&&connection&&connection.sha256===plan.connectionSha256,'PLAN_BINDING_CHANGED');
  need(canonical(acquisitionTasks(project.value,plan.period,connection))===canonical(plan.tasks),'PLAN_REQUESTS_CHANGED');
 }
 for(const {metadata}of captures.values()){
  const plan=plans.get(metadata.planId),task=plan?.tasks.find(t=>t.key===metadata.taskKey);
  need(task&&metadata.requestSha256===task.requestSha256&&metadata.connectionSha256===plan.connectionSha256&&metadata.sourceUrl===task.url,'CAPTURE_PLAN_CHANGED');
  need(Number.isFinite(Date.parse(metadata.retrievedAt))&&typeof metadata.attemptId==='string','CAPTURE_ATTEMPT_REQUIRED');
 }
 const checked=new Set(),visiting=new Set();
 function checkReport(id){
  need(!visiting.has(id),'REPORT_BASELINE_CYCLE');if(checked.has(id))return;const report=reports.get(id);need(report,'REPORT_HISTORY_MISSING');visiting.add(id);
  if(report.baselineReportId)checkReport(report.baselineReportId);
  const plan=plans.get(report.planId);need(plan,'REPORT_PLAN_MISSING');const connection=connections.get(plan.connectionId),project=projects.get(plan.projectId);
  const review=reviewReport({plan,project,connection,tasks:reportTasks(report,plan),captures:id=>{const v=captures.get(id);need(v,'REPORT_SOURCE_MISSING');return v;},baseline:report.baselineReportId?reports.get(report.baselineReportId):null});
  need(review.reviewSha256===report.reviewSha256&&report.id==='report_'+review.reviewSha256,'RECEIVED_REPORT_INTERPRETATION_CHANGED');
  const rebuilt=envelope('report',{...review,schema:'stellar-forge.airgradient-report.v1',id:report.id,createdAt:report.createdAt});need(rebuilt.sha256===report.sha256,'RECEIVED_REPORT_CHANGED');
  visiting.delete(id);checked.add(id);
 }
 for(const id of reports.keys())checkReport(id);
 need(reports.has(value.rootReportId),'ROOT_REPORT_MISSING');need(Array.isArray(value.attempts)&&Array.isArray(value.receivingHistory),'HANDOVER_HISTORY_REQUIRED');
 for(const v of value.receivingHistory)verifyEnvelope(v,'receiving');
 const attempts=new Map();
 for(const attempt of value.attempts){
  need(plans.has(attempt.plan_id)&&typeof attempt.id==='string'&&!attempts.has(attempt.id)&&typeof attempt.task_key==='string'&&plans.get(attempt.plan_id).tasks.some(t=>t.key===attempt.task_key),'ATTEMPT_PLAN_CHANGED');
  need(Number.isFinite(Date.parse(attempt.started_at))&&(attempt.finished_at===null||Number.isFinite(Date.parse(attempt.finished_at)))&&
   (attempt.status===null||Number.isInteger(attempt.status)&&attempt.status>=100&&attempt.status<=599)&&(attempt.error===null||typeof attempt.error==='string'),'ATTEMPT_HISTORY_CHANGED');
  if(attempt.capture_id!==null){const capture=captures.get(attempt.capture_id);need(capture&&capture.metadata.attemptId===attempt.id&&capture.metadata.planId===attempt.plan_id&&capture.metadata.taskKey===attempt.task_key&&capture.metadata.status===attempt.status,'ATTEMPT_CAPTURE_CHANGED');}
  attempts.set(attempt.id,attempt);
 }
 for(const {metadata}of captures.values()){const attempt=attempts.get(metadata.attemptId);need(attempt&&attempt.capture_id===metadata.id,'CAPTURE_ATTEMPT_MISSING');}
 need(Array.isArray(value.taskStates),'HANDOVER_TASK_STATES_REQUIRED');const taskStates=new Map();
 for(const task of value.taskStates){
  const plan=plans.get(task.plan_id),request=plan?.tasks.find(t=>t.key===task.task_key),key=JSON.stringify([task.plan_id,task.task_key]);
  need(request&&!taskStates.has(key)&&['PENDING','RUNNING','FAILED','COMPLETE','INTERRUPTED'].includes(task.status)&&Number.isFinite(Date.parse(task.updated_at))&&(task.error===null||typeof task.error==='string'),'HANDOVER_TASK_STATE_CHANGED');
  const capture=task.capture_id===null?null:captures.get(task.capture_id);
  if(task.capture_id!==null)need(capture&&capture.metadata.planId===plan.id&&capture.metadata.taskKey===request.key,'TASK_CAPTURE_CHANGED');
  if(task.status==='COMPLETE'){need(capture&&capture.metadata.status===200,'COMPLETE_TASK_SOURCE_REQUIRED');normalizeCapture(capture.raw,request,connections.get(plan.connectionId),plan.period);}
  taskStates.set(key,task);
 }
 need(taskStates.size===[...plans.values()].reduce((count,plan)=>count+plan.tasks.length,0),'HANDOVER_TASK_STATES_INCOMPLETE');
 const root=reports.get(value.rootReportId);
 return {value,root,connections,projects,plans,reports,captures,taskStates,summary:{packageId:value.id,packageSha256:value.sha256,reportId:root.id,title:root.title,organisation:root.organisation,period:root.period,
  reports:reports.size,projects:projects.size,plans:plans.size,captures:captures.size,sourceBytes:total,rows:root.rows,readiness:root.readiness}};
}
export function receiveHandover(store,input){
 const inspected=inspectHandover(input),value=inspected.value,receiptId='receiving_'+value.sha256;
 const existing=store.object('receiving',receiptId);if(existing)return existing;
 return store.transaction(()=>{
  for(const [kind,values]of [['connection',inspected.connections],['project-revision',inspected.projects],['plan',inspected.plans],['report',inspected.reports]])for(const v of values.values())store.put(kind,v);
  for(const c of inspected.captures.values())store.putCapture(c.metadata,c.raw);
  for(const v of value.receivingHistory)store.put('receiving',v);
  for(const attempt of value.attempts)store.importAttempt(attempt);
  for(const task of inspected.taskStates.values()){
   const local=store.task(task.plan_id,task.task_key);
   if(local&&(local.status==='COMPLETE'||local.status==='RUNNING'||Date.parse(local.updated_at)>Date.parse(task.updated_at)||local.updated_at===task.updated_at&&task.status!=='COMPLETE'))continue;
   store.setTask(task.plan_id,task.task_key,task.status==='RUNNING'?'INTERRUPTED':task.status,{captureId:task.capture_id,error:task.status==='RUNNING'?'ACQUISITION_INTERRUPTED':task.error,updatedAt:task.updated_at});
  }
  for(const {metadata}of inspected.captures.values()){
   if(![429,503].includes(metadata.status)||!metadata.retryAt||Date.parse(metadata.retryAt)<=Date.now())continue;
   const origin=inspected.connections.get(inspected.plans.get(metadata.planId).connectionId).origin,key='provider_retry_at:'+origin,old=store.meta(key);
   if(!old||Date.parse(old)<Date.parse(metadata.retryAt))store.setMeta(key,metadata.retryAt);
  }
  const root=inspected.root,project=inspected.plans.get(root.planId).projectId;if(!store.meta('current_project'))store.setMeta('current_project',project);
  return store.put('receiving',envelope('receiving',{id:receiptId,receivedAt:now(),workspaceId:store.workspaceId,originWorkspaceId:value.originWorkspaceId,packageId:value.id,packageSha256:value.sha256,
   reportId:root.id,reportSha256:root.sha256,projectId:project,sourceBytes:inspected.summary.sourceBytes,captures:inspected.summary.captures}));
 });
}
