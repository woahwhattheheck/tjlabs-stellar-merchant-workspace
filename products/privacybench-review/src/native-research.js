/* MIT. Explicit browser bytes adapter around complete maintained Research contracts and preparation functions. */
function createNativeResearch(options) {
 "use strict";
 const {codec}=options,structuredClone=v=>JSON.parse(JSON.stringify(v));
 function encode(value){return codec.utf8Encode(String(value).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"\uFFFD"));}
 function decode(bytes){for(let i=0;i<bytes.length;){const b=bytes[i++];if(b<128)continue;let n;if(b>=194&&b<=223)n=1;else if(b>=224&&b<=239)n=2;else if(b>=240&&b<=244)n=3;else throw Error("OUTPUT_UTF8_INVALID");if(i+n>bytes.length)throw Error("OUTPUT_UTF8_INVALID");const second=bytes[i];if(b===224&&second<160||b===237&&second>=160||b===240&&second<144||b===244&&second>=144)throw Error("OUTPUT_UTF8_INVALID");for(let j=0;j<n;j++)if((bytes[i++]&192)!==128)throw Error("OUTPUT_UTF8_INVALID");}return codec.utf8Decode(bytes);}
 class Bytes extends Uint8Array {toString(encoding="utf8"){if(encoding==="base64")return codec.toBase64(this);if(encoding==="utf8"||encoding==="utf-8")return decode(this);throw Error("RESEARCH_BYTE_ENCODING");}equals(other){return this.length===other.length&&this.every((v,i)=>v===other[i]);}}
 const Buffer={from(value,encoding="utf8"){let b;if(typeof value==="string"){if(encoding==="base64")b=codec.fromBase64(value);else if(encoding==="utf8"||encoding==="utf-8")b=encode(value);else throw Error("RESEARCH_BYTE_ENCODING");}else if(value instanceof Uint8Array||Array.isArray(value))b=value;else throw Error("RESEARCH_BYTES_REQUIRED");return Bytes.from(b);},isBuffer(value){return value instanceof Bytes;},byteLength(value){return encode(value).length;}};
 const TextDecoder=class {constructor(encoding="utf-8",options={}){if(!["utf-8","utf8"].includes(encoding))throw Error("RESEARCH_BYTE_ENCODING");this.keepBom=Boolean(options.ignoreBOM);}decode(b){const s=decode(b);return this.keepBom?s:s.replace(/^\uFEFF/,"");}};
 function createHash(algorithm){if(algorithm!=="sha256")throw Error("RESEARCH_HASH_ALGORITHM");const chunks=[];return {update(b){chunks.push(Buffer.from(b));return this;},digest(encoding){if(encoding!=="hex")throw Error("RESEARCH_HASH_ENCODING");const bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return codec.sha256Bytes(bytes);}};}
 const digest=b=>codec.sha256Bytes(b),need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});},object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
 function jsonBytes(value){const t=JSON.stringify(value,(_key,item)=>{need(item!==undefined&&typeof item!=="function"&&typeof item!=="symbol"&&typeof item!=="bigint","JSON_VALUES_REQUIRED");need(typeof item!=="number"||Number.isFinite(item),"JSON_VALUES_REQUIRED");return item;},2);return Buffer.from(t+"\n");}
 const resolve=(base,path)=>{const raw=path===undefined?base:(String(base).replace(/\/$/,"")+"/"+path);const names=[];for(const part of raw.split("/")){if(!part||part===".")continue;if(part==="..")throw Error("RESEARCH_PATH_ESCAPE");names.push(part);}return "/"+names.join("/");};
 const original=async()=>{throw Error("RESEARCH_ORIGINAL_READER_REQUIRED");};
 const contract=(()=>{
// MIT. Versioned comparison contracts over the original Research dossier.
const COMPARISON_SCHEMA='sf88-research-comparison/v1';
const RUN_SCHEMA='sf88-research-comparison-run/v1';
const MAX_RUN=64*1024*1024;
const ACTIONS=Object.freeze(['case.save','candidate.save','run.import','judgment.save','decision.save']);
const SECTIONS=Object.freeze(['overview','cases','case-editions','candidates','candidate-editions','runs','judgments','decisions','operations']);
const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>digest(jsonBytes(canonical(value)));
const same=(a,b)=>hash(a)===hash(b);
function fields(value,allowed,code='COMPARISON_FIELDS_INVALID'){
 need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),code);return value;
}
function text(value,name,max=20000,empty=false){
 need(typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0),name);return value;
}
function id(value,name='COMPARISON_ID_INVALID'){
 need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value),name);return value;
}
function ids(value=[]){
 need(Array.isArray(value)&&value.length<=1000&&new Set(value).size===value.length,'COMPARISON_IDS_INVALID');
 return value.map(v=>id(v));
}
function time(value){
 need(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'COMPARISON_TIME_INVALID');return value;
}
function actor(value){
 fields(value,['id','name'],'COMPARISON_ACTOR_INVALID');
 return{id:id(value.id),name:text(value.name,'COMPARISON_ACTOR_NAME_REQUIRED',200)};
}
function sourceRefs(value=[]){
 need(Array.isArray(value)&&value.length<=500,'COMPARISON_SOURCES_INVALID');
 const result=value.map(v=>{fields(v,['editionId','locator','note']);
 return{editionId:id(v.editionId),locator:text(v.locator,'COMPARISON_SOURCE_LOCATOR_REQUIRED',4000),note:text(v.note??'','COMPARISON_SOURCE_NOTE_INVALID',12000,true)};});
 need(new Set(result.map(v=>v.editionId+'\n'+v.locator)).size===result.length,'COMPARISON_SOURCE_DUPLICATE');return result;
}
function json(value,max=1024*1024){
 need(object(value)&&jsonBytes(value).length<=max,'COMPARISON_JSON_INVALID');return clone(value);
}
function caseDefinition(value){
 fields(value,['questionId','title','purpose','scope','criteria','sourceRefs']);
 need(Array.isArray(value.criteria)&&value.criteria.length<=100,'COMPARISON_CRITERIA_INVALID');
 const criteria=value.criteria.map(v=>{fields(v,['id','label','kind','unit','direction','description']);
 need(['MEASURED','JUDGMENT'].includes(v.kind)&&['HIGHER','LOWER','DESCRIPTIVE'].includes(v.direction),'COMPARISON_CRITERION_INVALID');
 return{id:id(v.id),label:text(v.label,'COMPARISON_CRITERION_LABEL_REQUIRED',240),kind:v.kind,
 unit:text(v.unit??'','COMPARISON_UNIT_INVALID',160,true),direction:v.direction,description:text(v.description??'','COMPARISON_CRITERION_DESCRIPTION_INVALID',12000,true)};});
 need(new Set(criteria.map(v=>v.id)).size===criteria.length,'COMPARISON_CRITERION_DUPLICATE');
 return{questionId:id(value.questionId),title:text(value.title,'COMPARISON_TITLE_REQUIRED',240),
 purpose:text(value.purpose,'COMPARISON_PURPOSE_REQUIRED'),scope:text(value.scope??'','COMPARISON_SCOPE_INVALID',40000,true),
 criteria,sourceRefs:sourceRefs(value.sourceRefs)};
}
function candidateDefinition(value){
 fields(value,['name','kind','version','description','configuration','sourceRefs']);
 need(['MODEL','PLATFORM','ARCHITECTURE'].includes(value.kind),'COMPARISON_CANDIDATE_KIND_INVALID');
 return{name:text(value.name,'COMPARISON_CANDIDATE_NAME_REQUIRED',240),kind:value.kind,
 version:text(value.version,'COMPARISON_CANDIDATE_VERSION_REQUIRED',500),description:text(value.description??'','COMPARISON_DESCRIPTION_INVALID',40000,true),
 configuration:json(value.configuration??{}),sourceRefs:sourceRefs(value.sourceRefs)};
}
function judgmentDefinition(value){
 fields(value,['candidateVersionId','criterionId','value','reviewer','reviewedAt','rationale','sourceRefs','runIds']);
 return{candidateVersionId:id(value.candidateVersionId),criterionId:id(value.criterionId),
 value:text(value.value,'COMPARISON_JUDGMENT_REQUIRED',20000),reviewer:text(value.reviewer,'COMPARISON_REVIEWER_REQUIRED',240),
 reviewedAt:time(value.reviewedAt),rationale:text(value.rationale,'COMPARISON_RATIONALE_REQUIRED',40000),
 sourceRefs:sourceRefs(value.sourceRefs),runIds:ids(value.runIds)};
}
function decisionDefinition(value){
 fields(value,['title','candidateVersionIds','runIds','judgmentVersionIds','reviewer','reviewedAt','recommendation','rationale','limitations','sourceRefs']);
 return{title:text(value.title,'COMPARISON_DECISION_TITLE_REQUIRED',240),candidateVersionIds:ids(value.candidateVersionIds),
 runIds:ids(value.runIds),judgmentVersionIds:ids(value.judgmentVersionIds),reviewer:text(value.reviewer,'COMPARISON_REVIEWER_REQUIRED',240),
 reviewedAt:time(value.reviewedAt),recommendation:text(value.recommendation,'COMPARISON_RECOMMENDATION_REQUIRED',20000),
 rationale:text(value.rationale,'COMPARISON_RATIONALE_REQUIRED',40000),limitations:text(value.limitations??'','COMPARISON_LIMITATIONS_INVALID',40000,true),
 sourceRefs:sourceRefs(value.sourceRefs)};
}
function comparisonInput(value){
 fields(value,['requestId','expectedRevision','actor','action','payload']);
 need(ACTIONS.includes(value.action),'COMPARISON_ACTION_INVALID');
 need(Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=1,'REVISION_INVALID');
 const p=value.payload;let payload;
 if(value.action==='case.save'){
 fields(p,['caseId','previousVersionId','definition']);
 payload={caseId:p.caseId==null?null:id(p.caseId),previousVersionId:p.previousVersionId==null?null:id(p.previousVersionId),definition:caseDefinition(p.definition)};
 need(Boolean(payload.caseId)===Boolean(payload.previousVersionId),'COMPARISON_PREVIOUS_REQUIRED');
 }else if(value.action==='run.import'){
 fields(p,['caseId','caseVersionId','candidateVersionId','rawText']);
 payload={caseId:id(p.caseId),caseVersionId:id(p.caseVersionId),candidateVersionId:id(p.candidateVersionId),
 rawText:text(p.rawText,'COMPARISON_RUN_JSON_REQUIRED',MAX_RUN)};
 need(Buffer.byteLength(payload.rawText)<=MAX_RUN,'COMPARISON_RUN_TOO_LARGE');
 need(Buffer.from(payload.rawText,'utf8').toString('utf8')===payload.rawText,'COMPARISON_RUN_UTF8_INVALID');
 }else{
 const kind=value.action.split('.')[0],key=kind+'Id';
 fields(p,['caseId','caseVersionId',key,'previousVersionId','definition']);
 const definition=kind==='candidate'?candidateDefinition(p.definition):kind==='judgment'?judgmentDefinition(p.definition):decisionDefinition(p.definition);
 payload={caseId:id(p.caseId),caseVersionId:id(p.caseVersionId),[key]:p[key]==null?null:id(p[key]),previousVersionId:p.previousVersionId==null?null:id(p.previousVersionId),definition};
 need(Boolean(payload[key])===Boolean(payload.previousVersionId),'COMPARISON_PREVIOUS_REQUIRED');
 }
 return{requestId:id(value.requestId),expectedRevision:value.expectedRevision,actor:actor(value.actor),action:value.action,payload};
}
function retainedRequest(request,raw){
 if(request.action!=='run.import')return clone(request);
 const {rawText,...payload}=request.payload;return{...clone(request),payload:{...clone(payload),raw}};
}
function safePath(value){
 text(value,'COMPARISON_ARTIFACT_PATH_INVALID',1024);
 need(!value.startsWith('/')&&!value.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(v=>v&&!['.','..'].includes(v)),
 'COMPARISON_ARTIFACT_PATH_INVALID');return value;
}
function parseRun(rawText){
 let v;try{v=JSON.parse(rawText);}catch{need(false,'COMPARISON_RUN_JSON_INVALID');}
 fields(v,['schema','externalRunId','kind','status','startedAt','finishedAt','elapsedMs','engine','input','metrics','artifacts','result','limitations']);
 need(v.schema===RUN_SCHEMA,'COMPARISON_RUN_SCHEMA_INVALID');
 id(v.externalRunId);need(['SOURCE_NATIVE','IMPORTED_MEASUREMENT','TRAINING_FIXTURE'].includes(v.kind),'COMPARISON_RUN_KIND_INVALID');
 need(['SUCCEEDED','FAILED','CANCELLED'].includes(v.status),'COMPARISON_RUN_STATUS_INVALID');
 time(v.startedAt);time(v.finishedAt);need(Date.parse(v.finishedAt)>=Date.parse(v.startedAt),'COMPARISON_RUN_TIME_ORDER');
 need(v.elapsedMs===null||Number.isFinite(v.elapsedMs)&&v.elapsedMs>=0,'COMPARISON_RUN_DURATION_INVALID');
 fields(v.engine,['name','version','command','runtime','configuration']);
 text(v.engine.name,'COMPARISON_ENGINE_REQUIRED',500);text(v.engine.version,'COMPARISON_ENGINE_VERSION_REQUIRED',500);
 need(Array.isArray(v.engine.command)&&v.engine.command.length<=1000&&v.engine.command.every(x=>typeof x==='string'&&x.length<=20000),'COMPARISON_COMMAND_INVALID');
 json(v.engine.runtime);json(v.engine.configuration);
 fields(v.input,['cohortId','protocolId','definition','sourceRefs','artifactIds']);
 id(v.input.cohortId);id(v.input.protocolId);json(v.input.definition);need(Array.isArray(v.input.sourceRefs)&&Array.isArray(v.input.artifactIds),'COMPARISON_INPUT_REFERENCES_REQUIRED');sourceRefs(v.input.sourceRefs);ids(v.input.artifactIds);
 need(Array.isArray(v.metrics)&&v.metrics.length<=10000,'COMPARISON_METRICS_INVALID');
 for(const m of v.metrics){
 fields(m,['id','criterionId','label','value','unit','undefinedReason','definition','denominator','cohortRef','artifactIds']);
 id(m.id);id(m.criterionId);text(m.label,'COMPARISON_METRIC_LABEL_REQUIRED',500);
 need(m.value===null||typeof m.value==='number'&&Number.isFinite(m.value)||typeof m.value==='string'&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(m.value),'COMPARISON_METRIC_VALUE_INVALID');
 text(m.unit,'COMPARISON_METRIC_UNIT_REQUIRED',160);text(m.definition,'COMPARISON_METRIC_DEFINITION_REQUIRED',12000);
 text(m.undefinedReason??'','COMPARISON_UNDEFINED_REASON_REQUIRED',12000,m.value!==null);
 json(m.denominator);text(m.cohortRef,'COMPARISON_METRIC_COHORT_REQUIRED',1000);need(Array.isArray(m.artifactIds),'COMPARISON_METRIC_ARTIFACTS_REQUIRED');ids(m.artifactIds);
 }
 need(new Set(v.metrics.map(m=>m.id)).size===v.metrics.length,'COMPARISON_METRIC_DUPLICATE');
 need(Array.isArray(v.artifacts)&&v.artifacts.length<=2000,'COMPARISON_ARTIFACTS_INVALID');
 const artifacts=[],names=new Set(),identifiers=new Set();let total=0;
 for(const f of v.artifacts){
 fields(f,['id','path','role','mediaType','bytes','sha256','bodyBase64']);
 id(f.id);safePath(f.path);text(f.role,'COMPARISON_ARTIFACT_ROLE_REQUIRED',160);text(f.mediaType,'COMPARISON_ARTIFACT_TYPE_REQUIRED',240);
 need(!names.has(f.path)&&!identifiers.has(f.id),'COMPARISON_ARTIFACT_DUPLICATE');names.add(f.path);identifiers.add(f.id);
 need(Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=MAX_RUN&&typeof f.bodyBase64==='string'&&/^[a-f0-9]{64}$/.test(f.sha256),'COMPARISON_ARTIFACT_INVALID');
 const body=Buffer.from(f.bodyBase64,'base64');need(body.toString('base64')===f.bodyBase64&&body.length===f.bytes&&digest(body)===f.sha256,'COMPARISON_ARTIFACT_CHANGED');
 total+=body.length;need(total<=MAX_RUN,'COMPARISON_ARTIFACTS_TOO_LARGE');
 const {bodyBase64,...metadata}=f;artifacts.push({metadata,body});
 }
 need([...v.input.artifactIds,...v.metrics.flatMap(m=>m.artifactIds)].every(x=>identifiers.has(x)),'COMPARISON_ARTIFACT_REFERENCE_INVALID');
 json(v.result,MAX_RUN);
 need(Array.isArray(v.limitations)&&v.limitations.length<=1000&&v.limitations.every(x=>typeof x==='string'&&x.length<=12000),'COMPARISON_LIMITATIONS_INVALID');
 return{value:v,artifacts};
}

return {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath};
 })();
 const preparing=(()=>{const {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath}=contract;
const LIMIT=64*1024*1024;
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digest=b=>createHash('sha256').update(b).digest('hex');
const bytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const text=(x,key,max=40000)=>{need(typeof x==='string'&&x.length>0&&x.length<=max,key);return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const descriptor=b=>({bytes:b.length,sha256:digest(b)});
function exact(obj,allowed,code){need(plain(obj)&&Object.keys(obj).every(k=>allowed.includes(k)),code);return obj;}

function utf8(body){let result;try{result=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);}catch{need(false,'OUTPUT_UTF8_INVALID');}need(Buffer.from(result).equals(body),'OUTPUT_UTF8_INVALID');return result;}
function csvRecords(input,{delimiter=',',maximumRows=10000}={}){
 need([',','\t',';'].includes(delimiter),'OUTPUT_DELIMITER_INVALID');
 let at=0,line=1,start=1,cell='',row=[],quoted=false,closed=false,started=false;const rows=[];
 if(input.charCodeAt(0)===0xfeff)at=1;
 const endCell=()=>{row.push(cell);cell='';closed=false;started=false;};
 const endRow=()=>{endCell();rows.push({line:start,values:row});need(rows.length<=maximumRows+1,'OUTPUT_ROW_LIMIT');row=[];};
 while(at<input.length){
  const c=input[at++];
  if(quoted){if(c==='"'){if(input[at]==='"'){cell+='"';at++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n'||c==='\r'&&input[at]!=='\n')line++;}continue;}
  if(c==='"'){need(!started&&!closed&&cell==='','OUTPUT_CSV_QUOTE',{line});quoted=true;started=true;continue;}
  if(c===delimiter){endCell();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&input[at]==='\n')at++;endRow();line++;start=line;continue;}
  need(!closed,'OUTPUT_CSV_TRAILING_TEXT',{line});cell+=c;started=true;
 }
 need(!quoted,'OUTPUT_CSV_UNCLOSED_QUOTE',{line});
 if(started||closed||cell.length||row.length)endRow();
 need(rows.length>0,'OUTPUT_CSV_EMPTY');const headers=rows.shift().values;
 need(headers.length>0&&headers.length<=1000&&headers.every(x=>x.length>0)&&new Set(headers).size===headers.length,'OUTPUT_HEADERS_INVALID');
 for(const r of rows)need(r.values.length===headers.length,'OUTPUT_ROW_WIDTH',{line:r.line,expected:headers.length,actual:r.values.length});
 return{headers,rows:rows.map((r,index)=>({ordinal:index+1,line:r.line,values:r.values,record:Object.fromEntries(headers.map((h,i)=>[h,r.values[i]]))}))};
}
function binding(value,headers,{allowLiteral=true}={}){
 exact(value,['column','literal'],'OUTPUT_BINDING_INVALID');
 need((Object.hasOwn(value,'column')?1:0)+(Object.hasOwn(value,'literal')?1:0)===1,'OUTPUT_BINDING_INVALID');
 if(Object.hasOwn(value,'column'))need(typeof value.column==='string'&&headers.includes(value.column),'OUTPUT_COLUMN_MISSING',{column:value.column});
 else need(allowLiteral&&(typeof value.literal==='string'||value.literal===null||typeof value.literal==='number'||typeof value.literal==='boolean'),'OUTPUT_LITERAL_INVALID');
 return value;
}
const bound=(spec,row)=>Object.hasOwn(spec,'column')?row[spec.column]:spec.literal;
function mapTable(table,plan){
 exact(plan,['schema','source','originals','run','candidate','protocol','mapping'],'OUTPUT_PLAN_FIELDS');
 need(plan.schema==='sf88-original-output-plan/v1','OUTPUT_PLAN_SCHEMA');
 const protocol=caseDefinition(plan.protocol),candidate=candidateDefinition(plan.candidate);
 const m=exact(plan.mapping,['delimiter','rowKeyColumns','selection','exclude','fields','denominator','missingTokens','missingReason'],'OUTPUT_MAPPING_FIELDS');
 need(Array.isArray(m.rowKeyColumns)&&m.rowKeyColumns.length>0&&new Set(m.rowKeyColumns).size===m.rowKeyColumns.length&&m.rowKeyColumns.every(x=>table.headers.includes(x)),'OUTPUT_ROW_KEY_REQUIRED');
 const fields=exact(m.fields,['criterionId','label','value','unit','definition','cohortRef'],'OUTPUT_METRIC_FIELDS');
 for(const key of ['criterionId','label','value','unit','definition','cohortRef'])binding(fields[key],table.headers,{allowLiteral:key!=='value'});
 need(plain(m.denominator)&&Object.keys(m.denominator).length>0,'OUTPUT_DENOMINATOR_REQUIRED');
 for(const v of Object.values(m.denominator))binding(v,table.headers);
 binding(m.missingReason,table.headers);need(Array.isArray(m.missingTokens)&&m.missingTokens.every(x=>typeof x==='string'),'OUTPUT_MISSING_TOKENS');
 const filters=m.selection??[];need(Array.isArray(filters)&&filters.every(f=>plain(f)&&Object.keys(f).every(k=>['column','values'].includes(k))&&table.headers.includes(f.column)&&Array.isArray(f.values)&&f.values.length>0&&f.values.every(v=>typeof v==='string')),'OUTPUT_SELECTION_INVALID');
 const exclusions=m.exclude??[];need(Array.isArray(exclusions),'OUTPUT_EXCLUSIONS_INVALID');
 const exclusionMap=new Map();for(const e of exclusions){exact(e,['key','reason','reviewer','reviewedAt'],'OUTPUT_EXCLUSION_FIELDS');need(Array.isArray(e.key)&&e.key.length===m.rowKeyColumns.length&&e.key.every(x=>typeof x==='string'),'OUTPUT_EXCLUSION_KEY');text(e.reason,'OUTPUT_EXCLUSION_REASON');text(e.reviewer,'OUTPUT_EXCLUSION_REVIEWER');need(new Date(e.reviewedAt).toISOString()===e.reviewedAt,'OUTPUT_EXCLUSION_TIME');const k=JSON.stringify(e.key);need(!exclusionMap.has(k),'OUTPUT_EXCLUSION_DUPLICATE');exclusionMap.set(k,e);}
 const criteria=new Map(protocol.criteria.map(c=>[c.id,c])),seen=new Set(),usedExclusions=new Set(),metrics=[],rows=[],issues=[];
 for(const entry of table.rows){
  const row=entry.record,key=m.rowKeyColumns.map(k=>row[k]),encoded=JSON.stringify(key),local=[];
  if(key.some(x=>x===''))local.push('ROW_KEY_EMPTY');
  if(seen.has(encoded))local.push('ROW_KEY_DUPLICATE');seen.add(encoded);
  const receipt={ordinal:entry.ordinal,line:entry.line,key,values:entry.values,disposition:'SELECTED',issues:local};
  const exclusion=exclusionMap.get(encoded);
  if(exclusion){receipt.disposition='EXCLUDED_BY_REVIEW';receipt.review=exclusion;usedExclusions.add(encoded);}
  else if(filters.some(f=>!f.values.includes(row[f.column]))){receipt.disposition='OUTSIDE_SELECTION';receipt.selection=filters;}
  if(receipt.disposition==='SELECTED'){
   const value=bound(fields.value,row),nullValue=m.missingTokens.includes(value),criterionId=bound(fields.criterionId,row),criterion=criteria.get(criterionId),unit=bound(fields.unit,row);
   if(!criterion||criterion.kind!=='MEASURED')local.push('MEASURED_CRITERION_UNMAPPED');
   if(criterion?.unit&&unit!==criterion.unit)local.push('METRIC_UNIT_MISMATCH');
   if(typeof value!=='string'||!nullValue&&!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value))local.push('EXACT_DECIMAL_REQUIRED');
   const definition=bound(fields.definition,row),label=bound(fields.label,row),cohortRef=bound(fields.cohortRef,row),reason=nullValue?bound(m.missingReason,row):'';
   for(const [field,v] of Object.entries({criterionId,unit,definition,label,cohortRef}))if(typeof v!=='string'||!v.trim())local.push('EMPTY_'+field.toUpperCase());
   if(nullValue&&(typeof reason!=='string'||!reason.trim()))local.push('UNDEFINED_REASON_REQUIRED');
   const denominator=Object.fromEntries(Object.entries(m.denominator).map(([name,b])=>[name,bound(b,row)]));
   if(Object.values(denominator).some(v=>v===null||v===''))local.push('DENOMINATOR_UNDEFINED');
   if(!local.length){const metric={id:'metric_'+digest(Buffer.from(encoded)),criterionId,label,value:nullValue?null:value,unit,undefinedReason:reason,definition,denominator,cohortRef,artifactIds:['original-table']};metrics.push(metric);receipt.metricId=metric.id;receipt.disposition=nullValue?'SELECTED_UNDEFINED':'SELECTED_VALUE';}
   else receipt.disposition='REVIEW_REQUIRED';
  }
  if(local.length)issues.push({ordinal:entry.ordinal,line:entry.line,key,issues:local});
  rows.push(receipt);
 }
 for(const [key,review]of exclusionMap)need(usedExclusions.has(key),'OUTPUT_EXCLUSION_NOT_FOUND',{key:review.key});
 need(table.rows.length>0,'OUTPUT_NO_SOURCE_ROWS');
 const coverage={sourceRows:rows.length,selectedValues:rows.filter(r=>r.disposition==='SELECTED_VALUE').length,selectedUndefined:rows.filter(r=>r.disposition==='SELECTED_UNDEFINED').length,excludedByReview:rows.filter(r=>r.disposition==='EXCLUDED_BY_REVIEW').length,outsideSelection:rows.filter(r=>r.disposition==='OUTSIDE_SELECTION').length,reviewRequired:issues.length};
 return{schema:'sf88-original-output-review/v1',status:issues.length?'REVIEW_REQUIRED':'READY',protocol,candidate,headers:table.headers,coverage,rows,issues,metrics};
}
async function prepareOutput(plan,{baseDirectory='.',readOriginal=original}={}){
 need(typeof readOriginal==='function','OUTPUT_ORIGINAL_READER_REQUIRED');
 const selectedRead=async(file,expected)=>{const body=await readOriginal(file,expected);need(Buffer.isBuffer(body)&&body.length===expected.bytes&&digest(body)===expected.sha256,'OUTPUT_ORIGINAL_FILE_CHANGED');return body;};
 need(plain(plan.source)&&typeof plan.source.file==='string','OUTPUT_SOURCE_REQUIRED');
 const source=await selectedRead(resolve(baseDirectory,plan.source.file),plan.source),table=csvRecords(utf8(source),{delimiter:plan.mapping?.delimiter??','});
 const mapped=mapTable(table,plan),artifacts=[{id:'original-table',path:'original/table.csv',role:'original measured output table',mediaType:plan.mapping.delimiter==='\t'?'text/tab-separated-values':'text/csv',...descriptor(source),bodyBase64:source.toString('base64')}];
 need(Array.isArray(plan.originals)&&plan.originals.length<=200,'OUTPUT_ORIGINALS_REQUIRED');let total=source.length;
 for(const spec of plan.originals){
  exact(spec,['id','file','path','role','mediaType','bytes','sha256'],'OUTPUT_ORIGINAL_FIELDS');id(spec.id);safePath(spec.path);
  need(!artifacts.some(a=>a.id===spec.id||a.path===spec.path),'OUTPUT_ORIGINAL_DUPLICATE');
  const body=await selectedRead(resolve(baseDirectory,spec.file),spec);total+=body.length;need(total<=LIMIT-1024*1024,'OUTPUT_ATTACHMENTS_TOO_LARGE');
  artifacts.push({id:spec.id,path:spec.path,role:text(spec.role,'OUTPUT_ROLE_REQUIRED'),mediaType:text(spec.mediaType,'OUTPUT_MEDIA_TYPE_REQUIRED'),...descriptor(body),bodyBase64:body.toString('base64')});
 }
 const planBody=bytes(plan);need(!artifacts.some(a=>a.id==='preparation-plan'||a.path==='preparation/plan.json'),'OUTPUT_RESERVED_PLAN_MEMBER');
 total+=planBody.length;need(total<=LIMIT-1024*1024,'OUTPUT_ATTACHMENTS_TOO_LARGE');
 artifacts.push({id:'preparation-plan',path:'preparation/plan.json',role:'complete selected preparation plan',mediaType:'application/json',...descriptor(planBody),bodyBase64:planBody.toString('base64')});
 const p=exact(plan.run,['externalRunId','kind','status','startedAt','finishedAt','elapsedMs','engine','input','limitations'],'OUTPUT_RUN_FIELDS');
 need(p.kind==='IMPORTED_MEASUREMENT'||p.kind==='SOURCE_NATIVE'||p.kind==='TRAINING_FIXTURE','OUTPUT_RUN_KIND');
 const review={...mapped,planSha256:digest(bytes(plan)),source:descriptor(source),originals:artifacts.map(({bodyBase64,...f})=>f)};
 let envelope=null;
 if(mapped.status==='READY'){
  need(mapped.metrics.length>0,'OUTPUT_NO_SELECTED_METRICS');
  const result={schema:'sf88-original-output-result/v1',source:review.source,originals:review.originals,headers:mapped.headers,coverage:mapped.coverage,rows:mapped.rows,mapping:plan.mapping,planSha256:review.planSha256,interpretation:'Values are preserved from the selected original producer output; no model, aggregate, currency or metric is calculated here.'};
  envelope={schema:'sf88-research-comparison-run/v1',...p,input:{...p.input,sourceRefs:sourceRefs(p.input.sourceRefs),artifactIds:artifacts.map(x=>x.id)},metrics:mapped.metrics,artifacts,result,limitations:[...p.limitations,'Original table values are not recalculated. Review source cohort, period, denominator, units and mapping before judging comparability.']};
  const raw=bytes(envelope);need(raw.length<=LIMIT,'OUTPUT_ENVELOPE_TOO_LARGE',{bytes:raw.length});parseRun(raw.toString('utf8'));
 }
 return{review,envelope};
}

// MIT. Readable complete original-output mapping review; retained values remain unchanged.
function reviewHtml(review){
 const data=Buffer.from(JSON.stringify(review)).toString('base64');
 return Buffer.from(String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'">
<title>Original output mapping review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#171717;font:15px/1.5 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:24px}h1{font-size:26px;margin:0 0 10px}h2{font-size:19px}.panel{background:white;border:1px solid #bbb;padding:18px;margin:16px 0}button,input,select{font:inherit;border:1px solid #777;padding:8px 11px;background:white;color:#111;min-height:40px}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #666;outline-offset:2px}button:disabled{opacity:.5;cursor:default}.controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.scroll{overflow:auto;border:1px solid #bbb;margin:12px 0}table{width:100%;min-width:760px;border-collapse:collapse}th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}th{background:#eee;white-space:nowrap}td{max-width:400px;overflow-wrap:break-word}.muted{color:#555}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;border:1px solid #ccc;padding:14px;max-height:70vh;overflow:auto}dialog{width:min(1000px,95vw);border:1px solid #777;padding:20px}dialog::backdrop{background:#0007}.count{font-variant-numeric:tabular-nums}.identity{font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}@media(max-width:600px){main{padding:14px}h1{font-size:22px}.panel{padding:12px}.controls input{width:100%}}@media print{.controls,button,dialog{display:none}.scroll{overflow:visible}main{max-width:none;padding:0}body{background:white}}
</style></head><body><main><h1>Original output mapping review</h1><p id="title"></p><p id="status"></p>
<section class="panel"><h2>Complete source coverage</h2><div id="counts"></div><p class="muted">Every original row remains in this review. A selected value is copied exactly from the producer output; missing values retain their explanation. No model, aggregate or currency calculation occurs here.</p><button id="protocol">Open protocol and candidate</button></section>
<section class="panel"><h2>Original rows</h2><div class="controls"><label for="search">Find in complete records</label><input id="search" type="search"><label for="state">Disposition</label><select id="state"><option value="">All rows</option><option>SELECTED_VALUE</option><option>SELECTED_UNDEFINED</option><option>EXCLUDED_BY_REVIEW</option><option>OUTSIDE_SELECTION</option><option>REVIEW_REQUIRED</option></select><button id="download">Download complete review JSON</button></div><div class="scroll" tabindex="0" role="region" aria-label="Original rows"><table><thead><tr><th>Source row</th><th>Original key</th><th>Disposition</th><th>Issues / reason</th><th>Complete record</th></tr></thead><tbody id="rows"></tbody></table></div><div class="controls"><button id="previous">Previous</button><span id="page" role="status"></span><button id="next">Next</button></div><p class="muted">The screen displays 50 rows per page. Search examines complete retained records. Downloads include all rows and all source values.</p></section>
<details class="panel"><summary>Original file inventory and plan identity</summary><pre id="source"></pre></details>
<p class="muted">Resolve mapping findings in an explicit new preparation plan. Receive the reviewed original output package through the existing Research comparison application, then record named judgments and decisions there.</p>
</main><dialog id="detail"><div class="controls"><h2 id="detail-title"></h2><button id="close">Close</button></div><pre id="detail-body"></pre></dialog><script type="application/octet-stream" id="data">__DATA__</script><script>
(()=>{'use strict';const raw=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(document.getElementById('data').textContent),c=>c.charCodeAt(0))),r=JSON.parse(raw),$=id=>document.getElementById(id);let offset=0;
$('title').textContent=r.protocol.title+' / '+r.candidate.name+' / '+r.candidate.version;$('status').textContent=r.status==='READY'?'Ready for original-dossier receiving. Inspect selected definitions and every source disposition before importing.':'Mapping review required. The original source is retained; this edition has no importable measured-run envelope.';
$('counts').textContent=Object.entries(r.coverage).map(([k,v])=>k.replace(/[A-Z]/g,c=>' '+c.toLowerCase())+': '+v).join(' · ');$('source').textContent=JSON.stringify({planSha256:r.planSha256,source:r.source,originals:r.originals},null,2);
function show(title,value){$('detail-title').textContent=title;$('detail-body').textContent=JSON.stringify(value,null,2);$('detail').showModal();}$('close').onclick=()=>$('detail').close();$('protocol').onclick=()=>show('Protocol and candidate',{protocol:r.protocol,candidate:r.candidate});
function render(){const query=$('search').value.toLowerCase(),state=$('state').value,all=r.rows.filter(x=>(!state||x.disposition===state)&&(!query||JSON.stringify(x).toLowerCase().includes(query)));offset=Math.max(0,Math.min(offset,Math.max(0,Math.ceil(all.length/50)-1)*50));$('rows').replaceChildren();for(const x of all.slice(offset,offset+50)){const tr=document.createElement('tr');for(const value of [x.ordinal+' / line '+x.line,JSON.stringify(x.key),x.disposition,x.issues.join(', ')||x.review?.reason||'']){const td=document.createElement('td');td.textContent=value;tr.append(td);}const td=document.createElement('td'),button=document.createElement('button');button.textContent='Open row';button.onclick=()=>show('Original row '+x.ordinal,{...x,source:Object.fromEntries(r.headers.map((h,i)=>[h,x.values[i]])),metric:r.metrics.find(m=>m.id===x.metricId)||null});td.append(button);tr.append(td);$('rows').append(tr);}if(!all.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='No rows match this view.';tr.append(td);$('rows').append(tr);}$('page').textContent=(all.length?offset+1:0)+'–'+Math.min(offset+50,all.length)+' of '+all.length+' matching rows; '+r.rows.length+' total.';$('previous').disabled=offset===0;$('next').disabled=offset+50>=all.length;}
$('search').oninput=()=>{offset=0;render();};$('state').onchange=()=>{offset=0;render();};$('previous').onclick=()=>{offset-=50;render();};$('next').onclick=()=>{offset+=50;render();};$('download').onclick=()=>{const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='complete-original-output-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};render();})();
</script></body></html>
`.replace('__DATA__',data));
}

return {csvRecords,mapTable,prepareOutput,reviewHtml};
 })();
 return {...contract,...preparing,Buffer,resolve};
}
