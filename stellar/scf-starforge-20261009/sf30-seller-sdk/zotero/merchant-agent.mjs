// MIT. Customer-agent operation of the original Zotero library and Research workspace.
import {lstat,realpath} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve} from 'node:path';
import {zoteroTools,ZOTERO_AGENT_ACTIONS,ZOTERO_AGENT_VIEWS} from './catalog.mjs';
import {attachZoteroWorkspace,readPrivate,privateDirectory} from './operator-client.mjs';
import {fileIdentity} from './agent-files.mjs';
import {LIMIT,need,plain,requestId,sha256} from './contracts.mjs';
import {RetainedFileReads,MAX_RETAINED_CHUNK_BYTES} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {exact,identifier,line} from '../../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
export {zoteroTools} from './catalog.mjs';
export const ZOTERO_AGENT_CONNECTION_SCHEMA='stellar-forge.zotero-agent-connection.v1';
const definitions=new Map(zoteroTools((name,_description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
const SHA=/^[a-f0-9]{64}$/;
const hostPath=(value,base)=>{need(typeof value==='string'&&value&&!/[\x00-\x1f\x7f]/.test(value),'ZOTERO_CONFIGURATION_PATH');return isAbsolute(value)?resolve(value):resolve(base,value);};
async function files(value,base){
 if(value===undefined)return{};need(plain(value)&&Object.keys(value).length<=256,'ZOTERO_CONFIGURATION_FILES');
 const result=Object.create(null);for(const[alias,source]of Object.entries(value)){identifier(alias,'Zotero file alias');const path=hostPath(source,base);let info;try{info=await lstat(path,{bigint:true});}catch(error){if(error.code!=='ENOENT')throw error;need(await realpath(dirname(path))===dirname(path),'ZOTERO_CANONICAL_FILE_REQUIRED');}if(info)need(info.isFile()&&!info.isSymbolicLink()&&await realpath(path)===path,'ZOTERO_CANONICAL_FILE_REQUIRED');result[alias]={path,identity:info?fileIdentity(info):null};}return result;
}
export async function readZoteroAgentConfiguration(path){
 path=resolve(path);const raw=JSON.parse((await readPrivate(path)).toString('utf8'));exact(raw,['schema','workspaces'],['schema','workspaces']);
 need(raw.schema===ZOTERO_AGENT_CONNECTION_SCHEMA&&plain(raw.workspaces)&&Object.keys(raw.workspaces).length>0&&Object.keys(raw.workspaces).length<=32,'ZOTERO_CONFIGURATION_REQUIRED');
 const base=dirname(path),selected=Object.create(null),seen=new Set();
 for(const[alias,input]of Object.entries(raw.workspaces)){
  identifier(alias,'Zotero workspace alias');exact(input,['label','mode','directory','connectionFile','researchDirectory','files'],['directory']);
  const directory=await privateDirectory(hostPath(input.directory,base)),mode=input.mode??'managed';need(!seen.has(directory)&&['managed','owned'].includes(mode),'ZOTERO_CONFIGURATION_WORKSPACE');seen.add(directory);
  need(mode==='owned'||input.researchDirectory===undefined,'ZOTERO_AGENT_MANAGED_RESEARCH');
  const database=await lstat(join(directory,'workspace.sqlite'));need(database.isFile()&&!database.isSymbolicLink()&&(database.mode&0o077)===0,'ZOTERO_EXISTING_WORKSPACE_REQUIRED');
  const researchDirectory=input.researchDirectory===undefined?undefined:await privateDirectory(hostPath(input.researchDirectory,base));
  selected[alias]={label:line(input.label??alias,'Zotero workspace label'),mode,directory,...(researchDirectory?{researchDirectory}:{}),connectionFile:hostPath(input.connectionFile??join(directory,'connection.json'),base),files:await files(input.files,base)};
 }
 return{schema:ZOTERO_AGENT_CONNECTION_SCHEMA,workspaces:selected};
}
function selectedSource(definition,alias){identifier(alias,'Zotero file alias');const selected=definition.files[alias];need(selected,'ZOTERO_SOURCE_NOT_CONFIGURED');return selected;}
async function sourcePath(definition,alias){
 identifier(alias,'Zotero file alias');const selected=definition.files[alias];need(selected,'ZOTERO_SOURCE_NOT_CONFIGURED');
 const info=await lstat(selected.path,{bigint:true});need(info.isFile()&&!info.isSymbolicLink()&&await realpath(selected.path)===selected.path&&(!selected.identity||JSON.stringify(fileIdentity(info))===JSON.stringify(selected.identity)),'ZOTERO_SOURCE_FILE_CHANGED');return selected.path;
}
export class MerchantZoteroWorkspaces{
 #config;#environment;#receivers=new Map();#entries=new Map();#opening=new Map();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'ZOTERO_AGENT_FILE',maxImmutableFileBytes:LIMIT.transfer});
 constructor(config,{environment=process.env}={}){this.#config=config;this.#environment=environment;}
 get summary(){return{configured:Boolean(this.#config.zoteroWorkspaces),...this.#reads.summary,workspaces:Object.entries({...this.#config.zoteroWorkspaces?.workspaces,...Object.fromEntries(this.#receivers)}).map(([workspace,value])=>({workspace,label:value.label,mode:value.mode,open:Boolean(this.#entries.get(workspace)?.admitted),cleanupPending:Boolean(this.#entries.get(workspace)&&!this.#entries.get(workspace).admitted),opening:this.#opening.has(workspace),closing:Boolean(this.#entries.get(workspace)?.closingRequested),instanceId:this.#entries.get(workspace)?.client.instanceId??null,files:Object.keys(value.files)}))};}
 #definition(alias){identifier(alias,'Zotero workspace');const value=this.#receivers.get(alias)??this.#config.zoteroWorkspaces?.workspaces[alias];need(value,'ZOTERO_NOT_CONFIGURED');return value;}
 #entry(alias){this.#definition(alias);const value=this.#entries.get(alias);need(value&&value.admitted&&!value.closingRequested,'ZOTERO_NOT_OPEN');return value;}
 #scope(alias){const entry=this.#entries.get(alias);return'zotero:'+alias+':'+this.#definition(alias).directory+':'+(entry?.client.workspaceId??'');}
 async #open(alias){
  const definition=this.#definition(alias);if(this.#opening.has(alias))return this.#opening.get(alias);
  if(this.#entries.has(alias)){const entry=this.#entry(alias);await entry.client.verify();return{workspace:alias,...entry.client.summary,native:await entry.client.view('state')};}
  const pending=(async()=>{let client,entry;try{
   await privateDirectory(this.#config.exportsDirectory);const exportDirectory=await privateDirectory(join(this.#config.exportsDirectory,'zotero-'+alias),{create:true});
   client=await attachZoteroWorkspace({...definition,exportDirectory,environment:this.#environment});
   entry={alias,client,admitted:false,pending:new Set(),readScopes:new Set(),children:new Set(),tail:Promise.resolve(),closing:null,closingRequested:false};this.#entries.set(alias,entry);
   need(!this.#closing,'ZOTERO_CLOSING');const native=await client.view('state');need(native.schema==='stellar-forge.zotero-workspace-api.v1','ZOTERO_SCHEMA_INVALID');need(!this.#closing&&!entry.closingRequested,'ZOTERO_CLOSING');
   entry.admitted=true;return{workspace:alias,...client.summary,native};
  }catch(error){
   if(!entry&&error.zoteroCleanup){entry={alias,client:error.zoteroCleanup,admitted:false,pending:new Set(),readScopes:new Set(),children:new Set(),tail:Promise.resolve(),closing:null,closingRequested:true};this.#entries.set(alias,entry);}
   else if(entry){try{await this.#closeEntry(entry);}catch(secondary){error.cleanupFailure=secondary.code??'ZOTERO_CLOSE_INCOMPLETE';}}
   throw error;
  }})();this.#opening.set(alias,pending);try{return await pending;}finally{this.#opening.delete(alias);}
 }
 #closeEntry(entry){
  entry.closingRequested=true;if(!entry.closing){
   entry.client.requestClose();const attempt=(async()=>{await Promise.allSettled([...entry.pending]);for(const alias of entry.children){const child=this.#entries.get(alias);if(child)await this.#closeEntry(child);}let value;try{for(const scope of entry.readScopes)await this.#reads.closeScope(scope);}finally{value=await entry.client.close();}if(this.#entries.get(entry.alias)===entry)this.#entries.delete(entry.alias);return{workspace:entry.alias,...value};})();
   entry.closing=attempt;void attempt.catch(()=>{if(entry.closing===attempt)entry.closing=null;});
  }return entry.closing;
 }
 async #receiveChild(entry,name,result){
  const parent=this.#definition(entry.alias),alias='zotero-'+sha256(Buffer.from(entry.alias+'\n'+name)).slice(0,24),directory=join(parent.directory,'received',name);
  const definition={label:parent.label+' / '+name,mode:'managed',directory,connectionFile:join(directory,'connection.json'),files:parent.files};
  const existing=this.#receivers.get(alias);need(!existing||existing.directory===directory,'ZOTERO_RECEIVER_ALIAS_CHANGED');
  this.#receivers.set(alias,definition);entry.children.add(alias);
  need(!entry.closingRequested&&!this.#closing,'ZOTERO_CLOSING');
  const opened=await this.#open(alias);
  try{need(opened.workspaceId===result.receiver.workspaceId&&opened.instanceId===result.receiver.instanceId,'ZOTERO_RECEIVING_IDENTITY_CHANGED');}
  catch(error){const child=this.#entries.get(alias);if(child){child.admitted=false;try{await this.#closeEntry(child);}catch(secondary){error.cleanupFailure=secondary.code??'ZOTERO_CLOSE_INCOMPLETE';}}throw error;}
  return{...result,childWorkspace:alias,child:opened};
 }
 async #execute(entry,name,args){
  const{workspace,...value}=args,client=entry.client;
  switch(name){
   case'merchant_zotero_view':return{workspace,native:await client.view(value.method,value.input??{})};
   case'merchant_zotero_save':return{workspace,native:await client.save(value.request)};
   case'merchant_zotero_request':return{workspace,native:await client.request(requestId(value.requestId))};
   case'merchant_zotero_resume':return{workspace,native:await client.resume(requestId(value.requestId))};
   case'merchant_zotero_cancel':return{workspace,native:await client.cancel(requestId(value.requestId),value.captureId)};
   case'merchant_zotero_import':return{workspace,native:await client.importDocuments({requestId:requestId(value.requestId),profileId:value.profileId,profileRevision:value.profileRevision},selectedSource(this.#definition(workspace),value.sourceFile).path,{sourceAlias:value.sourceFile,verifySource:()=>sourcePath(this.#definition(workspace),value.sourceFile)})};
   case'merchant_zotero_receive':{const result=await client.receive({requestId:requestId(value.requestId),name:value.name},selectedSource(this.#definition(workspace),value.sourceFile).path,{sourceAlias:value.sourceFile,verifySource:()=>sourcePath(this.#definition(workspace),value.sourceFile)});return{workspace,native:await this.#receiveChild(entry,result.name,result)};}
   case'merchant_zotero_receiver':{const result=await client.receiver(value.name);return{workspace,native:await this.#receiveChild(entry,result.name,result)};}
   case'merchant_zotero_export':return{workspace,exportId:value.exportId,...await client.export(requestId(value.exportId),value.selection)};
   case'merchant_zotero_file_read':{
    requestId(value.exportId);if(value.readId!==undefined)requestId(value.readId);if(value.expectedSha256!==undefined)need(SHA.test(value.expectedSha256),'ZOTERO_FILE_SHA_REQUIRED');
    need((value.offset===undefined||Number.isSafeInteger(value.offset)&&value.offset>=0)&&(value.limit===undefined||Number.isSafeInteger(value.limit)&&value.limit>=1&&value.limit<=MAX_RETAINED_CHUNK_BYTES),'ZOTERO_FILE_RANGE_INVALID');
    const scope=this.#scope(workspace);entry.readScopes.add(scope);return{workspace,exportId:value.exportId,...await this.#reads.read({scope,key:value.exportId,kind:'zotero-original-export',directory:this.#definition(workspace).directory,readId:value.readId,expectedSha256:value.expectedSha256,offset:value.offset,limit:value.limit,load:()=>client.retained(value.exportId)})};
   }
   case'merchant_zotero_file_release':await this.#reads.release(this.#scope(workspace),requestId(value.readId));return{workspace,readId:value.readId,state:'RELEASED'};
   default:need(false,'TOOL_NOT_FOUND');
  }
 }
 async call(name,args={}){
  args=structuredClone(args);need(!this.#closing||name==='merchant_zotero_close','ZOTERO_CLOSING');
  const def=definitions.get(name);need(def,'TOOL_NOT_FOUND');exact(args,Object.keys(def.properties),def.required);
  if(name==='merchant_zotero_workspaces')return this.summary;
  if(name==='merchant_zotero_open')return this.#open(args.workspace);
  if(name==='merchant_zotero_close'){this.#definition(args.workspace);const entry=this.#entries.get(args.workspace);need(entry,'ZOTERO_NOT_OPEN');need(entry.client.instanceId===requestId(args.instanceId),'ZOTERO_CONNECTION_INSTANCE_CHANGED');return this.#closeEntry(entry);}
  const entry=this.#entry(args.workspace),perform=()=>{need(!entry.closingRequested,'ZOTERO_CLOSING');return this.#execute(entry,name,args);};
  const pending=name==='merchant_zotero_cancel'?Promise.resolve().then(perform):entry.tail.then(perform);if(name!=='merchant_zotero_cancel')entry.tail=pending.catch(()=>{});
  entry.pending.add(pending);try{return await pending;}finally{entry.pending.delete(pending);}
 }
 requestClose(){this.#closing=true;for(const entry of this.#entries.values()){entry.closingRequested=true;entry.client.requestClose();}}
 close(){if(!this.#close){this.requestClose();const attempt=(async()=>{await Promise.allSettled([...this.#opening.values()]);const results=await Promise.allSettled([...this.#entries.values()].map(entry=>this.#closeEntry(entry)));await this.#reads.close();need(!results.some(x=>x.status==='rejected'),'ZOTERO_CLOSE_INCOMPLETE');})();this.#close=attempt;void attempt.catch(()=>{if(this.#close===attempt)this.#close=null;});}return this.#close;}
}
