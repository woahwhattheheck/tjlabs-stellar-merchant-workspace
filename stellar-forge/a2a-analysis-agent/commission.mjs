// SPDX-License-Identifier: MIT
// One whole native receiving programme: original source -> AnalysisWorkspace ->
// official A2A tasks -> complete customer files -> same-task restart and receiving.
import {parseArgs} from 'node:util';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {open,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {SendMessageRequest,TaskState} from '@a2a-js/sdk';
import {receiveHamburg,HAMBURG_OPERATION} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/receive-hamburg.mjs';
import {captureConfiguration} from './native.mjs';
import {initializeDatabase,checkConfiguration,openAnalysisServer} from './service.mjs';
import {connectAnalysis,analyticalMessage,prepareReceiver,retainTask,receiveCompletedTask,waitForTask} from './receive.mjs';
import {need,canonical,digest,sha,privateDirectory,readPrivateJSON,saveNew,validateConfig,safeError} from './config.mjs';

export const OPERATION='SCF-A2A-NATIVE-ANALYSIS-0C7A-20261012';
export const RECORDING={bytes:2965230,sha256:'34fb0322092a51525e94beda0d6c3b21548b7261d65d80909b27eb6fa6a2d466'};
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..');
const terminal=task=>[TaskState.TASK_STATE_COMPLETED,TaskState.TASK_STATE_CANCELED,
  TaskState.TASK_STATE_FAILED,TaskState.TASK_STATE_REJECTED].includes(task.status.state);
async function retained(path,value){
  const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
  try{await saveNew(path,bytes);}catch(error){
    if(error.code!=='EEXIST')throw error;
    need((await readFile(path)).equals(bytes),'COMMISSION_ORIGINAL_RECORD_CHANGED');
  }
}
async function packageFromRecording(directory,recordingFile,onProgress){
  const selected={directory:join(directory,'hamburg'),recordingFile,
    expectedBytes:RECORDING.bytes,expectedSha256:RECORDING.sha256,resume:true,onProgress};
  await privateDirectory(selected.directory,{create:true});
  const received=await receiveHamburg(selected);
  need(received.windows.length===2,'COMMISSION_ORIGINAL_HAMBURG_WINDOWS_REQUIRED');
  const review={schema:'stellar-forge.sensorthings-hamburg-review.v1',
    operationId:HAMBURG_OPERATION,actor:'SCF original analytical commissioning',
    editions:received.windows.map(w=>({window:w.window,editionId:w.editionId,decision:'accept',
      note:'Use the complete original retained source edition with its published attribution, original times and value-state semantics.',
      acknowledgeIssues:['PROVIDER_SNAPSHOT_NOT_ESTABLISHED','CONNECTOR_HTTP_METADATA_UNOBSERVED']}))};
  const reviewFile=join(directory,'hamburg-review.json');await retained(reviewFile,review);
  const complete=await receiveHamburg({...selected,reviewFile});
  need(complete.state==='NATIVE_SOURCE_REVIEW_DATASET_EXPORT_COMPLETE'&&complete.delivery.length===2&&
    complete.delivery.every(v=>v.dataset.rows===660),'COMMISSION_COMPLETE_NATIVE_SOURCE_REQUIRED');
  await retained(join(directory,'hamburg-receiving.json'),complete);
  return {packageDirectory:join(selected.directory,complete.delivery[0].dataset.relativeDirectory,'package'),
    source:{recording:RECORDING,workspaceId:complete.workspaceId,
      editions:complete.delivery.map(v=>({window:v.window,editionId:v.editionId,dataset:v.dataset}))}};
}
async function originalWorkspace({directory,packageDirectory,sourceRoot,python,onProgress}){
  const database=await privateDirectory(join(directory,'analysis'),{create:true});
  const logs=await privateDirectory(join(directory,'logs'),{create:true});
  const invocation=randomUUID(),ready=join(logs,invocation+'-ready.json');
  const output=await open(join(logs,invocation+'-python.log'),'wx',0o600);
  const search=join(sourceRoot,'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python');
  const child=spawn(python,[join(here,'commission-workspace.py'),'--dataset-package',packageDirectory,
    '--database',database,'--checkout',sourceRoot,'--node',process.execPath,'--ready',ready],
    {env:{...process.env,PYTHONPATH:search+(process.env.PYTHONPATH?':'+process.env.PYTHONPATH:''),
      PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore',output.fd,output.fd],shell:false});
  const exited=new Promise((resolve,reject)=>{
    child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));
  });
  const start=Date.now();let receipt;
  try{
    for(;;){
      try{receipt=await readPrivateJSON(ready);break;}catch(error){if(error.code!=='ENOENT')throw error;}
      need(child.exitCode===null&&child.signalCode===null,'COMMISSION_ORIGINAL_PYTHON_EXITED');
      need(Date.now()-start<180000,'COMMISSION_ORIGINAL_PYTHON_START_TIMEOUT');
      await delay(100);
    }
    need(receipt.status==='ORIGINAL_WORKSPACE_LISTENING'&&receipt.rows===660,'COMMISSION_ORIGINAL_ANALYSIS_REQUIRED');
    onProgress({stage:'original_analysis_ready',workspaceId:receipt.workspaceId,rows:receipt.rows});
    return {database,receipt,async close(){
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
      const result=await exited;await output.close();
      need(result.code===0,'COMMISSION_ORIGINAL_PYTHON_CLOSE_FAILED');return result;
    }};
  }catch(error){
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    await exited.catch(()=>{});await output.close();throw error;
  }
}
async function until(client,id,predicate,{milliseconds=30000}={}){
  const start=Date.now();
  for(;;){
    const task=await client.getTask({id,tenant:''});
    if(predicate(task)||terminal(task))return task;
    need(Date.now()-start<milliseconds,'COMMISSION_TASK_TRANSITION_TIMEOUT');
    await delay(10);
  }
}
function artifactBytes(task,filename){
  const artifact=task.artifacts.find(a=>a.parts?.[0]?.filename===filename);
  need(artifact?.parts?.length===1&&artifact.parts[0].content?.$case==='raw','COMMISSION_ORIGINAL_FILE_REQUIRED');
  return Buffer.from(artifact.parts[0].content.value);
}
export async function commission({directory,recordingFile,datasetPackage,sourceRoot=root,python='python3',
  merchantModule,onProgress=value=>process.stdout.write(JSON.stringify(value)+'\n')}){
  directory=resolve(directory);sourceRoot=resolve(sourceRoot);
  await privateDirectory(directory,{create:true});
  try{
    const prior=await readPrivateJSON(join(directory,'commission-result.json'),64*1024*1024);
    need(prior.operationId===OPERATION&&prior.status==='ORIGINAL_SOURCE_A2A_RECEIVING_COMPLETE','COMMISSION_ORIGINAL_RESULT_CHANGED');
    return {...prior,output:join(directory,'commission-result.json')};
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const startedAt=new Date().toISOString(),credentialPath=join(directory,'commission-credentials.json');
  let credentials;
  try{credentials=await readPrivateJSON(credentialPath);}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    credentials={schema:'stellar-forge.a2a-analysis-commission-credentials.v1',
      token:randomBytes(32).toString('base64url'),otherToken:randomBytes(32).toString('base64url')};
    await saveNew(credentialPath,credentials);
  }
  need(credentials.schema==='stellar-forge.a2a-analysis-commission-credentials.v1'&&
    [credentials.token,credentials.otherToken].every(v=>typeof v==='string'&&v.length>=32&&!/\s/.test(v))&&
    credentials.token!==credentials.otherToken,'COMMISSION_ORIGINAL_CREDENTIALS_CHANGED');
  const {token,otherToken}=credentials;
  const environment={...process.env,A2A_ANALYSIS_TOKEN:token,A2A_ANALYSIS_SECOND_TOKEN:otherToken};
  let native,service,config,connection;
  const result={schema:'stellar-forge.a2a-analysis-commission.v1',operationId:OPERATION,
    startedAt,sdk:{package:'@a2a-js/sdk',version:'1.3.0',commit:'29417a5bb4038f804f310ce4fffd267a9375aa90'},stages:[]};
  const stage=value=>{result.stages.push(value);onProgress(value);};
  try{
    let selected;
    if(datasetPackage)selected={packageDirectory:resolve(datasetPackage),source:{datasetPackage:resolve(datasetPackage)}};
    else{
      need(recordingFile,'COMMISSION_RECORDING_OR_DATASET_REQUIRED');
      selected=await packageFromRecording(directory,resolve(recordingFile),onProgress);
    }
    result.source=selected.source;
    native=await originalWorkspace({directory,packageDirectory:selected.packageDirectory,sourceRoot,python,onProgress});
    result.originalAnalysis=native.receipt;
    const agentDirectory=await privateDirectory(join(directory,'agent'),{create:true});
    const configuration=join(agentDirectory,'configuration.json');
    try{config=validateConfig(await readPrivateJSON(configuration));}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      config=validateConfig(await captureConfiguration({directory:agentDirectory,database:native.database,
        queries:[{name:'observations_complete',revision:1},{name:'parameter_exact',revision:1}],
        reports:[{name:'retained_observations',revision:1}],
        publicUrl:'http://127.0.0.1:0/a2a',port:0,name:'SCF retained-source analytical agent',
        description:'Original Hamburg source-edition analyses and complete customer exports.',allowParameters:true}));
      config.principals.push({name:'second_operator',tokenEnv:'A2A_ANALYSIS_SECOND_TOKEN',procedures:['*']});
    }
    need(config.workspaces[0].workspaceId===native.receipt.workspaceId,'COMMISSION_ORIGINAL_WORKSPACE_CHANGED');
    await initializeDatabase(config);await checkConfiguration(config);
    service=await openAnalysisServer(config,{environment});
    config={...service.config,listen:{...service.config.listen,port:service.address.port}};
    await retained(configuration,config);
    connection=await connectAnalysis({url:config.publicUrl,token});
    const publicUrl=config.publicUrl;result.agentUrl=publicUrl;
    const receiverRoot=await privateDirectory(join(directory,'receiving'),{create:true});
    const requestFor=(name,action,options={})=>analyticalMessage(action,{
      messageId:OPERATION+':'+name,...options});
    async function send(name,action,options={}){
      const destination=await privateDirectory(join(receiverRoot,name),{create:true});
      const request=requestFor(name,action,options);
      await prepareReceiver(destination,{url:publicUrl,card:connection.card,request});
      const task=await connection.client.sendMessage(SendMessageRequest.fromJSON(request));
      await retainTask(destination,task);return {request,task,destination};
    }
    async function complete(pending){
      const task=await waitForTask({client:connection.client,task:pending.task,directory:pending.destination});
      need(task.status.state===TaskState.TASK_STATE_COMPLETED,'COMMISSION_ORIGINAL_TASK_'+TaskState[task.status.state]);
      const received=await receiveCompletedTask(pending.destination,task);return {task,received};
    }

    const catalog=await complete(await send('catalog','catalog'));
    const listed=JSON.parse(artifactBytes(catalog.task,'catalog.json'));
    need(listed.procedures.length===3,'COMMISSION_ORIGINAL_CATALOGUE_CHANGED');
    stage({stage:'caller_catalogue',taskId:catalog.task.id,procedures:listed.procedures.map(p=>p.id)});

    // Two real tasks share the original single-job workspace. Its native busy
    // response and the service's same-ID continuation govern this concurrency.
    const [queryPending,parameterPending]=await Promise.all([
      send('complete_rows','run',{procedureId:'query_observations_complete'}),
      send('exact_parameter','run',{procedureId:'query_parameter_exact',
        parameters:'{"amount":9223372036854775806}'})
    ]);
    const replay=await connection.client.sendMessage(SendMessageRequest.fromJSON(queryPending.request));
    need(replay.id===queryPending.task.id,'COMMISSION_INITIAL_MESSAGE_DUPLICATED');
    const [query,parameter]=await Promise.all([complete(queryPending),complete(parameterPending)]);
    const manifest=JSON.parse(artifactBytes(query.task,'manifest.json'));
    need(manifest.queryComplete===true&&manifest.rowCount===660,'COMMISSION_FULL_ORIGINAL_EXPORT_REQUIRED');
    need(artifactBytes(parameter.task,'rows.csv').toString('utf8').includes('9223372036854775806'),
      'COMMISSION_ORIGINAL_INTEGER_CHANGED');
    stage({stage:'complete_native_query_and_parameter',taskId:query.task.id,parameterTaskId:parameter.task.id,
      sameInitialMessageTaskId:replay.id,rows:manifest.rowCount,queryComplete:manifest.queryComplete,
      files:query.received.files,parameterFiles:parameter.received.files});

    const report=await complete(await send('report','run',{procedureId:'report_retained_observations'}));
    need(report.received.files.some(f=>f.mediaType==='application/zip')&&
      report.received.files.some(f=>f.mediaType.startsWith('text/html')),'COMMISSION_ORIGINAL_REPORT_EXPORTS_REQUIRED');
    const reportRecord=JSON.parse(artifactBytes(report.task,'analysis-record.json'));
    stage({stage:'complete_native_report',taskId:report.task.id,
      publicationId:reportRecord.result.publication.id,files:report.received.files});

    const second=await connectAnalysis({url:publicUrl,token:otherToken,card:connection.card});
    let denied=false;
    try{await second.client.getTask({id:query.task.id,tenant:''});}catch{denied=true;}
    need(denied,'COMMISSION_CALLER_TASK_ISOLATION_FAILED');
    stage({stage:'original_sdk_caller_isolation',taskId:query.task.id});

    if(merchantModule){
      const merchant=await import(pathToFileURL(resolve(merchantModule)));
      need(typeof merchant.commissionA2AMerchant==='function','COMMISSION_ORIGINAL_MERCHANT_ENTRY_REQUIRED');
      result.merchant=await merchant.commissionA2AMerchant({directory:join(directory,'merchant'),
        agentUrl:publicUrl,token,procedureId:'query_observations_complete',sourceRoot,onProgress});
      stage({stage:'complete_native_merchant_receiving',result:result.merchant});
    }

    const restart=await send('restart_same_task','run',{procedureId:'query_observations_complete'});
    const before=await until(connection.client,restart.task.id,t=>!!t.metadata?.analysis?.plan?.calls?.query);
    const plan=structuredClone(before.metadata?.analysis?.plan);
    need(plan,'COMMISSION_ORIGINAL_PLAN_REQUIRED');
    await service.close();service=undefined;
    service=await openAnalysisServer(config,{environment});
    need(service.config.publicUrl===publicUrl,'COMMISSION_REOPENED_ORIGIN_CHANGED');
    connection=await connectAnalysis({url:publicUrl,token,card:connection.card});
    let resumed=await connection.client.getTask({id:before.id,tenant:''});
    const stateOnReopen=TaskState[resumed.status.state];
    if(!terminal(resumed)){
      const request=requestFor('resume_original_task','resume',{taskId:resumed.id,contextId:resumed.contextId});
      await retained(join(restart.destination,'resume.json'),request);
      resumed=await connection.client.sendMessage(SendMessageRequest.fromJSON(request));
    }
    const reopened=await complete({...restart,task:resumed});
    need(canonical(reopened.task.metadata.analysis.plan.ids)===canonical(plan.ids),'COMMISSION_ORIGINAL_JOB_IDS_CHANGED');
    const duplicateAfterRestart=await connection.client.sendMessage(SendMessageRequest.fromJSON(restart.request));
    need(duplicateAfterRestart.id===reopened.task.id,'COMMISSION_REOPENED_MESSAGE_DUPLICATED');
    stage({stage:'same_task_server_reopen',taskId:reopened.task.id,stateOnReopen,
      originalJobIds:plan.ids,files:reopened.received.files});

    const cancel=await send('cancel_after_reopen','run',{procedureId:'query_observations_complete'});
    const selectedTask=await until(connection.client,cancel.task.id,t=>!!t.metadata?.analysis?.plan?.calls?.queryExport);
    need(!terminal(selectedTask)||selectedTask.status.state===TaskState.TASK_STATE_CANCELED,
      'COMMISSION_CANCELLATION_TASK_ALREADY_FINISHED');
    const selectedExport=selectedTask.metadata.analysis.plan.ids.export;
    if(selectedTask.status.state!==TaskState.TASK_STATE_CANCELED){
      await service.close();service=undefined;
      service=await openAnalysisServer(config,{environment});
      connection=await connectAnalysis({url:publicUrl,token,card:connection.card});
    }
    const cancelled=await connection.client.cancelTask({id:cancel.task.id,tenant:''});
    need(cancelled.status.state===TaskState.TASK_STATE_CANCELED&&cancelled.metadata.analysis.cancelRequested===true&&
      cancelled.metadata.analysis.plan.ids.export===selectedExport,'COMMISSION_REOPENED_CANCELLATION_CHANGED');
    const reconciled=await connection.client.cancelTask({id:cancelled.id,tenant:''});
    need(reconciled.id===cancelled.id&&reconciled.status.state===TaskState.TASK_STATE_CANCELED,
      'COMMISSION_SAME_CANCELLED_TASK_REQUIRED');
    await retainTask(cancel.destination,reconciled);
    stage({stage:'original_export_cancellation_after_reopen',taskId:reconciled.id,
      originalExportId:selectedExport,originalCancellation:reconciled.metadata.analysis.originalCancellation});

    result.status='ORIGINAL_SOURCE_A2A_RECEIVING_CLOSING';
    await saveNew(join(directory,'commission-candidate-'+digest(result)+'.json'),result);
    await service.close();service=undefined;
    await native.close();native=undefined;
    result.completedAt=new Date().toISOString();
    result.status='ORIGINAL_SOURCE_A2A_RECEIVING_COMPLETE';
    const output=join(directory,'commission-result.json');await saveNew(output,result);
    onProgress({stage:'complete',status:result.status,output,stages:result.stages.length});
    return {...result,output};
  }finally{
    if(service)await service.close();
    if(native)await native.close();
  }
}
export async function main(args=process.argv.slice(2)){
  const {values:v}=parseArgs({args,strict:true,options:{
    directory:{type:'string'},recording:{type:'string'},'dataset-package':{type:'string'},
    checkout:{type:'string'},python:{type:'string'},'merchant-module':{type:'string'},help:{type:'boolean'}
  }});
  if(v.help||!v.directory){
    process.stdout.write('node commission.mjs --directory /private/commission --recording /private/native-recording.json [--checkout /source] [--python python3] [--merchant-module /source/original-merchant-receiving.mjs]\nAlternatively select an already accepted complete original package with --dataset-package.\n');
    return;
  }
  const result=await commission({directory:v.directory,recordingFile:v.recording,datasetPackage:v['dataset-package'],
    sourceRoot:v.checkout??root,python:v.python??'python3',merchantModule:v['merchant-module']});
  process.stdout.write(JSON.stringify({status:result.status,output:result.output})+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{process.stderr.write(JSON.stringify({error:safeError(error),message:error.message})+'\n');process.exitCode=1;});
