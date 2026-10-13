// MIT. Typed comparison transport borrows the original Research connection and request lifetime.
import {need,object} from '../../node/store.mjs';
import {COMPARISON_SCHEMA,comparisonInput,hash} from './contracts.mjs';
const path=dossierId=>{need(typeof dossierId==='string'&&/^d_[a-f0-9-]{36}$/.test(dossierId),'DOSSIER_ID_INVALID');return'/api/dossiers/'+encodeURIComponent(dossierId)+'/comparison';};
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
const query=value=>{const p=new URLSearchParams();for(const [k,v]of Object.entries(value))if(v!==undefined&&v!==null)p.set(k,String(v));return p.size?'?'+p:'';};
function result(value,id,revision){
 need(object(value)&&value.schema===COMPARISON_SCHEMA&&value.dossierId===id&&Number.isSafeInteger(value.revision)&&value.revision>=1,'COMPARISON_RESPONSE_IDENTITY_CHANGED');
 need(revision===undefined||value.revision===revision,'COMPARISON_RESPONSE_REVISION_CHANGED');return value;
}
export function createComparisonClient({request,download}){
 need(typeof request==='function'&&typeof download==='function','COMPARISON_TRANSPORT_REQUIRED');
 return Object.freeze({
 async comparison(id,options={}){
  const q=pick(options,['revision','caseId','caseVersionId','section','offset','limit']);
  return result(await request(path(id)+query(q),undefined,pick(options,['signal'])),id,options.revision);
 },
 async comparisonReport(id,options={}){
  return result(await request(path(id)+'/report'+query(pick(options,['revision','caseId','caseVersionId'])),undefined,pick(options,['signal'])),id,options.revision);
 },
 async reviewComparison(id,input,options={}){
  const normalized=comparisonInput(input);
  const value=await request(path(id)+'/reviews?projection=metadata',normalized,pick(options,['signal']));
  need(object(value)&&value.dossier?.id===id&&Number.isSafeInteger(value.dossier.revision)&&value.operation?.requestId===normalized.requestId&&value.operation.requestSha256===hash(normalized)&&typeof value.duplicate==='boolean','COMPARISON_REVIEW_RESPONSE_CHANGED');
  return value;
 },
 exportComparison(id,{file,...options}={}){
  return download(path(id)+'/export'+query(pick(options,['revision','caseId','caseVersionId','format'])),file,{...pick(options,['signal','expectedSha256']),verifySha256Header:true});
 },
 comparisonFile(id,{file,...options}={}){
  return download(path(id)+'/file'+query(pick(options,['revision','runId','artifactId'])),file,pick(options,['signal','expectedSha256']));
 }
 });
}
