// MIT. No new listener, store, renderer or file reader: delegate to the original Research client.
import {exact,failure} from './host-files.mjs';
import {RESEARCH_STUDY_FLOW_REQUEST_FIELDS,RESEARCH_STUDY_FLOW_REQUIRED_REQUEST_FIELDS,
 RESEARCH_STUDY_FLOW_EXPORTS} from './catalog/research-study-flow.mjs';
export {RESEARCH_STUDY_FLOW_PREFIX} from './catalog/research-study-flow.mjs';
const selected=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
export async function callResearchStudyFlow(client,name,args){
 const base=['workspace','dossierId'];
 const readOperations={
  merchant_research_study_flow:['studyFlow',['revision','flowId','editionId','section','offset','limit']],
  merchant_research_study_flow_sources:['studyFlowSources',['revision','questionId','reviewId','workSetId','offset','limit']],
  merchant_research_study_flow_report:['studyFlowReport',['revision','flowId','editionId']]
 };
 if(Object.hasOwn(readOperations,name)){
  const [method,fields]=readOperations[name];exact(args,[...base,...fields],base);
  return client[method](args.dossierId,selected(args,fields));
 }
 if(name==='merchant_research_study_flow_preview'){
  const fields=['expectedRevision','definition','flowId','sourceMode','basisEditionId'];
  exact(args,[...base,...fields],[...base,'expectedRevision','definition']);
  return client.previewStudyFlow(args.dossierId,selected(args,fields));
 }
 if(name==='merchant_research_study_flow_import_counts'){
  const fields=['expectedRevision','body','filename','reference','reason'];
  exact(args,[...base,...fields],[...base,'expectedRevision','body','filename','reason']);
  return client.importStudyFlowCounts(args.dossierId,selected(args,fields));
 }
 if(name==='merchant_research_study_flow_review'){
  exact(args,[...base,...RESEARCH_STUDY_FLOW_REQUEST_FIELDS],[...base,...RESEARCH_STUDY_FLOW_REQUIRED_REQUEST_FIELDS]);
  return client.reviewStudyFlow(args.dossierId,selected(args,RESEARCH_STUDY_FLOW_REQUEST_FIELDS));
 }
 throw failure('TOOL_NOT_FOUND','Unknown original Study Flow operation.');
}
export async function exportResearchStudyFlow(client,args,{file,download}){
 const spec=RESEARCH_STUDY_FLOW_EXPORTS[args.kind];
 if(!spec)throw failure('INVALID_PARAMS','Select an original Study Flow export kind.');
 const fields=['workspace','dossierId','kind','revision','flowId','flowEditionId','flowSection','expectedSha256'];
 exact(args,fields,['workspace','dossierId','kind','revision']);
 if(!args.flowId&&!args.flowEditionId)throw failure('INVALID_PARAMS','Select the original flowId or flowEditionId.');
 if(args.flowSection!==undefined&&spec.format!=='csv')
  throw failure('INVALID_PARAMS','flowSection selects a Study Flow CSV table only.');
 const options={file,format:spec.format,...selected(args,['revision','flowId','expectedSha256']),
  ...(args.flowEditionId!==undefined?{editionId:args.flowEditionId}:{}),
  ...(args.flowSection!==undefined?{section:args.flowSection}:{})};
 const result=await download(()=>client.exportStudyFlow(args.dossierId,options));
 return {result,selection:{dossierId:args.dossierId,...selected(args,['revision','flowId','flowEditionId']),
  format:spec.format,...(spec.format==='csv'?{section:args.flowSection??'counts'}:{})}};
}
