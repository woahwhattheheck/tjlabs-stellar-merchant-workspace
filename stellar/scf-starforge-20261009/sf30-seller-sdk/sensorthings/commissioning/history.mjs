// MIT. Project history inside the original SensorThings workspace transaction.
import {identity,stable,clone,hash,plain,fail,statePart,ensureState,find} from './common.mjs';
export const TABLES=Object.freeze(['sources','targets','mappings','plans','reviews','jobs']);
const IMMUTABLE=new Set(['sources','targets','mappings','plans','reviews']);
export function projectHead(project){
 return {id:project.id,originWorkspaceId:project.originWorkspaceId,label:project.label,description:project.description,
  createdAt:project.createdAt,updatedAt:project.updatedAt,sequence:project.sequence,headHash:project.headHash};
}
export function appendEvent(state,projectId,{operationId,action,createdAt,changes=[],details={}},create=null){
 const part=ensureState(state);let project=part.projects.find(x=>x.id===projectId);
 if(!project){
  if(!create)throw fail('PROJECT','The original commissioning project is unavailable.',409);
  project={...clone(create),sequence:0,headHash:null,updatedAt:create.createdAt,history:[]};
  part.projects.push(project);
 }
 const prior=project.history.find(x=>x.operationId===operationId&&x.action===action);
 if(prior){
  if(stable(prior.changes)!==stable(changes)||stable(prior.details)!==stable(details))throw fail('HISTORY_REPLAY','The original project event has another result.',409);
  return prior;
 }
 for(const change of changes){
  if(!TABLES.includes(change.table)||!plain(change.record)||change.record.projectId!==projectId)throw fail('HISTORY_CHANGE','A project event has an invalid record.',409);
  hash(change.record.id,'project record');const values=part[change.table],index=values.findIndex(x=>x.id===change.record.id);
  if(index>=0){
   if(values[index].projectId!==projectId)throw fail('HISTORY_SCOPE','The record belongs to another project.',409);
   if(IMMUTABLE.has(change.table)&&stable(values[index])!==stable(change.record))throw fail('IMMUTABLE_RECORD','The immutable project record changed.',409);
   values[index]=clone(change.record);
  }else values.push(clone(change.record));
 }
 const body={projectId,sequence:project.sequence+1,previousHash:project.headHash,operationId,action,createdAt,changes:clone(changes),details:clone(details)},
  event={...body,hash:identity(body)};
 project.history.push(event);project.sequence=event.sequence;project.headHash=event.hash;project.updatedAt=createdAt;return event;
}
export function snapshotProject(state,id){
 const part=statePart(state),project=find(state,'projects',hash(id));
 return {schema:'stellar-forge.sensorthings-commissioning-project.v1',project:clone(project),
  tables:Object.fromEntries(TABLES.map(table=>[table,clone(part[table].filter(x=>x.projectId===id))]))};
}
export function validateProject(snapshot){
 if(snapshot?.schema!=='stellar-forge.sensorthings-commissioning-project.v1'||!plain(snapshot.project)||!plain(snapshot.tables))throw fail('PROJECT_PACKAGE','Select a complete commissioning project.',409);
 const p=snapshot.project;hash(p.id,'project');if(typeof p.originWorkspaceId!=='string'||!Array.isArray(p.history)||p.history.length>100000)throw fail('PROJECT_HISTORY','The complete original history is required.',409);
 const tables=Object.fromEntries(TABLES.map(x=>[x,new Map()]));let previous=null,sequence=0;const operations=new Set();
 for(const event of p.history){
  const {hash:claimed,...body}=event;
  if(identity(body)!==claimed||event.projectId!==p.id||event.sequence!==++sequence||event.previousHash!==previous||
     typeof event.operationId!=='string'||typeof event.action!=='string'||!Array.isArray(event.changes)||!plain(event.details))
   throw fail('PROJECT_HISTORY','The project history chain or event identity differs.',409);
  const op=event.operationId+'\u0000'+event.action;if(operations.has(op))throw fail('PROJECT_HISTORY','The history repeats an operation result.',409);operations.add(op);
  for(const change of event.changes){
   if(!TABLES.includes(change.table)||!plain(change.record)||change.record.projectId!==p.id)throw fail('PROJECT_HISTORY','A retained event has another project record.',409);
   hash(change.record.id);const old=tables[change.table].get(change.record.id);
   if(old&&IMMUTABLE.has(change.table)&&stable(old)!==stable(change.record))throw fail('PROJECT_HISTORY','An immutable historical record was replaced.',409);
   tables[change.table].set(change.record.id,change.record);
  }
  previous=claimed;
 }
 if(!sequence||p.sequence!==sequence||p.headHash!==previous||p.updatedAt!==p.history.at(-1).createdAt)throw fail('PROJECT_HISTORY','The declared project head differs from its complete history.',409);
 for(const table of TABLES){
  const rows=snapshot.tables[table];if(!Array.isArray(rows)||new Set(rows.map(x=>x.id)).size!==rows.length||rows.some(x=>x.projectId!==p.id))throw fail('PROJECT_TABLE','The project table is missing or repeats a record.',409);
  const ordered=x=>[...x].sort((a,b)=>a.id.localeCompare(b.id));
  if(stable(ordered(rows))!==stable(ordered(tables[table].values())))throw fail('PROJECT_TABLE','The current table does not equal its retained history.',409);
 }
 const all=table=>new Map(snapshot.tables[table].map(x=>[x.id,x]));
 const sources=all('sources'),targets=all('targets'),mappings=all('mappings'),plans=all('plans'),jobs=all('jobs');
 for(const m of mappings.values())if(!sources.has(m.sourceId)||!targets.has(m.targetId))throw fail('PROJECT_BINDING','A mapping omits its source or target.',409);
 for(const plan of plans.values())if(!targets.has(plan.targetId)||plan.sourceId&&!sources.has(plan.sourceId)||plan.mappingId&&!mappings.has(plan.mappingId))throw fail('PROJECT_BINDING','A plan omits its original source, target or mapping.',409);
 for(const review of snapshot.tables.reviews)if(review.planId&&!plans.has(review.planId)||review.jobId&&!jobs.has(review.jobId))throw fail('PROJECT_BINDING','A review omits its selected plan or job.',409);
 for(const job of jobs.values())if(!targets.has(job.targetId)||job.planId&&!plans.has(job.planId)||job.sourceJobId&&!jobs.has(job.sourceJobId))throw fail('PROJECT_BINDING','A job omits its original target, plan or source operation.',409);
 return snapshot;
}
export function receivingDisposition(state,snapshot){
 validateProject(snapshot);const incoming=snapshot.project,current=statePart(state).projects.find(x=>x.id===incoming.id);
 if(!current)return 'received';
 if(current.originWorkspaceId!==incoming.originWorkspaceId)throw fail('PROJECT_ORIGIN','The project ID has another original workspace.',409);
 const shared=Math.min(current.history.length,incoming.history.length);
 for(let i=0;i<shared;i++)if(current.history[i].hash!==incoming.history[i].hash)throw fail('PROJECT_DIVERGED','These project histories diverge. Receive this package in a separate private workspace.',409);
 return current.sequence<incoming.sequence?'advanced':current.sequence===incoming.sequence?'repeated':'preserved-later';
}
export function adoptProject(state,snapshot){
 const disposition=receivingDisposition(state,snapshot);if(['repeated','preserved-later'].includes(disposition))return disposition;
 const part=ensureState(state),id=snapshot.project.id,index=part.projects.findIndex(x=>x.id===id);
 if(index<0)part.projects.push(clone(snapshot.project));else part.projects[index]=clone(snapshot.project);
 for(const table of TABLES){part[table]=part[table].filter(x=>x.projectId!==id);part[table].push(...clone(snapshot.tables[table]));}
 part.local??={receivedJobs:{},bindings:{}};
 for(const job of snapshot.tables.jobs)if(!part.local.bindings[job.id])part.local.receivedJobs[job.id]=true;
 return disposition;
}
