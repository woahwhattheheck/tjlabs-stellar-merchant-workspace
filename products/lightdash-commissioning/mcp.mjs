// MIT. One original browser/SQLite/native lifetime behind the Merchant provider.
import path from 'node:path';
import {callOperatingProcedure} from './operating-store.mjs';
import {lstat,realpath,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {RetainedFileReads} from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {CommissioningWorkspace} from '../../business/lightdash-commissioning-workspace-20261012/workspace.mjs';
import {createWorkspaceServer} from '../../business/lightdash-commissioning-workspace-20261012/server.mjs';
import * as native from '../../business/lightdash-commissioning-workspace-20261012/native/index.mjs';
import {prepareHandover,resumeHandover,inspectHandover,readHandover} from '../../business/lightdash-commissioning-workspace-20261012/packaging.mjs';
import {CONNECTION_SCHEMA,MAX_FILE_BYTES,UUID,plain,exact,absolute,alias,uuid,identifier,sha,revision,text,need,fault,
 privateDirectory,readBytes,json,exists,workspaceIdentity,fixedWorkspace,acquireWorkspace,
 digest,objectDigest,saveJson,fileIdentity,verifyManifest,inventory,inside,safeRelative,publicValue,immutableFile} from './common.mjs';

const CONFIGURATION_SCHEMA='lightdash.commissioning-configuration.v1';
const REQUEST_SCHEMA='stellar-forge.lightdash-mcp-request.v1';
function hostPath(value,base){need(typeof value==='string'&&value&&!/[\0\r\n]/.test(value),'LIGHTDASH_CONFIGURATION','Declare the original host path.');return absolute(path.resolve(base,value));}
export async function readLightdashConfiguration(filename){
 filename=absolute(filename);const raw=await json(filename,{maximum:2*1024*1024,privateFile:true});
 exact(raw,['schema','workspaces'],['schema','workspaces']);
 need(raw.schema===CONNECTION_SCHEMA&&plain(raw.workspaces)&&Object.keys(raw.workspaces).length>0&&Object.keys(raw.workspaces).length<=32,
  'LIGHTDASH_CONFIGURATION','Declare 1–32 original commissioning workspaces.');
 const workspaces=Object.create(null),directories=new Set(),base=path.dirname(filename);
 for(const [key,item]of Object.entries(raw.workspaces)){
  alias(key);exact(item,['label','directory','controlDirectory','workspaceIdentity','inputs','connections','allowOperatorPrivate','python'],['directory','controlDirectory','workspaceIdentity']);
  const directory=hostPath(item.directory,base),controlDirectory=hostPath(item.controlDirectory,base);
  await privateDirectory(controlDirectory);const identity=await workspaceIdentity(directory);
  need(objectDigest(fixedWorkspace(identity))===objectDigest(item.workspaceIdentity)&&!directories.has(directory),
   'LIGHTDASH_WORKSPACE_CHANGED','Bind this original workspace through one exact canonical alias.');directories.add(directory);
  const inputs=Object.create(null),connections=Object.create(null);
  need((item.inputs===undefined||plain(item.inputs))&&(item.connections===undefined||plain(item.connections)),
   'LIGHTDASH_CONFIGURATION','Declare named original source and configuration inputs.');
  need(Object.keys(item.inputs??{}).length<=64&&Object.keys(item.connections??{}).length<=32,'LIGHTDASH_CONFIGURATION','Too many host inputs.');
  for(const [name,input]of Object.entries(item.inputs??{})){
   alias(name);exact(input,['label','directory','manifestFile','manifestSha256'],['directory','manifestFile','manifestSha256']);
   inputs[name]={label:text(input.label??name,'source label'),directory:hostPath(input.directory,base),
    manifestFile:hostPath(input.manifestFile,base),manifestSha256:sha(input.manifestSha256)};
  }
  for(const [name,input]of Object.entries(item.connections??{})){
   alias(name);exact(input,['label','file','sha256'],['file','sha256']);
   connections[name]={label:text(input.label??name,'connection label'),file:hostPath(input.file,base),sha256:sha(input.sha256)};
  }
  workspaces[key]={label:text(item.label??key,'workspace label'),directory,controlDirectory,identity:fixedWorkspace(identity),
   inputs,connections,allowOperatorPrivate:item.allowOperatorPrivate===true,python:item.python?hostPath(item.python,base):undefined};
 }
 return {schema:CONNECTION_SCHEMA,workspaces};
}
function requestView(value){return publicValue(value);}
async function selectedConnection(definition,key){
 const item=definition.connections[alias(key)];need(item,'LIGHTDASH_CONNECTION_ALIAS','Choose an inspected host connection alias.');
 const bytes=await readBytes(item.file,{maximum:1024*1024,privateFile:true});
 need(digest(bytes)===item.sha256,'LIGHTDASH_CONNECTION_CHANGED','The original declared connection file changed.');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 exact(value,['schema','connection','editionSettings'],['schema','connection','editionSettings']);
 need(value.schema===CONFIGURATION_SCHEMA,'LIGHTDASH_CONNECTION_SCHEMA','Use a complete original connection and source-settings declaration.');
 return value;
}
export class MerchantLightdashWorkspaces{
 #config;#entries=new Map();#opening=new Map();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'LIGHTDASH_FILE'});
 constructor(config){this.#config=config;}
 get summary(){return {configured:Boolean(this.#config.lightdashCommissioning),...this.#reads.summary,
  workspaces:Object.entries(this.#config.lightdashCommissioning?.workspaces??{}).map(([workspace,d])=>{
   const e=this.#entries.get(workspace);
   return {workspace,label:d.label,workspaceId:d.identity.workspaceId,workspaceIdentity:objectDigest(d.identity),
    inputAliases:Object.keys(d.inputs),connectionAliases:Object.keys(d.connections),allowOperatorPrivate:d.allowOperatorPrivate,
    open:Boolean(e),opening:this.#opening.has(workspace),closing:Boolean(e?.closing),instanceId:e?.instanceId??null,browserUrl:e?.service.url??null};
  })};}
 #definition(key){alias(key);const d=this.#config.lightdashCommissioning?.workspaces[key];need(d,'LIGHTDASH_WORKSPACE_ALIAS','Choose a host-declared commissioning workspace.');return d;}
 #entry(key){this.#definition(key);const e=this.#entries.get(key);need(e&&!e.closing,'LIGHTDASH_WORKSPACE_NOT_OPEN','Open this existing original workspace first.');return e;}
 #scope(key){return 'lightdash:'+key+':'+this.#definition(key).directory;}
 async #state(e){return {workspace:e.alias,instanceId:e.instanceId,browserUrl:e.service.url,
  native:requestView(await e.model.state()),background:[...e.background.keys()],files:this.#reads.status(this.#scope(e.alias))};}
 async #open(key){
  const d=this.#definition(key);if(this.#entries.has(key))return this.#state(this.#entry(key));
  if(this.#opening.has(key))return this.#opening.get(key);
  const opening=(async()=>{
   const release=await acquireWorkspace(d.directory);let model,service;
   try{
    const identity=await workspaceIdentity(d.directory);
    need(objectDigest(fixedWorkspace(identity))===objectDigest(d.identity),'LIGHTDASH_WORKSPACE_CHANGED','The original workspace identity changed.');
    model=await CommissioningWorkspace.open(d.directory,{engine:native});
    service=await createWorkspaceServer({workspace:model,port:0});
    need(!this.#closing,'LIGHTDASH_WORKSPACE_CLOSING','The Merchant lifetime is closing.');
    const e={alias:key,definition:d,model,service,release,instanceId:randomUUID(),pending:new Set(),background:new Map(),closing:false,closePromise:null};
    this.#entries.set(key,e);
    try{return await this.#state(e);}catch(error){this.#entries.delete(key);throw error;}
   }catch(error){if(service)await service.close();model?.close();await release();throw error;}
  })();
  this.#opening.set(key,opening);try{return await opening;}finally{this.#opening.delete(key);}
 }
 async #closeEntry(e){
  e.closing=true;
  if(!e.closePromise)e.closePromise=(async()=>{
   await Promise.allSettled([...e.pending]);
   await Promise.allSettled([...e.background.values()]);
   await e.service.close(); // Original HTTP/native/package calls are drained here too.
   await this.#reads.closeScope(this.#scope(e.alias));
   e.model.close();await e.release();
   if(this.#entries.get(e.alias)===e)this.#entries.delete(e.alias);
   return {workspace:e.alias,instanceId:e.instanceId,state:'CLOSED'};
  })().catch(error=>{e.closePromise=null;throw error;});
  return e.closePromise;
 }
 async #input(d,name){
  const input=d.inputs[alias(name)];need(input,'LIGHTDASH_INPUT_ALIAS','Choose an inspected original source input.');
  const verified=await verifyManifest(input);
  return {input:name,label:input.label,manifestSha256:input.manifestSha256,files:verified.files,bytes:verified.bytes};
 }
 async #mutate(e,name,args,fn){
  uuid(args.requestId);revision(args.expectedRevision);
  const directory=path.join(e.definition.controlDirectory,'mcp-requests');await privateDirectory(directory,true);
  const filename=path.join(directory,args.requestId+'.json');
  const selection={schema:REQUEST_SCHEMA,workspaceId:e.definition.identity.workspaceId,requestId:args.requestId,tool:name,args};
  const selectionSha256=objectDigest(selection);
  if(await exists(filename)){
   const prior=await json(filename);need(prior.selectionSha256===selectionSha256,'LIGHTDASH_REQUEST_CHANGED','The original request UUID has another complete input.');
   return prior.state==='COMPLETE'?{workspace:e.alias,requestId:args.requestId,replayed:true,result:prior.result}:
    {workspace:e.alias,requestId:args.requestId,state:'OBSERVATION_REQUIRED',request:requestView(prior),current:await this.#state(e),
     continuation:'Read the original state before another edit. This saved source mutation was not dispatched again.'};
  }
  await saveJson(filename,{...selection,selectionSha256,state:'DISPATCHED',startedAt:new Date().toISOString()},{createOnly:true});
  try{
   const result=requestView(await fn());
   await saveJson(filename,{...selection,selectionSha256,state:'COMPLETE',result,completedAt:new Date().toISOString()});
   return {workspace:e.alias,requestId:args.requestId,result};
  }catch(error){
   try{await saveJson(filename,{...selection,selectionSha256,state:'OBSERVATION_REQUIRED',error:{code:error.code??'LIGHTDASH_SOURCE_RESPONSE_UNCERTAIN'},observedRevision:e.model.metadata().revision});}catch{}
   throw fault(error.code??'LIGHTDASH_SOURCE_RESPONSE_UNCERTAIN','Original source request '+args.requestId+' requires its retained request/current state before continuing.');
  }
 }
 #begin(e,key,fn){
  if(!e.background.has(key)){
   const job=Promise.resolve().then(fn).catch(error=>({state:'INTERRUPTED',error:{code:error.code??'LIGHTDASH_OPERATION_FAILED'}}))
    .finally(()=>e.background.delete(key));
   e.background.set(key,job);
  }
 }
 async #content(e,editionId,content){
  exact(content,['kind','directory','operationId','manifestSha256'],['kind']);
  if(content.kind==='download'){
   identifier(content.operationId);sha(content.manifestSha256);
   const rows=await e.model.contentExports(content.operationId),selected=rows.filter(x=>!x.error&&x.manifestSha256===content.manifestSha256);
   need(selected.length===1,'LIGHTDASH_CONTENT_SELECTION','Choose one complete original native content manifest.');
   return selected[0];
  }
  need(content.kind==='edition','LIGHTDASH_CONTENT_SELECTION','Choose original edition or native download content.');
  const edition=await e.model.nativeEdition(uuid(editionId)),subdirectory=content.directory??edition.projectDir;
  const directory=subdirectory==='.'?edition.directory:inside(edition.directory,safeRelative(subdirectory));
  const files=await inventory(directory);need(files.length>0,'LIGHTDASH_CONTENT_SELECTION','The selected original content directory is empty.');
  const prefix=subdirectory==='.'?'':subdirectory+'/';
  for(const item of files){const original=edition.files?.find(x=>x.path===prefix+item.path)??(await e.model.editionManifest(editionId)).files.find(x=>x.path===prefix+item.path);
   need(original?.sha256===item.sha256&&original.bytes===item.bytes,'LIGHTDASH_CONTENT_CHANGED','Content must match the complete immutable source edition.');}
  const manifestDirectory=path.join(e.definition.controlDirectory,'content-selections');await privateDirectory(manifestDirectory,true);
  const manifestFile=path.join(manifestDirectory,editionId+'-'+digest(subdirectory).slice(0,16)+'.json');
  const sourceProjectUuid=e.model.metadata().connection.projectUuid;
  await saveJson(manifestFile,{schema:'lightdash-commissioning.edition-content.v1',sourceEditionId:editionId,sourceProjectUuid,sourceSha256:edition.sourceSha256,files},{createOnly:true});
  return {directory,manifestFile,manifestSha256:(await fileIdentity(manifestFile)).sha256,sourceProjectUuid,sourceEditionId:editionId};
 }
 async #file(e,args){
  let key,load;
  const definition=e.definition,model=e.model;
  if(args.kind==='source'){
   const sourceArgs={editionId:args.editionId,draft:args.draft===true,expectedDraftId:args.expectedDraftId,path:safeRelative(args.path)};
   need(sourceArgs.draft?UUID.test(sourceArgs.expectedDraftId??''):UUID.test(sourceArgs.editionId??''),'LIGHTDASH_SOURCE_ID','Bind the exact source edition or selected draft.');
   key='source:'+objectDigest(sourceArgs);
   load=async()=>{const value=await model.readSource(sourceArgs);if(value.absolutePath)return immutableFile(value.absolutePath,{bytes:value.bytes,sha256:value.sha256,name:path.basename(value.path)});const bytes=Buffer.from(value.content,'utf8');
    need(bytes.length===value.bytes&&digest(bytes)===value.sha256,'LIGHTDASH_SOURCE_CHANGED','The complete original source file changed.');
    return {name:path.basename(value.path),type:'application/octet-stream',bytes};};
  }else if(args.kind==='artifact'){
   identifier(args.operationId);identifier(args.artifactId);key='artifact:'+args.operationId+':'+args.artifactId;
   load=async()=>{
    const op=model.operation(args.operationId),item=op.nativeResult?.artifacts?.find(x=>x.id===args.artifactId);
    need(item,'LIGHTDASH_ARTIFACT_ID','Select an original native artifact ID.');
    need(item.scope==='native-content'||definition.allowOperatorPrivate&&args.includeOperatorPrivate===true,
     'LIGHTDASH_ARTIFACT_PRIVATE','This original artifact requires the host-enabled operator-private choice.');
    const root=await realpath(path.join(definition.directory,'operations',args.operationId,'native'));
    const filename=await realpath(item.relativePath?inside(root,item.relativePath):absolute(item.path));
    need(filename.startsWith(root+path.sep),'LIGHTDASH_ARTIFACT_SCOPE','The original artifact belongs to another operation.');
    return immutableFile(filename,{bytes:item.bytes,sha256:item.sha256});
   };
  }else{
   need(['handover','handover-request'].includes(args.kind),'LIGHTDASH_FILE_KIND','Choose an original retained file kind.');
   uuid(args.handoverId);key=args.kind+':'+args.handoverId;
   load=async()=>{
    const current=await readHandover({workspace:model,id:args.handoverId});
    need(current.request&&current.state==='SUCCEEDED','LIGHTDASH_HANDOVER_INCOMPLETE','Finish this original handover before receiving its files.');
    need(!current.request.includeOperatorPrivate||definition.allowOperatorPrivate&&args.includeOperatorPrivate===true,
     'LIGHTDASH_HANDOVER_PRIVATE','The selected archive contains operator-private diagnostics.');
    const directory=path.join(definition.directory,'handover',args.handoverId);
    if(args.kind==='handover-request')return {name:'request.json',type:'application/json',bytes:await readBytes(path.join(directory,'request.json'),{maximum:1024*1024,privateFile:true})};
    const checked=await inspectHandover({workspace:model,id:args.handoverId,python:definition.python});
    need(checked.state==='SUCCEEDED','LIGHTDASH_HANDOVER_INCOMPLETE','The exact original handover did not verify.');
    return immutableFile(path.join(directory,'Lightdash_Commissioning_Handover.zip'),{bytes:checked.archive.bytes,sha256:checked.archive.sha256,type:'application/zip'});
   };
  }
  const chunk=await this.#reads.read({scope:this.#scope(e.alias),key,kind:'lightdash-'+args.kind,directory:definition.controlDirectory,
   readId:args.readId,expectedSha256:args.expectedSha256,offset:args.offset,limit:args.limit,load});
  return {workspace:e.alias,workspaceId:definition.identity.workspaceId,selection:{kind:args.kind,editionId:args.editionId??null,draft:args.draft===true,
   expectedDraftId:args.expectedDraftId??null,path:args.path??null,operationId:args.operationId??null,artifactId:args.artifactId??null,handoverId:args.handoverId??null},...chunk};
 }
 async #dispatch(e,name,args){
  const model=e.model,workspace=e.alias,d=e.definition;
  if(name.startsWith('merchant_lightdash_operating_'))return callOperatingProcedure(e,name,args);
  switch(name){
   case 'merchant_lightdash_status':return this.#state(e);
   case 'merchant_lightdash_inputs':
    if(args.input!==undefined)return {workspace,...await this.#input(d,args.input)};
    return {workspace,inputs:Object.entries(d.inputs).map(([input,x])=>({input,label:x.label,manifestSha256:x.manifestSha256})),
     connections:Object.entries(d.connections).map(([connection,x])=>({connection,label:x.label,sha256:x.sha256}))};
   case 'merchant_lightdash_configure':return this.#mutate(e,name,args,async()=>{
    const value=args.connection===null?{connection:{}}:await selectedConnection(d,args.connection);
    return model.configure({connection:value.connection,editionSettings:value.editionSettings,...(args.label?{label:args.label}:{})},args.expectedRevision);
   });
   case 'merchant_lightdash_intake':return this.#mutate(e,name,args,async()=>{
    const selected=await this.#input(d,args.input);need(selected.manifestSha256===sha(args.expectedManifestSha256),'LIGHTDASH_INPUT_CHANGED','The selected complete source manifest changed.');
    const result=await model.captureProject({projectRoot:d.inputs[args.input].directory,label:args.label??selected.label,note:args.note??'',operationId:identifier(args.operationId)},args.expectedRevision);
    await this.#input(d,args.input);return result;
   });
   case 'merchant_lightdash_manifest':return {workspace,native:args.draft===true?await model.draftManifest({expectedDraftId:uuid(args.expectedDraftId)}):await model.editionManifest(uuid(args.editionId))};
   case 'merchant_lightdash_select':return this.#mutate(e,name,args,()=>model.selectEditions({...(args.baselineId?{baselineId:uuid(args.baselineId)}:{}),...(args.selectedId?{selectedId:uuid(args.selectedId)}:{})},args.expectedRevision));
   case 'merchant_lightdash_draft_create':return this.#mutate(e,name,args,()=>model.createDraft(uuid(args.editionId),args.expectedRevision));
   case 'merchant_lightdash_draft_select':return this.#mutate(e,name,args,()=>model.selectDraft(uuid(args.draftId),args.expectedRevision));
   case 'merchant_lightdash_draft_edit':return this.#mutate(e,name,args,()=>model.editDraft({path:safeRelative(args.path),content:args.content,remove:args.remove===true,expectedFileSha256:args.expectedFileSha256,expectedDraftId:uuid(args.expectedDraftId)},args.expectedRevision));
   case 'merchant_lightdash_seal':return this.#mutate(e,name,args,()=>model.sealDraft({label:args.label,note:args.note??'',expectedDraftId:uuid(args.expectedDraftId)},args.expectedRevision));
   case 'merchant_lightdash_compare':return {workspace,native:await model.compare(uuid(args.baselineId),uuid(args.candidateId))};
   case 'merchant_lightdash_review':return this.#mutate(e,name,args,()=>model.saveReview({baselineId:uuid(args.baselineId),candidateId:uuid(args.candidateId),reviewedBy:args.reviewedBy,note:args.note,decisions:args.decisions},args.expectedRevision));
   case 'merchant_lightdash_plan':{
    const input={...(args.input??{})};need(!Object.hasOwn(input,'content'),'LIGHTDASH_CONTENT_SELECTION','Select original content by edition or download identity.');
    if(args.content)input.content=await this.#content(e,args.editionId,args.content);
    return {workspace,...requestView(await model.plan({operationId:identifier(args.operationId),action:args.action,editionId:uuid(args.editionId),input},revision(args.expectedRevision)))};
   }
   case 'merchant_lightdash_operation':return {workspace,operation:requestView(model.operation(identifier(args.operationId))),pending:model.inflight.has(args.operationId)};
   case 'merchant_lightdash_execute':case 'merchant_lightdash_inspect':{
    const id=identifier(args.operationId),op=model.operation(id);
    need(op.requestSha256===sha(args.expectedRequestSha256),'LIGHTDASH_OPERATION_CHANGED','Execute or inspect the exact saved original request.');
    if(name==='merchant_lightdash_inspect')return {workspace,...requestView(await model.execute(id,{inspect:true}))};
    this.#begin(e,'native:'+id,()=>model.execute(id));
    return {workspace,operation:requestView(model.operation(id)),accepted:true,pending:true,operationId:id};
   }
   case 'merchant_lightdash_content':return {workspace,operationId:args.operationId,exports:requestView(await model.contentExports(identifier(args.operationId)))};
   case 'merchant_lightdash_handover_create':{
    uuid(args.handoverId);revision(args.expectedRevision);
    need(args.includeOperatorPrivate!==true||d.allowOperatorPrivate,'LIGHTDASH_HANDOVER_PRIVATE','Operator-private diagnostics are not enabled by this host.');
    const request=await prepareHandover({workspace:model,id:args.handoverId,includeOperatorPrivate:args.includeOperatorPrivate===true,expectedRevision:args.expectedRevision});
    this.#begin(e,'handover:'+args.handoverId,()=>resumeHandover({workspace:model,id:args.handoverId,python:d.python}));
    return {workspace,handoverId:args.handoverId,accepted:true,request:requestView(request)};
   }
   case 'merchant_lightdash_handover_status':return {workspace,native:requestView(await readHandover({workspace:model,id:uuid(args.handoverId)})),pending:e.background.has('handover:'+args.handoverId)};
   case 'merchant_lightdash_handover_inspect':return {workspace,native:requestView(await inspectHandover({workspace:model,id:uuid(args.handoverId),python:d.python}))};
   case 'merchant_lightdash_handover_resume':
    uuid(args.handoverId);await prepareHandover({workspace:model,id:args.handoverId,resume:true});
    this.#begin(e,'handover:'+args.handoverId,()=>resumeHandover({workspace:model,id:args.handoverId,python:d.python}));
    return {workspace,handoverId:args.handoverId,accepted:true};
   case 'merchant_lightdash_file_read':return this.#file(e,args);
   case 'merchant_lightdash_file_release':
    await this.#reads.release(this.#scope(workspace),uuid(args.readId));return {workspace,readId:args.readId,state:'RELEASED'};
   case 'merchant_lightdash_request':{
    const file=path.join(d.controlDirectory,'mcp-requests',uuid(args.requestId)+'.json'),request=await json(file);
    need(request.workspaceId===d.identity.workspaceId&&request.requestId===args.requestId,'LIGHTDASH_REQUEST_CHANGED','The retained source request belongs to another workspace.');
    return {workspace,request:requestView(request),current:await this.#state(e)};
   }
   default:throw fault('TOOL_NOT_FOUND','Unknown commissioning tool.');
  }
 }
 async call(name,args={}){
  need(!this.#closing,'LIGHTDASH_WORKSPACE_CLOSING','The Merchant lifetime is closing.');
  if(name==='merchant_lightdash_workspaces')return this.summary;
  if(name==='merchant_lightdash_open')return this.#open(args.workspace);
  if(name==='merchant_lightdash_close'){
   const e=this.#entry(args.workspace);need(e.instanceId===uuid(args.instanceId),'LIGHTDASH_INSTANCE_CHANGED','Close only this exact owned browser instance.');return this.#closeEntry(e);
  }
  const e=this.#entry(args.workspace),promise=Promise.resolve().then(()=>this.#dispatch(e,name,args));e.pending.add(promise);
  try{return await promise;}catch(error){
   if(error.code&&/^[A-Z][A-Z0-9_]{0,99}$/.test(error.code))throw fault(error.code,'Original commissioning operation: '+error.code+'. Inspect the same request/current state before continuing.');
   throw fault('LIGHTDASH_OPERATION_FAILED','The original commissioning operation requires its current saved state.');
  }finally{e.pending.delete(promise);}
 }
 close(){
  if(!this.#close){this.#closing=true;this.#close=(async()=>{
   await Promise.allSettled([...this.#opening.values()]);
   const results=await Promise.allSettled([...this.#entries.values()].map(e=>this.#closeEntry(e)));
   await this.#reads.close();
   need(results.every(r=>r.status==='fulfilled'),'LIGHTDASH_SHUTDOWN_INCOMPLETE','An original workspace did not finish closing.');
  })().catch(error=>{this.#close=null;throw error;});}
  return this.#close;
 }
}
