// MIT. Registered inside the original authenticated Research HTTP listener.
import {need,object} from '../../node/store.mjs';
export const STUDY_FLOW_REQUEST_LIMIT=16*1024*1024;
const routes=new Set(['study-flow','study-flow/sources','study-flow/report','study-flow/preview',
 'study-flow/import-counts','study-flow/reviews','study-flow/export']);
function query(url,allowed){
 const out={},seen=new Set();for(const[name,value]of url.searchParams){
 need(!seen.has(name),'FLOW_QUERY_INVALID');seen.add(name);
 if(['projection','sourceProjection'].includes(name))continue;
 need(allowed.includes(name),'FLOW_QUERY_INVALID');
 if(['revision','offset','limit'].includes(name)){
 need(/^(0|[1-9][0-9]{0,8})$/.test(value),'FLOW_QUERY_INTEGER_INVALID');
 out[name]=Number(value);need(name==='offset'||out[name]>=1,'FLOW_QUERY_INTEGER_INVALID');
 }else out[name]=value;
 }return out;
}
const allowed=(value,keys)=>need(object(value)&&Object.keys(value).every(k=>keys.includes(k)),'FLOW_REQUEST_FIELDS_INVALID');
export async function handleStudyFlowRoute({store,dossierId,action,req,url,projection='metadata',readBody,send,setHeader}){
 if(!routes.has(action))return false;
 const respond=value=>{const rev=value.dossier?.revision??value.revision;
 need(Number.isSafeInteger(rev)&&rev>=1,'FLOW_RESPONSE_REVISION_REQUIRED');
 setHeader('X-Research-Dossier-Revision',String(rev));return value;};
 if(req.method==='GET'){
 let value;
 if(action==='study-flow')value=await store.studyFlow(dossierId,query(url,['revision','flowId','editionId','section','offset','limit']));
 else if(action==='study-flow/sources')value=await store.studyFlowSources(dossierId,query(url,['revision','questionId','reviewId','workSetId','offset','limit']));
 else if(action==='study-flow/report')value=await store.studyFlowReport(dossierId,query(url,['revision','flowId','editionId']));
 else if(action==='study-flow/export'){
 const exported=respond(await store.exportStudyFlow(dossierId,query(url,['revision','flowId','editionId','format','section'])));
 setHeader('X-Research-Study-Flow-SHA256',exported.reportSha256);
 send(200,exported.body,exported.contentType,exported.filename);return true;
 }
 if(value){send(200,respond(value));return true;}
 }
 if(req.method==='POST'){
 query(url,[]);
 const value=await readBody(req,STUDY_FLOW_REQUEST_LIMIT);
 if(action==='study-flow/preview'){
 allowed(value,['expectedRevision','definition','flowId','sourceMode','basisEditionId']);
 send(200,respond(await store.previewStudyFlow(dossierId,value)));return true;
 }
 if(action==='study-flow/import-counts'){
 allowed(value,['expectedRevision','body','filename','reference','reason']);
 send(200,respond(await store.importStudyFlowCounts(dossierId,value)));return true;
 }
 if(action==='study-flow/reviews'){
 need(object(value)&&!Object.hasOwn(value,'projection'),'FLOW_REQUEST_FIELDS_INVALID');
 const result=respond(await store.reviewStudyFlow(dossierId,{...value,projection}));
 send(result.duplicate?200:201,result);return true;
 }
 }
 send(405,{error:'FLOW_METHOD_NOT_ALLOWED'});return true;
}
