#!/usr/bin/env node
// MIT. Continue the original completed commissioning through actual Applications and agent APIs.
import {readFile,writeFile,open,mkdir,rename,stat,realpath} from 'node:fs/promises';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openRuntimeWorkspace} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/model.mjs';
import {inspectMerchantRuntime} from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import {createPropertyContinuityClient} from './client.mjs';
import {MerchantPropertyContinuity,readPropertyContinuityConfiguration} from './merchant.mjs';
import {inspectSource,readConnection} from './binding.mjs';
import {canonical,sha,need,absolute,UUID,SOURCE_SHA256,bytes,jsonFile} from './contract.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'../..');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const digest=v=>sha(canonical(v));
const uuid=(operation,label)=>{const h=createHash('sha256').update(operation+'\0'+label).digest('hex').slice(0,32).split('');h[12]='5';h[16]=((parseInt(h[16],16)&3)|8).toString(16);const s=h.join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');};
async function syncDir(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function privateDir(path){await mkdir(path,{recursive:true,mode:0o700});const s=await stat(path);need(s.isDirectory()&&(s.mode&0o077)===0&&await realpath(path)===path,'RECEIVING_DIRECTORY');}
async function retain(path,value){
 const raw=Buffer.from(canonical(value));await privateDir(dirname(path));
 try{const old=await bytes(path,32*1024*1024,{privateOnly:true});need(old.equals(raw),'RECEIVING_INPUT_CHANGED',path);return value;}catch(e){if(e.code!=='ENOENT')throw e;}
 const partial=path+'.partial',fd=await open(partial,'w',0o600);
 try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}
 await rename(partial,path);await syncDir(dirname(path));return value;
}
async function optional(path){try{return await jsonFile(path,32*1024*1024,{privateOnly:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
class Course{
 constructor(directory,input){this.directory=directory;this.input=input;this.operation=input.operationId;}
 id(label){return uuid(this.operation,'managed/'+label);}
 async effect(label,make,run){
  need(/^[a-z0-9_-]+$/.test(label),'RECEIVING_LABEL');
  const path=join(this.directory,'control',label);await privateDir(path);
  const frozen=await optional(join(path,'input.json'))??await retain(join(path,'input.json'),await make());
  const result=await optional(join(path,'result.json'));if(result!==null)return result;
  const returned=await run(frozen);need(returned!==undefined,'RECEIVING_RESULT');
  return retain(join(path,'result.json'),returned);
 }
}
async function currentApplication(model,id){const value=await model.applicationsState({historyLimit:5});const row=value.applications.find(x=>x.id===id);need(row,'APPLICATION_MISSING');return row;}
async function poll(label,deadline,read,accept){
 let latest;while(Date.now()<deadline){latest=await read();if(accept(latest))return latest;await wait(750);}
 const error=new Error(label+' is still pending; resume this same operation.');error.code='PROPERTY_CONTINUITY_MANAGED_PENDING';error.observation=latest;throw error;
}
async function outputFile(path,producer,expected){
 await privateDir(dirname(path));try{const raw=await bytes(path,384*1024*1024,{privateOnly:true});if(expected)need(raw.length===expected.bytes&&sha(raw)===expected.sha256,'DELIVERY_CHANGED');return {path,bytes:raw.length,sha256:sha(raw)};}catch(e){if(e.code!=='ENOENT')throw e;}
 const temporary=path+'.partial',fd=await open(temporary,'w',0o600);let n=0;
 let result;try{result=await producer(async b=>{let at=0;while(at<b.length){const r=await fd.write(b,at,b.length-at,n+at);need(r.bytesWritten>0,'FILE_WRITE');at+=r.bytesWritten;}n+=b.length;});await fd.sync();}finally{await fd.close();}
 const raw=await bytes(temporary,384*1024*1024,{privateOnly:true});need(result.bytes===n&&raw.length===n&&sha(raw)===result.sha256,'DELIVERY_CHANGED');if(expected)need(n===expected.bytes&&sha(raw)===expected.sha256,'DELIVERY_CHANGED');
 await rename(temporary,path);await syncDir(dirname(path));return {path,bytes:n,sha256:result.sha256};
}
async function allPages(client,kind,id,key){
 const rows=[];for await(const page of client.pages(kind,id,{limit:100})){need(Array.isArray(page[key]),'PAGE_SHAPE');rows.push(...page[key]);}
 return rows;
}
async function inspectReports(client,expected,out){
 const current=await client.state();need(current.revision===expected.revision&&current.sha256===expected.stateSha256,'CASE_REVISION_CHANGED');
 const history=await allPages(client,'history',null,'items');need(history.length===expected.commandCount,'HISTORY_COVERAGE');
 const sources=[],reports=[],files=[];
 for(const s of expected.sources){const rows=await allPages(client,'sourceRows',s.id,'rows');need(rows.length===s.rows,'SOURCE_COVERAGE');sources.push({id:s.id,rows:rows.length,originalPagedRowsSha256:s.pagedRowsSha256,parsedRowsSha256:digest(rows)});}
 for(const r of expected.reports){
  const rows=await allPages(client,'reportRows',r.id,'rows'),findings=await allPages(client,'findings',r.id,'findings');
  need(rows.length===r.rows&&findings.length===r.findings,'REPORT_COVERAGE');
  const target=join(out,r.id+'.json'),file=await outputFile(target,consume=>client.download({kind:'report',id:r.id,format:'json'},consume),{bytes:expected.files.find(x=>x.path.endsWith(r.id+'.json')).bytes,sha256:r.sha256});
  const full=JSON.parse((await bytes(target,64*1024*1024,{privateOnly:true})).toString('utf8'));
  need(canonical(rows)===canonical(full.rows)&&canonical(findings)===canonical(full.findings),'REPORT_COVERAGE');files.push(file);
  reports.push({id:r.id,rows:rows.length,findings:findings.length,sha256:r.sha256});
 }
 return {revision:current.revision,stateSha256:current.sha256,historyCount:history.length,sources,reports,files};
}
async function start(model,course,applicationId,settings,label,timeout){
 const startId=course.id(label);
 const reviewed=await course.effect(label+'-review',()=>({applicationId}),x=>model.applicationsStartReview(x));
 await course.effect(label+'-dispatch',()=>({applicationId,reviewId:reviewed.id,requestId:startId}),x=>model.applicationsStart(x));
 const prior=await currentApplication(model,applicationId);
 if(prior.current?.id===startId&&prior.current.active===false&&['INTERRUPTED','FAILED'].includes(prior.current.phase)){
  await course.effect(label+'-recover',()=>({applicationId,operationId:startId}),x=>model.applicationsRecover(x));
 }
 const row=await poll('Original managed application '+startId,Date.now()+timeout,()=>currentApplication(model,applicationId),
  value=>value.current?.id===startId&&value.phase==='RUNNING'&&value.current.active===true);
 const connection=await readConnection(settings.connectionFile,{workspaceId:course.input.workspaceId,workspaceDirectory:settings.workspaceDirectory,applicationRequestId:startId});
 need(connection.applicationRequestId===startId,'APPLICATION_RUN_CHANGED');
 return {applicationId,operationId:startId,phase:row.phase,instanceId:connection.instanceId,process:connection.process};
}
async function stop(model,course,applicationId,label,timeout){
 const operationId=course.id(label);
 await course.effect(label+'-stop-request',()=>({applicationId,operationId}),x=>model.applicationsStop(x));
 const row=await poll('Original managed stop '+operationId,Date.now()+timeout,()=>currentApplication(model,applicationId),
  value=>value.current?.id===operationId&&value.current.active===false&&['STOPPED','FAILED','CANCELLED','SUCCEEDED'].includes(value.phase));
 need(row.phase==='STOPPED','MANAGED_CLOSE_FAILED','Inspect the retained original command result.');
 return course.effect(label+'-closed',()=>({applicationId,operationId}),async()=>({applicationId,operationId,phase:row.phase,closed:true}));
}
async function merchantArchive(owner,scope,selection,path){
 const fd=await open(path+'.partial','w',0o600);let offset=0,readId=null,identity=null;
 try{
  do{
   const page=await owner.call('merchant_property_continuity_file_read',{...scope,selection,offset,limit:196608,...(readId?{readId}:{}),expectedSha256:selection.expectedSha256});
   need(page.offset===offset,'FILE_PAGE');readId=page.readId;identity??=page.file;
   need(canonical(page.file)===canonical(identity),'FILE_PAGE');
   const chunk=Buffer.from(page.data,'base64');need(chunk.length===page.bytesRead,'FILE_PAGE');
   let at=0;while(at<chunk.length){const result=await fd.write(chunk,at,chunk.length-at,offset+at);need(result.bytesWritten>0,'FILE_WRITE');at+=result.bytesWritten;}
   offset=page.nextOffset;
  }while(offset!==null);
  await fd.sync();
 }finally{await fd.close();if(readId)await owner.call('merchant_property_continuity_file_release',{...scope,readId});}
 const raw=await bytes(path+'.partial',384*1024*1024,{privateOnly:true});
 need(raw.length===selection.expectedBytes&&sha(raw)===selection.expectedSha256,'MERCHANT_FILE_CHANGED');
 await rename(path+'.partial',path);await syncDir(dirname(path));return {path,bytes:raw.length,sha256:sha(raw)};
}
export async function runManagedReceiving(input){
 need(input.schema==='stellar-forge.property-continuity-managed-receiving.v1'&&UUID.test(input.operationId),'MANAGED_INPUT');
 need(input.sourceSha256===SOURCE_SHA256&&Number.isSafeInteger(input.timeoutMs)&&input.timeoutMs>=1000&&input.timeoutMs<=3600000,'MANAGED_INPUT');
 const operation=absolute(input.operationDirectory),directory=join(operation,'managed-integration');await privateDir(directory);
 const guard=Number(process.env.PROPERTY_CONTINUITY_RECEIVING_GUARD_FD);need(Number.isSafeInteger(guard)&&guard>=3,'ORIGINAL_GUARD');
 const guardStat=await stat('/proc/self/fd/'+guard),lockStat=await stat(join(operation,'operation.lock'));
 need(guardStat.dev===lockStat.dev&&guardStat.ino===lockStat.ino,'ORIGINAL_GUARD');
 const plan=await jsonFile(join(operation,'input.json'),32*1024*1024,{privateOnly:true});
 const originalInputSha256=sha(await bytes(join(operation,'input.json'),32*1024*1024,{privateOnly:true}));
 const native=await jsonFile(join(operation,'native-result.json'),32*1024*1024,{privateOnly:true});
 const journal=await jsonFile(join(operation,'completed-journal.json'),32*1024*1024,{privateOnly:true});
 const nativeResultSha256=sha(await bytes(join(operation,'native-result.json'),32*1024*1024,{privateOnly:true})),completedJournalSha256=sha(await bytes(join(operation,'completed-journal.json'),32*1024*1024,{privateOnly:true}));
 need(plan.operationId===input.operationId&&plan.sourceSha256===SOURCE_SHA256&&native.operationId===input.operationId&&native.inputSha256===originalInputSha256&&native.state==='COMPLETE'&&native.allOwnedResourcesClosed===true&&journal.state==='COMPLETE'&&journal.operationId===input.operationId&&journal.nativeResultSha256===nativeResultSha256,'ORIGINAL_PROGRAMME_INCOMPLETE');
 need(plan.workspace.id===input.workspaceId&&plan.workspace.directory===input.settings.workspaceDirectory,'ORIGINAL_BRANCH');
 need(input.settings.receivingDirectory===join(directory,'workspaces')&&input.settings.connectionFile===join(plan.workspace.directory,'property-continuity-connection.json'),'MANAGED_PATHS');
 await retain(join(directory,'input.json'),input);
 await retain(join(directory,'original-completion.json'),{operationId:plan.operationId,inputSha256:originalInputSha256,nativeResultSha256,completedJournalSha256,originalSourceSha256:SOURCE_SHA256});
 const reportInventory=await jsonFile(join(directory,'reports-inventory.json'),32*1024*1024,{privateOnly:true});
 need(reportInventory.schema==='stellar-forge.property-continuity-report-inventory.v1'&&reportInventory.operationId===input.operationId&&Array.isArray(reportInventory.files),'REPORT_INVENTORY');
 const expectedReports=[...native.originalReports.files.map(x=>({...x,label:'original',workspace:plan.workspace.directory})),...native.receivedReports.files.map(x=>({...x,label:'received',workspace:plan.receiving.directory}))];
 need(reportInventory.files.length===expectedReports.length,'REPORT_INVENTORY');const reportNames=new Set();
 for(let i=0;i<expectedReports.length;i++){const original=expectedReports[i],item=reportInventory.files[i],name=original.path.split('/').at(-1),path=join(directory,'reports',original.label,name);
  need(item.path===path&&item.originalPath===original.path&&item.originalWorkspace===original.workspace&&item.bytes===original.bytes&&item.sha256===original.sha256&&!reportNames.has(path),'REPORT_INVENTORY');reportNames.add(path);
  const raw=await bytes(path,64*1024*1024,{privateOnly:true});need(raw.length===item.bytes&&sha(raw)===item.sha256,'REPORT_CHANGED');
 }
 const complete=await optional(join(directory,'result.json'));if(complete){
  need(complete.state==='COMPLETE'&&complete.inputSha256===digest(input)&&canonical(complete.reportFiles)===canonical(reportInventory.files),'RESULT_CHANGED');
  for(const item of complete.artifacts){try{const raw=await bytes(item.path,384*1024*1024,{privateOnly:true});need(raw.length===item.bytes&&sha(raw)===item.sha256,'DELIVERY_CHANGED');}
   catch(error){if(error.code!=='ENOENT')throw error;const raw=await bytes(item.sourcePath,384*1024*1024,{privateOnly:true});need(raw.length===item.bytes&&sha(raw)===item.sha256,'DELIVERY_CHANGED');await privateDir(dirname(item.path));const temporary=item.path+'.partial',fd=await open(temporary,'w',0o600);try{await fd.writeFile(raw);await fd.sync();}finally{await fd.close();}await rename(temporary,item.path);await syncDir(dirname(item.path));}}
  return complete;
 }
 await inspectSource(join(HERE,'app'));
 const model=await openRuntimeWorkspace({directory:absolute(input.runtimeWorkspace)});
 const course=new Course(directory,input);let client=null,owner=null,applicationId=null,modelClosed=false;
 try{
  const modelState=await model.state({runtimeId:input.runtimeId}),runtime=modelState.runtimes.find(x=>x.id===input.runtimeId);
  need(runtime&&runtime.phase==='READY','RUNTIME_NOT_READY');const inspected=await inspectMerchantRuntime(runtime.directory,{load:false,source:false});
  need(await realpath(inspected.sourceRoot)===await realpath(ROOT),'INSTALLED_SOURCE_CHANGED','Run this course from the selected original installed runtime.');
  await course.effect('runtime',()=>({runtimeId:input.runtimeId,directory:runtime.directory,sourceRoot:inspected.sourceRoot}),async x=>x);
  const review=await course.effect('application-review',()=>({runtimeId:input.runtimeId,kind:'property-continuity',label:input.label,settings:input.settings}),x=>model.applicationsReview(x));
  const saved=await course.effect('application-save',()=>({requestId:course.id('application-save'),reviewId:review.id}),x=>model.applicationsSave(x));applicationId=saved.applicationId;
  need(!saved.superseded,'APPLICATION_SUPERSEDED');
  await course.effect('application-connect',()=>({applicationId}),x=>model.applicationsConnect(x));
  await poll('Original application connection',Date.now()+input.timeoutMs,()=>currentApplication(model,applicationId),v=>Boolean(v.release));
  const original={id:plan.workspace.id,directory:plan.workspace.directory};
  if(await optional(join(directory,'control','first-run-stop-request','input.json'))&&!await optional(join(directory,'control','first-run-closed','result.json')))
   await stop(model,course,applicationId,'first-run',input.timeoutMs);
  if(!await optional(join(directory,'control','first-run-closed','result.json'))){
   await start(model,course,applicationId,input.settings,'first-run',input.timeoutMs);
   client=createPropertyContinuityClient({connectionFile:input.settings.connectionFile,workspaceId:original.id,workspaceDirectory:original.directory});
   await client.openBranch(original);
   await course.effect('original-reports',()=>native.originalReports,x=>inspectReports(client,x,join(directory,'reports','original')));
   const first=plan.commands[0];
   await course.effect('original-command-replay',()=>first,async x=>{const result=await client.command(x.command,x.expectedRevision);need(result.reused===true,'REQUEST_REPLAY');return result;});
   const exported=await course.effect('managed-first-export',async()=>({publicationId:course.id('managed-first-export'),revision:(await client.state()).revision}),x=>client.exportWorkspace(x.publicationId,x.revision));
   const archive=await outputFile(join(directory,'artifacts','Original_Workspace.zip'),consume=>client.download({kind:'archive',id:exported.manifest.publicationId??course.id('managed-first-export'),expectedSha256:exported.sha256,expectedBytes:exported.bytes},consume),exported);
   await client.uploadFile('archive',archive.path,archive);
   const receivedInput={operationId:course.id('managed-first-receive'),sha256:archive.sha256,bytes:archive.bytes,name:'first-receiver'};
   const firstWasRetained=await optional(join(directory,'control','managed-first-receive','result.json'));
   await course.effect('managed-first-receive',()=>receivedInput,x=>client.receive(x));
   if(firstWasRetained)await client.receive(receivedInput);
   const receiving={id:original.id,directory:join(input.settings.receivingDirectory,'first-receiver')};await client.openBranch(receiving);
   for(let i=0;i<plan.receiving.commands.length;i++){const row=plan.receiving.commands[i];await course.effect('received-command-'+i,()=>row,x=>client.command(x.command,x.expectedRevision));}
   const edited=await client.state();need(edited.revision===native.receivedEdit.revision&&edited.sha256===native.receivedEdit.sha256,'RECEIVED_EDIT_CHANGED');
   await client.openBranch(original);
   await course.effect('managed-repeat-receive',()=>receivedInput,x=>client.receive(x));await client.openBranch(receiving);
   const repeated=await client.state();need(repeated.sha256===edited.sha256&&repeated.revision===edited.revision,'REPEAT_RECEIVE_CHANGED');
   await course.effect('received-reports',()=>native.receivedReports,x=>inspectReports(client,x,join(directory,'reports','received')));
   const following=await course.effect('managed-following-export',async()=>({publicationId:course.id('managed-following-export'),revision:(await client.state()).revision}),x=>client.exportWorkspace(x.publicationId,x.revision));
   const followFile=await outputFile(join(directory,'artifacts','Received_Workspace.zip'),consume=>client.download({kind:'archive',id:course.id('managed-following-export'),expectedSha256:following.sha256,expectedBytes:following.bytes},consume),following);
   await client.uploadFile('archive',followFile.path,followFile);
   const coldInput={operationId:course.id('managed-cold-receive'),sha256:followFile.sha256,bytes:followFile.bytes,name:'cold-receiver'};
   const coldWasRetained=await optional(join(directory,'control','managed-cold-receive','result.json'));
   await course.effect('managed-cold-receive',()=>coldInput,x=>client.receive(x));
   if(coldWasRetained)await client.receive(coldInput);
   const cold={id:original.id,directory:join(input.settings.receivingDirectory,'cold-receiver')};await client.openBranch(cold);
   const coldState=await client.state();need(coldState.sha256===native.final.sha256&&coldState.revision===native.final.revision,'COLD_RECEIVE_CHANGED');
   await client.close();client=null;await stop(model,course,applicationId,'first-run',input.timeoutMs);
  }
  if(await optional(join(directory,'control','second-run-stop-request','input.json'))&&!await optional(join(directory,'control','second-run-closed','result.json')))
   await stop(model,course,applicationId,'second-run',input.timeoutMs);
  if(!await optional(join(directory,'control','second-run-closed','result.json'))){
   await start(model,course,applicationId,input.settings,'second-run',input.timeoutMs);
   client=createPropertyContinuityClient({connectionFile:input.settings.connectionFile,workspaceId:original.id,workspaceDirectory:original.directory});
   await client.openBranch(original);
   const exported=await optional(join(directory,'control','managed-first-export','result.json'));
   const inputFile=plan.files[0];need(inputFile,'ORIGINAL_SOURCE_REQUIRED');
   await privateDir(join(directory,'control','file-reads'));
   const configuration={schema:'stellar-forge.property-continuity-workspaces.v1',storageDirectory:join(directory,'control','file-reads'),
    workspaces:{original:{connectionFile:input.settings.connectionFile,workspaceId:original.id,workspaceDirectory:original.directory}},
    files:{source:{path:join(plan.filesRoot,inputFile.path),bytes:inputFile.bytes,sha256:inputFile.sha256}}};
   const configPath=join(directory,'control','agent-configuration.json');await retain(configPath,configuration);
   owner=new MerchantPropertyContinuity({propertyContinuity:await readPropertyContinuityConfiguration(configPath)});
   const scope={workspace:'original',workspaceId:original.id,workspaceDirectory:original.directory};
   await course.effect('agent-state',()=>scope,x=>owner.call('merchant_property_continuity_state',x));
   await course.effect('agent-upload',()=>({...scope,kind:'blob',fileAlias:'source',bytes:inputFile.bytes,sha256:inputFile.sha256}),x=>owner.call('merchant_property_continuity_upload',x));
   await course.effect('agent-request-replay',()=>({...scope,command:plan.commands[0].command,expectedRevision:plan.commands[0].expectedRevision}),async x=>{const value=await owner.call('merchant_property_continuity_command',x);need(value.reused===true,'AGENT_REPLAY');return value;});
   await course.effect('agent-full-archive',()=>({scope,selection:{kind:'archive',id:course.id('managed-first-export'),expectedSha256:exported.sha256,expectedBytes:exported.bytes}}),x=>merchantArchive(owner,x.scope,x.selection,join(directory,'artifacts','Agent_Original_Workspace.zip')));
   // Re-register the original cold receiver through the original receiving API after restart.
   const coldInput=await optional(join(directory,'control','managed-cold-receive','input.json'));await client.receive(coldInput);
   await client.openBranch({id:original.id,directory:join(input.settings.receivingDirectory,'cold-receiver')});
   const reopened=await client.state();need(reopened.sha256===native.final.sha256&&reopened.revision===native.final.revision,'REOPEN_CHANGED');
   await course.effect('managed-reopened',()=>({revision:reopened.revision,sha256:reopened.sha256,directory:reopened.directory}),async x=>x);
   await owner.close();owner=null;await client.close();client=null;await stop(model,course,applicationId,'second-run',input.timeoutMs);
  }
  const artifacts=[];
  for(const name of ['Original_Workspace.zip','Received_Workspace.zip','Agent_Original_Workspace.zip']){const path=join(directory,'artifacts',name),raw=await bytes(path,384*1024*1024,{privateOnly:true});const basis=await optional(join(directory,'control',name==='Received_Workspace.zip'?'managed-following-export':'managed-first-export','result.json'));
   need(raw.length===basis.bytes&&sha(raw)===basis.sha256,'DELIVERY_CHANGED');absolute(basis.path);
   artifacts.push({path,bytes:raw.length,sha256:sha(raw),sourcePath:basis.path});}
  const result={schema:'stellar-forge.property-continuity-managed-result.v1',operationId:input.operationId,inputSha256:digest(input),state:'COMPLETE',applicationId,runtimeId:input.runtimeId,runtimeDirectory:runtime.directory,sourceSha256:SOURCE_SHA256,
   originalInputSha256,nativeResultSha256,received:await optional(join(directory,'control','managed-reopened','result.json')),
   managedRuns:[course.id('first-run'),course.id('second-run')],artifacts,reportFiles:reportInventory.files,allOwnedResourcesClosed:true};
  await model.close();modelClosed=true;
  await retain(join(directory,'result.json'),result);return result;
 }catch(error){
  const path=join(directory,'control','last-interruption.json');await writeFile(path,canonical({at:new Date().toISOString(),operationId:input.operationId,applicationId,error:{code:error.code??error.name,message:error.message},state:'INTERRUPTED',allOwnedResourcesClosed:false}),{mode:0o600});
  throw error;
 }finally{
  const errors=[];for(const close of [()=>owner?.close(),()=>client?.close(),()=>modelClosed?undefined:model.close()])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Managed receiving cleanup incomplete.');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=await jsonFile(absolute(process.argv[2]),32*1024*1024,{privateOnly:true});
 console.log(JSON.stringify(await runManagedReceiving(input)));
}
