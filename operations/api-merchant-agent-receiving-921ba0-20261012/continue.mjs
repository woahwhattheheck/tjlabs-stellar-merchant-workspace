#!/usr/bin/env node
// One original merchant workspace through its installed source-owned MCP and complete client.
import {readFile,mkdir,stat,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID,randomBytes} from 'node:crypto';

const SOURCE=process.env.SCF_MERCHANT_AGENT_SOURCE;
const ORIGINAL_SOURCE='/dev/shm/921ba0-api-merchant-source/stellar/scf-starforge-20261009';
const ORIGINAL='/dev/shm/921ba0-api-native-20261011';
const CASE='/dev/shm/921ba0-api-merchant-native';
const ROOT='/dev/shm/921ba0-api-merchant-agent-native';
const ALIAS='original-paid-api',WORKSPACE='17284006-d724-4d0b-be69-d6fe586a8e8a';
const ORIGINAL_OPERATION='6d02d7fe-6016-4e8e-a2e3-b9c0bdb7c24c';
const ORIGINAL_REQUEST_SHA='18a79a8b529d64908a14bcba0594aa1c6b2664d67a74fc56bc610a79f8ee497a';
const ORDER='api-pass-native-chain-921ba0',REQUEST='api-application-analyze-921ba0-20261011';
const ORIGINAL_RESULT_SHA='080706ff21d2ab8cea344b5152c3110760a3408744db928605b55e5fa4ee3a8f';
const RESPONSE_SHA='9f1b3366668ce42810926ce0537a773b7696941762f9016b43a9f6532714ab0e';
const COMMIT='68faef31c6b0bd94ac99715f53144aa5512c0672';
const TOKEN_ENV='SCF_MERCHANT_AGENT_921BA0',PASS_ENV='SCF_MERCHANT_BACKUP_921BA0';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{code:c});};
const json=b=>JSON.parse(b.toString('utf8'));
const readJson=async p=>json(await readFile(p));
const maybe=async p=>{try{return await readJson(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const now=()=>new Date().toISOString();
const errorView=e=>({code:/^[A-Z][A-Z0-9_]{1,140}$/.test(e?.code??'')?e.code:'MERCHANT_AGENT_JOURNEY_FAILED',
 status:Number.isInteger(e?.status)?e.status:null});
need(typeof SOURCE==='string'&&SOURCE.startsWith('/dev/'),'ORIGINAL_AGENT_SOURCE_REQUIRED');
const MCP=join(SOURCE,'stellar-forge/mcp-merchant-operator');
const PRODUCT=join(ORIGINAL_SOURCE,'sf101-merchant-receiver/api-application/workspace');
const {writeBytes}=await import(pathToFileURL(join(ORIGINAL_SOURCE,'sf88-operator-buyer-cli/node/store.mjs')));
const {acquireStateLease}=await import(pathToFileURL(join(ORIGINAL_SOURCE,'merchant-fleet-gateway/state-lease.mjs')));
await mkdir(ROOT,{mode:0o700,recursive:true});
const lease=await acquireStateLease(ROOT);
let journal=await maybe(join(ROOT,'journey.json'));
if(!journal){
 journal={schema:'stellar-forge.sf101.api-merchant-agent-native-journey.v1',id:randomUUID(),createdAt:now(),
  workspaceId:WORKSPACE,sourceCommit:COMMIT,originalResultSha256:ORIGINAL_RESULT_SHA,
  actions:{},phases:[],exports:{},error:null};
 await writeBytes(join(ROOT,'journey.json'),Buffer.from(JSON.stringify(journal)+'\n'),{exclusive:true});
}
const save=async()=>{lease.assertHeld();await writeBytes(join(ROOT,'journey.json'),Buffer.from(JSON.stringify(journal)+'\n'));};
need(journal.schema==='stellar-forge.sf101.api-merchant-agent-native-journey.v1'&&journal.workspaceId===WORKSPACE&&
 journal.sourceCommit===COMMIT&&journal.originalResultSha256===ORIGINAL_RESULT_SHA,'ORIGINAL_AGENT_JOURNEY_CHANGED');
if(journal.status==='PASS'){
 const completed=await readJson(join(ROOT,'result.json'));need(completed.id===journal.id&&completed.status==='PASS','ORIGINAL_AGENT_RESULT_CHANGED');
 await lease.close();process.stdout.write(JSON.stringify({status:'PASS',state:'ORIGINAL_COMPLETION_REOPENED',phases:completed.phases.length})+'\n');
 process.exit(0);
}
const originalBytes=await readFile(join(CASE,'result.json'));
need(sha(originalBytes)===ORIGINAL_RESULT_SHA,'ORIGINAL_MERCHANT_RESULT_CHANGED');
const original=json(originalBytes);need(original.status==='PASS'&&original.workspaceId===WORKSPACE&&original.phases.length===10,'ORIGINAL_MERCHANT_INCOMPLETE');
const originalPhase=name=>{const p=original.phases.find(v=>v.name===name);need(p,'ORIGINAL_MERCHANT_PHASE_MISSING');return p.result;};
const paid=originalPhase('RESTORED_MERCHANT_AND_ORDER_MAPPING');
const backup=originalPhase('ENCRYPTED_APPLICATION_AND_OUTBOX_CAPTURED');
const originalExecution=original.originalExecution;
let privateData=await maybe(join(ROOT,'private.json'));
if(!privateData){privateData={token:randomBytes(48).toString('base64url')};
 await writeBytes(join(ROOT,'private.json'),Buffer.from(JSON.stringify(privateData)+'\n'),{exclusive:true});}
need(typeof privateData.token==='string'&&privateData.token.length>=48,'ORIGINAL_AGENT_TOKEN_REQUIRED');
const recovery=await readJson(join(CASE,'private.json')),merchantPrivate=await readJson(join(ORIGINAL,'merchant.private.json'));
need(typeof recovery.backupPassphrase==='string'&&typeof merchantPrivate.claim==='string','ORIGINAL_PRIVATE_RUNTIME_REQUIRED');
const priorPass=process.env[PASS_ENV];process.env[PASS_ENV]=recovery.backupPassphrase;
const environment={...process.env,[PASS_ENV]:recovery.backupPassphrase,[TOKEN_ENV]:privateData.token,
 SCF_API_NATIVE_CLAIM:merchantPrivate.claim,PYTHONDONTWRITEBYTECODE:'1',
 NODE_OPTIONS:'--preserve-symlinks --preserve-symlinks-main',
 NODE_PATH:'/workspace/scratch/2d589b11f06d/scf-oauth-deps/node_modules'};
const {canonical,ownedDirectory}=await import(pathToFileURL(join(PRODUCT,'configuration.mjs')));
const {inspectMerchantWorkspaceLaunch,serveConfiguredMerchantWorkspace}=await import(pathToFileURL(join(PRODUCT,'cli.mjs')));
const {originalProcess}=await import(pathToFileURL(join(PRODUCT,'native.mjs')));
const {MERCHANT_PROVIDER_REGISTRY,initializeMerchantProvider}=await import(pathToFileURL(join(MCP,'providers.mjs')));
const {startMerchantMcp}=await import(pathToFileURL(join(MCP,'serve.mjs')));
const {connectApiMerchantWorkspaceClient,reopenApiMerchantExportDownload}=await import(pathToFileURL(join(MCP,'api-merchant-client.mjs')));
const {MCP_VERSION}=await import(pathToFileURL(join(SOURCE,'stellar-forge/mcp-paid-agent/http-tools.mjs')));
const {API_MERCHANT_TOOL_DEFINITIONS}=await import(pathToFileURL(join(MCP,'api-merchant-protocol.mjs')));
let app=null,host=null,client=null,leaseRetired=false,leaseRetirementError=null;
const received=join(ROOT,'received');await ownedDirectory(received,{create:true});
const writeOrEqual=async(path,value)=>{
 const body=Buffer.from(JSON.stringify(value,null,2)+'\n');
 try{need((await readFile(path)).equals(body),'ORIGINAL_AGENT_SELECTION_CHANGED');}
 catch(error){if(error.code!=='ENOENT')throw error;await writeBytes(path,body,{exclusive:true});}
 return sha(body);
};
const openConsole=async()=>{
 if(app)return;
 const configFile=join(CASE,'configuration.json'),selected=await inspectMerchantWorkspaceLaunch({configFile,port:0});
 app=await serveConfiguredMerchantWorkspace({configFile,port:0,environment,
  expectedConfigSha256:selected.configSha256,expectedWorkspaceSha256:selected.workspace.sha256,
  expectedSourceSha256:selected.sourceSha256,expectedCodeSha256:selected.codeSha256});
 need(app.launch.workspaceId===WORKSPACE,'ORIGINAL_MERCHANT_WORKSPACE_CHANGED');
};
const connectionPath=join(ROOT,'connection.json'),setupFile=join(ROOT,'setup.json');
let setup=null;
const openHost=async()=>{
 if(!host){
  host=await startMerchantMcp({configPath:setup.configuration,port:journal.port??0,tokenEnv:TOKEN_ENV,environment});
  const port=host.server.address().port;
  if(journal.port===undefined){journal.port=port;await save();}else need(port===journal.port,'ORIGINAL_AGENT_PORT_CHANGED');
 }
 if(!client){
  client=await connectApiMerchantWorkspaceClient({url:host.url,workspace:ALIAS,workspaceId:WORKSPACE,tokenEnv:TOKEN_ENV,environment});
  if(journal.endpoint===undefined){journal.endpoint=client.endpoint;await save();}
  else need(journal.endpoint===client.endpoint,'ORIGINAL_AGENT_ENDPOINT_CHANGED');
 }
};
const closeHost=async()=>{
 if(client){await client.disconnect();client=null;}
 if(host){await host.close();host=null;}
};
const phase=async(name,work)=>{
 const previous=journal.phases.find(p=>p.name===name);if(previous)return previous.result;
 const result=await work();journal.phases.push({name,at:now(),result});journal.error=null;await save();
 process.stdout.write(JSON.stringify({phase:name,status:'COMPLETE',...result})+'\n');return result;
};
const action=async(key,kind,fields)=>{
 let saved=journal.actions[key];
 if(!saved){
  const current=await client.view();
  saved=journal.actions[key]={kind,body:{operationId:randomUUID(),expectedRevision:current.revision,...fields},preparedAt:now()};await save();
 }
 need(saved.kind===kind&&canonical(Object.fromEntries(Object.entries(saved.body).filter(([k])=>!['operationId','expectedRevision'].includes(k))))===canonical(fields),
  'ORIGINAL_AGENT_ACTION_CHANGED');
 let completed=await client.run(kind,saved.body);
 if(completed.status==='ATTENTION'&&process.argv.includes('--resume')){
  await client.resume({operationId:completed.id,requestSha256:completed.requestSha256});
  completed=await client.waitOperation({operationId:completed.id,requestSha256:completed.requestSha256});
 }
 need(completed.id===saved.body.operationId&&completed.requestSha256===sha(canonical(saved.body)),'ORIGINAL_AGENT_ACTION_ACK_CHANGED');
 if(completed.status!=='COMPLETED')throw Object.assign(new Error(completed.error?.code??'ORIGINAL_AGENT_ACTION_ATTENTION'),
  {code:completed.error?.code??'ORIGINAL_AGENT_ACTION_ATTENTION',operationId:completed.id});
 saved.completedAt??=now();saved.requestSha256=completed.requestSha256;saved.result=completed.result;await save();
 return completed;
};
const usage=pass=>{
 const u=pass?.usage;
 need(u?.allowanceUnits===8&&u.consumedUnits===2&&u.reservedUnits===0&&u.availableUnits===6,'ORIGINAL_PAID_ALLOWANCE_CHANGED');return u;
};
const exactExecution=e=>{
 need(e?.id===originalExecution.id&&e.state==='COMPLETED'&&e.attempts?.length===1&&e.result?.bytes===279&&
  e.result.sha256===RESPONSE_SHA,'ORIGINAL_PAID_EXECUTION_CHANGED');return{executionId:e.id,attempts:e.attempts.length,bytes:e.result.bytes,sha256:e.result.sha256};
};
const rememberExport=async(label,id)=>{
 const current=await client.manifest({exportId:id});
 need(current.exportId===id&&current.workspaceId===WORKSPACE&&typeof current.manifestFile?.sha256==='string','ORIGINAL_AGENT_EXPORT_CHANGED');
 const previous=journal.exports[label];
 if(previous)need(previous.exportId===id&&previous.manifestSha256===current.manifestFile.sha256,'ORIGINAL_AGENT_EXPORT_CHANGED');
 else{journal.exports[label]={exportId:id,manifestSha256:current.manifestFile.sha256,kind:current.kind,
  files:current.files.map(f=>({name:f.name,bytes:f.bytes,sha256:f.sha256})),directory:join(received,label)};await save();}
 return journal.exports[label];
};
let failure=null;
try{
 await openConsole();
 const profilePath=join(ORIGINAL,'application/application.json'),planFile=join(ORIGINAL,'api-plan.json'),
  metadataFile=join(CASE,'received/backup.json');
 const selected={schema:'stellar-forge.sf101.api-merchant-mcp-connection.v1',workspaces:{[ALIAS]:{
  label:'Original paid API merchant',launchFile:app.launchFile,workspaceId:WORKSPACE,configSha256:app.launch.configSha256,
  applications:{original:{label:'Original purchased numeric API',profilePath,planFile,
   profileFileSha256:sha(await readFile(profilePath)),planFileSha256:sha(await readFile(planFile))}},
  receiving:{downloaded:{label:'Original downloaded merchant backup',bundle:join(CASE,'received/unpacked-application-backup/bundle'),
   metadataFile,out:join(CASE,'downloaded-runtime'),passEnv:PASS_ENV,python:'python3',metadataSha256:sha(await readFile(metadataFile))}}
 }}};
 await writeOrEqual(connectionPath,selected);
 const setupOptions={directory:join(ROOT,'merchant'),connection:connectionPath,name:'Original paid API merchant agent'};
 await writeOrEqual(setupFile,setupOptions);
 setup=await initializeMerchantProvider('api-merchant-workspaces',setupOptions);
 need(setup.apiMerchantWorkspacesConfigured===true&&setup.workspaces.some(w=>w.workspace===ALIAS&&w.workspaceId===WORKSPACE),
  'ORIGINAL_REGISTERED_AGENT_SETUP_CHANGED');
 await openHost();
 await phase('REGISTERED_MERCHANT_PROVIDER_AND_CLIENT',async()=>{
  const declared=MERCHANT_PROVIDER_REGISTRY.sources.find(p=>p.id==='api-merchant-workspaces');
  need(declared&&declared.path==='stellar-forge/mcp-merchant-operator/providers/api-merchant-workspaces.mjs','ORIGINAL_PROVIDER_REGISTRATION_MISSING');
  const providerBytes=await readFile(join(SOURCE,declared.path));
  need(git(providerBytes)==='1bbfb05647764037880c941377518c05bfeb57c3','ORIGINAL_PROVIDER_SOURCE_CHANGED');
  const response=await fetch(host.url,{method:'POST',headers:{Authorization:'Bearer '+privateData.token,
   'Content-Type':'application/json','MCP-Protocol-Version':MCP_VERSION,Accept:'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:'original-merchant-tools',method:'tools/list',params:{}})});
  need(response.status===200,'ORIGINAL_AGENT_CATALOG_UNAVAILABLE');
  const body=await response.json(),actual=body.result?.tools?.filter(t=>t.name.startsWith('merchant_api_console_'))??[];
  need(actual.length===33&&canonical(actual.map(t=>t.name).sort())===canonical(API_MERCHANT_TOOL_DEFINITIONS.map(t=>t.name).sort()),
   'ORIGINAL_AGENT_CATALOG_CHANGED');
  const reopened=await initializeMerchantProvider('api-merchant-workspaces',setupOptions);
  need(reopened.state==='REOPENED'&&reopened.configuration===setup.configuration,'ORIGINAL_AGENT_SETUP_REOPEN_CHANGED');
  return{workspaceId:WORKSPACE,tools:actual.length,registeredProviders:MERCHANT_PROVIDER_REGISTRY.sources.length,
   providerSha256:declared.sha256,endpoint:client.endpoint,setupReopened:true};
 });
 await phase('ORIGINAL_WORKSPACE_AND_OPERATION_RECEIVED',async()=>{
  const inventories={};
  for(const kind of ['offers','orders','operations','exports','backups','functions']){
   const result=await client.allInventory(kind);inventories[kind]=result.total;
  }
  const order=await client.order({orderReference:ORDER}),execution=await client.execution({offerId:paid.offerId,executionId:originalExecution.id});
  need(order.order.offerId===paid.offerId,'ORIGINAL_RESTORED_ORDER_CHANGED');
  const originalOperation=await client.operation({operationId:ORIGINAL_OPERATION});
  need(originalOperation.id===ORIGINAL_OPERATION&&originalOperation.status==='COMPLETED'&&
   originalOperation.requestSha256===ORIGINAL_REQUEST_SHA,'ORIGINAL_SAVED_OPERATION_CHANGED');
  const selections=await client.selections();
  need(selections.applications.some(a=>a.handle==='original')&&selections.receiving.some(r=>r.handle==='downloaded'),'ORIGINAL_AGENT_SELECTION_MISSING');
  return{workspaceId:WORKSPACE,inventories,originalOperation:{id:originalOperation.id,requestSha256:originalOperation.requestSha256,status:originalOperation.status},
   usage:usage(order.pass),execution:exactExecution(execution.execution)};
 });
 await phase('NATIVE_SERVICE_AND_SAME_PAID_REQUEST',async()=>{
  let view=await client.view();
  if(view.service.status!=='STOPPED')await action('stop-before-'+app.launch.instanceId,'stop',{});
  await action('start-'+app.launch.instanceId,'start',{offerId:paid.offerId});
  view=await client.view();need(view.service.status==='RUNNING'&&view.service.offerId===paid.offerId,'ORIGINAL_AGENT_SERVICE_NOT_STARTED');
  const destination=join(received,'paid-response.bin');
  try{const b=await readFile(destination);need(b.length===279&&sha(b)===RESPONSE_SHA,'ORIGINAL_AGENT_RESPONSE_CHANGED');}
  catch(error){
   if(error.code!=='ENOENT')throw error;
   await originalProcess(environment.PYTHON??'python3',[join(ORIGINAL_SOURCE,'sf101-merchant-receiver/api-access/customer.py'),
    'call','--base-url','http://127.0.0.1:43112','--order',ORDER,'--claim-env','SCF_API_NATIVE_CLAIM',
    '--route','slow','--request-id',REQUEST,'--method','POST','--body',join(ORIGINAL,'application-input.json'),
    '--content-type','application/json','--out',destination],{environment,timeout:180000});
  }
  const bytes=await readFile(destination);need(bytes.length===279&&sha(bytes)===RESPONSE_SHA,'ORIGINAL_AGENT_RESPONSE_CHANGED');
  const execution=await client.execution({offerId:paid.offerId,executionId:originalExecution.id});
  const order=await client.order({orderReference:ORDER});
  await action('stop-after-'+app.launch.instanceId,'stop',{});
  need((await client.view()).service.status==='STOPPED','ORIGINAL_AGENT_SERVICE_NOT_DRAINED');
  return{requestId:REQUEST,response:{bytes:bytes.length,sha256:sha(bytes)},execution:exactExecution(execution.execution),usage:usage(order.pass),service:'STOPPED'};
 });
 await phase('DURABLE_AGENT_EXPORTS_AND_SAME_ACTION_REPLAY',async()=>{
  const usageOperation=await action('export-usage','export_usage',{orderReference:ORDER});
  const resultOperation=await action('export-result','export_result',{offerId:paid.offerId,executionId:originalExecution.id});
  const before=await client.allInventory('operations');
  const saved=journal.actions['export-usage'];
  const same=await client.run(saved.kind,saved.body);
  const after=await client.allInventory('operations');
  need(same.status==='COMPLETED'&&same.id===saved.body.operationId&&same.requestSha256===saved.requestSha256&&
   same.result.export.id===usageOperation.result.export.id&&before.total===after.total,'ORIGINAL_AGENT_OPERATION_REPLAY_CHANGED');
  await rememberExport('usage',usageOperation.result.export.id);
  await rememberExport('execution',resultOperation.result.export.id);
  await rememberExport('backup',backup.exportId);
  return{usageOperation:usageOperation.id,resultOperation:resultOperation.id,replayedOperation:same.id,
   retainedOperations:after.total,exports:Object.fromEntries(Object.entries(journal.exports).map(([label,e])=>[label,{exportId:e.exportId,manifestSha256:e.manifestSha256,files:e.files.length}]))};
 });
 await phase('ORIGINAL_BACKUP_DOWNLOAD_CHECKPOINT',async()=>{
  const selected=journal.exports.backup,controller=new AbortController();
  if(!journal.downloadPause){
   try{
    await client.downloadExport({exportId:selected.exportId,directory:selected.directory,expectedManifestSha256:selected.manifestSha256,
     chunkSize:4096,signal:controller.signal,onProgress:async progress=>{
      if(!journal.downloadPause&&progress.file==='application-backup.zip'&&progress.bytes>=4096){
       journal.downloadPause={file:progress.file,bytes:progress.bytes,total:progress.total,at:now()};await save();
       controller.abort(Object.assign(new Error('ORIGINAL_AGENT_DOWNLOAD_PAUSED'),{code:'ORIGINAL_AGENT_DOWNLOAD_PAUSED'}));
      }
     }});
    need(journal.downloadPause,'ORIGINAL_AGENT_DOWNLOAD_PAUSE_MISSING');
   }catch(error){if(!journal.downloadPause)throw error;}
  }
  const checkpoint=await readJson(join(selected.directory,'download-state/checkpoint.json'));
  need(checkpoint.exportId===selected.exportId&&checkpoint.manifestSha256===selected.manifestSha256&&
   checkpoint.files?.['application-backup.zip']?.bytes===journal.downloadPause.bytes&&journal.downloadPause.bytes<journal.downloadPause.total,
   'ORIGINAL_AGENT_DOWNLOAD_CHECKPOINT_CHANGED');
  await closeHost();
  if(app){await app.close();app=null;}
  const launch=await readJson(join(CASE,'workspace/api-merchant-launch.json'));
  need(launch.state==='STOPPED'&&launch.workspaceId===WORKSPACE,'ORIGINAL_CONSOLE_NOT_DRAINED');
  return{exportId:selected.exportId,manifestSha256:selected.manifestSha256,bytes:journal.downloadPause.bytes,
   total:journal.downloadPause.total,console:'STOPPED',endpoint:journal.endpoint};
 });
 await phase('COMPLETE_NATIVE_FILES_AFTER_CONSOLE_SHUTDOWN',async()=>{
  if(app){await app.close();app=null;}
  await openHost();
  const completed=[];
  for(const label of ['backup','usage','execution']){
   const selected=journal.exports[label],result=await client.downloadExport({exportId:selected.exportId,directory:selected.directory,
    expectedManifestSha256:selected.manifestSha256,chunkSize:16384});
   need(result.state==='COMPLETE'&&result.exportId===selected.exportId&&result.manifestSha256===selected.manifestSha256&&
    result.workspaceId===WORKSPACE,'ORIGINAL_AGENT_DOWNLOAD_CHANGED');
   if(label==='backup')need(result.resumed&&result.resumedBytes>=journal.downloadPause.bytes,'ORIGINAL_AGENT_PREFIX_NOT_REUSED');
   for(const file of selected.files){
    const b=await readFile(join(selected.directory,file.name));need(b.length===file.bytes&&sha(b)===file.sha256,'ORIGINAL_AGENT_MEMBER_CHANGED');
   }
   completed.push({label,exportId:result.exportId,manifestSha256:result.manifestSha256,files:result.files,bytes:result.bytes,
    resumed:result.resumed,resumedBytes:result.resumedBytes});
  }
  const restored=await client.restoreBundle({receiving:'downloaded',expectedMetadataSha256:sha(await readFile(join(CASE,'received/backup.json')))});
  need(restored.replayed===true&&restored.backupId===backup.backupId&&restored.profileSha256===paid.profileSha256,
   'ORIGINAL_AGENT_RECEIVING_CHANGED');
  return{workspaceId:WORKSPACE,console:'STOPPED',downloads:completed,receiving:{backupId:restored.backupId,profileSha256:restored.profileSha256,replayed:restored.replayed}};
 });
 await phase('ORIGINAL_ATTACHMENT_REOPENED',async()=>{
  await openConsole();await openHost();
  const current=await client.view(),order=await client.order({orderReference:ORDER});
  need(current.workspaceId===WORKSPACE&&current.service.status==='STOPPED','ORIGINAL_AGENT_REOPEN_CHANGED');
  const operation=await client.operation({operationId:journal.actions['export-usage'].body.operationId});
  need(operation.status==='COMPLETED'&&operation.requestSha256===journal.actions['export-usage'].requestSha256,'ORIGINAL_AGENT_REOPEN_OPERATION_CHANGED');
  const execution=await client.execution({offerId:paid.offerId,executionId:originalExecution.id});
  const result={workspaceId:WORKSPACE,revision:current.revision,operationId:operation.id,usage:usage(order.pass),execution:exactExecution(execution.execution)};
  await closeHost();await app.close();app=null;
  return result;
 });
 await phase('COMPLETE_EXPORTS_REOPENED_OFFLINE',async()=>{
  await closeHost();if(app){await app.close();app=null;}
  const files=[];
  for(const [label,selected]of Object.entries(journal.exports)){
   const result=await reopenApiMerchantExportDownload({directory:selected.directory,workspace:ALIAS,workspaceId:WORKSPACE,
    expectedManifestSha256:selected.manifestSha256,endpoint:journal.endpoint});
   need(result.state==='REOPENED'&&result.exportId===selected.exportId,'ORIGINAL_AGENT_OFFLINE_REOPEN_CHANGED');
   files.push({label,exportId:result.exportId,files:result.files,bytes:result.bytes,manifestSha256:result.manifestSha256});
  }
  return{workspaceId:WORKSPACE,files};
 });
 need(sha(await readFile(join(CASE,'result.json')))===ORIGINAL_RESULT_SHA,'ORIGINAL_MERCHANT_RESULT_CHANGED');
 const selection=await readJson(join(SOURCE,'SOURCE-SELECTION.json'));
 need(selection.sourceCommit===COMMIT&&selection.files.length>=600,'ORIGINAL_AGENT_SOURCE_SELECTION_CHANGED');
 const result={schema:journal.schema,id:journal.id,status:'PASS',completedAt:now(),workspaceId:WORKSPACE,
  originalResultSha256:ORIGINAL_RESULT_SHA,sourceCommit:COMMIT,sourceSelection:{files:selection.files.length,sha256:sha(await readFile(join(SOURCE,'SOURCE-SELECTION.json')))},
  originalOrderReference:ORDER,originalRequestId:REQUEST,phases:journal.phases,exports:journal.exports,
  usage:{allowanceUnits:8,consumedUnits:2,reservedUnits:0,availableUnits:6},
  originalExecution:{id:originalExecution.id,attempts:1,bytes:279,sha256:RESPONSE_SHA},receivedDirectory:received};
 await writeBytes(join(ROOT,'result.json'),Buffer.from(JSON.stringify(result,null,2)+'\n'));
 journal.status='PASS';journal.completedAt=result.completedAt;journal.error=null;await save();
 process.stdout.write(JSON.stringify({status:'PASS',phases:journal.phases.length,workspaceId:WORKSPACE,tools:33,
  allowance:8,consumed:2,reserved:0,available:6,originalAttempts:1,resultSha256:RESPONSE_SHA})+'\n');
}catch(error){
 failure=error;journal.error={...errorView(error),operationId:error.operationId??null,at:now()};await save().catch(()=>{});
 if(error.code==='ENOENT')process.stderr.write(JSON.stringify({diagnostic:'ORIGINAL_NATIVE_PATH',
  syscall:typeof error.syscall==='string'?error.syscall:null,
  path:typeof error.path==='string'&&error.path.startsWith('/')?error.path:null})+'\n');
 process.stderr.write(JSON.stringify({status:'ATTENTION',...journal.error,completedPhases:journal.phases.map(p=>p.name)})+'\n');
}finally{
 const close=async()=>{await closeHost();if(app){await app.close();app=null;}if(!leaseRetired){
  leaseRetired=true;try{await lease.close();}catch(error){leaseRetirementError=error;throw error;}
 }};
 try{await close();}
 catch(error){
  journal.closeError={...errorView(error),at:now()};await save().catch(()=>{});
  process.stderr.write(JSON.stringify({status:'CLOSE_FAILED',...journal.closeError})+'\n');
  if(leaseRetirementError){
   // The original closeSync lease retires its descriptor once. A rejected raw
   // retirement remains a failed process outcome, not a later no-op success.
   failure??=leaseRetirementError;
  }else{
   const keeper=setInterval(()=>{},1000);let finished=false;
   const retry=async()=>{if(finished)return;try{await close();finished=true;clearInterval(keeper);}catch(error){
    if(leaseRetirementError){failure??=leaseRetirementError;finished=true;clearInterval(keeper);
     process.stderr.write(JSON.stringify({status:'LEASE_RETIREMENT_FAILED',...errorView(error)})+'\n');}
   }};
   process.on('SIGINT',retry);process.on('SIGTERM',retry);
   await new Promise(done=>{const check=setInterval(()=>{if(finished){clearInterval(check);done();}},1000);});
   process.off('SIGINT',retry);process.off('SIGTERM',retry);
  }
 }
 if(priorPass===undefined)delete process.env[PASS_ENV];else process.env[PASS_ENV]=priorPass;
}
if(failure)process.exitCode=1;
