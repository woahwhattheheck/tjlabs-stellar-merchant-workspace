// MIT. Customer-agent operation of the same original TIND workspace.
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tindWorkspaceTools, APPLY_KINDS, VIEW_ROUTES, DOWNLOAD_QUERIES } from './catalog.mjs';
import { attachTindWorkspace, bindTindSource, readPrivate, privateDirectory, tindError, MAX_TIND_PACKAGE_BYTES } from './client.mjs';
import { RetainedFileReads, MAX_RETAINED_CHUNK_BYTES } from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { exact, identifier, line, plain } from '../../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
export { tindWorkspaceTools } from './catalog.mjs';
export const TIND_WORKSPACE_CONNECTION_SCHEMA='stellar-forge.tind-workspace-connection.v1';
const definitions=new Map(tindWorkspaceTools((name,_description,properties,required)=>({name,properties,required})).map(row=>[row.name,row]));
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OPERATION=/^[A-Za-z0-9._:-]{1,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const hostPath=(value,base)=>{
 if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))throw tindError('TIND_CONFIGURATION','Declare the original host path.');
 return isAbsolute(value)?resolve(value):resolve(base,value);
};
function checked(value,pattern,label){
 if(typeof value!=='string'||!pattern.test(value))throw tindError('TIND_INVALID_INPUT','Select the original '+label+'.');
 return value;
}
function text(value,label){
 if(typeof value!=='string'||!value||value.length>8192||/[\x00-\x1f\x7f]/.test(value))
  throw tindError('TIND_INVALID_INPUT','Select the original '+label+'.');
 return value;
}
function fingerprint(info){return {dev:String(info.dev),ino:String(info.ino),size:String(info.size),mtime:String(info.mtimeNs??info.mtimeMs)};}
async function configuredPaths(value,base,kind){
 if(value===undefined)return {};
 if(!plain(value)||Object.keys(value).length>256)throw tindError('TIND_CONFIGURATION','Use at most 256 selected original host aliases.');
 const result=Object.create(null);
 for(const [alias,source] of Object.entries(value)){
  identifier(alias,'TIND source alias');
  const path=hostPath(source,base),info=await lstat(path,{bigint:true});
  if(info.isSymbolicLink()||await realpath(path)!==path||!(kind==='file'?info.isFile():info.isDirectory()))
   throw tindError('TIND_CONFIGURATION','Choose a canonical original '+kind+' for each configured alias.');
  result[alias]={path,identity:fingerprint(info)};
 }
 return result;
}
export async function readTindWorkspaceConfiguration(path){
 path=resolve(path);let raw;
 try{raw=JSON.parse((await readPrivate(path)).toString('utf8'));}catch(error){if(error.code)throw error;throw tindError('TIND_CONFIGURATION','Use the complete original TIND connection JSON.');}
 exact(raw,['schema','workspaces'],['schema','workspaces']);
 if(raw.schema!==TIND_WORKSPACE_CONNECTION_SCHEMA||!plain(raw.workspaces)||!Object.keys(raw.workspaces).length||Object.keys(raw.workspaces).length>32)
  throw tindError('TIND_CONFIGURATION','Declare between 1 and 32 original TIND workspace aliases.');
 const base=dirname(path),seen=new Set(),workspaces=Object.create(null);
 for(const [alias,input]of Object.entries(raw.workspaces)){
  identifier(alias,'TIND workspace alias');
  exact(input,['label','directory','mode','pythonExecutable','files','directories','authorizationEnvironments'],['directory']);
  const directory=await privateDirectory(hostPath(input.directory,base)),mode=input.mode??'managed';
  if(seen.has(directory)||!['managed','owned'].includes(mode))throw tindError('TIND_CONFIGURATION','Select each original directory through one alias and managed or owned mode.');
  seen.add(directory);
  // Both modes open an existing original source project. Source acquisition and
  // whole handover receive remain the original TIND/OAI customer journey.
  let marker;try{marker=JSON.parse((await readPrivate(join(directory,'workspace.json'))).toString('utf8'));}catch(error){if(error.code)throw error;throw tindError('TIND_CONFIGURATION','Use an existing original OAI workspace.');}
  if(!plain(marker))throw tindError('TIND_CONFIGURATION','Use the existing original workspace identity.');
  let pythonExecutable;
  if(mode==='owned'){
   pythonExecutable=hostPath(input.pythonExecutable,base);
   const info=await lstat(pythonExecutable);
   if(!info.isFile()&&!info.isSymbolicLink())throw tindError('TIND_CONFIGURATION','Select the original Python executable.');
  }else if(input.pythonExecutable!==undefined)throw tindError('TIND_CONFIGURATION','Managed mode uses the exact Applications-owned Python listener.');
  const authorizationEnvironments=input.authorizationEnvironments??[];
  if(!Array.isArray(authorizationEnvironments)||authorizationEnvironments.length>64||
   authorizationEnvironments.some(name=>typeof name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name))||
   new Set(authorizationEnvironments).size!==authorizationEnvironments.length)
   throw tindError('TIND_CONFIGURATION','List the exact original authorization environment names.');
  workspaces[alias]={label:line(input.label??alias,'TIND workspace label'),directory,mode,pythonExecutable,
   files:await configuredPaths(input.files,base,'file'),directories:await configuredPaths(input.directories,base,'directory'),authorizationEnvironments};
 }
 return {schema:TIND_WORKSPACE_CONNECTION_SCHEMA,workspaces};
}
function queryFor(value,definition){
 const query=value??{};exact(query,definition.allowed,definition.required);
 for(const [key,item]of Object.entries(query)){
  if(key==='offset'||key==='limit'){
   if(!Number.isSafeInteger(item)||item<(key==='limit'?1:0)||key==='limit'&&item>500)throw tindError('TIND_INVALID_INPUT','Use the original page offset and a limit from 1 to 500.');
  }else if(key==='files'){
   if(typeof item!=='boolean')throw tindError('TIND_INVALID_INPUT','Choose whether the complete handover includes original files.');
  }else if(key==='query'&&item==='')continue;
  else text(item,key);
 }
 return query;
}
function authorizeNames(value,definition){
 if(Array.isArray(value)){for(const item of value)authorizeNames(item,definition);return;}
 if(!plain(value))return;
 for(const [key,item]of Object.entries(value)){
  if(key==='authorizationEnvironment'&&item!==null&&item!==undefined&&
   !definition.authorizationEnvironments.includes(item))throw tindError('TIND_AUTHORIZATION_NOT_CONFIGURED','Choose an authorization environment declared for this original workspace.');
  authorizeNames(item,definition);
 }
}
async function selectedPath(definition,alias,kind){
 identifier(alias,'TIND host source alias');
 const selected=(kind==='file'?definition.files:definition.directories)[alias];
 if(!selected)throw tindError('TIND_SOURCE_NOT_CONFIGURED','Choose the configured original '+kind+' alias.');
 const info=await lstat(selected.path,{bigint:true}),current=fingerprint(info);
 if(info.isSymbolicLink()||await realpath(selected.path)!==selected.path||
  !(kind==='file'?info.isFile():info.isDirectory())||
  current.dev!==selected.identity.dev||current.ino!==selected.identity.ino||
  kind==='file'&&(current.size!==selected.identity.size||current.mtime!==selected.identity.mtime))
  throw tindError('TIND_CONFIGURED_SOURCE_CHANGED','The configured original source changed; reload its current connection before receiving it.');
 return selected.path;
}
function visibleExport(value){const {filename,...result}=value;return result;}
export class MerchantTindWorkspaces {
 #config;#environment;#entries=new Map();#opening=new Map();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'TIND_FILE',maxImmutableFileBytes:MAX_TIND_PACKAGE_BYTES});
 constructor(config,{environment=process.env}={}){this.#config=config;this.#environment=environment;}
 get summary(){
  return {configured:Boolean(this.#config.tindWorkspaces),...this.#reads.summary,
   workspaces:Object.entries(this.#config.tindWorkspaces?.workspaces??{}).map(([workspace,definition])=>{
    const entry=this.#entries.get(workspace);
    return {workspace,label:definition.label,mode:definition.mode,open:Boolean(entry),opening:this.#opening.has(workspace),
     closing:Boolean(entry?.closingRequested),instanceId:entry?.client.instanceId??null,
     origin:entry?.client.summary.origin??null,files:Object.keys(definition.files),directories:Object.keys(definition.directories),
     authorizationEnvironments:[...definition.authorizationEnvironments]};
   })};
 }
 #definition(alias){
  identifier(alias,'TIND workspace alias');const definition=this.#config.tindWorkspaces?.workspaces[alias];
  if(!definition)throw tindError('TIND_WORKSPACE_NOT_CONFIGURED','Choose an alias from merchant_tind_workspaces.');
  return definition;
 }
 #entry(alias){
  this.#definition(alias);const entry=this.#entries.get(alias);
  if(!entry)throw tindError('TIND_WORKSPACE_NOT_OPEN','Open the original workspace first.');
  if(entry.closingRequested)throw tindError('TIND_CLOSING','This exact attachment is closing.');
  return entry;
 }
 #scope(alias){return 'tind:'+alias+':'+this.#definition(alias).directory;}
 async #open(alias){
  const definition=this.#definition(alias);
  if(this.#entries.has(alias)){
   const entry=this.#entry(alias);await entry.client.verify();
   return {workspace:alias,...entry.client.summary,native:await entry.client.get('/api/state')};
  }
  if(this.#opening.has(alias))return this.#opening.get(alias);
  const pending=(async()=>{
   let client;
   try{
    await privateDirectory(this.#config.exportsDirectory);
    const exportDirectory=await privateDirectory(join(this.#config.exportsDirectory,'tind-'+alias),{create:true});
    client=await attachTindWorkspace({...definition,exportDirectory,environment:this.#environment});
    if(this.#closing)throw tindError('TIND_CLOSING','The customer operator is closing.');
    const native=await client.get('/api/state');
    if(native.schema!=='stellar-forge.tind-migration.v1')throw tindError('TIND_SCHEMA_CHANGED','Open the maintained original TIND migration product.');
    const entry={alias,client,pending:new Set(),tail:Promise.resolve(),closing:null,closingRequested:false};this.#entries.set(alias,entry);
    return {workspace:alias,...client.summary,native};
   }catch(error){await client?.close();throw error;}
  })();
  this.#opening.set(alias,pending);
  try{return await pending;}finally{this.#opening.delete(alias);}
 }
 async #request(entry,args,native=false){
  const request=structuredClone(args.request),definition=this.#definition(entry.alias);
  exact(request,native?['operationId','task','projectId','expectedRevision','input']:['operationId','kind','projectId','expectedRevision','input'],
   native?['operationId','task','projectId','expectedRevision','input']:['operationId','kind','projectId','expectedRevision','input']);
  checked(request.operationId,OPERATION,'stable operation ID');
  if(!plain(request.input))throw tindError('TIND_INVALID_INPUT','Supply the complete original operation input.');
  if(native?!['search','send','source-download','job-read'].includes(request.task):!APPLY_KINDS.includes(request.kind))
   throw tindError('TIND_INVALID_INPUT','Choose the maintained original operation.');
  if(!native&&request.kind==='create'){
   if(request.projectId!==null||request.expectedRevision!==null)throw tindError('TIND_INVALID_INPUT','Create starts without an existing project or revision.');
  }else{
   text(request.projectId,'project');
   if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0)throw tindError('TIND_INVALID_INPUT','Use the actual current project revision.');
  }
  authorizeNames(request.input,definition);
  if(!native){
   const fileKind=['destination-file','source-download-import'].includes(request.kind);
   const directoryKind=request.kind==='file-root';
   if(fileKind||directoryKind){
    if(request.input.path!==undefined)throw tindError('TIND_HOST_ALIAS_REQUIRED','Select the configured host alias instead of a path.');
    if(fileKind){if(args.fileDirectory!==undefined)throw tindError('TIND_INVALID_INPUT','This operation selects a file alias.');request.input.path=await selectedPath(definition,args.sourceFile,'file');}
    else{if(args.sourceFile!==undefined)throw tindError('TIND_INVALID_INPUT','This operation selects a directory alias.');request.input.path=await selectedPath(definition,args.fileDirectory,'directory');}
    request.input.sourceBinding=await bindTindSource(request.input.path,directoryKind?'directory':'file',directoryKind?args.fileDirectory:args.sourceFile);
   }else if(args.sourceFile!==undefined||args.fileDirectory!==undefined)throw tindError('TIND_INVALID_INPUT','Host aliases belong to the original file receiving operations.');
  }
  return native?entry.client.native(request):entry.client.apply(request);
 }
 #closeEntry(entry){
  entry.closingRequested=true;
  if(!entry.closing){
   entry.client.requestClose();
   const attempt=(async()=>{
    await Promise.allSettled([...entry.pending]);
    let native;
    try{await this.#reads.closeScope(this.#scope(entry.alias));}
    finally{native=await entry.client.close();}
    if(this.#entries.get(entry.alias)===entry)this.#entries.delete(entry.alias);
    return {workspace:entry.alias,...native};
   })();
   entry.closing=attempt;
   void attempt.catch(()=>{if(entry.closing===attempt)entry.closing=null;});
  }
  return entry.closing;
 }
 async #resume(entry,input){
  const status=await entry.client.operation(input),saved=status.saved;
  if(saved&&input.kind==='apply'&&!status.observed.found&&saved.status!=='returned'&&
     ['destination-file','source-download-import','file-root'].includes(saved.request.kind)){
   const definition=this.#definition(entry.alias),value=saved.request.input;
   const kind=saved.request.kind==='file-root'?'directory':'file';
   const aliases=kind==='file'?definition.files:definition.directories;
   const alias=value.sourceBinding?.alias??Object.keys(aliases).find(key=>aliases[key].path===value.path);
   const path=await selectedPath(definition,alias,kind),current=await bindTindSource(path,kind,alias);
   const expected=value.sourceBinding;
   if(!expected||path!==value.path||Object.keys(current).some(key=>key!=='alias'&&current[key]!==expected[key]))
    throw tindError('TIND_SOURCE_CHANGED','Resume requires the exact configured original input identity and bytes.');
  }
  if(saved&&!status.observed.found)authorizeNames(saved.request.input,this.#definition(entry.alias));
  return entry.client.resume(input);
 }
 async #execute(entry,name,args){
  const {workspace,...input}=args,client=entry.client;
  switch(name){
   case 'merchant_tind_view':{
    const definition=VIEW_ROUTES[input.view];if(!definition)throw tindError('TIND_INVALID_INPUT','Choose the original workspace view.');
    return {workspace,native:await client.get(definition.path,queryFor(input.query,definition))};
   }
   case 'merchant_tind_save':return {workspace,native:await this.#request(entry,args)};
   case 'merchant_tind_preview':
    if(!['source-case','destination-job'].includes(input.kind)||!plain(input.input))throw tindError('TIND_INVALID_INPUT','Select the complete original review.');
    return {workspace,native:await client.preview(input.kind,input.input)};
   case 'merchant_tind_native_start':return {workspace,native:await this.#request(entry,args,true)};
   case 'merchant_tind_operation':
    if(!['apply','native'].includes(input.kind))throw tindError('TIND_INVALID_INPUT','Choose apply or native.');
    return {workspace,native:await client.operation(input)};
   case 'merchant_tind_resume':
    if(!['apply','native'].includes(input.kind))throw tindError('TIND_INVALID_INPUT','Choose apply or native.');
    return {workspace,native:await this.#resume(entry,input)};
   case 'merchant_tind_source_pause':return {workspace,native:await client.pause(text(input.projectId,'project'),text(input.acquisitionId,'acquisition'))};
   case 'merchant_tind_export':{
    const definition=DOWNLOAD_QUERIES[input.kind];if(!definition)throw tindError('TIND_INVALID_INPUT','Choose the complete original file kind.');
    return {workspace,...visibleExport(await client.download({...input,query:queryFor(input.query,definition)}))};
   }
   case 'merchant_tind_file_read':{
    checked(input.exportId,OPERATION,'export ID');
    if(input.readId!==undefined)checked(input.readId,UUID,'file read');
    if(input.expectedSha256!==undefined)checked(input.expectedSha256,SHA,'original file SHA-256');
    if(input.offset!==undefined&&(!Number.isSafeInteger(input.offset)||input.offset<0)||
       input.limit!==undefined&&(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>MAX_RETAINED_CHUNK_BYTES))
     throw tindError('TIND_INVALID_INPUT','Choose a valid original file offset and bounded chunk length.');
    return {workspace,exportId:input.exportId,...await this.#reads.read({scope:this.#scope(workspace),key:input.exportId,kind:'tind-original-export',
     directory:this.#definition(workspace).directory,readId:input.readId,expectedSha256:input.expectedSha256,offset:input.offset,limit:input.limit,
     load:()=>client.retained(input.exportId)})};
   }
   case 'merchant_tind_file_release':
    await this.#reads.release(this.#scope(workspace),checked(input.readId,UUID,'file read'));
    return {workspace,readId:input.readId,state:'RELEASED'};
   default:throw tindError('TOOL_NOT_FOUND','Unknown original TIND tool.');
  }
 }
 async call(name,args={}){
  if(this.#closing&&name!=='merchant_tind_close')throw tindError('TIND_CLOSING','The original customer operator is closing.');
  const definition=definitions.get(name);if(!definition)throw tindError('TOOL_NOT_FOUND','Unknown original TIND tool.');
  exact(args,Object.keys(definition.properties),definition.required);
  if(name==='merchant_tind_workspaces')return this.summary;
  if(name==='merchant_tind_open')return this.#open(args.workspace);
  if(name==='merchant_tind_close'){
   this.#definition(args.workspace);const entry=this.#entries.get(args.workspace);
   if(!entry)throw tindError('TIND_WORKSPACE_NOT_OPEN','The selected original attachment is already closed.');
   if(entry.client.instanceId!==checked(args.instanceId,UUID,'live instance'))throw tindError('TIND_INSTANCE_CHANGED','Close only the current original returned instance.');
   return this.#closeEntry(entry);
  }
  const entry=this.#entry(args.workspace);
  const perform=()=>{if(entry.closingRequested)throw tindError('TIND_CLOSING','This exact attachment is closing.');return this.#execute(entry,name,args);};
  const pending=name==='merchant_tind_source_pause'?Promise.resolve().then(perform):entry.tail.then(perform);
  if(name!=='merchant_tind_source_pause')entry.tail=pending.catch(()=>{});
  entry.pending.add(pending);
  try{return await pending;}finally{entry.pending.delete(pending);}
 }
 requestClose(){
  this.#closing=true;
  for(const entry of this.#entries.values()){entry.closingRequested=true;entry.client.requestClose();}
 }
 close(){
  if(!this.#close){
   this.requestClose();
   const attempt=(async()=>{
    await Promise.allSettled([...this.#opening.values()]);
    const results=await Promise.allSettled([...this.#entries.values()].map(entry=>this.#closeEntry(entry)));
    await this.#reads.close();
    if(results.some(result=>result.status==='rejected'))throw tindError('TIND_CLOSE_INCOMPLETE','An original TIND attachment still requires its close continuation.');
   })();
   this.#close=attempt;
   void attempt.catch(()=>{if(this.#close===attempt)this.#close=null;});
  }
  return this.#close;
 }
}
