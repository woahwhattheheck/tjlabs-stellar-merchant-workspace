// MIT. Browser custody and request construction for the unchanged reporting engine.
import {openProgramme,applyProgramme,programmeIdentity,exportProgramme} from './programme.mjs';
import {receiveDeskHandover} from './desk-receive.mjs';
export const WORKBENCH_SCHEMA='stellar-forge.reporting-workbench.v1';
export const clone=value=>JSON.parse(JSON.stringify(value));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function freshDrafts(){return {
 definition:{id:'',title:'',meaning:'',parameters:'{}',sourceDescription:'',calendarStatus:'proposed',timezone:'UTC',expression:'',rule:'',nativeScheduleId:'',queryFilename:'report.sql',query:'',queryFile:null},
 run:{id:'',definitionSha256:'',status:'complete',providerRunId:'',queryVersion:'',providerExtra:'{}',period:'{}',parameters:'{}',sourceSnapshot:'',reportedRows:'',notes:'',delimiter:',',header:true,skipEmptyRecords:false,mapping:'',result:null,files:[]},
 delivery:{id:'',runId:'',status:'uncertain',routeId:'',destination:'',predecessorId:'',notes:'',receipt:null},
 source:{description:'',files:[]},
 desk:{file:null},
 create:{id:'',label:'',starter:''}
};}
export function freshWorkbench(){return {schema:WORKBENCH_SCHEMA,project:null,drafts:freshDrafts(),context:{actor:'',operationId:'',at:''},pending:null,heldOperations:[],tab:'definition',selectedFile:'',savedAt:null};}
function jsonObject(text,label){let value;try{value=JSON.parse(text||'{}');}catch{throw Error(label+' must be valid JSON.');}if(!object(value))throw Error(label+' must be a JSON object.');return value;}
function requireFile(file,label){if(!object(file)||typeof file.filename!=='string'||typeof file.content!=='string')throw Error('Choose the complete '+label+'.');return clone(file);}
function definition(d){const calendar={status:d.calendarStatus,timezone:d.timezone,expression:d.expression,rule:d.rule};if(d.nativeScheduleId)calendar.nativeScheduleId=d.nativeScheduleId;return {id:d.id,title:d.title,meaning:d.meaning,parameters:jsonObject(d.parameters,'Parameter template'),sourceDescription:d.sourceDescription,calendar,query:{filename:d.queryFilename,encoding:'utf8',content:d.query,mediaType:'application/sql'}};}
export function definitionDraft(project,sha){const p=project?.reportingProgramme,d=p?.definitions.find(x=>x.sha256===sha);if(!d)throw Error('Select a retained definition.');const file=p.files.find(x=>x.filename===d.query.filename&&x.sha256===d.query.sha256);if(!file)throw Error('The original SQL file is absent.');return {...freshDrafts().definition,id:d.id,title:d.value.title,meaning:d.value.meaning,parameters:JSON.stringify(d.value.parameters,null,2),sourceDescription:d.value.sourceDescription,calendarStatus:d.value.calendar.status,timezone:d.value.calendar.timezone,expression:d.value.calendar.expression||'',rule:d.value.calendar.rule,nativeScheduleId:d.value.calendar.nativeScheduleId||'',queryFilename:file.filename,query:file.content,queryFile:clone(file)};}
export async function prepareRequest(work,kind,context){
 const ctx=clone(context);if(!ctx.operationId||!ctx.actor||!ctx.at)throw Error('Complete the recording operator, operation ID and timestamp.');
 if(work.project)ctx.expectedProjectSha256=(await programmeIdentity(work.project)).projectSha256;
 const d=work.drafts;let input;
 if(kind==='create'){input={id:d.create.id,label:d.create.label,reports:[definition(d.definition)]};if(d.create.starter.trim())input.starter=jsonObject(d.create.starter,'Original merchant starter');}
 else if(kind==='define')input=definition(d.definition);
 else if(kind==='run'){
  const selected=work.project?.reportingProgramme.definitions.find(x=>x.sha256===d.run.definitionSha256);if(!selected)throw Error('Select the exact definition revision for this run.');
  const r=d.run;let count=null;if(r.reportedRows.trim()!==''){if(!/^\d+$/.test(r.reportedRows.trim())||!Number.isSafeInteger(Number(r.reportedRows)))throw Error('Reported rows must be an exact nonnegative integer.');count=Number(r.reportedRows);}
  if(r.status==='complete'&&count===null)throw Error('A complete result needs its actual reported row count; zero is allowed.');
  const provider={...jsonObject(r.providerExtra,'Additional provider metadata'),runId:r.providerRunId,queryVersion:r.queryVersion};
  input={id:r.id,reportId:selected.id,definitionSha256:selected.sha256,status:r.status,provider,period:jsonObject(r.period,'Report period'),parameters:jsonObject(r.parameters,'Resolved parameters'),sourceSnapshot:r.sourceSnapshot,reportedRows:count,notes:r.notes,files:clone(r.files)};
  if(r.result){const file=requireFile(r.result,'result file');if(r.status==='complete'){input.result={...file,delimiter:r.delimiter,header:r.header,skipEmptyRecords:r.skipEmptyRecords};if(r.mapping.trim())input.result.mapping=jsonObject(r.mapping,'Source Tables mapping');}else input.files.push(file);}
  else if(r.status==='complete')throw Error('Choose the complete original UTF-8 result CSV.');
 }
 else if(kind==='delivery'){const d0=d.delivery;input={id:d0.id,runId:d0.runId,status:d0.status,routeId:d0.routeId,destination:d0.destination,notes:d0.notes};if(d0.predecessorId)input.predecessorId=d0.predecessorId;if(d0.receipt)input.receipt=requireFile(d0.receipt,'delivery receipt');}
 else if(kind==='source')input={description:d.source.description,files:clone(d.source.files)};
 else if(kind==='desk'){const f=requireFile(d.desk.file,'desk handover');if(f.encoding&&f.encoding!=='utf8')throw Error('The desk handover must be complete UTF-8 JSON.');return {type:'desk',context:ctx,source:f.content,sourceFilename:f.filename,preimage:clone(work.project),status:'prepared'};}
 else throw Error('Choose a supported programme operation.');
 return {type:'programme',request:{...ctx,kind,input},preimage:clone(work.project),status:'prepared'};
}
export async function applyPrepared(work,prepared=work.pending){
 if(!prepared)throw Error('There is no prepared operation.');
 const current=work.project?clone(work.project):null;
 const result=prepared.type==='desk'?await receiveDeskHandover(current,prepared.source,prepared.context):await applyProgramme(current,prepared.request);
 return {work:{...clone(work),project:result.project,pending:{...clone(prepared),status:'applied'}},replayed:result.replayed,operation:result.operation};
}
export async function openWorkbench(value){
 if(!object(value))throw Error('Open a complete JSON project or workbench.');
 if(value.schema!==WORKBENCH_SCHEMA){const project=await openProgramme(value);return {...freshWorkbench(),project};}
 const work=clone(value);if(work.project)work.project=await openProgramme(work.project);
 if(!object(work.drafts)||!object(work.context))throw Error('The saved workbench lacks complete drafts/context.');
 const defaults=freshDrafts();
 for(const [group,fields]of Object.entries(defaults)){if(!object(work.drafts[group]))throw Error('Missing '+group+' draft.');for(const [key,example]of Object.entries(fields)){const val=work.drafts[group][key];if(Array.isArray(example)){if(!Array.isArray(val))throw Error('Invalid '+group+' '+key+' custody.');val.forEach(f=>requireFile(f,'retained draft file'));}else if(example===null){if(val!==null)requireFile(val,'retained draft file');}else if(typeof val!==typeof example)throw Error('Invalid saved '+group+' '+key+'.');}}
 if(!Array.isArray(work.heldOperations))work.heldOperations=[];
 if(work.pending!==null){if(!object(work.pending)||!['programme','desk'].includes(work.pending.type)||!['prepared','applied'].includes(work.pending.status))throw Error('Invalid saved operation.');if(work.pending.type==='programme'&&!object(work.pending.request)||work.pending.type==='desk'&&(!object(work.pending.context)||typeof work.pending.source!=='string'))throw Error('Incomplete saved operation.');}
 for(const held of work.heldOperations){if(!object(held)||!['programme','desk'].includes(held.type)||!['prepared','applied'].includes(held.status)||held.type==='programme'&&!object(held.request)||held.type==='desk'&&(!object(held.context)||typeof held.source!=='string'))throw Error('Incomplete held operation.');if(held.preimage)held.preimage=await openProgramme(held.preimage);}
 if(work.pending?.preimage)work.pending.preimage=await openProgramme(work.pending.preimage);
 for(const key of ['actor','operationId','at'])if(typeof work.context[key]!=='string')throw Error('Incomplete recording context.');
 if(typeof work.tab!=='string')work.tab='definition';return work;
}
export async function fileInput(file,{text=false}={}){
 if(file.size>16*1024*1024)throw Error('An original file may be at most 16 MiB.');
 const bytes=new Uint8Array(await file.arrayBuffer());let content,encoding;
 if(text){try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error('Choose an original UTF-8 text file; keep binary originals as attachments.');}encoding='utf8';}
 else{let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));content=btoa(binary);encoding='base64';}
 return {filename:file.name,encoding,content,bytes:bytes.length,mediaType:file.type||(text?'text/plain':'application/octet-stream')};
}
export function originalFile(project,ref){return project?.reportingProgramme.files.find(f=>f.filename===ref.filename&&f.sha256===ref.sha256);}
export function originalBytes(file){if(file.encoding!=='base64')return new TextEncoder().encode(file.content);const text=atob(file.content);return Uint8Array.from(text,c=>c.charCodeAt(0));}
export {programmeIdentity,exportProgramme};
