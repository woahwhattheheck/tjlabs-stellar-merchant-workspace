// MIT. Complete customer-agent operation of the original BLS analyst workspace.
import {lstat,realpath} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve,relative,sep} from 'node:path';
import {blsAnalystTools,OPERATION_KINDS,VIEW_QUERIES} from './catalog.mjs';
import {attachBlsAnalystWorkspace,readPrivate,privateDirectory,blsError,MAX_BLS_PACKAGE_BYTES} from './agent-client.mjs';
import {RetainedFileReads,MAX_RETAINED_CHUNK_BYTES} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {exact,identifier,line,plain} from '../../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
export {blsAnalystTools} from './catalog.mjs';
export const BLS_ANALYST_CONNECTION_SCHEMA='stellar-forge.bls-analyst-connection.v1';
const definitions=new Map(blsAnalystTools((name,_description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
const OP=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/,SHA=/^[a-f0-9]{64}$/,INSTANCE=/^[a-f0-9]{32}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const checked=(value,pattern,label)=>{if(typeof value!=='string'||!pattern.test(value))throw blsError('BLS_INPUT','Choose the original '+label+'.');return value;};
const hostPath=(value,base)=>{if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value))throw blsError('BLS_CONFIGURATION','Declare the complete original host path.');return isAbsolute(value)?resolve(value):resolve(base,value);};
const filePin=info=>({device:String(info.dev),inode:String(info.ino),bytes:String(info.size),modified:String(info.mtimeNs),changed:String(info.ctimeNs)});
async function files(value,base){
 if(value===undefined)return {};if(!plain(value)||Object.keys(value).length>256)throw blsError('BLS_CONFIGURATION','Declare up to 256 original file aliases.');
 const result=Object.create(null);
 for(const[alias,source]of Object.entries(value)){identifier(alias,'BLS file alias');const path=hostPath(source,base),info=await lstat(path,{bigint:true});
  if(info.isSymbolicLink()||!info.isFile()||await realpath(path)!==path)throw blsError('BLS_CONFIGURATION','Select canonical original files.');
  result[alias]={path,identity:filePin(info)};
 }return result;
}
async function destinations(value,base,directory){
 if(value===undefined)return {};if(!plain(value)||Object.keys(value).length>64)throw blsError('BLS_CONFIGURATION','Declare up to 64 separate customer destinations.');
 const result=Object.create(null);
 for(const[alias,input]of Object.entries(value)){identifier(alias,'BLS destination alias');const path=hostPath(input,base),parent=await privateDirectory(dirname(path)),nested=relative(directory,path);
  if(!nested||nested!=='..'&&!nested.startsWith('..'+sep)&&!isAbsolute(nested))throw blsError('BLS_DESTINATION','Select an independent destination outside the active original workspace.');
  try{await privateDirectory(path);}catch(error){if(error.code!=='ENOENT')throw error;}
  const info=await lstat(parent,{bigint:true});result[alias]={path,parent,identity:{device:String(info.dev),inode:String(info.ino)}};
 }return result;
}
export async function readBlsAnalystConfiguration(path){
 path=resolve(path);const raw=JSON.parse((await readPrivate(path)).toString('utf8'));exact(raw,['schema','workspaces'],['schema','workspaces']);
 if(raw.schema!==BLS_ANALYST_CONNECTION_SCHEMA||!plain(raw.workspaces)||!Object.keys(raw.workspaces).length||Object.keys(raw.workspaces).length>32)throw blsError('BLS_CONFIGURATION','Declare between 1 and 32 original analyst workspace aliases.');
 const base=dirname(path),selected=Object.create(null),seen=new Set();
 for(const[alias,input]of Object.entries(raw.workspaces)){identifier(alias,'BLS workspace alias');exact(input,['label','directory','mode','pythonExecutable','files','destinations'],['directory']);
  const directory=await privateDirectory(hostPath(input.directory,base)),mode=input.mode??'managed';
  if(seen.has(directory)||!['managed','owned'].includes(mode))throw blsError('BLS_CONFIGURATION','Select each original workspace once in managed or owned mode.');seen.add(directory);
  const marker=JSON.parse((await readPrivate(join(directory,'workspace.json'))).toString('utf8'));
  if(marker.schema!=='stellar-forge.bls-labor-workspace.v1')throw blsError('BLS_CONFIGURATION','Select the existing original BLS analyst project.');
  let pythonExecutable;if(mode==='owned'){pythonExecutable=hostPath(input.pythonExecutable,base);const info=await lstat(pythonExecutable);if(!info.isFile()&&!info.isSymbolicLink())throw blsError('BLS_CONFIGURATION','Select the existing Python executable.');}
  else if(input.pythonExecutable!==undefined)throw blsError('BLS_CONFIGURATION','Managed mode reuses Applications own Python listener.');
  selected[alias]={label:line(input.label??alias,'BLS workspace label'),directory,mode,pythonExecutable,files:await files(input.files,base),destinations:await destinations(input.destinations,base,directory)};
 }
 return {schema:BLS_ANALYST_CONNECTION_SCHEMA,workspaces:selected};
}
async function sourcePath(definition,alias){
 identifier(alias,'BLS source file');const selected=definition.files[alias];if(!selected)throw blsError('BLS_SOURCE_NOT_CONFIGURED','Choose a configured complete source file.');
 const info=await lstat(selected.path,{bigint:true}),actual=filePin(info);
 if(info.isSymbolicLink()||!info.isFile()||await realpath(selected.path)!==selected.path||Object.keys(actual).some(key=>actual[key]!==selected.identity[key]))throw blsError('BLS_SOURCE_CHANGED','The configured source changed; reopen its current connection before a new import.');
 return selected.path;
}
async function destinationPath(definition,alias){
 identifier(alias,'BLS destination');const value=definition.destinations[alias];if(!value)throw blsError('BLS_DESTINATION_NOT_CONFIGURED','Choose a configured separate receiving destination.');
 await privateDirectory(value.parent);const info=await lstat(value.parent,{bigint:true});
 if(String(info.dev)!==value.identity.device||String(info.ino)!==value.identity.inode)throw blsError('BLS_DESTINATION_CHANGED','The selected original receiving parent changed.');
 return value.path;
}
function queryFor(view,query={}){
 const definition=VIEW_QUERIES[view];if(!definition)throw blsError('BLS_VIEW','Choose an original analyst view.');exact(query,definition.keys,definition.required);
 for(const[key,value]of Object.entries(query)){
  if(key==='offset'||key==='limit'){if(!Number.isSafeInteger(value)||value<(key==='limit'?1:0)||key==='limit'&&value>500)throw blsError('BLS_PAGE','Choose the complete original page offset and a limit from 1 to 500.');}
  else if(key==='filters'){if(!plain(value))throw blsError('BLS_FILTER','Use complete original observation filters.');}
  else if(key==='projection'){if(!['laus','qcew'].includes(value))throw blsError('BLS_PROJECTION','Choose the original LAUS or QCEW projection.');}
  else if(typeof value!=='string'||!value||value.length>500)throw blsError('BLS_INPUT','Choose the original '+key+'.');
 }return query;
}
export class MerchantBlsAnalystWorkspaces{
 #config;#environment;#entries=new Map();#opening=new Map();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'BLS_ANALYST_FILE',maxImmutableFileBytes:MAX_BLS_PACKAGE_BYTES});
 constructor(config,{environment=process.env}={}){this.#config=config;this.#environment=environment;}
 get summary(){return {configured:Boolean(this.#config.blsAnalystWorkspaces),...this.#reads.summary,workspaces:Object.entries(this.#config.blsAnalystWorkspaces?.workspaces??{}).map(([workspace,value])=>({workspace,label:value.label,mode:value.mode,open:this.#entries.has(workspace),opening:this.#opening.has(workspace),closing:Boolean(this.#entries.get(workspace)?.closingRequested),instanceId:this.#entries.get(workspace)?.client.instanceId??null,files:Object.keys(value.files),destinations:Object.keys(value.destinations)}))};}
 #definition(alias){identifier(alias,'BLS workspace');const value=this.#config.blsAnalystWorkspaces?.workspaces[alias];if(!value)throw blsError('BLS_NOT_CONFIGURED','Choose an original configured workspace.');return value;}
 #entry(alias){this.#definition(alias);const value=this.#entries.get(alias);if(!value||value.closingRequested)throw blsError('BLS_NOT_OPEN','Open the original current workspace attachment.');return value;}
 #scope(alias){return 'bls-analyst:'+alias+':'+this.#definition(alias).directory;}
 async #open(alias){
  const definition=this.#definition(alias);if(this.#entries.has(alias)){const entry=this.#entry(alias);await entry.client.verify();return {workspace:alias,...entry.client.summary,native:await entry.client.view('state')};}
  if(this.#opening.has(alias))return this.#opening.get(alias);
  const pending=(async()=>{let client;try{
   await privateDirectory(this.#config.exportsDirectory);const exportDirectory=await privateDirectory(join(this.#config.exportsDirectory,'bls-analyst-'+alias),{create:true});
   client=await attachBlsAnalystWorkspace({...definition,exportDirectory,environment:this.#environment});if(this.#closing)throw blsError('BLS_CLOSING','The customer operator is closing.');
   const native=await client.view('state');if(native.schema!=='stellar-forge.bls-labor-workspace.v1')throw blsError('BLS_SCHEMA','Open the original saved analyst workspace.');
   const entry={alias,client,pending:new Set(),tail:Promise.resolve(),closing:null,closingRequested:false};this.#entries.set(alias,entry);return {workspace:alias,...client.summary,native};
  }catch(error){await client?.close();throw error;}})();this.#opening.set(alias,pending);try{return await pending;}finally{this.#opening.delete(alias);}
 }
 async #save(entry,args){
  const request=structuredClone(args.request);exact(request,['id','kind','input','expected_revision'],['id','kind','input','expected_revision']);
  checked(request.id,OP,'operation ID');if(!OPERATION_KINDS.includes(request.kind)||!plain(request.input)||!Number.isSafeInteger(request.expected_revision)||request.expected_revision<0)throw blsError('BLS_REQUEST','Use the complete original operation kind, input and current revision.');
  const definition=this.#definition(entry.alias),selected={};
  if(['import','receive'].includes(request.kind)){
   if(request.input.archive!==undefined||request.input.destination!==undefined)throw blsError('BLS_HOST_ALIAS','Use configured source and receiving aliases instead of arbitrary host paths.');
   const status=await entry.client.operation(request.id);
   if(status.saved&&status.observed.found&&['complete','pending','running'].includes(status.observed.operation.state))
    return entry.client.save(request,{sourceAlias:args.sourceFile,destinationAlias:args.destination});
   selected.sourceAlias=args.sourceFile;selected.sourcePath=await sourcePath(definition,args.sourceFile);
   if(request.kind==='receive'){selected.destinationAlias=args.destination;selected.destinationPath=await destinationPath(definition,args.destination);}
   else if(args.destination!==undefined)throw blsError('BLS_DESTINATION','A source import does not receive a second project.');
  }else if(args.sourceFile!==undefined||args.destination!==undefined)throw blsError('BLS_HOST_ALIAS','Host aliases belong to source import or complete project receiving.');
  return entry.client.save(request,selected);
 }
 async #resume(entry,id){
  const state=await entry.client.operation(id);if(!state.saved)throw blsError('BLS_REQUEST_MISSING','Choose a saved original agent operation.');
  if(state.observed.found&&['complete','pending','running'].includes(state.observed.operation.state))return entry.client.resume(id);
  const intent=state.saved,definition=this.#definition(entry.alias);
  if(intent.logical.sourceAlias){const current=definition.files[intent.logical.sourceAlias];if(!current||current.path!==intent.source.path)throw blsError('BLS_SOURCE_NOT_CONFIGURED','Configure the original selected source alias before continuing.');}
  if(intent.logical.destinationAlias&&await destinationPath(definition,intent.logical.destinationAlias)!==intent.destination)throw blsError('BLS_DESTINATION_CHANGED','The original receiving destination differs from its configured alias.');
  return entry.client.resume(id);
 }
 #closeEntry(entry){
  entry.closingRequested=true;if(!entry.closing){
   entry.client.requestClose();const attempt=(async()=>{await Promise.allSettled([...entry.pending]);let value;try{await this.#reads.closeScope(this.#scope(entry.alias));}finally{value=await entry.client.close();}if(this.#entries.get(entry.alias)===entry)this.#entries.delete(entry.alias);return {workspace:entry.alias,...value};})();
   entry.closing=attempt;void attempt.catch(()=>{if(entry.closing===attempt)entry.closing=null;});
  }return entry.closing;
 }
 async #execute(entry,name,args){
  const {workspace,...value}=args,client=entry.client;
  switch(name){
   case 'merchant_bls_analyst_view':return {workspace,native:await client.view(value.view,queryFor(value.view,value.query))};
   case 'merchant_bls_analyst_save':return {workspace,native:await this.#save(entry,args)};
   case 'merchant_bls_analyst_definition_preview':if(!plain(value.document))throw blsError('BLS_INPUT','Receive the full original definition.');return {workspace,native:await client.previewDefinition(value.document)};
   case 'merchant_bls_analyst_operation':return {workspace,native:await client.operation(checked(value.operationId,OP,'operation ID'))};
   case 'merchant_bls_analyst_resume':return {workspace,native:await this.#resume(entry,checked(value.operationId,OP,'operation ID'))};
   case 'merchant_bls_analyst_stop':return {workspace,native:await client.stop(checked(value.operationId,OP,'native receiving ID'))};
   case 'merchant_bls_analyst_export':{
    checked(value.exportId,OP,'export ID');checked(value.id,OP,'original source/report/export ID');
    if(!['source','report','export'].includes(value.kind)||value.name!==undefined&&(typeof value.name!=='string'||value.name.length>1000))throw blsError('BLS_EXPORT','Choose an original complete file.');
    const {filename,...result}=await client.download(value);return {workspace,...result};
   }
   case 'merchant_bls_analyst_file_read':{
    checked(value.exportId,OP,'export ID');if(value.readId!==undefined)checked(value.readId,UUID,'read ID');if(value.expectedSha256!==undefined)checked(value.expectedSha256,SHA,'source SHA256');
    if(value.offset!==undefined&&(!Number.isSafeInteger(value.offset)||value.offset<0)||value.limit!==undefined&&(!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>MAX_RETAINED_CHUNK_BYTES))throw blsError('BLS_FILE_OFFSET','Choose the original byte offset and bounded chunk.');
    return {workspace,exportId:value.exportId,...await this.#reads.read({scope:this.#scope(workspace),key:value.exportId,kind:'bls-original-export',directory:this.#definition(workspace).directory,readId:value.readId,expectedSha256:value.expectedSha256,offset:value.offset,limit:value.limit,load:()=>client.retained(value.exportId)})};
   }
   case 'merchant_bls_analyst_file_release':await this.#reads.release(this.#scope(workspace),checked(value.readId,UUID,'read ID'));return {workspace,readId:value.readId,state:'RELEASED'};
   default:throw blsError('TOOL_NOT_FOUND','Unknown original BLS analyst tool.');
  }
 }
 async call(name,args={}){
  if(this.#closing&&name!=='merchant_bls_analyst_close')throw blsError('BLS_CLOSING','The original analyst operator is closing.');
  const def=definitions.get(name);if(!def)throw blsError('TOOL_NOT_FOUND','Unknown original BLS analyst tool.');exact(args,Object.keys(def.properties),def.required);
  if(name==='merchant_bls_analyst_workspaces')return this.summary;if(name==='merchant_bls_analyst_open')return this.#open(args.workspace);
  if(name==='merchant_bls_analyst_close'){this.#definition(args.workspace);const entry=this.#entries.get(args.workspace);if(!entry)throw blsError('BLS_NOT_OPEN','This original attachment is already closed.');if(entry.client.instanceId!==checked(args.instanceId,INSTANCE,'instance ID'))throw blsError('BLS_INSTANCE_CHANGED','Close only the exact current returned instance.');return this.#closeEntry(entry);}
  const entry=this.#entry(args.workspace),perform=()=>{if(entry.closingRequested)throw blsError('BLS_CLOSING','This original attachment is closing.');return this.#execute(entry,name,args);};
  const pending=name==='merchant_bls_analyst_stop'?Promise.resolve().then(perform):entry.tail.then(perform);if(name!=='merchant_bls_analyst_stop')entry.tail=pending.catch(()=>{});
  entry.pending.add(pending);try{return await pending;}finally{entry.pending.delete(pending);}
 }
 requestClose(){this.#closing=true;for(const entry of this.#entries.values()){entry.closingRequested=true;entry.client.requestClose();}}
 close(){if(!this.#close){this.requestClose();const attempt=(async()=>{await Promise.allSettled([...this.#opening.values()]);const results=await Promise.allSettled([...this.#entries.values()].map(entry=>this.#closeEntry(entry)));await this.#reads.close();if(results.some(x=>x.status==='rejected'))throw blsError('BLS_CLOSE_INCOMPLETE','Continue closing the original owned attachment.');})();this.#close=attempt;void attempt.catch(()=>{if(this.#close===attempt)this.#close=null;});}return this.#close;}
}
