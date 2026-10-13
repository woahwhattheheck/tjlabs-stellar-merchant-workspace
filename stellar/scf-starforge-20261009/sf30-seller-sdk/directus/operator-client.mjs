// MIT. Typed durable client for the original authenticated Directus operator.
import {open,lstat,realpath,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readDirectusOperatorLaunch} from './launch.mjs';
import {privateDirectory as originalPrivateDirectory,saveExact,identity,hashPrivate,fault,MiB} from '../dspace/merchant-files.mjs';
import {DIRECTUS_AGENT_MAX_FILE as DIRECTUS_MAX_FILE,DIRECTUS_AGENT_ACTIONS,agentId} from './agent-operations.mjs';
export {DIRECTUS_MAX_FILE};
export const directusError=fault;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>identity(a)===identity(b);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
export async function privateDirectory(path,{create=false}={}){path=resolve(path);await originalPrivateDirectory(path,create);if(await realpath(path)!==path)throw fault('DIRECTUS_AGENT_DIRECTORY','Select canonical original private directories.');return path;}
export async function readPrivate(path,maximum=MiB){
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const before=await handle.stat();if(!before.isFile()||before.nlink!==1||before.size>maximum||before.mode&0o077)throw fault('DIRECTUS_AGENT_PRIVATE_FILE','Select an original private regular file.');
  const raw=await handle.readFile(),after=await handle.stat(),named=await lstat(path);
  if(raw.length!==before.size||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||named.dev!==before.dev||named.ino!==before.ino||named.isSymbolicLink())throw fault('DIRECTUS_AGENT_FILE_CHANGED','The original file changed while being read.',409);
  return raw;
 }finally{await handle.close();}
}
const json=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
async function optional(path,maximum=MiB){try{return json(await readPrivate(path,maximum));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function originalFileIdentity(path){
 path=resolve(path);const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||await realpath(path)!==path||before.size>BigInt(DIRECTUS_MAX_FILE))throw fault('DIRECTUS_AGENT_SOURCE','Select the complete original file up to 32 GiB.');
 const pin=await hashPrivate(path,DIRECTUS_MAX_FILE),after=await lstat(path,{bigint:true});
 if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The selected original source changed.',409);
 return{path,bytes:pin.bytes,sha256:pin.hash,device:String(before.dev),inode:String(before.ino),modified:String(before.mtimeNs),changed:String(before.ctimeNs)};
}
export async function readDirectusRuntime(file){
 file=resolve(file);const before=await lstat(file,{bigint:true}),raw=await readPrivate(file,MiB),after=await lstat(file,{bigint:true});
 if(await realpath(file)!==file||['dev','ino','size','mtimeNs','ctimeNs'].some(key=>before[key]!==after[key]))throw fault('DIRECTUS_AGENT_RUNTIME_CHANGED','Select the exact original private merchant runtime file.',409);
 const merchantRuntime=json(raw);if(!plain(merchantRuntime))throw fault('DIRECTUS_AGENT_RUNTIME','Use the original private merchant runtime JSON object.');
 return {file,merchantRuntime,identity:{path:file,bytes:raw.length,sha256:hash(raw),device:String(after.dev),inode:String(after.ino),modified:String(after.mtimeNs),changed:String(after.ctimeNs)}};
}
function retainedFailedAttachment(service){
 let closing;
 return {
  instanceId:service.launch.instanceId,workspaceId:service.launch.workspaceId,
  summary:{...service.launch,mode:'owned',admitted:false,cleanupPending:true},
  requestClose(){},
  close(){
   if(!closing){const attempt=(async()=>{await service.close();return{instanceId:service.launch.instanceId,state:'CLOSED'};})();closing=attempt;void attempt.catch(()=>{if(closing===attempt)closing=null;});}
   return closing;
  }
 };
}
function retainedCleanupError(primary,cleanup,secondary){
 Object.defineProperty(primary,'directusCleanup',{value:cleanup,configurable:true});
 primary.cleanupFailure={code:secondary?.code??'DIRECTUS_CLOSE_INCOMPLETE',message:secondary?.message??'Continue closing the original owned attachment.'};
 return primary;
}
export async function attachDirectusWorkspace({directory,workspaceDirectory,projectKey,mode='managed',exportDirectory,environment=process.env}={}){
 directory=await privateDirectory(directory);if(workspaceDirectory)workspaceDirectory=await privateDirectory(workspaceDirectory);
 const registry=await optional(join(directory,'operator.json'),MiB);
 if(registry?.schema!=='stellar-forge.directus-operator.v1'||!Array.isArray(registry.projects)||!registry.projects.some(row=>row.key===(projectKey??registry.selected)))
  throw fault('DIRECTUS_AGENT_PROJECT','Select an existing original operator registry and project.');
 for(const row of registry.projects){
  const database=await lstat(join(await privateDirectory(row.directory),'directus-datasets.sqlite3'));
  if(!database.isFile()||database.isSymbolicLink()||database.nlink!==1||database.mode&0o077)throw fault('DIRECTUS_AGENT_PROJECT','Open an existing original private Directus project.');
 }
 exportDirectory=await privateDirectory(exportDirectory,{create:true});
 let service,client;
 try{
  if(!['managed','owned'].includes(mode)||mode==='managed'&&workspaceDirectory!==undefined)throw fault('DIRECTUS_AGENT_MODE','Choose managed or owned; workspaceDirectory belongs to owned startup.');
  if(mode==='owned')service=await(await import('./server.mjs')).startDirectusOperator({directory,workspaceDirectory,port:0,environment});
  const connection=await readDirectusOperatorLaunch({directory});
  if(connection.scope.operatorId!==registry.id)throw fault('DIRECTUS_AGENT_OPERATOR_CHANGED','The selected original operator identity differs.',409);
  const requests=await privateDirectory(join(directory,'agent-requests'),{create:true});
  client=new DirectusOperatorClient({directory,mode,exportDirectory,requests,connection,service});
  if(projectKey&&projectKey!==connection.scope.projectKey)await client.selectProject(projectKey);
  return client;
 }catch(error){
  if(client){try{await client.close();}catch(secondary){retainedCleanupError(error,client,secondary);}}
  else if(service){const cleanup=retainedFailedAttachment(service);try{await cleanup.close();}catch(secondary){retainedCleanupError(error,cleanup,secondary);}}
  throw error;
 }
}
export class DirectusOperatorClient{
 #c;#closing=false;#closed;#tail=Promise.resolve();#pending=new Set();#controllers=new Set();
 constructor(context){this.#c=context;}
 get instanceId(){return this.#c.connection.scope.instanceId;}
 get workspaceId(){return this.#c.connection.scope.workspaceId;}
 get summary(){const c=this.#c;return{...c.connection.scope,mode:c.mode,sourceSha256:c.connection.launch.sourceSha256,selectionSha256:c.connection.launch.selectionSha256,runtimeSha256:c.runtimeIdentity?.sha256??null};}
 async verify({allowProjectChange=false}={}){
  if(this.#closing)throw fault('DIRECTUS_AGENT_CLOSING','The current customer attachment is closing.',409);
  const c=this.#c,current=await readDirectusOperatorLaunch({directory:c.directory,instanceId:this.instanceId,selectionSha256:c.connection.launch.selectionSha256});
  if(current.token!==c.connection.token||current.scope.operatorId!==c.connection.scope.operatorId||current.launch.pid!==c.connection.launch.pid||!allowProjectChange&&(current.scope.projectKey!==c.connection.scope.projectKey||current.scope.workspaceId!==this.workspaceId))throw fault('DIRECTUS_AGENT_INSTANCE_CHANGED','Reopen the actual original workspace attachment.',409);
  return this.summary;
 }
 #tracked(fn,{allowProjectChange=false,concurrent=false}={}){if(this.#closing)return Promise.reject(fault('DIRECTUS_AGENT_CLOSING','The current customer attachment is closing.',409));const work=async()=>{await this.verify({allowProjectChange});if(this.#closing)throw fault('DIRECTUS_AGENT_CLOSING','The current customer attachment is closing.',409);return fn();};const promise=concurrent?Promise.resolve().then(work):this.#tail.then(work);if(!concurrent)this.#tail=promise.catch(()=>{});this.#pending.add(promise);void promise.finally(()=>this.#pending.delete(promise)).catch(()=>{});return promise;}
 async #request(method,path,value,{maximum=16*MiB}={}){
  const raw=value===undefined?undefined:JSON.stringify(value);if(raw&&Buffer.byteLength(raw)>2*MiB)throw fault('DIRECTUS_AGENT_REQUEST_LIMIT','The complete encoded operation exceeds 2 MiB.',413);
  const controller=new AbortController();this.#controllers.add(controller);
  try{
   const response=await fetch(new URL('/api/'+path,this.#c.connection.url),{method,redirect:'error',headers:{...this.#headers(),...(raw===undefined?{}:{'content-type':'application/json'})},body:raw,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
   const chunks=[];let size=0;for await(const chunk of response.body??[]){size+=chunk.length;if(size>maximum)throw fault('DIRECTUS_AGENT_RESPONSE_LIMIT','Receive this complete original document through the export/file tools.',413);chunks.push(chunk);}
   let body;try{body=json(Buffer.concat(chunks,size));}catch{throw fault('DIRECTUS_AGENT_RESPONSE','The original operator returned incomplete JSON.',502);}
   if(!response.ok)throw fault(body.error??'DIRECTUS_AGENT_REQUEST_FAILED',body.message??'The original operator rejected this request.',response.status);
   return body;
  }finally{this.#controllers.delete(controller);}
 }
 #headers(){const c=this.#c.connection;return{authorization:'Bearer '+c.token,'x-directus-operator':c.scope.operatorId,'x-directus-instance':c.scope.instanceId,'x-directus-project':c.scope.projectKey,'x-directus-workspace':c.scope.workspaceId};}
 async #refreshProject(){
  const current=await readDirectusOperatorLaunch({directory:this.#c.directory,instanceId:this.instanceId,selectionSha256:this.#c.connection.launch.selectionSha256});
  if(current.token!==this.#c.connection.token||current.scope.operatorId!==this.#c.connection.scope.operatorId||current.launch.pid!==this.#c.connection.launch.pid)throw fault('DIRECTUS_AGENT_INSTANCE_CHANGED','The original listener changed.',409);
  this.#c.connection=current;return this.summary;
 }
 view(view,query={}){query=structuredClone(query);return this.#tracked(()=>this.#request('POST','agent/view',{view,input:query}));}
 operation(id){return this.#tracked(()=>this.#operation(id));}
 async #operation(id){try{return await this.#request('GET','agent/requests/'+agentId(id));}catch(error){if(error.status===404)return null;throw error;}}
 selectProject(key){return this.#tracked(async()=>{await this.#refreshProject();const result=await this.#request('POST','select-project',{key});await this.#refreshProject();return{...this.summary,state:result};},{allowProjectChange:true});}
 connection(value){value=structuredClone(value);return this.#tracked(()=>this.#request('POST','connection',value));}
 async #upload(source,id){
  let receipt;try{receipt=await this.#request('GET','agent/upload/'+id);}catch(error){if(error.status!==404&&error.code!=='ENOENT')throw error;}
  if(receipt){if(receipt.sha256!==source.sha256||receipt.bytes!==source.bytes)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The retained upload differs from its original complete source.',409);return receipt;}
  const current=await originalFileIdentity(source.path);if(!same(current,source))throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','Resume with the same complete original source file.',409);
  const handle=await open(source.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)),controller=new AbortController();this.#controllers.add(controller);
  try{
   const response=await fetch(new URL('/api/agent/upload/'+id,this.#c.connection.url),{method:'PUT',redirect:'error',duplex:'half',
    headers:{...this.#headers(),'content-type':'application/octet-stream','content-length':String(source.bytes),'x-content-sha256':source.sha256},
    body:handle.createReadStream({autoClose:false}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
   const body=json(Buffer.from(await response.arrayBuffer()));if(!response.ok)throw fault(body.error??'DIRECTUS_AGENT_UPLOAD',body.message??'The original upload failed.',response.status);
   if(body.sha256!==source.sha256||body.bytes!==source.bytes)throw fault('DIRECTUS_AGENT_UPLOAD_CHANGED','The original complete upload receipt differs.',409);
   return body;
  }finally{this.#controllers.delete(controller);await handle.close();}
 }
 save(request,{sourcePath,sourceAlias}={}){
  request=structuredClone(request);return this.#tracked(async()=>{
   if(!plain(request)||!DIRECTUS_AGENT_ACTIONS.includes(request.action)||!plain(request.input)||!Number.isSafeInteger(request.input.expectedRevision)||request.input.expectedRevision<0)throw fault('DIRECTUS_AGENT_REQUEST','Choose the complete original action/input and current revision.');
   const id=agentId(request.input.operationId),c=this.#c,scope=c.connection.scope,file=join(c.requests,hash(scope.operatorId+'\n'+scope.projectKey+'\n'+scope.workspaceId+'\n'+id)+'.intent.json');
   const logical={request,sourceAlias:sourceAlias??null};let intent=await optional(file,2*MiB+65536);
   if(intent){if(intent.workspaceId!==this.workspaceId||intent.projectKey!==scope.projectKey||!same(intent.logical,logical))throw fault('DIRECTUS_AGENT_REQUEST_CHANGED','This operation retains different original customer input.',409);}
   else{
    if(await this.#operation(id))throw fault('DIRECTUS_AGENT_REQUEST_OWNED','Inspect and resume the original saved request before using this ID.',409);
    intent={schema:'stellar-forge.directus-agent-intent.v1',workspaceId:this.workspaceId,projectKey:scope.projectKey,logical,source:sourcePath?await originalFileIdentity(sourcePath):null};
    await saveExact(file,intent);
   }
   const mapped=structuredClone(request);
   if(request.action==='import-source'){
    if(!intent.source||intent.source.bytes>256*MiB)throw fault('DIRECTUS_AGENT_SOURCE','Select a complete original capture up to 256 MiB.');
    if(mapped.input.sourceBase64!==undefined||mapped.input.uploadId!==undefined||mapped.input.sha256!==undefined)throw fault('DIRECTUS_AGENT_SOURCE','Use the original configured source file, not a substituted body or upload.');
    mapped.input.uploadId='agent-'+hash(this.#c.connection.scope.operatorId+'\n'+this.#c.connection.scope.projectKey+'\n'+this.workspaceId+'\n'+id).slice(0,48);mapped.input.sha256=intent.source.sha256;
   }else if(intent.source)throw fault('DIRECTUS_AGENT_SOURCE','Source file aliases apply to import-source.');
   const saved=await this.#operation(id);
   if(saved&&!same(saved.request,mapped))throw fault('DIRECTUS_AGENT_REQUEST_CHANGED','The accepted request differs from the original saved customer input.',409);
   if(saved&&['complete','running'].includes(saved.state))return saved;
   if(intent.source){const receipt=await this.#upload(intent.source,mapped.input.uploadId);if(receipt.sha256!==intent.source.sha256||receipt.bytes!==intent.source.bytes)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The upload differs from its exact original source.',409);}
   const result=await this.#request('POST','agent/requests/'+id,mapped);
   if(result.workspaceId!==this.workspaceId||!same(result.request,mapped))throw fault('DIRECTUS_AGENT_REQUEST_CHANGED','The retained original request differs.',409);
   return result;
  });
 }
 resume(id){return this.#tracked(async()=>{const saved=await this.#operation(agentId(id));if(!saved)throw fault('DIRECTUS_AGENT_REQUEST_MISSING','Choose the original retained request.',404);if(['complete','running'].includes(saved.state))return saved;return this.#request('POST','agent/requests/'+id,saved.request);});}
 cancel(id){return this.#tracked(()=>this.#request('POST','agent/cancel/'+agentId(id),{}),{concurrent:true});}
 merchant(action,id,runtime){runtime=runtime===undefined?undefined:structuredClone(runtime);if(!['start','stop'].includes(action))throw fault('DIRECTUS_AGENT_MERCHANT','Choose original start or stop.');return this.#tracked(()=>this.#request('POST','agent/merchant',{action,merchantId:agentId(id),...(runtime?{runtime}:{})}));}
 receive(id,sourcePath,{sourceAlias}={}){
  return this.#tracked(async()=>{
   agentId(id);const c=this.#c,file=join(c.requests,'receive-'+hash(id)+'.json');let intent=await optional(file,65536);
   if(intent){if(intent.operatorId!==c.connection.scope.operatorId||intent.sourceAlias!==(sourceAlias??null))throw fault('DIRECTUS_AGENT_RECEIVING_CHANGED','This original receiving ID belongs to another source alias.',409);}
   else{const selected=typeof sourcePath==='function'?await sourcePath():sourcePath;if(!selected)throw fault('DIRECTUS_AGENT_SOURCE','Choose the configured complete original project file.');intent={schema:'stellar-forge.directus-agent-receiving.v1',operatorId:c.connection.scope.operatorId,sourceAlias:sourceAlias??null,source:await originalFileIdentity(selected)};await saveExact(file,intent);}
   // A lost receiving response may have switched the original operator project.
   // Rebind this explicit receiving continuation before looking up its receipt.
   await this.#refreshProject();
   let previous;try{previous=await this.#request('GET','receiving?id='+encodeURIComponent(id));}catch(error){if(error.status!==404)throw error;}
   if(previous){if(previous.sha256!==intent.source.sha256||previous.bytes!==intent.source.bytes)throw fault('DIRECTUS_AGENT_RECEIVING_CHANGED','The accepted original receiving receipt differs.',409);await this.#request('POST','select-project',{key:previous.key});await this.#refreshProject();return{...previous,...this.summary,replayed:true};}
   const selected=typeof sourcePath==='function'?await sourcePath():sourcePath;if(selected!==undefined&&resolve(selected)!==intent.source.path)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The configured project alias changed from its saved original path.',409);
   if(!same(await originalFileIdentity(intent.source.path),intent.source))throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The complete original project file changed before receiving.',409);
   const handle=await open(intent.source.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)),controller=new AbortController();this.#controllers.add(controller);
   try{
    const response=await fetch(new URL('/api/receive',c.connection.url),{method:'POST',redirect:'error',duplex:'half',headers:{...this.#headers(),'x-operation-id':id,'x-content-sha256':intent.source.sha256,'content-length':String(intent.source.bytes),'content-type':'application/vnd.sqlite3'},body:handle.createReadStream({autoClose:false}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(1800000)])});
    const body=json(Buffer.from(await response.arrayBuffer()));if(!response.ok)throw fault(body.error??'DIRECTUS_AGENT_RECEIVING',body.message??'The original project receiving failed.',response.status);
    if(body.sha256!==intent.source.sha256||body.bytes!==intent.source.bytes)throw fault('DIRECTUS_AGENT_RECEIVING_CHANGED','The complete original receiving receipt differs.',409);
    await this.#refreshProject();return{...body,...this.summary};
   }finally{this.#controllers.delete(controller);await handle.close();}
  },{allowProjectChange:true});
 }
 export(id,selection){selection=structuredClone(selection);return this.#tracked(async()=>{
  const metadata=await this.#request('POST','agent/exports/'+agentId(id),selection);
  return this.#download(id,metadata);
 });}
 async #download(id,metadata){
  const c=this.#c,target=join(c.exportDirectory,hash(this.#c.connection.scope.operatorId+'\n'+this.#c.connection.scope.projectKey+'\n'+this.workspaceId+'\n'+id)+'.bin'),receipt=target+'.json';
  const prior=await optional(receipt,32768);
  if(prior){
   if(!same(prior.metadata,metadata)||prior.workspaceId!==this.workspaceId||prior.exportId!==id||prior.path!==target)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','This received export belongs to another exact source.',409);
   let pin;try{pin=await hashPrivate(target,DIRECTUS_MAX_FILE);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(pin){if(pin.hash!==metadata.file.sha256||pin.bytes!==metadata.file.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The retained complete export differs from its original receipt.',409);return prior;}
  }
  const temporary=target+'.partial-'+randomUUID(),controller=new AbortController();this.#controllers.add(controller);let handle;
  try{
   const response=await fetch(new URL('/api/agent/exports/'+id+'/file',c.connection.url),{headers:{...this.#headers()},redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(1800000)])});
   if(!response.ok||response.headers.get('x-content-sha256')!==metadata.file.sha256||response.headers.get('content-length')!==String(metadata.file.bytes))throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The complete original file response differs from its saved selection.',409);
   handle=await open(temporary,'wx',0o600);const digest=createHash('sha256');let size=0;
   for await(const chunk of response.body??[]){size+=chunk.length;if(size>metadata.file.bytes||size>DIRECTUS_MAX_FILE)throw fault('DIRECTUS_AGENT_FILE_LIMIT','The original file exceeds its complete declared length.',413);digest.update(chunk);await handle.writeFile(chunk);}
   if(size!==metadata.file.bytes||digest.digest('hex')!==metadata.file.sha256)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The original full file failed length or SHA-256 receiving.',409);
   await handle.sync();await handle.close();handle=null;
   try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;const pin=await hashPrivate(target,DIRECTUS_MAX_FILE);if(pin.hash!==metadata.file.sha256||pin.bytes!==metadata.file.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The receiving destination contains another complete file.',409);}
   await unlink(temporary);
   const result={exportId:id,workspaceId:this.workspaceId,path:target,metadata};await saveExact(receipt,result);return result;
  }finally{this.#controllers.delete(controller);await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 async retained(id){
  const path=join(this.#c.exportDirectory,hash(this.#c.connection.scope.operatorId+'\n'+this.#c.connection.scope.projectKey+'\n'+this.workspaceId+'\n'+agentId(id))+'.bin'),saved=await optional(path+'.json',32768);
  if(!saved||saved.workspaceId!==this.workspaceId||saved.exportId!==id||saved.path!==path)throw fault('DIRECTUS_AGENT_EXPORT_MISSING','Receive the original complete export first.',404);
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.size!==saved.metadata.file.bytes||info.mode&0o077)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The original retained full file changed.',409);
   return{readonlyFileHandle:handle,bytes:info.size,sha256:saved.metadata.file.sha256,name:saved.metadata.file.name,type:saved.metadata.file.contentType};
  }catch(error){await handle.close();throw error;}
 }
 requestClose(){this.#closing=true;for(const controller of this.#controllers)controller.abort();}
 close(){if(!this.#closed){const attempt=(async()=>{this.requestClose();await Promise.allSettled([...this.#pending]);await this.#c.service?.close();return{instanceId:this.instanceId,state:this.#c.mode==='managed'?'DETACHED':'CLOSED'};})();this.#closed=attempt;void attempt.catch(()=>{if(this.#closed===attempt)this.#closed=null;});}return this.#closed;}
}
