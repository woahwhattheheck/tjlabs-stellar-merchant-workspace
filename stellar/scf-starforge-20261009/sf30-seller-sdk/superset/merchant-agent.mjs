// MIT. Complete customer-agent operation of the original Superset workspace.
import {lstat,realpath} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve,relative,sep} from 'node:path';
import {supersetTools,SUPERSET_AGENT_ACTIONS,SUPERSET_VIEWS} from './catalog.mjs';
import {attachSupersetWorkspace,readSupersetRuntime,readPrivate,privateDirectory,supersetError,SUPERSET_MAX_FILE} from './operator-client.mjs';
import {RetainedFileReads,MAX_RETAINED_CHUNK_BYTES} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {exact,identifier,line,plain} from '../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
export {supersetTools} from './catalog.mjs';
export const SUPERSET_AGENT_CONNECTION_SCHEMA='stellar-forge.superset-agent-connection.v1';
const definitions=new Map(supersetTools((name,_description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
const OP=/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/,SHA=/^[a-f0-9]{64}$/,INSTANCE=/^[a-f0-9-]{36}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const checked=(value,pattern,label)=>{if(typeof value!=='string'||!pattern.test(value))throw supersetError('SUPERSET_INPUT','Choose the original '+label+'.');return value;};
const hostPath=(value,base)=>{if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))throw supersetError('SUPERSET_CONFIGURATION','Declare the complete original host path.');return isAbsolute(value)?resolve(value):resolve(base,value);};
const filePin=info=>({device:String(info.dev),inode:String(info.ino),bytes:String(info.size),modified:String(info.mtimeNs),changed:String(info.ctimeNs)});
async function files(value,base){
 if(value===undefined)return {};if(!plain(value)||Object.keys(value).length>256)throw supersetError('SUPERSET_CONFIGURATION','Declare up to 256 original file aliases.');
 const result=Object.create(null);
 for(const[alias,source]of Object.entries(value)){identifier(alias,'SUPERSET file alias');const path=hostPath(source,base),info=await lstat(path,{bigint:true});
  if(info.isSymbolicLink()||!info.isFile()||await realpath(path)!==path)throw supersetError('SUPERSET_CONFIGURATION','Select canonical original files.');
  result[alias]={path,identity:filePin(info)};
 }return result;
}
async function destinations(value,base,directory){
 if(value===undefined)return {};if(!plain(value)||Object.keys(value).length>64)throw supersetError('SUPERSET_CONFIGURATION','Declare up to 64 separate customer destinations.');
 const result=Object.create(null);
 for(const[alias,input]of Object.entries(value)){identifier(alias,'SUPERSET destination alias');const path=hostPath(input,base),parent=await privateDirectory(dirname(path)),nested=relative(directory,path);
  if(!nested||nested!=='..'&&!nested.startsWith('..'+sep)&&!isAbsolute(nested))throw supersetError('SUPERSET_DESTINATION','Select an independent destination outside the active original workspace.');
  try{await privateDirectory(path);}catch(error){if(error.code!=='ENOENT')throw error;}
  const info=await lstat(parent,{bigint:true});result[alias]={path,parent,identity:{device:String(info.dev),inode:String(info.ino)}};
 }return result;
}
export async function readSupersetConfiguration(path){
 path=resolve(path);const raw=JSON.parse((await readPrivate(path)).toString('utf8'));exact(raw,['schema','workspaces'],['schema','workspaces']);
 if(raw.schema!==SUPERSET_AGENT_CONNECTION_SCHEMA||!plain(raw.workspaces)||!Object.keys(raw.workspaces).length||Object.keys(raw.workspaces).length>32)throw supersetError('SUPERSET_CONFIGURATION','Declare between 1 and 32 original Superset workspace aliases.');
 const base=dirname(path),selected=Object.create(null),seen=new Set();
 for(const[alias,input]of Object.entries(raw.workspaces)){identifier(alias,'SUPERSET workspace alias');exact(input,['label','directory','workspaceDirectory','mode','runtimeFile','files','destinations'],['directory']);
  const directory=await privateDirectory(hostPath(input.directory,base)),mode=input.mode??'managed';
  if(seen.has(directory)||!['managed','owned'].includes(mode))throw supersetError('SUPERSET_CONFIGURATION','Select each original workspace once in managed or owned mode.');seen.add(directory);
  const workspaceDirectory=input.workspaceDirectory===undefined?undefined:await privateDirectory(hostPath(input.workspaceDirectory,base));
  const database=await lstat(join(workspaceDirectory??directory,'superset.sqlite3'));
  if(!database.isFile()||database.isSymbolicLink()||database.nlink!==1||database.mode&0o077)throw supersetError('SUPERSET_CONFIGURATION','Select an existing original private Superset project.');
  let runtimeFile,runtimeIdentity;
  if(input.runtimeFile!==undefined){if(mode!=='owned')throw supersetError('SUPERSET_CONFIGURATION','runtimeFile belongs to an owned original server; managed mode preserves its listener configuration.');
   const runtime=await readSupersetRuntime(hostPath(input.runtimeFile,base));runtimeFile=runtime.file;runtimeIdentity=runtime.identity;
  }
  selected[alias]={label:line(input.label??alias,'Superset workspace label'),directory,workspaceDirectory,mode,...(runtimeFile?{runtimeFile,runtimeIdentity}:{}),files:await files(input.files,base),destinations:await destinations(input.destinations,base,workspaceDirectory??directory)};

 }
 return {schema:SUPERSET_AGENT_CONNECTION_SCHEMA,workspaces:selected};
}
async function sourcePath(definition,alias){
 identifier(alias,'SUPERSET source file');const selected=definition.files[alias];if(!selected)throw supersetError('SUPERSET_SOURCE_NOT_CONFIGURED','Choose a configured complete source file.');
 const info=await lstat(selected.path,{bigint:true}),actual=filePin(info);
 if(info.isSymbolicLink()||!info.isFile()||await realpath(selected.path)!==selected.path||Object.keys(actual).some(key=>actual[key]!==selected.identity[key]))throw supersetError('SUPERSET_SOURCE_CHANGED','The configured source changed; reopen its current connection before a new import.');
 return selected.path;
}
async function destinationPath(definition,alias){
 identifier(alias,'SUPERSET destination');const value=definition.destinations[alias];if(!value)throw supersetError('SUPERSET_DESTINATION_NOT_CONFIGURED','Choose a configured separate receiving destination.');
 await privateDirectory(value.parent);const info=await lstat(value.parent,{bigint:true});
 if(String(info.dev)!==value.identity.device||String(info.ino)!==value.identity.inode)throw supersetError('SUPERSET_DESTINATION_CHANGED','The selected original receiving parent changed.');
 return value.path;
}
function queryFor(view,query={}){
 const definition=SUPERSET_VIEWS[view];if(!definition)throw supersetError('SUPERSET_VIEW','Choose an original operator view.');exact(query,definition.keys,definition.required);
 for(const[key,value]of Object.entries(query)){
  if(['offset','limit','queryOrdinal','page','pageSize','dashboardId'].includes(key)){if(!Number.isSafeInteger(value)||value<(key==='limit'||key==='pageSize'?1:0)||['limit','pageSize'].includes(key)&&value>250)throw supersetError('SUPERSET_PAGE','Choose the original page and supported size.');}
  else if(key==='query'){if(!plain(value))throw supersetError('SUPERSET_QUERY','Use the original query object.');}
  else if(typeof value!=='string'||!value||value.length>128)throw supersetError('SUPERSET_INPUT','Choose the original '+key+'.');
 }return query;
}
export class MerchantSupersetWorkspaces{
 #config;#environment;#entries=new Map();#opening=new Map();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'SUPERSET_AGENT_FILE',maxImmutableFileBytes:SUPERSET_MAX_FILE});
 constructor(config,{environment=process.env}={}){this.#config=config;this.#environment=environment;}
 get summary(){return {configured:Boolean(this.#config.supersetWorkspaces),...this.#reads.summary,workspaces:Object.entries(this.#config.supersetWorkspaces?.workspaces??{}).map(([workspace,value])=>({workspace,label:value.label,mode:value.mode,open:Boolean(this.#entries.get(workspace)?.admitted),cleanupPending:Boolean(this.#entries.get(workspace)&&!this.#entries.get(workspace).admitted),opening:this.#opening.has(workspace),closing:Boolean(this.#entries.get(workspace)?.closingRequested),instanceId:this.#entries.get(workspace)?.client.instanceId??null,files:Object.keys(value.files),destinations:Object.keys(value.destinations)}))};}
 #definition(alias){identifier(alias,'SUPERSET workspace');const value=this.#config.supersetWorkspaces?.workspaces[alias];if(!value)throw supersetError('SUPERSET_NOT_CONFIGURED','Choose an original configured workspace.');return value;}
 #entry(alias){this.#definition(alias);const value=this.#entries.get(alias);if(!value||!value.admitted||value.closingRequested)throw supersetError('SUPERSET_NOT_OPEN','Open the original current workspace attachment.');return value;}
 #scope(alias){return 'superset:'+alias+':'+this.#definition(alias).directory;}
 async #open(alias){
  const definition=this.#definition(alias);
  if(this.#opening.has(alias))return this.#opening.get(alias);
  if(this.#entries.has(alias)){const entry=this.#entry(alias);await entry.client.verify();return {workspace:alias,...entry.client.summary,native:await entry.client.view('state')};}
  const pending=(async()=>{let client,entry;try{
   await privateDirectory(this.#config.exportsDirectory);const exportDirectory=await privateDirectory(join(this.#config.exportsDirectory,'superset-'+alias),{create:true});
   client=await attachSupersetWorkspace({...definition,exportDirectory,environment:this.#environment});
   entry={alias,client,admitted:false,pending:new Set(),tail:Promise.resolve(),closing:null,closingRequested:false};
   this.#entries.set(alias,entry);
   if(this.#closing)throw supersetError('SUPERSET_CLOSING','The customer operator is closing.');
   const native=await client.view('state');if(native.schema!=='stellar-forge.superset-workspace.v1')throw supersetError('SUPERSET_SCHEMA','Open the original saved Superset workspace.');
   if(this.#closing||entry.closingRequested)throw supersetError('SUPERSET_CLOSING','The original customer attachment is closing.');
   entry.admitted=true;return {workspace:alias,...client.summary,native};
  }catch(error){
   if(!entry&&error.supersetCleanup){
    entry={alias,client:error.supersetCleanup,admitted:false,pending:new Set(),tail:Promise.resolve(),closing:null,closingRequested:true};
    this.#entries.set(alias,entry);
   }else if(entry){
    try{await this.#closeEntry(entry);}catch(secondary){error.cleanupFailure={code:secondary?.code??'SUPERSET_CLOSE_INCOMPLETE',message:secondary?.message??'Continue closing the original owned attachment.'};}
   }
   throw error;
  }})();this.#opening.set(alias,pending);try{return await pending;}finally{this.#opening.delete(alias);}
 }
 async #save(entry,args){
  const request=structuredClone(args.request);exact(request,['action','input'],['action','input']);
  if(!SUPERSET_AGENT_ACTIONS.includes(request.action)||!plain(request.input)||!Number.isSafeInteger(request.input.expectedRevision)||request.input.expectedRevision<0)throw supersetError('SUPERSET_REQUEST','Use the complete original action/input and current revision.');
  checked(request.input.operationId,OP,'operation ID');
  const definition=this.#definition(entry.alias),selected={};
  if(request.action==='receive-workspace'){
   if(request.input.file!==undefined||request.input.destination!==undefined)throw supersetError('SUPERSET_HOST_ALIAS','Choose the configured complete source and independent destination aliases.');
   const status=await entry.client.operation(request.input.operationId);
   if(status.saved&&status.operation&&['COMPLETED','QUEUED','RUNNING'].includes(status.operation.status))return entry.client.save(request,{sourceAlias:args.sourceFile,destinationAlias:args.destination});
   selected.sourceAlias=args.sourceFile;selected.destinationAlias=args.destination;
   selected.sourcePath=await sourcePath(definition,args.sourceFile);selected.destinationPath=await destinationPath(definition,args.destination);
  }else if(args.sourceFile!==undefined||args.destination!==undefined)throw supersetError('SUPERSET_HOST_ALIAS','File and destination aliases belong to complete project receiving.');
  return entry.client.save(request,selected);
 }
 async #resume(entry,id){return entry.client.resume(id);}
 #closeEntry(entry){
  entry.closingRequested=true;if(!entry.closing){
   entry.client.requestClose();const attempt=(async()=>{await Promise.allSettled([...entry.pending]);let value;try{await this.#reads.closeScope(this.#scope(entry.alias));}finally{value=await entry.client.close();}if(this.#entries.get(entry.alias)===entry)this.#entries.delete(entry.alias);return {workspace:entry.alias,...value};})();
   entry.closing=attempt;void attempt.catch(()=>{if(entry.closing===attempt)entry.closing=null;});
  }return entry.closing;
 }
 async #execute(entry,name,args){
  const {workspace,...value}=args,client=entry.client;
  switch(name){
   case 'merchant_superset_view':return {workspace,native:await client.view(value.view,queryFor(value.view,value.query))};
   case 'merchant_superset_save':return {workspace,native:await this.#save(entry,args)};
   case 'merchant_superset_operation':return {workspace,native:await client.operation(checked(value.operationId,OP,'operation ID'))};
   case 'merchant_superset_resume':return {workspace,native:await this.#resume(entry,checked(value.operationId,OP,'operation ID'))};
   case 'merchant_superset_cancel':return {workspace,native:await client.cancel(checked(value.operationId,OP,'operation ID'))};
   case 'merchant_superset_merchant':return {workspace,native:await client.merchant(value.action,checked(value.merchantId,OP,'merchant ID'))};
   case 'merchant_superset_export':{
    checked(value.exportId,OP,'export ID');exact(value.selection,['kind','id','recordKind','name','sha256','expectedRevision'],['kind']);
    if(!['workspace','capture','comparison','csv','lineage','record','response','delivery'].includes(value.selection.kind))throw supersetError('SUPERSET_EXPORT','Choose an original complete file kind.');
    if(value.selection.kind!=='workspace')checked(value.selection.id,OP,'original record ID');
    const result=await client.export(value.exportId,value.selection);return {workspace,exportId:result.exportId,workspaceId:result.workspaceId,file:result.metadata.file,selection:result.metadata.request.selection};
   }
   case 'merchant_superset_file_read':{
    checked(value.exportId,OP,'export ID');if(value.readId!==undefined)checked(value.readId,UUID,'read ID');if(value.expectedSha256!==undefined)checked(value.expectedSha256,SHA,'source SHA256');
    if(value.offset!==undefined&&(!Number.isSafeInteger(value.offset)||value.offset<0)||value.limit!==undefined&&(!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>MAX_RETAINED_CHUNK_BYTES))throw supersetError('SUPERSET_FILE_OFFSET','Choose the original byte offset and bounded chunk.');
    return {workspace,exportId:value.exportId,...await this.#reads.read({scope:this.#scope(workspace),key:value.exportId,kind:'superset-original-export',directory:this.#definition(workspace).directory,readId:value.readId,expectedSha256:value.expectedSha256,offset:value.offset,limit:value.limit,load:()=>client.retained(value.exportId)})};
   }
   case 'merchant_superset_file_release':await this.#reads.release(this.#scope(workspace),checked(value.readId,UUID,'read ID'));return {workspace,readId:value.readId,state:'RELEASED'};
   default:throw supersetError('TOOL_NOT_FOUND','Unknown original Superset tool.');
  }
 }
 async call(name,args={}){
  args=structuredClone(args);
  if(this.#closing&&name!=='merchant_superset_close')throw supersetError('SUPERSET_CLOSING','The original Superset operator is closing.');
  const def=definitions.get(name);if(!def)throw supersetError('TOOL_NOT_FOUND','Unknown original Superset tool.');exact(args,Object.keys(def.properties),def.required);
  if(name==='merchant_superset_workspaces')return this.summary;if(name==='merchant_superset_open')return this.#open(args.workspace);
  if(name==='merchant_superset_close'){this.#definition(args.workspace);const entry=this.#entries.get(args.workspace);if(!entry)throw supersetError('SUPERSET_NOT_OPEN','This original attachment is already closed.');if(entry.client.instanceId!==checked(args.instanceId,INSTANCE,'instance ID'))throw supersetError('SUPERSET_INSTANCE_CHANGED','Close only the exact current returned instance.');return this.#closeEntry(entry);}
  const entry=this.#entry(args.workspace),perform=()=>{if(entry.closingRequested)throw supersetError('SUPERSET_CLOSING','This original attachment is closing.');return this.#execute(entry,name,args);};
  const pending=name==='merchant_superset_cancel'?Promise.resolve().then(perform):entry.tail.then(perform);if(name!=='merchant_superset_cancel')entry.tail=pending.catch(()=>{});
  entry.pending.add(pending);try{return await pending;}finally{entry.pending.delete(pending);}
 }
 requestClose(){this.#closing=true;for(const entry of this.#entries.values()){entry.closingRequested=true;entry.client.requestClose();}}
 close(){if(!this.#close){this.requestClose();const attempt=(async()=>{await Promise.allSettled([...this.#opening.values()]);const results=await Promise.allSettled([...this.#entries.values()].map(entry=>this.#closeEntry(entry)));await this.#reads.close();if(results.some(x=>x.status==='rejected'))throw supersetError('SUPERSET_CLOSE_INCOMPLETE','Continue closing the original owned attachment.');})();this.#close=attempt;void attempt.catch(()=>{if(this.#close===attempt)this.#close=null;});}return this.#close;}
}
