// MIT. Exact original table output -> existing Research comparison run; no metric calculation.
import {readFile,open,lstat,mkdir,rename,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath} from '../contracts.mjs';
import {reviewHtml} from './review.mjs';
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
export async function original(file,expected,maximum=LIMIT){
 need(plain(expected)&&Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&expected.bytes<=maximum&&/^[a-f0-9]{64}$/.test(expected.sha256),'OUTPUT_ORIGINAL_IDENTITY_REQUIRED');
 const named=await lstat(file,{bigint:true});need(named.isFile()&&!named.isSymbolicLink()&&named.size===BigInt(expected.bytes),'OUTPUT_ORIGINAL_FILE_CHANGED');
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const before=await handle.stat({bigint:true});need(before.dev===named.dev&&before.ino===named.ino&&before.size===named.size,'OUTPUT_ORIGINAL_FILE_CHANGED');
  const chunks=[];let length=0;const hash=createHash('sha256');
  for await(const chunk of handle.createReadStream({autoClose:false})){length+=chunk.length;need(length<=maximum&&length<=expected.bytes,'OUTPUT_ORIGINAL_TOO_LARGE');hash.update(chunk);chunks.push(chunk);}
  const after=await handle.stat({bigint:true}),now=await lstat(file,{bigint:true});
  need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]&&after[k]===now[k])&&length===expected.bytes&&hash.digest('hex')===expected.sha256,'OUTPUT_ORIGINAL_FILE_CHANGED');
  return Buffer.concat(chunks,length);
 }finally{await handle.close();}
}
function utf8(body){let result;try{result=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);}catch{need(false,'OUTPUT_UTF8_INVALID');}need(Buffer.from(result).equals(body),'OUTPUT_UTF8_INVALID');return result;}
export function csvRecords(input,{delimiter=',',maximumRows=10000}={}){
 need([',','\t',';'].includes(delimiter),'OUTPUT_DELIMITER_INVALID');
 let at=0,line=1,start=1,cell='',row=[],quoted=false,closed=false,started=false;const rows=[];
 if(input.charCodeAt(0)===0xfeff)at=1;
 const endCell=()=>{row.push(cell);cell='';closed=false;started=false;};
 const endRow=()=>{endCell();rows.push({line:start,values:row});need(rows.length<=maximumRows+1,'OUTPUT_ROW_LIMIT');row=[];};
 while(at<input.length){
  const c=input[at++];
  if(quoted){if(c==='"'){if(input[at]==='"'){cell+='"';at++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
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
export function mapTable(table,plan){
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
export async function prepareOutput(plan,{baseDirectory='.',readOriginal=original}={}){
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
export async function retain(file,body){
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 const tmp=join(dirname(file),'.'+randomUUID()+'.partial');let h;
 try{
  h=await open(tmp,'wx',0o600);await h.writeFile(body);await h.sync();await h.close();h=null;
  try{await link(tmp,file);}catch(e){if(e.code!=='EEXIST')throw e;await original(file,descriptor(body),Math.max(LIMIT,body.length));}
  const dir=await open(dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
 }finally{await h?.close();await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 return{file,...descriptor(body)};
}
export async function publishPrepared(out,plan,{baseDirectory='.'}={}){
 out=resolve(out);const prepared=await prepareOutput(plan,{baseDirectory}),planBody=bytes(plan);
 const files={'plan.json':planBody,'review.json':bytes(prepared.review),'review.html':reviewHtml(prepared.review)};
 if(prepared.envelope)files['run.json']=bytes(prepared.envelope);
 const manifest={schema:'sf88-original-output-package/v1',status:prepared.review.status,planSha256:digest(planBody),files:Object.entries(files).map(([path,body])=>({path,...descriptor(body)}))};
 // Complete edition is immutable; interrupted writes are byte-checked on the original path.
 await mkdir(out,{recursive:true,mode:0o700});const target=await lstat(out);need(target.isDirectory()&&!target.isSymbolicLink()&&(target.mode&0o077)===0,'OUTPUT_DIRECTORY_INVALID');
 await retain(join(out,'intent.json'),bytes({schema:manifest.schema,planSha256:manifest.planSha256}));
 for(const [path,body]of Object.entries(files))await retain(join(out,path),body);
 await retain(join(out,'manifest.json'),bytes(manifest));
 return{...manifest,directory:out,coverage:prepared.review.coverage};
}
export async function main(argv=process.argv.slice(2)){
 const{values:v}=parseArgs({args:argv,options:{plan:{type:'string'},out:{type:'string'}},strict:true});
 need(v.plan&&v.out,'OUTPUT_PLAN_AND_DIRECTORY_REQUIRED');const file=resolve(v.plan),b=await readFile(file);need(b.length<=4*1024*1024,'OUTPUT_PLAN_TOO_LARGE');
 const result=await publishPrepared(resolve(v.out),JSON.parse(utf8(b).replace(/^\uFEFF/,'')),{baseDirectory:dirname(file)});process.stdout.write(bytes(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.code??'OUTPUT_PREPARATION_FAILED',details:e.details??{}})+'\n');process.exitCode=1;});
