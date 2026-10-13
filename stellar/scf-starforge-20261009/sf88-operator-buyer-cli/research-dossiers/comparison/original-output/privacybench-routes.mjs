// SPDX-License-Identifier: MIT
// Read-only provider preparation inside the original authenticated Research listener.
import {createHash} from 'node:crypto';
import {caseDefinition,safePath} from '../contracts.mjs';
import {privacyBenchCatalog,privacyBenchCriteria,privacyBenchTable,privacyBenchUtf8,
 privacyBenchImplementation,materializePrivacyBench,PRIVACYBENCH_LIMITS} from './privacybench.mjs';
export const PRIVACYBENCH_REQUEST_LIMIT=128*1024*1024+65536;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const fields=(x,keys)=>need(plain(x)&&Object.keys(x).every(k=>keys.includes(k)),'PRIVACYBENCH_REQUEST_FIELDS');
const digest=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function identity(value,maximum){
 fields(value,['path','name','bytes','sha256','bodyBase64']);safePath(value.path);
 need(typeof value.name==='string'&&value.name.length>0&&value.name.length<=500,'PRIVACYBENCH_FILENAME');
 need(Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=maximum&&/^[a-f0-9]{64}$/.test(value.sha256)
  &&typeof value.bodyBase64==='string'&&value.bodyBase64.length===4*Math.ceil(value.bytes/3),'PRIVACYBENCH_FILE_IDENTITY');
}
function file(value,maximum){
 identity(value,maximum);const body=Buffer.from(value.bodyBase64,'base64');
 need(body.toString('base64')===value.bodyBase64&&body.length===value.bytes&&digest(body)===value.sha256,'PRIVACYBENCH_FILE_CHANGED');
 return {...value,body};
}
const visible=({path,name,bytes,sha256})=>({path,name,bytes,sha256});
export async function handlePrivacyBenchRoute({store,dossierId,action,req,url,readBody,send,setHeader}){
 const actions=['comparison/output/privacybench/catalog','comparison/output/privacybench/profile','comparison/output/privacybench/prepare'];
 if(!actions.includes(action))return false;
 if(req.method!=='POST'){send(405,{error:'PRIVACYBENCH_METHOD_NOT_ALLOWED'});return true;}
 try{
  for(const [key]of url.searchParams)need(['projection','sourceProjection'].includes(key),'PRIVACYBENCH_QUERY_INVALID');
  const current=await store.getMetadata(dossierId),body=await readBody(req,PRIVACYBENCH_REQUEST_LIMIT);
  const sourceImplementation=await privacyBenchImplementation();
  if(action.endsWith('/catalog')){
   fields(body,[]);setHeader('X-Research-Dossier-Revision',String(current.revision));
   send(200,{...privacyBenchCatalog(sourceImplementation),dossierId,revision:current.revision});return true;
  }
  if(action.endsWith('/profile')){
   fields(body,['file','dataset','cohortRef']);fields(body.dataset,['id','revision']);
   const selected=file(body.file,PRIVACYBENCH_LIMITS.resultBytes);
   const table=privacyBenchTable(privacyBenchUtf8(selected.body),{datasetId:body.dataset.id,datasetRevision:body.dataset.revision,cohortRef:body.cohortRef});
   const providerReview={...table.review,sourceImplementation};
   setHeader('X-Research-Dossier-Revision',String(current.revision));
   send(200,{schema:'sf88-privacybench-output-profile/v1',dossierId,revision:current.revision,source:visible(selected),
    providerReview,criteria:privacyBenchCriteria(),rows:table.rows,metricRows:table.rows.length,sourceImplementation});return true;
  }
  fields(body,['requestId','expectedRevision','caseId','caseVersionId','selection','files']);
  need(typeof body.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(body.requestId),'PRIVACYBENCH_REQUEST_ID');
  need(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=1&&body.expectedRevision<=current.revision,'PRIVACYBENCH_REVISION');
  const page=await store.comparison(dossierId,{revision:body.expectedRevision,caseId:body.caseId,caseVersionId:body.caseVersionId,section:'overview',offset:0,limit:1});
  need(page.case?.id===body.caseId&&page.case.versionId===body.caseVersionId,'PRIVACYBENCH_PROTOCOL_CHANGED');
  need(same(caseDefinition(body.selection?.protocol),page.case.definition),'PRIVACYBENCH_PROTOCOL_CHANGED');
  need(Array.isArray(body.files)&&body.files.length>=1&&body.files.length<=191,'PRIVACYBENCH_FILES_REQUIRED');
  let total=0;const paths=new Set();
  for(const f of body.files){identity(f,PRIVACYBENCH_LIMITS.totalFileBytes);need(!paths.has(f.path),'PRIVACYBENCH_DUPLICATE_FILE');paths.add(f.path);
   total+=f.bytes;need(total<=PRIVACYBENCH_LIMITS.totalFileBytes,'PRIVACYBENCH_TOTAL_FILE_LIMIT');}
  const files=body.files.map(f=>file(f,PRIVACYBENCH_LIMITS.totalFileBytes)),byPath=new Map(files.map(f=>[f.path,f]));
  need(plain(body.selection)&&plain(body.selection.results)&&Array.isArray(body.selection.originals),'PRIVACYBENCH_SELECTION_FIELDS');
  const used=new Set();
  for(const spec of [body.selection.results,...body.selection.originals]){
   need(plain(spec)&&typeof spec.file==='string','PRIVACYBENCH_ORIGINAL_DESCRIPTOR');safePath(spec.file);
   const f=byPath.get(spec.file);need(f&&f.bytes===spec.bytes&&f.sha256===spec.sha256,'PRIVACYBENCH_ORIGINAL_CHANGED',{file:spec.file});used.add(spec.file);
  }
  need(used.size===byPath.size,'PRIVACYBENCH_UNSELECTED_FILE');
  const prepared=await materializePrivacyBench(body.selection,{sourceImplementation,readOriginal:async(path,expected)=>{
   const f=byPath.get(path);need(f&&f.bytes===expected.bytes&&f.sha256===expected.sha256,'PRIVACYBENCH_ORIGINAL_CHANGED');return f.body;
  }});
  const result={schema:'sf88-privacybench-output-preparation/v1',dossierId,revision:page.revision,requestId:body.requestId,
   basis:{dossierId,revision:body.expectedRevision,caseId:page.case.id,caseVersionId:page.case.versionId},
   plan:prepared.plan,files:prepared.files.map(({body,...f})=>({...f,bodyBase64:body.toString('base64')})),
   providerReview:prepared.providerReview,sourceImplementation,review:prepared.review,rawIdentity:prepared.rawIdentity};
  setHeader('X-Research-Dossier-Revision',String(page.revision));send(200,result);return true;
 }catch(error){
  if(typeof error.code!=='string'||!/^PRIVACYBENCH_|^OUTPUT_|^COMPARISON_|^REVISION_|^DOSSIER_/.test(error.code))throw error;
  send(error.code==='REVISION_CONFLICT'?409:400,{error:error.code,message:error.message.replaceAll('_',' ')+(Object.keys(error.details??{}).length?': '+JSON.stringify(error.details):''),details:error.details??{}});return true;
 }
}
