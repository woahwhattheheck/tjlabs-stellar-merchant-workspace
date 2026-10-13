// MIT. Customer-agent access to the SAME original Bloccpay HTTP writer.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { need, directory, lease, writeExact, writeStream, readJSON, jsonBytes,
 canonical, fileDescriptor, publicError } from './source/lib/files.mjs';
import { CONNECTION_SCHEMA, HASH, plain, exact, equal, digest, canonicalPath, readJSONBound,
 readHostConnection, hostToken, responseBytes, hostJSON, verifyHost, closeRetainedFile, UUID } from './host-connection.mjs';
export { bloccpayTools } from './customer-agent-catalog.mjs';

const SCHEMA='stellar-forge.bloccpay-agent-connection.v1';
const alias=value=>{need(typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value),'BLOCCPAY_ALIAS_INVALID');return value;};
const requestId=value=>{need(typeof value==='string'&&value.length>0&&value.length<200,'REQUEST_ID_REQUIRED');return value;};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>{need(Number.isSafeInteger(value)&&value>=min&&value<=max,'BLOCCPAY_INTEGER_INVALID');return value;};
const copy=value=>JSON.parse(JSON.stringify(value));
const short=file=>({path:file.path,bytes:file.bytes,sha256:file.sha256});

export async function readBloccpayAgentConfiguration(filename){
 filename=resolve(filename);const selected=await readJSONBound(filename,{privateOnly:true});
 let value=selected.value;
 if(value.schema===CONNECTION_SCHEMA)value={schema:SCHEMA,hosts:{default:{connectionFile:filename}}};
 exact(value,['schema','hosts'],['schema','hosts']);
 need(value.schema===SCHEMA&&plain(value.hosts)&&Object.keys(value.hosts).length>0&&Object.keys(value.hosts).length<=32,'BLOCCPAY_AGENT_CONFIGURATION_INVALID');
 const hosts={};const seen=new Set();
 for(const [name,entry] of Object.entries(value.hosts)){
  alias(name);exact(entry,['label','connectionFile','imports'],['connectionFile']);
  need(typeof entry.connectionFile==='string','BLOCCPAY_CONNECTION_REQUIRED');
  const path=resolve(dirname(filename),entry.connectionFile),host=await readHostConnection(path);
  need(!seen.has(host.value.workspaceId),'BLOCCPAY_DUPLICATE_WORKSPACE');seen.add(host.value.workspaceId);
  const imports={};need(entry.imports===undefined||plain(entry.imports),'BLOCCPAY_IMPORTS_INVALID');
  for(const [key,source] of Object.entries(entry.imports??{})){
   alias(key);exact(source,['path','bytes','sha256','filename','contentType'],['path','bytes','sha256']);
   const path=resolve(dirname(filename),source.path);await canonicalPath(path,'file');
   integer(source.bytes,0,64*1024*1024);need(HASH.test(source.sha256),'BLOCCPAY_IMPORT_HASH_REQUIRED');
   const actual=await fileDescriptor(path,path);need(actual.bytes===source.bytes&&actual.sha256===source.sha256,'BLOCCPAY_IMPORT_CHANGED');
   need(source.filename===undefined||typeof source.filename==='string'&&source.filename.length<512,'BLOCCPAY_FILENAME_INVALID');
   need(source.contentType===undefined||typeof source.contentType==='string'&&source.contentType.length<256&&!/[\r\n]/.test(source.contentType),'BLOCCPAY_CONTENT_TYPE_INVALID');
   imports[key]={...source,path,filename:source.filename??key,contentType:source.contentType??'application/octet-stream'};
  }
  hosts[name]={label:entry.label??name,connectionFile:path,connection:host.value,connectionDescriptor:host.file,imports};
 }
 return {schema:SCHEMA,hosts};
}

export class MerchantBloccpay {
 #config;#fetch;#pending=new Set();#controller=new AbortController();#closing=false;#closed=false;#close=null;
 #known=new Map();#tails=new Map();#leases=new Set();#verifiedDownloads=new Map();
 constructor(config,options={}){this.#config=config;this.#fetch=options?.fetchImpl??fetch;}
 get summary(){return {configured:!!this.#config.bloccpay,pending:this.#pending.size,closing:this.#closing,closed:this.#closed,
  workspaces:Object.entries(this.#config.bloccpay?.hosts??{}).map(([workspace,row])=>({workspace,label:row.label,
   workspaceId:row.connection.workspaceId,instanceId:row.connection.instanceId,sourceManifestSha256:row.connection.sourceManifestSha256,
   imports:Object.keys(row.imports)}))};}
 #entry(name){const value=this.#config.bloccpay?.hosts?.[alias(name)];need(value,'BLOCCPAY_HOST_NOT_CONFIGURED');return value;}
 async #bind(entry){
  this.#controller.signal.throwIfAborted();
  const current=await readHostConnection(entry.connectionFile);
  need(equal(current.value,entry.connection)&&current.file.bytes===entry.connectionDescriptor.bytes&&current.file.sha256===entry.connectionDescriptor.sha256,'BLOCCPAY_CONNECTION_CHANGED');
  return verifyHost(entry.connection,{signal:this.#controller.signal,fetchImpl:this.#fetch});
 }
 async #root(entry){
  const base=await canonicalPath(this.#config.exportsDirectory,'directory',true);
  const root=join(base,'bloccpay-agent',entry.connection.workspaceId);
  await directory(root);await canonicalPath(root,'directory',true);return root;
 }
 #json(entry,route,options={}){return hostJSON(entry.connection,route,{...options,signal:this.#controller.signal,fetchImpl:this.#fetch});}
 #serial(key,work){
  const previous=this.#tails.get(key)??Promise.resolve();
  const next=previous.catch(()=>{}).then(work);this.#tails.set(key,next);
  next.finally(()=>{if(this.#tails.get(key)===next)this.#tails.delete(key);}).catch(()=>{});return next;
 }
 async #keep(resultFile,result){
  const value=copy(result),prior=this.#known.get(resultFile);
  need(!prior||equal(prior,value),'BLOCCPAY_RESULT_CONFLICT');
  this.#known.set(resultFile,value);
  await writeExact(resultFile,jsonBytes(value));
 }
 async #stored(filename){try{return (await readJSONBound(filename,{privateOnly:true})).value;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 async #upload(entry,record,accepted){
  const selected=entry.imports[record.sourceImport];need(selected&&equal(selected,record.source),'BLOCCPAY_IMPORT_SELECTION_CHANGED');
  await canonicalPath(selected.path,'file');
  const handle=await open(selected.path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let stream=null,observed=null,completed=null,first=null,value;
  try{
   const before=await handle.stat({bigint:true});need(before.isFile()&&before.size===BigInt(selected.bytes),'BLOCCPAY_IMPORT_CHANGED');
   stream=handle.createReadStream({autoClose:false});
   const hash=createHash('sha256');let bytes=0;
   observed=new Transform({transform(chunk,encoding,done){hash.update(chunk);bytes+=chunk.length;done(null,chunk);}});
   completed=pipeline(stream,observed,{signal:this.#controller.signal});completed.catch(()=>{});
   const args={...record.args,requestId:record.requestId,...(record.expectedRevision===undefined?{}:{expectedRevision:record.expectedRevision}),filename:selected.filename,
    ...(record.method==='file.retain'?{}:{method:record.method})};
   const route=(record.method==='file.retain'?'/api/files/upload':'/api/source-import')+'?args='+encodeURIComponent(JSON.stringify(args));
   const response=await this.#fetch(new URL(route,entry.connection.origin),{
    method:'POST',redirect:'error',duplex:'half',signal:this.#controller.signal,
    headers:{Authorization:'Bearer '+await hostToken(entry.connection),'X-Bloccpay-Workspace-Id':entry.connection.workspaceId,
     'Content-Type':selected.contentType,'Content-Length':String(selected.bytes),'X-Content-Sha256':selected.sha256},
    body:Readable.toWeb(observed)});
   let raw;try{raw=await responseBytes(response);}finally{if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});}
   value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(!response.ok){const problem=value.error??value;throw Object.assign(new Error(problem.message??'Original upload failed.'),{code:problem.code??'BLOCCPAY_UPLOAD_FAILED',native:value});}
   need(value.requestId===record.requestId&&UUID.test(value.workspaceId??''),'BLOCCPAY_NATIVE_RECEIPT_CHANGED');
   accepted(value);
   await completed;
   const after=await handle.stat({bigint:true});
   need(bytes===selected.bytes&&hash.digest('hex')===selected.sha256&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'BLOCCPAY_IMPORT_CHANGED');
  }catch(error){first=error;}
  finally{
   if(stream){stream.destroy();observed?.destroy();try{await completed;}catch(error){first??=error;}}
   first=await closeRetainedFile(handle,first);
  }
  if(first)throw first;return value;
 }
 async #validateReceipt(entry,record,result,live){
  need(plain(result)&&result.requestId===record.requestId&&UUID.test(result.workspaceId??'')&&
   Number.isSafeInteger(result.revision)&&result.revision>=0&&Object.hasOwn(result,'result'),'BLOCCPAY_NATIVE_RECEIPT_CHANGED');
  live??=await this.#bind(entry);
  need(result.workspaceId===entry.connection.workspaceId||plain(live.workspace.receivedFrom),'BLOCCPAY_RECEIPT_WORKSPACE_CHANGED');
  const row=await this.#json(entry,'/api/item?'+new URLSearchParams({table:'requests',id:record.requestId}));
  const method=record.kind==='command'?record.command.method:record.method;
  const args=record.kind==='command'?record.command.args:{...record.args,fileId:'private-'+record.source.sha256};
  need(row.id===record.requestId&&row.method===method&&equal(row.args,args)&&row.status==='COMPLETE'&&
   equal(row.result,result),'BLOCCPAY_NATIVE_RECEIPT_CHANGED');
  return result;
 }
 async #mutate(entry,record){
  requestId(record.requestId);
  const root=await this.#root(entry),key=digest(record.requestId),place=join(root,'requests',key);
  await directory(place);
  return this.#serial(entry.connection.workspaceId+':'+key,async()=>{
   const guard=await lease(root,'agent-request-'+key);this.#leases.add(guard);
   let first=null,result;
   try{
    this.#controller.signal.throwIfAborted();
    const bound={schema:'stellar-forge.bloccpay-agent-request.v1',workspaceId:entry.connection.workspaceId,request:record};
    await writeExact(join(place,'request.json'),jsonBytes(bound));
    const resultFile=join(place,'result.json');
    const known=this.#known.get(resultFile)??await this.#stored(resultFile);
    if(known){await this.#validateReceipt(entry,record,known);await this.#keep(resultFile,known);result=known;}
    else {
    const live=await this.#bind(entry);
    if(record.kind==='command'){
     result=await this.#json(entry,'/api/command',{method:'POST',body:record.command});
     need(result.requestId===record.requestId&&UUID.test(result.workspaceId??''),'BLOCCPAY_NATIVE_RECEIPT_CHANGED');
     this.#known.set(resultFile,copy(result));
    }else result=await this.#upload(entry,record,value=>this.#known.set(resultFile,copy(value)));
    await this.#validateReceipt(entry,record,result,live);
    await this.#keep(resultFile,result);
    }
   }catch(error){first=error;}
   finally{try{await guard.release();this.#leases.delete(guard);}catch(error){first??=error;}}
   if(first)throw first;return result;
  });
 }
 async #request(entry,args){
  const root=await this.#root(entry),id=requestId(args.requestId);
  const retained=await this.#stored(join(root,'requests',digest(id),'request.json'));
  if(retained)need(retained.schema==='stellar-forge.bloccpay-agent-request.v1'&&retained.workspaceId===entry.connection.workspaceId&&retained.request.requestId===id,'BLOCCPAY_RETAINED_REQUEST_CHANGED');
  if(args.resume){need(retained,'BLOCCPAY_RETAINED_REQUEST_REQUIRED');return this.#mutate(entry,retained.request);}
  const live=await this.#bind(entry);
  let native=null;try{native=await this.#json(entry,'/api/item?'+new URLSearchParams({table:'requests',id}));}
  catch(error){if(error.code!=='RECORD_NOT_FOUND')throw error;}
  const resultFile=join(root,'requests',digest(id),'result.json');
  const result=this.#known.get(resultFile)??await this.#stored(resultFile);
  if(result){need(retained,'BLOCCPAY_RETAINED_REQUEST_REQUIRED');await this.#validateReceipt(entry,retained.request,result,live);}
  return {workspaceId:entry.connection.workspaceId,requestId:id,retained:!!retained,
   request:retained?.request??null,result:result??null,native,mayResume:!!retained};
 }
 async #download(entry,args){
  need(['file','archive'].includes(args.kind),'BLOCCPAY_DOWNLOAD_KIND_INVALID');requestId(args.id);
  const offset=integer(args.offset??0),limit=integer(args.limit??1048576,1,1048576);
  if(args.expectedSha256!==undefined)need(HASH.test(args.expectedSha256),'BLOCCPAY_DOWNLOAD_HASH_REQUIRED');
  const root=await this.#root(entry),key=digest(canonical({kind:args.kind,id:args.id})),place=join(root,'downloads',key);
  await directory(place);
  return this.#serial('download:'+entry.connection.workspaceId+':'+key,async()=>{
   const guard=await lease(root,'agent-download-'+key);this.#leases.add(guard);
   let first=null,result;
   try{
    const dataPath=join(place,'original.bin'),metaPath=join(place,'download.json');
    let metadata=await this.#stored(metaPath);
    if(!metadata){
     await this.#bind(entry);
     const route=args.kind==='file'?'/api/file/'+encodeURIComponent(args.id):'/api/exports/'+encodeURIComponent(args.id)+'/archive';
     const response=await this.#fetch(new URL(route,entry.connection.origin),{redirect:'error',signal:this.#controller.signal,
      headers:{Authorization:'Bearer '+await hostToken(entry.connection),'X-Bloccpay-Workspace-Id':entry.connection.workspaceId}});
     try{
      if(!response.ok){const body=await responseBytes(response);let error;try{error=JSON.parse(body.toString('utf8'));}catch{}
       throw Object.assign(new Error(error?.error?.message??'Original download failed.'),{code:error?.error?.code??'BLOCCPAY_DOWNLOAD_FAILED'});}
      const sha=response.headers.get('x-content-sha256');
      if(args.kind==='file')need(HASH.test(sha??''),'BLOCCPAY_DOWNLOAD_HASH_REQUIRED');
      const manifest=response.headers.get('x-bloccpay-manifest-sha256');
      if(args.kind==='archive')need(HASH.test(manifest??''),'BLOCCPAY_ARCHIVE_MANIFEST_REQUIRED');
      const file=await writeStream(place,'original.bin',response.body,{maximumBytes:1024**3,expectedSha256:sha??undefined,signal:this.#controller.signal});
      metadata={schema:'stellar-forge.bloccpay-agent-download.v1',workspaceId:entry.connection.workspaceId,kind:args.kind,id:args.id,
       file:{...file,path:dataPath},contentType:response.headers.get('content-type')??'application/octet-stream',
       ...(manifest?{manifestSha256:manifest}:{})};
      await writeExact(metaPath,jsonBytes(metadata));
     }finally{if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});}
    }
    need(metadata.schema==='stellar-forge.bloccpay-agent-download.v1'&&metadata.workspaceId===entry.connection.workspaceId&&metadata.kind===args.kind&&metadata.id===args.id&&metadata.file.path===dataPath,'BLOCCPAY_DOWNLOAD_CHANGED');
    need(Number.isSafeInteger(metadata.file.bytes)&&metadata.file.bytes>=0&&HASH.test(metadata.file.sha256)&&
     (!args.expectedSha256||args.expectedSha256===metadata.file.sha256),'BLOCCPAY_DOWNLOAD_CHANGED');
    await canonicalPath(dataPath,'file',true);
    const handle=await open(dataPath,constants.O_RDONLY|constants.O_NOFOLLOW);
    let body,fileError=null;
    const identity=info=>[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs,info.mode].map(String).join(':');
    try{
     const before=await handle.stat({bigint:true}),key=identity(before);
     need(before.isFile()&&before.size===BigInt(metadata.file.bytes)&&(Number(before.mode)&0o077)===0,'BLOCCPAY_DOWNLOAD_CHANGED');
     const cached=this.#verifiedDownloads.get(dataPath);
     if(!cached||cached.identity!==key||cached.sha256!==metadata.file.sha256){
      const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let at=0;
      while(at<metadata.file.bytes){
       this.#controller.signal.throwIfAborted();
       const next=await handle.read(buffer,0,Math.min(buffer.length,metadata.file.bytes-at),at);
       need(next.bytesRead>0,'BLOCCPAY_DOWNLOAD_CHANGED');hash.update(buffer.subarray(0,next.bytesRead));at+=next.bytesRead;
      }
      need(hash.digest('hex')===metadata.file.sha256&&identity(await handle.stat({bigint:true}))===key,'BLOCCPAY_DOWNLOAD_CHANGED');
     }
     need(offset<=metadata.file.bytes,'BLOCCPAY_DOWNLOAD_OFFSET_INVALID');
     body=Buffer.alloc(Math.min(limit,metadata.file.bytes-offset));let at=0;
     while(at<body.length){const next=await handle.read(body,at,body.length-at,offset+at);need(next.bytesRead>0,'BLOCCPAY_DOWNLOAD_CHANGED');at+=next.bytesRead;}
     need(identity(await handle.stat({bigint:true}))===key,'BLOCCPAY_DOWNLOAD_CHANGED');
     this.#verifiedDownloads.set(dataPath,{identity:key,sha256:metadata.file.sha256});
    }catch(error){fileError=error;}
    fileError=await closeRetainedFile(handle,fileError);
    if(fileError)throw fileError;
    result={...metadata,offset,bytes:body.length,sha256:metadata.file.sha256,totalBytes:metadata.file.bytes,
     nextOffset:offset+body.length<metadata.file.bytes?offset+body.length:null,base64:body.toString('base64')};
   }catch(error){first=error;}
   finally{try{await guard.release();this.#leases.delete(guard);}catch(error){first??=error;}}
   if(first)throw first;return result;
  });
 }
 async #dispatch(name,args){
  need(plain(args),'BLOCCPAY_INPUT_INVALID');
  if(name==='merchant_bloccpay_status'){exact(args,[]);return this.summary;}
  const entry=this.#entry(args.workspace);
  if(name==='merchant_bloccpay_bootstrap'){exact(args,['workspace'],['workspace']);return this.#bind(entry);}
  if(name==='merchant_bloccpay_request'){exact(args,['workspace','requestId','resume'],['workspace','requestId']);need(args.resume===undefined||typeof args.resume==='boolean','BLOCCPAY_INPUT_INVALID');return this.#request(entry,args);}
  if(name==='merchant_bloccpay_command'){
   exact(args,['workspace','command'],['workspace','command']);
   const command=copy(args.command);exact(command,['requestId','expectedRevision','method','args'],['requestId','method','args']);
   requestId(command.requestId);need(typeof command.method==='string'&&plain(command.args),'BLOCCPAY_COMMAND_INVALID');
   if(command.expectedRevision!==undefined)integer(command.expectedRevision);
   need(Buffer.byteLength(JSON.stringify(command))<=1024*1024,'BLOCCPAY_COMMAND_TOO_LARGE');
   return this.#mutate(entry,{kind:'command',requestId:command.requestId,command});
  }
  if(name==='merchant_bloccpay_upload'){
   exact(args,['workspace','sourceImport','requestId','expectedRevision','method','args'],['workspace','sourceImport','requestId','method']);
   const source=entry.imports[alias(args.sourceImport)];need(source,'BLOCCPAY_IMPORT_NOT_CONFIGURED');
   need(['file.retain','source.import','payroll.import'].includes(args.method)&&plain(args.args??{}),'BLOCCPAY_UPLOAD_METHOD_INVALID');
   if(args.expectedRevision!==undefined)integer(args.expectedRevision);
   for(const key of ['requestId','expectedRevision','filename','method','fileId'])need(!Object.hasOwn(args.args??{},key),'BLOCCPAY_UPLOAD_RESERVED_FIELD');
   return this.#mutate(entry,{kind:'upload',sourceImport:args.sourceImport,source:copy(source),requestId:requestId(args.requestId),
    method:args.method,args:copy(args.args??{}),...(args.expectedRevision===undefined?{}:{expectedRevision:args.expectedRevision})});
  }
  if(name==='merchant_bloccpay_download'){exact(args,['workspace','kind','id','expectedSha256','offset','limit'],['workspace','kind','id']);return this.#download(entry,args);}
  await this.#bind(entry);
  if(name==='merchant_bloccpay_item'){exact(args,['workspace','table','id'],['workspace','table','id']);return this.#json(entry,'/api/item?'+new URLSearchParams({table:args.table,id:args.id}));}
  if(name==='merchant_bloccpay_list'){
   exact(args,['workspace','table','cursor','limit','filters'],['workspace','table']);need(plain(args.filters??{}),'BLOCCPAY_FILTERS_INVALID');
   for(const key of ['table','limit','cursor'])need(!Object.hasOwn(args.filters??{},key),'BLOCCPAY_FILTER_RESERVED');
   const query={...args.filters,table:args.table,limit:String(integer(args.limit??100,1,500)),...(args.cursor?{cursor:args.cursor}:{})};
   return this.#json(entry,'/api/list?'+new URLSearchParams(query));
  }
  need(false,'TOOL_NOT_FOUND');
 }
 call(name,args){
  if(this.#closing)return Promise.reject(Object.assign(new Error('The Bloccpay agent is closing.'),{code:'OPERATOR_CLOSING'}));
  let task;try{task=Promise.resolve(this.#dispatch(name,args));}catch(error){task=Promise.reject(error);}
  this.#pending.add(task);task.then(()=>this.#pending.delete(task),()=>this.#pending.delete(task));return task;
 }
 close(){
  if(this.#close)return this.#close;this.#closing=true;
  this.#controller.abort(Object.assign(new Error('The original Bloccpay agent is closing.'),{code:'ABORT_ERR'}));
  const task=(async()=>{
   while(this.#pending.size)await Promise.allSettled([...this.#pending]);
   // A returned native receipt outlives a failed local publication. Retry this
   // exact local write; never invoke its native command again merely to close.
   for(const [path,value] of this.#known)await writeExact(path,jsonBytes(value));
   for(const guard of [...this.#leases]){await guard.release();this.#leases.delete(guard);}
   this.#closed=true;
  })();
  this.#close=task;task.catch(()=>{if(this.#close===task)this.#close=null;});return task;
 }
}
