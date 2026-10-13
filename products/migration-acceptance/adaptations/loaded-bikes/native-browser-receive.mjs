#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Operate the unchanged native Workbench UI on this course's actual received Workspace.
import {readFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createApplicationServer} from '../../workbench/application/server.mjs';
import {runBrowserJourney} from '../../workbench/receiving/browser.mjs';
import {acquireWorkspaceLease,privateDirectory} from '../../workbench/vendor/dlt/vendor/sling/vendor/stellar-expert/store.mjs';
import {atomicJson,canonical,identity,safeRelative,now} from '../../workbench/vendor/dlt/vendor/sling/core/common.mjs';
import {hashFile} from '../../workbench/vendor/dlt/vendor/sling/core/objects.mjs';
import {prepareProject} from './native-intake.mjs';

const ADDON=dirname(fileURLToPath(import.meta.url)),APPLICATION=resolve(ADDON,'../..'),WORKBENCH=join(APPLICATION,'workbench');
const SCHEMA='tjlabs.loaded-bikes-native-browser.v1';
const need=(value,message)=>{if(!value)throw new Error(message);};
const equal=(a,b)=>canonical(a)===canonical(b);
function regular(path){
  path=resolve(path);const stat=lstatSync(path);
  need(stat.isFile()&&!stat.isSymbolicLink()&&realpathSync(path)===path,'Use a canonical ordinary retained file: '+path);
  return readFileSync(path);
}
const read=path=>JSON.parse(regular(path).toString('utf8').replace(/^\uFEFF/,''));
function verify(path,expected){
  regular(path);const actual=hashFile(path);
  need(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'The full retained file changed: '+path);
  return actual;
}
function row(rows,id){
  const matches=rows.filter(value=>value.id===id);
  need(matches.length===1,'The original selected native identity is missing or repeated: '+id);return matches[0];
}
function sources(){
  const files=[],manifests={};
  for(const [directory,prefix,name]of [[WORKBENCH,'workbench','workbench'],[ADDON,'adaptations/loaded-bikes','addon']]){
    const path=join(directory,'SOURCE_MANIFEST.json'),body=regular(path),manifest=JSON.parse(body.toString('utf8'));
    need(Array.isArray(manifest.files)&&manifest.files.length,'The complete original source manifest is required.');
    const names=new Set();
    for(const item of manifest.files){
      safeRelative(item.path);need(item.path!=='SOURCE_MANIFEST.json'&&!names.has(item.path),'The source manifest repeats a member.');
      names.add(item.path);const original=regular(join(directory,item.path));verify(join(directory,item.path),item);
      files.push({path:prefix+'/'+item.path,body:original,bytes:item.bytes,sha256:item.sha256});
    }
    manifests[name]=hashFile(path);files.push({path:prefix+'/SOURCE_MANIFEST.json',body,...manifests[name]});
  }
  need(new Set(files.map(file=>file.path)).size===files.length,'The complete source trees have duplicate member paths.');
  return {files,manifests};
}
export function nativeBrowserBinding({summary,selection,prepared,view,readObject}){
  need(summary.schema==='tjlabs.loaded-bikes-native-result.v1'&&summary.status==='native_received_and_reopened',
    'Finish the original native receiving and copied-application reopen first.');
  need(selection.schema==='tjlabs.loaded-bikes-native-course.v1'&&summary.operation===selection.operation&&
    summary.bindingSha256===selection.bindingSha256&&prepared.binding.bindingSha256===summary.bindingSha256,
    'The complete native result, original operation and reviewed project must be the same edition.');
  need(view.id===summary.projectId&&summary.coldReopen?.projectId===view.id&&
    summary.coldReopen.originalArchiveSha256===summary.archive.sha256&&summary.receiving?.projectId===view.id,
    'Use the actual original received project and complete archive.');
  need(view.currentPlanId===summary.planId&&view.currentAcceptanceReportId===summary.acceptanceReportId&&
    view.revision===summary.receiving.revision,'The received native selections changed; preserve the existing continuation.');
  for(const descriptor of summary.expected.sources){
    const source=row(view.sources,descriptor.id);
    need(source.bytes===descriptor.bytes&&source.sha256===descriptor.sha256,'An original complete source changed.');
  }
  const jobs=[summary.loadJobId,summary.verifyJobId];
  need(jobs.length===new Set(jobs).size&&equal(jobs,summary.expected.jobs),'The original load/verify job selection differs.');
  for(const id of jobs){
    const job=row(view.jobs,id);
    need(job.status==='complete'&&job.planId===summary.planId&&job.files?.length,'Select the original completed native jobs.');
  }
  const nativePlan=row(view.plans,summary.planId),plan=readObject(nativePlan.compiled);
  need(plan.planId===summary.semanticPlanId&&plan.acceptance.length===prepared.binding.tables.length,
    'The original complete pipeline plan changed.');
  const expectedRowsByStream={};
  for(const table of prepared.binding.tables){
    const matches=plan.acceptance.filter(item=>item.table===table.tableName);
    need(matches.length===1&&!Object.hasOwn(expectedRowsByStream,matches[0].id),'Each complete reviewed table needs its original unique stream.');
    expectedRowsByStream[matches[0].id]=table.rowCount;
  }
  need(Object.keys(expectedRowsByStream).length===4,'The complete catalogue has four original native tables.');
  const comparison=row(view.comparisons,summary.comparisonId);
  need(comparison.planId===summary.planId&&comparison.jobId===summary.verifyJobId&&comparison.equal&&comparison.readyForCutover,
    'Use the actual accepted complete native comparison.');
  const observations=readObject(comparison.observations);
  need(observations.completeTables===true&&observations.pendingPackages===false&&observations.failedJobs===false&&
    observations.streams.length===4,'The original observed native tables are incomplete.');
  need(equal(observations.streams.map(stream=>stream.streamId).sort(),Object.keys(expectedRowsByStream).sort()),'The original stream population changed.');
  for(const stream of observations.streams)for(const side of ['left','right']){
    const actual=stream[side],count=expectedRowsByStream[stream.streamId];
    need(actual.source.complete===true&&actual.source.rowCount===count&&actual.rows.length===count,
      'The complete original expected/native table population changed.');
  }
  const report=row(view.acceptanceReports,summary.acceptanceReportId);
  need(report.planId===summary.planId&&report.comparisonId===summary.comparisonId&&report.readyForCutover&&report.findings.length===0,
    'The measured business acceptance differs from the completed native course.');
  row(view.acceptancePlans,report.acceptancePlanId);row(view.handoffs,summary.handoffId);
  return {projectId:view.id,expectedRows:Object.values(expectedRowsByStream).reduce((total,count)=>total+count,0),expectedRowsByStream,
    sourceIds:view.sources.map(source=>source.id),planIds:[summary.planId],jobIds:jobs,comparisonIds:[summary.comparisonId],
    acceptancePlanIds:[report.acceptancePlanId],acceptanceReportIds:[summary.acceptanceReportId],
    acceptanceDecisionIds:(view.acceptanceDecisions??[]).filter(decision=>decision.reportId===summary.acceptanceReportId).map(decision=>decision.id),
    handoffIds:[summary.handoffId]};
}
export async function runNativeBrowserReceiving(options){
  for(const name of ['nativeResult','directory','output','playwright','chromium'])need(options[name],'Supply '+name+'.');
  need(Number(process.versions.node.split('.')[0])>=24,'Use the original Node24+ native Workbench runtime.');
  const nativeResult=resolve(options.nativeResult),courseRoot=dirname(nativeResult),summary=read(nativeResult),selection=read(join(courseRoot,'selection.json'));
  need(summary.status==='native_received_and_reopened','Use the completed original RESULT.json, not an interim native-result.json.');
  need(resolve(summary.editableSource)===APPLICATION,'Run this driver from the actual copied application returned by the native receiving course.');
  const directory=await privateDirectory(resolve(options.directory),{create:false});
  need(directory===resolve(selection.receivingDirectory),'Open the original separate receiving Workspace.');
  const output=await privateDirectory(resolve(options.output),{create:true});
  need(output!==directory&&!output.startsWith(directory+'/'),'Keep browser operation state outside the original Workspace.');
  const lease=await acquireWorkspaceLease(join(output,'native-browser.lock'));
  let app=null,state=null;
  const statePath=join(output,'native-browser-operation.json'),save=()=>{lease.assert();atomicJson(statePath,state);};
  try{
    const source=sources();
    need(equal(source.files.map(({body,...descriptor})=>descriptor),selection.sourceFiles),'The copied complete application differs from the native handover source.');
    verify(summary.archive.path,summary.archive);
    const prepared=await prepareProject(read(join(ADDON,'project.json')));
    const binding={nativeResult:{path:nativeResult,...hashFile(nativeResult)},directory,application:APPLICATION,
      sourceManifests:source.manifests,playwright:{path:resolve(options.playwright),...hashFile(resolve(options.playwright))},
      chromium:{path:resolve(options.chromium),...hashFile(resolve(options.chromium))},actorId:selection.actorId};
    if(existsSync(statePath)){
      state=read(statePath);need(state.schema===SCHEMA&&equal(state.binding,binding),'Resume the same original native/browser selection.');
      need(options.resume||state.status==='native_controls_received_awaiting_look','Use --resume for the original interrupted native browser phase.');
    }else{
      state={schema:SCHEMA,id:'loaded_bikes_native_browser_'+identity(binding).slice(0,32),binding,status:'prepared',createdAt:now(),attempt:0};
      save();
    }
    const authPath=join(output,'auth.json');
    if(!existsSync(authPath)){
      need(state.attempt===0,'Keep the original private browser authentication file after an interruption.');
      const viewerId=selection.actorId==='loaded-bikes-browser-viewer'?'loaded-bikes-browser-reader':'loaded-bikes-browser-viewer';
      atomicJson(authPath,{schema:'tjlabs.sling-auth.v1',actors:[
        {id:selection.actorId,name:'Original Loaded Bikes operator',roles:['operator'],token:randomBytes(32).toString('hex')},
        {id:viewerId,name:'Loaded Bikes receiving viewer',roles:['viewer'],token:randomBytes(32).toString('hex')}
      ]},{immutable:true});
    }
    const actors=read(authPath).actors,operator=actors.find(actor=>actor.roles.includes('operator')),viewer=actors.find(actor=>actor.roles.includes('viewer'));
    need(operator?.id===selection.actorId&&viewer&&viewer.id!==operator.id,'Use the same original native actor and separate read-only viewer.');
    state.attempt++;state.status='running';state.startedAt=now();save();
    // No runtime-ready selection or action dispatch: the native jobs already completed.
    app=await createApplicationServer({directory,authFile:authPath,sourceRoot:WORKBENCH,sourceFiles:source.files});
    await app.workspace.assertIdle(summary.projectId);
    const view=(await app.workspace.get(operator,summary.projectId)).view;
    const chosen=nativeBrowserBinding({summary,selection,prepared,view,
      readObject:descriptor=>JSON.parse(app.workspace.store.objects.read(descriptor.sha256,descriptor.bytes))});
    for(const sourceRow of view.sources)app.workspace.store.objects.verify(sourceRow.sha256,sourceRow.bytes);
    for(const id of chosen.jobIds)for(const file of row(view.jobs,id).files)app.workspace.store.objects.verify(file.sha256,file.bytes);
    const retained=await app.workspace.readObject(operator,summary.projectId,'handoff',summary.handoffId);
    verify(retained.path,summary.archive);
    const host=await app.listen({host:'127.0.0.1',port:state.port??0});
    if(state.port===undefined){state.port=host.port;save();}
    need(host.port===state.port,'Preserve the original browser origin on resume.');
    const browser=await runBrowserJourney({...chosen,phase:'receiving',directory:join(output,'browser','receiving'),origin:host.origin,
      operator,viewer,sourceRoot:WORKBENCH,sourceManifestSha256:source.manifests.workbench.sha256,
      playwright:resolve(options.playwright),chromium:resolve(options.chromium),resume:options.resume===true});
    const after=(await app.workspace.get(operator,summary.projectId)).view;
    need(after.revision===view.revision&&equal(after,view),'The read-only receiving browser changed the retained native project.');
    await app.close();app=null;
    state.status='native_controls_received_awaiting_look';state.completedAt=state.completedAt??now();
    state.result={schema:SCHEMA,status:state.status,operation:summary.operation,projectId:summary.projectId,
      nativeResult:binding.nativeResult,receivedWorkspace:directory,completeApplication:APPLICATION,
      nativeSelection:chosen,browser,sourceManifests:source.manifests,
      nativeSolveStarted:false,originalReviewRevisionPreserved:view.revision,
      recipientReview:'Open and look at the actual desktop/phone screenshots, rendered native Sources/Jobs/Comparison/Business Acceptance/consumer/history views and every outgoing download. Record human inspection in the original operation; automated controls alone do not establish LOOK.'};
    save();atomicJson(join(output,'RESULT.json'),state.result);return state.result;
  }catch(error){
    if(state){state.status='interrupted';state.error={message:String(error.message),at:now()};save();}
    throw error;
  }finally{
    if(app)await app.close();
    await lease.close();
  }
}
export async function main(argv=process.argv.slice(2)){
  const options={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i],name=flag.slice(2);
    need(flag.startsWith('--')&&['native-result','directory','output','playwright','chromium','resume'].includes(name)&&!Object.hasOwn(options,name),'Use each documented native browser option once.');
    if(name==='resume')options[name]=true;
    else{need(argv[i+1]&&!argv[i+1].startsWith('--'),'Supply a value for '+flag);options[name]=argv[++i];}
  }
  return runNativeBrowserReceiving({nativeResult:options['native-result'],directory:options.directory,output:options.output,
    playwright:options.playwright,chromium:options.chromium,resume:options.resume===true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({error:'LOADED_BIKES_NATIVE_BROWSER',message:String(error.message)})+'\n');process.exitCode=1;});
