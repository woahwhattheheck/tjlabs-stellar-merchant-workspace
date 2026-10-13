// MIT. Borrow one existing authenticated managed service; never launch a store owner.
import {open,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {RetainedFileReads} from '../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import {createMpcRecoveryClient} from './client.mjs';
import {mpcRecoveryTools} from './catalog.mjs';
import {plain,need,HASH,UUID,MAX_ARCHIVE,canonical,absolute,jsonFile,realDirectory,branch,sha} from './contract.mjs';
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const collections=new Set(['sources','plans','approvals','backups','recoveries','hurricanes','incidents','acceptanceRecords','acceptanceChecks','restoreSchedules','incidentReports','communications']);
function exact(value,keys,required=[]){need(plain(value)&&Object.keys(value).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(value,k)),'PARAMS');}
const definitions=new Map(mpcRecoveryTools((name,_description,properties,required)=>({name,properties,required})).map(v=>[v.name,v]));
export async function readMpcRecoveryConfiguration(file){
 file=absolute(file);const value=await jsonFile(file,2*1024*1024,{privateOnly:true});
 exact(value,['schema','stores','files','storageDirectory'],['schema','stores','storageDirectory']);
 need(value.schema==='stellar-forge.mpc-recovery-workspaces.v1'&&plain(value.stores)&&Object.keys(value.stores).length>=1&&Object.keys(value.stores).length<=32,'CONFIGURATION');
 const configuration={schema:value.schema,storageDirectory:resolve(dirname(file),value.storageDirectory),stores:Object.create(null),files:Object.create(null)};
 await realDirectory(configuration.storageDirectory,{privateOnly:true});
 for(const[alias,v]of Object.entries(value.stores)){
  need(ALIAS.test(alias),'ALIAS');exact(v,['label','connectionFile','storeId','storeDirectory','timeoutMs'],['connectionFile','storeId','storeDirectory']);
  need(UUID.test(v.storeId)&&typeof v.connectionFile==='string'&&typeof v.storeDirectory==='string','CONFIGURATION');
  need(v.timeoutMs===undefined||Number.isSafeInteger(v.timeoutMs)&&v.timeoutMs>=1&&v.timeoutMs<=3600000,'TIMEOUT');
  configuration.stores[alias]={label:v.label??alias,connectionFile:resolve(dirname(file),v.connectionFile),storeId:v.storeId,storeDirectory:resolve(dirname(file),v.storeDirectory),timeoutMs:v.timeoutMs??300000};
 }
 need(value.files===undefined||plain(value.files)&&Object.keys(value.files).length<=1000,'CONFIGURATION');
 for(const[alias,v]of Object.entries(value.files??{})){
  need(ALIAS.test(alias),'ALIAS');exact(v,['path','bytes','sha256','label'],['path','bytes','sha256']);
  need(typeof v.path==='string'&&HASH.test(v.sha256)&&Number.isSafeInteger(v.bytes)&&v.bytes>=0&&v.bytes<=104*1024*1024,'FILE');
  configuration.files[alias]={path:resolve(dirname(file),v.path),bytes:v.bytes,sha256:v.sha256,label:v.label??alias};
 }
 return configuration;
}
function basis(row,expected){need(plain(expected)&&row.workspaceId===expected.workspaceId&&row.revision===expected.revision&&row.snapshotSha256===expected.snapshotSha256,'BRANCH_CHANGED');}
function summary(row){const{snapshot,...value}=row;return value;}
export class MerchantMpcRecovery{
 #configuration;#reads=new RetainedFileReads({errorPrefix:'MPC_RECOVERY',maxImmutableFileBytes:MAX_ARCHIVE});
 #pending=new Set();#closing=false;#closePromise;
 constructor(config){this.#configuration=config.mpcRecovery;}
 get summary(){const c=this.#configuration;return{configured:Boolean(c),closing:this.#closing,
  stores:Object.entries(c?.stores??{}).map(([alias,v])=>({alias,label:v.label,storeId:v.storeId,storeDirectory:v.storeDirectory,connection:'ORIGINAL_PRIVATE_FILE'})),
  files:Object.entries(c?.files??{}).map(([alias,v])=>({alias,label:v.label,bytes:v.bytes,sha256:v.sha256})),...this.#reads.summary};}
 #scope(args){return canonical({alias:args.store,...branch(args)});}
 async #file(client,args){
  const selected=args.selection;exact(selected,['kind','sourceId','bytes','sha256','reportKind','options'],['kind']);
  need(['portable','source','report','history'].includes(selected.kind),'FILE_KIND');
  const dir=await mkdtemp(join(this.#configuration.storageDirectory,'mpc-recovery-read-')),path=join(dir,'content');let writer,reader;
  try{
   writer=await open(path,'wx',0o600);let position=0;
   const write=async chunk=>{let at=0;while(at<chunk.length){const r=await writer.write(chunk,at,chunk.length-at,position+at);need(r.bytesWritten>0,'FILE_WRITE');at+=r.bytesWritten;}position+=chunk.length;need(position<=MAX_ARCHIVE,'FILE_CAPACITY');};
   const selection={id:args.branchId,expected:args.expected};let result,name,type='application/json';
   if(selected.kind==='source'){
    result=await client.downloadSource({...selection,sourceId:selected.sourceId,bytes:selected.bytes,sha256:selected.sha256},write);name='MPC_Original_Source.bin';type=result.mediaType;
   }else{
    let value;
    if(selected.kind==='portable'){value=await client.exportBranch(selection);name='MPC_Recovery_Workspace.json';}
    if(selected.kind==='report'){need(typeof selected.reportKind==='string','REPORT');value=await client.report({...selection,kind:selected.reportKind,options:selected.options??{}});name='MPC_Recovery_'+selected.reportKind+'.json';}
    if(selected.kind==='history'){const pages=[];let total=null,count=0;for await(const page of client.history(selection)){if(total===null)total=page.total;need(total===page.total,'HISTORY_CHANGED');count+=page.items.length;pages.push(...page.items);}need(count===total,'HISTORY_INCOMPLETE');value={...selection,total,items:pages};name='MPC_Complete_Command_History.json';}
    const body=Buffer.from(canonical(value));need(body.length<=MAX_ARCHIVE,'FILE_CAPACITY');await write(body);result={bytes:body.length,sha256:sha(body)};
   }
   need(result.bytes===position,'FILE_INCOMPLETE');await writer.sync();await writer.close();writer=null;
   reader=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);await unlink(path);await rmdir(dir);const handle=reader;reader=null;
   return{readonlyFileHandle:handle,bytes:result.bytes,sha256:result.sha256,name,type};
  }finally{
   const errors=[];for(const closer of [()=>writer?.close(),()=>reader?.close(),()=>unlink(path),()=>rmdir(dir)])try{await closer();}catch(e){if(e.code!=='ENOENT')errors.push(e);}
   if(errors.length)throw new AggregateError(errors,'Original file cleanup incomplete.');
  }
 }
 async #run(name,args){
  if(name==='merchant_mpc_recovery_stores')return this.summary;
  const c=this.#configuration,selected=c?.stores?.[args.store];need(selected,'STORE_NOT_CONFIGURED');
  need(args.storeId===selected.storeId&&absolute(args.storeDirectory)===selected.storeDirectory,'STORE_CHANGED');
  const action=name.slice('merchant_mpc_recovery_'.length);
  if(action==='file_release'){await this.#reads.release(this.#scope(args),args.readId);return{released:true,readId:args.readId};}
  const client=createMpcRecoveryClient(selected);
  try{
   if(action==='state')return{identity:await client.state(),branches:await client.branches()};
   if(action==='request')return await client.request(args.requestId);
   const selection={id:args.branchId,expected:args.expected};
   if(action==='branch'||action==='records'){
    const row=await client.branch(args.branchId);basis(row,args.expected);const w=row.snapshot.workspace;
    if(action==='branch')return{...summary(row),title:w.title,activePlanId:w.activePlanId,counts:Object.fromEntries([...collections].map(k=>[k,w[k].length])),
     sources:w.sources.map(({content,...source})=>source)};
    need(collections.has(args.collection),'COLLECTION');const offset=args.offset??0,limit=args.limit??100,items=w[args.collection];
    need(Number.isSafeInteger(offset)&&offset>=0&&offset<=items.length&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'PAGE');
    return{...selection,total:items.length,offset,nextOffset:offset+limit<items.length?offset+limit:null,items:items.slice(offset,offset+limit)};
   }
   if(action==='history')return await client.historyPage({...selection,offset:args.offset??0,limit:args.limit??100});
   if(action==='command')return await client.command({...selection,requestId:args.requestId,command:args.command});
   if(action==='proposal')return await client.importProposal({...selection,requestId:args.requestId,input:args.input});
   if(action==='report')return await client.report({...selection,kind:args.kind,options:args.options??{}});
   if(action==='receive'||action==='import_source'){
    const file=c.files[args.fileAlias];need(file&&file.bytes===args.bytes&&file.sha256===args.sha256,'FILE_CHANGED');
    if(action==='receive')return await client.receiveFile({id:args.branchId,label:args.label,origin:args.origin??{},requestId:args.requestId},file.path,file);
    return await client.importSourceFile({...selection,requestId:args.requestId,command:args.command},file.path,file);
   }
   if(action==='file_read')return await this.#reads.read({scope:this.#scope(args),key:canonical({expected:args.expected,selection:args.selection}),kind:'MPC_RECOVERY',directory:c.storageDirectory,
    expectedSha256:args.expectedSha256,offset:args.offset??0,limit:args.limit??65536,readId:args.readId,load:()=>this.#file(client,args)});
   need(false,'TOOL');
  }finally{await client.close();}
 }
 call(name,args={}){
  need(!this.#closing,'CLOSING');const def=definitions.get(name);need(def,'TOOL');exact(args,Object.keys(def.properties),def.required);
  const frozen=JSON.parse(canonical(args)),promise=Promise.resolve().then(()=>this.#run(name,frozen));this.#pending.add(promise);promise.then(()=>this.#pending.delete(promise),()=>this.#pending.delete(promise));return promise;
 }
 close(){this.#closing=true;return this.#closePromise??=(async()=>{await Promise.allSettled([...this.#pending]);await this.#reads.close();})().catch(e=>{this.#closePromise=null;throw e;});}
}
