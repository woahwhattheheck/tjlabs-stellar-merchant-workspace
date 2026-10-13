// MIT. Original Research comparisons and explicit returned-work adoption through one attachment.
import {exact,failure} from './host-files.mjs';
import {RESEARCH_COMPARISON_EXPORTS} from './catalog/research-comparison.mjs';
export const RESEARCH_COMPARISON_PREFIX='merchant_research_comparison_';
const without=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
const pick=(v,keys)=>Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
const need=(ok,message)=>{if(!ok)throw failure('RESEARCH_COMPARISON_SELECTION_CHANGED',message);};
export async function callResearchComparison(client,name,args){
 const op=name.slice(RESEARCH_COMPARISON_PREFIX.length),common=['workspace','dossierId'];
 const call=async(method,allowed,required=[])=>{
  exact(args,[...common,...allowed],[...common,...required]);
  return client[method](args.dossierId,without(args,common));
 };
 if(op==='read')return call('comparison',['revision','caseId','caseVersionId','section','offset','limit']);
 if(op==='report')return call('comparisonReport',['revision','caseId','caseVersionId'],['caseId']);
 if(op==='adoption_list')return call('comparisonAdoptions',['revision','offset','limit']);
 if(op==='adoption_source')return call('comparisonAdoptionSource',['sourceId','revision','caseVersionId','section','offset','limit'],['sourceId']);
 if(op==='adoption_inspect')return call('comparisonAdoption',['planId','requestId','revision']);
 if(['review','adoption_preview','adoption_review'].includes(op)){
  exact(args,[...common,'input'],[...common,'input']);
  const method=op==='review'?'reviewComparison':op==='adoption_preview'?'previewComparisonAdoption':'reviewComparisonAdoption';
  return client[method](args.dossierId,args.input);
 }
 throw failure('TOOL_NOT_FOUND','Unknown original comparison operation.');
}
async function selectedRun(client,id,args,{returned=false}={}){
 let offset=0,revision=args.revision;const seen=new Set();
 while(true){
  const options={...pick(args,['caseVersionId']),section:'runs',offset,limit:200,...(revision===undefined?{}:{revision})};
  const page=returned?await client.comparisonAdoptionSource(id,{...options,sourceId:args.adoptionSourceId}):await client.comparison(id,options);
  if(revision===undefined)revision=page.revision;
  need(page.dossierId===id&&page.revision===revision&&page.offset===offset&&Array.isArray(page.items),'Retain the original source page and revision.');
  const row=page.items.find(r=>r.id===args.runId);
  if(row)return{row,revision,source:page.source??null};
  if(page.complete)return null;
  need(Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset&&!seen.has(page.nextOffset),'Continue the complete original source pages.');
  seen.add(page.nextOffset);offset=page.nextOffset;
 }
}
export async function exportResearchComparison(client,args,{file,download}){
 const spec=RESEARCH_COMPARISON_EXPORTS[args.kind];need(spec,'Select an original comparison export kind.');
 const common=['workspace','dossierId','kind','revision','expectedSha256'];
 const required=['workspace','dossierId','kind'];let result,selection;
 if(spec.comparisonFormat){
  exact(args,[...common,'caseId','caseVersionId'],[...required,'caseId']);
  const report=await client.comparisonReport(args.dossierId,pick(args,['revision','caseId','caseVersionId']));
  need(report.dossierId===args.dossierId&&report.case.id===args.caseId&&(args.caseVersionId===undefined||report.case.versionId===args.caseVersionId)&&Number.isSafeInteger(report.revision),'The complete report selection changed.');
  result=await download(()=>client.exportCaseComparison(args.dossierId,{
   revision:report.revision,caseId:report.case.id,caseVersionId:report.case.versionId,format:spec.comparisonFormat,file,
   ...pick(args,['expectedSha256'])}));
  need(result.revision===report.revision,'The downloaded comparison report revision changed.');
  selection={dossierId:args.dossierId,revision:report.revision,caseId:report.case.id,caseVersionId:report.case.versionId,
   format:spec.comparisonFormat,representation:'complete-original-comparison-report'};
 }else if(spec.adoptionFormat){
  exact(args,[...common,'adoptionPlanId'],[...required,'adoptionPlanId']);
  const lookup=await client.comparisonAdoption(args.dossierId,{planId:args.adoptionPlanId,...pick(args,['revision'])});
  const adoption=lookup.adoption;need(adoption&&adoption.planId===args.adoptionPlanId,'Select the original retained adoption plan.');
  const source=adoption.plan.source,expected=spec.adoptionFormat==='source'?source.sha256:args.expectedSha256;
  if(spec.adoptionFormat==='source')need(args.expectedSha256===undefined||args.expectedSha256===source.sha256,'The selected returned source digest differs.');
  result=await download(()=>client.exportComparisonAdoption(args.dossierId,{planId:adoption.planId,revision:lookup.revision,
   format:spec.adoptionFormat,file,...(expected===undefined?{}:{expectedSha256:expected})}));
  need(result.revision===lookup.revision,'The complete adoption export revision changed.');
  if(spec.adoptionFormat==='source')need(result.sha256===source.sha256&&result.bytes===source.bytes,'The retained returned portable bytes changed.');
  selection={dossierId:args.dossierId,revision:lookup.revision,planId:adoption.planId,requestId:adoption.requestId,
   source:pick(source,['id','sha256','bytes','filename','contentType','incomingHead']),status:adoption.status,
   completed:adoption.progress.completed,total:adoption.progress.total,format:spec.adoptionFormat,
   representation:spec.adoptionFormat==='source'?'complete-original-returned-portable':'complete-reviewed-adoption'};
 }else{
  const returned=Boolean(spec.adoptionFile),fields=[...common,'runId',...(spec.artifact?['artifactId']:[]),...(returned?['adoptionSourceId','caseVersionId']:[])];
  exact(args,fields,[...required,'runId',...(spec.artifact?['artifactId']:[]),...(returned?['adoptionSourceId','caseVersionId']:[])]);
  const selected=await selectedRun(client,args.dossierId,args,{returned});need(selected,'Select a retained original run from the exact source and protocol.');
  const row=selected.row,original=spec.artifact?row.artifacts.find(x=>x.id===args.artifactId):row.raw;
  need(original&&/^[a-f0-9]{64}$/.test(original.sha256)&&Number.isSafeInteger(original.bytes),'Select an original raw run or complete artifact.');
  need(args.expectedSha256===undefined||args.expectedSha256===original.sha256,'The selected original file digest differs.');
  result=await download(()=>returned?client.comparisonAdoptionFile(args.dossierId,{
   sourceId:args.adoptionSourceId,revision:selected.revision,runId:row.id,...pick(args,['artifactId']),expectedSha256:original.sha256,file
  }):client.comparisonFile(args.dossierId,{
   revision:selected.revision,runId:row.id,...pick(args,['artifactId']),expectedSha256:original.sha256,file
  }));
  need(result.bytes===original.bytes&&result.sha256===original.sha256&&result.revision===selected.revision,'The complete original run or artifact changed.');
  selection={dossierId:args.dossierId,revision:selected.revision,caseId:row.caseId,caseVersionId:row.caseVersionId,
   runId:row.id,artifactId:args.artifactId??null,original:pick(original,['id','path','bytes','sha256','role','mediaType']),
   ...(returned?{source:pick(selected.source,['id','sha256','bytes','filename','incomingHead'])}:{}),
   representation:spec.artifact?'complete-original-artifact':'complete-original-producer-run'};
 }
 return{result,selection};
}
