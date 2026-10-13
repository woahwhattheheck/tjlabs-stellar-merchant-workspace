// MIT. Durable customer client of the original Zotero HTTP/native workspace.
import {open,link,unlink,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {SCHEMA,LIMIT,need,plain,clone,json,parse,sha256,requestId,safeFilename} from './contracts.mjs';
import {readZoteroConnection} from './client.mjs';
import {zoteroSourceBinding,zoteroWorkspaceBinding} from './agent-binding.mjs';
import {retainZoteroCleanup} from './agent-cleanup.mjs';
import {ZOTERO_AGENT_ACTIONS,ZOTERO_AGENT_VIEWS} from './agent-requests.mjs';
import {privateDirectory,readPrivate,optionalJson,saveExact,originalFile,sourceBytes} from './agent-files.mjs';
export {privateDirectory,readPrivate,originalFile} from './agent-files.mjs';
const same=(a,b)=>sha256(json(a))===sha256(json(b));
const query=value=>new URLSearchParams(Object.entries(value).filter(([,v])=>v!==null&&v!==undefined).map(([key,value])=>[key,String(value)])).toString();
function cleanupError(error,owned){
 const handle=retainZoteroCleanup(error,[owned]);
 handle.instanceId=owned.instanceId??null;handle.workspaceId=owned.workspace?.identity?.workspaceId??null;
 return handle;
}
export async function attachZoteroWorkspace({directory,mode='managed',connectionFile,researchDirectory,exportDirectory,environment=process.env}={}){
 directory=await privateDirectory(directory);need(['managed','owned'].includes(mode),'ZOTERO_AGENT_MODE_INVALID');
 need(mode==='owned'||researchDirectory===undefined,'ZOTERO_AGENT_MANAGED_RESEARCH');
 const database=await lstat(join(directory,'workspace.sqlite'));need(database.isFile()&&!database.isSymbolicLink()&&(database.mode&0o077)===0,'ZOTERO_EXISTING_WORKSPACE_REQUIRED');
 if(researchDirectory!==undefined)researchDirectory=await privateDirectory(researchDirectory);
 exportDirectory=await privateDirectory(exportDirectory,{create:true});connectionFile=resolve(connectionFile??join(directory,'connection.json'));
 let service,client;
 try{
  if(mode==='owned')service=await(await import('./server.mjs')).startZoteroWorkspace({directory,researchDirectory:researchDirectory??null,port:0,connectionFile,environment});
  const original=parse(await readPrivate(connectionFile,32768)),selected=readZoteroConnection(original),binding=await zoteroWorkspaceBinding(directory),source=await zoteroSourceBinding();
  need(original.directory===directory&&original.agentSchema==='stellar-forge.zotero-agent-api.v1'&&same(original.workspaceBinding,binding)&&same(original.sourceBinding,source),'ZOTERO_AGENT_SOURCE_OR_WORKSPACE_CHANGED');
  const intents=await privateDirectory(join(directory,'agent-client'),{create:true});
  client=new ZoteroOperatorClient({directory,mode,connectionFile,connection:original,selected,binding,source,service,exportDirectory,intents});
  await client.verify();return client;
 }catch(error){
  if(client){try{await client.close();}catch(secondary){const handle=cleanupError(error,client);handle.instanceId=client.instanceId;handle.workspaceId=client.workspaceId;error.cleanupFailure=secondary.code??'ZOTERO_CLOSE_FAILED';}}
  else if(service){const handle=cleanupError(error,service);try{await handle.close();}catch(secondary){error.cleanupFailure=secondary.code??'ZOTERO_CLOSE_FAILED';}}
  if(error.zoteroCleanup)error.zoteroCleanup.instanceId??=randomUUID();
  throw error;
 }
}
export class ZoteroOperatorClient{
 #c;#closing=false;#closed;#tail=Promise.resolve();#pending=new Set();#controllers=new Set();
 constructor(context){this.#c=context;}
 get instanceId(){return this.#c.selected.instanceId;}
 get workspaceId(){return this.#c.selected.workspaceId;}
 get summary(){return{instanceId:this.instanceId,workspaceId:this.workspaceId,mode:this.#c.mode,sourceSha256:this.#c.source.sha256};}
 #headers(){return{authorization:'Bearer '+this.#c.selected.token,'x-zotero-workspace':this.workspaceId,'x-zotero-instance':this.instanceId};}
 async verify(){
  need(!this.#closing,'ZOTERO_CLIENT_CLOSED');const c=this.#c,current=parse(await readPrivate(c.connectionFile,32768));
  need(same(current,c.connection)&&same(await zoteroWorkspaceBinding(c.directory),c.binding)&&same(await zoteroSourceBinding(),c.source),'ZOTERO_CONNECTION_INSTANCE_CHANGED');
  const health=await this.#request('/health');need(health.active===true&&health.workspaceId===this.workspaceId&&health.instanceId===this.instanceId&&health.agentSchema==='stellar-forge.zotero-agent-api.v1'&&same(health.sourceBinding,c.source)&&same(health.workspaceBinding,c.binding),'ZOTERO_CONNECTION_INSTANCE_CHANGED');
  return this.summary;
 }
 #tracked(work,{concurrent=false}={}){
  if(this.#closing)return Promise.reject(Object.assign(new Error('ZOTERO_CLIENT_CLOSED'),{code:'ZOTERO_CLIENT_CLOSED'}));
  const run=async()=>{await this.verify();need(!this.#closing,'ZOTERO_CLIENT_CLOSED');return work();};
  const pending=concurrent?Promise.resolve().then(run):this.#tail.then(run);if(!concurrent)this.#tail=pending.catch(()=>{});
  this.#pending.add(pending);void pending.finally(()=>this.#pending.delete(pending)).catch(()=>{});return pending;
 }
 async #request(path,{method='GET',value,bytes,headers={},maximum=LIMIT.metadata}={}){
  const body=bytes??(value===undefined?undefined:json(value));if(value!==undefined)need(body.length<=LIMIT.control,'ZOTERO_HTTP_BODY_LIMIT');
  const controller=new AbortController();this.#controllers.add(controller);
  try{
   const response=await fetch(this.#c.selected.origin+path,{method,headers:{...this.#headers(),...(body?{'Content-Type':'application/json'}:{}),...headers},body,redirect:'error',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
   const chunks=[];let size=0;for await(const chunk of response.body??[]){size+=chunk.length;need(size<=maximum,'ZOTERO_AGENT_RESPONSE_LIMIT');chunks.push(Buffer.from(chunk));}
   const value=parse(Buffer.concat(chunks));if(!response.ok)throw Object.assign(new Error(value?.error??'ZOTERO_HTTP_FAILURE'),{code:value?.error??'ZOTERO_HTTP_FAILURE',status:response.status,details:value?.details??{}});
   return value;
  }finally{this.#controllers.delete(controller);}
 }
 view(method,input={}){input=clone(input);need(ZOTERO_AGENT_VIEWS.includes(method)&&plain(input),'ZOTERO_AGENT_VIEW_INVALID');return this.#tracked(()=>this.#request('/api/agent/view',{method:'POST',value:{method,input}}));}
 request(op){op=requestId(op);return this.#tracked(()=>this.#lookup(op));}
 #lookup(op){return this.#request('/api/agent/request?'+query({requestId:op}));}
 save(value){
  value=clone(value);need(plain(value)&&ZOTERO_AGENT_ACTIONS.includes(value.method)&&!['documents.import','project.return.import'].includes(value.method)&&plain(value.input),'ZOTERO_AGENT_REQUEST_INVALID');
  value.requestId=requestId(value.requestId);return this.#tracked(()=>this.#request('/api/agent/save',{method:'POST',value}));
 }
 resume(op){op=requestId(op);return this.#tracked(()=>this.#request('/api/agent/resume',{method:'POST',value:{requestId:op}}));}
 cancel(op,captureId){op=requestId(op);need(typeof captureId==='string','ZOTERO_CAPTURE_ID_REQUIRED');return this.#tracked(()=>this.#request('/api/agent/save',{method:'POST',value:{requestId:op,method:'capture.control',input:{id:captureId,operation:'cancel'}}}),{concurrent:true});}
 importDocuments(value,sourcePath,{sourceAlias=null,verifySource=null}={}){
  value=clone(value);sourcePath=sourcePath&&resolve(sourcePath);const op=requestId(value.requestId);
  need(plain(value)&&Object.keys(value).every(k=>['requestId','profileId','profileRevision'].includes(k)),'ZOTERO_AGENT_REQUEST_INVALID');
  const input={profileId:value.profileId,profileRevision:value.profileRevision};
  return this.#tracked(async()=>{
   const path=join(this.#c.intents,op+'.import.json');let intent=await optionalJson(path);
   if(intent)need(intent.workspaceId===this.workspaceId&&same(intent.input,input)&&intent.sourceAlias===sourceAlias&&(!sourcePath||intent.source.path===sourcePath),'ZOTERO_REQUEST_INPUT_CHANGED');
   else{need(sourcePath,'ZOTERO_AGENT_FILE_REQUIRED');await verifySource?.();intent={workspaceId:this.workspaceId,requestId:op,input,sourceAlias,source:await originalFile(sourcePath,LIMIT.capture)};await saveExact(path,intent);}
   const request={requestId:op,method:'documents.import',input,source:{bytes:intent.source.bytes,sha256:intent.source.sha256}},previous=await this.#lookup(op);
   if(previous){need(same(previous.request,request),'ZOTERO_REQUEST_INPUT_CHANGED');if(previous.status==='COMPLETE'||previous.active)return previous;return this.#request('/api/agent/resume',{method:'POST',value:{requestId:op}});}
   await verifySource?.();const bytes=await sourceBytes(intent.source,LIMIT.capture);
   return this.#request('/api/agent/import?'+query(input),{method:'POST',bytes,headers:{'X-Zotero-Request-Id':op,'X-Zotero-Source-SHA256':intent.source.sha256}});
  });
 }
 importProjectReturn(value,sourcePath,{sourceAlias=null,verifySource=null}={}){
  value=clone(value);sourcePath=sourcePath&&resolve(sourcePath);const op=requestId(value.requestId);
  need(plain(value)&&Object.keys(value).every(k=>['requestId','projectId'].includes(k)),'ZOTERO_AGENT_REQUEST_INVALID');
  const input={projectId:value.projectId};
  return this.#tracked(async()=>{
   const path=join(this.#c.intents,op+'.project-return.json');let intent=await optionalJson(path);
   if(intent)need(intent.workspaceId===this.workspaceId&&same(intent.input,input)&&intent.sourceAlias===sourceAlias&&(!sourcePath||intent.source.path===sourcePath),'ZOTERO_REQUEST_INPUT_CHANGED');
   else{need(sourcePath,'ZOTERO_AGENT_FILE_REQUIRED');await verifySource?.();intent={workspaceId:this.workspaceId,requestId:op,input,sourceAlias,source:await originalFile(sourcePath,LIMIT.transfer)};await saveExact(path,intent);}
   const request={requestId:op,method:'project.return.import',input,source:{bytes:intent.source.bytes,sha256:intent.source.sha256}},previous=await this.#lookup(op);
   if(previous){need(same(previous.request,request),'ZOTERO_REQUEST_INPUT_CHANGED');if(previous.status==='COMPLETE'||previous.active)return previous;return this.#request('/api/agent/resume',{method:'POST',value:{requestId:op}});}
   await verifySource?.();const bytes=await sourceBytes(intent.source,LIMIT.transfer);
   return this.#request('/api/agent/project-return/import?'+query(input),{method:'POST',bytes,headers:{'X-Zotero-Request-Id':op,'X-Zotero-Source-SHA256':intent.source.sha256}});
  });
 }
 receive(value,sourcePath,{sourceAlias=null,verifySource=null}={}){
  value=clone(value);sourcePath=sourcePath&&resolve(sourcePath);const op=requestId(value.requestId),name=safeFilename(value.name);need(!name.includes('.'),'ZOTERO_RECEIVER_NAME_INVALID');
  return this.#tracked(async()=>{
   const path=join(this.#c.intents,op+'.receive.json');let intent=await optionalJson(path);
   if(intent)need(intent.workspaceId===this.workspaceId&&intent.name===name&&intent.sourceAlias===sourceAlias&&(!sourcePath||sourcePath===intent.source.path),'ZOTERO_REQUEST_INPUT_CHANGED');
   else{need(sourcePath,'ZOTERO_AGENT_FILE_REQUIRED');await verifySource?.();intent={workspaceId:this.workspaceId,requestId:op,name,sourceAlias,source:await originalFile(sourcePath,LIMIT.transfer)};await saveExact(path,intent);}
   // A completed original marker is sufficient even if the input file was subsequently archived.
   const marker=await optionalJson(join(this.#c.directory,'received',name,'receiving.json'));
   let result;
   if(marker?.status==='COMPLETE'){
    need(marker.requestId===op&&marker.packetSha256===intent.source.sha256,'ZOTERO_RECEIVING_INPUT_CHANGED');
    result=await this.#request('/api/receiver/open',{method:'POST',value:{name}});
    result.receipt={...marker,replayed:true};
   }else{
    await verifySource?.();const bytes=await sourceBytes(intent.source,LIMIT.transfer);
    result=await this.#request('/api/receive?'+query({name}),{method:'POST',bytes,headers:{'X-Zotero-Request-Id':op}});
   }
   need(result.receipt.requestId===op&&result.receipt.packetSha256===intent.source.sha256&&result.connection.workspaceId===result.receipt.workspaceId,'ZOTERO_RECEIVING_IDENTITY_CHANGED');
   return{name:result.name,receipt:result.receipt,receiver:{workspaceId:result.connection.workspaceId,instanceId:result.connection.instanceId,active:result.connection.active}};
  });
 }
 receiver(name){name=safeFilename(name);need(!name.includes('.'),'ZOTERO_RECEIVER_NAME_INVALID');return this.#tracked(async()=>{const result=await this.#request('/api/receiver/open',{method:'POST',value:{name}});return{name:result.name,receiver:{workspaceId:result.connection.workspaceId,instanceId:result.connection.instanceId,active:result.connection.active}};});}
 #exportPath(op){return join(this.#c.exportDirectory,sha256(Buffer.from(this.#c.directory+'\n'+this.workspaceId+'\n'+requestId(op)))+'.json');}
 export(op,selection={kind:'workspace'}){
  op=requestId(op);selection=clone(selection);need(plain(selection)&&['workspace','record'].includes(selection.kind),'ZOTERO_EXPORT_SELECTION_INVALID');
  return this.#tracked(async()=>{
   const path=this.#exportPath(op),intentPath=path+'.intent',request={workspaceId:this.workspaceId,requestId:op,selection};let intent=await optionalJson(intentPath);
   if(intent)need(same(intent.request,request),'ZOTERO_REQUEST_INPUT_CHANGED');
   else{
    let chosen;
    if(selection.kind==='workspace'){need(Object.keys(selection).length===1,'ZOTERO_EXPORT_SELECTION_INVALID');chosen={kind:'workspace'};}
    else{need(plain(selection.record)&&Object.keys(selection).every(k=>['kind','record'].includes(k)),'ZOTERO_EXPORT_SELECTION_INVALID');const input=clone(selection.record);
     need(Object.keys(input).every(k=>['kind','id','revision','role','name'].includes(k)),'ZOTERO_EXPORT_SELECTION_INVALID');
     const record=await this.#request('/api/agent/view',{method:'POST',value:{method:'record.get',input:{kind:input.kind,id:input.id,...(input.revision===undefined?{}:{revision:input.revision})}}});
     chosen={kind:'record',record:{...input,revision:record.revision}};
    }
    intent={request,chosen};await saveExact(intentPath,intent);
   }
   const previous=await optionalJson(path+'.receipt');if(previous){need(same(previous.request,request)&&same(previous.chosen,intent.chosen),'ZOTERO_REQUEST_INPUT_CHANGED');const actual=await originalFile(path);need(actual.sha256===previous.file.sha256&&actual.bytes===previous.file.bytes,'ZOTERO_RETAINED_EXPORT_CHANGED');return previous;}
   const suffix=intent.chosen.kind==='workspace'?'/api/export?'+query({requestId:op}):'/api/download?'+query(intent.chosen.record);
   const file=await this.#download(suffix,path);
   const receipt={request,chosen:intent.chosen,file};await saveExact(path+'.receipt',receipt);return receipt;
  });
 }
 async #download(suffix,path){
  const temporary=path+'.partial-'+randomUUID(),controller=new AbortController();this.#controllers.add(controller);let handle;
  try{
   const response=await fetch(this.#c.selected.origin+suffix,{headers:this.#headers(),redirect:'error',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(1800000)])});
   need(response.ok,'ZOTERO_EXPORT_HTTP_FAILED');
   const digest=response.headers.get('x-content-sha256'),length=response.headers.get('content-length'),bytes=Number(length);
   need(/^[a-f0-9]{64}$/.test(digest??'')&&/^\d+$/.test(length??'')&&Number.isSafeInteger(bytes)&&bytes<=LIMIT.transfer,'ZOTERO_EXPORT_IDENTITY_INVALID');
   const name=safeFilename(response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]??'zotero-original.json');
   handle=await open(temporary,'wx',0o600);const hash=createHash('sha256');let size=0;
   for await(const chunk of response.body??[]){size+=chunk.length;need(size<=bytes,'ZOTERO_EXPORT_LENGTH_CHANGED');hash.update(chunk);await handle.writeFile(chunk);}
   need(size===bytes&&hash.digest('hex')===digest,'ZOTERO_EXPORT_HASH_CHANGED');
   await handle.sync();await handle.close();handle=null;
   try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;const old=await originalFile(path);need(old.sha256===digest&&old.bytes===bytes,'ZOTERO_RETAINED_EXPORT_CHANGED');}
   await unlink(temporary);return{name,bytes,sha256:digest,contentType:response.headers.get('content-type')??'application/json'};
  }finally{this.#controllers.delete(controller);await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 async retained(op){
  const path=this.#exportPath(op),receipt=await optionalJson(path+'.receipt');need(receipt&&receipt.request.workspaceId===this.workspaceId&&receipt.request.requestId===requestId(op),'ZOTERO_EXPORT_NOT_FOUND');
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const stat=await handle.stat();need(stat.isFile()&&stat.nlink===1&&(stat.mode&0o077)===0&&stat.size===receipt.file.bytes,'ZOTERO_RETAINED_EXPORT_CHANGED');return{readonlyFileHandle:handle,bytes:stat.size,sha256:receipt.file.sha256,name:receipt.file.name,type:receipt.file.contentType};}catch(error){await handle.close();throw error;}
 }
 requestClose(){this.#closing=true;for(const controller of this.#controllers)controller.abort();}
 close(){if(!this.#closed){const attempt=(async()=>{this.requestClose();await Promise.allSettled([...this.#pending]);await this.#c.service?.close();return{instanceId:this.instanceId,state:this.#c.mode==='owned'?'CLOSED':'DETACHED'};})();this.#closed=attempt;void attempt.catch(()=>{if(this.#closed===attempt)this.#closed=null;});}return this.#closed;}
}
