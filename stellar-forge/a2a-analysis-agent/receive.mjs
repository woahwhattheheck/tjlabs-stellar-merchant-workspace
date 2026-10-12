#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {parseArgs} from 'node:util';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,lstat,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {AgentCard,SendMessageRequest,Task,TaskState} from '@a2a-js/sdk';
import {ClientFactory,JsonRpcTransportFactory} from '@a2a-js/sdk/client';
import {SCHEMA,PLAN_SCHEMA,HASH,need,object,canonical,digest,sha,parametersText,
  privateDirectory,readPrivateJSON,saveNew,safeError} from './config.mjs';

const COMPLETED=TaskState.TASK_STATE_COMPLETED;
const TERMINAL=new Set([COMPLETED,TaskState.TASK_STATE_CANCELED,TaskState.TASK_STATE_FAILED,TaskState.TASK_STATE_REJECTED]);
const FILE=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,239}$/;
const REQUEST_SCHEMA='stellar-forge.a2a-analysis-receiver.v1';

export function selectedURL(raw){
  let url;try{url=new URL(raw);}catch{need(false,'A2A_ANALYSIS_RECEIVER_URL_INVALID');}
  need(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/a2a'&&
    (url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)),
    'A2A_ANALYSIS_RECEIVER_URL_INVALID');
  return url;
}
async function retain(path,bytes){
  try{await saveNew(path,bytes);}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const info=await lstat(path);
    need(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&(info.mode&0o077)===0&&
      info.size===bytes.length&&(process.getuid===undefined||info.uid===process.getuid()),
      'A2A_ANALYSIS_RECEIVED_FILE_CHANGED');
    const prior=await readFile(path);need(prior.equals(bytes),'A2A_ANALYSIS_RECEIVED_FILE_CHANGED');
  }
}
async function limitedJSON(response,maximum){
  need(response.ok,'A2A_ANALYSIS_AGENT_HTTP_'+response.status);
  const announced=response.headers.get('content-length');
  if(announced!==null)need(/^\d+$/.test(announced)&&Number(announced)<=maximum,'A2A_ANALYSIS_AGENT_CARD_TOO_LARGE');
  const reader=response.body?.getReader();need(reader,'A2A_ANALYSIS_AGENT_CARD_EMPTY');
  let count=0;const chunks=[];
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;
      count+=value.length;need(count<=maximum,'A2A_ANALYSIS_AGENT_CARD_TOO_LARGE');chunks.push(value);}
  }catch(error){await reader.cancel();throw error;}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function connectAnalysis({url:rawURL,token,signal,fetchImpl=fetch,card:retainedCard}){
  const endpoint=selectedURL(rawURL);
  need(typeof token==='string'&&token.length>=32&&token.length<=1024&&!/\s/.test(token),
    'A2A_ANALYSIS_RECEIVER_TOKEN_REQUIRED');
  const cardURL=new URL('/.well-known/agent-card.json',endpoint);
  const raw=retainedCard??await limitedJSON(await fetchImpl(cardURL,{
    headers:{Accept:'application/json'},redirect:'error',signal}),1024*1024);
  const normalized=AgentCard.toJSON(AgentCard.fromJSON(raw)),card=AgentCard.fromJSON(normalized);
  const selected=card.supportedInterfaces.find(v=>v.url===endpoint.href&&v.protocolBinding==='JSONRPC'&&v.protocolVersion==='1.0');
  need(selected&&card.capabilities?.streaming===true,'A2A_ANALYSIS_AGENT_INTERFACE_CHANGED');
  // Only the selected exact endpoint can receive the credential. The public card
  // never receives it, and redirects cannot carry it to another destination.
  const authenticatedFetch=(input,init={})=>{
    const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    need(target.href===endpoint.href,'A2A_ANALYSIS_RECEIVER_ENDPOINT_CHANGED');
    const headers=new Headers(init.headers??(input instanceof Request?input.headers:undefined));
    headers.set('Authorization','Bearer '+token);
    return fetchImpl(input,{...init,headers,redirect:'error'});
  };
  const factory=new ClientFactory({
    transports:[new JsonRpcTransportFactory({fetchImpl:authenticatedFetch})],
    preferredTransports:['JSONRPC'],clientConfig:{polling:true}
  });
  const client=await factory.createFromAgentCard({...card,supportedInterfaces:[selected]});
  return {client,card:normalized,endpoint:endpoint.href};
}
export function analyticalMessage(action,{procedureId,parameters,messageId=randomUUID(),taskId,contextId,tenant=''}={}){
  need(['catalog','run','resume'].includes(action),'A2A_ANALYSIS_ACTION_UNKNOWN');
  const value={action};
  if(action==='run'){
    need(typeof procedureId==='string'&&procedureId.length>0,'A2A_ANALYSIS_PROCEDURE_REQUIRED');
    value.procedureId=procedureId;if(parameters!==undefined)value.parametersText=parametersText(parameters);
  }
  need(typeof messageId==='string'&&messageId.length>0&&messageId.length<=200,'A2A_ANALYSIS_MESSAGE_ID_REQUIRED');
  return SendMessageRequest.toJSON(SendMessageRequest.fromJSON({
    tenant,message:{messageId,role:'ROLE_USER',parts:[{data:value,mediaType:'application/json'}],
      ...(taskId?{taskId}:{}),...(contextId?{contextId}:{})},
    configuration:{returnImmediately:true}
  }));
}
export async function prepareReceiver(directory,{url,card,request}){
  await privateDirectory(directory,{create:true});
  const selected={schema:REQUEST_SCHEMA,url:selectedURL(url).href,card,
    request:SendMessageRequest.toJSON(SendMessageRequest.fromJSON(request))};
  await retain(join(directory,'request.json'),Buffer.from(JSON.stringify(selected,null,2)+'\n'));
  return selected;
}
export async function retainTask(directory,task){
  need(task&&typeof task.id==='string'&&task.status&&Array.isArray(task.artifacts),'A2A_ANALYSIS_TASK_REQUIRED');
  await privateDirectory(directory,{create:true});
  const records=await privateDirectory(join(directory,'tasks'),{create:true});
  const bytes=Buffer.from(JSON.stringify(Task.toJSON(task),null,2)+'\n'),hash=sha(bytes);
  await retain(join(records,hash+'.json'),bytes);
  return {taskId:task.id,contextId:task.contextId,sha256:hash,bytes:bytes.length,
    state:TaskState[task.status.state],path:join(records,hash+'.json')};
}
export async function receiveCompletedTask(directory,task){
  need(task.status?.state===COMPLETED,'A2A_ANALYSIS_COMPLETE_TASK_REQUIRED');
  const record=await retainTask(directory,task);
  const root=await privateDirectory(join(directory,'results'),{create:true});
  const resultDirectory=await privateDirectory(join(root,record.sha256),{create:true});
  const files=[],names=new Set(),ids=new Set();let total=0;
  for(const artifact of task.artifacts){
    need(artifact.parts?.length===1&&artifact.parts[0].content?.$case==='raw'&&
      typeof artifact.artifactId==='string'&&!ids.has(artifact.artifactId),'A2A_ANALYSIS_COMPLETE_RAW_ARTIFACT_REQUIRED');
    const part=artifact.parts[0],filename=part.filename||artifact.name;
    need(FILE.test(filename)&&filename!=='.'&&filename!=='..'&&!names.has(filename),
      'A2A_ANALYSIS_ARTIFACT_FILENAME_INVALID');
    const data=Buffer.from(part.content.value);
    need(HASH.test(artifact.metadata?.sha256??'')&&Number.isSafeInteger(artifact.metadata.bytes)&&
      data.length===artifact.metadata.bytes&&sha(data)===artifact.metadata.sha256,'A2A_ANALYSIS_ARTIFACT_CHANGED');
    names.add(filename);ids.add(artifact.artifactId);total+=data.length;
    files.push({filename,artifactId:artifact.artifactId,bytes:data.length,sha256:sha(data),
      mediaType:part.mediaType,data});
  }
  need(files.length>0,'A2A_ANALYSIS_RESULT_FILES_REQUIRED');
  const analysis=files.find(f=>f.filename==='analysis-record.json');
  if(analysis){
    const original=JSON.parse(analysis.data.toString('utf8'));
    need(original.schema===PLAN_SCHEMA&&original.taskId===task.id&&original.contextId===task.contextId&&
      original.procedureSha256===digest(original.procedure)&&Array.isArray(original.result?.outputs),
      'A2A_ANALYSIS_RESULT_RECORD_CHANGED');
    need(original.result.outputs.length+1===files.length,'A2A_ANALYSIS_RESULT_SET_CHANGED');
    const selected=new Set();
    for(const expected of original.result.outputs){
      const found=files.find(f=>f.filename===expected.filename);
      need(found&&!selected.has(found.filename)&&found.artifactId===expected.artifactId&&
        found.bytes===expected.bytes&&found.sha256===expected.sha256&&found.mediaType===expected.mediaType,
        'A2A_ANALYSIS_RESULT_SET_CHANGED');selected.add(found.filename);
    }
  }else need(files.length===1&&files[0].filename==='catalog.json','A2A_ANALYSIS_RESULT_RECORD_REQUIRED');
  // Validate the complete set before making any delivered file visible.
  for(const file of files)await retain(join(resultDirectory,file.filename),file.data);
  const manifest={schema:REQUEST_SCHEMA,task:record,files:files.map(({data,...f})=>f),totalBytes:total};
  await retain(join(resultDirectory,'received.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
  return {...manifest,directory:resultDirectory};
}
export async function waitForTask({client,task,directory,signal,pollMs=500,onTask,tenant=''}){
  need(Number.isSafeInteger(pollMs)&&pollMs>=50,'A2A_ANALYSIS_POLL_INVALID');
  for(;;){
    if(directory)await retainTask(directory,task);if(onTask)await onTask(task);
    if(TERMINAL.has(task.status.state)||task.status.state===TaskState.TASK_STATE_INPUT_REQUIRED||
      task.status.state===TaskState.TASK_STATE_AUTH_REQUIRED)return task;
    await delay(pollMs,undefined,{signal});
    task=await client.getTask({id:task.id,tenant},{signal});
  }
}
const HELP=`Receive original analytical files through the standard A2A SDK

  sf-a2a-receive catalog --url https://agent.example/a2a --directory /private/catalog
  sf-a2a-receive run --url https://agent.example/a2a --procedure query_monthly \
    --directory /private/monthly --parameters-file /private/parameters.json
  sf-a2a-receive submit --directory /private/monthly
  sf-a2a-receive get --directory /private/monthly --task TASK_ID
  sf-a2a-receive resume --directory /private/monthly --task TASK_ID
  sf-a2a-receive cancel --directory /private/monthly --task TASK_ID

A2A_ANALYSIS_TOKEN supplies the token; --token-env selects another environment variable.
run and catalog retain the original Agent Card, request and message ID before sending.
submit reuses those same bytes. get, resume and cancel address the original task ID.
--no-wait returns after the first committed task. Reopen it with get.
Complete files and their original task are retained beneath the selected private directory.
`;
export async function main(args=process.argv.slice(2)){
  const {values:v,positionals}=parseArgs({args,allowPositionals:true,strict:true,options:{
    help:{type:'boolean',short:'h'},url:{type:'string'},directory:{type:'string'},procedure:{type:'string'},
    'parameters-file':{type:'string'},'message-id':{type:'string'},'token-env':{type:'string'},
    task:{type:'string'},'no-wait':{type:'boolean'}
  }});
  const action=positionals[0];
  if(v.help||!action){process.stdout.write(HELP);return;}
  need(positionals.length===1&&v.directory&&['catalog','run','submit','get','resume','cancel'].includes(action),
    'A2A_ANALYSIS_RECEIVER_COMMAND_INVALID');
  const directory=resolve(v.directory),token=process.env[v['token-env']??'A2A_ANALYSIS_TOKEN'];
  const abort=new AbortController();const stop=()=>abort.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    let retained,connection,task;
    if(['catalog','run'].includes(action)){
      need(v.url,'A2A_ANALYSIS_RECEIVER_URL_REQUIRED');
      await privateDirectory(directory,{create:true});
      let prior;try{prior=await readPrivateJSON(join(directory,'request.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
      const parameters=v['parameters-file']===undefined?undefined:await readFile(resolve(v['parameters-file']),'utf8');
      const messageId=v['message-id']??prior?.request?.message?.messageId??randomUUID();
      connection=await connectAnalysis({url:v.url,token,signal:abort.signal,card:prior?.card});
      retained=await prepareReceiver(directory,{url:connection.endpoint,card:connection.card,
        request:analyticalMessage(action,{procedureId:v.procedure,parameters,messageId})});
    }else{
      retained=await readPrivateJSON(join(directory,'request.json'));
      need(retained.schema===REQUEST_SCHEMA,'A2A_ANALYSIS_RECEIVER_RECORD_INVALID');
      connection=await connectAnalysis({url:retained.url,card:retained.card,token,signal:abort.signal});
    }
    if(['catalog','run','submit'].includes(action))
      task=await connection.client.sendMessage(SendMessageRequest.fromJSON(retained.request),{signal:abort.signal});
    else{
      need(v.task,'A2A_ANALYSIS_ORIGINAL_TASK_ID_REQUIRED');
      task=await connection.client.getTask({id:v.task,tenant:''},{signal:abort.signal});
      if(action==='cancel')task=await connection.client.cancelTask({id:task.id,tenant:''},{signal:abort.signal});
      if(action==='resume'){
        const request=analyticalMessage('resume',{taskId:task.id,contextId:task.contextId,
          messageId:v['message-id']??randomUUID()});
        const sends=await privateDirectory(join(directory,'continuations'),{create:true});
        await retain(join(sends,digest(request)+'.json'),Buffer.from(JSON.stringify(request,null,2)+'\n'));
        task=await connection.client.sendMessage(SendMessageRequest.fromJSON(request),{signal:abort.signal});
      }
    }
    const first=await retainTask(directory,task);
    process.stdout.write(JSON.stringify({event:'original_task',...first})+'\n');
    if(!v['no-wait'])task=await waitForTask({client:connection.client,task,directory,signal:abort.signal});
    const result=task.status.state===COMPLETED?await receiveCompletedTask(directory,task):await retainTask(directory,task);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if([TaskState.TASK_STATE_FAILED,TaskState.TASK_STATE_REJECTED].includes(task.status.state))process.exitCode=1;
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{process.stderr.write(safeError(error)+'\n');process.exitCode=1;});
