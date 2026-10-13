// MIT. Borrow the original Research transport, workspace identity and download lifecycle.
import {need,object} from '../../node/store.mjs';
const select=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
const query=value=>{const p=new URLSearchParams();for(const[k,v]of Object.entries(value))if(v!==undefined&&v!==null)p.set(k,String(v));return p.size?'?'+p:'';};
const id=value=>{need(typeof value==='string'&&value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f/\\]/.test(value),'RESEARCH_ID_INVALID');return encodeURIComponent(value);};
const path=value=>'/api/dossiers/'+id(value)+'/study-flow';
function response(value,dossierId,revision){
 need(object(value)&&value.dossier?.id===dossierId&&Number.isSafeInteger(value.dossier.revision),'FLOW_RESPONSE_IDENTITY_CHANGED');
 need(revision===undefined||value.dossier.revision===revision,'FLOW_RESPONSE_REVISION_CHANGED');return value;
}
export function createStudyFlowClient({request,download}){
 need(typeof request==='function'&&typeof download==='function','RESEARCH_CLIENT_TRANSPORT_REQUIRED');
 const read=async(dossierId,suffix,options,keys)=>response(await request(path(dossierId)+suffix+query(select(options,keys)),
 undefined,select(options,['signal'])),dossierId,options.revision);
 return Object.freeze({
 studyFlow(dossierId,options={}){return read(dossierId,'',options,['revision','flowId','editionId','section','offset','limit']);},
 studyFlowSources(dossierId,options={}){return read(dossierId,'/sources',options,['revision','questionId','reviewId','workSetId','offset','limit']);},
 studyFlowReport(dossierId,options={}){return read(dossierId,'/report',options,['revision','flowId','editionId']);},
 async previewStudyFlow(dossierId,input,options={}){
 return response(await request(path(dossierId)+'/preview',input,{...select(options,['signal']),readOnly:true}),dossierId,input.expectedRevision);
 },
 async importStudyFlowCounts(dossierId,input,options={}){
 return response(await request(path(dossierId)+'/import-counts',input,{...select(options,['signal']),readOnly:true}),dossierId,input.expectedRevision);
 },
 async reviewStudyFlow(dossierId,input,options={}){
 const value=response(await request(path(dossierId)+'/reviews?projection=metadata',input,select(options,['signal'])),dossierId);
 need(value.operation?.requestId===input.requestId&&typeof value.duplicate==='boolean','FLOW_REVIEW_RESPONSE_CHANGED');
 return value;
 },
 exportStudyFlow(dossierId,{file,format='json',section='counts',revision,flowId,editionId,...options}={}){
 need(['json','svg','html','csv'].includes(format),'FLOW_EXPORT_FORMAT_INVALID');
 return download(path(dossierId)+'/export'+query({revision,flowId,editionId,format,section}),file,options);
 }
 });
}
