// MIT. Receive the complete original DataRunner desk handover into Source Tables.
import {applyProgramme,openProgramme,programmeIdentity} from './programme.mjs';
import {sha256} from '../../../stellar-forge/developer-site/dist/source-table-workspace.mjs';

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function canonical(x){if(x===null||typeof x==='string'||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x))return JSON.stringify(x);if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';fail('DESK_JSON','Use complete JSON source.');}
function file(f){if(!object(f)||typeof f.filename!=='string')fail('DESK_FILE','Retain the complete named original file.');const parts=f.filename.split('/');if(parts.some(x=>!x||x==='.'||x==='..')||f.filename.includes('\\'))fail('DESK_FILE','Use the original ordinary relative filename.');return {...clone(f),filename:parts.at(-1)};}
function currentDefinition(h,r){if(!object(h.project))fail('DESK_PROJECT','Retain the complete original reporting desk project.');const p=h.project;return {id:r.id,title:r.title,meaning:r.meaning,parameters:r.id==='stock-at-reorder-point'?{}:{as_of:p.source_as_of},calendar:{status:r.saved_schedule?'configured':'proposed',timezone:p.timezone,expression:r.cron,rule:r.date_rule,...(r.saved_schedule?{nativeScheduleId:r.saved_schedule}:{})},sourceDescription:[p.source_reference,p.source_as_of?'source date '+p.source_as_of:'',p.connection_label?'connection '+p.connection_label:''].filter(Boolean).join(' | '),query:{filename:r.id+'.sql',encoding:'utf8',content:r.sql,mediaType:'application/sql'}};}
async function definitionMatches(p,stored,wanted){const {query,...value}=wanted;const original=p.files.find(f=>f.sha256===stored.query.sha256&&f.filename===stored.query.filename);return original&&canonical(stored.value)===canonical(value)&&original.filename===file(query).filename&&original.encoding===(query.encoding||'utf8')&&original.content===query.content&&original.mediaType===(query.mediaType||'application/octet-stream');}

/** Atomic in-memory receive. Persist only the returned complete project. */
export async function receiveDeskHandover(input,source,context){
 const sourceText=typeof source==='string'?source:JSON.stringify(source,null,2)+'\n';let h;try{h=typeof source==='string'?JSON.parse(source):clone(source);}catch{fail('DESK_JSON','Open the complete desk handover JSON.');}
 if(!object(h)||h.version!=='datarunner.report-handover.v2'||typeof h.source_id!=='string'||!h.source_id.trim()||!Array.isArray(h.reports)||!h.reports.length)fail('DESK_SCHEMA','Receive a complete v2 DataRunner handover.');
 if(!object(context)||typeof context.operationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(context.operationId)||typeof context.actor!=='string'||!context.actor.trim()||typeof context.at!=='string')fail('DESK_CONTEXT','Supply stable operationId, actual at and recording actor.');
 const fullHash=await sha256(sourceText),base={at:context.at,actor:context.actor};
 const finalRequest={...base,operationId:context.operationId,kind:'source',input:{description:'Complete original DataRunner desk handover '+h.source_id,context:clone(context),sourceId:h.source_id,files:[{filename:'datarunner-handover-'+fullHash.slice(0,16)+'.json',encoding:'utf8',content:sourceText,mediaType:'application/json',sha256:fullHash}]}};
 let project=input?await openProgramme(input):null;
 if(project?.reportingProgramme.operations.some(o=>o.id===context.operationId))return applyProgramme(project,finalRequest);
 if(project&&context.expectedProjectSha256&&(await programmeIdentity(project)).projectSha256!==context.expectedProjectSha256)fail('PROJECT_CONFLICT','The selected project changed before desk receiving.');
 const reportIds=new Set(),records=[];
 for(const r of h.reports){if(!object(r)||reportIds.has(r.id)||!Array.isArray(r.runs))fail('DESK_REPORT','Keep distinct complete original reports and run arrays.');reportIds.add(r.id);
  for(const run of r.runs){const x=run.snapshot;if(!object(x)||!object(x.definition)||x.definition.id!==r.id||!object(x.provider)||x.provider.runId!==run.id||x.provider.queryVersion!==run.query_version)fail('DESK_RUN','The original run/definition/provider identities differ.');if(typeof run.started_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(run.started_at)||!Number.isFinite(Date.parse(run.started_at)))fail('DESK_RUN','Retain the actual provider start timestamp.');const {sha256:digest,...body}=x;if(digest!==await sha256(JSON.stringify(body)))fail('DESK_SNAPSHOT','The complete original run snapshot changed.');
   if(!['success','failed','truncated'].includes(run.status))fail('DESK_RUN','Retain the original success, failure or truncation status.');
   if(run.status==='success'&&!x.result)fail('DESK_RESULT','The complete successful result is required.');
   if(x.result&&(run.output_name!==x.result.filename||run.output_sha256!==x.result.sha256||run.output_bytes!==x.result.bytes))fail('DESK_RESULT','Run metadata differs from the selected complete result.');
   if(!Array.isArray(x.files))fail('DESK_FILES','Retain the complete original run file array.');
   records.push({report:r,run,snapshot:x});
  }
 }
 const prefix='desk-'+(await sha256(context.operationId)).slice(0,32);let step=0;
 async function apply(kind,value){const result=await applyProgramme(project,{...base,operationId:prefix+'-'+(++step),kind,input:value});project=result.project;return result;}
 if(!project){const definitions=h.reports.map(r=>{const first=records.find(x=>x.report.id===r.id);return first?{...clone(first.snapshot.definition),query:file(first.snapshot.definition.query)}:currentDefinition(h,r);});await apply('create',{id:'datarunner-'+(await sha256(h.source_id)).slice(0,32),label:('DataRunner '+(h.project?.customer||'reporting programme')).slice(0,200),reports:definitions,...(context.starter?{starter:context.starter}:{})});}
 async function selectDefinition(value,current=false){value={...clone(value),query:file(value.query)};const p=project.reportingProgramme,list=p.definitions.filter(d=>d.id===value.id);if(current){const last=list.at(-1);if(last&&await definitionMatches(p,last,value))return last;}else for(const d of list)if(await definitionMatches(p,d,value))return d;await apply('define',value);return project.reportingProgramme.definitions.filter(d=>d.id===value.id).at(-1);}
 for(const {report,run,snapshot:x}of records){
  const id='desk-run-'+(await sha256(h.source_id+'\n'+report.id+'\n'+run.id)).slice(0,40),runHash=await sha256(JSON.stringify(run)),old=project.reportingProgramme.runs.find(r=>r.id===id);
  if(old){if(old.deskSource?.sourceId!==h.source_id||old.deskSource?.originalRecordSha256!==runHash)fail('DESK_RUN_CONFLICT','An already retained original desk run has different full source.');continue;}
  const definition=await selectDefinition(x.definition),value={id,reportId:report.id,definitionSha256:definition.sha256,status:run.status==='success'?'complete':run.status,provider:{...clone(x.provider),startedAt:run.started_at},period:clone(x.period),parameters:clone(x.parameters),sourceSnapshot:x.sourceSnapshot,reportedRows:run.rows,notes:run.note||'',files:x.files.map(file),deskSource:{sourceId:h.source_id,originalRunId:run.id,originalRecordSha256:runHash,snapshotSha256:x.sha256,recipientDeclaration:run.recipient_result,recipients:clone(x.recipients),originalFilePaths:x.files.map(f=>f.filename)}};
  if(x.result)value.result=file(x.result);await apply('run',value);
 }
 // Historical runs keep their original definitions; the last definition remains
 // the desk's current preparation, even when later edits have no actual run yet.
 for(const report of h.reports)await selectDefinition(currentDefinition(h,report),true);
 const result=await applyProgramme(project,finalRequest);return {...result,sourceSha256:fullHash,receivedRuns:records.length};
}
