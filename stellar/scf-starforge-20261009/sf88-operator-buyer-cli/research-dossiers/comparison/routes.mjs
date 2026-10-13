// MIT. Original authenticated Research listener routes.
import {need,object} from '../../node/store.mjs';
export const COMPARISON_REQUEST_LIMIT=128*1024*1024+65536;
const routes=new Set(['comparison','comparison/report','comparison/reviews','comparison/export','comparison/file']);
function query(url,allowed){
 const out={},seen=new Set();
 for(const [key,value] of url.searchParams){
  need(!seen.has(key),'COMPARISON_QUERY_INVALID');seen.add(key);
  if(['projection','sourceProjection'].includes(key))continue;
  need(allowed.includes(key),'COMPARISON_QUERY_INVALID');
  if(['revision','offset','limit'].includes(key)){
   need(/^(0|[1-9][0-9]{0,8})$/.test(value),'COMPARISON_QUERY_INTEGER_INVALID');
   out[key]=Number(value);need(key==='offset'||out[key]>0,'COMPARISON_QUERY_INTEGER_INVALID');
  }else out[key]=value;
 }
 return out;
}
export async function handleComparisonRoute({store,dossierId,action,req,url,projection='metadata',readBody,send,setHeader}){
 if(!routes.has(action))return false;
 const respond=value=>{
  const revision=value.dossier?.revision??value.revision;
  need(Number.isSafeInteger(revision)&&revision>=1,'COMPARISON_RESPONSE_REVISION_INVALID');
  setHeader('X-Research-Dossier-Revision',String(revision));return value;
 };
 if(req.method==='GET'){
  let value;
  if(action==='comparison')value=await store.comparison(dossierId,query(url,['revision','caseId','caseVersionId','section','offset','limit']));
  else if(action==='comparison/report')value=await store.comparisonReport(dossierId,query(url,['revision','caseId','caseVersionId']));
  else if(action==='comparison/export'||action==='comparison/file'){
   const exported=respond(action==='comparison/export'
    ?await store.exportComparison(dossierId,query(url,['revision','caseId','caseVersionId','format']))
    :await store.comparisonFile(dossierId,query(url,['revision','runId','artifactId'])));
   setHeader('X-Content-SHA256',exported.sha256);
   setHeader('X-Research-Comparison-SHA256',exported.sha256);
   send(200,exported.body,exported.contentType,exported.filename);return true;
  }
  if(value){send(200,respond(value));return true;}
 }
 if(req.method==='POST'&&action==='comparison/reviews'){
  query(url,[]);const value=await readBody(req,COMPARISON_REQUEST_LIMIT);
  need(object(value)&&!Object.hasOwn(value,'projection'),'COMPARISON_FIELDS_INVALID');
  const result=respond(await store.reviewComparison(dossierId,{...value,projection}));
  send(result.duplicate?200:201,result);return true;
 }
 send(405,{error:'COMPARISON_METHOD_NOT_ALLOWED'});return true;
}
