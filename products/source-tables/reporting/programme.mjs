// MIT. Complete reporting programmes on the maintained Source Tables engine.
import * as tables from '../../../stellar-forge/developer-site/dist/source-table-workspace.mjs';
import {zipWorkspace} from '../../../stellar-forge/developer-site/dist/onboarding.mjs';

export const SCHEMA='stellar-forge.reporting-programme.v1';
const enc=new TextEncoder(), clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const pretty=x=>JSON.stringify(x,null,2)+'\n';
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
function text(x,label,max=4000,empty=false){if(typeof x!=='string'||(!empty&&!x.trim())||x.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x)||x.isWellFormed&&!x.isWellFormed())fail('TEXT',label+' must be complete ordinary text.');return x;}
function ident(x,label){text(x,label,120);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x))fail('ID',label+' must use letters, digits, dot, dash or underscore.');return x;}
function instant(x){if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x.slice(0,10)+'T12:00:00Z').toISOString().slice(0,10)!==x.slice(0,10))fail('TIME','Supply an actual ISO timestamp with UTC or numeric offset.');return x;}
function canonical(x){if(x===null||typeof x==='boolean'||typeof x==='string')return JSON.stringify(x);if(typeof x==='number'){if(!Number.isFinite(x))fail('JSON','Numbers must be finite; use text for exact large values.');return JSON.stringify(x);}if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';fail('JSON','Use complete JSON values.');}
const hash=x=>tables.sha256(canonical(x));
function ordinaryJson(x,label){if(!object(x))fail('JSON',label+' must be a JSON object.');canonical(x);return clone(x);}
function csv(headers,rows){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return [headers,...rows].map(row=>row.map(q).join(',')).join('\r\n')+'\r\n';}
function decode64(s){if(typeof s!=='string'||s.length%4||/[^A-Za-z0-9+/=]/.test(s))fail('BASE64','Supply canonical padded base64.');let padding=s.endsWith('==')?2:s.endsWith('=')?1:0;if(s.slice(0,s.length-padding).includes('='))fail('BASE64','Invalid base64 padding.');let binary;try{binary=atob(s);}catch{fail('BASE64','Invalid base64.');}if(btoa(binary)!==s)fail('BASE64','Noncanonical base64.');return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function encode64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
function fileBytes(file){return file.encoding==='base64'?decode64(file.content):enc.encode(file.content);}
async function normalizeFile(input){
 if(!object(input))fail('FILE','Supply the complete original file.');
 text(input.filename,'Original filename',500);if(/[\/\\]/.test(input.filename)||input.filename==='.'||input.filename==='..')fail('FILE','Use an original basename, not a path.');
 const encoding=input.encoding||'utf8';if(!['utf8','base64'].includes(encoding))fail('FILE','File encoding must be utf8 or base64.');
 if(typeof input.content!=='string')fail('FILE','The complete original body is required.');
 if(encoding==='utf8'&&input.content.isWellFormed&&!input.content.isWellFormed())fail('FILE','UTF-8 text must contain complete Unicode characters.');
 const mediaType=input.mediaType??'application/octet-stream';text(mediaType,'Media type',300);
 const file={filename:input.filename,encoding,content:input.content,mediaType};
 const bytes=fileBytes(file);if(bytes.length>16*1024*1024)fail('FILE_SIZE','A retained original file may be at most 16 MiB.');
 file.bytes=bytes.length;file.sha256=await tables.sha256(bytes);
 if(input.sha256!==undefined&&input.sha256!==file.sha256||input.bytes!==undefined&&input.bytes!==file.bytes)fail('FILE_IDENTITY','Original file bytes do not match their declared identity.');
 return file;
}
async function keepFile(programme,input){const file=await normalizeFile(input),old=programme.files.find(f=>f.sha256===file.sha256&&f.filename===file.filename);if(old){if(canonical(old)!==canonical(file))fail('FILE_IDENTITY','A retained filename/hash has different metadata.');return {filename:old.filename,sha256:old.sha256,bytes:old.bytes};}programme.files.push(file);return {filename:file.filename,sha256:file.sha256,bytes:file.bytes};}
function resolveFile(p,ref){const file=p.files.find(f=>f.sha256===ref?.sha256&&f.filename===ref?.filename);if(!file||file.bytes!==ref.bytes)fail('FILE_MISSING','A complete original file is absent.');return file;}
function programme(project){if(!project.reportingProgramme||project.reportingProgramme.schema!==SCHEMA)fail('PROGRAMME','Open a complete reporting programme project.');return project.reportingProgramme;}
function findDefinition(p,id,sha){const d=p.definitions.find(d=>d.id===id&&d.sha256===sha);if(!d)fail('DEFINITION','Select the exact retained report definition.');return d;}
function defineInput(value){
 const d=ordinaryJson(value,'Report definition');ident(d.id,'Report ID');text(d.title,'Report title',300);text(d.meaning,'Report meaning',8000);
 d.parameters=ordinaryJson(d.parameters??{},'Effective parameter template');
 if(!object(d.calendar))fail('CALENDAR','Retain the actual or proposed calendar.');
 text(d.calendar.timezone,'Calendar timezone',100);try{new Intl.DateTimeFormat('en',{timeZone:d.calendar.timezone});}catch{fail('CALENDAR','Select a real IANA timezone.');}
 if(!['proposed','configured','manual'].includes(d.calendar.status))fail('CALENDAR','Calendar status must be proposed, configured or manual.');
 text(d.calendar.expression??'','Calendar expression',500,true);text(d.calendar.rule,'Calendar period/missed-run rule',8000);
 if(d.calendar.status==='configured')text(d.calendar.nativeScheduleId,'Actual configured schedule ID',500);
 text(d.sourceDescription,'Source and ownership description',8000);
 if(!d.query||d.query.encoding&&d.query.encoding!=='utf8')fail('QUERY','Retain the complete UTF-8 SQL definition.');
 text(d.query.content,'Complete SQL',16*1024*1024);
 return d;
}
function defaultState(id,label,at){return {schema:SCHEMA,id,label,createdAt:at,files:[],definitions:[],runs:[],deliveries:[],registers:{},operations:[]};}
function resultDocument(project,id){const doc=project.documents.find(d=>d.id===id);if(!doc)fail('RESULT_DOCUMENT','The original result table is absent.');return doc;}
async function retainRegister(project,key,headers,rows){
 const p=programme(project),source=csv(headers,rows),previous=p.registers[key];
 let received;if(previous){resultDocument(project,previous);received=await tables.addEdition(project,previous,{filename:'reporting-'+key+'.csv',sourceText:source});}else received=await tables.addDocument(project,{filename:'reporting-'+key+'.csv',sourceText:source,resourceId:'reporting-'+key,delimiter:',',header:true,skipEmptyRecords:false});
 project=received.project;programme(project).registers[key]=received.documentId;
 // Registers are projections of immutable retained records. Their source/mapping
 // reviews remain separate from the business acceptance and external run status.
 if(!previous){let doc=resultDocument(project,received.documentId),mapping=clone(doc.mapping);mapping.keyColumns=[0];project=tables.replaceMapping(project,doc.id,mapping);}
 return (await tables.freezeReview(project,received.documentId)).project;
}
async function registers(project){
 let p=programme(project);
 project=await retainRegister(project,'definitions',['definition_sha256','report_id','revision','title','meaning','query_filename','query_sha256','parameter_template_json','calendar_json','source_description','authored_at'],
 p.definitions.map(d=>[d.sha256,d.id,d.revision,d.value.title,d.value.meaning,d.query.filename,d.query.sha256,canonical(d.value.parameters),canonical(d.value.calendar),d.value.sourceDescription,d.at]));
 p=programme(project);
 project=await retainRegister(project,'runs',['run_id','report_id','definition_sha256','declared_status','provider_run_id','provider_query_version','report_period_json','effective_parameters_json','source_snapshot','result_document_id','result_edition_id','result_sha256','parsed_rows','reported_rows','recorded_at','notes'],
 p.runs.map(r=>[r.id,r.reportId,r.definitionSha256,r.status,r.provider.runId,r.provider.queryVersion,canonical(r.period),canonical(r.parameters),r.sourceSnapshot,r.result?.documentId,r.result?.editionId,r.result?.sha256,r.result?.rows,r.reportedRows,r.at,r.notes]));
 p=programme(project);
 return retainRegister(project,'deliveries',['delivery_id','run_id','status','route_id','destination_description','occurred_at','receipt_filename','receipt_sha256','predecessor_delivery_id','notes'],
 p.deliveries.map(d=>[d.id,d.runId,d.status,d.routeId,d.destination,d.at,d.receipt?.filename,d.receipt?.sha256,d.predecessorId,d.notes]));
}
export async function openProgramme(input){
 const project=await tables.importProject(input),p=programme(project);
 ident(p.id,'Programme ID');text(p.label,'Programme label',300);instant(p.createdAt);
 for(const key of ['files','definitions','runs','deliveries','operations'])if(!Array.isArray(p[key]))fail('PROGRAMME','Incomplete '+key+' register.');
 const fileKeys=new Set();for(const f of p.files){const verified=await normalizeFile(f),key=f.sha256+'\n'+f.filename;if(canonical(verified)!==canonical(f)||fileKeys.has(key))fail('FILE_IDENTITY','Duplicated or changed original file.');fileKeys.add(key);}
 const defs=new Set();for(const d of p.definitions){ident(d.id,'Report ID');instant(d.at);const q=resolveFile(p,d.query);if(q.encoding!=='utf8')fail('QUERY','SQL source must be UTF-8.');
 const value=defineInput({...d.value,query:q});delete value.query;
 if(d.id!==d.value.id||canonical(value)!==canonical(d.value)||d.sha256!==await hash({id:d.id,revision:d.revision,value:d.value,query:d.query,at:d.at,previousSha256:d.previousSha256})||defs.has(d.sha256))fail('DEFINITION','Changed or duplicated report definition.');
 const predecessors=p.definitions.filter(x=>x.id===d.id&&x.revision<d.revision);if(!Number.isSafeInteger(d.revision)||d.revision!==predecessors.length+1||(d.revision===1?d.previousSha256!==null:!defs.has(d.previousSha256)||!predecessors.some(x=>x.revision===d.revision-1&&x.sha256===d.previousSha256)))fail('DEFINITION','Incomplete report definition history.');defs.add(d.sha256);}
 const runIds=new Set();for(const r of p.runs){ident(r.id,'Run ID');if(runIds.has(r.id))fail('RUN','Duplicated original run.');runIds.add(r.id);findDefinition(p,r.reportId,r.definitionSha256);validateRun(r);
 const body=clone(r);delete body.sha256;if(r.sha256!==await hash(body))fail('RUN_IDENTITY','Changed original run record.');
 for(const ref of r.files)resolveFile(p,ref);
 if(r.result){const doc=resultDocument(project,r.result.documentId),edition=doc.editions.find(e=>e.id===r.result.editionId);if(!edition||edition.sha256!==r.result.sha256||enc.encode(edition.sourceText).length!==r.result.bytes)fail('RESULT_IDENTITY','The retained report output is absent or changed.');
 const parsed=tables.parseTable(edition.sourceText,r.result.parser);if(parsed.rows.length!==r.result.rows||r.reportedRows!==r.result.rows)fail('RESULT_ROWS','The complete result row count does not match its retained run.');
 if(resolveFile(p,r.result.file).encoding!=='utf8'||resolveFile(p,r.result.file).content!==edition.sourceText)fail('RESULT_IDENTITY','Original output bytes differ from the selected source edition.');}}
 const deliveryIds=new Set();for(const d of p.deliveries){validateDelivery(d);if(deliveryIds.has(d.id)||!runIds.has(d.runId))fail('DELIVERY','Duplicated delivery or absent original run.');const run=p.runs.find(r=>r.id===d.runId);if(d.status==='succeeded'&&run.status!=='complete'||d.status==='suppressed-empty'&&(run.status!=='complete'||run.reportedRows!==0))fail('DELIVERY','Route outcome is incompatible with its original run.');if(d.predecessorId){const prior=p.deliveries.find(x=>x.id===d.predecessorId);if(!prior||!deliveryIds.has(prior.id)||prior.runId!==d.runId||prior.id===d.id)fail('DELIVERY','A delivery predecessor must be an earlier attempt for the same run.');}deliveryIds.add(d.id);if(d.receipt)resolveFile(p,d.receipt);const body=clone(d);delete body.sha256;if(d.sha256!==await hash(body))fail('DELIVERY_IDENTITY','Changed original delivery record.');}
 const ops=new Set();for(const o of p.operations){ident(o.id,'Operation ID');instant(o.at);text(o.actor,'Recording operator',300);if(!object(o.request)||o.request.operationId!==o.id||o.request.at!==o.at||o.request.actor!==o.actor||o.request.kind!==o.kind||await hash(o.request)!==o.requestSha256||ops.has(o.id)||!/^[0-9a-f]{64}$/.test(o.requestSha256))fail('OPERATION','Invalid original operation history.');ops.add(o.id);}
 // The editable register projections must still refer to complete original tables.
 for(const key of ['definitions','runs','deliveries'])if(p.registers[key])resultDocument(project,p.registers[key]);
 return project;
}
function validateRun(r){
 ident(r.id,'Run ID');ident(r.reportId,'Report ID');instant(r.at);
 if(!['complete','failed','truncated'].includes(r.status))fail('RUN_STATUS','Record complete, failed or truncated from the actual original run.');
 if(!object(r.provider))fail('PROVIDER','Retain the actual provider run and query version.');
 text(r.provider.runId,'Provider run ID',500);text(r.provider.queryVersion,'Original query version',500);
 ordinaryJson(r.period,'Complete report period');ordinaryJson(r.parameters,'Resolved report parameters');text(r.sourceSnapshot,'Source snapshot identity',4000);text(r.notes??'','Run notes',8000,true);
 if(!(r.status!=='complete'&&r.reportedRows===null)&&(!Number.isSafeInteger(r.reportedRows)||r.reportedRows<0))fail('RESULT_ROWS','Retain the actual nonnegative reported row count; failed or truncated observations may use null when unavailable.');
 if(!Array.isArray(r.files))fail('FILES','Retain the original run files.');
 if(r.status==='complete'&&!r.result)fail('RESULT','A complete run requires its full CSV result.');
 if(r.status!=='complete'&&r.result)fail('RESULT','Only a declared complete result becomes a reviewed result table; retain partial outputs as original files.');
}
function validateDelivery(d){ident(d.id,'Delivery ID');ident(d.runId,'Run ID');instant(d.at);text(d.routeId,'Actual route ID',500);text(d.destination,'Intended destination',2000);text(d.notes??'','Delivery notes',8000,true);if(!['succeeded','failed','uncertain','suppressed-empty'].includes(d.status))fail('DELIVERY_STATUS','Use the original route outcome.');if(d.status==='succeeded'&&!d.receipt)fail('DELIVERY_RECEIPT','A successful route requires its complete original receipt.');}
export async function applyProgramme(input,request){
 if(!object(request))fail('REQUEST','Supply the complete programme request.');
 ident(request.operationId,'Operation ID');instant(request.at);text(request.actor,'Recording operator',300);
 if(!object(request.input))fail('INPUT','Supply complete operation input.');
 const requestHash=await hash(request);
 let project;
 if(input){project=await openProgramme(input);const prior=programme(project).operations.find(o=>o.id===request.operationId);if(prior){if(prior.requestSha256!==requestHash)fail('OPERATION_CONFLICT','The original operation ID has a different request.');return {project,replayed:true,operation:clone(prior)};}
 if(request.kind==='create')fail('PROGRAMME_EXISTS','Continue this programme with define, run or delivery.');
 if(request.expectedProjectSha256&&request.expectedProjectSha256!==await hash(project))fail('PROJECT_CONFLICT','The selected project changed; reopen the current complete project before preparing another request.');}
 else {if(request.kind!=='create')fail('PROGRAMME','Create the reporting programme first.');project=tables.createProject({name:request.input.label,starter:request.input.starter});project.reportingProgramme=defaultState(ident(request.input.id,'Programme ID'),text(request.input.label,'Programme label',300),request.at);}
 const p=programme(project),value=request.input;
 if(!object(value))fail('INPUT','Supply complete operation input.');
 if(request.kind==='create'||request.kind==='define'){
 const reports=request.kind==='create'?value.reports:[value];if(!Array.isArray(reports)||!reports.length)fail('REPORTS','Supply complete report definitions.');
 for(const original of reports){const definition=defineInput(original),query=await keepFile(p,definition.query);delete definition.query;const prior=p.definitions.filter(x=>x.id===definition.id).at(-1);const d={id:definition.id,revision:(prior?.revision||0)+1,value:definition,query,at:request.at,previousSha256:prior?.sha256||null};d.sha256=await hash(d);p.definitions.push(d);}
 }else if(request.kind==='run'){
 const r=clone(value);r.at=request.at;r.files=[];r.notes=r.notes??'';findDefinition(p,r.reportId,r.definitionSha256);
 if(p.runs.some(x=>x.id===r.id))fail('RUN','An original run ID is already retained; replay its operation or use the actual distinct run.');
 const suppliedFiles=Array.isArray(value.files)?value.files:[];for(const f of suppliedFiles)r.files.push(await keepFile(p,f));
 let resultInput=value.result;delete r.result;
 if(r.status==='complete'){
 if(!resultInput||resultInput.encoding&&resultInput.encoding!=='utf8')fail('RESULT','Supply the full UTF-8 CSV result.');
 const file=await keepFile(p,resultInput),parser={delimiter:resultInput.delimiter||',',header:resultInput.header!==false,skipEmptyRecords:resultInput.skipEmptyRecords===true};
 const parsed=tables.parseTable(resultInput.content,parser);if(parsed.rows.length!==r.reportedRows)fail('RESULT_ROWS','The full output row count differs from the original reported total.');
 const earlier=p.runs.find(x=>x.reportId===r.reportId&&x.result);
 const received=earlier?await tables.addEdition(project,earlier.result.documentId,{filename:file.filename,sourceText:resultInput.content}):await tables.addDocument(project,{filename:file.filename,sourceText:resultInput.content,resourceId:'report-'+(await tables.sha256(r.reportId)).slice(0,40),...parser});
 project=received.project;
 const previousDoc=resultDocument(project,received.documentId);
 if(!earlier||canonical(previousDoc.mapping.columns.map(x=>x.sourceName))!==canonical(parsed.headings)||previousDoc.mapping.delimiter!==parsed.delimiter||previousDoc.mapping.header!==parser.header||previousDoc.mapping.skipEmptyRecords!==parser.skipEmptyRecords)project=tables.resetMapping(project,received.documentId,parser);
 if(resultInput.mapping)project=tables.replaceMapping(project,received.documentId,resultInput.mapping);
 project=(await tables.freezeReview(project,received.documentId)).project;
 r.result={documentId:received.documentId,editionId:received.editionId,sha256:file.sha256,bytes:file.bytes,rows:parsed.rows.length,parser,file};
 }else if(resultInput){r.files.push(await keepFile(programme(project),resultInput));}
 validateRun(r);r.sha256=await hash(r);programme(project).runs.push(r);
 }else if(request.kind==='source'){
 if(!Array.isArray(value.files)||!value.files.length)fail('FILES','Retain at least one complete original source file.');
 text(value.description,'Original source description',8000);for(const f of value.files)await keepFile(p,f);
 }else if(request.kind==='delivery'){
 const d=clone(value);d.at=request.at;d.notes=d.notes??'';if(p.deliveries.some(x=>x.id===d.id))fail('DELIVERY','This actual delivery ID is already retained.');
 const run=p.runs.find(x=>x.id===d.runId);if(!run)fail('RUN','Select the original retained run.');
 if(d.receipt)d.receipt=await keepFile(p,d.receipt);
 if(d.status==='succeeded'&&run.status!=='complete')fail('DELIVERY','A failed or truncated run cannot be recorded as complete delivered output.');
 if(d.status==='suppressed-empty'&&(run.status!=='complete'||run.reportedRows!==0))fail('DELIVERY','Empty suppression requires a complete zero-row result.');
 if(d.predecessorId&&!p.deliveries.some(x=>x.id===d.predecessorId&&x.runId===d.runId))fail('DELIVERY','Select an actual earlier route attempt for this run.');
 validateDelivery(d);d.sha256=await hash(d);p.deliveries.push(d);
 }else fail('OPERATION','Use create, define, run, delivery or source.');
 project=await registers(project);
 const operation={id:request.operationId,kind:request.kind,at:request.at,actor:request.actor,requestSha256:requestHash,request:clone(request)};
 programme(project).operations.push(operation);
 const verified=await openProgramme(project);return {project:verified,replayed:false,operation,projectSha256:await hash(verified)};
}
export function programmeSummary(project){const p=programme(project);return {schema:p.schema,id:p.id,label:p.label,definitions:p.definitions.map(d=>({id:d.id,revision:d.revision,sha256:d.sha256,title:d.value.title,calendar:d.value.calendar})),runs:p.runs.map(r=>({id:r.id,reportId:r.reportId,status:r.status,provider:r.provider,period:r.period,rows:r.result?.rows,documentId:r.result?.documentId,editionId:r.result?.editionId})),deliveries:clone(p.deliveries),files:p.files.map(f=>({filename:f.filename,bytes:f.bytes,sha256:f.sha256,mediaType:f.mediaType})),operations:p.operations.map(({request,...entry})=>entry),tables:tables.projectSummary(project)};}
export async function programmeIdentity(input){const project=await openProgramme(input);return {projectSha256:await hash(project),summary:programmeSummary(project)};}
export async function exportProgramme(input){
 const project=await openProgramme(input),native=await tables.createTableWorkspace(project),p=programme(project);
 const prefix=native.summary.folder+'/reporting-programme/',files=[...native.files];
 files.push({path:prefix+'programme.json',content:pretty(p)});
 files.push({path:prefix+'README.md',content:'# Reporting programme handover\n\nOpen ../source-tables/project.json in the same installed Source Tables workbench or through reporting-programme inspect. Every SQL, run, definition, effective parameter, period and route record is retained in that project. Original provider and destination observations are recorded declarations; source review is a separate action. Continue using the actual database, reporting service and configured schedule. This package does not activate schedules, query databases, deliver mail or authorize a purchase.\n\nOriginal files below retain exact bytes. Report result tables, earlier editions, mapping decisions, correction events and full comparisons remain under ../source-tables/. Use reporting-programme export to produce a successor complete handover after native table edits.\n'});
 const originals=[];
 for(const f of p.files){const path=prefix+'originals/'+f.sha256+'/'+f.filename;files.push({path,content:fileBytes(f)});originals.push({path,filename:f.filename,bytes:f.bytes,sha256:f.sha256,mediaType:f.mediaType});}
 files.push({path:prefix+'original-files.json',content:pretty(originals)});
 const identities=[];for(const f of files){const b=typeof f.content==='string'?enc.encode(f.content):f.content;identities.push({path:f.path,bytes:b.length,sha256:await tables.sha256(b)});}
 files.push({path:prefix+'complete-files.json',content:pretty({schema:'stellar-forge.reporting-programme-files.v1',files:identities})});
 return {project,summary:programmeSummary(project),files,bytes:zipWorkspace(files)};
}
