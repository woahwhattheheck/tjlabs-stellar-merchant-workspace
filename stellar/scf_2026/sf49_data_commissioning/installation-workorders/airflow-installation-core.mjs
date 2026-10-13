// SPDX-License-Identifier: MIT
/** Original Airflow handover -> complete cohort -> existing commercial Installation. */
import {verifyHandover} from '../../../scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/airflow/handover.mjs';
import {validatePlan} from '../../../scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/airflow/plan.mjs';
import {canonical,sha256} from '../../../scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace/airflow/io.mjs';
import {bindingTemplate,prepareInstallation,renderWorkorder} from './prepare-core.mjs';
export const SELECTION_SCHEMA='stellar-forge.airflow-installation-selection.v1';
export const MAX_HANDOVER_BYTES=128*1024*1024;
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>canonical(a)===canonical(b);
const decoder=new TextDecoder('utf-8',{fatal:true});
const json=raw=>JSON.parse(decoder.decode(raw));
const text=value=>typeof value==='string'&&value.trim().length>0;
const exactKeys=(value,keys,label)=>need(object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),'Use every original '+label+' field: '+keys.join(', '));
const dateEquals=(a,b)=>typeof a==='string'&&typeof b==='string'&&Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);
const key=ref=>canonical([ref.reviewPath,ref.dagId,ref.logicalDate,ref.airflowRunId]);

function readHandover(raw){
  need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=MAX_HANDOVER_BYTES,'Select the complete original Airflow JSON handover within 128 MiB.');
  // This is the maintained native verifier, including full embedded application,
  // object bytes, immutable editions, event bodies and original plan identities.
  json(raw);
  const verified=verifyHandover(raw),members=new Map();
  const add=(path,bytes,kind)=>{need(!members.has(path),'Duplicate original member '+path);members.set(path,{path,bytes:bytes.length,sha256:sha256(bytes),kind,raw:bytes});};
  add('workspace.json',verified.workspaceBytes,'workspace');
  for(const [path,bytes] of verified.operator)add('operator/'+path,bytes,'operator');
  for(const [path,bytes] of verified.documents)add('commissioning/'+path,bytes,'commissioning');
  for(const [path,bytes] of verified.inner.application)add('workspace/application/'+path,bytes,'application');
  for(const [path,bytes] of verified.inner.objects)add('workspace/objects/'+path,bytes,'object');
  const cohort=[],editions=new Set(),seen=new Set();
  for(const [reviewPath,bytes] of [...verified.documents].sort(([a],[b])=>a.localeCompare(b))){
    if(!/^review-/.test(reviewPath)||reviewPath.endsWith('-current.json'))continue;
    const review=json(bytes);
    need(review.schema==='commons.openlineage.airflow-review.v1'&&review.complete===true&&
      review.workspaceId===verified.payload.workspaceId&&text(review.editionId)&&text(review.sessionId)&&
      text(review.namespace)&&Array.isArray(review.cohorts)&&review.cohorts.length>0,
      'Retain each complete original saved Airflow review and its full cohort.');
    const planBytes=verified.documents.get('plan-'+review.planSha256+'.json');
    need(planBytes&&sha256(planBytes)===review.planSha256,'Retain the exact original archived plan for '+reviewPath);
    const plan=json(planBytes);validatePlan(plan);
    need(plan.connection.workspaceId===review.workspaceId&&plan.namespace===review.namespace&&plan.operationId===review.operationId,
      'The original review, namespace, operation and plan must belong together.');
    editions.add(review.editionId);
    const plannedRows=new Set();
    for(const row of review.cohorts){
      need(object(row)&&text(row.dagId)&&text(row.logicalDate)&&
        (row.airflowRunId===null||text(row.airflowRunId))&&Array.isArray(row.taskCoverage)&&
        Array.isArray(row.taskRuns)&&Array.isArray(row.issues),
        'Retain the full native DAG/run/date/task cohort from '+reviewPath);
      const dag=plan.dags.find(item=>item.dagId===row.dagId&&item.logicalDate===row.logicalDate);
      const plannedKey=canonical([row.dagId,row.logicalDate]);
      need(dag&&dag.expectedTerminal===row.expectedTerminal&&!plannedRows.has(plannedKey),'Retain each exact planned DAG/logical date once with its original terminal expectation.');
      plannedRows.add(plannedKey);
      need(row.issues.length===0&&row.terminal===row.expectedTerminal,'A complete original saved review must retain its resolved native terminal and task coverage.');
      const reference={reviewPath,reviewSha256:sha256(bytes),editionId:review.editionId,planSha256:review.planSha256,
        dagId:row.dagId,logicalDate:row.logicalDate,airflowRunId:row.airflowRunId};
      need(!seen.has(key(reference)),'The original review contains a duplicate cohort row.');seen.add(key(reference));
      const runs=review.execution?.runs??[];
      need(Array.isArray(runs),'Retain the original native execution run list.');
      if(review.execution)need(review.execution.operationId===review.operationId&&review.execution.planSha256===review.planSha256,
        'The retained native execution belongs to another original plan.');
      const matching=runs.filter(run=>run.dagId===row.dagId&&dateEquals(run.logicalDate,row.logicalDate)&&
        (row.airflowRunId===null||(run.runId??run.actualRunId??null)===row.airflowRunId));
      need(matching.length<=1,'Select the single original native execution for this DAG/run/date.');
      cohort.push({...copy(row),reference,memberPath:'commissioning/'+reviewPath,sessionId:review.sessionId,
        namespace:review.namespace,complete:review.complete,sourceIds:copy(review.sourceIds),eventIds:copy(review.eventIds),
        sourceScope:'original review',execution:matching.length?copy(matching[0]):null,plan:copy(plan)});
    }
    need(review.cohorts.length===plan.dags.length,'The complete original review must preserve the entire planned cohort.');
  }
  need(editions.size>=2,'Receive two distinct original saved native Airflow editions before customer Installation preparation.');
  const source={schema:'stellar-forge.airflow-installation-source.v1',file:{bytes:raw.length,sha256:verified.sha256},
    package:{schema:verified.payload.schema,workspaceId:verified.payload.workspaceId,revision:verified.payload.revision,
      operationId:verified.payload.operationId,payloadSha256:verified.payloadSha256,
      workspacePackageSha256:verified.inner.packageSha256,operatorFiles:verified.operator.size,
      applicationFiles:verified.inner.application.size,documentFiles:verified.documents.size,objectFiles:verified.inner.objects.size},
    members:[...members.values()].map(({raw,...member})=>member),cohort};
  return {source,members};
}
export function inspectAirflowInstallation(raw){return readHandover(raw).source;}
export function readAirflowInstallationMember(raw,{path,offset=0,limit=16000}={}){
  const {source,members}=readHandover(raw),member=members.get(path);
  need(member,'Select a complete retained member from the original inventory.');
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=32000,'Select a valid original source page.');
  const {raw:bytes,...file}=member;
  let decoded;try{decoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{}
  const utf8=decoded!==undefined,units=utf8?Array.from(decoded):bytes,total=units.length;
  need(offset<=total,'The original member page starts after its end.');
  const end=Math.min(total,offset+limit);
  return {file,encoding:utf8?'utf8':'base64',offset,end,total,nextOffset:end<total?end:null,
    ...(utf8?{text:units.slice(offset,end).join('')}:{base64:bytes.subarray(offset,end).toString('base64')}),source:source.file};
}
function originalCase(seed,caseValue){
  need(object(seed)&&object(seed.source)&&object(caseValue)&&object(caseValue.program)&&Array.isArray(caseValue.sources),
    'Read the complete original case and Workshare seed.');
  need(caseValue.program.id===seed.source.caseId&&caseValue.program.version===seed.source.version&&caseValue.program.planId===seed.source.planId,
    'Receive the current seed and whole case from the same original version and pinned plan.');
}
export function airflowInstallationTemplate({raw,seed,caseValue,profile}){
  const source=inspectAirflowInstallation(raw);originalCase(seed,caseValue);
  const matches=caseValue.sources.filter(row=>row.sha256===source.file.sha256);
  return {selection:{schema:SELECTION_SCHEMA,workspaceId:source.package.workspaceId,
    handover:{sourceId:matches.length===1?matches[0].id:null,...source.file},
    cohort:source.cohort.map(row=>({reference:copy(row.reference),included:true,role:'unassigned',purpose:''}))},
    bindings:bindingTemplate(seed,profile),source};
}
export function prepareAirflowInstallation({raw,seed,caseValue,profile,bindings,selectionRaw,cohortSourceId}){
  const source=inspectAirflowInstallation(raw);originalCase(seed,caseValue);
  need(Buffer.isBuffer(selectionRaw)&&selectionRaw.length>0&&selectionRaw.length<=8*1024*1024,'Attach the complete selected cohort JSON within the ordinary 8 MiB source limit.');
  const selection=json(selectionRaw),cohortFile={sourceId:cohortSourceId,bytes:selectionRaw.length,sha256:sha256(selectionRaw)};
  const cohortAttachment=caseValue.sources.find(row=>row.id===cohortSourceId);
  need(cohortAttachment&&cohortAttachment.sha256===cohortFile.sha256,'Attach these exact complete cohort bytes to the same original case.');
  exactKeys(selection,['schema','workspaceId','handover','cohort'],'Airflow selection');
  need(selection.schema===SELECTION_SCHEMA&&selection.workspaceId===source.package.workspaceId,'Select the original Airflow workspace.');
  exactKeys(selection.handover,['sourceId','bytes','sha256'],'attached handover');
  need(selection.handover.bytes===source.file.bytes&&selection.handover.sha256===source.file.sha256,'The selected full handover bytes changed.');
  const attached=caseValue.sources.find(row=>row.id===selection.handover.sourceId);
  need(attached&&attached.sha256===source.file.sha256,'Attach this exact complete Airflow handover to the same original case.');
  need(Array.isArray(selection.cohort)&&selection.cohort.length===source.cohort.length,'Retain every original DAG/run/date row, including explicitly excluded rows.');
  const originals=new Map(source.cohort.map(row=>[key(row.reference),row])),selected=new Map();
  for(const row of selection.cohort){
    exactKeys(row,['reference','included','role','purpose'],'cohort selection');
    exactKeys(row.reference,['reviewPath','reviewSha256','editionId','planSha256','dagId','logicalDate','airflowRunId'],'original cohort reference');
    need(typeof row.included==='boolean'&&['baseline','corrected','following','other','unassigned'].includes(row.role)&&
      typeof row.purpose==='string'&&row.purpose.trim()&&row.purpose.length<=4000,
      'Give every included or excluded original row its full purpose or exclusion reason.');
    need(!row.included||row.role!=='unassigned','Choose the actual baseline, corrected, following or other role of each included original row.');
    const identity=key(row.reference),original=originals.get(identity);
    need(original&&same(original.reference,row.reference)&&!selected.has(identity),'Select each original cohort exactly once by its complete unchanged reference.');
    selected.set(identity,{...copy(row),source:original});
  }
  need([...selected.values()].some(row=>row.included),'Select a useful complete Airflow cohort.');
  need(object(bindings)&&object(bindings.source)&&object(bindings.receiving),'Use the original complete customer bindings template.');
  const next=copy(bindings);
  for(const section of ['source','receiving']){
    need(Array.isArray(next[section].sourceIds),'Retain the original '+section+' source ID list.');
    next[section].sourceIds=[...new Set([...next[section].sourceIds,attached.id,cohortSourceId])];
  }
  const prepared=prepareInstallation(seed,profile,next);
  need(prepared.document.workshare,'Use the original complete commercial Workshare seed.');
  const snapshot={schema:'stellar-forge.airflow-installation-cohort.v1',workspaceId:source.package.workspaceId,
    originalCase:copy(seed.source),handover:copy(selection.handover),selectedCohortSource:cohortFile,
    package:copy(source.package),entireEdition:{members:source.members.length,cohort:source.cohort.length,
      nativeEditions:[...new Set(source.cohort.map(row=>row.reference.editionId))]},
    cohort:[...selected.values()],
    acceptance:'Original native states, terminal expectations, task coverage and execution remain source observations. Installation acceptance is an attributed decision against the selected source and original commercial checks.'};
  return {schema:'stellar-forge.airflow-installation-preparation.v1',prepared,source,snapshot,bindings:next,workorder:renderWorkorder(prepared)};
}
