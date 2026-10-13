#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {privateDirectory,readPrivate,readJson,publish,publishJson} from '../../open-meteo-operations/files.mjs';
import {openWorkspace} from '../workspace.mjs';
import {inspectSourcePacket} from '../source-intake.mjs';
import {zipBytes} from '../exports.mjs';
import {need,canonical,encoded,sha,digest,MAX_PACKAGE} from '../contract.mjs';

async function saved(path){try{return await readJson(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function retain(path,value){
 const previous=await saved(path);if(previous){need(canonical(previous)===canonical(value),'ORIGINAL_OPERATION_RECORD_CHANGED');return previous;}
 await publishJson(path,value);return value;
}
async function frozenPackage(workspace,reportId,path){
 let raw;try{raw=await readPrivate(path,MAX_PACKAGE);}catch(error){if(error.code!=='ENOENT')throw error;raw=zipBytes(await workspace.files(reportId));await publish(path,raw);}
 const inspected=workspace.inspectReceiving(raw);need(inspected.root.id===reportId,'ORIGINAL_EDITION_FILE_CHANGED');
 return {raw,path,bytes:raw.length,sha256:sha(raw),reportId,packageId:inspected.value.id};
}
async function originalProject(workspace,sourceSetId,input,previous){
 const value=workspace.sourceProject(sourceSetId,input),state=workspace.state();if(previous){const selected=state.projects.find(p=>p.id===previous.id);need(selected&&selected.sha256===previous.sha256&&canonical(selected.value)===canonical(value),'ORIGINAL_CUSTOMER_PROJECT_CHANGED');return selected;}
 const matches=state.projects.filter(p=>canonical(p.value)===canonical(value));
 if(matches.length)return matches[0];return workspace.saveProject(value,{expectedCurrent:state.currentProject?.id??null});
}
function edition(workspace,projectId,sourceSetId,window,baselineReportId,operationId){
 const state=workspace.state(),title=(window.id==='initial'?'Initial':'Later')+' AirGradient operating report',notes='Original source operation '+operationId;
 const matches=state.plans.filter(p=>p.projectId===projectId&&p.sourceSetId===sourceSetId&&p.period.start===window.start&&p.period.end===window.end&&p.period.bucket===window.bucket&&p.baselineReportId===baselineReportId&&p.title===title&&p.notes===notes);
 need(matches.length<=1,'AMBIGUOUS_ORIGINAL_REPORT_PLAN');
 const plan=matches[0]??workspace.createPlan({projectId,expectedProjectId:projectId,sourceSetId,period:window,title,notes,baselineReportId});
 const review=workspace.review(plan.id),report=workspace.commit(plan.id,review.reviewSha256);return {plan,report};
}
export async function runOriginalSource({input,project,output}){
 const original=await readPrivate(input,MAX_PACKAGE),source=inspectSourcePacket(original),customer=await readJson(project);
 need(source.summary.reportWindows.length>=2,'TWO_ORIGINAL_REPORT_WINDOWS_REQUIRED');
 const firstWindow=source.summary.reportWindows.find(w=>w.id==='initial')??source.summary.reportWindows[0],laterWindow=source.summary.reportWindows.find(w=>w.id==='later')??source.summary.reportWindows[1];
 need(firstWindow.id!==laterWindow.id,'DISTINCT_REPORT_WINDOWS_REQUIRED');
 await privateDirectory(output,{create:true});
 const intent={schema:'stellar-forge.airgradient-original-source-operation.v1',sourceOperationId:source.summary.operationId,packetSha256:source.summary.packetSha256,customer,firstWindow,laterWindow};
 const operationId='airgradient_original_'+digest(intent);await retain(join(output,'operation.json'),{operationId,...intent});
 const originalPath=join(output,'original-source.json');try{await publish(originalPath,original);}catch(error){if(error.code!=='EEXIST')throw error;need(sha(await readPrivate(originalPath,MAX_PACKAGE))===source.summary.packetSha256,'SAVED_ORIGINAL_SOURCE_CHANGED');}
 const producerDirectory=join(output,'producer'),receiverDirectory=join(output,'receiver');
 let workspace=await openWorkspace(producerDirectory,{create:true}),first;
 try{
  const selected=workspace.importSource(original,source.summary.packetSha256),customerProject=await originalProject(workspace,selected.id,customer,await saved(join(output,'customer-project.json')));
  await retain(join(output,'customer-project.json'),customerProject);
  const result=edition(workspace,customerProject.id,selected.id,firstWindow,null,operationId);
  await retain(join(output,'first-edition.json'),{projectId:customerProject.id,planId:result.plan.id,reportId:result.report.id,reportSha256:result.report.sha256});
  const delivery=await workspace.deliver(result.report.id,join(output,'first-delivery'));
  const archive=await frozenPackage(workspace,result.report.id,join(output,'first.airgradient.zip'));
  first={projectId:customerProject.id,report:result.report,delivery,archive};
 }finally{await workspace.close();}
 workspace=await openWorkspace(receiverDirectory,{create:true});let later;
 try{
  const received=workspace.receive(first.archive.raw),projectId=received.projectId;
  await retain(join(output,'first-receiving.json'),received);
  const result=edition(workspace,projectId,source.record.id,laterWindow,first.report.id,operationId);
  await retain(join(output,'later-edition.json'),{projectId,planId:result.plan.id,reportId:result.report.id,reportSha256:result.report.sha256});
  const delivery=await workspace.deliver(result.report.id,join(output,'later-delivery'));
  const archive=await frozenPackage(workspace,result.report.id,join(output,'later.airgradient.zip'));
  later={projectId,report:result.report,delivery,archive};
 }finally{await workspace.close();}
 workspace=await openWorkspace(producerDirectory);let receivedLater,finalHandover,continuedBytes;
 try{
  receivedLater=workspace.receive(later.archive.raw);await retain(join(output,'later-receiving.json'),receivedLater);
  finalHandover=workspace.handover(later.report.id);
  const reopened=await workspace.deliver(first.report.id,join(output,'first-delivery'));
  need(reopened.id===first.delivery.id,'ORIGINAL_CUSTOMER_DESTINATION_CHANGED');
  const path=join(output,'continued.airgradient.json');
  try{continuedBytes=await readPrivate(path,MAX_PACKAGE);const inspection=workspace.inspectReceiving(continuedBytes);need(inspection.root.id===later.report.id,'SAVED_CUSTOMER_HANDOVER_CHANGED');finalHandover=inspection.value;}
  catch(error){if(error.code!=='ENOENT')throw error;continuedBytes=encoded(finalHandover);await publish(path,continuedBytes);}
 }finally{await workspace.close();}
 workspace=await openWorkspace(receiverDirectory);let cold;
 try{
  const report=workspace.report(later.report.id),review=workspace.review(report.planId);
  need(review.reviewSha256===report.reviewSha256,'COLD_CUSTOMER_REPORT_CHANGED');
  cold={workspaceId:workspace.workspaceId,reportId:report.id,sourceSets:workspace.state().sourceSets.map(v=>({id:v.id,packetSha256:v.packetSha256,files:v.files,sourceBytes:v.sourceBytes}))};
 }finally{await workspace.close();}
 const summarize=edition=>({reportId:edition.report.id,reportSha256:edition.report.sha256,period:edition.report.period,rows:edition.report.rows,seriesRows:edition.report.seriesRows,readiness:edition.report.readiness,delivery:edition.delivery,archive:{path:edition.archive.path,bytes:edition.archive.bytes,sha256:edition.archive.sha256,packageId:edition.archive.packageId}});
 const result={schema:'stellar-forge.airgradient-original-source-result.v1',operationId,source:source.summary,workspaces:{producer:producerDirectory,receiver:receiverDirectory},first:summarize(first),later:summarize(later),receiving:receivedLater,cold,
  continued:{path:join(output,'continued.airgradient.json'),bytes:continuedBytes.length,sha256:sha(continuedBytes),packageId:finalHandover.id},
  runtime:{node:process.version,platform:process.platform}};
 const resultPath=join(output,'operation-result.json'),previous=await saved(resultPath);
 if(previous){need(previous.operationId===operationId&&previous.first.reportId===first.report.id&&previous.later.reportId===later.report.id&&previous.continued.sha256===result.continued.sha256,'ORIGINAL_COMPLETION_CHANGED');return previous;}
 await publishJson(resultPath,result);return result;
}
export async function main(argv=process.argv.slice(2)){
 const options={};for(let i=0;i<argv.length;i+=2){need(['--input','--project','--output'].includes(argv[i])&&typeof argv[i+1]==='string'&&!options[argv[i].slice(2)],'INVALID_ARGUMENTS');options[argv[i].slice(2)]=argv[i+1];}
 need(options.input&&options.project&&options.output,'INPUT_PROJECT_OUTPUT_REQUIRED');const result=await runOriginalSource(options);process.stdout.write(JSON.stringify({operationId:result.operationId,result:join(options.output,'operation-result.json'),workspaces:result.workspaces,first:result.first.archive,later:result.later.archive,continued:result.continued})+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'ORIGINAL_SOURCE_OPERATION_FAILED'})+'\n');process.exitCode=1;});
