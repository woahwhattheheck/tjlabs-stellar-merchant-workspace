'use strict';
function createCrmWorkspace(deps){
"use strict";
const base=deps.migration,comparison=deps.comparison,clone=x=>JSON.parse(JSON.stringify(x)),hash=comparison.digest,fail=m=>{throw Error(m)},ident=v=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(v),now=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace(".000Z","Z")===v.replace(".000Z","Z");
function create(id,title){if(!ident(id)||typeof title!=="string"||!title.trim())fail("Workspace identifier and title required");return{schema:"crm-migration.workspace.v1",id,title,revision:0,sourceWorkspace:base.create(id,title),contracts:{},runs:{},operations:[]};}
function tables(ws,contract){
 const ids=new Set();for(const o of contract.objects){ids.add(o.sourceTable);ids.add(o.targetTable);if(o.match.mode==="crosswalk")ids.add(o.match.table);}for(const a of contract.associations){ids.add(a.sourceTable);ids.add(a.targetTable);}
 return Object.fromEntries([...ids].map(id=>{const s=ws.sourceWorkspace.sources[id];if(!s)fail("Required original source missing: "+id);return[id,comparison.parseCSV(s.content)];}));
}
function applyUnchecked(ws,op){
 if(!op||!ident(op.id)||typeof op.actor!=="string"||!op.actor.trim()||!now(op.at))fail("Operation needs an ID, named actor and real UTC timestamp");
 const earlier=ws.operations.find(x=>x.id===op.id);if(earlier){if(hash(earlier.request)!==hash(op))fail("Operation ID already used with different content");return clone(ws);}
 if(op.expected_revision!==ws.revision)fail("Workspace has changed; reopen the current saved copy");
 const next=clone(ws),p=op.payload||{};let result;
 if(op.kind==="ingest"){
  const sr=base.apply(next.sourceWorkspace,{id:op.id,actor:op.actor,at:op.at,expected_revision:next.sourceWorkspace.revision,action:"ingest",payload:p});
  comparison.parseCSV(p.content);next.sourceWorkspace=sr.state;result=sr.result;
 }else if(op.kind==="configure"){
  if(!ident(p.id)||next.contracts[p.id])fail("Use a new configuration edition ID");
  const c=comparison.validateContract(p.contract);tables(next,c);next.contracts[p.id]={id:p.id,title:p.title||p.id,contract:c,at:op.at,actor:op.actor};result={contract_id:p.id,sha256:hash(c)};
 }else if(op.kind==="compare"){
  if(!ident(p.id)||next.runs[p.id]||!next.contracts[p.contract_id])fail("Use a new run ID and existing contract");
  const c=next.contracts[p.contract_id],output=comparison.compare(c.contract,tables(next,c.contract));
  next.runs[p.id]={id:p.id,title:p.title||p.id,contract_id:p.contract_id,output,at:op.at,actor:op.actor,reviews:[],decision:null};result={run_id:p.id,findings:output.findings.length,sha256:output.sha256};
 }else if(op.kind==="review"){
  const run=next.runs[p.run_id];if(!run||run.decision)fail("Select an open comparison");
  if(!run.output.findings.some(x=>x.id===p.finding_id))fail("Finding absent from this exact comparison");
  if(!["needs_correction","accepted_exception","not_applicable"].includes(p.disposition)||typeof p.reason!=="string"||!p.reason.trim())fail("Choose a disposition and enter its reason");
  run.reviews.push({finding_id:p.finding_id,disposition:p.disposition,reason:p.reason,actor:op.actor,at:op.at,operation_id:op.id});result={run_id:p.run_id,reviews:run.reviews.length};
 }else if(op.kind==="decide"){
  const run=next.runs[p.run_id];if(!run||run.decision)fail("Select an open comparison");if(!["ready","accepted_with_exceptions","needs_correction"].includes(p.status)||typeof p.reason!=="string"||!p.reason.trim())fail("Choose a decision and explain it");
  const reviews=new Map(run.reviews.map(r=>[r.finding_id,r]));
  if(p.status==="ready"&&run.output.findings.length)fail("Findings remain; prepare a corrected comparison or review explicit exceptions");
  if(p.status==="accepted_with_exceptions"&&(!run.output.findings.length||run.output.findings.some(f=>!reviews.has(f.id)||reviews.get(f.id).disposition==="needs_correction")))fail("Every finding needs a reasoned exception disposition");
  run.decision={status:p.status,reason:p.reason,actor:op.actor,at:op.at,operation_id:op.id};result={run_id:p.run_id,status:p.status};
 }else fail("Unsupported operation "+op.kind);
 next.revision++;next.operations.push({id:op.id,request:clone(op),result,revision:next.revision});return next;
}
function apply(ws,op){if(ws?.schema!=="crm-migration.workspace.v1")fail("Select a CRM migration workspace");return applyUnchecked(ws,op);}
function validate(ws){
 if(ws?.schema!=="crm-migration.workspace.v1"||!Array.isArray(ws.operations)||ws.revision!==ws.operations.length)fail("Invalid workspace schema or revision");
 let replay=create(ws.id,ws.title);for(const event of ws.operations){replay=applyUnchecked(replay,event.request);if(hash(replay.operations.at(-1))!==hash(event))fail("Retained operation differs from replay");}
 if(hash(replay)!==hash(ws))fail("Saved workspace differs from complete original-source replay");
 return clone(ws);
}
function archive(ws){validate(ws);return{schema:"crm-migration.archive.v1",sha256:hash(ws),workspace:clone(ws)};}
function restore(a){if(a?.schema!=="crm-migration.archive.v1"||hash(a.workspace)!==a.sha256)fail("Saved copy identity differs");return validate(a.workspace);}
function findingCSV(ws,runId){
 const run=ws.runs[runId];if(!run)fail("Select a comparison");const reviews=new Map(run.reviews.map(r=>[r.finding_id,r]));
 const fields=["finding_id","object","record","code","field","expected","actual","detail","original_rows","reviewer","disposition","reason"];
 const clean=v=>{const s=String(v??"");return /^(?:\s*[=+\-@]|[\t\r])/.test(s)?"'"+s:s;};
 const rows=run.output.findings.map(f=>{const r=reviews.get(f.id)||{};return Object.fromEntries(fields.map(k=>[k,clean(({finding_id:f.id,object:f.object,record:f.record,code:f.code,field:f.field,expected:typeof f.expected==="object"?JSON.stringify(f.expected):f.expected,actual:typeof f.actual==="object"?JSON.stringify(f.actual):f.actual,detail:f.detail,original_rows:f.refs.map(x=>x.table+":"+x.row).join(";"),reviewer:r.actor,disposition:r.disposition,reason:r.reason})[k])]))});
 return comparison.csv(fields,rows);
}
return {create,apply,validate,archive,restore,tables,findingCSV};
}
module.exports={createCrmWorkspace};
