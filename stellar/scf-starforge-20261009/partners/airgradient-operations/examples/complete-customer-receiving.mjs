#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPrivate,publish,publishJson} from '../../open-meteo-operations/files.mjs';
import {runOriginalSource} from './receive-original-source.mjs';
import {openWorkspace} from '../workspace.mjs';
import {inspectSourcePacket} from '../source-intake.mjs';
import {zipBytes} from '../exports.mjs';
import {need,canonical,encoded,sha,MAX_PACKAGE} from '../contract.mjs';

async function saved(path){try{return JSON.parse((await readPrivate(path,MAX_PACKAGE)).toString('utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function retain(path,value){const old=await saved(path);if(old){need(canonical(old)===canonical(value),'CUSTOMER_CONTINUATION_RECORD_CHANGED');return old;}await publishJson(path,value);return value;}
async function packageFile(workspace,reportId,path,format){
 let raw;try{raw=await readPrivate(path,MAX_PACKAGE);}catch(error){if(error.code!=='ENOENT')throw error;raw=format==='zip'?zipBytes(await workspace.files(reportId)):encoded(workspace.handover(reportId));await publish(path,raw);}
 const selected=workspace.inspectReceiving(raw);need(selected.root.id===reportId,'CUSTOMER_CONTINUATION_PACKAGE_CHANGED');
 return {path,bytes:raw.length,sha256:sha(raw),packageId:selected.value.id};
}
function edition(workspace,project,sourceSet,period,baselineReportId,title,notes){
 const matches=workspace.state().plans.filter(p=>p.projectId===project.id&&p.sourceSetId===sourceSet.id&&p.period.start===period.start&&p.period.end===period.end&&p.period.bucket===period.bucket&&p.baselineReportId===baselineReportId&&p.title===title&&p.notes===notes);
 need(matches.length<=1,'AMBIGUOUS_CUSTOMER_CONTINUATION_PLAN');
 const plan=matches[0]??workspace.createPlan({projectId:project.id,expectedProjectId:project.id,sourceSetId:sourceSet.id,period,baselineReportId,title,notes});
 const review=workspace.review(plan.id),report=workspace.commit(plan.id,review.reviewSha256);
 need(report.issues.length===0,'RETAINED_CUSTOMER_TASK_ISSUES');return {plan,report};
}
function summary(value){return {reportId:value.report.id,reportSha256:value.report.sha256,period:value.report.period,rows:value.report.rows,seriesRows:value.report.seriesRows,readiness:value.report.readiness,delivery:value.delivery,archive:value.archive};}
function completeRows(original,supplement){
 const rows=[...original,...supplement],keys=new Set(rows.map(row=>row.locationKey+'\u0000'+row.measure));
 need(rows.length===60&&keys.size===60,'COMPLETE_ORIGINAL_MEASUREMENT_SCOPE_CHANGED');return rows;
}

/** Continue the original twenty-location PM2.5 operation with every retained indoor field. */
export async function completeCustomerReceiving({input,project,output}){
 const raw=await readPrivate(input,MAX_PACKAGE),source=inspectSourcePacket(raw),customer=await saved(project);
 const original=await runOriginalSource({input,project,output});
 need(original.source.packetSha256===source.summary.packetSha256,'ORIGINAL_CUSTOMER_SOURCE_CHANGED');
 const locations=source.summary.locations.filter(location=>location.sourceType==='indoor').map(({id,sourceType,label,timezone})=>({id,sourceType,label,timezone}));
 need(source.summary.commonMeasures.length===1&&source.summary.commonMeasures[0]==='pm25'&&locations.length===10,'ORIGINAL_PUBLIC_COLLECTION_SCOPE_CHANGED');
 const settings={...customer,title:customer.title+' · retained indoor measurements',locations,measures:['pm10','atmp','rhum','rco2'],notes:'Continue all four additional retained indoor measurements from original source operation '+source.summary.operationId+'.'};
 const notes='Complementary retained indoor measurements for '+original.operationId;
 let workspace=await openWorkspace(original.workspaces.producer),first,indoorProject;
 try{
  const value=workspace.sourceProject(source.record.id,settings),state=workspace.state();
  indoorProject=state.projects.find(p=>canonical(p.value)===canonical(value))??workspace.saveProject(value,{expectedCurrent:state.currentProject?.id??null});
  await retain(join(output,'indoor-customer-project.json'),indoorProject);
  const result=edition(workspace,indoorProject,source.record,source.summary.reportWindows.find(w=>w.id==='initial'),null,'Initial AirGradient indoor operating report',notes);
  await retain(join(output,'indoor-first-edition.json'),{projectId:indoorProject.id,planId:result.plan.id,reportId:result.report.id,reportSha256:result.report.sha256});
  const delivery=await workspace.deliver(result.report.id,join(output,'indoor-first-delivery'));
  const archive=await packageFile(workspace,result.report.id,join(output,'indoor-first.airgradient.zip'),'zip');
  first={...result,delivery,archive};
 }finally{await workspace.close();}
 workspace=await openWorkspace(original.workspaces.receiver);let later;
 try{
  const received=workspace.receive(await readPrivate(first.archive.path,MAX_PACKAGE));await retain(join(output,'indoor-first-receiving.json'),received);
  const result=edition(workspace,indoorProject,source.record,source.summary.reportWindows.find(w=>w.id==='later'),first.report.id,'Later AirGradient indoor operating report',notes);
  await retain(join(output,'indoor-later-edition.json'),{projectId:indoorProject.id,planId:result.plan.id,reportId:result.report.id,reportSha256:result.report.sha256});
  const delivery=await workspace.deliver(result.report.id,join(output,'indoor-later-delivery'));
  const archive=await packageFile(workspace,result.report.id,join(output,'indoor-later.airgradient.zip'),'zip');
  later={...result,delivery,archive};
 }finally{await workspace.close();}
 workspace=await openWorkspace(original.workspaces.producer);let continued,receiving;
 try{
  receiving=workspace.receive(await readPrivate(later.archive.path,MAX_PACKAGE));await retain(join(output,'indoor-later-receiving.json'),receiving);
  continued=await packageFile(workspace,later.report.id,join(output,'indoor-continued.airgradient.json'),'json');
  need((await workspace.deliver(first.report.id,first.delivery.directory)).id===first.delivery.id,'ORIGINAL_INDOOR_DESTINATION_CHANGED');
  for(const selected of [original.first,original.later])need(workspace.report(selected.reportId).sha256===selected.reportSha256,'ORIGINAL_PM25_EDITION_CHANGED');
 }finally{await workspace.close();}
 workspace=await openWorkspace(original.workspaces.receiver);let cold;
 try{
  const report=workspace.report(later.report.id),review=workspace.review(report.planId),state=workspace.state();
  need(review.reviewSha256===report.reviewSha256,'COLD_INDOOR_EDITION_CHANGED');
  need(state.sourceSets.length===1&&state.sourceSets[0].packetSha256===source.summary.packetSha256,'COLD_ORIGINAL_COLLECTION_CHANGED');
  cold={workspaceId:workspace.workspaceId,reportId:report.id,reportSha256:report.sha256,reports:state.reports.map(r=>({id:r.id,sha256:r.sha256})),projects:state.projects.map(p=>({id:p.id,sha256:p.sha256,parentId:p.parentId})),sourceSets:state.sourceSets};
 }finally{await workspace.close();}
 const combined={first:completeRows(original.first.rows,first.report.rows),later:completeRows(original.later.rows,later.report.rows)};
 const result={schema:'stellar-forge.airgradient-complete-customer-receiving.v1',operationId:original.operationId,sourceOperationId:source.summary.operationId,packetSha256:source.summary.packetSha256,originalResult:join(output,'operation-result.json'),
  original:{first:original.first,later:original.later,continued:original.continued},indoor:{first:summary(first),later:summary(later),continued,receiving,cold},combined,
  measurements:{locations:20,outdoor:10,indoor:10,rowsPerPeriod:60,scope:'Outdoor PM2.5 and all five retained indoor fields.',firstAvailable:combined.first.reduce((n,r)=>n+r.availableBuckets,0),laterAvailable:combined.later.reduce((n,r)=>n+r.availableBuckets,0),firstNoValues:combined.first.filter(r=>r.status==='NO_VALUES').map(r=>({locationKey:r.locationKey,measure:r.measure})),laterNoValues:combined.later.filter(r=>r.status==='NO_VALUES').map(r=>({locationKey:r.locationKey,measure:r.measure}))},runtime:{node:process.version,platform:process.platform}};
 const path=join(output,'complete-customer-result.json');const previous=await saved(path);
 if(previous){need(previous.operationId===result.operationId&&previous.indoor.first.reportId===result.indoor.first.reportId&&previous.indoor.later.reportId===result.indoor.later.reportId&&previous.indoor.continued.sha256===result.indoor.continued.sha256,'COMPLETE_CUSTOMER_RECEIVING_CHANGED');return previous;}
 await publishJson(path,result);return result;
}
export async function main(argv=process.argv.slice(2)){
 const options={};for(let i=0;i<argv.length;i+=2){need(['--input','--project','--output'].includes(argv[i])&&typeof argv[i+1]==='string'&&!options[argv[i].slice(2)],'INVALID_ARGUMENTS');options[argv[i].slice(2)]=argv[i+1];}
 need(options.input&&options.project&&options.output,'INPUT_PROJECT_OUTPUT_REQUIRED');const result=await completeCustomerReceiving(options);process.stdout.write(JSON.stringify({operationId:result.operationId,result:join(options.output,'complete-customer-result.json'),measurements:result.measurements,original:result.original.continued,indoor:result.indoor.continued})+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'COMPLETE_CUSTOMER_RECEIVING_FAILED'})+'\n');process.exitCode=1;});
