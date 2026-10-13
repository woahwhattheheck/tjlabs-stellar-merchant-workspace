// MIT. Comparison adapters use the original dossier revision, blob and portable capacity authority.
import {need,digest,jsonBytes} from '../../node/store.mjs';
import {clone,hash,comparisonInput,parseRun,id} from './contracts.mjs';
import {recordComparison,comparisonPage,comparisonReport,comparisonModel} from './model.mjs';
import {exportComparison} from './render.mjs';
export function createComparisonStore({head,commit,metadata,get,blob,putBlob,validateCapacity}){
 for(const f of [head,commit,metadata,get,blob,putBlob,validateCapacity])need(typeof f==='function','COMPARISON_ORIGINAL_STORE_REQUIRED');
 const read=async(dossierId,{revision}={})=>(await head(dossierId,revision)).state;
 return Object.freeze({
 async comparison(dossierId,{revision,...options}={}){
  need((options.offset??0)===0||revision!==undefined,'RESEARCH_PAGE_REVISION_REQUIRED');
  return comparisonPage(await read(dossierId,{revision}),options);
 },
 async comparisonReport(dossierId,{revision,...options}={}){return comparisonReport(await read(dossierId,{revision}),options);},
 async reviewComparison(dossierId,{projection='metadata',...value}={}){
  need(['metadata','full'].includes(projection),'RESEARCH_PROJECTION_INVALID');
  const request=comparisonInput(value),requestSha256=hash(request);
  async function recover(state){
   const event=(state.comparisonEvents??[]).find(e=>e.requestId===request.requestId);
   if(!event)return null;
   need(event.requestSha256===requestSha256,'COMPARISON_REQUEST_CHANGED');
   return{dossier:projection==='metadata'?metadata(state):await get(dossierId,{references:false}),operation:clone(event),duplicate:true};
  }
  const current=await read(dossierId),existing=await recover(current);if(existing)return existing;
  need(current.revision===request.expectedRevision,'REVISION_CONFLICT');
  let operation;
  try{
   const dossier=await commit(dossierId,request.expectedRevision,'Comparison: '+request.action,async(state,before)=>{
    const createdAt=new Date().toISOString();let prepared=null;
    if(request.action==='run.import'){
     const parsed=parseRun(request.payload.rawText),bytes=Buffer.from(request.payload.rawText,'utf8');
     // Validate all producer bytes before retaining any original content.
     const raw={sha256:digest(bytes),bytes:bytes.length},artifacts=parsed.artifacts.map(f=>f.metadata);
     prepared={value:parsed.value,raw,artifacts};
     // Record construction validates every original case/candidate/criterion/source binding first.
     operation=recordComparison(state,request,createdAt,prepared);
     const candidate={...state,revision:before.revision+1,previous:digest(jsonBytes(before)),updatedAt:createdAt,change:'Comparison: '+request.action};
     await validateCapacity(dossierId,candidate);
     await putBlob(bytes);
     for(const entry of parsed.artifacts)await putBlob(entry.body);
    }else{
     operation=recordComparison(state,request,createdAt);
     await validateCapacity(dossierId,{...state,revision:before.revision+1,previous:digest(jsonBytes(before)),updatedAt:createdAt,change:'Comparison: '+request.action});
    }
   },{projection});
   return{dossier,operation:clone(operation),duplicate:false};
  }catch(error){
   if(error.code==='REVISION_CONFLICT'){const result=await recover(await read(dossierId));if(result)return result;}
   throw error;
  }
 },
 async exportComparison(dossierId,{revision,...options}={}){
  const state=await read(dossierId,{revision});return exportComparison(comparisonReport(state,options),options);
 },
 async comparisonFile(dossierId,{revision,runId,artifactId}={}){
  id(runId);if(artifactId!==undefined)id(artifactId);
  const state=await read(dossierId,{revision}),run=comparisonModel(state).runs.find(r=>r.id===runId);
  need(run,'COMPARISON_RUN_NOT_FOUND');
  const selected=artifactId===undefined?run.raw:run.artifacts.find(f=>f.id===artifactId);
  need(selected,'COMPARISON_ARTIFACT_NOT_FOUND');
  const body=await blob(selected);
  return{revision:state.revision,runId,artifactId:artifactId??null,
   filename:artifactId===undefined?runId+'.run.json':selected.path.split('/').at(-1),
   originalPath:artifactId===undefined?null:selected.path,
   contentType:artifactId===undefined?'application/json; charset=utf-8':'application/octet-stream',
   sha256:selected.sha256,bytes:selected.bytes,body};
 }
 });
}
