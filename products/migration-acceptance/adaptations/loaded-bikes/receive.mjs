#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Original native Workspace continuation; no replacement loader or database simulator.
import {readFileSync,existsSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {Workspace} from '../../workbench/application/workspace.mjs';
import {atomicBytes,atomicJson,identity,sha,canonical,safeRelative,privateDirectory} from '../../workbench/vendor/dlt/vendor/sling/core/common.mjs';
import {hashFile} from '../../workbench/vendor/dlt/vendor/sling/core/objects.mjs';
import {prepareProject,materializePrepared,retainCatalogueInputs,compileCatalogueInput} from './native-intake.mjs';
import {buildLoadedBikesAcceptance} from './acceptance.mjs';

const ADDON=dirname(fileURLToPath(import.meta.url)),WORKBENCH=resolve(ADDON,'../../workbench');
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const json=value=>JSON.stringify(value,null,2)+'\n',read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const eq=(a,b)=>canonical(a)===canonical(b);
const selected=(rows,id)=>{const row=rows.find(r=>r.id===id);check(row,'Original retained identity is missing: '+id);return row;};
function regular(path){check(!lstatSync(path).isSymbolicLink()&&lstatSync(path).isFile(),'Keep an ordinary complete source file: '+path);return readFileSync(path);}
function verify(path,d){const a=hashFile(path);check(a.bytes===d.bytes&&a.sha256===d.sha256,'Complete file identity changed: '+path);return a;}
function editableSources(){
  const files=[];
  for(const [directory,prefix]of [[WORKBENCH,'workbench'],[ADDON,'adaptations/loaded-bikes']]){
    const manifestPath=join(directory,'SOURCE_MANIFEST.json'),raw=regular(manifestPath),manifest=JSON.parse(raw);
    check(Array.isArray(manifest.files)&&manifest.files.length,'Keep the original complete source manifest.');
    const seen=new Set();
    for(const row of manifest.files){safeRelative(row.path);check(!seen.has(row.path),'Source manifest repeats a path.');seen.add(row.path);const full=join(directory,row.path);check(realpathSync(full)===full,'Editable source contains a symbolic link.');
      const body=regular(full);check(body.length===row.bytes&&sha(body)===row.sha256,'Complete editable source changed: '+row.path);files.push({path:prefix+'/'+row.path,body,bytes:body.length,sha256:sha(body)});}
    check(!seen.has('SOURCE_MANIFEST.json'),'The source manifest cannot include itself.');
    files.push({path:prefix+'/SOURCE_MANIFEST.json',body:raw,bytes:raw.length,sha256:sha(raw)});
  }
  check(new Set(files.map(f=>f.path)).size===files.length,'Editable source paths collide.');return files;
}
class Course{
  constructor(workspace,actor,{operation,directory}){this.ws=workspace;this.actor=actor;this.operation=operation;this.directory=directory;}
  request(key,intent,make){
    const requestId='loaded_bikes_'+identity({actor:this.actor.id,operation:this.operation,key}).slice(0,48);
    const path=join(this.directory,'requests',key+'.json');safeRelative(key);
    if(existsSync(path)){const old=read(path);check(old.intentSha256===identity(intent)&&old.request.requestId===requestId,'The original receiving request has another selection.');return old.request;}
    const request=make(requestId);atomicJson(path,{intentSha256:identity(intent),intent,request},{immutable:true});return request;
  }
  async create(key,title){const input=this.request(key,{title},requestId=>({requestId,title,notes:'Public Loaded Bikes catalogue staging; no production ERP, BOM or stock ledger is asserted.'}));return this.ws.create(this.actor,input).view.id;}
  async action(projectId,key,action,payload){
    const input=this.request(key,{projectId,action,payload},requestId=>({projectId,requestId,expectedRevision:this.ws.store.head(projectId),action,payload}));
    return this.ws.dispatch(this.actor,input);
  }
  async view(projectId){return (await this.ws.get(this.actor,projectId)).view;}
  async upload(key,raw,filename,mediaType){
    const uploadId='loaded_bikes_'+identity({operation:this.operation,key,bytes:raw.length,sha256:sha(raw)}).slice(0,48);
    let current=await this.ws.uploads.start(this.actor,{uploadId,filename,mediaType,bytes:raw.length,sha256:sha(raw)});
    while(current.offset<raw.length){const start=current.offset,end=Math.min(start+8*1024*1024,raw.length),chunk=raw.subarray(start,end);current=await this.ws.uploads.chunk(this.actor,uploadId,{start,end:end-1,total:raw.length,sha256:sha(chunk)},chunk);}
    await this.ws.uploads.finish(this.actor,uploadId);return uploadId;
  }
  async retain(projectId,key,value,role){const raw=Buffer.from(json(value)),uploadId=await this.upload(key,raw,key+'.json','application/json');
    const response=await this.action(projectId,key,'source.retain',{uploadId,title:key,role,url:'',notes:'Complete retained original Loaded Bikes review/acceptance selection.'});
    const row=selected(this.ws.store.get(projectId).sources,response.result.sourceId);check(row.sha256===sha(raw)&&row.bytes===raw.length,'Original retained source differs.');return row;
  }
  async stage(projectId,key,planId,parentJobId,stage,resume){
    const payload={planId,stage,options:{},reason:'Continue the retained original catalogue native pipeline.'};if(parentJobId)payload.parentJobId=parentJobId;
    const prepared=await this.action(projectId,key+'-prepare','run.prepare',payload),jobId=prepared.result.jobId;
    await this.action(projectId,key+'-start','job.start',{jobId});
    for(;;){
      const job=selected((await this.view(projectId)).jobs,jobId);
      if(job.status==='complete'){check(job.nativeState?.status==='complete'&&job.nativeState.result,'The original native job lacks its complete result.');for(const f of job.files)this.ws.store.objects.verify(f.sha256,f.bytes);return job;}
      if(job.status==='interrupted'&&resume){
        const attempt=job.nativeState?.attempts?.at(-1)?.id??job.nativeSnapshotSha256??'before-first-attempt';
        const uncertain=Object.values(job.nativeState?.steps??{}).some(s=>s.writesTarget&&s.status!=='complete'&&!s.result&&!['normalize','load','abort'].includes(s.id));
        check(!uncertain,'Review the original interrupted target write before resuming.');
        await this.action(projectId,key+'-resume-'+identity(attempt).slice(0,16),'job.resume',{jobId,reason:'Explicit --resume continues this same ended original native attempt.'});continue;
      }
      check(['prepared','queued','running','cancelling'].includes(job.status),'Original native job requires a reviewed continuation: '+jobId+' '+job.status);
      await new Promise(done=>setTimeout(done,1000));
    }
  }
  async output(projectId,kind,id,path){
    const file=await this.ws.readObject(this.actor,projectId,kind,id);verify(file.path,file.descriptor);
    atomicBytes(path,readFileSync(file.path),{immutable:true});return {path,...file.descriptor};
  }
}
async function measured(course,projectId,prepared,planId,job){
  const answer=await course.action(projectId,'complete-parity','comparison.create',{jobId:job.id}),view=await course.view(projectId);
  const comparison=selected(view.comparisons,answer.result.comparisonId);
  check(comparison.equal&&comparison.readyForCutover&&comparison.planId===planId,'The complete native tables have unresolved parity findings.');
  const observations=JSON.parse(course.ws.store.objects.read(comparison.observations.sha256,comparison.observations.bytes));
  check(observations.streams.length===4&&observations.completeTables===true&&observations.pendingPackages===false&&observations.failedJobs===false,'The native package/table population is incomplete.');
  const plan=JSON.parse(course.ws.store.objects.read(selected(view.plans,planId).compiled.sha256,selected(view.plans,planId).compiled.bytes));
  for(const table of prepared.binding.tables){const stream=observations.streams.find(s=>s.streamId===plan.acceptance.find(a=>a.table===table.tableName)?.id);check(stream,'An original catalogue table is missing.');
    for(const side of ['left','right'])check(stream[side].source.complete===true&&stream[side].source.rowCount===table.rowCount&&stream[side].rows.length===table.rowCount,'An original complete catalogue population differs.');}
  const input=buildLoadedBikesAcceptance({pipelinePlan:plan,catalogue:prepared.project.capture,mapping:prepared.project.review});
  const source=await course.retain(projectId,'business-acceptance-input',input,'acceptance_input');
  const compiled=await course.action(projectId,'business-acceptance-compile','acceptance.compile',{title:input.title,sourceId:source.id,planId});
  const evaluated=await course.action(projectId,'business-acceptance-evaluate','acceptance.evaluate',{acceptancePlanId:compiled.result.acceptancePlanId,comparisonId:comparison.id});
  const report=selected((await course.view(projectId)).acceptanceReports,evaluated.result.acceptanceReportId);
  check(report.readyForCutover===true&&report.findings.length===0,'Required catalogue business acceptance has unresolved findings.');
  return {comparison,report,observations,plan};
}
async function audit(workspace,actor,projectId,expected){
  const view=(await workspace.get(actor,projectId)).view;
  check(view.currentPlanId===expected.planId&&view.currentAcceptanceReportId===expected.acceptanceReportId,'The original native selections changed.');
  for(const d of expected.sources){const actual=selected(view.sources,d.id);check(actual.sha256===d.sha256&&actual.bytes===d.bytes,'A complete original source changed on receiving.');workspace.store.objects.verify(actual.sha256,actual.bytes);}
  for(const id of expected.jobs){const job=selected(view.jobs,id);check(job.status==='complete','A completed original native job changed.');for(const f of job.files)workspace.store.objects.verify(f.sha256,f.bytes);}
  const versions=workspace.store.versions(projectId,view.revision);check(versions.length===view.revision+1,'An original immutable project revision is missing.');
  for(const v of versions)check(sha(Buffer.from(v.state_json))===v.sha256,'A retained project version changed.');
  return {projectId,revision:view.revision,planId:view.currentPlanId,acceptanceReportId:view.currentAcceptanceReportId,sourceCount:view.sources.length,versionCount:versions.length,jobIds:expected.jobs};
}
export async function runLoadedBikes({project,directory,receivingDirectory,runtimeReady,python='python3',operation,actorId='local-console',nativeProjectId=null,resume=false}){
  check(Number(process.versions.node.split('.')[0])>=24,'Use the original Node24+ workbench runtime.');
  check(/^[A-Za-z0-9_-]{1,120}$/.test(operation??''),'Use one stable original operation identifier.');
  const root=privateDirectory(resolve(directory)),receivedRoot=privateDirectory(resolve(receivingDirectory));check(root!==receivedRoot,'Use a separate original receiving workspace.');
  const prepared=await prepareProject(project),output=join(root,'loaded-bikes',operation),sourceFiles=editableSources(),actor={id:actorId,name:'Loaded Bikes catalogue operator',roles:['operator']};
  materializePrepared(prepared,join(output,'input'));
  const operationSelection={schema:'tjlabs.loaded-bikes-native-course.v1',operation,bindingSha256:prepared.binding.bindingSha256,actorId,nativeProjectId,receivingDirectory:receivedRoot,sourceFiles:sourceFiles.map(({body,...f})=>f)};
  atomicJson(join(output,'selection.json'),operationSelection,{immutable:true});
  let workspace=await Workspace.open({directory:root,sourceRoot:WORKBENCH,runtimeReadyFile:runtimeReady,python,sourceFiles});
  let summary,archive;
  try{
    const course=new Course(workspace,actor,{operation,directory:output}),projectId=nativeProjectId??await course.create('catalogue-project',project.title||'Loaded Bikes catalogue migration review');
    check(workspace.store.exists(projectId),'Select the original native product project.');
    await workspace.assertIdle(projectId);
    const actualIntake=await retainCatalogueInputs(workspace,actor,{projectId,operationId:operation,prepared});
    const intakePath=join(output,'original-intake.json');
    if(existsSync(intakePath)){const saved=read(intakePath);check(saved.projectId===projectId&&saved.operationId===operation&&saved.mappingSha256===actualIntake.mappingSha256&&eq(saved.sourceIds,actualIntake.sourceIds)&&eq(saved.expectedSourceIds,actualIntake.expectedSourceIds)&&saved.ledgerSourceId===actualIntake.ledgerSourceId,'The retained original intake differs.');}
    else atomicJson(intakePath,actualIntake,{immutable:true});
    const intake=read(intakePath);
    const built=compileCatalogueInput(prepared,intake,{pipelineName:'loaded_bikes_'+identity({projectId,operation}).slice(0,16),datasetName:'loaded_bikes',title:project.title||'Loaded Bikes public catalogue'});
    const source=await course.retain(projectId,'pipeline-input',built.input,'pipeline_config');
    const compiled=await course.action(projectId,'plan-compile','plan.compile',{sourceId:source.id,title:built.input.title});check(compiled.result.ready,'Original native mapping compilation requires review.');
    const planId=compiled.result.planId;
    await course.action(projectId,'plan-review','plan.review',{planId,decision:'approved',notes:'Explicit retained catalogue mappings and attributed corrections; exact independent original expected tables. Public catalogue scope only.'});
    await course.action(projectId,'runtime-select','runtime.select',{});
    const loaded=await course.stage(projectId,'native-load',planId,null,'run',resume);
    const verified=await course.stage(projectId,'native-verify',planId,loaded.id,'verify',resume);
    const accepted=await measured(course,projectId,prepared,planId,verified);
    const cutover=await course.action(projectId,'retained-catalogue-selection','cutover.apply',{comparisonId:accepted.comparison.id,acceptanceReportId:accepted.report.id,reason:'Select the fully checked retained public catalogue staging export. This is not a production ERP cutover.'});
    const consumers=[];
    for(const table of prepared.binding.tables){const streamId=accepted.plan.acceptance.find(a=>a.table===table.tableName).id;
      const data=workspace.consumer(actor,projectId,{streamId,offset:0,limit:1000});check(data.rowCount===table.rowCount&&data.rows.length===table.rowCount&&data.liveQuery===false,'The complete retained consumer table is missing.');
      consumers.push({sourceTable:table.sourceTable,...data});}
    atomicJson(join(output,'complete-consumers.json'),{schema:'tjlabs.loaded-bikes-consumers.v1',projectId,tables:consumers},{immutable:true});
    await course.output(projectId,'comparison',accepted.comparison.id,join(output,'complete-parity.json'));
    await course.output(projectId,'observations',accepted.comparison.id,join(output,'complete-observations.json'));
    const fullReport=workspace.store.objects.read(accepted.report.report.sha256,accepted.report.report.bytes);atomicBytes(join(output,'complete-business-acceptance.json'),fullReport,{immutable:true});
    const before=await course.view(projectId),expected={planId,acceptanceReportId:accepted.report.id,sources:before.sources.map(s=>({id:s.id,bytes:s.bytes,sha256:s.sha256})),jobs:[loaded.id,verified.id]};
    const handoff=await course.action(projectId,'complete-editable-handoff','handoff.prepare',{title:'Loaded Bikes — complete original catalogue migration',notes:'All original source, exact independent expectations, reviewed mappings, native tables, acceptance, history and complete editable workbench plus catalogue app.'});
    const view=await course.view(projectId),h=view.handoffCustody[handoff.result.handoffId];check(h?.status==='complete','The original complete handoff is not sealed.');
    archive=await course.output(projectId,'handoff',h.id,join(output,'loaded-bikes-complete.ndjson'));
    const inspected=await workspace.archives.inspect(archive.path,{retainObjects:false});
    check(inspected.header.projectId===projectId&&eq(inspected.header.sourceManifest,sourceFiles.map(({body,...f})=>f)),'The whole editable source handoff differs.');
    summary={schema:'tjlabs.loaded-bikes-native-result.v1',operation,projectId,bindingSha256:prepared.binding.bindingSha256,planId,semanticPlanId:built.compiled.planId,loadJobId:loaded.id,verifyJobId:verified.id,
      comparisonId:accepted.comparison.id,acceptanceReportId:accepted.report.id,selection:cutover.result.selection,intake,handoffId:h.id,archive,expected,originalEngine:'dlt 1.31.0',scope:prepared.binding.meaning};
    atomicJson(join(output,'native-result.json'),summary,{immutable:true});
  }finally{await workspace.close();}
  workspace=await Workspace.open({directory:receivedRoot,sourceRoot:WORKBENCH,runtimeReadyFile:runtimeReady,python,sourceFiles});
  let receipt;
  try{
    const course=new Course(workspace,actor,{operation:operation+'-receive',directory:join(output,'receiving')});
    const empty=await course.create('receiving-project','Received Loaded Bikes catalogue');
    const raw=regular(archive.path);verify(archive.path,archive);const uploadId=await course.upload('whole-handoff',raw,'loaded-bikes-complete.ndjson','application/x-ndjson');
    receipt=(await course.action(empty,'whole-handoff-receive','handoff.receive',{uploadId})).result;
    check(receipt.projectId===summary.projectId&&receipt.packageSha256===archive.sha256,'The original complete receiving selected another project/archive.');
    const original=await retainCatalogueInputs(workspace,actor,{projectId:summary.projectId,operationId:operation,prepared});
    check(original.completedOriginalIntakeAdopted&&eq(original.sourceIds,summary.intake.sourceIds)&&eq(original.expectedSourceIds,summary.intake.expectedSourceIds),'Receiving did not reopen the original source bindings.');
    summary.receiving=await audit(workspace,actor,summary.projectId,summary.expected);
    safeRelative(receipt.editableSource);const copied=join(receivedRoot,receipt.editableSource);
    for(const f of sourceFiles)verify(join(copied,f.path),f);
    atomicJson(join(copied,'adaptations/loaded-bikes/project.json'),project,{immutable:true});
    summary.editableSource=copied;
    atomicJson(join(output,'receiving-result.json'),{receipt,audit:summary.receiving,editableSource:copied},{immutable:true});
  }finally{await workspace.close();}
  const expectedPath=join(output,'cold-expected.json');atomicJson(expectedPath,{projectId:summary.projectId,...summary.expected,handoffId:summary.handoffId,archive},{immutable:true});
  const copiedDriver=join(summary.editableSource,'adaptations/loaded-bikes/receive.mjs');
  const args=[copiedDriver,'--cold-reopen',expectedPath,'--directory',receivedRoot,'--actor',actorId];
  const cold=await new Promise((yes,no)=>{const child=spawn(process.execPath,args,{cwd:summary.editableSource,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.once('error',no);child.once('exit',(code,signal)=>code===0?yes(JSON.parse(out)):no(new Error('Copied original application did not reopen: '+code+' '+signal+' '+err)));});
  check(cold.projectId===summary.projectId&&cold.originalArchiveSha256===archive.sha256,'Copied original application did not reopen the original handoff.');
  summary.coldReopen=cold;summary.status='native_received_and_reopened';summary.visualReceiving='pending actual recipient application and every outgoing artifact inspection';
  atomicJson(join(output,'RESULT.json'),summary,{immutable:true});return summary;
}
async function coldReopen(expectedPath,directory,actorId){
  const expected=read(expectedPath),actor={id:actorId,name:'Original receiving operator',roles:['operator']};
  const workspace=await Workspace.open({directory:resolve(directory),sourceRoot:WORKBENCH});
  try{const result=await audit(workspace,actor,expected.projectId,expected);const file=await workspace.readObject(actor,expected.projectId,'handoff',expected.handoffId);verify(file.path,expected.archive);
    return {...result,originalArchiveSha256:file.descriptor.sha256,sourceRoot:WORKBENCH};}
  finally{await workspace.close();}
}
export async function main(argv=process.argv.slice(2)){
  const o={};for(let i=0;i<argv.length;i++){check(argv[i].startsWith('--'),'Use named options.');const key=argv[i].slice(2);check(!Object.hasOwn(o,key),'Do not repeat an option.');if(key==='resume')o[key]=true;else{check(argv[i+1]&&!argv[i+1].startsWith('--'),'Supply an option value.');o[key]=argv[++i];}}
  if(o['cold-reopen'])return coldReopen(resolve(o['cold-reopen']),o.directory,o.actor??'local-console');
  for(const key of ['project','directory','receiving-directory','runtime-ready','operation'])check(o[key],'Supply --'+key+'.');
  return runLoadedBikes({project:read(resolve(o.project)),directory:o.directory,receivingDirectory:o['receiving-directory'],runtimeReady:resolve(o['runtime-ready']),python:o.python??'python3',operation:o.operation,actorId:o.actor??'local-console',nativeProjectId:o['native-project']??null,resume:o.resume===true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(value=>process.stdout.write(json(value))).catch(error=>{process.stderr.write(json({error:error.code??'LOADED_BIKES_RECEIVING',message:error.message,details:error.details??{}}));process.exitCode=1;});
