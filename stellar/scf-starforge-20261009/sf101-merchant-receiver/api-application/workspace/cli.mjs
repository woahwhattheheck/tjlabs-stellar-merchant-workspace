#!/usr/bin/env node
// MIT. Installed merchant console, shared native commands and complete file receiving.
import {constants} from 'node:fs';
import {open,link,unlink} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {writeBytes,syncDirectory} from '../../../sf88-operator-buyer-cli/node/store.mjs';
import {readConfiguration,readSelectedSource,SCHEMA,STATE_SCHEMA,MAX_STATE,HASH,UUID,absolute,
 ownedDirectory,ownedBytes,encoded,parse,canonical,digest,need,integer,newId,now,safeError} from './configuration.mjs';
import {openMerchantWorkspace} from './model.mjs';
import {startMerchantWorkspaceServer} from './server.mjs';
import {restoreMerchantSnapshot} from './backup.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
export const LAUNCH_SCHEMA='stellar-forge.sf101.api-merchant-launch.v1';
export const SELECTION_SCHEMA='stellar-forge.sf101.api-merchant-launch-selection.v1';
export const LAUNCH_NAME='api-merchant-launch.json';
export const SOURCE_FILES=Object.freeze([
 'configuration.mjs','model.mjs','operations.mjs','native.mjs','native.py','exports.mjs','backup.mjs',
 'server.mjs','cli.mjs','application.mjs','browser-assets.json','public/index.html','public/style.css','public/app.mjs',
 '../configuration.mjs','../recovery.mjs','../worker.mjs',
]);
const MAX_JSON=32*1024*1024;
const HELP=[
 'API merchant workspace',
 '',
 'starforge api-merchant-workspace configure --merchant ABS --checkout ABS',
 '  --gateway-base-url ORIGIN --directory ABS --out ABS',
 '  [--actor NAME --python EXECUTABLE --backup ABS_JSON --links ABS_JSON]',
 'starforge api-merchant-workspace inspect-launch --config ABS [--port 0]',
 'starforge api-merchant-workspace serve --config ABS [--port 0]',
 '  [--expected-config-sha256 SHA --expected-workspace-sha256 SHA|new]',
 '  [--expected-source-sha256 SHA --expected-code-sha256 SHA]',
 'starforge api-merchant-workspace restore-bundle --bundle ABS --metadata ABS_JSON',
 '  --out ABS --pass-env NAME [--python EXECUTABLE --expected-metadata-sha256 SHA]',
 '',
 'The running console writes its private api-merchant-launch.json in its workspace.',
 'All commands below connect to that same process using --launch ABS.',
 '',
 'view                                      Current workspace and service',
 'preview --input ABS_JSON                  Compile an offer without publishing it',
 'act KIND --input ABS_JSON [--wait true]    Run the retained native action',
 'operation --id UUID                       Reopen its exact request and result',
 'resume --id UUID --request-sha256 SHA      Resume the same original operation',
 'cancel --id UUID --request-sha256 SHA      Cancel a queued operation',
 'offer --id UUID                           Read a retained offer and its files',
 'order --reference REF [--after CURSOR --limit 50]',
 'executions --offer-id UUID [--after CURSOR --limit 50]',
 'execution --offer-id UUID --id ORIGINAL_EXECUTION_ID',
 'export --id UUID                          List original downloadable members',
 'download --export UUID --file NAME --out ABS [--expected-sha256 SHA]',
 'new-id                                    Generate an operation UUID',
 '',
 'act/resume wait for the selected operation by default; --wait false returns',
 'its saved acceptance immediately. Use operation with its same ID after a lost',
 'response. Downloads stream to private disk and publish only complete bytes.',
 'Keep the startup URL, launch file, customer credentials and backups private.',
].join('\n');

function argumentsOf(argv){
 const command=argv.shift()??'help',values=new Map();
 if(['help','--help','-h'].includes(command))return {command:'help',values};
 let action;
 if(command==='act')action=argv.shift();
 while(argv.length){
  const option=argv.shift(),equal=option.indexOf('=');
  need(option.startsWith('--')&&option.length>2,'API_MERCHANT_OPTION_REQUIRED');
  const key=option.slice(2,equal<0?undefined:equal),value=equal<0?argv.shift():option.slice(equal+1);
  need(typeof value==='string'&&value.length>0&&!values.has(key),'API_MERCHANT_OPTION_VALUE_REQUIRED');
  values.set(key,value);
 }
 return {command,action,values};
}
const selected=(values,key,fallback)=>values.get(key)??fallback;
function only(values,names){need([...values.keys()].every(name=>names.includes(name)),'API_MERCHANT_UNKNOWN_OPTION');}
function portValue(value='0'){
 need(/^(0|[1-9][0-9]*)$/.test(String(value)),'API_MERCHANT_PORT_REQUIRED');
 return integer(Number(value),0,65535,'API_MERCHANT_PORT_REQUIRED');
}
function hashValue(value,code){
 need(value===undefined||HASH.test(value),code);return value;
}
function boolValue(value='true'){
 need(value==='true'||value==='false','API_MERCHANT_BOOLEAN_REQUIRED');return value==='true';
}
function output(value){process.stdout.write(JSON.stringify(value)+'\n');}
function report(error,extra={}){
 process.stderr.write(JSON.stringify({error:safeError(error).code,...extra})+'\n');
}
async function codeSelection(){
 const files=[];
 for(const relative of SOURCE_FILES){
  const path=resolve(HERE,relative),bytes=await ownedBytes(path,4*1024*1024,{privateMode:false});
  files.push({role:'source',relative,path,bytes:bytes.length,sha256:digest(bytes)});
 }
 return {sha256:digest(canonical(files.map(({relative,bytes,sha256})=>({relative,bytes,sha256})))),files};
}
async function optionalState(configuration){
 const path=join(configuration.directory,'workspace.json');
 try{
  const bytes=await ownedBytes(path,MAX_STATE),state=parse(bytes);
  need(state?.schema===STATE_SCHEMA&&UUID.test(state.id)&&state.configurationSha256===configuration.sha256&&
   Number.isSafeInteger(state.revision)&&state.revision>=1,'API_MERCHANT_WORKSPACE_CHANGED',409);
  return {path,sha256:digest(bytes),bytes:bytes.length,id:state.id,revision:state.revision};
 }catch(error){if(error.code!=='ENOENT')throw error;return {path,sha256:'new',bytes:0,id:null,revision:null};}
}
/** Read-only selection used by the installed Applications provider and the CLI. */
export async function inspectMerchantWorkspaceLaunch({configFile,port=0}={}){
 port=portValue(port);
 const configuration=await readConfiguration(absolute(configFile));
 const source=await readSelectedSource(configuration),workspace=await optionalState(configuration),code=await codeSelection();
 await readConfiguration(configuration.file,{expectedSha256:configuration.sha256});
 const configurationBytes=await ownedBytes(configuration.file);
 const merchantBytes=await ownedBytes(configuration.merchant,4*1024*1024,{privateMode:false});
 const checkoutBytes=await ownedBytes(configuration.checkout,131072,{privateMode:false});
 return {
  schema:SELECTION_SCHEMA,config:configuration.file,configSha256:configuration.sha256,directory:configuration.directory,
  actor:configuration.actor,python:configuration.python,workspace,sourceSha256:source.sha256,codeSha256:code.sha256,port,source:source.view,
  resourceKey:digest(canonical({kind:'api-merchant-workspace',directory:configuration.directory})),
  files:[
   ...code.files,
   {role:'configuration',path:configuration.file,bytes:configurationBytes.length,sha256:configuration.sha256},
   {role:'merchant',path:configuration.merchant,bytes:merchantBytes.length,sha256:digest(merchantBytes)},
   {role:'checkout',path:configuration.checkout,bytes:checkoutBytes.length,sha256:digest(checkoutBytes)},
   ...(workspace.id?[{role:'workspace',path:workspace.path,bytes:workspace.bytes,sha256:workspace.sha256}]:[]),
  ],
 };
}
async function publishLaunch(file,value){
 const bytes=encoded(value);await writeBytes(file,bytes);
 need((await ownedBytes(file,65536)).equals(bytes),'API_MERCHANT_LAUNCH_WRITE_CHANGED',503);
}
/**
 * One process owns HTTP, the operation queue, original gateway/worker and lease.
 * The terminal launch state is committed before that original lease is released.
 */
export async function serveConfiguredMerchantWorkspace({configFile,port=0,environment=process.env,
 expectedConfigSha256,expectedWorkspaceSha256,expectedSourceSha256,expectedCodeSha256}={}){
 port=portValue(port);
 hashValue(expectedConfigSha256,'API_MERCHANT_EXPECTED_CONFIGURATION_REQUIRED');
 hashValue(expectedSourceSha256,'API_MERCHANT_EXPECTED_SOURCE_REQUIRED');
 hashValue(expectedCodeSha256,'API_MERCHANT_EXPECTED_CODE_REQUIRED');
 need(expectedWorkspaceSha256===undefined||expectedWorkspaceSha256==='new'||HASH.test(expectedWorkspaceSha256),
  'API_MERCHANT_EXPECTED_WORKSPACE_REQUIRED');
 const configuration=await readConfiguration(absolute(configFile),{expectedSha256:expectedConfigSha256});
 const selectedSource=await readSelectedSource(configuration),code=await codeSelection();
 need(expectedSourceSha256===undefined||expectedSourceSha256===selectedSource.sha256,
  'API_MERCHANT_REVIEWED_SOURCE_CHANGED',409);
 need(expectedCodeSha256===undefined||expectedCodeSha256===code.sha256,'API_MERCHANT_REVIEWED_CODE_CHANGED',409);
 const launchFile=join(configuration.directory,LAUNCH_NAME);
 let model,server,launch,closingPromise,failedOpenClose,closed=false;
 const close=()=>{
  if(closed)return Promise.resolve();
  if(closingPromise)return closingPromise;
  closingPromise=(async()=>{
   if(launch){
    try{await publishLaunch(launchFile,{...launch,state:'STOPPING',stoppingAt:now()});}catch{}
   }
   if(server)await server.close();
   if(model)await model.close({beforeRelease:async()=>{
    if(launch)await publishLaunch(launchFile,{...launch,state:'STOPPED',stoppedAt:now()});
   }});
   else if(failedOpenClose)await failedOpenClose();
   closed=true;
  })().catch(async error=>{
   if(launch&&model&&!model.closed)
    await publishLaunch(launchFile,{...launch,state:'CLOSE_FAILED',failedAt:now(),error:safeError(error).code}).catch(()=>{});
   closingPromise=null;throw error;
  });
  return closingPromise;
 };
 try{
  model=await openMerchantWorkspace(configuration,{environment,expectedWorkspaceSha256});
  await readConfiguration(configuration.file,{expectedSha256:configuration.sha256});
  const actualSource=await readSelectedSource(configuration),actualCode=await codeSelection();
  need(actualSource.sha256===selectedSource.sha256,'API_MERCHANT_REVIEWED_SOURCE_CHANGED',409);
  need(actualCode.sha256===code.sha256,'API_MERCHANT_REVIEWED_CODE_CHANGED',409);
  server=await startMerchantWorkspaceServer(model,{port});
  launch={
   schema:LAUNCH_SCHEMA,state:'LISTENING',instanceId:newId(),workspaceId:model.state.id,
   directory:configuration.directory,config:configuration.file,configSha256:configuration.sha256,
   expectedWorkspaceSha256:expectedWorkspaceSha256??null,sourceSha256:selectedSource.sha256,codeSha256:code.sha256,
   pid:process.pid,url:server.url,port:server.port,requestedPort:port,startedAt:now(),
  };
  await publishLaunch(launchFile,launch);
  return {...server,close,launch,launchFile,model};
 }catch(error){
  if(!model&&typeof error.recovery?.close==='function')failedOpenClose=error.recovery.close;
  try{await close();}
  catch(closeError){
   Object.defineProperty(error,'merchantWorkspaceRecovery',{value:{close,launchFile,code:safeError(closeError).code},enumerable:false});
  }
  throw error;
 }
}
/** Keep the same original owner available when a native close needs a retry. */
async function signalLifetime(close,{startClosing=false,initialError}={}){
 let finish,closing=null;
 const finished=new Promise(accept=>{finish=accept;});
 const keeper=setInterval(()=>{},1000);
 const stop=()=>{
  if(closing)return;
  closing=Promise.resolve().then(close).then(()=>finish(),error=>{
   process.exitCode=1;report(error,{state:'CLOSE_FAILED',action:'Retry Stop on this same process'});
   closing=null;
  });
 };
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 if(initialError)report(initialError,{state:'CLOSE_FAILED',action:'Retry Stop on this same process'});
 if(startClosing)stop();
 try{await finished;}
 finally{clearInterval(keeper);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
async function configure(values){
 only(values,['merchant','checkout','gateway-base-url','directory','out','actor','python','backup','links']);
 const file=absolute(selected(values,'out')),raw={
  schema:SCHEMA,directory:absolute(selected(values,'directory')),
  merchant:absolute(selected(values,'merchant')),checkout:absolute(selected(values,'checkout')),
  gatewayBaseUrl:selected(values,'gateway-base-url'),
 };
 for(const name of ['actor','python'])if(values.has(name))raw[name]=selected(values,name);
 for(const name of ['backup','links'])if(values.has(name))
  raw[name]=parse(await ownedBytes(absolute(selected(values,name)),1048576));
 await ownedDirectory(dirname(file),{create:true});
 const temporary=join(dirname(file),'.merchant-config-'+randomUUID()+'.json'),bytes=encoded(raw);
 try{
  await writeBytes(temporary,bytes,{exclusive:true});
  const compiled=await readConfiguration(temporary);await readSelectedSource(compiled);
  try{await writeBytes(file,bytes,{exclusive:true});}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   need((await ownedBytes(file)).equals(bytes),'API_MERCHANT_CONFIGURATION_ALREADY_EXISTS',409);
  }
  const saved=await readConfiguration(file);
  output({schema:SCHEMA,file,sha256:saved.sha256,directory:saved.directory,launchFile:join(saved.directory,LAUNCH_NAME)});
 }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
export async function readMerchantWorkspaceLaunch(file){
 file=absolute(file);
 const value=parse(await ownedBytes(file,65536));
 need(value?.schema===LAUNCH_SCHEMA&&value.state==='LISTENING'&&UUID.test(value.instanceId)&&UUID.test(value.workspaceId)&&
  HASH.test(value.configSha256)&&HASH.test(value.sourceSha256)&&HASH.test(value.codeSha256)&&
  Number.isSafeInteger(value.pid)&&value.pid>0,'API_MERCHANT_LAUNCH_REQUIRED',409);
 need(absolute(value.directory)===dirname(file)&&join(value.directory,LAUNCH_NAME)===file&&
  absolute(value.config)===value.config,'API_MERCHANT_LAUNCH_REQUIRED',409);
 let url;try{url=new URL(value.url);}catch{need(false,'API_MERCHANT_LAUNCH_REQUIRED',409);}
 need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&
  url.pathname==='/'&&!url.search&&/^[A-Za-z0-9_-]{43}$/.test(url.hash.slice(1))&&
  Number(url.port||80)===value.port,'API_MERCHANT_LAUNCH_REQUIRED',409);
 return {...value,file,origin:url.origin,capability:url.hash.slice(1)};
}
async function responseJson(response){
 const parts=[];let size=0;
 for await(const part of response.body??[]){
  size+=part.length;need(size<=MAX_JSON,'API_MERCHANT_RESPONSE_TOO_LARGE',413);parts.push(Buffer.from(part));
 }
 const value=parse(Buffer.concat(parts));
 if(!response.ok){
  const safe=safeError({code:value?.error??value?.code,status:response.status});
  throw Object.assign(new Error(safe.code),safe);
 }
 return value;
}
async function requestJson(launch,path,{body}={}){
 const headers={Authorization:'Bearer '+launch.capability,Accept:'application/json'};
 if(body!==undefined){
  headers['Content-Type']='application/json';headers['X-Workspace-Request']='1';
 }
 const bytes=body===undefined?undefined:JSON.stringify(body);
 need(bytes===undefined||Buffer.byteLength(bytes)<=256*1024,'API_MERCHANT_REQUEST_TOO_LARGE',413);
 let response;
 try{
  response=await fetch(launch.origin+path,{method:body===undefined?'GET':'POST',headers,body:bytes,
   redirect:'error',signal:AbortSignal.timeout(30000)});
  const value=await responseJson(response);
  need(value!==null&&typeof value==='object'&&!Array.isArray(value),'API_MERCHANT_RESPONSE_ENVELOPE_REQUIRED',502);
  return value;
 }catch(error){
  if(body!==undefined&&path!=='/api/preview')
   Object.assign(error,{outcomeUnknown:error.outcomeUnknown===true||response===undefined||response.ok||response.status>=500});
  throw error;
 }
}
async function connected(launchFile){
 const launch=await readMerchantWorkspaceLaunch(launchFile),view=await requestJson(launch,'/api/state');
 need(view?.workspace?.id===launch.workspaceId,'API_MERCHANT_LAUNCH_WORKSPACE_CHANGED',409);
 return {launch,view};
}
function queryPage(values,extra={}){
 const params=new URLSearchParams(extra);
 if(values.has('after'))params.set('after',selected(values,'after'));
 if(values.has('limit')){
  const raw=selected(values,'limit');need(/^[1-9][0-9]{0,2}$/.test(raw),'API_MERCHANT_LIMIT_REQUIRED');
  integer(Number(raw),1,100,'API_MERCHANT_LIMIT_REQUIRED');params.set('limit',raw);
 }
 return params.size?'?'+params.toString():'';
}
async function waitOperation(launch,id){
 need(UUID.test(id),'API_MERCHANT_OPERATION_ID_REQUIRED');
 while(true){
  const operation=await requestJson(launch,'/api/operations/'+encodeURIComponent(id));
  if(['COMPLETED','ATTENTION','CANCELLED'].includes(operation.status))return operation;
  need(['QUEUED','RUNNING'].includes(operation.status),'API_MERCHANT_OPERATION_STATE_REQUIRED',409);
  await delay(350);
 }
}
/** Full original bytes are streamed, hashed, fsynced and then exclusively published. */
export async function downloadMerchantWorkspaceFile({launchFile,exportId,name,out,expectedSha256}={}){
 need(UUID.test(exportId),'API_MERCHANT_IDENTIFIER_REQUIRED');
 need(typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(name),'API_MERCHANT_EXPORT_FILE_REQUIRED');
 hashValue(expectedSha256,'API_MERCHANT_EXPECTED_FILE_REQUIRED');
 out=absolute(out);await ownedDirectory(dirname(out));
 const {launch}=await connected(launchFile),manifest=await requestJson(launch,'/api/exports/'+exportId);
 const member=manifest.files?.find(file=>file.name===name);
 need(member&&HASH.test(member.sha256)&&Number.isSafeInteger(member.bytes)&&member.bytes>=0&&member.bytes<=4*1024**3,
  'API_MERCHANT_EXPORT_FILE_REQUIRED',404);
 need(expectedSha256===undefined||expectedSha256===member.sha256,'API_MERCHANT_EXPORT_IDENTITY_CHANGED',409);
 const response=await fetch(launch.origin+'/api/exports/'+exportId+'/files/'+encodeURIComponent(name),{
  headers:{Authorization:'Bearer '+launch.capability,'If-Match':'"'+member.sha256+'"','Accept-Encoding':'identity'},
  redirect:'error',
 });
 if(!response.ok){await responseJson(response);need(false,'API_MERCHANT_EXPORT_DOWNLOAD_FAILED');}
 const temporary=join(dirname(out),'.merchant-download-'+randomUUID());
 let handle,published=false;
 try{
  need(response.status===200&&response.headers.get('content-length')===String(member.bytes)&&
   response.headers.get('etag')==='"'+member.sha256+'"'&&response.headers.get('x-content-sha256')===member.sha256&&
   (!response.headers.get('content-encoding')||response.headers.get('content-encoding')==='identity'),
   'API_MERCHANT_EXPORT_IDENTITY_CHANGED',409);
  handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  const hash=createHash('sha256');let bytes=0;
  for await(const part of response.body??[]){
   const chunk=Buffer.from(part);bytes+=chunk.length;
   need(bytes<=member.bytes,'API_MERCHANT_EXPORT_LENGTH_CHANGED',409);hash.update(chunk);
   let offset=0;
   while(offset<chunk.length){
    const result=await handle.write(chunk,offset,chunk.length-offset);
    need(result.bytesWritten>0,'API_MERCHANT_EXPORT_WRITE_FAILED',503);offset+=result.bytesWritten;
   }
  }
  need(bytes===member.bytes&&hash.digest('hex')===member.sha256,'API_MERCHANT_EXPORT_IDENTITY_CHANGED',409);
  await handle.sync();await handle.close();handle=null;
  await link(temporary,out);published=true;await unlink(temporary);await syncDirectory(dirname(out));
  return {schema:'stellar-forge.sf101.api-merchant-file-received.v1',workspaceId:launch.workspaceId,
   exportId,name,path:out,bytes,sha256:member.sha256};
 }catch(error){
  if(published)Object.defineProperty(error,'destinationPublished',{value:true,enumerable:false});
  throw error;
 }finally{
  await response.body?.cancel().catch(()=>{});
  if(handle)await handle.close();
  await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
}
/** Receive the complete original encrypted application, merchant sidecar and outbox. */
export async function restoreMerchantWorkspaceBundle({bundle,metadataFile,out,passEnv,python,
 expectedMetadataSha256}={}){
 bundle=absolute(bundle);metadataFile=absolute(metadataFile);out=absolute(out);
 hashValue(expectedMetadataSha256,'API_MERCHANT_EXPECTED_BACKUP_METADATA_REQUIRED');
 need(/^[A-Z][A-Z0-9_]{4,63}$/.test(passEnv??''),'API_MERCHANT_BACKUP_ENV_REQUIRED');
 python=python??process.env.PYTHON??'python3';
 need(typeof python==='string'&&python.length>0&&python.length<=4096&&!/[\x00-\x1f\x7f]/.test(python),
  'API_MERCHANT_PYTHON_REQUIRED');
 const inside=(parent,child)=>{
  const path=relative(parent,child);
  return path===''||(!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep));
 };
 need(!inside(bundle,out)&&!inside(out,bundle),'API_MERCHANT_RESTORE_DESTINATION_OVERLAP');
 await ownedDirectory(bundle);await ownedDirectory(dirname(out));
 const bytes=await ownedBytes(metadataFile,MAX_JSON),metadata=parse(bytes),metadataSha256=digest(bytes);
 need(metadata&&typeof metadata==='object'&&!Array.isArray(metadata)&&
  metadata.schema==='stellar-forge.sf101.api-merchant-backup.v1'&&UUID.test(metadata.id)&&
  UUID.test(metadata.offerId)&&HASH.test(metadata.encryptedManifestSha256)&&
  HASH.test(metadata.snapshotManifestSha256)&&HASH.test(metadata.sidecarSha256)&&HASH.test(metadata.profileSha256)&&
  metadata.source&&typeof metadata.source==='object'&&!Array.isArray(metadata.source),
  'API_MERCHANT_BACKUP_METADATA_REQUIRED');
 need(expectedMetadataSha256===undefined||metadataSha256===expectedMetadataSha256,
  'API_MERCHANT_BACKUP_METADATA_CHANGED',409);
 const restored=await restoreMerchantSnapshot({
  bundle,destination:out,passEnv,python,recoverInterruptedDestination:false,
  encryptedManifestSha256:metadata.encryptedManifestSha256,
  snapshotManifestSha256:metadata.snapshotManifestSha256,sidecarSha256:metadata.sidecarSha256,
 });
 need(restored.profileSha256===metadata.profileSha256&&
  canonical(restored.source)===canonical(metadata.source)&&
  restored.sidecar?.offerId===metadata.offerId,'API_MERCHANT_RESTORED_SOURCE_CHANGED',409);
 return {...restored,backupId:metadata.id,originalOfferId:metadata.offerId,
  backupMetadata:{path:metadataFile,bytes:bytes.length,sha256:metadataSha256}};
}
export {requestJson as requestMerchantWorkspaceJson};
export async function main(argv=process.argv.slice(2)){
 const {command,action,values}=argumentsOf([...argv]);
 if(command==='help'){process.stdout.write(HELP+'\n');return;}
 if(command==='new-id'){only(values,[]);output({operationId:newId()});return;}
 if(command==='configure'){await configure(values);return;}
 if(command==='restore-bundle'){
  only(values,['bundle','metadata','out','pass-env','python','expected-metadata-sha256']);
  output(await restoreMerchantWorkspaceBundle({bundle:selected(values,'bundle'),metadataFile:selected(values,'metadata'),
   out:selected(values,'out'),passEnv:selected(values,'pass-env'),python:selected(values,'python'),
   expectedMetadataSha256:selected(values,'expected-metadata-sha256')}));return;
 }
 if(command==='inspect-launch'){
  only(values,['config','port']);
  output(await inspectMerchantWorkspaceLaunch({configFile:selected(values,'config'),port:portValue(selected(values,'port','0'))}));
  return;
 }
 if(command==='serve'){
  only(values,['config','port','expected-config-sha256','expected-workspace-sha256','expected-source-sha256','expected-code-sha256']);
  let app;
  try{
   app=await serveConfiguredMerchantWorkspace({
    configFile:selected(values,'config'),port:portValue(selected(values,'port','0')),
    expectedConfigSha256:selected(values,'expected-config-sha256'),expectedWorkspaceSha256:selected(values,'expected-workspace-sha256'),
    expectedSourceSha256:selected(values,'expected-source-sha256'),expectedCodeSha256:selected(values,'expected-code-sha256'),
   });
  }catch(error){
   if(error.merchantWorkspaceRecovery)
    await signalLifetime(error.merchantWorkspaceRecovery.close,{startClosing:true,initialError:error});
   throw error;
  }
  output({...app.launch,launchFile:app.launchFile});
  await signalLifetime(app.close);return;
 }
 if(command==='download'){
  only(values,['launch','export','file','out','expected-sha256']);
  output(await downloadMerchantWorkspaceFile({launchFile:selected(values,'launch'),exportId:selected(values,'export'),
   name:selected(values,'file'),out:selected(values,'out'),expectedSha256:selected(values,'expected-sha256')}));return;
 }
 const allowed={
  view:[],preview:['input'],act:['input','wait'],operation:['id'],resume:['id','request-sha256','wait'],
  cancel:['id','request-sha256'],offer:['id'],order:['reference','after','limit'],
  executions:['offer-id','after','limit'],execution:['offer-id','id'],export:['id'],
 };
 need(Object.hasOwn(allowed,command),'API_MERCHANT_COMMAND_REQUIRED');only(values,['launch',...allowed[command]]);
 const waitSelected=(command==='act'||command==='resume')?boolValue(selected(values,'wait','true')):false;
 const {launch,view}=await connected(selected(values,'launch'));
 if(command==='view'){output(view);return;}
 let path,body;
 const identifier=()=>{
  const value=selected(values,'id');need(UUID.test(value),'API_MERCHANT_IDENTIFIER_REQUIRED');return value;
 };
 if(command==='preview'||command==='act'){
  body=parse(await ownedBytes(absolute(selected(values,'input')),256*1024));
  need(body&&typeof body==='object'&&!Array.isArray(body),'API_MERCHANT_JSON_OBJECT_REQUIRED');
  if(command==='act'){
   need(typeof action==='string'&&/^[a-z_]{1,40}$/.test(action),'API_MERCHANT_ACTION_REQUIRED');
   need(UUID.test(body.operationId),'API_MERCHANT_OPERATION_ID_REQUIRED');
  }
  path=command==='preview'?'/api/preview':'/api/actions/'+action;
 }else if(command==='resume'||command==='cancel'){
  const requestSha256=selected(values,'request-sha256');
  need(HASH.test(requestSha256),'API_MERCHANT_RETAINED_REQUEST_REQUIRED');
  path='/api/operations/'+identifier()+'/'+command;body={requestSha256};
 }else if(command==='operation')path='/api/operations/'+identifier();
 else if(command==='offer')path='/api/offers/'+identifier();
 else if(command==='export')path='/api/exports/'+identifier();
 else if(command==='order'){
  const reference=selected(values,'reference');
  need(typeof reference==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(reference),'ORDER_REFERENCE_INVALID');
  path='/api/orders/'+encodeURIComponent(reference)+queryPage(values);
 }else if(command==='executions'||command==='execution'){
  const offerId=selected(values,'offer-id');need(UUID.test(offerId),'API_MERCHANT_IDENTIFIER_REQUIRED');
  if(command==='executions')path='/api/executions'+queryPage(values,{offerId});
  else{
   const id=selected(values,'id');need(/^sf101-[a-f0-9]{64}$/.test(id),'APP_OPERATION_REQUIRED');
   path='/api/executions/'+id+'?offerId='+offerId;
  }
 }
 let result;
 try{
  result=await requestJson(launch,path,{body});
  if(waitSelected)
   result=await waitOperation(launch,result.operation?.id??body.operationId??selected(values,'id'));
 }catch(error){
  const operationId=body?.operationId??(['resume','cancel'].includes(command)?selected(values,'id'):undefined);
  if(operationId)Object.defineProperty(error,'operationId',{value:operationId,enumerable:false});
  throw error;
 }
 output(result);
 if(result?.status==='ATTENTION'||result?.status==='CANCELLED')process.exitCode=2;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().catch(error=>{
  report(error,{...(error.operationId?{operationId:error.operationId}:{}),
   ...(error.destinationPublished?{destinationPublished:true}:{}),
   ...(typeof error.outcomeUnknown==='boolean'?{outcomeUnknown:error.outcomeUnknown}:{})});process.exitCode=1;
 });
