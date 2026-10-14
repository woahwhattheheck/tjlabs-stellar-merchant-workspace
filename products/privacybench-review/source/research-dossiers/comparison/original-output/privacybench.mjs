// MIT. Receive documented PrivacyBench native result fields without executing its evaluator.
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {open,readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {original,retain,publishPrepared,prepareOutput} from './prepare.mjs';

export const PRIVACYBENCH_LIMITS=Object.freeze({resultBytes:33554432,totalFileBytes:66060288,encodedRunBytes:67108864,metricRows:10000,additionalOriginalFiles:190});
export const PRIVACYBENCH_PRODUCER=Object.freeze({repository:'TonicAI/privacy_bench_metrics',commit:'5dfcaf57f0dae69b77d819ef04558944d31015de',format:'native'});
export const PRIVACYBENCH_PROFILE='native-results-5dfcaf57';
const LIMIT=PRIVACYBENCH_LIMITS.resultBytes;
const COUNTS=['gold','detected','coherent','incoherent','skipped'];
const RATES=['ner_recall','synthesis_accuracy','combined_accuracy'];
const GROUPS=['overall','by_label','by_kind','per_character','per_org_group'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const need=(x,code,details={})=>{if(!x)throw Object.assign(new Error(code),{code,details});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const descriptor=b=>({bytes:b.length,sha256:sha(b)});
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const cell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
const text=(x,code,max=20000)=>{need(typeof x==='string'&&x.trim()&&x.length<=max,code);return x;};
const exact=(x,keys,code)=>{need(plain(x)&&Object.keys(x).every(k=>keys.includes(k)),code);return x;};
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** Strict JSON parser retaining exact number lexemes by RFC6901 pointer.
 * Duplicate keys are rejected, including escaped-equivalent names.
 * The complete original UTF-8 remains an artifact; no provider number is rounded.
 */
export function parseNativeJson(rawText){
 need(typeof rawText==='string'&&Buffer.byteLength(rawText)<=LIMIT,'PRIVACYBENCH_INPUT_LIMIT');
 need(Buffer.from(rawText,'utf8').toString('utf8')===rawText,'PRIVACYBENCH_UTF8');
 let at=0,nodes=0;const lexemes=new Map();
 const ws=()=>{while(/[\t\n\r ]/.test(rawText[at]??'')&&at<rawText.length)at++;};
 const string=()=>{const start=at++;let escaped=false;while(at<rawText.length){const c=rawText[at++];if(!escaped&&c==='"'){try{return JSON.parse(rawText.slice(start,at));}catch{need(false,'PRIVACYBENCH_JSON_STRING');}}if(!escaped&&c==='\\')escaped=true;else escaped=false;}need(false,'PRIVACYBENCH_JSON_STRING');};
 const value=(pointer,depth=0)=>{
  ws();need(depth<=100&&++nodes<=1000000,'PRIVACYBENCH_JSON_LIMIT');
  const c=rawText[at];
  if(c==='"')return string();
  if(c==='{'){
   at++;ws();const result=Object.create(null),seen=new Set();if(rawText[at]==='}'){at++;return result;}
   for(;;){ws();need(rawText[at]==='"','PRIVACYBENCH_JSON_KEY');const key=string();need(!seen.has(key),'PRIVACYBENCH_JSON_DUPLICATE',{pointer,key});seen.add(key);ws();need(rawText[at++]===':','PRIVACYBENCH_JSON_COLON');result[key]=value(pointer+'/'+escape(key),depth+1);ws();const sep=rawText[at++];if(sep==='}')return result;need(sep===',','PRIVACYBENCH_JSON_SEPARATOR');}
  }
  if(c==='['){at++;ws();const result=[];if(rawText[at]===']'){at++;return result;}for(;;){result.push(value(pointer+'/'+result.length,depth+1));ws();const sep=rawText[at++];if(sep===']')return result;need(sep===',','PRIVACYBENCH_JSON_SEPARATOR');}}
  for(const [token,result] of [['true',true],['false',false],['null',null]])if(rawText.startsWith(token,at)){at+=token.length;if(token==='null')lexemes.set(pointer,null);return result;}
  const m=rawText.slice(at).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
  need(m,'PRIVACYBENCH_JSON_VALUE',{pointer});at+=m[0].length;lexemes.set(pointer,m[0]);return Number(m[0]);
 };
 const result=value('');ws();need(at===rawText.length&&plain(result),'PRIVACYBENCH_JSON_TRAILING');
 return {value:result,lexemes};
}

const definitions={
 gold:'Original count of in-scope gold spans in this group.',
 detected:'Original count of gold spans detected with the matching entity label and native-coordinate overlap.',
 coherent:'Original count of detected gold spans with a changed replacement judged coherent.',
 incoherent:'Original count of detected gold spans left identical or judged incoherent.',
 skipped:'Original count of detected changed spans lacking a usable judge verdict; these remain in the detected denominator.',
 ner_recall:'Original detected/gold rate. Detection requires the producer label and native-coordinate overlap contract.',
 synthesis_accuracy:'Original coherent/detected rate. Identity mappings and unjudged detected spans do not become successful synthesis.',
 combined_accuracy:'Original coherent/gold rate. This includes detection misses in its original gold-span denominator.'
};
export function privacyBenchCriteria(){
 return [...COUNTS,...RATES].map(k=>({id:'privacybench.'+k,label:k.replace(/_/g,' '),kind:'MEASURED',
  unit:COUNTS.includes(k)?'span_count':'fraction',direction:RATES.includes(k)?'HIGHER':'DESCRIPTIVE',description:definitions[k]}));
}

/** All declared native groups become rows. Nothing is pooled, averaged or recomputed. */
export function privacyBenchTable(rawText,{datasetId,datasetRevision,cohortRef}){
 text(datasetId,'PRIVACYBENCH_DATASET_REQUIRED',500);text(datasetRevision,'PRIVACYBENCH_DATASET_REVISION_REQUIRED',1000);text(cohortRef,'PRIVACYBENCH_COHORT_REQUIRED',1000);
 const {value:root,lexemes}=parseNativeJson(rawText),m=root.metrics;
 need(plain(root.config)&&root.config.format==='native'&&plain(m),'PRIVACYBENCH_NATIVE_FORMAT_REQUIRED');
 text(root.config.run_name,'PRIVACYBENCH_RUN_NAME_REQUIRED',1000);
 need(typeof m.judge_skipped==='boolean','PRIVACYBENCH_JUDGE_STATE_REQUIRED');
 need(typeof root.config.overlap_threshold==='number'&&Number.isFinite(root.config.overlap_threshold)
  &&root.config.overlap_threshold>=0&&root.config.overlap_threshold<=1,'PRIVACYBENCH_OVERLAP_THRESHOLD');
 need(plain(root.native_join)&&plain(root.detail),'PRIVACYBENCH_COMPLETE_RESULT_REQUIRED');
 const rows=[],blockInventory=[];
 const scalar=(block,key,pointer,isCount)=>{
  need(Object.hasOwn(block,key)&&lexemes.has(pointer),'PRIVACYBENCH_METRIC_MISSING',{pointer});
  const token=lexemes.get(pointer),v=block[key];
  need(isCount?typeof token==='string'&&/^(?:0|[1-9][0-9]*)$/.test(token):token===null||typeof token==='string'&&Number.isFinite(v)&&v>=0&&v<=1,
       'PRIVACYBENCH_METRIC_TYPE',{pointer});
  return token;
 };
 const add=(block,path,dimension,group,label,rates)=>{
  need(plain(block),'PRIVACYBENCH_METRIC_BLOCK',{path});
  const countTokens=Object.fromEntries(COUNTS.map(k=>[k,scalar(block,k,path+'/'+k,true)]));
  const allowed=[...COUNTS,...(rates?RATES:[])];
  need(Object.keys(block).every(k=>allowed.includes(k)),'PRIVACYBENCH_UNRECOGNIZED_BLOCK_FIELD',{path,keys:Object.keys(block)});
  blockInventory.push({pointer:path,dimension,group,label,measures:allowed});
  for(const measure of allowed){
   const pointer=path+'/'+measure,value=COUNTS.includes(measure)?countTokens[measure]:scalar(block,measure,pointer,false);
   const denominatorName=measure==='synthesis_accuracy'?'detected':'gold',denominator=countTokens[denominatorName];
   let reason='';
   if(value===null){
    if(m.judge_skipped&&measure!=='ner_recall')reason='Producer reports that the LLM judge was skipped; original rate is unavailable.';
    else if(denominator==='0')reason='The original '+denominatorName+' denominator is zero.';
    else reason='Producer supplied a null rate. Retain the full original result and review its detail; no replacement value is inferred.';
   }
   rows.push({dataset_id:datasetId,dataset_revision:datasetRevision,dimension,group,label,measure,
    criterion_id:'privacybench.'+measure,value:value===null?'':value,unit:COUNTS.includes(measure)?'span_count':'fraction',
    definition:definitions[measure],denominator_name:denominatorName,denominator_value:denominator,
    original_gold:countTokens.gold,original_detected:countTokens.detected,
    judge_skipped:String(m.judge_skipped),overlap_threshold:lexemes.get('/config/overlap_threshold'),
    cohort_ref:cohortRef,source_pointer:pointer,source_run_name:root.config.run_name,undefined_reason:reason});
   need(rows.length<=10000,'PRIVACYBENCH_RESEARCH_ROW_LIMIT');
  }
 };
 add(m.overall,'/metrics/overall','overall','all','all',true);
 for(const family of ['by_label','by_kind']){
  need(plain(m[family]),'PRIVACYBENCH_GROUP_REQUIRED',{family});
  for(const [key,block] of Object.entries(m[family]))add(block,'/metrics/'+family+'/'+escape(key),family,key,family==='by_label'?key:'all',true);
 }
 for(const family of ['per_character','per_org_group']){
  need(plain(m[family]),'PRIVACYBENCH_GROUP_REQUIRED',{family});
  for(const [key,group] of Object.entries(m[family])){
   need(plain(group)&&plain(group.by_label)&&Object.keys(group).every(k=>k==='by_label'),'PRIVACYBENCH_OWNER_BLOCK',{family,key});
   for(const [label,block]of Object.entries(group.by_label))add(block,'/metrics/'+family+'/'+escape(key)+'/by_label/'+escape(label),family,key,label,false);
  }
 }
 need(rows.length>0,'PRIVACYBENCH_EMPTY_RESULT');
 const headers=Object.keys(rows[0]),csv=headers.map(cell).join(',')+'\n'+rows.map(r=>headers.map(k=>cell(r[k])).join(',')).join('\n')+'\n';
 return {csv,rows,review:{schema:'sf88-privacybench-native-intake/v1',profile:'native-results-5dfcaf57',
  source:descriptor(Buffer.from(rawText)),sourceRunName:root.config.run_name,config:root.config,
  dataset:{id:datasetId,revision:datasetRevision},cohortRef,blocks:blockInventory,
  metricRows:rows.length,judgeSkipped:m.judge_skipped,
  originalSections:Object.keys(m),projectedSections:GROUPS,
  limitations:[
   'Every numeric value is the exact original JSON number lexeme; no metric or aggregate is calculated.',
   'Per-character groups can overlap. File-kind message/document rollups overlap their component groups. Do not sum these rows.',
   'Generated-gold native recall is distinct from precision/F1 on exhaustive human annotations. This profile does not import run_ner_eval output.',
   'Protocol v1 and v2 datasets are not interchangeable. Dataset revision, native matcher threshold, labels and judge configuration travel with each candidate.',
   'Benchmark data is synthetic; the original vendor results do not prove production privacy, regulatory compliance or customer acceptance.'
  ]}};
}

export function buildPrivacyBenchPlan(rawText,selection,{sourceImplementation}={}){
 exact(selection,['schema','dataset','cohortRef','results','originals','protocol','candidate','run','reviewer','reviewedAt'],'PRIVACYBENCH_SELECTION_FIELDS');
 need(selection.schema==='sf88-privacybench-preparation/v1','PRIVACYBENCH_SELECTION_SCHEMA');
 exact(selection.dataset,['id','revision'],'PRIVACYBENCH_DATASET');
 text(selection.reviewer,'PRIVACYBENCH_REVIEWER_REQUIRED',240);
 need(typeof selection.reviewedAt==='string'&&Number.isFinite(Date.parse(selection.reviewedAt))&&new Date(selection.reviewedAt).toISOString()===selection.reviewedAt,'PRIVACYBENCH_REVIEW_TIME');
 exact(selection.results,['file','bytes','sha256'],'PRIVACYBENCH_RESULTS_DESCRIPTOR');
 text(selection.results.file,'PRIVACYBENCH_RESULTS_FILE_REQUIRED',4096);
 const originalBytes=Buffer.from(rawText);need(same(descriptor(originalBytes),{bytes:selection.results.bytes,sha256:selection.results.sha256}),'PRIVACYBENCH_RESULTS_CHANGED');
 const table=privacyBenchTable(rawText,{datasetId:selection.dataset.id,datasetRevision:selection.dataset.revision,cohortRef:selection.cohortRef});
 const criteria=privacyBenchCriteria();
 if(sourceImplementation)table.review.sourceImplementation=structuredClone(sourceImplementation);
 need(plain(selection.protocol)&&Array.isArray(selection.protocol.criteria),'PRIVACYBENCH_PROTOCOL_REQUIRED');
 for(const expected of criteria){const actual=selection.protocol.criteria.find(x=>x.id===expected.id);need(actual&&same(actual,expected),'PRIVACYBENCH_EXPLICIT_CRITERION_REQUIRED',{criterion:expected.id});}
 need(plain(selection.run)&&selection.run.kind==='IMPORTED_MEASUREMENT'||plain(selection.run)&&selection.run.kind==='TRAINING_FIXTURE','PRIVACYBENCH_IMPORT_KIND');
 need(plain(selection.run.input)&&plain(selection.run.input.definition),'PRIVACYBENCH_RUN_CONTEXT');
 need(plain(selection.candidate)&&plain(selection.candidate.configuration),'PRIVACYBENCH_CANDIDATE_REQUIRED');
 const providerBinding={profile:table.review.profile,dataset:selection.dataset,cohortRef:selection.cohortRef,
  originalResult:table.review.source,producerConfig:table.review.config,reviewer:selection.reviewer,reviewedAt:selection.reviewedAt,...(sourceImplementation?{sourceImplementation:structuredClone(sourceImplementation)}:{})};
 for(const owner of [selection.candidate.configuration,selection.run.input.definition])
  need(!Object.hasOwn(owner,'privacybench')||same(owner.privacybench,providerBinding),'PRIVACYBENCH_EXISTING_BINDING_CHANGED');
 const csvBytes=Buffer.from(table.csv),plan={
  schema:'sf88-original-output-plan/v1',source:{file:'metrics.csv',...descriptor(csvBytes)},
  originals:[{id:'privacybench-results',file:'results.json',path:'provider/results.json',role:'complete original provider native evaluation result',mediaType:'application/json',...descriptor(originalBytes)},
    {id:'privacybench-intake',file:'provider-review.json',path:'provider/intake-review.json',role:'complete original-field projection and source review',mediaType:'application/json',...descriptor(bytes(table.review))}],
  protocol:structuredClone(selection.protocol),
  candidate:{...structuredClone(selection.candidate),configuration:{...structuredClone(selection.candidate.configuration),privacybench:providerBinding}},
  run:{...structuredClone(selection.run),input:{...structuredClone(selection.run.input),definition:{...structuredClone(selection.run.input.definition),privacybench:providerBinding}},
    limitations:[...(selection.run.limitations??[]),...table.review.limitations]},
  mapping:{delimiter:',',rowKeyColumns:['dataset_id','dataset_revision','dimension','group','label','measure'],
   selection:[],exclude:[],fields:Object.fromEntries(Object.entries({criterionId:'criterion_id',label:'measure',value:'value',unit:'unit',definition:'definition',cohortRef:'cohort_ref'}).map(([k,v])=>[k,{column:v}])),
   denominator:Object.fromEntries(['denominator_name','denominator_value','original_gold','original_detected','dataset_id','dataset_revision','dimension','group','label','judge_skipped','overlap_threshold','source_pointer'].map(k=>[k,{column:k}])),
   missingTokens:[''],missingReason:{column:'undefined_reason'}}};
 need(Array.isArray(selection.originals)&&selection.originals.length<=190,'PRIVACYBENCH_ORIGINALS_REQUIRED');
 for(let i=0;i<selection.originals.length;i++){
  const f=selection.originals[i];exact(f,['id','file','path','role','mediaType','bytes','sha256'],'PRIVACYBENCH_ORIGINAL_DESCRIPTOR');
  need(!['privacybench-results','privacybench-intake','original-table','preparation-plan'].includes(f.id),'PRIVACYBENCH_RESERVED_MEMBER');
  plan.originals.push({...structuredClone(f),file:'originals/'+i});
 }
 return {table,plan};
}

/** Actual installed implementation identity, also retained in provider artifacts and run/candidate definitions. */
export async function privacyBenchImplementation(){
 const files=[];
 for(const name of ['privacybench.mjs','privacybench-routes.mjs','prepare.mjs','desk-routes.mjs','review.mjs','../contracts.mjs']){
  const body=await readFile(fileURLToPath(new URL(name,import.meta.url)));
  files.push({path:name,...descriptor(body)});
 }
 return {schema:'sf88-privacybench-output-source/v1',profile:PRIVACYBENCH_PROFILE,producer:{...PRIVACYBENCH_PRODUCER},files};
}
export function isPrivacyBenchPlan(plan){
 return plan?.candidate?.configuration?.privacybench?.profile===PRIVACYBENCH_PROFILE
  ||plan?.run?.input?.definition?.privacybench?.profile===PRIVACYBENCH_PROFILE;
}
export function privacyBenchCatalog(sourceImplementation){
 return {schema:'sf88-privacybench-output-catalog/v1',profile:PRIVACYBENCH_PROFILE,
  producer:{...PRIVACYBENCH_PRODUCER},criteria:privacyBenchCriteria(),limits:{...PRIVACYBENCH_LIMITS},sourceImplementation};
}
export function privacyBenchUtf8(body){
 let value;try{value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);}catch{need(false,'PRIVACYBENCH_UTF8');}
 need(Buffer.from(value).equals(body),'PRIVACYBENCH_UTF8');return value;
}
/** Bounded exact named-file intake for the installed read-only CLI. */
export async function readPrivacyBenchFile(file,maximum=LIMIT){
 const before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size<=BigInt(maximum),'PRIVACYBENCH_FILE_LIMIT');
 let h;try{
  h=await open(file,'r');const opened=await h.stat({bigint:true});
  const keys=['dev','ino','size','mtimeNs','ctimeNs'];
  need(keys.every(k=>before[k]===opened[k]),'PRIVACYBENCH_FILE_CHANGED');
  const chunks=[];let length=0;
  for await(const chunk of h.createReadStream({autoClose:false})){length+=chunk.length;need(length<=maximum&&length<=Number(before.size),'PRIVACYBENCH_FILE_CHANGED');chunks.push(chunk);}
  const after=await h.stat({bigint:true}),named=await lstat(file,{bigint:true});
  need(keys.every(k=>before[k]===after[k]&&after[k]===named[k])&&!named.isSymbolicLink()&&length===Number(before.size),'PRIVACYBENCH_FILE_CHANGED');
  return Buffer.concat(chunks,length);
 }finally{await h?.close();}
}
/** Complete validated preparation in memory. Every selected original is read once before any publication. */
export async function materializePrivacyBench(selection,{readOriginal,sourceImplementation}={}){
 need(typeof readOriginal==='function','PRIVACYBENCH_ORIGINAL_READER_REQUIRED');
 need(plain(selection)&&plain(selection.results)&&Array.isArray(selection.originals)&&selection.originals.length<=190,'PRIVACYBENCH_SELECTION_FIELDS');
 const specifications=[selection.results,...selection.originals];let declared=0;
 for(const f of specifications){
  need(plain(f)&&typeof f.file==='string'&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256),'PRIVACYBENCH_ORIGINAL_DESCRIPTOR');
  declared+=f.bytes;need(Number.isSafeInteger(declared)&&declared<=PRIVACYBENCH_LIMITS.totalFileBytes,'PRIVACYBENCH_TOTAL_FILE_LIMIT');
 }
 need(selection.results.bytes<=LIMIT,'PRIVACYBENCH_INPUT_LIMIT');
 const selected=[];
 for(let i=0;i<specifications.length;i++){
  const spec=specifications[i],body=await readOriginal(spec.file,spec,i===0?LIMIT:PRIVACYBENCH_LIMITS.totalFileBytes);
  need(Buffer.isBuffer(body)&&same(descriptor(body),{bytes:spec.bytes,sha256:spec.sha256}),'PRIVACYBENCH_ORIGINAL_CHANGED',{file:spec.file});
  selected.push(body);
 }
 const {table,plan}=buildPrivacyBenchPlan(privacyBenchUtf8(selected[0]),selection,{sourceImplementation});
 const files=[
  {path:'metrics.csv',name:'metrics.csv',body:Buffer.from(table.csv)},
  {path:'results.json',name:'results.json',body:selected[0]},
  {path:'provider-review.json',name:'provider-review.json',body:bytes(table.review)},
  ...selection.originals.map((f,i)=>({path:'originals/'+i,name:f.path.split(/[\\/]/).at(-1)||f.id,body:selected[i+1]}))
 ].map(f=>({...f,...descriptor(f.body)}));
 const total=files.reduce((n,f)=>n+f.bytes,0)+bytes(plan).length;
 need(total<=PRIVACYBENCH_LIMITS.totalFileBytes,'PRIVACYBENCH_TOTAL_FILE_LIMIT',{bytes:total});
 const base=resolve('/privacybench-selected-inputs'),byPath=new Map(files.map(f=>[resolve(base,f.path),f]));
 const prepared=await prepareOutput(plan,{baseDirectory:base,readOriginal:async(path,expected)=>{
  const f=byPath.get(path);need(f&&f.bytes===expected.bytes&&f.sha256===expected.sha256,'PRIVACYBENCH_GENERATED_FILE_CHANGED');return f.body;
 }});
 const rawText=prepared.envelope?JSON.stringify(prepared.envelope,null,2)+'\n':null;
 need(!rawText||Buffer.byteLength(rawText)<=PRIVACYBENCH_LIMITS.encodedRunBytes,'PRIVACYBENCH_ENCODED_RUN_LIMIT');
 return {plan,files,providerReview:table.review,review:prepared.review,rawIdentity:rawText?descriptor(Buffer.from(rawText)):null};
}
export async function preparePrivacyBench(selection,{baseDirectory='.',directory}={}){
 need(directory,'PRIVACYBENCH_DIRECTORY_REQUIRED');directory=resolve(directory);
 const sourceImplementation=await privacyBenchImplementation();
 const prepared=await materializePrivacyBench(selection,{sourceImplementation,
  readOriginal:(file,expected,maximum)=>original(resolve(baseDirectory,file),expected,maximum)});
 // Bounds and full native run validation precede the first saved intent.
 await retain(resolve(directory,'source-intent.json'),bytes({schema:selection.schema,selection:structuredClone(selection),sourceImplementation}));
 for(const f of prepared.files)await retain(resolve(directory,f.path),f.body);
 await retain(resolve(directory,'selected-plan.json'),bytes(prepared.plan));
 const result=await publishPrepared(resolve(directory,'prepared'),prepared.plan,{baseDirectory:directory});
 return {...result,provider:prepared.providerReview,sourceImplementation,sourceSelection:descriptor(bytes(selection))};
}
