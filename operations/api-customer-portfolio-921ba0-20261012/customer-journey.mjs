import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
const context=JSON.parse(await readFile(process.argv[2],'utf8'));
const source=context.source,root=context.root;
const base=join(source,'stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access');
const {serveConfiguredWorkspace}=await import(pathToFileURL(join(base,'workspace/cli.mjs')).href);
const {openApiPassWorkspace}=await import(pathToFileURL(join(base,'workspace/model.mjs')).href);
const {ApiAccessClient}=await import(pathToFileURL(join(base,'purchase.mjs')).href);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema:'stellar-forge.sf101.customer-portfolio-journey.v1',sourceCommit:context.sourceCommit,
 environment:'LOCAL_ORIGINAL_MERCHANT_GATEWAY',operation:context.operation,startedAt:new Date().toISOString(),phases:[]};
let app,failedError;
const configFor=name=>({schema:'stellar-forge.sf101.api-pass-workspace-config.v1',directory:join(root,name),
 runtimeDirectory:join(source,'stellar/scf-starforge-20261009/sf88-operator-buyer-cli'),
 buyerWorkspace:join(root,'buyer-workspace'),buyerStateDirectory:join(root,name+'-buyer'),
 inboxDirectory:join(root,name+'-inbox'),claimEnvs:['SF101_CLAIM_TOKEN'],python:process.env.STARFORGE_PYTHON||'python3',
 title:'Customer pass portfolio'});
async function start(name,port=0){
 const config=configFor(name),file=join(root,name+'-configuration.json');
 await writeFile(file,JSON.stringify(config),{mode:0o600});
 return serveConfiguredWorkspace({configFile:file,port,approvalMode:'terminal'});
}
async function request(path,{body,raw=false}={}){
 const token=new URL(app.url).hash.slice(1),response=await fetch(app.origin+path,{method:body===undefined?'GET':'POST',
 headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{Origin:app.origin,'Content-Type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(raw){assert.equal(response.status,200);return {bytes:Buffer.from(await response.arrayBuffer()),sha256:response.headers.get('x-sf101-result-sha256')};}
 const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error),{code:value.error,status:response.status});
 return value;
}
async function mutate(path,input){const state=await request('/api/state');const body={...input,operationId:randomUUID(),expectedRevision:state.revision};
 return {body,value:await request(path,{body})};}
async function drain(){
 const until=Date.now()+90000;
 while(Date.now()<until){
  const state=await request('/api/state');
  if(!state.tasks.some(t=>['QUEUED','RUNNING','CANCELLING'].includes(t.status))){
   const failed=state.tasks.filter(t=>t.status==='FAILED');
   assert.deepEqual(failed.map(t=>t.error),[]);return state;
  }
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 throw new Error('Original task drain timed out');
}
function phase(name,details={}){report.phases.push({name,status:'PASS',...details});}
try{
 await mkdir(join(root,'buyer-workspace'),{mode:0o700,recursive:true});
 app=await start('customer');
 const workspaceId=app.workspaceId;
 const connected=[];
 for(const order of context.orders.slice(0,2)){
  const {value}=await mutate('/api/passes/connect',{label:order.label,gatewayBaseUrl:context.gateway,
   orderReference:order.reference,manifestSha256:order.manifestSha256,claimEnv:'SF101_CLAIM_TOKEN'});
  connected.push(value.result.profileId);
 }
 const [first,second]=connected;
 const batch=await mutate('/api/portfolio/refresh',{profileIds:connected});
 let state=await drain();
 assert.deepEqual(state.portfolio.passes.map(p=>p.usage.availableUnits),[4,12]);
 assert.deepEqual(state.portfolio.passes.map(p=>p.routes[0].remainingCalls),[2,6]);
 phase('Read two original purchased allowances',{workspaceId,profiles:connected,available:[4,12],routeCalls:[2,6]});
 await mutate('/api/portfolio/configure',{selectedProfileId:first,lowUnitsThreshold:3});
 const prepared=(await mutate('/api/profiles/'+first+'/calls',{requestId:'portfolio-original-request',label:'Original bound request',
  routeId:'work',query:[['q','original']],bodyBase64:null,contentType:'application/json'})).value.result;
 await mutate('/api/portfolio/configure',{selectedProfileId:second,lowUnitsThreshold:3});
 await mutate('/api/profiles/'+first+'/tasks',{kind:'call',callId:prepared.callId});
 state=await drain();
 const call=(await request('/api/calls/'+prepared.callId)).call;
 assert.equal(call.profileId,first);assert.equal(call.requestId,'portfolio-original-request');
 assert.equal(state.portfolio.settings.selectedProfileId,second);
 assert.deepEqual(state.portfolio.passes.map(p=>p.usage.availableUnits),[2,12]);
 assert.equal(state.portfolio.passes[0].status,'LOW');
 const response=await request('/api/calls/'+prepared.callId+'/result',{raw:true});
 assert.equal(sha(response.bytes),response.sha256);
 phase('Send original request after changing default',{profileId:call.profileId,requestId:call.requestId,
  selectedProfileId:second,responseBytes:response.bytes.length,responseSha256:response.sha256,available:[2,12]});
 await mutate('/api/profiles/'+first+'/tasks',{kind:'call',callId:prepared.callId});
 state=await drain();assert.deepEqual(state.portfolio.passes.map(p=>p.usage.availableUnits),[2,12]);
 const replay=await request('/api/calls/'+prepared.callId+'/result',{raw:true});assert.deepEqual(replay.bytes,response.bytes);
 const sameBatch=await request('/api/portfolio/refresh',{body:batch.body});
 assert.equal(sameBatch.result.reused,true);assert.deepEqual(sameBatch.result.tasks,batch.value.result.tasks);
 phase('Replay same saved call and same refresh action',{responseSha256:sha(replay.bytes),available:[2,12]});
 const remote=new ApiAccessClient({baseUrl:context.gateway,orderReference:context.orders[0].reference,
  manifestSha256:context.orders[0].manifestSha256,claimEnv:'SF101_CLAIM_TOKEN',environment:process.env});
 const completed=await remote.call({route:'work',requestId:'portfolio-merchant-retained',method:'GET',query:[['q','retained']],
  contentType:'application/json',output:join(root,'merchant-retained.bin')});
 const recovered=(await mutate('/api/profiles/'+first+'/adopt-request',{requestId:'portfolio-merchant-retained'})).value.result;
 const recovery=await request('/api/portfolio/requests?offset=0&limit=100');
 assert.equal(recovery.pagination.total,1);assert.equal(recovery.items[0].profileId,first);
 assert.equal(recovery.items[0].orderReference,context.orders[0].reference);
 await mutate('/api/profiles/'+first+'/tasks',{kind:'recover',callId:recovered.callId});
 state=await drain();
 const recoveredBytes=await request('/api/calls/'+recovered.callId+'/result',{raw:true});
 assert.equal(sha(recoveredBytes.bytes),completed.metadata.sha256);
 assert.equal((await request('/api/portfolio/requests?offset=0&limit=100')).pagination.total,0);
 assert.deepEqual(state.portfolio.passes.map(p=>p.usage.availableUnits),[0,12]);
 assert.equal(state.portfolio.passes[0].status,'EXHAUSTED');
 phase('Adopt and recover original merchant response',{profileId:first,requestId:'portfolio-merchant-retained',
  responseSha256:completed.metadata.sha256,available:[0,12],queueRemaining:0});
 const replacementInput={label:'Replacement allowance',gatewayBaseUrl:context.gateway,intentId:'portfolio-replacement-intent',
  claimEnv:'SF101_CLAIM_TOKEN',handoff:JSON.stringify(context.handoff)};
 const purchase=(await mutate('/api/profiles/'+first+'/replenish',replacementInput)).value.result;
 const adopted=(await mutate('/api/profiles/'+first+'/replenish',replacementInput)).value.result;
 assert.equal(adopted.profileId,purchase.profileId);assert.equal(adopted.alreadyConnected,true);
 state=await request('/api/state');
 assert.equal(state.profiles.length,3);assert.equal(state.portfolio.passes.find(p=>p.id===first).replacement.profileId,purchase.profileId);
 assert.equal(state.portfolio.passes.find(p=>p.id===purchase.profileId).replaces.profileId,first);
 const unchanged=(await request('/api/calls/'+prepared.callId)).call;assert.equal(unchanged.profileId,first);
 phase('Retain and reopen original replacement handoff',{previousProfileId:first,replacementProfileId:purchase.profileId,
  order:context.handoff.orderReference,intentId:'portfolio-replacement-intent'});
 await mutate('/api/portfolio/configure',{selectedProfileId:first,lowUnitsThreshold:3});
 await mutate('/api/profiles/'+first+'/update',{label:context.orders[0].label,archived:true});
 state=await request('/api/state');assert.equal(state.portfolio.settings.selectedProfileId,null);
 assert.deepEqual((await request('/api/calls/'+prepared.callId+'/result',{raw:true})).bytes,response.bytes);
 await mutate('/api/portfolio/configure',{selectedProfileId:second,lowUnitsThreshold:3});
 phase('Archive a selected pass and keep its saved response',{archivedProfileId:first,newDefault:second});
 const launchFile=app.launchFile;await app.close();assert.equal(JSON.parse(await readFile(launchFile,'utf8')).status,'STOPPED');
 app=await start('customer');state=await request('/api/state');
 assert.equal(app.workspaceId,workspaceId);assert.equal(state.portfolio.settings.selectedProfileId,second);
 assert.equal(state.portfolio.settings.lowUnitsThreshold,3);
 assert.equal(state.portfolio.passes.find(p=>p.id===first).replacement.profileId,purchase.profileId);
 assert.deepEqual((await request('/api/calls/'+prepared.callId+'/result',{raw:true})).bytes,response.bytes);
 phase('Cold reopen original workspace and retained portfolio',{workspaceId,profiles:state.profiles.length,selectedProfileId:second});
 let listenError;
 try{await start('occupied-port',app.port);}catch(error){listenError=error;}
 assert.equal(listenError?.code,'EADDRINUSE');assert.equal(typeof listenError.recovery?.close,'function');
 await listenError.recovery.close();
 const resumed=await start('occupied-port');await resumed.close();
 phase('Retire failed startup through the same close owner',{error:listenError.code,phase:listenError.closePhase});
 const plain=await openApiPassWorkspace({config:configFor('plain-close'),environment:process.env});
 await plain.close();let lateCalled=false;
 await assert.rejects(()=>plain.close({beforeRelease:()=>{lateCalled=true;}}),{code:'WORKSPACE_CLOSE_CALLBACK_TOO_LATE'});
 assert.equal(lateCalled,false);
 const retry=await openApiPassWorkspace({config:configFor('retry-close'),environment:process.env});
 let attempts=0;
 const beforeRelease=async()=>{retry.lease.assertHeld();if(++attempts===1)throw Object.assign(new Error('RECEIVING_CLOSE_RETRY'),{code:'RECEIVING_CLOSE_RETRY'});};
 let closeFailure;try{await retry.close({beforeRelease});}catch(error){closeFailure=error;}
 assert.equal(closeFailure.closeOwner,retry);assert.equal(closeFailure.closePhase,'before-release');
 await closeFailure.recovery.close();assert.equal(retry.closed,true);assert.equal(attempts,2);
 phase('Continue retained close callback and reject late callback',{attempts,phase:'closed'});
 const history=await request('/api/profiles/'+first+'/export',{raw:true});
 report.history={bytes:history.bytes.length,sha256:sha(history.bytes)};
 await writeFile(join(root,'customer-history.json'),history.bytes,{mode:0o600});
 await app.close();app=null;report.status='PASS';report.completedAt=new Date().toISOString();
}catch(error){
 report.status='FAILED';report.error={code:error.code??null,message:error.message,stack:error.stack};
 failedError=error;
}finally{
 if(app)try{await app.close();}catch(error){report.cleanupError={code:error.code,message:error.message};}
 await writeFile(join(root,'portfolio-journey-result.json'),JSON.stringify(report,null,2),{mode:0o600});
 process.stdout.write(JSON.stringify(report)+'\n');if(failedError)process.exitCode=1;
}
