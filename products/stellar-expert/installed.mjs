// MIT. Installed product workflow over the original Applications and retained-file clients.
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { open, rename, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { readDistributionSpecification } from '../../stellar/scf-starforge-20261009/distribution/specification.mjs';
import { absolute, privateDirectory, makePrivate, regular, readJSON, saveJSON, operationLease,
  operationId, plain, need, canonical, json, digest, now } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const SCF='stellar/scf-starforge-20261009/';
const SCHEMA='stellar-forge.selected-product-operation.v1';
const REQUEST='stellar-forge.selected-product-request.v1';
const BINDING=['directory','installationId','profileId','profileSha256','lockSha256','sourceCommit','sourceManifestSha256'];
const PRODUCTS={
 'stellar-expert':{folder:'stellar-expert',title:'Stellar asset investigation',kind:'stellar-expert',
  command:'dataset-workspace',connectionSchema:'stellar-forge.stellar-expert-workspace-connection.v1',
  workspaceSchema:'stellar-forge.stellar-expert-workspace-schema.v1',
  provider:'stellar-expert-workspaces',input:'stellarExpertWorkspaceConnection',
  setup:'stellar-forge/mcp-merchant-operator/config.mjs',initialize:'initializeStellarExpertWorkspaceMerchant',
  client:'stellar-forge/mcp-merchant-operator/stellar-expert-client.mjs',
  methods:['openStellarExpertClient','inspectStellarExpertFiles','downloadStellarExpertFiles','reopenStellarExpertFiles'],
  sections:['watchlist','editions','analysis','publications','receiving'],tools:27},
 'nws':{folder:'nws-site-weather',title:'Site weather operations',kind:'nws-site-weather',
  command:'nws-workspace',connectionSchema:'stellar-forge.nws-workspace-connection.v1',
  workspaceSchema:'stellar-forge.nws-workspace-schema.v1',provider:'nws-workspaces',input:'nwsWorkspaceConnection',
  setup:SCF+'sf30-seller-sdk/nws/merchant-setup.mjs',initialize:'initializeNwsWorkspaceMerchant',
  client:SCF+'sf30-seller-sdk/nws/mcp-client.mjs',
  methods:['openNwsClient','inspectNwsFiles','downloadNwsFiles','reopenNwsFiles'],
  sections:['portfolio','captures','weather','editions','notes','publishing','receiving'],tools:30}
};
const fingerprint=value=>digest(json(canonical(value)));
const binding=value=>Object.fromEntries(BINDING.map(key=>[key,value[key]]));
const safeError=error=>({code:error.code??'PRODUCT_OPERATION_FAILED',message:String(error.message??error).slice(0,2000)});
const definition=id=>{need(Object.hasOwn(PRODUCTS,id),'PRODUCT_UNKNOWN');return PRODUCTS[id];};
function exact(value,allowed,required=[]){
 need(plain(value)&&Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),
  'PRODUCT_FIELDS_INVALID','Supply the documented fields and preserve the original request.');
}
function validateRequest(request){
 exact(request,['schema','product','operationId','managerDirectory','runtimeDirectory','expectedSourceCommit','label','alias','settings','workspaceId'],
  ['schema','product','operationId','managerDirectory','runtimeDirectory','expectedSourceCommit','label','alias','settings']);
 need(request.schema===REQUEST,'PRODUCT_REQUEST_SCHEMA_REQUIRED');definition(request.product);operationId(request.operationId);
 absolute(request.managerDirectory);absolute(request.runtimeDirectory);
 need(/^[a-f0-9]{40}$/.test(request.expectedSourceCommit??''),'PRODUCT_SOURCE_COMMIT_REQUIRED');
 need(typeof request.label==='string'&&request.label.trim()===request.label&&request.label.length>0&&request.label.length<=120,'PRODUCT_LABEL_REQUIRED');
 need(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.alias??''),'PRODUCT_ALIAS_REQUIRED');
 need(plain(request.settings)&&typeof request.settings.workspaceDirectory==='string','PRODUCT_SETTINGS_REQUIRED');
 absolute(request.settings.workspaceDirectory);
 if(request.workspaceId!==undefined)operationId(request.workspaceId);
 return JSON.parse(JSON.stringify(request));
}
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function writeBytes(path,bytes){
 const temporary=path+'.pending-'+randomUUID(),handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 await rename(temporary,path);const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
}
async function installed(request,{verifySource=false}={}){
 const product=definition(request.product);
 const runtime=await inspectMerchantRuntime(request.runtimeDirectory,{load:false,source:verifySource});
 need(runtime.state==='READY'&&runtime.sourceCommit===request.expectedSourceCommit,'PRODUCT_SELECTED_RUNTIME_CHANGED');
 const selected=await readDistributionSpecification({sourceRoot:runtime.sourceRoot});
 need(selected.manifest?.sourceSelection?.id===request.product,'PRODUCT_SOURCE_SELECTION_REQUIRED',
  'Use the complete '+request.product+' selected package, with its original installation manifest.');
 need(Object.hasOwn(selected.spec.commands,product.command)&&Object.hasOwn(selected.spec.applicationProviders??{},product.kind)&&
  Object.hasOwn(selected.spec.merchantProviders??{},product.provider),'PRODUCT_CAPABILITIES_MISSING');
 const module=await import(pathToFileURL(join(runtime.sourceRoot,SCF+'distribution/runtime-workspace/model.mjs')));
 return {runtime,product,selection:selected.manifest.sourceSelection,model:await module.openRuntimeWorkspace({directory:request.managerDirectory})};
}
async function saveRecord(directory,record){record.updatedAt=now();await saveJSON(join(directory,'operation.json'),record,true);}
async function withOperation(directory,callback){
 await privateDirectory(absolute(directory));const lease=await operationLease(join(directory,'product.lock'));
 let context,result,failure;
 try{
  const record=await readJSON(join(directory,'operation.json'));
  need(record.schema===SCHEMA&&fingerprint(record.request)===record.requestSha256,'PRODUCT_OPERATION_CHANGED');
  validateRequest(record.request);context=await installed(record.request);
  need(fingerprint(binding(context.runtime))===fingerprint(record.runtime),'PRODUCT_INSTALLED_IDENTITY_CHANGED');
  result=await callback({...context,record,directory});
 }catch(error){failure=error;}
 finally{
  for(const close of [()=>context?.model.close(),()=>lease.close()]){
   try{await close();}catch(error){if(!failure)failure=error;else (failure.cleanupErrors??=[]).push(safeError(error));}
  }
 }
 if(failure)throw failure;return result;
}
async function findRun(model,applicationId,id){
 let cursor;const seen=new Set();
 do{
  const page=await model.applicationsHistory({applicationId,limit:100,...(cursor?{cursor}:{})});
  const found=page.runs.find(run=>run.id===id);if(found)return found;
  cursor=page.nextCursor;
  if(cursor){need(!seen.has(cursor),'PRODUCT_HISTORY_CURSOR_REPEATED');seen.add(cursor);}
 }while(cursor);
 return null;
}
function redacted(value){
 if(Array.isArray(value))return value.map(redacted);
 if(!plain(value))return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['privateUrl','privateLinks','url'].includes(key)).map(([key,item])=>[key,redacted(item)]));
}
async function state(context){
 const {record,model}=context;
 const view=record.applicationId?(await model.applicationsState({historyLimit:30})).applications.find(a=>a.id===record.applicationId):null;
 return {schema:'stellar-forge.selected-product-status.v1',product:record.request.product,directory:context.directory,
  requestId:record.request.operationId,sourceSelection:record.sourceSelection,runtime:record.runtime,
  applicationId:record.applicationId??null,workspaceId:record.workspaceId??record.request.workspaceId??null,
  reviewId:record.reviewId??null,application:redacted(view),runs:record.runs,merchant:record.merchant??null,files:record.files??[]};
}
export async function prepareProductOperation({directory,request}){
 absolute(directory);request=validateRequest(request);
 try{await makePrivate(directory);}catch(error){if(error.code!=='EEXIST')throw error;await privateDirectory(directory);}
 const lease=await operationLease(join(directory,'product.lock'));let context,result,failure;
 try{
  let record=await readJSON(join(directory,'operation.json'),true);
  if(record){need(record.schema===SCHEMA&&record.requestSha256===fingerprint(request),'PRODUCT_REQUEST_CHANGED');}
  context=await installed(request,{verifySource:true});
  if(!record){
   record={schema:SCHEMA,request,requestSha256:fingerprint(request),runtime:binding(context.runtime),
    sourceSelection:context.selection,createdAt:now(),runs:{},files:[]};
   await saveJSON(join(directory,'operation.json'),record);
  }
  need(fingerprint(record.runtime)===fingerprint(binding(context.runtime)),'PRODUCT_INSTALLED_IDENTITY_CHANGED');
  if(!record.reviewId){
   const attached=await context.model.attach({directory:request.runtimeDirectory,label:request.label});
   need(attached.status==='READY','PRODUCT_RUNTIME_NOT_READY');record.runtimeId=attached.runtimeId;
   const reviewed=await context.model.applicationsReview({runtimeId:attached.runtimeId,kind:context.product.kind,settings:request.settings,label:request.label});
   record.reviewId=reviewed.id;await saveRecord(directory,record);
  }
  result=await state({...context,record,directory});
 }catch(error){failure=error;}
 finally{
  for(const close of [()=>context?.model.close(),()=>lease.close()]){
   try{await close();}catch(error){if(!failure)failure=error;else(failure.cleanupErrors??=[]).push(safeError(error));}
  }
 }
 if(failure)throw failure;return result;
}
export async function saveProductOperation({directory}){
 return withOperation(directory,async context=>{
  const {record,model}=context;
  const result=await model.applicationsSave({requestId:record.request.operationId,reviewId:record.reviewId});
  if(record.applicationId)need(result.applicationId===record.applicationId,'PRODUCT_APPLICATION_CHANGED');
  record.applicationId=result.applicationId;record.applicationRevision=result.revision;record.savedAt??=now();
  await saveRecord(directory,record);
  return {result,...await state(context)};
 });
}
export async function connectProductOperation({directory}){
 return withOperation(directory,async context=>{
  need(context.record.applicationId,'PRODUCT_SAVE_REQUIRED');
  const result=await context.model.applicationsConnect({applicationId:context.record.applicationId});
  return {result,...await state(context)};
 });
}
export async function startProductOperation({directory,runId}){
 operationId(runId);
 return withOperation(directory,async context=>{
  const {record,model}=context;need(record.applicationId,'PRODUCT_SAVE_REQUIRED');
  let run=record.runs[runId];
  if(!run){
   const review=await model.applicationsStartReview({applicationId:record.applicationId});
   run={id:runId,reviewId:review.id,createdAt:now()};record.runs[runId]=run;
   await saveRecord(directory,record);
  }
  const result=await model.applicationsStart({applicationId:record.applicationId,requestId:runId,reviewId:run.reviewId});
  run.dispatchedAt??=now();await saveRecord(directory,record);
  return {result,...await state(context)};
 });
}
export async function inspectProductOperation({directory,runId}){
 if(runId!==undefined)operationId(runId);
 return withOperation(directory,async context=>({...await state(context),...(runId?{
  selectedRun:redacted(await findRun(context.model,context.record.applicationId,runId))}: {})}));
}
export async function controlProductOperation({directory,runId,action}){
 operationId(runId);need(['stop','recover'].includes(action),'PRODUCT_CONTROL_REQUIRED');
 return withOperation(directory,async context=>{
  const {record,model}=context;need(record.runs[runId],'PRODUCT_ORIGINAL_RUN_REQUIRED');
  const result=await model[action==='stop'?'applicationsStop':'applicationsRecover']({applicationId:record.applicationId,operationId:runId});
  record.runs[runId][action+'RequestedAt']=now();await saveRecord(directory,record);
  return {result,...await state(context)};
 });
}
async function authenticatedRun(context,runId){
 const {record,model,product}=context;
 need(record.runs[operationId(runId)],'PRODUCT_ORIGINAL_RUN_REQUIRED');
 const run=await findRun(model,record.applicationId,runId);
 need(run?.active&&!run.stop&&typeof run.privateUrl==='string','PRODUCT_APPLICATION_NOT_OPEN',
  'Read the original operation progress; reopen its current process or recover that same run.');
 const path=join(record.request.managerDirectory,'operations',runId,'application-url.json'),bytes=await regular(path,65536);
 const retained=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 need(retained.operationId===runId&&retained.url===run.privateUrl&&retained.original?.workspaceId,'PRODUCT_STARTUP_CHANGED');
 const url=new URL(retained.url);
 need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&!url.search&&!url.username&&!url.password&&
  /^#[A-Za-z0-9_-]{43}$/.test(url.hash),'PRODUCT_PRIVATE_URL_INVALID');
 const response=await fetch(url.origin+'/api/schema',{headers:{Authorization:'Bearer '+url.hash.slice(1)},redirect:'error',signal:AbortSignal.timeout(15000)});
 need(response.ok,'PRODUCT_WORKSPACE_UNREACHABLE');const schema=await response.json();
 need(schema.schema===product.workspaceSchema&&schema.workspaceId===retained.original.workspaceId,'PRODUCT_AUTHENTICATED_IDENTITY_CHANGED');
 const expected=record.workspaceId??record.request.workspaceId;
 if(expected)need(schema.workspaceId===expected,'PRODUCT_WORKSPACE_CHANGED');
 record.workspaceId=schema.workspaceId;await saveRecord(context.directory,record);
 return {run,retained,bytes,schema};
}
export async function openProductOperation({directory,runId}){
 return withOperation(directory,async context=>{
  const actual=await authenticatedRun(context,runId);
  return {schema:'stellar-forge.selected-product-open.v1',applicationId:context.record.applicationId,
   operationId:runId,workspaceId:actual.schema.workspaceId,url:actual.retained.url};
 });
}
export async function connectProductMerchant({directory,runId}){
 return withOperation(directory,async context=>{
  const {record,product,runtime}=context,actual=await authenticatedRun(context,runId);
  const session=join(directory,'application-url.json'),connection=join(directory,'merchant-connection.json');
  // Preserve the full original startup record; every refresh verifies its live authenticated UUID.
  await writeBytes(session,actual.bytes);
  const declared={schema:product.connectionSchema,workspaces:{[record.request.alias]:{
   label:record.request.label,workspaceId:record.workspaceId,applicationUrlFile:session}}};
  const previous=await readJSON(connection,true);
  if(previous)need(fingerprint(previous)===fingerprint(declared),'PRODUCT_MERCHANT_CONNECTION_CHANGED');
  else await saveJSON(connection,declared);
  const merchantDirectory=join(directory,'merchant'),configuration=join(merchantDirectory,'merchant-mcp.json');
  const configModule=await import(pathToFileURL(join(runtime.sourceRoot,'stellar-forge/mcp-merchant-operator/config.mjs')));
  if(!await exists(configuration)){
   need(!await exists(merchantDirectory),'PRODUCT_MERCHANT_DIRECTORY_CHANGED');
   let stage=record.merchantStage;
   if(stage&&await exists(stage)&&!await exists(join(stage,'merchant-mcp.json'))){
    (record.incompleteMerchantStages??=[]).push({directory:stage,observedAt:now()});stage=null;
   }
   if(!stage){stage=join(directory,'merchant-preparation-'+randomUUID());record.merchantStage=stage;await saveRecord(directory,record);}
   if(!await exists(stage)){
    const setup=await import(pathToFileURL(join(runtime.sourceRoot,product.setup)));
    await setup[product.initialize]({directory:stage,connection,name:record.request.label});
   }
   const staged=await readJSON(join(stage,'merchant-mcp.json'));
   need(staged[product.input]===connection,'PRODUCT_MERCHANT_CONFIG_CHANGED');
   await configModule.readMerchantConfig(join(stage,'merchant-mcp.json'));
   // Publish a fully prepared original host atomically; retain interrupted staging for inspection.
   await rename(stage,merchantDirectory);delete record.merchantStage;
  }
  const raw=await readJSON(configuration);
  need(raw[product.input]===connection,'PRODUCT_MERCHANT_CONFIG_CHANGED');
  await configModule.readMerchantConfig(configuration);
  record.merchant={configuration,connection,sessionRecord:session,applicationId:record.applicationId,
   runId,workspaceId:record.workspaceId,alias:record.request.alias,updatedAt:now()};
  await saveRecord(directory,record);
  return {schema:'stellar-forge.selected-product-merchant.v1',...record.merchant,
   entrypoint:join(runtime.sourceRoot,'stellar-forge/mcp-merchant-operator/serve.mjs')};
 });
}
export async function productClient({directory,...options}){
 // Caller owns and closes the returned original client.
 return withOperation(directory,async({record,runtime,product})=>{
  need(record.workspaceId,'PRODUCT_OPEN_REQUIRED');
  const module=await import(pathToFileURL(join(runtime.sourceRoot,product.client)));
  return module[product.methods[0]]({...options,workspace:record.request.alias});
 });
}
export async function productFiles({directory,action,selection,signal,onProgress}){
 need(['inspect','receive','reopen'].includes(action),'PRODUCT_FILE_ACTION_INVALID');
 return withOperation(directory,async({record,runtime,product})=>{
  need(record.workspaceId,'PRODUCT_OPEN_REQUIRED');
  exact(selection,['url','tokenEnv','kind','id','page','wire','directory','expectedManifestSha256','chunkSize'],
   action==='reopen'?['directory']:['url','kind','id',...(action==='receive'?['directory']:[])]);
  if(product.folder!=='nws-site-weather')need(selection.wire===undefined,'PRODUCT_WIRE_SELECTION_UNSUPPORTED');
  if(action!=='inspect')absolute(selection.directory);
  if(action==='reopen')need(Object.keys(selection).every(k=>['directory','expectedManifestSha256'].includes(k)),'PRODUCT_OFFLINE_SELECTION_INVALID');
  const client=await import(pathToFileURL(join(runtime.sourceRoot,product.client)));
  const options=action==='reopen'?selection:{...selection,workspace:record.request.alias,expectedWorkspaceId:record.workspaceId,signal,onProgress};
  let reviewed;
  if(action!=='reopen'){
   reviewed=await client[product.methods[1]](options);
   need(reviewed.manifest.workspaceId===record.workspaceId,'PRODUCT_FILE_WORKSPACE_CHANGED');
   if(selection.expectedManifestSha256)need(reviewed.manifestSha256===selection.expectedManifestSha256,'PRODUCT_FILE_SELECTION_CHANGED');
  }
  if(action==='inspect')return reviewed;
  const result=action==='receive'?await client[product.methods[2]]({...options,expectedManifestSha256:reviewed.manifestSha256}):
   await client[product.methods[3]](options);
  const receipt={action,selection:{kind:selection.kind??null,id:selection.id??null,page:selection.page??null,wire:selection.wire??false,
   directory:selection.directory,expectedManifestSha256:reviewed?.manifestSha256??selection.expectedManifestSha256??null},
   observedAt:now(),result};
  const key=fingerprint(receipt.selection);
  const index=record.files.findIndex(item=>item.key===key);const item={key,...receipt};
  if(index<0)record.files.push(item);else record.files[index]=item;
  await saveRecord(directory,record);return result;
 });
}
export async function exportProductHandover({directory}){
 return withOperation(directory,async context=>{
  const status=await state(context),file=join(directory,'handover.json');
  const value={schema:'stellar-forge.selected-product-handover.v1',createdAt:now(),...status,
   request:context.record.request,
   guides:[join(context.runtime.sourceRoot,'products',context.product.folder,'README.md')],
   operationalState:'Read original Applications and retained customer file results above.'};
  await saveJSON(file,value,true);
  return {path:file,sha256:digest(await regular(file)),bytes:(await lstat(file)).size};
 });
}
export function productDefinition(id){return JSON.parse(JSON.stringify(definition(id)));}
