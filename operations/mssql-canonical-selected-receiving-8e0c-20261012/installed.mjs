import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rm,lstat,readdir} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
const [packagePath,workPath,archive,archiveSha,pin,packageJourneyPath,crashPath]=process.argv.slice(2);
const packageRoot=resolve(packagePath),work=resolve(workPath),sourceRoot=join(packageRoot,'source');
const D='stellar/scf-starforge-20261009/distribution/',F='stellar/scf-starforge-20261009/sf46-release/',P='stellar/scf-starforge-20261009/sf30-seller-sdk/mssql/';
const load=(root,path)=>import(pathToFileURL(join(root,path)).href);
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const note=(phase,extra={})=>{report.phase=phase;process.stdout.write('MSSQL_NATIVE_PHASE='+JSON.stringify({phase,...extra})+'\n');};
const report={schema:'stellar-forge.mssql-selected-native-receiving.v1',sourceRepository:'woahwhattheheck/tjlabs-stellar-merchant-workspace',sourceCommit:pin,node:process.version};
let runtimeModel,merchantSession,appId,runId,appRoot,activeRun=false;
async function child(script,args,options={}) {
 const result=spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024,...options});
 if(result.error||result.status!==0)throw Object.assign(new Error('Original native child failed'),{child:{script,status:result.status,signal:result.signal,
  stdout:result.stdout,stderr:result.stderr,error:result.error?.message}});
 return result;
}
async function until(read,check,label,timeout=60000){
 const end=Date.now()+timeout;let value;
 while(Date.now()<end){value=await read();if(check(value))return value;if(value?.phase==='FAILED'||value?.phase==='UNAVAILABLE')throw Object.assign(new Error(label+' failed'),{observed:value});await new Promise(done=>setTimeout(done,150));}
 throw Object.assign(new Error(label+' timed out'),{observed:value});
}
async function applicationState(){
 return (await runtimeModel.applicationsState({historyLimit:5})).applications.find(value=>value.id===appId);
}
async function stopApplication(){
 if(!activeRun)return;
 await runtimeModel.applicationsStop({applicationId:appId,operationId:runId});
 const stopped=await until(applicationState,value=>value&&!value.current?.active&&['STOPPED','CANCELLED','SUCCEEDED'].includes(value.phase),'original application stop');
 activeRun=false;return stopped;
}
async function openApplication(){
 const reviewed=await runtimeModel.applicationsStartReview({applicationId:appId});
 runId=randomUUID();
 const started=await runtimeModel.applicationsStart({applicationId:appId,requestId:runId,reviewId:reviewed.id});
 activeRun=true;
 const current=await until(applicationState,value=>value?.phase==='RUNNING'&&value.current?.url,'original managed startup');
 const retained=current.current.url;
 assert.equal(retained.operationId,runId);assert.equal(retained.command,'mssql-workspace');
 return {current,retained,started};
}
try {
 await mkdir(work,{mode:0o700});
 note('inspect-original-selected-package');
 const {inspectMerchantPackage,prepareMerchantPackage}=await load(sourceRoot,F+'merchant-package.mjs');
 const packageInfo=await inspectMerchantPackage(packageRoot);
 assert.equal(packageInfo.sourceCommit,pin);assert.equal(packageInfo.sourceRepository,'https://github.com/'+report.sourceRepository);
 assert.equal(packageInfo.sourceSelection.id,'mssql');assert(packageInfo.packageVersion.endsWith('.selection.mssql'));
 for(const name of ['mssql','mssql-workspace','mssql-agent','mssql-download','mssql-managed-receive','merchant-mcp','runtime-workspace'])assert(packageInfo.commands[name],name);
 const {readDistributionSpecification}=await load(sourceRoot,D+'specification.mjs');
 const distribution=await readDistributionSpecification({sourceRoot});
 assert.equal(distribution.manifest.sourceSelection.id,'mssql');
 assert.equal(distribution.spec.applicationProviders.mssql,P+'workspace/application-provider.mjs');
 assert.equal(distribution.spec.merchantProviders['mssql-workspaces'],P+'agent/provider.mjs');
 const originalRows=new Map(distribution.manifest.files.map(row=>[row.path,row]));
 for(const input of packageInfo.commandCatalog.inputs)assert.equal(input.sha256,originalRows.get(input.path.slice(7)).sha256);
 const {resolveRuntimeProfile}=await load(sourceRoot,D+'runtime-profile.mjs');
 const driverProfile=await resolveRuntimeProfile({sourceRoot,native:true,features:['mssql','mcp'],operator:true});
 assert.equal(driverProfile.dependencies.find(row=>row.name==='mssql').version,'12.7.4');
 report.selectedProfile={profileId:driverProfile.profileId,selection:driverProfile.selection,
  dependencies:driverProfile.dependencies.map(row=>({name:row.name,version:row.version,probes:row.probes})),host:driverProfile.host};
 const prepared=await prepareMerchantPackage({packageDirectory:packageRoot,output:join(work,'prepared'),expectedManifest:packageInfo.sourceManifestSha256});
 const {install,status}=await load(sourceRoot,F+'product.mjs');
 const installed=await install(prepared.release,join(work,'home'),{expected:prepared.digest,activate:true});
 const state=await status(installed.home),installedRoot=join(state.releaseDirectory,'source');
 assert.equal(state.sourceCommit,pin);assert.equal(state.commandCatalog.sourceSelection.id,'mssql');
 const {MANIFEST}=await load(sourceRoot,F+'release-core.mjs');
 const manifest=JSON.parse(await readFile(join(state.releaseDirectory,MANIFEST),'utf8'));
 assert.equal(manifest.source.repository,report.sourceRepository);
 const command=await child(join(installed.home,'forge.mjs'),['run','mssql-agent','--home',installed.home,'--','--help']);
 assert.match(command.stdout,/SQL Server|mssql/i);
 report.installation={sourceFiles:packageInfo.sourceFiles,sourceBytes:packageInfo.sourceBytes,
  packageVersion:packageInfo.packageVersion,sourceManifestSha256:packageInfo.sourceManifestSha256,
  sourceSelection:packageInfo.sourceSelection,commands:Object.keys(packageInfo.commands),releaseId:state.activeReleaseId,digest:state.digest};
 note('installed-original-package-transfer');
 const packageWork=join(work,'package-receiving');await mkdir(packageWork,{mode:0o700});
 const packageChild=await child(packageJourneyPath,[installedRoot,packageWork,pin]);
 report.packageTransfer=JSON.parse(packageChild.stdout);
 assert(report.packageTransfer.receivedReopened&&report.packageTransfer.customerClientLoaded&&report.packageTransfer.originalSenderRemoved);
 note('original-published-record-recovery');
 const originalStore=await load(installedRoot,P+'workspace/operator-store.mjs');
 const originalOperator=await load(installedRoot,P+'workspace/operator.mjs');
 const sourceFile=join(installedRoot,P+'examples/source.json'),identityState=join(work,'identity-recovery');
 const crash=(kind,stateDirectory,id,manifestSha)=>{
  const result=spawnSync(process.execPath,[crashPath,installedRoot,kind,sourceFile,stateDirectory,id??'',manifestSha??''],{
    encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
  assert.equal(result.signal,'SIGKILL',JSON.stringify({status:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr}));
  assert.match(result.stdout,/MSSQL_ORIGINAL_PUBLICATION_LINKED/);return result;
 };
 crash('identity',identityState);
 const identityPath=join(identityState,'operator','workspace.json');
 const identityBefore=await readFile(identityPath);assert.equal((await lstat(identityPath)).nlink,2);
 const unrelated=join(identityState,'operator','.mssql-'+randomUUID()+'.next');
 await writeFile(unrelated,'uncommitted original stage',{mode:0o600});
 let reopened=await originalOperator.createMssqlOperator({sourceFile,stateDirectory:identityState});
 assert.equal((await reopened.info()).workspaceId,JSON.parse(identityBefore).workspaceId);
 assert((await readFile(identityPath)).equals(identityBefore));assert.equal((await lstat(identityPath)).nlink,1);
 assert.equal(await readFile(unrelated,'utf8'),'uncommitted original stage');await reopened.close();
 const transferId=randomUUID(),receiver=join(packageWork,'receiver');
 crash('export-result',receiver,transferId,report.packageTransfer.packageManifestSha256);
 const resultPath=join(receiver,'operator','results',transferId+'.json'),resultBefore=await readFile(resultPath);
 assert.equal((await lstat(resultPath)).nlink,2);
 reopened=await originalOperator.createMssqlOperator({sourceFile,stateDirectory:receiver});
 const replay=await reopened.exportSource({releaseId:'catalog_example',manifestSha256:report.packageTransfer.packageManifestSha256,
  kind:'customer',operationId:transferId});
 assert.equal(replay.exportId,transferId);assert.equal((await lstat(resultPath)).nlink,1);
 assert((await readFile(resultPath)).equals(resultBefore));
 await reopened.close();
 report.publicationRecovery={identityReopened:true,workspaceId:JSON.parse(identityBefore).workspaceId,
  completedExportId:transferId,completedResultSha256:sha(resultBefore),sameCommittedBytes:true,uncommittedStageRetained:true};
 note('original-offline-controller-runtime');
 const runtime=await load(installedRoot,D+'runtime-install.mjs'),runtimeDir=join(work,'operator-runtime');
 const selectedRuntime=await runtime.prepareRuntimeInstall({directory:runtimeDir,archive,sha256:archiveSha,native:false,features:[],operator:true});
 assert.equal(selectedRuntime.dependencies.length,0);
 const ready=await runtime.installRuntime({directory:runtimeDir,offline:true,cache:join(work,'npm-cache')});
 assert.equal(ready.status,'READY');assert.equal(ready.ready,true);
 const checked=await runtime.inspectRuntimeInstall({directory:runtimeDir,load:true,source:true});
 assert.equal(checked.ready,true);assert.equal(checked.sourceVerified,true);
 report.operatorRuntime={installationId:selectedRuntime.installationId,profileId:selectedRuntime.profileId,
  status:ready.status,dependencyCount:0,offline:true,sourceVerified:checked.sourceVerified};
 const runtimeSource=selectedRuntime.sourceRoot;
 const {readApplicationProviders}=await load(runtimeSource,D+'runtime-workspace/application-providers.mjs');
 const providers=await readApplicationProviders({sourceRoot:runtimeSource});
 assert(providers.catalog.some(row=>row.id==='mssql'));
 report.applicationProvider=providers.sources.find(row=>row.id==='mssql');
 note('original-applications-save-and-start');
 const {adoptMerchantRuntime}=await load(runtimeSource,F+'runtime-package.mjs');
 const adopted=await adoptMerchantRuntime({directory:runtimeDir,home:join(work,'managed-home'),activate:true});
 const {createRuntimeWorkspace,openRuntimeWorkspace}=await load(runtimeSource,D+'runtime-workspace/model.mjs');
 appRoot=join(work,'applications');await createRuntimeWorkspace({directory:appRoot});
 runtimeModel=await openRuntimeWorkspace({directory:appRoot});
 const attached=await runtimeModel.attach({directory:runtimeDir,label:'SQL Server original operator'});
 const home=await runtimeModel.openManagedHome({directory:adopted.home,label:'SQL Server managed source'});
 const stateDirectory=join(work,'managed-sql');
 const sqlIdentity=await originalStore.initializeMssqlOperator({sourceFile,stateDirectory});
 const envPath=join(work,'operator-environment.json');await writeFile(envPath,json({STARFORGE_MSSQL_PASSWORD:randomBytes(32).toString('hex')}),{mode:0o600});
 const reviewed=await runtimeModel.applicationsReview({runtimeId:attached.runtimeId,homeId:home.homeId,kind:'mssql',
  label:'SQL Server receiving workspace',settings:{sourceFile,stateDirectory,environmentFile:envPath,port:0}});
 const saved=await runtimeModel.applicationsSave({requestId:randomUUID(),reviewId:reviewed.id,applicationId:null});
 assert.equal(saved.connectionError,null);appId=saved.applicationId;
 let running=await openApplication();
 const originalUrl=new URL(running.retained.url),token=originalUrl.hash.slice(1);
 const response=await fetch(new URL('/api/info',originalUrl),{headers:{'x-workspace-token':token,'x-mssql-workspace-id':sqlIdentity.workspaceId}});
 assert.equal(response.status,200);const info=await response.json();assert.equal(info.workspaceId,sqlIdentity.workspaceId);
 assert.equal(info.profileId,sqlIdentity.profileId);assert.equal(info.instanceId,running.retained.original.instanceId);
 for(const [route,relative] of [['/',P+'workspace/public/index.html'],['/app.mjs',P+'workspace/public/app.mjs']]){
  const response=await fetch(new URL(route,originalUrl));assert.equal(response.status,200);
  const actual=Buffer.from(await response.arrayBuffer());assert.equal(sha(actual),sha(await readFile(join(runtimeSource,relative))));
 }
 note('original-merchant-provider-and-mcp');
 const connection=join(work,'mssql-connection.json');
 await writeFile(connection,json({schema:'stellar-forge.mssql-workspace-connection.v1',
  workspaces:{catalog:{workspaceId:sqlIdentity.workspaceId,consoleUrlFile:join(appRoot,'operations',runId,'application-url.json'),deliveries:{}}}}),{mode:0o600});
 const {initializeMssqlWorkspaceMerchant}=await load(runtimeSource,P+'agent/setup.mjs');
 const merchant=await initializeMssqlWorkspaceMerchant({directory:join(work,'merchant'),connection,name:'SQL Server installed merchant'});
 const reopenedMerchant=await initializeMssqlWorkspaceMerchant({directory:join(work,'merchant'),connection,name:'SQL Server installed merchant'});
 assert.equal(reopenedMerchant.state,'REOPENED');
 const {startMerchantMcp}=await load(runtimeSource,'stellar-forge/mcp-merchant-operator/serve.mjs');
 const accessToken=randomBytes(32).toString('hex');
 merchantSession=await startMerchantMcp({configPath:merchant.configuration,port:0,
  environment:{...process.env,MCP_ACCESS_TOKEN:accessToken},consoleDirectory:join(work,'merchant-console')});
 const nativeTools=merchantSession.operator.tools.filter(row=>row.name.startsWith('merchant_mssql_'));
 assert.equal(nativeTools.length,21);
 const rpc=async(method,params)=>{
  const response=await fetch(merchantSession.url,{method:'POST',headers:{authorization:'Bearer '+accessToken,
    'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'},
   body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,...(params===undefined?{}:{params})})});
  assert.equal(response.status,200);const value=await response.json();assert(!value.error,JSON.stringify(value.error));assert(!value.result?.isError,JSON.stringify(value.result));
  return value.result;
 };
 const initialized=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'MSSQL original installed receiving',version:'1'}});
 assert.equal(initialized.protocolVersion,'2025-11-25');
 const tools=await rpc('tools/list');assert.equal(tools.tools.filter(row=>row.name.startsWith('merchant_mssql_')).length,21);
 const statusReply=await rpc('tools/call',{name:'merchant_mssql_status',arguments:{workspace:'catalog',workspaceId:sqlIdentity.workspaceId}});
 assert.equal(statusReply.structuredContent.result.workspaceId,sqlIdentity.workspaceId);
 const operations=await rpc('tools/call',{name:'merchant_mssql_operations',arguments:{workspace:'catalog',workspaceId:sqlIdentity.workspaceId,limit:10}});
 assert.equal(operations.structuredContent.workspaceId,sqlIdentity.workspaceId);
 report.merchant={provider:'mssql-workspaces',tools:nativeTools.map(row=>row.name),configurationReopened:true,
  statusWorkspaceId:sqlIdentity.workspaceId,protocolVersion:initialized.protocolVersion,originalHttp:true};
 await merchantSession.close();merchantSession=null;
 note('original-application-restart-and-reopen');
 const firstRun=runId,firstInstance=info.instanceId;
 await stopApplication();running=await openApplication();
 assert.notEqual(runId,firstRun);assert.notEqual(running.retained.original.instanceId,firstInstance);
 assert.equal(running.retained.original.workspaceId,sqlIdentity.workspaceId);
 await stopApplication();
 await runtimeModel.close();runtimeModel=await openRuntimeWorkspace({directory:appRoot});
 const final=await applicationState();assert.equal(final.id,appId);assert.equal(final.totalRuns,2);
 report.application={applicationId:appId,workspaceId:sqlIdentity.workspaceId,firstRunId:firstRun,secondRunId:runId,
  sourceCommit:final.release.sourceCommit,phase:final.phase,totalRuns:final.totalRuns,sameWorkspaceAfterRestart:true,
  sourceBoundStartup:true,originalAssetsServed:true};
 note('completed');
 process.stdout.write('MSSQL_SELECTED_RECEIVING='+JSON.stringify(report)+'\n');
} catch(error) {
 let log=null;
 if(appRoot&&runId){try{log=(await readFile(join(appRoot,'operations',runId,'worker.log'),'utf8')).slice(-20000);}catch{}}
 process.stderr.write('MSSQL_SELECTED_FAILURE='+JSON.stringify({...report,error:error.code??error.name,message:error.message,
  stack:error.stack,child:error.child,observed:error.observed,workerLog:log})+'\n');process.exitCode=1;
} finally {
 await merchantSession?.close().catch(error=>process.stderr.write('MSSQL_MCP_CLOSE='+error.message+'\n'));
 if(activeRun)await stopApplication().catch(error=>process.stderr.write('MSSQL_APP_CLOSE='+error.message+'\n'));
 await runtimeModel?.close();
}
