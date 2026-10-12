import { LineageClient } from "../client.mjs";
import { project } from "../model.mjs";
import { readJSON, writeNew, atomicJSON, withDirectoryLock, jsonBytes, sha256, need } from "./io.mjs";
import { validatePlan } from "./plan.mjs";
import { join } from "node:path";
const TERMINAL=new Set(["COMPLETE","FAIL","ABORT"]);
export async function allRecords(client,collection,revision,edition=null) {
  const rows=[];let offset=0,total=null;
  do {
    const result=await client.records({collection,expectedRevision:revision,offset,limit:1000,...(edition?{edition}:{})});
    need(result.revision===revision&&result.collection===collection&&result.offset===offset,"Original record selection changed during paging");
    need(Array.isArray(result.items)&&result.returned===result.items.length,"Record page is incomplete");
    if(total!==null)need(total===result.total,"Record total changed during paging");total=result.total;
    rows.push(...result.items);
    if(result.nextOffset===null){need(rows.length===total,"Terminal record page is incomplete");break;}
    need(Number.isSafeInteger(result.nextOffset)&&result.nextOffset===offset+result.items.length&&result.nextOffset>offset,"Record page made no progress");
    offset=result.nextOffset;
  }while(true);
  return rows;
}
export function connectionClient(plan,{token=null,fetchImpl=globalThis.fetch}={}) {
  validatePlan(plan);
  return new LineageClient(plan.connection.url,{token,fetchImpl,expectedWorkspaceId:plan.connection.workspaceId});
}
export async function liveIdentity(client,plan) {
  const identity=await client.requestJSON("/api/identity");
  need(identity.schema==="commons.openlineage.startup.v1"&&identity.workspaceId===plan.connection.workspaceId,"This server belongs to a different workspace");
  return identity;
}
async function snapshot(client) {
  const metadata=await client.metadata();
  const events=await allRecords(client,"events",metadata.revision);
  const sources=await allRecords(client,"sources",metadata.revision);
  return {metadata,events,sources};
}
export async function beginSession(client,plan,directory,{sessionId="first"}={}) {
  validatePlan(plan);need(/^[A-Za-z0-9_.-]{1,120}$/.test(sessionId),"Use a simple session name");
  return withDirectoryLock(directory,async()=>{
    const sessionPath=join(directory,"session-"+sessionId+".json");
    try {
      const prior=await readJSON(sessionPath);
      need(prior.planSha256===sha256(jsonBytes(plan)),"This session belongs to a different plan");
      return prior;
    }catch(e){if(e.code!=="ENOENT")throw e;}
    await writeNew(join(directory,"plan-"+sha256(jsonBytes(plan))+".json"),jsonBytes(plan));
    const identity=await liveIdentity(client,plan),current=await snapshot(client);
    const session={schema:"commons.openlineage.airflow-session.v1",sessionId,operationId:plan.operationId,
      planSha256:sha256(jsonBytes(plan)),workspaceId:identity.workspaceId,instanceId:identity.instanceId,
      baselineRevision:current.metadata.revision,baselineEventIds:current.events.map(row=>row.id),
      baselineSourceIds:current.sources.map(row=>row.id),startedAt:new Date().toISOString()};
    await writeNew(sessionPath,jsonBytes(session));return session;
  });
}
function nativeAirflow(event) {
  const facets=event.run?.facets??{};
  const facet=facets.airflow??Object.values(facets).find(x=>x&&typeof x==="object"&&x.dagRun&&x.dag);
  return {facet,runId:facet?.dagRun?.run_id??facet?.dagRun?.runId??null,
    logicalDate:facet?.dagRun?.logical_date??facet?.dagRun?.execution_date??null,
    dagId:facet?.dag?.dag_id??facet?.dagRun?.dag_id??null,
    taskId:facet?.task?.task_id??facet?.taskInstance?.task_id??null,
    state:facets.airflowState??Object.values(facets).find(x=>x&&typeof x==="object"&&x.tasksState&&"dagRunState" in x)};
}
function sameDate(a,b){return a&&b&&Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);}
export function reviewEvents(plan,session,current,{execution=null,runIds={}}={}) {
  validatePlan(plan);
  need(session.workspaceId===plan.connection.workspaceId&&session.planSha256===sha256(jsonBytes(plan)),"The original session and plan differ");
  const before=new Set(session.baselineEventIds),newRows=current.events.filter(row=>!before.has(row.id));
  const selected=[],unassigned=[],cohorts=[];
  for(const dag of plan.dags){
    const actualExecution=execution?.runs?.find(x=>x.dagId===dag.dagId&&sameDate(x.logicalDate,dag.logicalDate));
    const actualRunId=runIds[dag.dagId+"\n"+dag.logicalDate]??actualExecution?.runId??actualExecution?.actualRunId??dag.runId??null;
    const candidates=newRows.filter(row=>{
      const event=row.event,info=nativeAirflow(event);
      return event?.job?.namespace===plan.namespace&&(info.dagId!=null?info.dagId===dag.dagId:event.job.name===dag.dagId||event.job.name.startsWith(dag.dagId+"."));
    });
    const rows=candidates.filter(row=>{
      const info=nativeAirflow(row.event);
      if(info.logicalDate!=null&&!sameDate(info.logicalDate,dag.logicalDate))return false;
      return actualRunId?info.runId===actualRunId:sameDate(info.logicalDate,dag.logicalDate);
    });
    const acceptedIds=new Set(rows.map(x=>x.id));
    for(const row of candidates)if(!acceptedIds.has(row.id)&&!unassigned.some(x=>x.id===row.id))unassigned.push(row);
    selected.push(...rows);
    const dagRows=rows.filter(x=>x.event.job.name===dag.dagId).sort((a,b)=>Date.parse(a.event.eventTime)-Date.parse(b.event.eventTime));
    const terminal=[...dagRows].reverse().find(x=>TERMINAL.has(x.event.eventType));
    const states=terminal?nativeAirflow(terminal.event).state:null;
    const declarations=Object.assign({},...dagRows.map(x=>x.event.job?.facets?.airflow?.tasks??{}));
    const taskGroups=new Map();
    for(const row of rows){
      if(row.event.job.name===dag.dagId)continue;
      const info=nativeAirflow(row.event),taskId=info.taskId??row.event.job.name.slice(dag.dagId.length+1);
      const key=JSON.stringify([taskId,row.event.run?.runId]);
      const group=taskGroups.get(key)??{taskId,runId:row.event.run?.runId,eventIds:[],states:[],nativeTaskState:states?.tasksState?.[taskId]??null};
      group.eventIds.push(row.id);group.states.push(row.event.eventType);taskGroups.set(key,group);
    }
    const tasks=[...taskGroups.values()];
    const named=new Set([...(dag.taskIds??[]),...tasks.map(x=>x.taskId),...Object.keys(states?.tasksState??{}),...Object.keys(declarations)]);
    const taskCoverage=[...named].map(taskId=>{
      const runs=tasks.filter(x=>x.taskId===taskId),nativeTaskState=states?.tasksState?.[taskId]??null;
      const declaration=declarations[taskId],emits=declaration?.emits_ol_events??null;
      const noExecution=["skipped","upstream_failed","removed"].includes(nativeTaskState)||emits===false;
      return {taskId,nativeTaskState,emitsOpenLineageEvents:emits,runIds:runs.map(x=>x.runId),
        coverage:runs.length?(runs.every(r=>r.states.some(s=>TERMINAL.has(s)))?"task events complete":"awaiting task terminal"):noExecution?"native DAG state explains absence":"awaiting task or native DAG state"};
    });
    const issues=[];
    if(!rows.length)issues.push("No received event is bound to this exact Airflow run or logical date");
    if(!terminal)issues.push("Native DAG terminal event has not arrived");
    else if(terminal.event.eventType!==dag.expectedTerminal)issues.push("DAG terminal is "+terminal.event.eventType+"; expected "+dag.expectedTerminal);
    if(dag.expectedTerminal==="COMPLETE"&&typeof actualExecution?.nativeProcess?.exitCode==="number"&&actualExecution.nativeProcess.exitCode!==0)issues.push("Original DAG command returned exit "+actualExecution.nativeProcess.exitCode);
    for(const task of taskCoverage)if(task.coverage==="awaiting task or native DAG state"||task.coverage==="awaiting task terminal")issues.push(task.taskId+": inspect the original DAG state and operator emission declaration");
    for(const row of rows)if(row.diagnostics?.length)issues.push(...row.diagnostics.map(x=>row.id+": "+x));
    cohorts.push({dagId:dag.dagId,logicalDate:dag.logicalDate,airflowRunId:actualRunId??nativeAirflow(rows[0]?.event??{}).runId,
      nativeOpenLineageRunIds:[...new Set(rows.map(x=>x.event.run?.runId).filter(Boolean))],
      expectedTerminal:dag.expectedTerminal,terminal:terminal?.event.eventType??null,nativeDagState:states?.dagRunState??null,
      events:rows.length,taskCoverage,taskRuns:tasks,issues});
  }
  const unique=[...new Map(selected.map(row=>[row.id,row])).values()];
  const ids=new Set(unique.map(x=>x.id));
  const sourceRows=current.sources.filter(s=>s.eventIds?.some(id=>ids.has(id)));
  const projection=project({workspaceId:current.metadata.workspaceId,revision:current.metadata.revision,events:unique,editions:[]});
  return {schema:"commons.openlineage.airflow-review.v1",operationId:plan.operationId,sessionId:session.sessionId,
    planSha256:session.planSha256,workspaceId:current.metadata.workspaceId,revision:current.metadata.revision,
    reviewedAt:new Date().toISOString(),namespace:plan.namespace,cohorts,
    sourceIds:sourceRows.map(s=>s.id),eventIds:unique.map(x=>x.id),sources:sourceRows,events:unique,
    projection,unassigned:unassigned.filter(x=>!ids.has(x.id)),
    complete:cohorts.every(x=>x.issues.length===0),
    execution:execution?{schema:execution.schema,operationId:execution.operationId,planSha256:execution.planSha256,runs:execution.runs}:null};
}
export async function captureSession(client,plan,directory,{sessionId="first",title=null,execution=null,runIds={}}={}) {
  return withDirectoryLock(directory,async()=>{
    const session=await readJSON(join(directory,"session-"+sessionId+".json"));
    await liveIdentity(client,plan);
    const finalPath=join(directory,"review-"+sessionId+".json");
    try {const saved=await readJSON(finalPath);need(saved.planSha256===sha256(jsonBytes(plan)),"Saved review belongs to a different plan");return saved;}
    catch(e){if(e.code!=="ENOENT")throw e;}
    if(execution)need(execution.planSha256===session.planSha256&&execution.operationId===plan.operationId,"Native execution is for a different exact plan");
    let current=await snapshot(client);
    let review=reviewEvents(plan,session,current,{execution,runIds});
    if(!review.complete){await atomicJSON(join(directory,"review-"+sessionId+"-current.json"),review);return review;}
    const edition=await client.saveEdition({title:title??plan.title+" / "+sessionId,
      description:"Original Airflow commissioning "+plan.operationId+"; session "+sessionId+"; plan "+session.planSha256,
      operationId:plan.operationId+":airflow-edition:"+sessionId,expectedRevision:current.metadata.revision});
    const frozenEventIds=new Set(edition.edition.eventIds),frozenSourceIds=new Set(edition.edition.sourceIds);
    const frozen={metadata:{...current.metadata,revision:edition.edition.sourceRevision},
      events:current.events.filter(row=>frozenEventIds.has(row.id)),sources:current.sources.filter(row=>frozenSourceIds.has(row.id))};
    review=reviewEvents(plan,session,frozen,{execution,runIds});
    need(review.complete,"The saved edition's original events are not the complete selected cohort; use its original session and plan");
    review={...review,editionId:edition.edition.id,editionRevision:edition.revision};
    await writeNew(finalPath,jsonBytes(review));return review;
  });
}
export async function compareSessions(client,directory,first="first",second="second") {
  const left=await readJSON(join(directory,"review-"+first+".json")),right=await readJSON(join(directory,"review-"+second+".json"));
  need(left.workspaceId===right.workspaceId,"Select two editions of the same workspace");
  need(left.editionId&&right.editionId,"Both full native cohorts must have a saved edition");
  const comparison=await client.compare(left.editionId,right.editionId);
  const result={schema:"commons.openlineage.airflow-comparison.v1",workspaceId:left.workspaceId,
    from:{sessionId:first,editionId:left.editionId,planSha256:left.planSha256},
    to:{sessionId:second,editionId:right.editionId,planSha256:right.planSha256},comparison,
    cohorts:{from:left.cohorts,to:right.cohorts}};
  await writeNew(join(directory,"comparison-"+first+"-"+second+".json"),jsonBytes(result));return result;
}
