// MIT. Study-flow transactions are adapters over the original dossier store.
import {need} from '../../node/store.mjs';
import {clone,flowInput,flowDigest} from './contracts.mjs';
import {studyFlowPage,studyFlowSource,studyFlowReport,previewStudyFlow,recordStudyFlowOperation,importedFlowCounts} from './model.mjs';
import {studyFlowSvg,exportStudyFlowReport} from './render.mjs';
export function createStudyFlowStore({head,commit,metadata,get,projections}){
 for(const value of [head,commit,metadata,get,projections])need(typeof value==='function','FLOW_ORIGINAL_STORE_REQUIRED');
 const read=async(id,{revision}={})=>(await head(id,revision)).state;
 return Object.freeze({
 async studyFlow(id,{revision,...options}={}){
 need((options.offset??0)===0||revision!==undefined,'RESEARCH_PAGE_REVISION_REQUIRED');
 return studyFlowPage(await read(id,{revision}),options);
 },
 async studyFlowSources(id,{revision,...options}={}){
 need((options.offset??0)===0||revision!==undefined,'RESEARCH_PAGE_REVISION_REQUIRED');
 const state=await read(id,{revision});
 return studyFlowSource(state,await projections(state,{references:false}),options);
 },
 async studyFlowReport(id,{revision,...options}={}){
 const state=await read(id,{revision}),report=studyFlowReport(state,options);
 return{dossier:metadata(state),report,svg:studyFlowSvg(report)};
 },
 async previewStudyFlow(id,input){
 const state=await read(id),report=previewStudyFlow(state,await projections(state,{references:false}),input);
 return{dossier:metadata(state),report,svg:studyFlowSvg(report)};
 },
 async importStudyFlowCounts(id,{expectedRevision,body,filename,reference,reason}={}){
 const state=await read(id);need(state.revision===expectedRevision,'REVISION_CONFLICT');
 return{dossier:metadata(state),...importedFlowCounts(body,{filename,reference,reason})};
 },
 async reviewStudyFlow(id,{projection='metadata',...value}={}){
 need(['metadata','full'].includes(projection),'RESEARCH_PROJECTION_INVALID');
 const request=flowInput(value),requestSha256=flowDigest(request);
 async function recovered(state){
 const old=(state.studyFlowEvents??[]).find(v=>v.requestId===request.requestId);
 if(!old)return null;need(old.requestSha256===requestSha256,'FLOW_REQUEST_CHANGED');
 return{dossier:projection==='metadata'?metadata(state):await get(id),operation:clone(old),duplicate:true};
 }
 const previous=await recovered(await read(id));if(previous)return previous;
 let operation;
 try{
 const dossier=await commit(id,request.expectedRevision,'Study flow: '+request.action,async(state,before)=>{
 operation=recordStudyFlowOperation(state,await projections(before,{references:false}),request,new Date().toISOString());
 },{projection});
 return{dossier,operation:clone(operation),duplicate:false};
 }catch(error){
 if(error.code==='REVISION_CONFLICT'){const retained=await recovered(await read(id));if(retained)return retained;}
 throw error;
 }
 },
 async exportStudyFlow(id,{revision,...options}={}){
 const state=await read(id,{revision}),report=studyFlowReport(state,options);
 return exportStudyFlowReport(report,{...options,revision:state.revision});
 }
 });
}
