// SPDX-License-Identifier: MIT
// A persistent customer of the existing authenticated operator. It owns no seller or payment engine.
import {constants} from 'node:fs';
import {open,readdir} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile,writeConsoleWorkflowStream,inspectConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
import {RetainedSourceFileReads} from '../../stellar-forge/mcp-merchant-operator/retained-source-files.mjs';
import {readCommissioningLaunch} from './agent-connection.mjs';
import {CUSTOMER_SCHEMA,ID,UUID,SHA,MAX_SOURCE_BYTES,MAX_ARCHIVE_BYTES,MAX_CHUNK_BYTES,MAX_JSON_BYTES,
  plain,stable,need,failure,validateCommissioningCustomerTool,validateCustomerCommand} from './agent-contracts.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
async function saved(path,optional=false,maximum=MAX_JSON_BYTES){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readWorkflowSeriesPrivateFile(path,maximum)));}
  catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
}
async function hashOriginal(handle,maximum){
  const before=await handle.stat({bigint:true});
  need(before.isFile()&&before.size>=0n&&before.size<=BigInt(maximum),'Select a complete ordinary file within its original allowance.','COMMISSIONING_SOURCE_FILE');
  const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let bytes=0;
  while(bytes<Number(before.size)){const got=await handle.read(buffer,0,Math.min(buffer.length,Number(before.size)-bytes),bytes);need(got.bytesRead>0,'The original source ended early.','COMMISSIONING_SOURCE_CHANGED');hash.update(buffer.subarray(0,got.bytesRead));bytes+=got.bytesRead;}
  need(stamp(await handle.stat({bigint:true}))===stamp(before),'The original file changed while being read.','COMMISSIONING_SOURCE_CHANGED');
  return{bytes,sha256:hash.digest('hex'),stamp:stamp(before)};
}
function filename(header,fallback){
  const match=/filename\*=UTF-8''([^;]+)/i.exec(header??'');if(!match)return fallback;
  let name;try{name=decodeURIComponent(match[1]);}catch{return fallback;}
  return name&&name.length<=240&&!/[\/\\\x00-\x1f]/.test(name)&&name!=='.'&&name!=='..'?name:fallback;
}
function sourcePath(file){
  if(file.kind==='installation-archive'){need(UUID.test(file.id??''),'Select the original completed Installation preparation UUID.');return'/api/installation/archive?operationId='+encodeURIComponent(file.id);}
  if(file.kind==='archive'){need(UUID.test(file.id??''),'Select the original completed export UUID.');return'/api/archive?operationId='+encodeURIComponent(file.id);}
  const q=new URLSearchParams({kind:file.kind});if(file.id!==undefined)q.set('id',file.id);if(file.name!==undefined)q.set('name',file.name);return'/api/file?'+q;
}
export class CommissioningCustomerAgent{
  #config;#transport;#reads=new RetainedSourceFileReads({errorPrefix:'COMMISSIONING_CUSTOMER'});
  #queue=Promise.resolve();#closing=false;#closed=false;#close;#controllers=new Set();
  constructor(config,{fetch:transport=globalThis.fetch}={}){this.#config=config;this.#transport=transport;}
  get summary(){return{configured:Boolean(this.#config.facilitatorCommissioning),instances:Object.entries(this.#config.facilitatorCommissioning?.instances??{}).map(([instance,x])=>({instance,label:x.label,jobId:x.jobId,inputs:Object.entries(x.inputs).map(([source,v])=>({source,name:v.name,bytes:v.bytes,sha256:v.sha256})),receivers:Object.keys(x.receivers)}))};}
  #definition(instance){need(typeof instance==='string'&&ID.test(instance),'Select a configured instance alias.');const x=this.#config.facilitatorCommissioning?.instances[instance];need(x,'Select an original instance from merchant_commissioning_instances.','COMMISSIONING_INSTANCE');return x;}
  async #directory(instance){
    const selected=this.#definition(instance);await workflowSeriesPrivateDirectory(this.#config.exportsDirectory);
    const root=await workflowSeriesPrivateDirectory(join(this.#config.exportsDirectory,'facilitator-commissioning'),true);
    const directory=await workflowSeriesPrivateDirectory(join(root,digest(encode({instance,jobId:selected.jobId}))),true);
    for(const name of ['requests','results','uploads','captures','receiving'])await workflowSeriesPrivateDirectory(join(directory,name),true);
    await writeConsoleWorkflowFile(join(directory,'connection.json'),{schema:CUSTOMER_SCHEMA,instance,jobId:selected.jobId});
    return directory;
  }
  async #http(connection,path,{method='GET',body,raw=false,maximum=MAX_JSON_BYTES,binary=false}={}){
    need(!this.#closing,'The customer interface is closing.','COMMISSIONING_CUSTOMER_CLOSING');
    need(typeof path==='string'&&path.startsWith('/api/')&&!path.includes('\r')&&!path.includes('\n'),'Use an original operator API path.');
    const controller=new AbortController();this.#controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),binary?600000:120000);timer.unref?.();
    const dispose=()=>{clearTimeout(timer);this.#controllers.delete(controller);};
    let response,handedOff=false;
    try{
      response=await this.#transport(connection.origin+path,{method,redirect:'error',signal:controller.signal,
        headers:{authorization:'Bearer '+connection.token,...(body!==undefined?{'content-type':raw?'application/octet-stream':'application/json'}:{})},
        ...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
      need(response.url===undefined||response.url===''||new URL(response.url).origin===connection.origin,'The original local listener redirected.','COMMISSIONING_REMOTE_ORIGIN');
      if(binary&&response.ok){handedOff=true;return{response,dispose};}
      const chunks=[];let bytes=0;for await(const chunk of response.body??[]){bytes+=chunk.length;need(bytes<=maximum,'The original response exceeds its complete JSON allowance.','COMMISSIONING_RESPONSE_LIMIT');chunks.push(Buffer.from(chunk));}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      if(!response.ok)throw Object.assign(failure(value.error??'COMMISSIONING_NATIVE_ERROR',value.message??'The original operator rejected this request.'),{status:response.status,body:value});
      return value;
    }catch(e){try{await response?.body?.cancel();}catch{}throw e;}finally{if(!handedOff)dispose();}
  }
  async #connected(instance,work,{allowEmpty=false}={}){
    const definition=this.#definition(instance),directory=await this.#directory(instance),connection=await readCommissioningLaunch(definition.launchFile);
    const state=await this.#http(connection,'/api/state');
    need(state?.schema==='stellar-forge.facilitator-commissioning-operator.v1'&&typeof state.instanceId==='string','Use the original commissioning operator.','COMMISSIONING_OPERATOR_IDENTITY');
    if(state.job){
      need(state.job.id===definition.jobId&&SHA.test(state.job.selectionSha256??''),'The listener retains a different original commissioning job.','COMMISSIONING_JOB_CHANGED');
      await writeConsoleWorkflowFile(join(directory,'job-binding.json'),{jobId:definition.jobId,selectionSha256:state.job.selectionSha256});
    }else need(allowEmpty,'Initialize the host-declared original job before this action.','COMMISSIONING_JOB_REQUIRED');
    return work({definition,directory,connection,state});
  }
  async #retainedRequest(instance,command){
    validateCustomerCommand(command);const definition=this.#definition(instance),directory=await this.#directory(instance);
    if(command.action==='initialize')need(command.payload.id===definition.jobId,'Initialization must use the host-declared original job ID.','COMMISSIONING_JOB_CHANGED');
    const value={schema:CUSTOMER_SCHEMA,instance,jobId:definition.jobId,command};
    await writeConsoleWorkflowFile(join(directory,'requests',command.operationId+'.json'),value);return value;
  }
  async #request(instance,operationId){
    need(UUID.test(operationId),'Select the original operation UUID.');const definition=this.#definition(instance),directory=await this.#directory(instance);
    const selected=await saved(join(directory,'requests',operationId+'.json'),true);
    if(selected){need(selected.schema===CUSTOMER_SCHEMA&&selected.instance===instance&&selected.jobId===definition.jobId&&selected.command.operationId===operationId,'The retained original request belongs to another selection.','COMMISSIONING_REQUEST_CHANGED');validateCustomerCommand(selected.command);}
    return{directory,selected};
  }
  async #saveReceipt(instance,selected,receipt){
    need(receipt?.operationId===selected.command.operationId&&receipt.action===selected.command.action,'The native receipt belongs to a different original command.','COMMISSIONING_RECEIPT_CHANGED');
    const {replayed,...original}=receipt,directory=await this.#directory(instance),value={schema:CUSTOMER_SCHEMA,instance,jobId:selected.jobId,commandSha256:digest(encode(selected.command)),receipt:original};
    await writeConsoleWorkflowFile(join(directory,'results',receipt.operationId+'.json'),value);return original;
  }
  async #localReceipt(instance,selected){
    const value=await saved(join(await this.#directory(instance),'results',selected.command.operationId+'.json'),true);
    if(value){need(value.schema===CUSTOMER_SCHEMA&&value.instance===instance&&value.jobId===selected.jobId&&value.commandSha256===digest(encode(selected.command))&&value.receipt.operationId===selected.command.operationId&&value.receipt.action===selected.command.action,'The retained receipt no longer matches its full original request.','COMMISSIONING_RECEIPT_CHANGED');return value.receipt;}
    return null;
  }
  async #receive(instance,operationId){
    const {selected}=await this.#request(instance,operationId);
    if(selected){const complete=await this.#localReceipt(instance,selected);if(complete)return{state:'COMPLETE',instance,jobId:selected.jobId,request:selected.command,receipt:complete,retained:true};}
    return this.#connected(instance,async({connection})=>{
      const outcome=await this.#http(connection,'/api/receive?operationId='+encodeURIComponent(operationId));
      need(['NOT_FOUND','PENDING','RECONCILIATION_REQUIRED','COMPLETE'].includes(outcome?.state),'The original receiving state is not recognized.','COMMISSIONING_RECEIVING');
      if(outcome.request){validateCustomerCommand(outcome.request);need(outcome.request.operationId===operationId,'The original returned UUID differs.','COMMISSIONING_REQUEST_CHANGED');if(selected)need(stable(selected.command)===stable(outcome.request),'The host retains a different full command under this UUID.','COMMISSIONING_REQUEST_CHANGED');}
      if(outcome.state==='COMPLETE'){
        need(outcome.request,'A completed native outcome needs its original full request.','COMMISSIONING_RECEIPT_CHANGED');
        const adopted=selected??await this.#retainedRequest(instance,outcome.request);await this.#saveReceipt(instance,adopted,outcome.receipt);
      }
      return{...outcome,instance,jobId:this.#definition(instance).jobId,...(selected&&!outcome.request?{request:selected.command,locallyRetained:true}:{})};
    },{allowEmpty:true});
  }
  async #prepare(instance,command){
    const selected=await this.#retainedRequest(instance,command),complete=await this.#localReceipt(instance,selected);
    if(complete)return{state:'COMPLETE',instance,request:command,receipt:complete,retained:true};
    return this.#connected(instance,async({connection})=>{
      const result=await this.#http(connection,'/api/requests',{method:'POST',body:command});
      need(stable(result.request)===stable(command),'Preparation returned a different original command.','COMMISSIONING_REQUEST_CHANGED');
      return{state:'PREPARED',instance,jobId:selected.jobId,...result};
    },{allowEmpty:command.action==='initialize'});
  }
  async #apply(instance,operationId){
    const {selected}=await this.#request(instance,operationId);need(selected,'Prepare the complete original command before applying it.','COMMISSIONING_REQUEST_REQUIRED');
    const complete=await this.#localReceipt(instance,selected);if(complete)return{state:'COMPLETE',instance,request:selected.command,receipt:complete,retained:true};
    return this.#connected(instance,async({connection})=>{
      // Same request first: a previous prepare may never have reached the listener.
      const prepared=await this.#http(connection,'/api/requests',{method:'POST',body:selected.command});
      need(stable(prepared.request)===stable(selected.command),'The host retains another command under this UUID.','COMMISSIONING_REQUEST_CHANGED');
      const receipt=await this.#http(connection,'/api/action',{method:'POST',body:selected.command});
      const retained=await this.#saveReceipt(instance,selected,receipt);
      return{state:'COMPLETE',instance,jobId:selected.jobId,request:selected.command,receipt:retained};
    },{allowEmpty:selected.command.action==='initialize'});
  }
  async #uploadIntent(instance,input){
    need(UUID.test(input.id)&&SHA.test(input.sha256)&&Number.isSafeInteger(input.bytes)&&input.bytes>=0&&input.bytes<=MAX_SOURCE_BYTES,'Retain the exact original source identity.');
    const directory=await this.#directory(instance),value={instance,jobId:this.#definition(instance).jobId,upload:input};
    await writeConsoleWorkflowFile(join(directory,'uploads',input.id+'.json'),value);return value;
  }
  async #uploadSelected(instance,id){
    const value=await saved(join(await this.#directory(instance),'uploads',id+'.json'),true);
    need(value&&value.instance===instance&&value.jobId===this.#definition(instance).jobId&&value.upload.id===id,'Begin this exact source upload before continuing it.','COMMISSIONING_UPLOAD_REQUIRED');return value.upload;
  }
  #checkUpload(expected,value){
    need(value&&value.id===expected.id&&value.name===expected.name&&value.bytes===expected.bytes&&value.sha256===expected.sha256&&Number.isSafeInteger(value.offset)&&value.offset>=0&&value.offset<=expected.bytes&&['UPLOADING','COMPLETE'].includes(value.state),'The original source upload selection changed.','COMMISSIONING_UPLOAD_CHANGED');
    if(value.state==='COMPLETE')need(value.offset===expected.bytes&&value.file?.bytes===expected.bytes&&value.file?.sha256===expected.sha256,'The completed original source differs.','COMMISSIONING_UPLOAD_CHANGED');return value;
  }
  async #import(instance,source,uploadId){
    const original=this.#definition(instance).inputs[source];need(original,'Choose an original host-declared source alias.');
    const handle=await open(original.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const observed=await hashOriginal(handle,MAX_SOURCE_BYTES);need(observed.bytes===original.bytes&&observed.sha256===original.sha256,'The host-declared original input changed.','COMMISSIONING_SOURCE_CHANGED');
      const input={id:uploadId,name:original.name,bytes:original.bytes,sha256:original.sha256};await this.#uploadIntent(instance,input);
      return await this.#connected(instance,async({connection})=>{
        let state=this.#checkUpload(input,await this.#http(connection,'/api/uploads',{method:'POST',body:input}));
        const buffer=Buffer.alloc(MAX_CHUNK_BYTES);
        while(state.state!=='COMPLETE'&&state.offset<input.bytes){
          need(stamp(await handle.stat({bigint:true}))===observed.stamp,'The original input changed during transfer.','COMMISSIONING_SOURCE_CHANGED');
          const offset=state.offset,wanted=Math.min(buffer.length,input.bytes-offset);let used=0;
          while(used<wanted){const part=await handle.read(buffer,used,wanted-used,offset+used);need(part.bytesRead>0,'The original file ended during transfer.','COMMISSIONING_SOURCE_CHANGED');used+=part.bytesRead;}
          state=this.#checkUpload(input,await this.#http(connection,'/api/uploads/'+uploadId+'?offset='+offset,{method:'PUT',body:buffer.subarray(0,used),raw:true}));
          need(state.offset>=offset+used,'The original upload made no progress.','COMMISSIONING_UPLOAD_CHANGED');
        }
        need(stamp(await handle.stat({bigint:true}))===observed.stamp,'The original input changed before completion.','COMMISSIONING_SOURCE_CHANGED');
        state=this.#checkUpload(input,await this.#http(connection,'/api/uploads/'+uploadId+'/complete',{method:'POST',body:{}}));
        return{instance,source,...state};
      },{allowEmpty:true});
    }finally{await handle.close();}
  }
  async #captureDirectory(instance,captureId){
    need(UUID.test(captureId),'Select the original capture UUID.');return workflowSeriesPrivateDirectory(join(await this.#directory(instance),'captures',captureId),true);
  }
  async #manifest(instance,captureId){
    const directory=await this.#captureDirectory(instance,captureId),bytes=await readWorkflowSeriesPrivateFile(join(directory,'manifest.json'),MAX_JSON_BYTES),manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    need(manifest.schema===CUSTOMER_SCHEMA&&manifest.instance===instance&&manifest.jobId===this.#definition(instance).jobId&&manifest.captureId===captureId&&SHA.test(manifest.file?.sha256??'')&&Number.isSafeInteger(manifest.file.bytes)&&manifest.file.bytes>=0&&manifest.file.bytes<=MAX_ARCHIVE_BYTES,'The complete captured original identity changed.','COMMISSIONING_CAPTURE_CHANGED');
    const intent=await saved(join(directory,'request.json')),source=await saved(join(directory,'source.json'));
    need(stable(manifest.request)===stable(intent)&&stable(manifest.source)===stable(source)&&manifest.file.bytes===source.bytes&&manifest.file.sha256===source.sha256,'The complete captured manifest differs from its original request/source.','COMMISSIONING_CAPTURE_CHANGED');
    return{directory,manifest,manifestFile:{name:'manifest.json',bytes:bytes.length,sha256:digest(bytes),contentType:'application/json'}};
  }
  async #capture(args){
    const definition=this.#definition(args.instance);need(args.jobId===definition.jobId,'Select the original configured job.');
    if(args.file.kind==='report')need(Number.isSafeInteger(args.reportRevision),'Select the exact current report revision before capture.');
    const directory=await this.#captureDirectory(args.instance,args.captureId),request={...args};
    await writeConsoleWorkflowFile(join(directory,'request.json'),request);
    if(await saved(join(directory,'manifest.json'),true)){
      const retained=await this.#manifest(args.instance,args.captureId),actual=await inspectConsoleWorkflowFile(join(directory,'content'),retained.manifest.file);
      need(actual.bytes===retained.manifest.file.bytes&&actual.sha256===retained.manifest.file.sha256,'The retained complete file changed.','COMMISSIONING_CAPTURE_CHANGED');
      return{state:'CAPTURED',...retained, directory:undefined,retained:true};
    }
    return this.#connected(args.instance,async({connection,state})=>{
      if(args.file.kind==='report')need(state.job.revision===args.reportRevision,'Refresh the original report revision.','COMMISSIONING_REPORT_CHANGED');
      let exportReceipt,preparationReceipt;
      if(['installation','installation-archive'].includes(args.file.kind)){
        preparationReceipt=await this.#http(connection,'/api/receive?operationId='+encodeURIComponent(args.file.id));
        need(preparationReceipt.state==='COMPLETE'&&['installation-template','installation-prepare'].includes(preparationReceipt.receipt?.action)&&preparationReceipt.receipt.operationId===args.file.id&&preparationReceipt.receipt.result.jobId===args.jobId&&preparationReceipt.receipt.result.selectionSha256===state.job.selectionSha256,'Choose a complete Installation preparation from this exact original job.','COMMISSIONING_INSTALLATION_REQUIRED');
      }
      if(args.file.kind==='archive'){
        exportReceipt=await this.#http(connection,'/api/receive?operationId='+encodeURIComponent(args.file.id));
        need(exportReceipt.state==='COMPLETE'&&exportReceipt.receipt?.action==='export'&&exportReceipt.receipt.operationId===args.file.id&&exportReceipt.receipt.result.jobId===args.jobId&&exportReceipt.receipt.result.selectionSha256===state.job.selectionSha256,'Choose a complete export from this exact original job.','COMMISSIONING_EXPORT_REQUIRED');
      }
      const {response,dispose}=await this.#http(connection,sourcePath(args.file),{binary:true});
      try{
        const size=Number(response.headers.get('content-length')),sha=response.headers.get('x-content-sha256'),maximum=['archive','installation-archive'].includes(args.file.kind)?MAX_ARCHIVE_BYTES:MAX_SOURCE_BYTES;
        need(response.headers.get('content-length')!==null&&Number.isSafeInteger(size)&&size>=0&&size<=maximum&&SHA.test(sha??''),'The original file needs its complete bounded byte count and SHA256.','COMMISSIONING_FILE_IDENTITY');
        need((args.expectedSha256===undefined||sha===args.expectedSha256)&&(args.expectedBytes===undefined||size===args.expectedBytes),'The selected complete file identity changed.','COMMISSIONING_FILE_CHANGED');
        if(args.file.kind==='installation'){
          const selected=preparationReceipt.receipt.result.files.find(x=>x.path===args.file.name);
          need(selected&&selected.bytes===size&&selected.sha256===sha,'The selected complete Installation member changed.','COMMISSIONING_INSTALLATION_CHANGED');
        }
        const source={jobId:args.jobId,selectionSha256:state.job.selectionSha256,file:args.file,bytes:size,sha256:sha,
          filename:filename(response.headers.get('content-disposition'),args.file.kind==='archive'?'commissioning.tar':'original-file'),
          contentType:response.headers.get('content-type')??'application/octet-stream',
          ...(args.file.kind==='report'?{reportRevision:args.reportRevision}:{}),...(exportReceipt?{exportReceipt}: {}),...(preparationReceipt?{preparationReceipt}:{})};
        await writeConsoleWorkflowFile(join(directory,'source.json'),source);
        const body=await writeConsoleWorkflowStream(join(directory,'content'),async handle=>{
          const hash=createHash('sha256');let bytes=0;
          for await(const chunk of response.body??[]){
            bytes+=chunk.length;need(bytes<=size&&bytes<=maximum,'The original file exceeded its declared length.','COMMISSIONING_FILE_CHANGED');hash.update(chunk);
            let offset=0;while(offset<chunk.length){const part=await handle.write(chunk,offset,chunk.length-offset);need(part.bytesWritten>0,'The original file could not be retained.','COMMISSIONING_FILE_WRITE');offset+=part.bytesWritten;}
          }
          need(bytes===size&&hash.digest('hex')===sha,'The complete original file differs from its declared bytes.','COMMISSIONING_FILE_CHANGED');return{bytes,sha256:sha};
        });
        if(args.file.kind==='report'){const now=await this.#http(connection,'/api/state');need(now.job?.id===args.jobId&&now.job.selectionSha256===state.job.selectionSha256&&now.job.revision===args.reportRevision,'The report changed during capture; retain this source and choose the new report under another capture UUID.','COMMISSIONING_REPORT_CHANGED');}
        const manifest={schema:CUSTOMER_SCHEMA,instance:args.instance,jobId:args.jobId,captureId:args.captureId,request,source,
          file:{name:source.filename,bytes:body.bytes,sha256:body.sha256,contentType:source.contentType}};
        await writeConsoleWorkflowFile(join(directory,'manifest.json'),manifest);
        const retained=await this.#manifest(args.instance,args.captureId);return{state:'CAPTURED',manifest:retained.manifest,manifestFile:retained.manifestFile};
      }finally{try{await response.body?.cancel();}catch{}dispose();}
    });
  }
  async #file(args){
    const retained=await this.#manifest(args.instance,args.captureId),file=retained.manifest.file;
    need(retained.manifestFile.sha256===args.expectedManifestSha256&&file.sha256===args.expectedSha256,'Select the exact retained manifest and file SHA256.','COMMISSIONING_CAPTURE_CHANGED');
    return{instance:args.instance,captureId:args.captureId,manifestSha256:retained.manifestFile.sha256,
      ...await this.#reads.read({scope:args.instance+'\0'+args.captureId,key:args.captureId,readId:args.readId,offset:args.offset??0,limit:args.limit??65536,expectedSha256:args.expectedSha256,
        load:async()=>{
          const handle=await open(join(retained.directory,'content'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
          try{const actual=await hashOriginal(handle,MAX_ARCHIVE_BYTES);need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'The retained complete file changed.','COMMISSIONING_CAPTURE_CHANGED');return{handle,size:file.bytes,sha256:file.sha256,filename:file.name,contentType:file.contentType};}
          catch(e){await handle.close();throw e;}
        }})};
  }
  async #receiveArchive(args){
    const definition=this.#definition(args.instance),destination=definition.receivers[args.receiver],retained=await this.#manifest(args.instance,args.captureId);
    need(args.jobId===definition.jobId&&destination&&retained.manifest.source.file.kind==='archive'&&retained.manifestFile.sha256===args.expectedManifestSha256&&retained.manifest.file.sha256===args.expectedSha256,'Select an exact completed original archive and configured receiving destination.','COMMISSIONING_RECEIVE_SELECTION');
    const sourceReceipt=retained.manifest.source.exportReceipt;
    need(sourceReceipt?.state==='COMPLETE'&&sourceReceipt.receipt?.action==='export'&&sourceReceipt.receipt.result.jobId===args.jobId,'The complete archive needs its original export receipt.','COMMISSIONING_RECEIVE_SELECTION');
    const path=join(await this.#directory(args.instance),'receiving',args.receiver+'.json');
    await writeConsoleWorkflowFile(path,{schema:CUSTOMER_SCHEMA,instance:args.instance,jobId:args.jobId,captureId:args.captureId,manifestSha256:args.expectedManifestSha256,archiveSha256:args.expectedSha256,receiver:args.receiver,destination});
    const {receiveOperatorTransfer}=await import('./receive-operator.mjs');
    const outcome=await receiveOperatorTransfer({archive:join(retained.directory,'content'),directory:destination,
      expected:{jobId:args.jobId,transferId:sourceReceipt.receipt.operationId,selectionSha256:retained.manifest.source.selectionSha256,operatorManifestSha256:digest(encode(sourceReceipt.receipt.result)),archiveSha256:retained.manifest.file.sha256,archiveBytes:retained.manifest.file.bytes}});
    need(outcome.jobId===args.jobId&&outcome.transferId===sourceReceipt.receipt.operationId&&outcome.archive.sha256===args.expectedSha256,'The received complete job differs from its original export.','COMMISSIONING_RECEIVE_CHANGED');
    const {directory:privateDirectory,...receipt}=outcome;
    return{state:'RECEIVED',instance:args.instance,receiver:args.receiver,captureId:args.captureId,receipt};
  }
  async #execute(action,args){
    if(action==='instances')return this.summary;
    const definition=this.#definition(args.instance);
    if(args.jobId!==undefined)need(args.jobId===definition.jobId,'Use the original configured job identity.','COMMISSIONING_JOB_CHANGED');
    if(action==='prepare')return this.#prepare(args.instance,args.command);
    if(action==='apply')return this.#apply(args.instance,args.operationId);
    if(action==='receive')return this.#receive(args.instance,args.operationId);
    if(action==='source_import')return this.#import(args.instance,args.source,args.uploadId);
    if(action==='capture')return this.#capture(args);
    if(action==='manifest'){const r=await this.#manifest(args.instance,args.captureId);return{state:'CAPTURED',instance:args.instance,captureId:args.captureId,manifest:r.manifest,manifestFile:r.manifestFile};}
    if(action==='file')return this.#file(args);
    if(action==='file_release'){await this.#reads.release(args.instance+'\0'+args.captureId,args.readId);return{state:'RELEASED',instance:args.instance,captureId:args.captureId,readId:args.readId};}
    if(action==='receive_archive')return this.#receiveArchive(args);
    if(action==='pending'){
      const root=await this.#directory(args.instance),names=(await readdir(join(root,'requests'))).filter(v=>UUID.test(v.slice(0,-5))&&v.endsWith('.json')).sort();
      const offset=args.offset??0,limit=args.limit??25,items=[];
      for(const name of names.slice(offset,offset+limit)){const {selected}=await this.#request(args.instance,name.slice(0,-5));items.push({request:selected.command,receipt:await this.#localReceipt(args.instance,selected)});}
      return{instance:args.instance,jobId:definition.jobId,items,offset,total:names.length,nextOffset:offset+items.length<names.length?offset+items.length:null};
    }
    if(action==='source_begin')await this.#uploadIntent(args.instance,args.upload);
    return this.#connected(args.instance,async({connection,state})=>{
      if(action==='state')return{instance:args.instance,native:state};
      if(action==='installations'){
        const result=await this.#http(connection,'/api/installations');
        need(result.jobId===definition.jobId&&result.selectionSha256===state.job.selectionSha256,'The Installation catalog belongs to another original job.','COMMISSIONING_INSTALLATION_CHANGED');
        return{instance:args.instance,...result};
      }
      if(action==='installation'){
        const q=new URLSearchParams({id:args.operationId,kind:args.kind??'summary',offset:String(args.offset??0),limit:String(args.limit??50)});
        const result=await this.#http(connection,'/api/installation?'+q);
        need(result.preparation?.operationId===args.operationId&&result.preparation.jobId===definition.jobId&&result.preparation.selectionSha256===state.job.selectionSha256,'The selected Installation preparation changed.','COMMISSIONING_INSTALLATION_CHANGED');
        return{instance:args.instance,...result};
      }
      if(action==='release')return{instance:args.instance,release:await this.#http(connection,'/api/release?id='+encodeURIComponent(args.releaseId))};
      if(action==='history'){const q=new URLSearchParams({kind:args.kind??'results',offset:String(args.offset??0),limit:String(args.limit??50),revision:String(args.revision)});const result=await this.#http(connection,'/api/history?'+q);need(result.jobId===definition.jobId&&result.revision===args.revision,'The original history snapshot changed.','COMMISSIONING_HISTORY_CHANGED');return{instance:args.instance,...result};}
      const input=action==='source_begin'?args.upload:await this.#uploadSelected(args.instance,args.uploadId);
      let result;
      if(action==='source_begin')result=await this.#http(connection,'/api/uploads',{method:'POST',body:input});
      else if(action==='source_status')result=await this.#http(connection,'/api/uploads/'+args.uploadId);
      else if(action==='source_complete')result=await this.#http(connection,'/api/uploads/'+args.uploadId+'/complete',{method:'POST',body:{}});
      else if(action==='source_chunk'){
        const raw=Buffer.from(args.data,'base64');need(raw.length<=MAX_CHUNK_BYTES&&raw.toString('base64')===args.data,'Send canonical base64 for an original chunk up to 192 KiB.');
        result=await this.#http(connection,'/api/uploads/'+args.uploadId+'?offset='+args.offset,{method:'PUT',body:raw,raw:true});
      }else throw failure('COMMISSIONING_TOOL','Choose a documented complete customer tool.');
      return{instance:args.instance,...this.#checkUpload(input,result)};
    },{allowEmpty:['state','release','source_begin','source_status','source_chunk','source_complete'].includes(action)});
  }
  call(name,args={}){
    if(this.#closing)return Promise.reject(failure('COMMISSIONING_CUSTOMER_CLOSING','The customer interface is closing.'));
    const action=validateCommissioningCustomerTool(name,args);
    const run=this.#queue.then(()=>this.#execute(action,args));
    this.#queue=run.catch(()=>{});return run;
  }
  requestClose(){this.#closing=true;for(const controller of this.#controllers)controller.abort();}
  close(){
    if(this.#closed)return Promise.resolve();if(this.#close)return this.#close;
    this.requestClose();this.#close=(async()=>{await this.#queue;await this.#reads.close();this.#closed=true;})().catch(e=>{this.#close=undefined;throw e;});return this.#close;
  }
}
