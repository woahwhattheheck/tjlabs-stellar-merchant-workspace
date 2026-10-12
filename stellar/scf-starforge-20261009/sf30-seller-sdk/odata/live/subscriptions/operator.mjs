// MIT. One configured operator shared by the local UI, command line and MCP provider.
import {constants} from 'node:fs';
import {open,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname,join,basename} from 'node:path';
import * as publisher from './core.mjs';
import * as customer from './customer.mjs';
import {openCollection,collectionRetainedFiles} from '../collection.mjs';
import {need,plain,shape,text,integer,HASH,LIMITS,sha,same,bytes,identity,parse,read,readJSON,maybeJSON,
 privateDirectory,pathAt,measureChecked,atomic,inventory,leased} from './files.mjs';

export const CONNECTION_SCHEMA='stellar-forge.odata-subscription-connection.v1';
export const OPERATIONS=Object.freeze([
 'status','publisher-create','publisher-append','publisher-inspect','publisher-editions','publisher-rows','publisher-cancel',
 'publisher-delivery','publisher-source','publisher-backup','publisher-restore',
 'customer-receive','customer-inspect','customer-rows','customer-export','customer-backup','customer-restore',
 'analysis-mapping','artifacts','artifact'
]);
const alias=value=>{need(typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value),'ALIAS','Choose a configured alias.',400);return value;};
const exactIdentity=file=>({bytes:file.bytes,sha256:file.sha256});
const groups=['publishers','customers','collections','inputs'];
const inputKinds=['transfer','publisher-backup','customer-backup','analysis'];
const artifactKinds=['transfer','original','publisher-backup','customer-backup','analysis'];
const publicEntry=entry=>({label:entry.label,...(entry.sha256?{sha256:entry.sha256}:{}),...(entry.kind?{kind:entry.kind}:{})});
async function selectedDirectory(base,value,{mayCreate=false}={}){
 need(typeof value==='string'&&value.length>0&&!value.includes('\0'),'DIRECTORY','Configure an original private directory.',400);
 const path=resolve(base,value);
 try{return await privateDirectory(path);}catch(error){if(error.code!=='ENOENT'||!mayCreate)throw error;await privateDirectory(dirname(path));return path;}
}
export async function readSubscriptionConnection(path){
 path=resolve(path);const raw=await read(path,1048576),value=parse(raw),base=dirname(path);
 shape(value,['schema','label','publishers','customers','collections','inputs','exportsDirectory'],'connection');
 need(value.schema===CONNECTION_SCHEMA,'CONNECTION','Choose an original subscription connection file.',400);
 text(value.label,'connection label');const result={schema:CONNECTION_SCHEMA,label:value.label,source:{path,...identity(raw)}};
 for(const group of groups){
  const rows=value[group]??{};need(plain(rows)&&Object.keys(rows).length<=64,'CONNECTION','Configure at most64 '+group+'.',400);result[group]=Object.create(null);
  for(const [name,row]of Object.entries(rows)){
   alias(name);shape(row,group==='collections'?['label','directory','sha256']:group==='inputs'?['label','directory','sha256','kind']:['label','directory'],group+' entry');
   text(row.label,'entry label');const directory=await selectedDirectory(base,row.directory,{mayCreate:group==='publishers'||group==='customers'});
   if(group==='collections'||group==='inputs')need(HASH.test(row.sha256),'SOURCE_IDENTITY','Configure the original selected manifest SHA256.',400);
   if(group==='inputs')need(inputKinds.includes(row.kind),'INPUT_KIND','Choose a supported original receiving input.',400);
   result[group][name]={...row,directory};
  }
 }
 result.exportsDirectory=await selectedDirectory(base,value.exportsDirectory,{mayCreate:true});
 const roots=[...Object.values(result.publishers),...Object.values(result.customers)].map(x=>x.directory);
 need(new Set(roots).size===roots.length&&roots.every((a,i)=>roots.every((b,j)=>i===j||!a.startsWith(b+'/'))),'DIRECTORY','Each publisher and customer needs its own private directory.',400);
 for(const group of groups)for(const row of Object.values(result[group]))need(row.directory!==result.exportsDirectory&&!result.exportsDirectory.startsWith(row.directory+'/')&&!row.directory.startsWith(result.exportsDirectory+'/'),'EXPORTS_DIRECTORY','Keep retained exports separate from configured source and destination directories.',400);
 return result;
}
function declared(config,group,name){alias(name);const entry=config[group]?.[name];need(entry,'NOT_CONFIGURED','Choose an alias from status for '+group+'.',404);return entry;}
function selectedInput(config,args,kind){
 need((typeof args.input==='string')!==(typeof args.artifact==='string'),'INPUT','Choose one configured input or retained artifact.',400);
 if(args.input){const entry=declared(config,'inputs',args.input);need(kind.includes(entry.kind),'INPUT_KIND','Select the matching complete receiving input.',400);return {kind:entry.kind,directory:entry.directory,sha256:entry.sha256};}
 return null;
}
const manifestName=kind=>kind==='transfer'?'transfer.json':kind==='analysis'?'source.json':kind==='original'?'collection.json':'backup.json';
const publicArtifact=record=>({schema:record.schema,artifact:record.artifact,kind:record.kind,state:record.state,
 selection:record.selection,manifest:record.manifest,files:record.files,bytesTotal:record.bytesTotal,result:record.result});
function visibleResult(value){
 if(Array.isArray(value))return value.map(visibleResult);
 if(!plain(value))return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['directory','sourceManifest','root'].includes(key)).map(([key,item])=>[key,visibleResult(item)]));
}
async function originalOutputFiles(root,kind){
 let names;
 if(kind==='original')names=(await collectionRetainedFiles(await openCollection(root))).map(f=>f.path);
 else if(kind==='analysis'){const m=await readJSON(root,'source.json',1048576);names=['source.json','dataset.csv','customer.json',m.document.path,...m.originals.map(f=>f.path)];}
 else {const m=await readJSON(root,manifestName(kind));need(Array.isArray(m.files),'ARTIFACT','The original output has no complete file inventory.');names=[manifestName(kind),...m.files.map(f=>f.path)];}
 return inventory(root,names);
}
export class SubscriptionOperator {
 #config;#pending=new Set();#closing=false;
 #scope(){return sha(bytes({schema:CONNECTION_SCHEMA,exportsDirectory:this.#config.exportsDirectory}));}
 #binding(selection){const group=selection.publisher?'publishers':'customers',name=selection.publisher??selection.customer;return {scopeSha256:this.#scope(),group,alias:name,directorySha256:sha(Buffer.from(declared(this.#config,group,name).directory))};}
 constructor(config){need(config?.schema===CONNECTION_SCHEMA,'CONNECTION','Load an original subscription connection first.');this.#config=config;}
 get configuration(){return this.#config;}
 get summary(){return {configured:true,label:this.#config.label,pending:this.#pending.size,closing:this.#closing};}
 async status(){
  const result={schema:'stellar-forge.odata-subscription-operator.v1',...this.summary,connectionSha256:this.#config.source.sha256,operations:OPERATIONS};
  for(const group of groups)result[group]=Object.fromEntries(Object.entries(this.#config[group]).map(([name,row])=>[name,publicEntry(row)]));
  return result;
 }
 async #record(name,{verify=false}={}){
  alias(name);const record=await readJSON(this.#config.exportsDirectory,'records/'+name+'.json');
  need(record.schema==='stellar-forge.odata-subscription-artifact.v1'&&record.artifact===name&&record.scopeSha256===this.#scope()&&artifactKinds.includes(record.kind)&&record.state==='COMPLETE','ARTIFACT_PENDING','Complete the originally selected export before using its files.');
  need(Array.isArray(record.files)&&record.files.length<=LIMITS.files&&new Set(record.files.map(f=>f.path)).size===record.files.length&&record.manifest&&HASH.test(record.manifest.sha256),'ARTIFACT','The retained output inventory changed.');
  const root=await privateDirectory(join(this.#config.exportsDirectory,'artifacts',name));
  if(verify){const actual=await inventory(root,record.files.map(f=>f.path));need(same(actual,record.files),'ARTIFACT_CHANGED','The full original artifact differs from its retained file inventory.');}
  return {record,root};
 }
 async #input(args,kinds){
  const configured=selectedInput(this.#config,args,kinds);if(configured)return configured;
  const {record,root}=await this.#record(args.artifact);need(kinds.includes(record.kind),'INPUT_KIND','Choose an artifact of the required receiving kind.',400);
  return {kind:record.kind,directory:root,sha256:record.manifest.sha256};
 }
 async #export(kind,artifact,selection,make){
  alias(artifact);return leased(this.#config.exportsDirectory,async root=>{
   const name='records/'+artifact+'.json',existing=await maybeJSON(root,name),binding=this.#binding(selection),base={schema:'stellar-forge.odata-subscription-artifact.v1',artifact,kind,scopeSha256:this.#scope(),connectionSha256:this.#config.source.sha256,binding,selection};
   if(existing){need(same(existing.selection,selection)&&existing.kind===kind&&existing.scopeSha256===base.scopeSha256&&same(existing.binding,binding),'ARTIFACT_SELECTED','Reuse the exact selected export ID and edition.');
    if(existing.state==='COMPLETE'){await this.#record(artifact,{verify:true});return {...publicArtifact(existing),reused:true};}
    need(existing.state==='SELECTED','ARTIFACT_STATE','Reconcile the original export state.');}
   else await atomic(root,name,{...base,state:'SELECTED'});
   const output=await pathAt(root,'artifacts/'+artifact,{create:true});await privateDirectory(output,{create:true});
   const result=await make(output),files=await originalOutputFiles(output,kind),manifest=files.find(f=>f.path===manifestName(kind));
   need(manifest,'ARTIFACT_MANIFEST','The complete output omits its original manifest.');
   const record={...base,state:'COMPLETE',result:visibleResult(result),manifest,files,bytesTotal:files.reduce((n,f)=>n+f.bytes,0)};
   await atomic(root,name,record);return {...publicArtifact(record),reused:false};
  });
 }
 async artifactFile({artifact,path,expectedSha256}){
  need(!this.#closing,'CLOSING','This original operator is closing.');
  const {record,root}=await this.#record(artifact);need(HASH.test(expectedSha256),'FILE_IDENTITY','Select the exact retained file SHA256.',400);
  const file=record.files.find(f=>f.path===path);need(file&&file.sha256===expectedSha256,'FILE','Choose a file from the exact retained output inventory.',404);
  const selected=await pathAt(root,file.path),handle=await open(selected,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const info=await handle.stat();need(info.isFile()&&(info.mode&0o077)===0&&info.uid===process.getuid()&&info.size===file.bytes,'FILE_CHANGED','The selected private file changed.');
   return {readonlyFileHandle:handle,bytes:file.bytes,sha256:file.sha256,name:basename(file.path),type:file.path.endsWith('.csv')?'text/csv':file.path.endsWith('.json')?'application/json':'application/octet-stream'};
  }catch(error){await handle.close();throw error;}
 }
 call(operation,args={}){
  need(!this.#closing,'CLOSING','This original operator is closing.');need(OPERATIONS.includes(operation),'OPERATION','Choose an operation from subscription status.',400);
  const run=this.#dispatch(operation,args);this.#pending.add(run);run.then(()=>this.#pending.delete(run),()=>this.#pending.delete(run));return run;
 }
 async #dispatch(operation,args){
  const c=this.#config;need(plain(args),'PARAMS','Use one JSON request object.',400);
  if(operation==='status'){shape(args,[],'status');return this.status();}
  if(operation==='artifacts'){
   shape(args,['offset','limit'],'artifact page');const offset=integer(args.offset??0,0,100000,'artifact offset'),limit=integer(args.limit??50,1,100,'artifact page size');
   let names=[];try{names=(await readdir(join(c.exportsDirectory,'records'))).filter(n=>/^[a-z0-9][a-z0-9_-]{0,63}\.json$/.test(n)).sort();}catch(error){if(error.code!=='ENOENT')throw error;}
   const items=[];for(const name of names.slice(offset,offset+limit)){const value=await readJSON(c.exportsDirectory,'records/'+name);items.push(visibleResult(value));}
   return {offset,total:names.length,items,nextOffset:offset+items.length<names.length?offset+items.length:null};
  }
  if(operation==='artifact'){shape(args,['artifact'],'artifact');return publicArtifact((await this.#record(args.artifact,{verify:true})).record);}
  if(operation.startsWith('publisher-')){
   const selected=declared(c,'publishers',args.publisher),directory=selected.directory;
   if(operation==='publisher-inspect'){shape(args,['publisher'],'publisher inspection');return publisher.inspectSubscription(directory);}
   if(operation==='publisher-editions'){shape(args,['publisher','offset','limit'],'edition page');return publisher.subscriptionEditions(directory,args);}
   if(operation==='publisher-rows'){shape(args,['publisher','revision','kind','offset','limit'],'publisher rows');return publisher.subscriptionRows(directory,args);}
   if(operation==='publisher-cancel'){shape(args,['publisher','requestId'],'cancel request');return publisher.cancelSubscriptionRequest(directory,args);}
   if(operation==='publisher-create'||operation==='publisher-append'){
    shape(args,operation==='publisher-create'?['publisher','collection','requestId','title','fields']:['publisher','collection','requestId','expectedRevision','note','allowScopeChange'],'publisher operation');
    const original=declared(c,'collections',args.collection),{publisher:ignore,collection:unused,...input}=args;
    return publisher[operation==='publisher-create'?'createSubscription':'appendSubscription']({directory,...input,collectionDirectory:original.directory,collectionSha256:original.sha256});
   }
   if(operation==='publisher-delivery'){
    shape(args,['publisher','artifact','fromRevision','toRevision'],'selected delivery');integer(args.toRevision,1,LIMITS.editions,'selected ending edition');integer(args.fromRevision??0,0,LIMITS.editions,'starting edition');
    return this.#export('transfer',args.artifact,args,output=>publisher.exportSubscription(directory,{output,fromRevision:args.fromRevision??0,toRevision:args.toRevision}));
   }
   if(operation==='publisher-source'){
    shape(args,['publisher','artifact','revision'],'original source export');integer(args.revision,1,LIMITS.editions,'source edition');
    return this.#export('original',args.artifact,args,output=>publisher.exportSubscriptionOriginal(directory,{revision:args.revision,output}));
   }
   if(operation==='publisher-backup'){
    shape(args,['publisher','artifact','expectedRevision'],'publisher backup');integer(args.expectedRevision,0,LIMITS.editions,'selected publisher edition');
    return this.#export('publisher-backup',args.artifact,args,output=>publisher.subscriptionBackup(directory,{output,expectedRevision:args.expectedRevision}));
   }
   if(operation==='publisher-restore'){
    shape(args,['publisher','input','artifact'],'publisher restore');const input=await this.#input(args,['publisher-backup']);
    return publisher.restoreSubscription({directory,source:input.directory,expectedSha256:input.sha256});
   }
  }
  const destination=declared(c,'customers',args.customer),directory=destination.directory;
  if(operation==='customer-inspect'){shape(args,['customer'],'customer inspection');return customer.inspectSubscriptionCustomer(directory);}
  if(operation==='customer-rows'){shape(args,['customer','offset','limit'],'customer rows');return customer.subscriptionCustomerRows(directory,args);}
  if(operation==='customer-receive'){
   shape(args,['customer','input','artifact'],'customer receiving');const input=await this.#input(args,['transfer']);
   return customer.receiveSubscription({directory,transferDirectory:input.directory,expectedSha256:input.sha256});
  }
  if(operation==='customer-restore'){
   shape(args,['customer','input','artifact'],'customer restore');const input=await this.#input(args,['customer-backup','analysis']);
   return input.kind==='analysis'?customer.restoreSubscriptionAnalytical({directory,sourceManifest:join(input.directory,'source.json'),expectedSha256:input.sha256}):
    customer.restoreSubscriptionCustomer({directory,source:input.directory,expectedSha256:input.sha256});
  }
  if(operation==='customer-export'||operation==='customer-backup'){
   shape(args,operation==='customer-export'?['customer','artifact','expectedRevision','expectedEditionSha256','title']:['customer','artifact','expectedRevision','expectedEditionSha256'],'selected customer export');
   integer(args.expectedRevision,1,LIMITS.editions,'selected customer edition');need(HASH.test(args.expectedEditionSha256),'EDITION','Select the actual customer edition SHA256.',400);
   return this.#export(operation==='customer-export'?'analysis':'customer-backup',args.artifact,args,output=>
    customer[operation==='customer-export'?'exportSubscriptionCustomer':'subscriptionCustomerBackup'](directory,{...args,output}));
  }
  if(operation==='analysis-mapping'){
   shape(args,['customer','source','sourceRevision'],'registered Analysis mapping');const current=await customer.inspectSubscriptionCustomer(directory);
   return customer.subscriptionAnalysisMapping(current.definition,{source:args.source,sourceRevision:args.sourceRevision});
  }
  need(false,'OPERATION','The selected operator command has no native handler.',400);
 }
 async close(){this.#closing=true;await Promise.allSettled([...this.#pending]);}
}
export async function openSubscriptionOperator({connection}){return new SubscriptionOperator(typeof connection==='string'?await readSubscriptionConnection(connection):connection);}
