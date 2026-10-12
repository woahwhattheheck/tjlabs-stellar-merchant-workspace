// MIT. Installed project preparation, one original Merchant/browser host and reopen.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {APP,PRODUCT,MCP,PROJECT_SCHEMA,REQUEST_SCHEMA,SESSION_SCHEMA,CONNECTION_SCHEMA,TOKEN_ENV,
 plain,exact,absolute,alias,uuid,sha,revision,text,need,fault,privateDirectory,readBytes,json,exists,outside,
 workspaceIdentity,fixedWorkspace,installedSource,acquireWorkspace,digest,objectDigest,jsonBytes,saveJson,durable,verifyManifest} from './common.mjs';
import {CommissioningWorkspace} from '../../business/lightdash-commissioning-workspace-20261012/workspace.mjs';
import * as native from '../../business/lightdash-commissioning-workspace-20261012/native/index.mjs';

export const PROJECT_ALIAS='merchant';
const original=(installation,relative)=>import(pathToFileURL(path.join(installation.sourceRoot,relative)).href);
function request(raw){
 exact(raw,['schema','directory','runtimeDirectory','title','workspaceDirectory','expectedWorkspaceId','expectedRevision',
  'initialConnection','inputs','connections','allowOperatorPrivate','python'],['schema','directory','runtimeDirectory']);
 need(raw.schema===REQUEST_SCHEMA,'LIGHTDASH_PROJECT_SCHEMA','Use the complete commissioning project request.');
 const directory=absolute(raw.directory),runtimeDirectory=absolute(raw.runtimeDirectory),adopt=raw.workspaceDirectory!==undefined;
 const workspaceDirectory=adopt?absolute(raw.workspaceDirectory):path.join(directory,'workspace');
 need(outside(directory,runtimeDirectory)&&outside(workspaceDirectory,runtimeDirectory)&&(!adopt||outside(directory,workspaceDirectory)),
  'LIGHTDASH_PROJECT_OVERLAP','Keep the installed source, receiving project and adopted workspace separate.');
 const inputs={},connections={};
 for(const [name,value]of Object.entries(raw.inputs??{})){
  alias(name);exact(value,['label','directory','manifestFile','manifestSha256'],['directory','manifestFile','manifestSha256']);
  inputs[name]={label:text(value.label??name,'source label'),directory:absolute(value.directory),manifestFile:absolute(value.manifestFile),manifestSha256:sha(value.manifestSha256)};
 }
 for(const [name,value]of Object.entries(raw.connections??{})){
  alias(name);exact(value,['label','file','sha256'],['file','sha256']);
  connections[name]={label:text(value.label??name,'connection label'),file:absolute(value.file),sha256:sha(value.sha256)};
 }
 need(Object.keys(inputs).length<=64&&Object.keys(connections).length<=32,'LIGHTDASH_PROJECT_INPUTS','Use bounded named host inputs.');
 if(adopt)uuid(raw.expectedWorkspaceId);
 if(raw.initialConnection!==undefined){
  alias(raw.initialConnection);need(connections[raw.initialConnection],'LIGHTDASH_PROJECT_CONNECTION','Declare the selected original connection.');
  if(adopt)revision(raw.expectedRevision);
 }
 return {schema:REQUEST_SCHEMA,directory,runtimeDirectory,title:text(raw.title??'Lightdash commissioning','project title'),
  workspaceDirectory,adopt,expectedWorkspaceId:adopt?raw.expectedWorkspaceId:null,
  expectedRevision:raw.expectedRevision??null,initialConnection:raw.initialConnection??null,inputs,connections,
  allowOperatorPrivate:raw.allowOperatorPrivate===true,python:raw.python?absolute(raw.python):null};
}
async function verifyInputs(input){
 for(const item of Object.values(input.inputs))await verifyManifest(item);
 for(const item of Object.values(input.connections)){
  const b=await readBytes(item.file,{maximum:1024*1024,privateFile:true});
  need(digest(b)===item.sha256,'LIGHTDASH_PROJECT_CONNECTION_CHANGED','A declared complete host connection changed.');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
  exact(value,['schema','connection','editionSettings'],['schema','connection','editionSettings']);
  need(value.schema==='lightdash.commissioning-configuration.v1','LIGHTDASH_PROJECT_CONNECTION','Use an original connection/source-settings declaration.');
 }
}
async function merchantConfiguration(installation,directory,connectionFile,title){
 const merchantDirectory=path.join(directory,'merchant'),releaseStore=path.join(merchantDirectory,'releases');
 await privateDirectory(merchantDirectory,true);
 const releases=await original(installation,'stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs');
 const journal=path.join(directory,'merchant-initialization.json');
 if(!await exists(journal))await saveJson(journal,{schema:PROJECT_SCHEMA,releaseStore,state:'PREPARING'},{createOnly:true});
 const retained=await json(journal);need(retained.releaseStore===releaseStore,'LIGHTDASH_PROJECT_MERCHANT_CHANGED','The original Merchant preparation changed.');
 // The maintained SF82 initializer owns this required Merchant metadata store.
 // It starts no seller, signs nothing, and resumes only this explicitly owned directory.
 if(!await exists(releaseStore))await releases.initReleaseStore(releaseStore);
 else{
  try{await releases.readReleaseState(releaseStore);}
  catch(error){if(retained.state!=='PREPARING'||error.code!=='ENOENT')throw error;await releases.initReleaseStore(releaseStore,{resume:true});}
 }
 await releases.readReleaseState(releaseStore);
 await privateDirectory(path.join(merchantDirectory,'customer-exports'),true);
 const file=path.join(merchantDirectory,'merchant-mcp.json');
 const value={schema:'stellar-forge.merchant-mcp.v1',name:title,releaseStore:'./releases',exportsDirectory:'./customer-exports',
  sources:{},lightdashWorkspaceConnection:connectionFile};
 await saveJson(file,value,{createOnly:true});
 const config=await original(installation,MCP+'/config.mjs');await config.readMerchantConfig(file);
 await saveJson(journal,{schema:PROJECT_SCHEMA,releaseStore,state:'COMPLETE'});
 return {file,sha256:digest(await readBytes(file,{maximum:1024*1024,privateFile:true}))};
}
export async function prepareProject(raw){
 const input=request(raw),installation=await installedSource(input.runtimeDirectory);await verifyInputs(input);
 await privateDirectory(input.directory,true);const release=await acquireWorkspace(input.directory);
 let model,workspaceRelease;
 try{
  const preparationFile=path.join(input.directory,'PREPARATION.json');
  const selection={input,manifestSha256:installation.manifestSha256},selectionSha256=objectDigest(selection);
  let preparation=await exists(preparationFile)?await json(preparationFile):null;
  if(preparation)need(preparation.selectionSha256===selectionSha256,'LIGHTDASH_PROJECT_PREPARATION_CHANGED','Continue the exact retained preparation.');
  else{
   need((await readdir(input.directory)).every(n=>n==='publisher.lock'),'LIGHTDASH_PROJECT_NOT_EMPTY','Use a new private project directory or its exact retained preparation.');
   preparation={schema:PROJECT_SCHEMA,id:randomUUID(),selectionSha256,selection,createdAt:new Date().toISOString()};
   await saveJson(preparationFile,preparation,{createOnly:true});
  }
  if(await exists(path.join(input.directory,'project.json')))return {...await readProject(input.directory),replayed:true};
  if(!input.adopt)await privateDirectory(input.workspaceDirectory,true);
  workspaceRelease=await acquireWorkspace(input.workspaceDirectory);
  model=await CommissioningWorkspace.open(input.workspaceDirectory,{create:!input.adopt,label:input.title,engine:native});
  let metadata=model.metadata();
  if(input.adopt)need(metadata.id===input.expectedWorkspaceId,'LIGHTDASH_PROJECT_WORKSPACE_CHANGED','Adopt the exact original workspace ID.');
  const identityFile=path.join(input.directory,'workspace-preparation.json');
  if(await exists(identityFile)){
   const prior=await json(identityFile);need(prior.preparationId===preparation.id&&prior.workspaceId===metadata.id,'LIGHTDASH_PROJECT_WORKSPACE_CHANGED','The original prepared workspace changed.');
  }else await saveJson(identityFile,{schema:PROJECT_SCHEMA,preparationId:preparation.id,workspaceId:metadata.id},{createOnly:true});
  if(input.initialConnection!==null){
   const configured=await json(input.connections[input.initialConnection].file,{maximum:1024*1024,privateFile:true});
   const desired={connection:configured.connection,editionSettings:configured.editionSettings};
   if(objectDigest({connection:metadata.connection,editionSettings:metadata.editionSettings})!==objectDigest(desired)){
    need(!await exists(path.join(input.directory,'configuration-applied.json')),'LIGHTDASH_PROJECT_CONFIGURATION_CHANGED','A completed preparation does not overwrite later configuration edits.');
    metadata=model.configure(desired,input.adopt?input.expectedRevision:metadata.revision);
   }
   await saveJson(path.join(input.directory,'configuration-applied.json'),{schema:PROJECT_SCHEMA,preparationId:preparation.id,
    connectionAlias:input.initialConnection,sha256:objectDigest(desired),workspaceId:metadata.id},{createOnly:true});
  }
  model.close();model=null;await workspaceRelease();workspaceRelease=null;
  const observed=await workspaceIdentity(input.workspaceDirectory),identity=fixedWorkspace(observed);
  const connectionFile=path.join(input.directory,'lightdash-connection.json');
  const definition={label:input.title,directory:input.workspaceDirectory,controlDirectory:input.directory,workspaceIdentity:identity,
   inputs:input.inputs,connections:input.connections,allowOperatorPrivate:input.allowOperatorPrivate,...(input.python?{python:input.python}:{})};
  await saveJson(connectionFile,{schema:CONNECTION_SCHEMA,workspaces:{[PROJECT_ALIAS]:definition}},{createOnly:true});
  const merchant=await merchantConfiguration(installation,input.directory,connectionFile,input.title);
  const tokenFile=path.join(input.directory,'mcp-token.txt');
  if(!await exists(tokenFile))await durable(tokenFile,randomBytes(32).toString('base64url')+'\n',{createOnly:true});
  const token=(await readBytes(tokenFile,{maximum:256,privateFile:true})).toString('utf8').trim();
  need(/^[A-Za-z0-9_-]{43}$/.test(token),'LIGHTDASH_PROJECT_TOKEN','The original project bearer file is invalid.');
  const value={schema:PROJECT_SCHEMA,id:preparation.id,title:input.title,directory:input.directory,
   workspaceDirectory:input.workspaceDirectory,workspace:identity,workspaceIdentity:objectDigest(identity),workspaceAlias:PROJECT_ALIAS,
   installation:{runtimeDirectory:installation.runtimeDirectory,sourceRoot:installation.sourceRoot,sourceCommit:installation.sourceCommit,
    manifestFile:installation.manifestFile,manifestSha256:installation.manifestSha256,application:installation.application},
   connectionFile,connectionSha256:digest(await readBytes(connectionFile)),merchantConfigFile:merchant.file,merchantConfigSha256:merchant.sha256,
   tokenFile,tokenSha256:digest(token),inputs:input.inputs,connections:input.connections,allowOperatorPrivate:input.allowOperatorPrivate,
   python:input.python,createdAt:preparation.createdAt};
  await saveJson(path.join(input.directory,'application-settings.json'),{application:'lightdash-commissioning',settings:{projectDirectory:input.directory}},{createOnly:true});
  await saveJson(path.join(input.directory,'project.json'),value,{createOnly:true});
  return await readProject(input.directory);
 }finally{model?.close();if(workspaceRelease)await workspaceRelease();await release();}
}
export async function readProject(directory){
 absolute(directory);await privateDirectory(directory);
 const state=await json(path.join(directory,'project.json'),{maximum:8*1024*1024,privateFile:true});
 need(state.schema===PROJECT_SCHEMA&&state.directory===directory&&state.workspaceAlias===PROJECT_ALIAS,'LIGHTDASH_PROJECT_SCHEMA','Select this original prepared project.');
 const installed=await installedSource(state.installation.runtimeDirectory);
 need(installed.sourceRoot===state.installation.sourceRoot&&installed.manifestSha256===state.installation.manifestSha256&&
  installed.application.manifestSha256===state.installation.application.manifestSha256,'LIGHTDASH_PROJECT_INSTALLATION_CHANGED','The selected installed runtime changed.');
 const current=await workspaceIdentity(state.workspaceDirectory);
 need(objectDigest(fixedWorkspace(current))===state.workspaceIdentity&&objectDigest(state.workspace)===state.workspaceIdentity,
  'LIGHTDASH_PROJECT_WORKSPACE_CHANGED','The original commissioning workspace was replaced.');
 for(const [file,expected]of [[state.connectionFile,state.connectionSha256],[state.merchantConfigFile,state.merchantConfigSha256]]){
  need(digest(await readBytes(file,{maximum:4*1024*1024,privateFile:true}))===expected,'LIGHTDASH_PROJECT_CONFIGURATION_CHANGED','The prepared original host configuration changed.');
 }
 return state;
}
export async function inspectProject(directory){
 const state=await readProject(directory),current=await workspaceIdentity(state.workspaceDirectory);
 const session=await exists(path.join(directory,'session.json'))?await json(path.join(directory,'session.json')):null;
 return {schema:PROJECT_SCHEMA,id:state.id,directory,title:state.title,workspaceId:current.workspaceId,revision:current.revision,
  workspaceIdentity:state.workspaceIdentity,configurationSha256:current.configurationSha256,sourceCommit:state.installation.sourceCommit,
  manifestSha256:state.installation.manifestSha256,applicationManifestSha256:state.installation.application.manifestSha256,
  declaredInputs:Object.keys(state.inputs),declaredConnections:Object.keys(state.connections),session,
  sessionIsLocator:true,nativeDispatch:false};
}
export async function openProject(directory,{port=0,signal}={}){
 need(Number.isInteger(port)&&port>=0&&port<=65535,'LIGHTDASH_PROJECT_PORT','Use a local MCP port.');
 const state=await readProject(directory),release=await acquireWorkspace(directory),instanceId=randomUUID();
 let host,opening,closing,admissionClosed=false,released=false,closeError;
 const pending=new Set();
 const close=()=>{
  admissionClosed=true;if(released)return Promise.resolve({state:'CLOSED',instanceId});
  if(!closing)closing=(async()=>{
   if(opening)await opening.catch(()=>{});
   await Promise.all([host?.close(),Promise.allSettled([...pending])]);
   let journalError;
   try{await saveJson(path.join(directory,'session.json'),{schema:SESSION_SCHEMA,phase:'CLOSED',instanceId,workspaceId:state.workspace.workspaceId,
    workspaceIdentity:state.workspaceIdentity,manifestSha256:state.installation.manifestSha256,endedAt:new Date().toISOString()});}catch(e){journalError=e;}
   await release();released=true;
   if(journalError)throw Object.assign(journalError,{originalHostClosed:true});
   return {state:'CLOSED',instanceId};
  })().catch(error=>{closeError=error;if(!released)closing=null;throw error;});
  return closing;
 };
 const abort=()=>{admissionClosed=true;close().catch(e=>{closeError=e;});};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)admissionClosed=true;
 const call=async(name,args={})=>{
  need(!admissionClosed&&host,'LIGHTDASH_PROJECT_CLOSING','The original project host is not accepting calls.');
  need(name.startsWith('merchant_lightdash_')||name==='merchant_status','LIGHTDASH_PROJECT_TOOL','Use this commissioning product’s original tools.');
  const selected=name==='merchant_lightdash_workspaces'||name==='merchant_status'?args:{workspace:PROJECT_ALIAS,...args};
  need(!Object.hasOwn(selected,'workspace')||selected.workspace===PROJECT_ALIAS,'LIGHTDASH_PROJECT_ALIAS','Use this project’s original workspace alias.');
  const promise=Promise.resolve().then(()=>host.operator.call(name,selected));pending.add(promise);
  try{return await promise;}finally{pending.delete(promise);}
 };
 opening=(async()=>{
  const current=await readProject(directory);need(objectDigest(current)===objectDigest(state),'LIGHTDASH_PROJECT_CHANGED','The prepared project changed while opening.');
  const token=(await readBytes(state.tokenFile,{maximum:256,privateFile:true})).toString('utf8').trim();
  need(digest(token)===state.tokenSha256,'LIGHTDASH_PROJECT_TOKEN_CHANGED','The original local bearer changed.');
  need(!admissionClosed,'LIGHTDASH_PROJECT_START_CANCELLED','The original project is closing.');
  const server=await original(state.installation,MCP+'/serve.mjs'),environment={...process.env,[TOKEN_ENV]:token};
  delete environment.MCP_OAUTH_CONFIG;delete environment.MCP_CLIENT_ORIGINS;
  host=await server.startMerchantMcp({configPath:state.merchantConfigFile,port,tokenEnv:TOKEN_ENV,environment});
  need(!admissionClosed,'LIGHTDASH_PROJECT_START_CANCELLED','The original project is closing.');
  const opened=await call('merchant_lightdash_open',{workspace:PROJECT_ALIAS});
  need(!admissionClosed,'LIGHTDASH_PROJECT_START_CANCELLED','The original project is closing.');
  const session={schema:SESSION_SCHEMA,phase:'OPEN',instanceId,directory,workspaceId:state.workspace.workspaceId,
   workspaceIdentity:state.workspaceIdentity,sourceCommit:state.installation.sourceCommit,manifestSha256:state.installation.manifestSha256,
   authoringInstanceId:opened.instanceId,browserUrl:opened.browserUrl,mcpUrl:host.url,workspaceAlias:PROJECT_ALIAS,
   tools:host.operator.tools.map(t=>t.name),startedAt:new Date().toISOString()};
  await saveJson(path.join(directory,'session.json'),session);return session;
 })();
 try{
  const session=await opening;need(!admissionClosed,'LIGHTDASH_PROJECT_START_CANCELLED','The original project is closing.');
  return {state,session,call,operator:host.operator,get closeError(){return closeError;},
   close:async()=>{try{return await close();}finally{signal?.removeEventListener('abort',abort);}}};
 }catch(error){signal?.removeEventListener('abort',abort);try{await close();}catch(cleanup){error.cleanupError=cleanup;error.close=close;}throw error;}
}
