// MIT. Full programme operations share the original Research attachment and native writers.
import {open,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {exact,failure} from './host-files.mjs';
import {RetainedFileReads} from './retained-file-reads.mjs';
import {RESEARCH_PROGRAMME_PREFIX} from './catalog/research-programmes.mjs';
import {exists,digest} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs';
import {withCustomerOperation,readCustomerJson,retainCustomerBytes}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/files.mjs';
import {readResearchHostFile,openResearchSource}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-files.mjs';
import {QUOTE_REQUEST_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,QUOTE_FILE_LIMIT,id,hash,need,same,fingerprint}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/contracts.mjs';
import {researchQuoteProgrammeJobInput}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/programme-job.mjs';
import {RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/programme-archive.mjs';
import {ResearchQuoteProgrammeTransfers}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/programme-transfer.mjs';

export {RESEARCH_PROGRAMME_PREFIX} from './catalog/research-programmes.mjs';
const SCHEMA='stellar-forge.research-programme-merchant.v1';
const INPUT_LIMIT=QUOTE_CASE_TRANSFER_LIMIT+65536,FILE_LIMIT=Math.max(QUOTE_FILE_LIMIT,INPUT_LIMIT),META_LIMIT=1024*1024;
const clone=value=>structuredClone(value),compact=value=>Buffer.from(JSON.stringify(value));
const fields=(value,names)=>Object.fromEntries(names.filter(name=>value[name]!==undefined).map(name=>[name,value[name]]));
function workspace(value){need(/^research_[a-f0-9]{64}$/.test(value??''),'RESEARCH_PROGRAMME_WORKSPACE_REQUIRED');return value;}
function page(values,{offset=0,limit=20,snapshot}={}){
 need(Number.isSafeInteger(offset)&&offset>=0&&offset<=values.length&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
  'RESEARCH_PROGRAMME_PAGE_INVALID');
 const current=fingerprint(values);need((offset===0||snapshot===current)&&(snapshot===undefined||snapshot===current),
  'RESEARCH_PROGRAMME_INVENTORY_CHANGED');
 const items=values.slice(offset,offset+limit),next=offset+items.length;
 return {offset,limit,total:values.length,snapshot:current,items,nextOffset:next<values.length?next:null};
}
async function saved(root,name,maximum=META_LIMIT){
 const path=join(root,name);if(!await exists(path))return null;
 const value=await readCustomerJson(path,maximum);
 await retainCustomerBytes(root,name,value.body);return value.value;
}
async function retain(root,name,value,maximum=META_LIMIT){
 const body=compact(value);need(body.length<=maximum,'RESEARCH_PROGRAMME_RECORD_TOO_LARGE');
 return retainCustomerBytes(root,name,body);
}
function checkedFile(value){
 exact(value,['kind','id','name','sha256','bytes'],['kind','id','sha256','bytes']);
 need(['JOB','BUNDLE','ARCHIVE'].includes(value.kind),'RESEARCH_PROGRAMME_FILE_KIND_REQUIRED');id(value.id);hash(value.sha256);
 need(Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=(value.kind==='ARCHIVE'?RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT:FILE_LIMIT),
  'RESEARCH_PROGRAMME_FILE_SIZE_INVALID');
 if(value.kind==='ARCHIVE')need(value.name===undefined&&value.bytes>0,'RESEARCH_PROGRAMME_ARCHIVE_SELECTION_REQUIRED');
 else need(typeof value.name==='string'&&value.name.length>0,'RESEARCH_PROGRAMME_FILE_NAME_REQUIRED');
 return clone(value);
}
function record(value,workspaceId,operationId){
 need(value?.schema===SCHEMA&&value.workspaceId===workspaceId&&value.operationId===operationId&&
  value.selectionSha256===fingerprint(value.selection),'RESEARCH_PROGRAMME_OPERATION_CHANGED');return value;
}
function result(value,selected){
 need(value?.schema===SCHEMA&&value.workspaceId===selected.workspaceId&&value.operationId===selected.operationId&&
  value.selectionSha256===selected.selectionSha256&&value.resultSha256===fingerprint(value.result),
  'RESEARCH_PROGRAMME_RESULT_CHANGED');return value;
}

/** Files belong to the declared Merchant exports root; the application owns all native jobs and its listener. */
export class ResearchProgrammeOperations{
 #client;#api;#directory;#workspaceId;#source;#target;#transfers;
 #pending=new Set();#failed=new Set();#serial=new Map();#closed=false;#closing;
 #reads=new RetainedFileReads({errorPrefix:'RESEARCH_PROGRAMME',maxSnapshotBytes:QUOTE_FILE_LIMIT,
  maxImmutableFileBytes:RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT});
 constructor({client,directory,workspaceId,source,target}={}){
  workspace(workspaceId);need(client&&typeof client.customerQuoteProgrammes==='function'&&
   typeof directory==='string'&&directory.startsWith('/'),'RESEARCH_PROGRAMME_ORIGINAL_CLIENT_REQUIRED');
  this.#client=client;this.#api=client.customerQuoteProgrammes();this.#directory=directory;this.#workspaceId=workspaceId;
  this.#source=source;this.#target=target;this.#transfers=new ResearchQuoteProgrammeTransfers();
 }
 #owned(work){
  need(!this.#closed,'RESEARCH_PROGRAMME_MERCHANT_CLOSING');
  const operation=Promise.resolve().then(work);this.#pending.add(operation);
  return operation.catch(error=>{if(typeof error?.close==='function')this.#failed.add(error);throw error;})
   .finally(()=>this.#pending.delete(operation));
 }
 #exclusive(key,work){
  const old=this.#serial.get(key)??Promise.resolve(),next=old.catch(()=>{}).then(work);
  this.#serial.set(key,next);return next.finally(()=>{if(this.#serial.get(key)===next)this.#serial.delete(key);});
 }
 #root(kind,key){return join(this.#directory,kind,key);}
 async #selection(operationId,selection){
  id(operationId);const root=this.#root('operations',operationId),expected={
   schema:SCHEMA,workspaceId:this.#workspaceId,operationId,selection:clone(selection),selectionSha256:fingerprint(selection)};
  return withCustomerOperation(root,async directory=>{
   const original=await saved(directory,'selection.json');
   if(original)need(same(record(original,this.#workspaceId,operationId),expected),'RESEARCH_PROGRAMME_OPERATION_CHANGED');
   else await retain(directory,'selection.json',expected);
   const complete=await saved(directory,'result.json',QUOTE_FILE_LIMIT);
   return {root:directory,record:expected,result:complete?result(complete,expected):null};
  });
 }
 async #complete(selected,value){
  const complete={schema:SCHEMA,workspaceId:this.#workspaceId,operationId:selected.record.operationId,
   selectionSha256:selected.record.selectionSha256,result:clone(value),resultSha256:fingerprint(value)};
  return withCustomerOperation(selected.root,async root=>{
   const prior=await saved(root,'result.json',QUOTE_FILE_LIMIT);
   if(prior)return {...result(prior,selected.record),reused:true};
   await retain(root,'result.json',complete,QUOTE_FILE_LIMIT);return {...complete,reused:false};
  });
 }
 async #operation(operationId){
  id(operationId);const root=this.#root('operations',operationId);
  need(await exists(root),'RESEARCH_PROGRAMME_OPERATION_NOT_FOUND');
  return withCustomerOperation(root,async directory=>{
   const selected=record(await saved(directory,'selection.json'),this.#workspaceId,operationId);
   const complete=await saved(directory,'result.json',QUOTE_FILE_LIMIT);
   return {schema:SCHEMA,workspaceId:this.#workspaceId,operationId,selection:selected.selection,
    selectionSha256:selected.selectionSha256,status:complete?'COMPLETE':'RETAINED',
    result:complete?result(complete,selected):null};
  });
 }
 async #submit(args){
  id(args.id);need((args.input!==undefined)!==(args.source!==undefined),'RESEARCH_PROGRAMME_SELECT_ONE_INPUT');
  let input,source,selector;
  if(args.input!==undefined){
   input=researchQuoteProgrammeJobInput(clone(args.input));
   need(input.id===args.id,'RESEARCH_PROGRAMME_JOB_CHANGED');
   selector={kind:'SUBMIT',id:args.id,inputSha256:fingerprint(input)};
  }else{
   need(typeof this.#source==='function','RESEARCH_PROGRAMME_SOURCE_REQUIRED');
   source=clone(this.#source(args.source,['programme-input']));
   selector={kind:'SUBMIT',id:args.id,source:args.source,path:source.file,sha256:source.sha256};
  }
  return this.#exclusive('operation:'+args.id,async()=>{
   const selected=await this.#selection(args.id,selector);
   input=await withCustomerOperation(selected.root,async root=>{
    let original=await saved(root,'input.json',INPUT_LIMIT);
    if(source){
     // The declared original file is retained byte-for-byte before the normalized
     // native input. Interrupted publication can reopen this copy after donor loss.
     const sourcePath=join(root,'source-input.json'),body=await readResearchHostFile(
      await exists(sourcePath)?sourcePath:source.file,INPUT_LIMIT,{sha256:source.sha256});
     need(digest(body)===source.sha256,'RESEARCH_PROGRAMME_SOURCE_CHANGED');
     await retainCustomerBytes(root,'source-input.json',body);
     const retained=researchQuoteProgrammeJobInput(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)));
     need(retained.id===args.id&&(!original||same(original,retained)),'RESEARCH_PROGRAMME_JOB_CHANGED');
     if(!original){original=retained;await retain(root,'input.json',original,INPUT_LIMIT);}
    }else if(!original){
     original=input;need(original.id===args.id,'RESEARCH_PROGRAMME_JOB_CHANGED');
     await retain(root,'input.json',original,INPUT_LIMIT);
    }
    const checked=researchQuoteProgrammeJobInput(original);
    need(checked.id===args.id&&(selector.inputSha256===undefined||fingerprint(checked)===selector.inputSha256),
     'RESEARCH_PROGRAMME_JOB_CHANGED');
    return checked;
   });
   // Native submit owns the first exact request and asynchronous job. Retrying
   // this source selection keeps that request, even when its donor file moved.
   return this.#api.submit(input);
  });
 }
 async #verifyFile(path,selection){
  const source=await openResearchSource(path,selection.kind==='ARCHIVE'?RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT:FILE_LIMIT,
   {sha256:selection.sha256});
  this.#failed.add(source);let failure;
  try{need(source.bytes===selection.bytes,'RESEARCH_PROGRAMME_FILE_CHANGED');}
  catch(error){failure=error;}
  try{await source.close();this.#failed.delete(source);}catch(error){failure??=error;}
  if(failure)throw failure;
 }
 async #retained(exportId){
  hash(exportId);const root=this.#root('files',exportId);
  need(await exists(root),'RESEARCH_PROGRAMME_FILE_NOT_FOUND');
  return withCustomerOperation(root,async directory=>{
   const selected=await saved(directory,'selection.json');
   need(selected?.schema===SCHEMA&&selected.workspaceId===this.#workspaceId&&
    selected.exportId===exportId&&fingerprint(checkedFile(selected.selection))===exportId,
    'RESEARCH_PROGRAMME_FILE_CHANGED');
   const complete=await saved(directory,'file.json',QUOTE_FILE_LIMIT);
   need(complete?.schema===SCHEMA&&complete.workspaceId===this.#workspaceId&&complete.exportId===exportId&&
    complete.file?.sha256===selected.selection.sha256&&complete.file.bytes===selected.selection.bytes&&
    typeof complete.file.name==='string'&&!/[\\/\u0000-\u001f\u007f]/.test(complete.file.name),
    'RESEARCH_PROGRAMME_FILE_INCOMPLETE');
   return {root:directory,selection:selected.selection,record:complete,path:join(directory,'payload')};
  });
 }
 async #retainFile(args){
  const selection=checkedFile(fields(args,['kind','id','name','sha256','bytes'])),exportId=fingerprint(selection),
   root=this.#root('files',exportId);
  return this.#exclusive('file:'+exportId,()=>withCustomerOperation(root,async directory=>{
   const expected={schema:SCHEMA,workspaceId:this.#workspaceId,exportId,selection},
    original=await saved(directory,'selection.json');
   if(original)need(same(original,expected),'RESEARCH_PROGRAMME_FILE_CHANGED');
   else await retain(directory,'selection.json',expected);
   const path=join(directory,'payload'),complete=await saved(directory,'file.json',QUOTE_FILE_LIMIT);
   if(complete){
    need(complete.schema===SCHEMA&&complete.workspaceId===this.#workspaceId&&complete.exportId===exportId&&
     complete.file?.bytes===selection.bytes&&complete.file.sha256===selection.sha256,
     'RESEARCH_PROGRAMME_FILE_CHANGED');
    await this.#verifyFile(path,selection);return {...complete,reused:true};
   }
   let metadata=await saved(directory,'source.json',QUOTE_FILE_LIMIT);
   if(!metadata){
    metadata=selection.kind==='ARCHIVE'?await this.#api.archive(selection.id):
     selection.kind==='JOB'?await this.#api.jobFileInfo(selection.id,selection.name):await this.#api.fileInfo(selection.id,selection.name);
    const descriptor=selection.kind==='ARCHIVE'?metadata:metadata.descriptor;
    need(metadata.workspaceId===this.#workspaceId&&descriptor.sha256===selection.sha256&&descriptor.bytes===selection.bytes,
     'RESEARCH_PROGRAMME_FILE_CHANGED');
    await retain(directory,'source.json',metadata,QUOTE_FILE_LIMIT);
   }
   const descriptor=selection.kind==='ARCHIVE'?metadata:metadata.descriptor;
   need(metadata.workspaceId===this.#workspaceId&&descriptor.sha256===selection.sha256&&descriptor.bytes===selection.bytes,
    'RESEARCH_PROGRAMME_FILE_CHANGED');
   if(!await exists(path)){
    const options={file:path,expectedSha256:selection.sha256,expectedBytes:selection.bytes};
    if(selection.kind==='ARCHIVE')await this.#api.downloadArchive(selection.id,options);
    else if(selection.kind==='JOB')await this.#api.downloadJobFile(selection.id,selection.name,options);
    else await this.#api.download(selection.id,selection.name,options);
   }
   await this.#verifyFile(path,selection);
   const name=selection.kind==='ARCHIVE'?metadata.name:'research-programme-'+selection.kind.toLowerCase()+'-'+exportId+'.bin';
   const value={schema:SCHEMA,workspaceId:this.#workspaceId,exportId,selection,
    file:{name,bytes:selection.bytes,sha256:selection.sha256,
     contentType:selection.kind==='ARCHIVE'?'application/gzip':'application/octet-stream'},source:metadata};
   await retain(directory,'file.json',value,QUOTE_FILE_LIMIT);return {...value,reused:false};
  }));
 }
 async #files(args){
  const root=this.#root('files',''),names=await exists(root)?(await readdir(root)).filter(name=>/^[a-f0-9]{64}$/.test(name)).sort():[];
  const rows=[];
  for(const exportId of names){
   const directory=this.#root('files',exportId),value=await withCustomerOperation(directory,r=>saved(r,'file.json',QUOTE_FILE_LIMIT));
   if(!value)continue;
   need(value.schema===SCHEMA&&value.workspaceId===this.#workspaceId&&value.exportId===exportId,
    'RESEARCH_PROGRAMME_FILE_CHANGED');
   rows.push({exportId,selection:value.selection,file:value.file});
  }
  return {schema:SCHEMA,workspaceId:this.#workspaceId,...page(rows,args)};
 }
 async #read(args){
  const selected=await this.#retained(args.exportId),file=selected.record.file;
  return this.#reads.read({scope:this.#workspaceId,key:args.exportId,kind:'programme-'+selected.selection.kind,
   directory:selected.root,expectedSha256:file.sha256,readId:args.readId,offset:args.offset??0,limit:args.limit??65536,
   load:async()=>({readonlyFileHandle:await open(selected.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0)),
    name:file.name,type:file.contentType,bytes:file.bytes,sha256:file.sha256})});
 }
 async #transfer(args,local){
  id(args.operationId);id(args.uploadId);hash(args.sha256);
  need(Number.isSafeInteger(args.bytes)&&args.bytes>0&&args.bytes<=RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT,
   'RESEARCH_PROGRAMME_ARCHIVE_SELECTION_REQUIRED');
  const selection=fields(args,local?['operationId','uploadId','source','sha256','bytes']:
   ['operationId','archiveId','sha256','bytes','manifestSha256','destination','destinationWorkspaceId','uploadId']);
  selection.kind=local?'UPLOAD_SOURCE':'TRANSFER';
  let source;
  if(local){
   source=clone(this.#source(args.source,['programme-archive']));
   need(source.sha256===args.sha256,'RESEARCH_PROGRAMME_ARCHIVE_CHANGED');
   selection.sourcePath=source.file;
  }else{workspace(args.destinationWorkspaceId);id(args.archiveId);hash(args.manifestSha256);}
  return this.#exclusive('operation:'+args.operationId,async()=>{
   const selected=await this.#selection(args.operationId,selection);
   if(selected.result)return {...selected.result,reused:true};
   let value;
   if(local)value=await this.#transfers.uploadFile(this.#api,{path:source.file,uploadId:args.uploadId,
    bytes:args.bytes,sha256:args.sha256});
   else{
    need(typeof this.#target==='function','RESEARCH_PROGRAMME_DESTINATION_REQUIRED');
    value=await this.#target(args.destination,async target=>{
     need(target.workspaceId===args.destinationWorkspaceId,'RESEARCH_PROGRAMME_DESTINATION_CHANGED');
     return this.#transfers.transferTo(this.#api,target.client.customerQuoteProgrammes(),{
      archiveId:args.archiveId,uploadId:args.uploadId,bytes:args.bytes,sha256:args.sha256,
      manifestSha256:args.manifestSha256});
    });
   }
   return this.#complete(selected,value);
  });
 }
 call(name,arguments_={}){
  const args=clone(arguments_);
  return this.#owned(async()=>{
   need(name.startsWith(RESEARCH_PROGRAMME_PREFIX),'RESEARCH_PROGRAMME_COMMAND_INVALID');
   const command=name.slice(RESEARCH_PROGRAMME_PREFIX.length),a=fields(args,Object.keys(args).filter(key=>key!=='workspace'));
   if(command==='info'){exact(a,[],[]);return this.#api.info();}
   workspace(a.workspaceId);need(a.workspaceId===this.#workspaceId,'RESEARCH_PROGRAMME_WORKSPACE_CHANGED');delete a.workspaceId;
   switch(command){
    case 'jobs':return this.#api.jobs(a);
    case 'job':return this.#api.job(a.id);
    case 'resume':return this.#api.resume(a.id);
    case 'receiving':return this.#api.receiving(a.id);
    case 'state':{
     const value=await this.#api.programme(a.programmeId);
     const stepPage=page(value.steps,fields(a,['offset','limit','snapshot']));
     return {...value,steps:undefined,nativeSnapshot:value.snapshot,snapshot:stepPage.snapshot,stepPage};
    }
    case 'step':return this.#api.step(a.programmeId,a.stepId);
    case 'submit':return this.#submit(a);
    case 'bundle':{
     const value=await this.#api.bundle(a.id,{manifestSha256:a.manifestSha256});
     return {schema:value.schema,directory:value.directory,manifestSha256:value.manifestSha256,
      manifestBytes:value.manifestBytes,selection:value.selection,fileCount:value.files.length};
    }
    case 'files':return this.#api.files(a.id,fields(a,['offset','limit','snapshot']));
    case 'file_info':
     if(a.kind==='ARCHIVE'){need(a.name===undefined,'RESEARCH_PROGRAMME_ARCHIVE_SELECTION_REQUIRED');return this.#api.archive(a.id);}
     need(['JOB','BUNDLE'].includes(a.kind)&&typeof a.name==='string','RESEARCH_PROGRAMME_FILE_NAME_REQUIRED');
     return a.kind==='JOB'?this.#api.jobFileInfo(a.id,a.name):this.#api.fileInfo(a.id,a.name);
    case 'retain':return this.#retainFile(a);
    case 'retained':return this.#files(a);
    case 'read':return this.#read(a);
    case 'release':await this.#reads.release(this.#workspaceId,a.readId);return {state:'RELEASED',readId:a.readId};
    case 'archive':return this.#api.archive(a.id);
    case 'upload':return this.#api.upload(a.id);
    case 'upload_source':return this.#transfer(a,true);
    case 'transfer':return this.#transfer(a,false);
    case 'transfer_status':return this.#operation(a.operationId);
    default:throw failure('TOOL_NOT_FOUND','Unknown original Research programme operation.');
   }
  });
 }
 close(){
  this.#closed=true;if(this.#closing)return this.#closing;
  this.#closing=(async()=>{
   await Promise.allSettled([...this.#pending]);
   const results=await Promise.allSettled([this.#reads.close(),this.#transfers.close(),
    ...[...this.#failed].map(async owner=>{await owner.close();this.#failed.delete(owner);})]);
   const failures=results.filter(value=>value.status==='rejected').map(value=>value.reason);
   if(failures.length)throw new AggregateError(failures,'Original programme file owners remain open.',{cause:failures[0]});
   return {state:'CLOSED',workspaceId:this.#workspaceId,listenerOwnership:'ORIGINAL_APPLICATIONS_WORKSPACE'};
  })().catch(error=>{this.#closing=null;throw error;});
  return this.#closing;
 }
}
