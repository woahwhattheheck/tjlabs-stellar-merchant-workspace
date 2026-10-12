// MIT. Complete original customer -> MCP -> typed client -> retained CLI receiving.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const executeFile=promisify(execFile);
const context=JSON.parse(await readFile(process.argv[2],'utf8'));
const {source,root}=context;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await import(pathToFileURL(join(root,'portfolio-journey.mjs')).href);
const customerReport=JSON.parse(await readFile(join(root,'portfolio-journey-result.json'),'utf8'));
assert.equal(customerReport.status,'PASS','Complete the original customer journey before agent receiving.');
assert.equal(process.exitCode??0,0);
const base=join(source,'stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace');
const operator=join(source,'stellar-forge/mcp-merchant-operator');
const {serveConfiguredWorkspace}=await import(pathToFileURL(join(base,'cli.mjs')).href);
const {readApiPassWorkspaceConfiguration}=await import(pathToFileURL(join(operator,'api-pass-connection.mjs')).href);
const {connectApiPassWorkspaceClient,reopenApiPassExportDownload}=await import(pathToFileURL(join(operator,'api-pass-client.mjs')).href);
const provider=(await import(pathToFileURL(join(operator,'providers/api-pass-workspaces.mjs')).href)).default;
const {createMcpToolHandler,MCP_VERSION}=await import(pathToFileURL(join(source,'stellar-forge/mcp-paid-agent/http-tools.mjs')).href);
const agentRoot=join(root,'agent');
for(const name of ['', 'exports','snapshots','operations','client-operations','downloads','inputs'])
 await mkdir(join(agentRoot,name),{recursive:true,mode:0o700});
const handoffFile=join(agentRoot,'inputs','replacement-handoff.json');
const handoffBytes=Buffer.from(JSON.stringify(context.handoff));
await writeFile(handoffFile,handoffBytes,{mode:0o600});
const report={schema:'stellar-forge.sf101.customer-portfolio-agent-journey.v1',
 operation:context.agentOperation,customerSourceCommit:context.sourceCommit,agentSourceCommit:context.agentCommit,
 environment:'LOCAL_ORIGINAL_MERCHANT_GATEWAY_AND_AUTHENTICATED_MCP',
 startedAt:new Date().toISOString(),customerPhases:customerReport.phases.length,phases:[]};
const toolCalls={};
let app,host,server,client,endpoint,workspaceId,connectionFile,definition,mcpPort;
const token=randomBytes(32).toString('base64url');
const environment={...process.env,MCP_ACCESS_TOKEN:token};
const catalogue=provider.tools((name,description,properties,required,annotations)=>({
 name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},
 annotations:{readOnlyHint:annotations.readOnly===true,idempotentHint:annotations.idempotent===true,
 destructiveHint:annotations.destructive===true,openWorldHint:annotations.openWorld===true}
}));
assert.equal(catalogue.length,33);
const phase=(name,details={})=>report.phases.push({name,status:'PASS',...details});
async function startCustomer(){
 app=await serveConfiguredWorkspace({configFile:join(root,'customer-configuration.json'),port:0,approvalMode:'terminal'});
 workspaceId??=app.workspaceId;assert.equal(app.workspaceId,workspaceId);
}
async function startAgent(port=0){
 definition=await readApiPassWorkspaceConfiguration(connectionFile);
 host=provider.create(await provider.load(),{apiPassWorkspaces:definition});
 const handler=createMcpToolHandler({tools:catalogue,call:async(name,args)=>{
  toolCalls[name]=(toolCalls[name]??0)+1;return host.call(name,args);
 }},{bearerToken:token,maxRequestBytes:provider.maxRequestBytes,serverName:'starforge-api-pass-portfolio',
 serverVersion:'1.0.0',instructions:provider.instructions.map(row=>row.text).join('\n')});
 server=createServer(handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 mcpPort=server.address().port;endpoint='http://127.0.0.1:'+mcpPort+'/mcp';
 client=await connectApiPassWorkspaceClient({url:endpoint,workspace:'customer',workspaceId,environment});
}
async function stopAgent(){
 if(client){await client.disconnect();client=null;}
 if(server){server.closeIdleConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));server=null;}
 if(host){await host.close();host=null;}
}
async function callCli(args){
 const answer=await executeFile(process.execPath,[join(operator,'api-pass-cli.mjs'),...args],
  {cwd:source,env:environment,timeout:120000,maxBuffer:2*1024*1024});
 return JSON.parse(answer.stdout.trim());
}
const connectionFlags=()=>['--url',endpoint,'--workspace','customer','--workspace-id',workspaceId];
async function cliOperation(name,kind,args){
 const input=join(agentRoot,'inputs',name+'.json'),directory=join(agentRoot,'client-operations',name);
 await writeFile(input,JSON.stringify(args,null,2),{mode:0o600});
 const prepared=await callCli(['prepare','--directory',directory,...connectionFlags(),'--kind',kind,'--request',input]);
 const executed=await callCli(['run','--directory',directory]);
 assert.equal(executed.found,true);
 const reopened=await callCli(['reopen','--directory',directory]);
 assert.equal(reopened.phase,'REOPENED');assert.deepEqual(reopened.native,executed.native);
 return {directory,request:prepared.request,...executed};
}
async function mutation(method,args){
 const state=await client.status();
 return client[method]({...args,operationId:randomUUID(),expectedRevision:state.revision});
}
async function taskDone(profileId,taskId){
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){
  const value=await client.task({profileId,taskId});
  if(!['QUEUED','RUNNING','CANCELLING'].includes(value.task.status)){
   assert.equal(value.task.status,'COMPLETED',JSON.stringify(value.task));return value.task;
  }
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw new Error('Original agent task did not complete before the receiving deadline.');
}
const downloads=[];
async function download(exportId,selection,{interrupt=false}={}){
 const captured=await client.capture({exportId,selection});
 assert.equal(captured.state,'MANIFEST_RETAINED');
 const directory=join(agentRoot,'downloads',exportId);
 const options={exportId,directory,expectedManifestSha256:captured.manifestFile.sha256,...(interrupt?{chunkSize:32}:{})};
 if(interrupt){
  let paused=false;
  try{await client.downloadExport({...options,onProgress:()=>{paused=true;throw Object.assign(new Error('RECEIVING_DOWNLOAD_PAUSE'),{code:'RECEIVING_DOWNLOAD_PAUSE'});}});}
  catch(error){assert.equal(error.code,'RECEIVING_DOWNLOAD_PAUSE');}
  assert.equal(paused,true);
 }
 const completed=await client.downloadExport(options);
 assert.equal(completed.state,'COMPLETE');
 if(interrupt)assert.ok(completed.resumedBytes>=32);
 const reopened=await reopenApiPassExportDownload({directory,workspace:'customer',workspaceId,expectedManifestSha256:captured.manifestFile.sha256});
 assert.equal(reopened.state,'REOPENED');
 const bytes=await readFile(join(directory,captured.file.name));
 assert.equal(bytes.length,captured.file.bytes);assert.equal(sha(bytes),captured.file.sha256);
 downloads.push({exportId,directory,selection,manifestSha256:captured.manifestFile.sha256,
  file:captured.file.name,bytes:bytes.length,sha256:sha(bytes),resumedBytes:completed.resumedBytes});
 return {captured,completed,bytes};
}
try{
 await startCustomer();
 const launch=JSON.parse(await readFile(app.launchFile,'utf8'));
 connectionFile=join(agentRoot,'connection.json');
 await writeFile(connectionFile,JSON.stringify({schema:'stellar-forge.sf101.api-pass-mcp-connection.v1',workspaces:{
  customer:{label:'Original API customer portfolio',workspaceId,launchFile:app.launchFile,expectedEntrySha256:launch.source.sha256,
   exportDirectory:join(agentRoot,'exports'),snapshotDirectory:join(agentRoot,'snapshots'),operationDirectory:join(agentRoot,'operations'),
   files:{'replacement-handoff':{path:handoffFile,kind:'handoff',sha256:sha(handoffBytes),label:'Original reviewed replacement handoff'}},purchases:{}}
 }},null,2),{mode:0o600});
 await startAgent();
 await writeFile(join(agentRoot,'private-session.json'),JSON.stringify({schema:'stellar-forge.sf101.api-pass-agent-native-private.v1',
  workspaceId,connectionFile,customerConfiguration:join(root,'customer-configuration.json'),endpoint,mcpPort,
  environment:{MCP_ACCESS_TOKEN:token}},null,2),{mode:0o600});
 const listResponse=await fetch(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',
  accept:'application/json, text/event-stream','mcp-protocol-version':MCP_VERSION},
  body:JSON.stringify({jsonrpc:'2.0',id:701,method:'tools/list',params:{}})});
 assert.equal(listResponse.status,200);
 const listed=(await listResponse.json()).result.tools;
 assert.equal(listed.length,33);
 for(const suffix of ['portfolio','portfolio_requests','portfolio_configure','portfolio_refresh','purchase_replenish'])
  assert.ok(listed.some(row=>row.name==='merchant_api_pass_'+suffix));
 const opened=await client.open();assert.equal(opened.session.workspaceId,workspaceId);
 let portfolio=await client.allPortfolio();
 const first=portfolio.passes.find(row=>row.orderReference===context.orders[0].reference);
 const second=portfolio.passes.find(row=>row.orderReference===context.orders[1].reference);
 const replacement=portfolio.passes.find(row=>row.orderReference===context.orders[2].reference);
 assert.ok(first&&second&&replacement);
 assert.equal(first.archived,true);assert.equal(first.usage.availableUnits,0);assert.equal(second.usage.availableUnits,12);
 assert.equal(first.replacement.profileId,replacement.id);assert.equal(replacement.replaces.profileId,first.id);
 const cliRead=await callCli(['read',...connectionFlags(),'--kind','portfolio']);
 assert.equal(cliRead.passes.length,3);
 phase('Open actual authenticated 33-tool MCP, typed client and command entry',{workspaceId,tools:listed.length,
  profiles:portfolio.passes.length,first:first.id,second:second.id,replacement:replacement.id});
 const configureArgs={operationId:randomUUID(),expectedRevision:portfolio.revision,selectedProfileId:second.id,lowUnitsThreshold:5};
 const retainedConfigure=structuredClone(configureArgs);
 const configured=client.configurePortfolio(configureArgs);
 configureArgs.selectedProfileId=null;configureArgs.lowUnitsThreshold=999;
 await configured;portfolio=await client.allPortfolio();
 assert.equal(portfolio.settings.selectedProfileId,second.id);assert.equal(portfolio.settings.lowUnitsThreshold,5);
 const refreshArgs={operationId:randomUUID(),expectedRevision:portfolio.revision,profileIds:[second.id,first.id]};
 const retainedRefresh=structuredClone(refreshArgs);
 const refreshing=client.refreshPortfolio(refreshArgs);refreshArgs.profileIds.splice(0,2,replacement.id);
 const refreshed=await refreshing;
 assert.deepEqual(refreshed.result.tasks.map(row=>row.profileId),[second.id]);
 assert.deepEqual(refreshed.result.skipped,[{profileId:first.id,reason:'ARCHIVED'}]);
 for(const task of refreshed.result.tasks)await taskDone(task.profileId,task.taskId);
 const replayed=await client.refreshPortfolio(retainedRefresh);
 assert.equal(replayed.operation.replayed,true);assert.deepEqual(replayed.result,refreshed.result);
 const journal=await client.operation({operationId:retainedRefresh.operationId});
 assert.equal(journal.phase,'COMPLETE');assert.deepEqual(journal.originalArguments.profileIds,[second.id,first.id]);
 phase('Capture caller arguments and continue the exact native refresh batch',{configureOperationId:retainedConfigure.operationId,
  refreshOperationId:retainedRefresh.operationId,refreshed:[second.id],archivedSkip:first.id,replayed:true});
 portfolio=await client.allPortfolio();
 const prepared=await cliOperation('prepare-original-agent-request','prepare_request',{expectedRevision:portfolio.revision,
  profileId:second.id,requestId:'portfolio-agent-original-request',routeId:'work',label:'Original request through MCP',
  query:[['q','agent-original']],contentType:'application/json'});
 const callId=prepared.native.result.callId;assert.ok(callId);
 await mutation('configurePortfolio',{selectedProfileId:null,lowUnitsThreshold:5});
 const task=await mutation('enqueue',{profileId:second.id,kind:'call',callId});
 await taskDone(second.id,task.result.taskId);
 const detail=await client.callDetail({callId});
 assert.equal(detail.call.profileId,second.id);assert.equal(detail.call.requestId,'portfolio-agent-original-request');
 portfolio=await client.allPortfolio();
 assert.equal(portfolio.settings.selectedProfileId,null);
 assert.equal(portfolio.passes.find(row=>row.id===second.id).usage.availableUnits,10);
 assert.equal(portfolio.passes.find(row=>row.id===first.id).usage.availableUnits,0);
 const response=await download('portfolio-agent-response',{kind:'response',callId},{interrupt:true});
 const delivered=JSON.parse(response.bytes.toString('utf8'));
 assert.equal(delivered.operation,3);assert.equal(delivered.path,'/work?q=agent-original');
 const replayTask=await mutation('enqueue',{profileId:second.id,kind:'call',callId});
 await taskDone(second.id,replayTask.result.taskId);
 assert.equal((await client.allPortfolio()).passes.find(row=>row.id===second.id).usage.availableUnits,10);
 phase('Prepare in retained CLI, send through MCP and resume the complete response',{callId,profileId:second.id,
  requestId:'portfolio-agent-original-request',responseBytes:response.bytes.length,responseSha256:sha(response.bytes),
  available:[0,10],resumedBytes:response.completed.resumedBytes});
 portfolio=await client.allPortfolio();
 const renewed=await cliOperation('reopen-original-replacement','purchase_replenish',{expectedRevision:portfolio.revision,
  profileId:first.id,label:'Replacement allowance',gatewayBaseUrl:context.gateway,intentId:'portfolio-replacement-intent',
  claimEnv:'SF101_CLAIM_TOKEN',handoff:'replacement-handoff',expectedHandoffSha256:sha(handoffBytes)});
 assert.equal(renewed.native.result.profileId,replacement.id);assert.equal(renewed.native.result.replacesProfileId,first.id);
 const calls=await client.allHistory({profileId:first.id,view:'calls'});
 const originalCall=calls.items.find(row=>row.requestId==='portfolio-original-request');
 assert.ok(originalCall);assert.equal(originalCall.profileId,first.id);
 assert.equal((await client.allPortfolioRequests()).items.length,0);
 phase('Reopen the original replacement and complete original request inventory',{replacement:replacement.id,
  predecessor:first.id,originalCalls:calls.items.length,attention:0});
 await download('portfolio-previous-response',{kind:'response',callId:originalCall.id});
 await download('portfolio-predecessor-history',{kind:'history',profileId:first.id});
 await download('portfolio-current-history',{kind:'history',profileId:second.id});
 await download('portfolio-replacement-history',{kind:'history',profileId:replacement.id});
 const stoppedLaunch=app.launchFile;await app.close();app=null;
 assert.equal(JSON.parse(await readFile(stoppedLaunch,'utf8')).status,'STOPPED');
 const stoppedDownload=await client.downloadExport({exportId:'portfolio-agent-response',
  directory:join(agentRoot,'downloads','stopped-customer-response'),expectedManifestSha256:response.captured.manifestFile.sha256});
 assert.equal(stoppedDownload.state,'COMPLETE');
 phase('Download retained response and full histories with the customer stopped',{exports:downloads.length,
  responseSha256:sha(response.bytes),bytes:downloads.reduce((n,row)=>n+row.bytes,0)});
 const previousPort=mcpPort;await stopAgent();
 await startCustomer();await startAgent(previousPort);
 portfolio=await client.allPortfolio();
 assert.equal(portfolio.passes.length,3);assert.equal(portfolio.settings.selectedProfileId,null);
 assert.equal(portfolio.passes.find(row=>row.id===second.id).usage.availableUnits,10);
 assert.equal(portfolio.passes.find(row=>row.id===first.id).replacement.profileId,replacement.id);
 const resumedRefresh=await client.refreshPortfolio(retainedRefresh);
 assert.equal(resumedRefresh.operation.replayed,true);assert.deepEqual(resumedRefresh.result,refreshed.result);
 const reopenedCli=await callCli(['reopen','--directory',renewed.directory]);
 assert.equal(reopenedCli.native.result.profileId,replacement.id);
 const exports=await client.exports({limit:200});assert.equal(exports.items.length,5);
 for(const item of downloads){
  const restored=await reopenApiPassExportDownload({directory:item.directory,workspace:'customer',workspaceId,
   expectedManifestSha256:item.manifestSha256});assert.equal(restored.state,'REOPENED');
 }
 phase('Cold reopen customer, MCP journal, CLI result and complete exports',{workspaceId,
  retainedExports:exports.items.length,refreshReplayed:true,available:[0,10]});
 report.status='PASS';report.workspaceId=workspaceId;report.downloads=downloads;
 report.toolCalls=toolCalls;report.completedAt=new Date().toISOString();
}catch(error){
 report.status='FAILED';report.error={code:error.code??null,message:error.message,stack:error.stack};
 process.exitCode=1;
}finally{
 const failures=[];
 try{await stopAgent();}catch(error){failures.push({stage:'agent',code:error.code,message:error.message});}
 if(app)try{await app.close();app=null;}catch(error){failures.push({stage:'customer',code:error.code,message:error.message});}
 if(failures.length){report.cleanupErrors=failures;report.status='FAILED';process.exitCode=1;}
 report.completedAt??=new Date().toISOString();report.toolCalls=toolCalls;
 await writeFile(join(root,'portfolio-agent-journey-result.json'),JSON.stringify(report,null,2),{mode:0o600});
 process.stdout.write(JSON.stringify(report)+'\n');
}
