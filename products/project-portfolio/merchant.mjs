// SPDX-License-Identifier: MIT
// Complete customer operations through the selected original Project Portfolio workspace.
import {constants} from 'node:fs';
import {open,link,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {RetainedFileReads} from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {ProjectPortfolioClient,inspectProjectPortfolioFile,MAX_ARCHIVE_BYTES} from './client.mjs';
import {projectPortfolioTools,PROJECT_PORTFOLIO_AGENT_ACTIONS} from './merchant-catalog.mjs';
import {ALIAS,HASH,need,plain,exact,identity,fullPath,privateDirectory,readJson,readRegular,
 atomicJson,canonical,sha,readProjectPortfolioConnection} from './workspace.mjs';

export const PROJECT_PORTFOLIO_MERCHANT_SCHEMA='stellar-forge.project-portfolio-merchant-connection.v1';
export const PROJECT_PORTFOLIO_EXPORT_SCHEMA='stellar-forge.project-portfolio-agent-export.v1';
const MANIFEST='manifest.json',INLINE=65536,PREFIX='merchant_project_portfolio_';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const defs=new Map(projectPortfolioTools((name,description,properties,required,options)=>({
 name,description,properties,required,options})).map(value=>[value.name,value]));
const text=value=>JSON.stringify(canonical(value))+'\n';
function alias(value){need(typeof value==='string'&&ALIAS.test(value),'PROJECT_PORTFOLIO_ALIAS');return value;}
function string(value,maximum=4096){need(typeof value==='string'&&value.length>0&&value.length<=maximum&&!value.includes('\0'),
 'PROJECT_PORTFOLIO_TEXT');return value;}
function validate(value,schema){
 if(schema.enum)need(schema.enum.includes(value),'PROJECT_PORTFOLIO_INPUT');
 if(schema.type==='string'){
  string(value,schema.maxLength??8192);
  if(schema.pattern)need(new RegExp(schema.pattern).test(value),'PROJECT_PORTFOLIO_INPUT');
 }
 if(schema.type==='integer')need(Number.isSafeInteger(value)&&(schema.minimum===undefined||value>=schema.minimum)&&
  (schema.maximum===undefined||value<=schema.maximum),'PROJECT_PORTFOLIO_INPUT');
 if(schema.type==='boolean')need(typeof value==='boolean','PROJECT_PORTFOLIO_INPUT');
 if(schema.type==='object')need(plain(value),'PROJECT_PORTFOLIO_INPUT');
 if(schema.type==='array'){
  need(Array.isArray(value)&&value.length>=(schema.minItems??0),'PROJECT_PORTFOLIO_INPUT');
  for(const item of value)validate(item,schema.items??{});
 }
}
export async function readProjectPortfolioMerchantConfiguration(path){
 path=fullPath(path);const input=await readJson(path,2*1024*1024,{privateFile:true}),base=dirname(path);
 exact(input,['schema','workspaces'],['schema','workspaces']);
 need(input.schema===PROJECT_PORTFOLIO_MERCHANT_SCHEMA&&plain(input.workspaces)&&
  Object.keys(input.workspaces).length>0,'PROJECT_PORTFOLIO_MERCHANT_CONFIGURATION');
 const workspaces=Object.create(null);
 for(const [name,value]of Object.entries(input.workspaces)){
  alias(name);exact(value,['label','workspaceId','connectionFile','files'],['label','workspaceId','connectionFile']);
  const connectionFile=resolve(base,string(value.connectionFile)),connection=await readProjectPortfolioConnection(connectionFile);
  const definition={label:string(value.label,300),workspaceId:identity(value.workspaceId),connectionFile,
   workspaceDirectory:connection.workspaceDirectory,files:Object.create(null)};
  need(value.files===undefined||plain(value.files),'PROJECT_PORTFOLIO_MERCHANT_FILES');
  for(const [file,selected]of Object.entries(value.files??{})){
   alias(file);exact(selected,['label','path','sha256'],['label','path','sha256']);
   definition.files[file]={label:string(selected.label,300),path:resolve(base,string(selected.path)),sha256:identity(selected.sha256)};
  }
  workspaces[name]=definition;
 }
 return {schema:PROJECT_PORTFOLIO_MERCHANT_SCHEMA,workspaces};
}
export async function configureProjectPortfolioMerchant({
 directory,connectionFile,workspace='portfolio',label,files={},merchantName='Project portfolio'
}={}){
 directory=await privateDirectory(fullPath(directory),{create:true});alias(workspace);
 const client=new ProjectPortfolioClient({connectionFile:fullPath(connectionFile)});
 let hello;
 try{hello=await client.ready();}finally{await client.close();}
 const selected=await readProjectPortfolioConnection(connectionFile),references={};
 need(plain(files),'PROJECT_PORTFOLIO_MERCHANT_FILES');
 for(const [name,file]of Object.entries(files)){
  alias(name);exact(file,['path','label','sha256'],['path','label']);
  const original=await inspectProjectPortfolioFile(fullPath(file.path),{expectedSha256:file.sha256});
  references[name]={label:string(file.label,300),path:original.path,sha256:original.sha256};
 }
 const connection={schema:PROJECT_PORTFOLIO_MERCHANT_SCHEMA,workspaces:{
  [workspace]:{label:label??selected.label,workspaceId:hello.workspace_id,
   connectionFile:fullPath(connectionFile),files:references}
 }};
 const workspaceFile=join(directory,'project-portfolio.json');
 await atomicJson(workspaceFile,connection,{immutable:true});
 return {...await initializeProjectPortfolioMerchant({directory,connection:workspaceFile,name:merchantName}),
  workspace,workspaceId:hello.workspace_id,workspaceFile};
}
export async function initializeProjectPortfolioMerchant({directory,connection,name='Project portfolio'}={}){
 directory=await privateDirectory(fullPath(directory),{create:true});
 const projectPortfolioConnection=fullPath(connection);
 const selected=await readProjectPortfolioMerchantConfiguration(projectPortfolioConnection);
 const [{CONFIG_SCHEMA,readMerchantConfig},{initReleaseStore}]=await Promise.all([
  import('../../stellar-forge/mcp-merchant-operator/config.mjs'),
  import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')
 ]);
 const exportsDirectory=await privateDirectory(join(directory,'customer-exports'),{create:true});
 const releaseStore=join(directory,'releases');
 await initReleaseStore(releaseStore,{resume:true});
 const configuration=join(directory,'merchant-mcp.json');
 await atomicJson(configuration,{schema:CONFIG_SCHEMA,name:string(name,160),releaseStore,
  exportsDirectory,sources:{},projectPortfolioConnection},{immutable:true});
 await readMerchantConfig(configuration);
 return {schema:CONFIG_SCHEMA,state:'INITIALIZED',configuration,
  workspaces:Object.entries(selected.workspaces).map(([workspace,value])=>({
   workspace,label:value.label,workspaceId:value.workspaceId})),exportsDirectory};
}
export class MerchantProjectPortfolio {
 #config;#fetch;#clients=new Map();#pending=new Set();#closing=false;#closed=false;#close;
 #controller=new AbortController();
 #reads=new RetainedFileReads({errorPrefix:'PROJECT_PORTFOLIO_EXPORT',maxImmutableFileBytes:MAX_ARCHIVE_BYTES});
 constructor(config,{fetchImpl=globalThis.fetch}={}){this.#config=config;this.#fetch=fetchImpl;}
 get summary(){
  return {configured:Boolean(this.#config.projectPortfolioWorkspaces),...this.#reads.summary,
   workspaces:Object.entries(this.#config.projectPortfolioWorkspaces?.workspaces??{}).map(([workspace,value])=>({
    workspace,label:value.label,workspaceId:value.workspaceId,
    files:Object.entries(value.files).map(([file,entry])=>({file,label:entry.label,sha256:entry.sha256}))
   }))};
 }
 #definition(workspace){
  alias(workspace);const value=this.#config.projectPortfolioWorkspaces?.workspaces?.[workspace];
  need(value,'PROJECT_PORTFOLIO_WORKSPACE_NOT_CONFIGURED');return value;
 }
 async #using(workspace,requestId,work){
  const definition=this.#definition(workspace);
  if(requestId)identity(requestId);
  need(!this.#closing,'PROJECT_PORTFOLIO_MERCHANT_CLOSING');
  const client=new ProjectPortfolioClient({connectionFile:definition.connectionFile,
   expectedWorkspaceId:definition.workspaceId,fetchImpl:this.#fetch,signal:this.#controller.signal});
  this.#clients.set(client,{workspace,requestId});
  try{await client.ready();return await work(client,definition);}
  finally{try{await client.close();}finally{this.#clients.delete(client);}}
 }
 async #root(){
  const root=await privateDirectory(fullPath(this.#config.exportsDirectory));
  return privateDirectory(join(root,'project-portfolio'),{create:true});
 }
 async #manifest(exportId){
  identity(exportId);const directory=await privateDirectory(join(await this.#root(),exportId));
  const raw=await readRegular(join(directory,MANIFEST),1024*1024,{privateFile:true});
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  exact(manifest,['schema','exportId','workspace','workspaceId','kind','original','files'],
   ['schema','exportId','workspace','workspaceId','kind','original','files']);
  const {exportId:stored,...basis}=manifest;
  need(manifest.schema===PROJECT_PORTFOLIO_EXPORT_SCHEMA&&stored===exportId&&sha(Buffer.from(text(basis)))===exportId,
   'PROJECT_PORTFOLIO_EXPORT_MANIFEST_CHANGED');
  need(Array.isArray(manifest.files)&&manifest.files.length===1,'PROJECT_PORTFOLIO_EXPORT_FILES');
  for(const file of manifest.files){
   exact(file,['name','bytes','sha256','mediaType'],['name','bytes','sha256','mediaType']);
   need(['original.json','original.bin','workspace.zip'].includes(file.name)&&Number.isSafeInteger(file.bytes)&&
    file.bytes>=0&&file.bytes<=MAX_ARCHIVE_BYTES&&HASH.test(file.sha256),'PROJECT_PORTFOLIO_EXPORT_FILES');
  }
  return {manifest,raw,manifestSha256:sha(raw),directory};
 }
 #delivery(retained){
  return {...retained.manifest,manifestSha256:retained.manifestSha256,
   manifest:{name:MANIFEST,bytes:retained.raw.length,sha256:retained.manifestSha256,mediaType:'application/json'}};
 }
 async #retain(workspace,definition,kind,original,receive,{inline=false}={}){
  const root=await this.#root(),temporary=await privateDirectory(join(root,'.receive-'+randomUUID()),{create:true});
  const name=kind==='workspace'?'workspace.zip':kind==='json'?'original.json':'original.bin';
  try{
   const file=await receive(join(temporary,name));
   if(inline&&file.bytes<=INLINE){
    const raw=await readRegular(file.path,INLINE,{privateFile:true});
    need(sha(raw)===file.sha256,'PROJECT_PORTFOLIO_RESPONSE_CHANGED');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   }
   const basis={schema:PROJECT_PORTFOLIO_EXPORT_SCHEMA,workspace,workspaceId:definition.workspaceId,kind,original,
    files:[{name,bytes:file.bytes,sha256:file.sha256,
     mediaType:kind==='json'?'application/json':kind==='workspace'?'application/zip':'application/octet-stream'}]};
   const exportId=sha(Buffer.from(text(basis))),manifest={...basis,exportId};
   const directory=await privateDirectory(join(root,exportId),{create:true});
   try{await link(file.path,join(directory,name));}
   catch(error){
    if(error.code!=='EEXIST')throw error;
    const existing=await inspectProjectPortfolioFile(join(directory,name),{expectedSha256:file.sha256});
    need(existing.bytes===file.bytes,'PROJECT_PORTFOLIO_EXPORT_CHANGED');
   }
   await atomicJson(join(directory,MANIFEST),manifest,{immutable:true});
   const parent=await open(root,constants.O_RDONLY|constants.O_DIRECTORY);
   try{await parent.sync();}finally{await parent.close();}
   return this.#delivery(await this.#manifest(exportId));
  }finally{await rm(temporary,{recursive:true,force:true});}
 }
 async #json(workspace,requestId,path,options={}){
  return this.#using(workspace,requestId,(client,definition)=>this.#retain(workspace,definition,'json',
   {path,requestId:requestId??null,requestSha256:sha(Buffer.from(text({path,...options})))},
   output=>client.saveResponse(path,output,{...options,requestId}),{inline:true}));
 }
 async #execute(name,args){
  const method=name.slice(PREFIX.length);
  if(method==='workspaces')return this.summary;
  if(method==='cancel_wait'){
   this.#definition(args.workspace);identity(args.requestId);let cancelled=0;
   for(const [client,selected]of this.#clients)if(selected.workspace===args.workspace&&selected.requestId===args.requestId){
    cancelled++;await client.close();
   }
   return {workspace:args.workspace,requestId:args.requestId,cancelled};
  }
  if(method==='export_file_release'){
   identity(args.exportId);need(UUID.test(args.readId),'PROJECT_PORTFOLIO_READER');
   return this.#reads.release(args.exportId,args.readId);
  }
  if(method==='export_manifest'||method==='export_file'){
   const retained=await this.#manifest(args.exportId);
   if(method==='export_manifest')return this.#delivery(retained);
   need(identity(args.expectedManifestSha256)===retained.manifestSha256,'PROJECT_PORTFOLIO_EXPORT_MANIFEST_CHANGED');
   const selected=args.file??retained.manifest.files[0].name;
   const file=selected==='manifest'||selected===MANIFEST?
    {name:MANIFEST,bytes:retained.raw.length,sha256:retained.manifestSha256,mediaType:'application/json'}:
    retained.manifest.files.find(value=>value.name===selected);
   need(file&&identity(args.expectedSha256)===file.sha256,'PROJECT_PORTFOLIO_EXPORT_CHANGED');
   const result=await this.#reads.read({scope:args.exportId,key:file.name,kind:'project-portfolio-export',
    directory:retained.directory,expectedSha256:file.sha256,readId:args.readId,
    offset:args.offset??0,limit:args.limit??65536,load:async()=>{
     if(file.name===MANIFEST)return {bytes:retained.raw,name:MANIFEST,type:'application/json'};
     const handle=await open(join(retained.directory,file.name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
     try{
      const stat=await handle.stat();need(stat.isFile()&&stat.size===file.bytes&&!(stat.mode&0o077)&&
       (typeof process.getuid!=='function'||stat.uid===process.getuid()),'PROJECT_PORTFOLIO_EXPORT_CHANGED');
      return {readonlyFileHandle:handle,bytes:file.bytes,sha256:file.sha256,name:file.name,type:file.mediaType};
     }catch(error){await handle.close();throw error;}
    }});
   return {exportId:args.exportId,manifestSha256:retained.manifestSha256,...result};
  }
  this.#definition(args.workspace);
  if(method==='upload')return this.#using(args.workspace,null,(client,definition)=>{
   const file=definition.files[alias(args.file)];need(file,'PROJECT_PORTFOLIO_FILE_NOT_CONFIGURED');
   return client.uploadFile(file.path,{archive:args.archive??false,expectedSha256:file.sha256});
  });
  if(method==='download')return this.#using(args.workspace,args.requestId,(client,definition)=>{
   need(Boolean(args.sha256)!==Boolean(args.requestId),'PROJECT_PORTFOLIO_DOWNLOAD_SELECTION');
   return this.#retain(args.workspace,definition,args.requestId?'workspace':'blob',
    {sha256:args.sha256??null,requestId:args.requestId??null},
    output=>client.download({sha256:args.sha256,requestId:args.requestId,expectedSha256:args.expectedSha256,
     expectedBytes:args.expectedBytes,name:args.filename??'original.bin'},output));
  });
  if(method==='wait')return this.#using(args.workspace,args.requestId,async(client,definition)=>{
   const request=await client.waitRequest(args.requestId,{timeoutMs:args.timeoutMs??0,intervalMs:args.intervalMs??750,includeResult:false});
   // The saved request is read again through the full-byte response path so a large
   // completed native result never becomes a truncated tool projection.
   return this.#retain(args.workspace,definition,'json',{requestId:args.requestId,kind:request.kind},
    output=>client.saveResponse('/api/requests/'+args.requestId,output,{requestId:args.requestId}),{inline:true});
  });
  if(Object.hasOwn(PROJECT_PORTFOLIO_AGENT_ACTIONS,method)){
   return this.#json(args.workspace,args.requestId,'/api/actions',{method:'POST',
    body:{request_id:identity(args.requestId),kind:method,arguments:args.arguments}});
  }
  if(method==='resume')return this.#json(args.workspace,args.requestId,'/api/requests/'+identity(args.requestId)+'/resume',
   {method:'POST',body:{retry_failed:args.retryFailed===true}});
  if(method==='pause')return this.#json(args.workspace,args.requestId,'/api/deployments/'+identity(args.deploymentId)+'/pause',
   {method:'POST',body:{request_id:identity(args.requestId)}});
  if(method==='status')return this.#json(args.workspace,null,'/api/state',{query:{cursor:args.cursor,limit:args.limit}});
  if(method==='list')return this.#json(args.workspace,null,'/api/'+args.collection,{query:{cursor:args.cursor,limit:args.limit}});
  if(method==='read'){
   const routes={request:'requests',edition:'editions',source_review:'source-reviews',deployment:'deployments',object:'objects',cohort:'cohorts'};
   need(args.kind==='edition'||[args.family,args.offset,args.limit].every(value=>value===undefined),'PROJECT_PORTFOLIO_READ_FIELDS');
   return this.#json(args.workspace,null,'/api/'+routes[args.kind]+'/'+identity(args.id),
    {query:{family:args.family,offset:args.offset,limit:args.limit}});
  }
  if(method==='source_fields')return this.#json(args.workspace,null,'/api/source-field-catalogue',
   {query:{edition_id:args.editionId,family:args.family}});
  if(method==='companions')return this.#json(args.workspace,null,
   args.ordinal===undefined?'/api/companion-sources':'/api/companion-capture',
   {query:{edition_id:args.editionId,ordinal:args.ordinal,offset:args.offset,limit:args.limit}});
  if(method==='archive_fields')return this.#json(args.workspace,null,'/api/archive-fields',{query:{editions:args.editions}});
  if(method==='archive_table')return this.#json(args.workspace,null,'/api/archive-table',
   {query:{cohort_id:args.cohortId,publication_id:args.publicationId,table:args.table,offset:args.offset,limit:args.limit,
    filter_column:args.filterColumn,filter_text:args.filterText}});
  if(method==='archive_query')return this.#json(args.workspace,null,'/api/archive-query',
   {method:'POST',body:{cohort_id:args.cohortId,publication_id:args.publicationId,sql:args.sql,
    parameters:args.parameters??{},limit:args.limit??100}});
  need(false,'PROJECT_PORTFOLIO_TOOL');
 }
 call(name,args={}){
  need(!this.#closing,'PROJECT_PORTFOLIO_MERCHANT_CLOSING');
  const definition=defs.get(name);need(definition,'PROJECT_PORTFOLIO_TOOL');
  exact(args,Object.keys(definition.properties),definition.required);
  need(Buffer.byteLength(JSON.stringify(args))<=8*1024*1024,'PROJECT_PORTFOLIO_REQUEST_SIZE');
  for(const [name,value]of Object.entries(args))validate(value,definition.properties[name]);
  const pending=Promise.resolve().then(()=>this.#execute(name,args));this.#pending.add(pending);
  pending.then(()=>this.#pending.delete(pending),()=>this.#pending.delete(pending));return pending;
 }
 close(){
  if(this.#closed)return Promise.resolve();if(this.#close)return this.#close;
  this.#closing=true;this.#controller.abort(new Error('Project Portfolio merchant connection closed.'));
  this.#close=(async()=>{
   await Promise.allSettled([...this.#clients.keys()].map(client=>client.close()));
   await Promise.allSettled([...this.#pending]);await this.#reads.close();this.#closed=true;
  })().catch(error=>{this.#close=null;throw error;});
  return this.#close;
 }
}
