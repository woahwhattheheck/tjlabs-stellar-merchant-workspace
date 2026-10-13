// MIT. Terminal and SDK ownership for the original Research programme operations.
import {isAbsolute,resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {ResearchProgrammeOperations} from './research-programmes.mjs';
import {RESEARCH_PROGRAMME_PREFIX} from './catalog/research-programmes.mjs';
import {ResearchWorkspaceClient} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-client.mjs';
import {readResearchHostFile,openResearchSource} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-files.mjs';
import {writePortableFile} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/portable.mjs';
import {exists} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs';
import {need,hash,id,fingerprint,QUOTE_CASE_TRANSFER_LIMIT,QUOTE_FILE_LIMIT}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/contracts.mjs';
import {RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/programme-archive.mjs';

export const RESEARCH_PROGRAMME_OPERATOR_SCHEMA='stellar-forge.research-programme-operator.v1';
export const RESEARCH_PROGRAMME_OPERATOR_COMMANDS=Object.freeze([
 'info','jobs','job','resume','state','step','submit','receiving','bundle','files','file_info',
 'retain','retained','read','release','archive','upload','upload_source','transfer','transfer_status']);
const MAX_CONFIGURATION=1024*1024,FILE_LIMIT=Math.max(QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT+65536);
const clone=value=>structuredClone(value);
function exact(value,allowed,required=allowed){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key))&&
  required.every(key=>Object.hasOwn(value,key)),'RESEARCH_PROGRAMME_OPERATOR_CONFIGURATION_INVALID');
}
function absolute(value){
 need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&!/[\u0000-\u001f\u007f]/.test(value),
  'RESEARCH_PROGRAMME_OPERATOR_ABSOLUTE_PATH_REQUIRED');return value;
}
function alias(value){need(typeof value==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(value),
 'RESEARCH_PROGRAMME_OPERATOR_ALIAS_INVALID');return value;}
function workspace(value){need(/^research_[a-f0-9]{64}$/.test(value??''),'RESEARCH_PROGRAMME_WORKSPACE_REQUIRED');return value;}
function inside(parent,file){return file===parent||file.startsWith(parent+sep);}
export function researchProgrammeOperatorConfiguration(value){
 const selected=clone(value);
 exact(selected,['schema','directory','workspaces','sources']);
 need(selected.schema===RESEARCH_PROGRAMME_OPERATOR_SCHEMA,'RESEARCH_PROGRAMME_OPERATOR_CONFIGURATION_INVALID');
 absolute(selected.directory);need(selected.directory!==resolve(selected.directory, '..'),
  'RESEARCH_PROGRAMME_OPERATOR_DIRECTORY_REQUIRED');
 need(Array.isArray(selected.workspaces)&&selected.workspaces.length>0&&selected.workspaces.length<=64&&
  Array.isArray(selected.sources)&&selected.sources.length<=1000,'RESEARCH_PROGRAMME_OPERATOR_CONFIGURATION_INVALID');
 const names=new Set(),sourceNames=new Set();
 for(const item of selected.workspaces){
  exact(item,['id','connectionFile','workspaceId']);alias(item.id);absolute(item.connectionFile);workspace(item.workspaceId);
  need(!names.has(item.id)&&!inside(selected.directory,item.connectionFile),'RESEARCH_PROGRAMME_OPERATOR_CONFIGURATION_INVALID');
  names.add(item.id);
 }
 for(const item of selected.sources){
  exact(item,['id','kind','file','sha256']);alias(item.id);absolute(item.file);hash(item.sha256);
  need(['programme-input','programme-archive'].includes(item.kind)&&!sourceNames.has(item.id)&&
   !inside(selected.directory,item.file),'RESEARCH_PROGRAMME_OPERATOR_SOURCE_INVALID');sourceNames.add(item.id);
 }
 return selected;
}
export async function readResearchProgrammeOperatorConfiguration(file){
 absolute(file);const bytes=await readResearchHostFile(file,MAX_CONFIGURATION,{privateFile:true});
 const configuration=researchProgrammeOperatorConfiguration(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 need(!inside(configuration.directory,file),'RESEARCH_PROGRAMME_OPERATOR_CONFIGURATION_INVALID');
 return {configuration,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
function aggregate(errors){
 const first=errors[0];if(errors.length>1)first.closeErrors=errors.slice(1);return first;
}
/** Owns only borrowed HTTP clients, original programme operations and local descriptors.
 * Constructors and completed local reopens do not contact a native host.
 */
export class ResearchProgrammeOperator{
 #configuration;#factory;#entries=new Map();#pending=new Set();#failed=new Set();#closed=false;#closing;
 constructor(configuration,{clientFactory=value=>ResearchWorkspaceClient.fromFile(value.connectionFile,
  {expectedWorkspaceId:value.workspaceId})}={}){
  this.#configuration=researchProgrammeOperatorConfiguration(configuration);
  need(typeof clientFactory==='function','RESEARCH_PROGRAMME_OPERATOR_CLIENT_REQUIRED');this.#factory=clientFactory;
 }
 static async fromFile(file,options){const selected=await readResearchProgrammeOperatorConfiguration(file);
  return new ResearchProgrammeOperator(selected.configuration,options);}
 configuration(){return clone(this.#configuration);}
 #entry(name){
  alias(name);let entry=this.#entries.get(name);if(entry?.operations)return entry;
  const selected=this.#configuration.workspaces.find(item=>item.id===name);
  need(selected,'RESEARCH_PROGRAMME_OPERATOR_WORKSPACE_NOT_DECLARED');
  const client=entry?.client??this.#factory(clone(selected));
  if(!entry){
   entry={selected,client,directory:join(this.#configuration.directory,name),operations:null,closedOperations:false,closedClient:false};
   // Keep an acquired close handle even if its remaining contract is invalid.
   if(client&&typeof client.close==='function')this.#entries.set(name,entry);
  }
  need(client&&typeof client.customerQuoteProgrammes==='function'&&typeof client.close==='function',
   'RESEARCH_PROGRAMME_OPERATOR_CLIENT_REQUIRED');
  entry.operations=new ResearchProgrammeOperations({client,directory:entry.directory,workspaceId:selected.workspaceId,
   source:(sourceId,kinds)=>{
    const source=this.#configuration.sources.find(item=>item.id===sourceId);
    need(source&&kinds.includes(source.kind),'RESEARCH_PROGRAMME_SOURCE_NOT_DECLARED');return clone(source);
   },
   target:async(targetName,work)=>{
    const target=this.#entry(targetName);return work({client:target.client,workspaceId:target.selected.workspaceId});
   }});
  return entry;
 }
 #run(work){
  need(!this.#closed,'RESEARCH_PROGRAMME_OPERATOR_CLOSING');
  const pending=Promise.resolve().then(work);this.#pending.add(pending);
  return pending.catch(error=>{if(typeof error?.close==='function')this.#failed.add(error);throw error;})
   .finally(()=>this.#pending.delete(pending));
 }
 #call(entry,command,args){
  need(RESEARCH_PROGRAMME_OPERATOR_COMMANDS.includes(command),'RESEARCH_PROGRAMME_COMMAND_INVALID');
  need(args&&typeof args==='object'&&!Array.isArray(args)&&!Object.hasOwn(args,'workspace')&&
   (!Object.hasOwn(args,'workspaceId')||args.workspaceId===entry.selected.workspaceId),'RESEARCH_PROGRAMME_WORKSPACE_CHANGED');
  return entry.operations.call(RESEARCH_PROGRAMME_PREFIX+command,
   command==='info'?args:{...args,workspaceId:entry.selected.workspaceId});
 }
 call(name,command,args={}){
  const selected=clone(args);alias(name);
  return this.#run(()=>this.#call(this.#entry(name),command,selected));
 }
 async #verified(path,{bytes,sha256},maximum){
  const held=await openResearchSource(path,maximum,{sha256});this.#failed.add(held);let primary;
  try{need(held.bytes===bytes,'RESEARCH_PROGRAMME_FILE_CHANGED');}
  catch(error){primary=error;}
  try{await held.close();this.#failed.delete(held);}catch(error){primary??=error;}
  if(primary)throw primary;
 }
 /** Copy one complete original retained file to a new exclusive operator path.
  * Exact existing copies reopen before the native host or original source is needed.
  */
 exportFile(name,selection,{file}={}){
  const selected=clone(selection),destination=absolute(file);alias(name);
  exact(selected,['kind','id','name','sha256','bytes'],['kind','id','sha256','bytes']);
  need(['JOB','BUNDLE','ARCHIVE'].includes(selected.kind),'RESEARCH_PROGRAMME_FILE_KIND_REQUIRED');
  id(selected.id);hash(selected.sha256);
  const maximum=selected.kind==='ARCHIVE'?RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT:FILE_LIMIT;
  need(Number.isSafeInteger(selected.bytes)&&selected.bytes>=0&&selected.bytes<=maximum&&
   (selected.kind==='ARCHIVE'?selected.name===undefined&&selected.bytes>0:
    typeof selected.name==='string'&&selected.name.length>0),'RESEARCH_PROGRAMME_FILE_SIZE_INVALID');
  need(!inside(this.#configuration.directory,destination)&&
   !this.#configuration.sources.some(item=>item.file===destination)&&
   !this.#configuration.workspaces.some(item=>item.connectionFile===destination),
   'RESEARCH_PROGRAMME_OPERATOR_EXPORT_DIRECTORY_INVALID');
  return this.#run(async()=>{
   const definition=this.#configuration.workspaces.find(item=>item.id===name);
   need(definition,'RESEARCH_PROGRAMME_OPERATOR_WORKSPACE_NOT_DECLARED');
   const exportId=fingerprint(selected);
   if(await exists(destination)){
    await this.#verified(destination,selected,maximum);
    return {schema:RESEARCH_PROGRAMME_OPERATOR_SCHEMA,workspaceId:definition.workspaceId,exportId,
     selection:selected,file:{path:destination,bytes:selected.bytes,sha256:selected.sha256},reused:true};
   }
   const entry=this.#entry(name),retained=await this.#call(entry,'retain',selected);
   need(retained.workspaceId===definition.workspaceId&&retained.exportId===exportId&&
    retained.file?.bytes===selected.bytes&&retained.file.sha256===selected.sha256,'RESEARCH_PROGRAMME_FILE_CHANGED');
   const source=await openResearchSource(join(entry.directory,'files',exportId,'payload'),maximum,{sha256:selected.sha256});
   this.#failed.add(source);let result,primary;
   try{
    need(source.bytes===selected.bytes,'RESEARCH_PROGRAMME_FILE_CHANGED');
    result=await writePortableFile(destination,{body:source.stream,filename:retained.file.name,
     contentType:retained.file.contentType});
    need(result.bytes===selected.bytes&&result.sha256===selected.sha256,'RESEARCH_PROGRAMME_FILE_CHANGED');
   }catch(error){primary=error;}
   try{await source.close();this.#failed.delete(source);}catch(error){primary??=error;}
   if(primary)throw primary;
   return {schema:RESEARCH_PROGRAMME_OPERATOR_SCHEMA,workspaceId:definition.workspaceId,exportId,
    selection:selected,file:{...result,path:result.path??result.file},reused:false};
  });
 }
 close(){
  this.#closed=true;if(this.#closing)return this.#closing;
  this.#closing=(async()=>{
   await Promise.allSettled([...this.#pending]);const errors=[];
   // Accepted cross-workspace calls may instantiate their second owner during
   // the drain. Capture owners only after every admitted outer call settles.
   await Promise.all([...this.#entries.values()].map(async entry=>{
    if(!entry.closedOperations){
     try{if(entry.operations)await entry.operations.close();entry.closedOperations=true;}
     catch(error){errors.push(error);}
    }
   }));
   // Original operation owners have finished accepted work before clients detach.
   await Promise.all([...this.#entries.values()].map(async entry=>{
    if(!entry.closedClient){try{await entry.client.close();entry.closedClient=true;}catch(error){errors.push(error);}}
   }));
   await Promise.all([...this.#failed].map(async owner=>{
    try{await owner.close();this.#failed.delete(owner);}catch(error){errors.push(error);}
   }));
   if(errors.length)throw aggregate(errors);
   return {state:'DETACHED',workspaces:[...this.#entries.values()].map(entry=>entry.selected.workspaceId)};
  })().catch(error=>{this.#closing=null;throw error;});return this.#closing;
 }
}
