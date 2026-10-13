// MIT. Typed durable client for the original authenticated Superset operator.
import {open,lstat,realpath,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readSupersetOperatorLaunch} from './launch.mjs';
import {privateDirectory as originalPrivateDirectory,saveExact,identity,hashPrivate,fault,MiB} from './files.mjs';
import {SUPERSET_MAX_FILE,SUPERSET_AGENT_ACTIONS,agentId} from './agent-operations.mjs';
export {SUPERSET_MAX_FILE};
export const supersetError=fault;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>identity(a)===identity(b);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
export async function privateDirectory(path,{create=false}={}){path=resolve(path);await originalPrivateDirectory(path,create);if(await realpath(path)!==path)throw fault('SUPERSET_AGENT_DIRECTORY','Select canonical original private directories.');return path;}
export async function readPrivate(path,maximum=MiB){
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const before=await handle.stat();if(!before.isFile()||before.nlink!==1||before.size>maximum||before.mode&0o077)throw fault('SUPERSET_AGENT_PRIVATE_FILE','Select an original private regular file.');
  const raw=await handle.readFile(),after=await handle.stat(),named=await lstat(path);
  if(raw.length!==before.size||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||named.dev!==before.dev||named.ino!==before.ino||named.isSymbolicLink())throw fault('SUPERSET_AGENT_FILE_CHANGED','The original file changed while being read.',409);
  return raw;
 }finally{await handle.close();}
}
const json=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
async function optional(path,maximum=MiB){try{return json(await readPrivate(path,maximum));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function originalFileIdentity(path){
 path=resolve(path);const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||await realpath(path)!==path||before.size>BigInt(SUPERSET_MAX_FILE))throw fault('SUPERSET_AGENT_SOURCE','Select the complete original file up to 2 GiB.');
 const pin=await hashPrivate(path,SUPERSET_MAX_FILE),after=await lstat(path,{bigint:true});
 if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))throw fault('SUPERSET_AGENT_SOURCE_CHANGED','The selected original source changed.',409);
 return{path,bytes:pin.bytes,sha256:pin.hash,device:String(before.dev),inode:String(before.ino),modified:String(before.mtimeNs),changed:String(before.ctimeNs)};
}
export async function readSupersetRuntime(file){
 file=resolve(file);const before=await lstat(file,{bigint:true}),raw=await readPrivate(file,MiB),after=await lstat(file,{bigint:true});
 if(await realpath(file)!==file||['dev','ino','size','mtimeNs','ctimeNs'].some(key=>before[key]!==after[key]))throw fault('SUPERSET_AGENT_RUNTIME_CHANGED','Select the exact original private merchant runtime file.',409);
 const merchantRuntime=json(raw);if(!plain(merchantRuntime))throw fault('SUPERSET_AGENT_RUNTIME','Use the original private merchant runtime JSON object.');
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
 Object.defineProperty(primary,'supersetCleanup',{value:cleanup,configurable:true});
 primary.cleanupFailure={code:secondary?.code??'SUPERSET_CLOSE_INCOMPLETE',message:secondary?.message??'Continue closing the original owned attachment.'};
 return primary;
}
export async function attachSupersetWorkspace({directory,workspaceDirectory,mode='managed',exportDirectory,runtimeFile,runtimeIdentity,environment=process.env}={}){
 directory=await privateDirectory(directory);if(workspaceDirectory)workspaceDirectory=await privateDirectory(workspaceDirectory);
 const database=await lstat(join(workspaceDirectory??directory,'superset.sqlite3'));
 if(!database.isFile()||database.isSymbolicLink()||database.nlink!==1||database.mode&0o077)throw fault('SUPERSET_AGENT_PROJECT','Open an existing original private Superset project.');
 exportDirectory=await privateDirectory(exportDirectory,{create:true});
 let service,runtime;
 try{
  if(!['managed','owned'].includes(mode))throw fault('SUPERSET_AGENT_MODE','Choose managed or owned attachment.');
  if(runtimeFile!==undefined||runtimeIdentity!==undefined){
   if(mode!=='owned'||typeof runtimeFile!=='string')throw fault('SUPERSET_AGENT_RUNTIME','Private runtimeFile belongs to an owned original server; managed mode keeps its existing listener configuration.');
   runtime=await readSupersetRuntime(runtimeFile);
   if(runtimeIdentity&&!same(runtime.identity,runtimeIdentity))throw fault('SUPERSET_AGENT_RUNTIME_CHANGED','The configured original merchant runtime changed before opening.',409);
  }
  if(mode==='owned')service=await(await import('./server.mjs')).startSupersetWorkspaceServer({directory,workspaceDirectory,port:0,env:environment,...(runtime?{merchantRuntime:runtime.merchantRuntime}:{})});
  const connection=await readSupersetOperatorLaunch({directory});
  if(connection.launch.workspaceDirectory!==(workspaceDirectory??null))throw fault('SUPERSET_AGENT_WORKSPACE_CHANGED','The selected original operator serves another project.',409);
  const requests=await privateDirectory(join(directory,'agent-requests'),{create:true});
  return new SupersetOperatorClient({directory,workspaceDirectory:workspaceDirectory??directory,mode,exportDirectory,requests,connection,service,runtimeIdentity:runtime?.identity??null});
 }catch(error){
  if(service){const cleanup=retainedFailedAttachment(service);try{await cleanup.close();}catch(secondary){retainedCleanupError(error,cleanup,secondary);}}
  throw error;
 }
}
export class SupersetOperatorClient{
 #c;#closing=false;#closed;#pending=new Set();#controllers=new Set();
 constructor(context){this.#c=context;}
 get instanceId(){return this.#c.connection.scope.instanceId;}
 get workspaceId(){return this.#c.connection.scope.workspaceId;}
 get summary(){const c=this.#c;return{...c.connection.scope,mode:c.mode,sourceSha256:c.connection.launch.sourceSha256,selectionSha256:c.connection.launch.selectionSha256,runtimeSha256:c.runtimeIdentity?.sha256??null};}
 async verify(){
  if(this.#closing)throw fault('SUPERSET_AGENT_CLOSING','The current customer attachment is closing.',409);
  const c=this.#c,current=await readSupersetOperatorLaunch({directory:c.directory,instanceId:this.instanceId,selectionSha256:c.connection.launch.selectionSha256});
  if(current.token!==c.connection.token||current.scope.workspaceId!==this.workspaceId||current.launch.pid!==c.connection.launch.pid)throw fault('SUPERSET_AGENT_INSTANCE_CHANGED','Reopen the actual original workspace attachment.',409);
  return this.summary;
 }
 #tracked(fn){if(this.#closing)return Promise.reject(fault('SUPERSET_AGENT_CLOSING','The current customer attachment is closing.',409));const promise=(async()=>{await this.verify();if(this.#closing)throw fault('SUPERSET_AGENT_CLOSING','The current customer attachment is closing.',409);return fn();})();this.#pending.add(promise);void promise.finally(()=>this.#pending.delete(promise)).catch(()=>{});return promise;}
 async #request(method,path,value,{maximum=16*MiB}={}){
  const raw=value===undefined?undefined:JSON.stringify(value);if(raw&&Buffer.byteLength(raw)>MiB)throw fault('SUPERSET_AGENT_REQUEST_LIMIT','The complete encoded operation exceeds 1 MiB.',413);
  const controller=new AbortController();this.#controllers.add(controller);
  try{
   const response=await fetch(new URL('/api/'+path,this.#c.connection.url),{method,redirect:'error',headers:{authorization:'Bearer '+this.#c.connection.token,...(raw===undefined?{}:{'content-type':'application/json'})},body:raw,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
   const chunks=[];let size=0;for await(const chunk of response.body??[]){size+=chunk.length;if(size>maximum)throw fault('SUPERSET_AGENT_RESPONSE_LIMIT','Receive this complete original document through the export/file tools.',413);chunks.push(chunk);}
   let body;try{body=json(Buffer.concat(chunks,size));}catch{throw fault('SUPERSET_AGENT_RESPONSE','The original operator returned incomplete JSON.',502);}
   if(!response.ok)throw fault(body.error??'SUPERSET_AGENT_REQUEST_FAILED',body.message??'The original operator rejected this request.',response.status);
   return body;
  }finally{this.#controllers.delete(controller);}
 }
 view(view,query={}){query=structuredClone(query);return this.#tracked(()=>{
  if(view==='state')return this.#request('GET','agent/state');
  if(view==='page')return this.#request('GET','agent/page?'+new URLSearchParams(query));
  if(view==='record')return this.#request('GET','records/'+encodeURIComponent(query.kind)+'/'+agentId(query.id));
  if(view==='capture'){const{id,...page}=query;return this.#request('GET','capture/'+agentId(id)+'?'+new URLSearchParams(page));}
  const routes={inventory:'inventory',query:'query','merchant-status':'merchant/status','buyer-review':'buyer/review','buyer-status':'buyer/status','delivery':'delivery/inspect'};
  if(!routes[view])throw fault('SUPERSET_AGENT_VIEW','Choose an original operator view.');
  return this.#request('POST',routes[view],query);
 });}
 async #operation(id){
  let saved,native;
  try{saved=await this.#request('GET','agent/requests/'+agentId(id));}catch(error){if(error.status!==404)throw error;}
  try{native=await this.#request('GET','operations/'+agentId(id));}catch(error){if(error.status!==404)throw error;}
  if(saved&&native&&!same(saved.request,native.request))throw fault('SUPERSET_AGENT_OPERATION_CHANGED','The original accepted operation differs from its retained customer request.',409);
  return{workspaceId:this.workspaceId,saved:saved??null,operation:native??null};
 }
 operation(id){return this.#tracked(()=>this.#operation(id));}
 async #upload(source,id){
  let receipt;try{receipt=await this.#request('GET','agent/upload/'+id);}catch(error){if(error.status!==404&&error.code!=='ENOENT')throw error;}
  if(receipt){if(receipt.sha256!==source.sha256||receipt.bytes!==source.bytes)throw fault('SUPERSET_AGENT_SOURCE_CHANGED','The retained upload differs from its original complete source.',409);return receipt;}
  const current=await originalFileIdentity(source.path);if(!same(current,source))throw fault('SUPERSET_AGENT_SOURCE_CHANGED','Resume with the same complete original source file.',409);
  const handle=await open(source.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)),controller=new AbortController();this.#controllers.add(controller);
  try{
   const response=await fetch(new URL('/api/agent/upload/'+id,this.#c.connection.url),{method:'PUT',redirect:'error',duplex:'half',
    headers:{authorization:'Bearer '+this.#c.connection.token,'content-type':'application/octet-stream','content-length':String(source.bytes),'x-content-sha256':source.sha256},
    body:handle.createReadStream({autoClose:false}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
   const body=json(Buffer.from(await response.arrayBuffer()));if(!response.ok)throw fault(body.error??'SUPERSET_AGENT_UPLOAD',body.message??'The original upload failed.',response.status);
   if(body.sha256!==source.sha256||body.bytes!==source.bytes)throw fault('SUPERSET_AGENT_UPLOAD_CHANGED','The original complete upload receipt differs.',409);
   return body;
  }finally{this.#controllers.delete(controller);await handle.close();}
 }
 save(request,{sourcePath,sourceAlias,destinationPath,destinationAlias}={}){
  request=structuredClone(request);
  return this.#tracked(async()=>{
   if(!plain(request)||!SUPERSET_AGENT_ACTIONS.includes(request.action)||!plain(request.input)||request.input.retry!==undefined||!Number.isSafeInteger(request.input.expectedRevision)||request.input.expectedRevision<0)throw fault('SUPERSET_AGENT_REQUEST','Use one complete original action/input, operationId and current expectedRevision.');
   const id=agentId(request.input.operationId),c=this.#c,file=join(c.requests,id+'.intent.json');
   const logical={request,sourceAlias:sourceAlias??null,destinationAlias:destinationAlias??null};let intent=await optional(file,MiB+65536);
   if(intent){if(intent.workspaceId!==this.workspaceId||!same(intent.logical,logical))throw fault('SUPERSET_AGENT_OPERATION_CHANGED','This ID belongs to a different complete original customer request.',409);}
   else{
    const observed=await this.#operation(id);
    if(observed.saved||observed.operation)throw fault('SUPERSET_AGENT_OPERATION_OWNED','This original ID already exists; inspect and resume its saved request.');
    intent={schema:'stellar-forge.superset-agent-intent.v1',workspaceId:this.workspaceId,workspaceDirectory:c.workspaceDirectory,logical,
     source:sourcePath?await originalFileIdentity(sourcePath):null,destination:destinationPath??null};
    await saveExact(file,intent);
   }
   let mapped=structuredClone(request),status=await this.#operation(id),saved=status.saved;
   if(intent.source){
    if(request.input.sha256!==undefined&&request.input.sha256!==intent.source.sha256)throw fault('SUPERSET_AGENT_SOURCE_CHANGED','The requested source SHA differs from the configured original file.',409);
    mapped.input.file=join(intent.workspaceDirectory,'uploads','agent-'+hash(id).slice(0,48)+'.sqlite3');
    mapped.input.sha256=intent.source.sha256;mapped.input.destination=intent.destination;
   }
   if(saved&&!same(saved.logical,mapped))throw fault('SUPERSET_AGENT_OPERATION_CHANGED','The server retained another complete original customer input.',409);
   if(status.operation&&['COMPLETED','QUEUED','RUNNING'].includes(status.operation.status)){
    if(!saved)throw fault('SUPERSET_AGENT_REQUEST_MISSING','Restore the exact original staged request before continuing this ID.',409);
    return status.operation;
   }
   if(intent.source){
    const receipt=await this.#upload(intent.source,'agent-'+hash(id).slice(0,48));
    if(receipt.file!==mapped.input.file||receipt.sha256!==mapped.input.sha256||receipt.bytes!==intent.source.bytes)throw fault('SUPERSET_AGENT_SOURCE_CHANGED','The retained complete upload belongs to another original source.',409);
   }
   if(intent.workspaceDirectory!==c.workspaceDirectory)throw fault('SUPERSET_AGENT_REQUEST_RELOCATED','Prepare new work against this received project; the incomplete original request belongs to its former directory.',409);
   if(!saved)saved=await this.#request('POST','agent/requests/'+id,mapped);
   if(saved.workspaceId!==this.workspaceId||!same(saved.logical,mapped)||saved.sha256!==identity(saved.request))throw fault('SUPERSET_AGENT_REQUEST_CHANGED','The original staged request differs.',409);
   await saveExact(join(c.requests,id+'.request.json'),saved.request);
   const actual=structuredClone(saved.request);if(status.operation)actual.input.retry=true;
   return this.#request('POST','operations/'+actual.action,actual.input);
  });
 }
 resume(id){return this.#tracked(async()=>{
  const status=await this.#operation(agentId(id));
  if(!status.saved)throw fault('SUPERSET_AGENT_REQUEST_MISSING','Choose the complete original saved customer request.',404);
  if(status.operation&&['COMPLETED','QUEUED','RUNNING'].includes(status.operation.status))return status.operation;
  if(status.saved.workspaceDirectory!==this.#c.workspaceDirectory)throw fault('SUPERSET_AGENT_REQUEST_RELOCATED','The incomplete original request belongs to its original receiving directory.',409);
  const actual=structuredClone(status.saved.request);if(status.operation)actual.input.retry=true;
  return this.#request('POST','operations/'+actual.action,actual.input);
 });}
 cancel(id){return this.#tracked(()=>this.#request('POST','cancel/'+agentId(id),{}));}
 merchant(action,id){if(!['start','stop'].includes(action))throw fault('SUPERSET_AGENT_MERCHANT','Choose start or stop.');return this.#tracked(()=>this.#request('POST','merchant/'+action,{merchantId:agentId(id)}));}
 export(id,selection){selection=structuredClone(selection);return this.#tracked(async()=>{
  const metadata=await this.#request('POST','agent/exports/'+agentId(id),selection);
  return this.#download(id,metadata);
 });}
 async #download(id,metadata){
  const c=this.#c,target=join(c.exportDirectory,hash(this.workspaceId+'\n'+id)+'.bin'),receipt=target+'.json';
  const prior=await optional(receipt,32768);
  if(prior){
   if(!same(prior.metadata,metadata)||prior.workspaceId!==this.workspaceId||prior.exportId!==id||prior.path!==target)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','This received export belongs to another exact source.',409);
   let pin;try{pin=await hashPrivate(target,SUPERSET_MAX_FILE);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(pin){if(pin.hash!==metadata.file.sha256||pin.bytes!==metadata.file.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The retained complete export differs from its original receipt.',409);return prior;}
  }
  const temporary=target+'.partial-'+randomUUID(),controller=new AbortController();this.#controllers.add(controller);let handle;
  try{
   const response=await fetch(new URL('/api/agent/exports/'+id+'/file',c.connection.url),{headers:{authorization:'Bearer '+c.connection.token},redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
   if(!response.ok||response.headers.get('x-content-sha256')!==metadata.file.sha256||response.headers.get('content-length')!==String(metadata.file.bytes))throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The complete original file response differs from its saved selection.',409);
   handle=await open(temporary,'wx',0o600);const digest=createHash('sha256');let size=0;
   for await(const chunk of response.body??[]){size+=chunk.length;if(size>metadata.file.bytes||size>SUPERSET_MAX_FILE)throw fault('SUPERSET_AGENT_FILE_LIMIT','The original file exceeds its complete declared length.',413);digest.update(chunk);await handle.writeFile(chunk);}
   if(size!==metadata.file.bytes||digest.digest('hex')!==metadata.file.sha256)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The original full file failed length or SHA-256 receiving.',409);
   await handle.sync();await handle.close();handle=null;
   try{await link(temporary,target);}catch(error){if(error.code!=='EEXIST')throw error;const pin=await hashPrivate(target,SUPERSET_MAX_FILE);if(pin.hash!==metadata.file.sha256||pin.bytes!==metadata.file.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The receiving destination contains another complete file.',409);}
   await unlink(temporary);
   const result={exportId:id,workspaceId:this.workspaceId,path:target,metadata};await saveExact(receipt,result);return result;
  }finally{this.#controllers.delete(controller);await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 async retained(id){
  const path=join(this.#c.exportDirectory,hash(this.workspaceId+'\n'+agentId(id))+'.bin'),saved=await optional(path+'.json',32768);
  if(!saved||saved.workspaceId!==this.workspaceId||saved.exportId!==id||saved.path!==path)throw fault('SUPERSET_AGENT_EXPORT_MISSING','Receive the original complete export first.',404);
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.size!==saved.metadata.file.bytes||info.mode&0o077)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The original retained full file changed.',409);
   return{readonlyFileHandle:handle,bytes:info.size,sha256:saved.metadata.file.sha256,name:saved.metadata.file.name,type:saved.metadata.file.contentType};
  }catch(error){await handle.close();throw error;}
 }
 requestClose(){this.#closing=true;for(const controller of this.#controllers)controller.abort();}
 close(){if(!this.#closed){const attempt=(async()=>{this.requestClose();await Promise.allSettled([...this.#pending]);await this.#c.service?.close();return{instanceId:this.instanceId,state:this.#c.mode==='managed'?'DETACHED':'CLOSED'};})();this.#closed=attempt;void attempt.catch(()=>{if(this.#closed===attempt)this.#closed=null;});}return this.#closed;}
}
