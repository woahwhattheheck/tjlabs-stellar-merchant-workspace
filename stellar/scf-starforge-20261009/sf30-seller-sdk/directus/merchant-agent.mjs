// MIT. Complete customer-agent operation of the original Directus workspace.
import {lstat,realpath} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve,relative,sep} from 'node:path';
import {directusTools,DIRECTUS_AGENT_ACTIONS,DIRECTUS_VIEWS} from './catalog.mjs';
import {attachDirectusWorkspace,readDirectusRuntime,readPrivate,privateDirectory,directusError,DIRECTUS_MAX_FILE} from './operator-client.mjs';
import {RetainedFileReads,MAX_RETAINED_CHUNK_BYTES} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {exact,identifier,line,plain} from '../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
export {directusTools} from './catalog.mjs';
export const DIRECTUS_AGENT_CONNECTION_SCHEMA='stellar-forge.directus-agent-connection.v1';
const definitions=new Map(directusTools((name,_description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
const OP=/^[A-Za-z0-9_.:-]{8,128}$/,SHA=/^[a-f0-9]{64}$/,INSTANCE=OP;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const checked=(value,pattern,label)=>{if(typeof value!=='string'||!pattern.test(value))throw directusError('DIRECTUS_INPUT','Choose the original '+label+'.');return value;};
const hostPath=(value,base)=>{if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))throw directusError('DIRECTUS_CONFIGURATION','Declare the complete original host path.');return isAbsolute(value)?resolve(value):resolve(base,value);};
const filePin=info=>({device:String(info.dev),inode:String(info.ino),bytes:String(info.size),modified:String(info.mtimeNs),changed:String(info.ctimeNs)});
async function files(value,base){
 if(value===undefined)return {};if(!plain(value)||Object.keys(value).length>256)throw directusError('DIRECTUS_CONFIGURATION','Declare up to 256 original file aliases.');
 const result=Object.create(null);
 for(const[alias,source]of Object.entries(value)){identifier(alias,'DIRECTUS file alias');const path=hostPath(source,base),info=await lstat(path,{bigint:true});
  if(info.isSymbolicLink()||!info.isFile()||await realpath(path)!==path)throw directusError('DIRECTUS_CONFIGURATION','Select canonical original files.');
  result[alias]={path,identity:filePin(info)};
 }return result;
}
export async function readDirectusConfiguration(path){
 path=resolve(path);const raw=JSON.parse((await readPrivate(path)).toString('utf8'));exact(raw,['schema','workspaces'],['schema','workspaces']);
 if(raw.schema!==DIRECTUS_AGENT_CONNECTION_SCHEMA||!plain(raw.workspaces)||!Object.keys(raw.workspaces).length||Object.keys(raw.workspaces).length>32)throw directusError('DIRECTUS_CONFIGURATION','Declare between 1 and 32 original Directus operator aliases.');
 const base=dirname(path),selected=Object.create(null),seen=new Set();
 for(const[alias,input]of Object.entries(raw.workspaces)){
  identifier(alias,'Directus operator alias');exact(input,['label','directory','workspaceDirectory','projectKey','mode','files','connections','runtimes'],['directory']);
  const directory=await privateDirectory(hostPath(input.directory,base)),mode=input.mode??'managed';
  if(seen.has(directory)||!['managed','owned'].includes(mode))throw directusError('DIRECTUS_CONFIGURATION','Declare each original operator once.');seen.add(directory);
  if(mode==='managed'&&input.workspaceDirectory!==undefined)throw directusError('DIRECTUS_CONFIGURATION','workspaceDirectory belongs to owned startup.');
  const workspaceDirectory=input.workspaceDirectory===undefined?undefined:await privateDirectory(hostPath(input.workspaceDirectory,base));
  const registry=JSON.parse((await readPrivate(join(directory,'operator.json'))).toString('utf8')),projectKey=input.projectKey??registry.selected;
  if(registry.schema!=='stellar-forge.directus-operator.v1'||!Array.isArray(registry.projects)||!registry.projects.some(p=>p.key===projectKey))throw directusError('DIRECTUS_CONFIGURATION','Select an existing original operator registry and project.');
  for(const project of registry.projects){const root=await privateDirectory(project.directory),database=await lstat(join(root,'directus-datasets.sqlite3'));if(!database.isFile()||database.isSymbolicLink()||database.nlink!==1||database.mode&0o077)throw directusError('DIRECTUS_CONFIGURATION','Select the existing complete private project.');}
  const connections=Object.create(null),runtimes=Object.create(null);
  for(const[k,v]of Object.entries(input.connections??{})){identifier(k,'Directus connection alias');exact(v,['baseUrl','tokenEnv'],['baseUrl','tokenEnv']);const url=new URL(v.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v.tokenEnv))throw directusError('DIRECTUS_CONFIGURATION','Declare the original API URL and private host token environment name.');connections[k]={baseUrl:url.href.replace(/\/$/,''),tokenEnv:v.tokenEnv};}
  for(const[k,v]of Object.entries(input.runtimes??{})){identifier(k,'Directus merchant runtime alias');const value=await readDirectusRuntime(hostPath(v,base));runtimes[k]={file:value.file,identity:value.identity};}
  selected[alias]={label:line(input.label??alias,'Directus operator label'),directory,workspaceDirectory,projectKey:input.projectKey,mode,connections,runtimes,files:await files(input.files,base)};
 }
 return{schema:DIRECTUS_AGENT_CONNECTION_SCHEMA,workspaces:selected};
}

async function sourcePath(definition,alias){
 identifier(alias,'DIRECTUS source file');const selected=definition.files[alias];if(!selected)throw directusError('DIRECTUS_SOURCE_NOT_CONFIGURED','Choose a configured complete source file.');
 const info=await lstat(selected.path,{bigint:true}),actual=filePin(info);
 if(info.isSymbolicLink()||!info.isFile()||await realpath(selected.path)!==selected.path||Object.keys(actual).some(key=>actual[key]!==selected.identity[key]))throw directusError('DIRECTUS_SOURCE_CHANGED','The configured source changed; reopen its current connection before a new import.');
 return selected.path;
}
function queryFor(view,query={}){
 const definition=DIRECTUS_VIEWS[view];if(!definition)throw directusError('DIRECTUS_VIEW','Choose an original operator view.');exact(query,definition.keys,definition.required);
 for(const[key,value]of Object.entries(query)){
  if(['offset','limit','queryOrdinal','page','pageSize','dashboardId'].includes(key)){if(!Number.isSafeInteger(value)||value<(key==='limit'||key==='pageSize'?1:0)||['limit','pageSize'].includes(key)&&value>100)throw directusError('DIRECTUS_PAGE','Choose the original page and supported size.');}
  else if(key==='query'){if(!plain(value))throw directusError('DIRECTUS_QUERY','Use the original query object.');}
  else if(typeof value!=='string'||!value||value.length>128)throw directusError('DIRECTUS_INPUT','Choose the original '+key+'.');
 }return query;
}
export class MerchantDirectusWorkspaces{
 #config;#environment;#entries=new Map();#opening=new Map();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'DIRECTUS_AGENT_FILE',maxImmutableFileBytes:DIRECTUS_MAX_FILE});
 constructor(config,{environment=process.env}={}){this.#config=config;this.#environment=environment;}
 get summary(){return {configured:Boolean(this.#config.directusWorkspaces),...this.#reads.summary,workspaces:Object.entries(this.#config.directusWorkspaces?.workspaces??{}).map(([workspace,value])=>({workspace,label:value.label,mode:value.mode,open:Boolean(this.#entries.get(workspace)?.admitted),cleanupPending:Boolean(this.#entries.get(workspace)&&!this.#entries.get(workspace).admitted),opening:this.#opening.has(workspace),closing:Boolean(this.#entries.get(workspace)?.closingRequested),instanceId:this.#entries.get(workspace)?.client.instanceId??null,files:Object.keys(value.files),connections:Object.keys(value.connections),runtimes:Object.keys(value.runtimes)}))};}
 #definition(alias){identifier(alias,'DIRECTUS workspace');const value=this.#config.directusWorkspaces?.workspaces[alias];if(!value)throw directusError('DIRECTUS_NOT_CONFIGURED','Choose an original configured workspace.');return value;}
 #entry(alias){this.#definition(alias);const value=this.#entries.get(alias);if(!value||!value.admitted||value.closingRequested)throw directusError('DIRECTUS_NOT_OPEN','Open the original current workspace attachment.');return value;}
 #scope(alias){const entry=this.#entries.get(alias);return 'directus:'+alias+':'+this.#definition(alias).directory+':'+(entry?.client.summary.projectKey??'')+':'+(entry?.client.workspaceId??'');}
 async #open(alias){
  const definition=this.#definition(alias);
  if(this.#opening.has(alias))return this.#opening.get(alias);
  if(this.#entries.has(alias)){const entry=this.#entry(alias);await entry.client.verify();return {workspace:alias,...entry.client.summary,native:await entry.client.view('state')};}
  const pending=(async()=>{let client,entry;try{
   await privateDirectory(this.#config.exportsDirectory);const exportDirectory=await privateDirectory(join(this.#config.exportsDirectory,'directus-'+alias),{create:true});
   client=await attachDirectusWorkspace({...definition,exportDirectory,environment:this.#environment});
   entry={alias,client,admitted:false,pending:new Set(),readScopes:new Set(),tail:Promise.resolve(),closing:null,closingRequested:false};
   this.#entries.set(alias,entry);
   if(this.#closing)throw directusError('DIRECTUS_CLOSING','The customer operator is closing.');
   const native=await client.view('state');if(native.schema!=='stellar-forge.directus-workspace.v1')throw directusError('DIRECTUS_SCHEMA','Open the original saved Directus workspace.');
   if(this.#closing||entry.closingRequested)throw directusError('DIRECTUS_CLOSING','The original customer attachment is closing.');
   entry.admitted=true;return {workspace:alias,...client.summary,native};
  }catch(error){
   if(!entry&&error.directusCleanup){
    entry={alias,client:error.directusCleanup,admitted:false,pending:new Set(),readScopes:new Set(),tail:Promise.resolve(),closing:null,closingRequested:true};
    this.#entries.set(alias,entry);
   }else if(entry){
    try{await this.#closeEntry(entry);}catch(secondary){error.cleanupFailure={code:secondary?.code??'DIRECTUS_CLOSE_INCOMPLETE',message:secondary?.message??'Continue closing the original owned attachment.'};}
   }
   throw error;
  }})();this.#opening.set(alias,pending);try{return await pending;}finally{this.#opening.delete(alias);}
 }
 async #save(entry,args){
  const request=structuredClone(args.request);exact(request,['action','input'],['action','input']);
  if(!DIRECTUS_AGENT_ACTIONS.includes(request.action)||!plain(request.input))throw directusError('DIRECTUS_REQUEST','Choose the complete original customer action/input.');
  checked(request.input.operationId,OP,'operation ID');const options={};
  if(request.action==='import-source'){
   options.sourceAlias=args.sourceFile;
   const status=await entry.client.operation(request.input.operationId);
   if(!status||!['complete','running'].includes(status.state))options.sourcePath=await sourcePath(this.#definition(entry.alias),args.sourceFile);
  }else if(args.sourceFile!==undefined)throw directusError('DIRECTUS_HOST_ALIAS','Use sourceFile only for original captured-source import.');
  return entry.client.save(request,options);
 }
 async #resume(entry,id){return entry.client.resume(id);}
 #closeEntry(entry){
  entry.closingRequested=true;if(!entry.closing){
   entry.client.requestClose();const attempt=(async()=>{await Promise.allSettled([...entry.pending]);let value;try{for(const scope of entry.readScopes)await this.#reads.closeScope(scope);}finally{value=await entry.client.close();}if(this.#entries.get(entry.alias)===entry)this.#entries.delete(entry.alias);return {workspace:entry.alias,...value};})();
   entry.closing=attempt;void attempt.catch(()=>{if(entry.closing===attempt)entry.closing=null;});
  }return entry.closing;
 }
 async #execute(entry,name,args){
  const {workspace,...value}=args,client=entry.client;
  switch(name){
   case 'merchant_directus_view':return {workspace,native:await client.view(value.view,queryFor(value.view,value.query))};
   case 'merchant_directus_save':return {workspace,native:await this.#save(entry,args)};
   case 'merchant_directus_operation':return {workspace,native:await client.operation(checked(value.operationId,OP,'operation ID'))};
   case 'merchant_directus_resume':return {workspace,native:await this.#resume(entry,checked(value.operationId,OP,'operation ID'))};
   case 'merchant_directus_cancel':return {workspace,native:await client.cancel(checked(value.operationId,OP,'operation ID'))};
   case 'merchant_directus_merchant':{
    let runtime;if(value.runtime!==undefined){const selected=this.#definition(workspace).runtimes[value.runtime];if(!selected)throw directusError('DIRECTUS_RUNTIME','Choose the configured original private runtime alias.');const current=await readDirectusRuntime(selected.file);if(JSON.stringify(current.identity)!==JSON.stringify(selected.identity))throw directusError('DIRECTUS_RUNTIME_CHANGED','The configured runtime changed; reopen its current connection.');runtime=current.merchantRuntime;}
    return{workspace,native:await client.merchant(value.action,checked(value.merchantId,OP,'merchant ID'),runtime)};
   }
   case 'merchant_directus_project':{for(const scope of entry.readScopes)await this.#reads.closeScope(scope);entry.readScopes.clear();return{workspace,native:await client.selectProject(value.projectKey)};}
   case 'merchant_directus_connection':{const selected=this.#definition(workspace).connections[value.connection];if(!selected)throw directusError('DIRECTUS_CONNECTION','Choose the configured original API alias.');const token=this.#environment[selected.tokenEnv];if(typeof token!=='string'||!token)throw directusError('DIRECTUS_CONNECTION','The original host token environment is not configured.');return{workspace,native:await client.connection({baseUrl:selected.baseUrl,token})};}
   case 'merchant_directus_receive':{for(const scope of entry.readScopes)await this.#reads.closeScope(scope);entry.readScopes.clear();return{workspace,native:await client.receive(checked(value.operationId,OP,'receiving ID'),()=>sourcePath(this.#definition(workspace),value.sourceFile),{sourceAlias:value.sourceFile})};}
   case 'merchant_directus_export':{
    checked(value.exportId,OP,'export ID');exact(value.selection,['kind','id','recordKind','name','sha256','expectedRevision'],['kind']);
    if(!['project','source','dataset','config','comparison','buyer-config','record','native-response','delivery'].includes(value.selection.kind))throw directusError('DIRECTUS_EXPORT','Choose an original complete file kind.');
    if(value.selection.kind!=='project')checked(value.selection.id,OP,'original record ID');
    const result=await client.export(value.exportId,value.selection);return {workspace,exportId:result.exportId,workspaceId:result.workspaceId,file:result.metadata.file,selection:result.metadata.request.selection};
   }
   case 'merchant_directus_file_read':{
    checked(value.exportId,OP,'export ID');if(value.readId!==undefined)checked(value.readId,UUID,'read ID');if(value.expectedSha256!==undefined)checked(value.expectedSha256,SHA,'source SHA256');
    if(value.offset!==undefined&&(!Number.isSafeInteger(value.offset)||value.offset<0)||value.limit!==undefined&&(!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>MAX_RETAINED_CHUNK_BYTES))throw directusError('DIRECTUS_FILE_OFFSET','Choose the original byte offset and bounded chunk.');
    const scope=this.#scope(workspace);entry.readScopes.add(scope);
    return {workspace,exportId:value.exportId,...await this.#reads.read({scope,key:value.exportId,kind:'directus-original-export',directory:this.#definition(workspace).directory,readId:value.readId,expectedSha256:value.expectedSha256,offset:value.offset,limit:value.limit,load:()=>client.retained(value.exportId)})};
   }
   case 'merchant_directus_file_release':await this.#reads.release(this.#scope(workspace),checked(value.readId,UUID,'read ID'));return {workspace,readId:value.readId,state:'RELEASED'};
   default:throw directusError('TOOL_NOT_FOUND','Unknown original Directus tool.');
  }
 }
 async call(name,args={}){
  args=structuredClone(args);
  if(this.#closing&&name!=='merchant_directus_close')throw directusError('DIRECTUS_CLOSING','The original Directus operator is closing.');
  const def=definitions.get(name);if(!def)throw directusError('TOOL_NOT_FOUND','Unknown original Directus tool.');exact(args,Object.keys(def.properties),def.required);
  if(name==='merchant_directus_workspaces')return this.summary;if(name==='merchant_directus_open')return this.#open(args.workspace);
  if(name==='merchant_directus_close'){this.#definition(args.workspace);const entry=this.#entries.get(args.workspace);if(!entry)throw directusError('DIRECTUS_NOT_OPEN','This original attachment is already closed.');if(entry.client.instanceId!==checked(args.instanceId,INSTANCE,'instance ID'))throw directusError('DIRECTUS_INSTANCE_CHANGED','Close only the exact current returned instance.');return this.#closeEntry(entry);}
  const entry=this.#entry(args.workspace),perform=()=>{if(entry.closingRequested)throw directusError('DIRECTUS_CLOSING','This original attachment is closing.');return this.#execute(entry,name,args);};
  const pending=name==='merchant_directus_cancel'?Promise.resolve().then(perform):entry.tail.then(perform);if(name!=='merchant_directus_cancel')entry.tail=pending.catch(()=>{});
  entry.pending.add(pending);try{return await pending;}finally{entry.pending.delete(pending);}
 }
 requestClose(){this.#closing=true;for(const entry of this.#entries.values()){entry.closingRequested=true;entry.client.requestClose();}}
 close(){if(!this.#close){this.requestClose();const attempt=(async()=>{await Promise.allSettled([...this.#opening.values()]);const results=await Promise.allSettled([...this.#entries.values()].map(entry=>this.#closeEntry(entry)));await this.#reads.close();if(results.some(x=>x.status==='rejected'))throw directusError('DIRECTUS_CLOSE_INCOMPLETE','Continue closing the original owned attachment.');})();this.#close=attempt;void attempt.catch(()=>{if(this.#close===attempt)this.#close=null;});}return this.#close;}
}
