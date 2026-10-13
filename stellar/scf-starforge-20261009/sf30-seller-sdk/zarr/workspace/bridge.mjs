/** One original Zarr workspace, its native commands and private operator attachment. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {dirname,resolve,join,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

export const ZARR_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const WORKSPACE_SCHEMA='stellar-forge.zarr-workspace.v1';
export const CONNECTION_SCHEMA='stellar-forge.zarr-operator-connection.v1';
export const CONNECTIONS_SCHEMA='stellar-forge.zarr-workspace-connections.v1';
export const REQUEST_SCHEMA='stellar-forge.zarr-operator-request.v1';
export const CONNECTION_FILENAME='.zarr-operator-connection.json';
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ALIAS=/^[a-z][a-z0-9-]{0,63}$/;
export class ZarrOperatorError extends Error {
 constructor(code,message,status=400){super(message);this.name='ZarrOperatorError';this.code=code;this.status=status;}
}
export function need(value,code,message,status=400){if(!value)throw new ZarrOperatorError(code,message,status);}
export function fields(value,allowed,required=allowed,label='request'){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
 'ZARR_FIELDS','Use the declared fields for '+label);return value;
}
function ordered(value){
 if(value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(ordered);
 return Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])]));
}
export function encoded(value){return Buffer.from(JSON.stringify(ordered(value))+'\n');}
export function sha(value){return createHash('sha256').update(value).digest('hex');}
export function exact(a,b,label){need(isDeepStrictEqual(a,b),'ZARR_IDENTITY_CHANGED',label,409);}
export function jsonCopy(value){return JSON.parse(JSON.stringify(value));}
export function parseExactJson(text){
 return JSON.parse(text,(_key,value)=>{need(!(typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value)),
  'ZARR_INTEGER_PRECISION','This JSON includes integer geometry outside exact JavaScript precision; use the original Python interface without rounding',422);return value;});
}
export function safeError(error){return {code:error.code??'ZARR_OPERATOR_ERROR',message:String(error.message??error).slice(0,2000),status:error.status??500};}
export function inside(parent,child){const p=relative(parent,child);return p===''||(!p.startsWith('..'+sep)&&p!=='..'&&!isAbsolute(p));}
export async function fileIdentity(path,{maximum=1024*1024*1024,privateFile=false}={}){
 const name=resolve(path),handle=await fsp.open(name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const before=await handle.stat({bigint:true});
  need(before.isFile()&&before.size<=BigInt(maximum),'ZARR_FILE','Select a complete bounded regular file');
  if(privateFile)need((Number(before.mode)&0o077)===0,'ZARR_PRIVATE_FILE','Keep the operator connection file private (0600)');
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
  for(;;){const r=await handle.read(buffer,0,buffer.length,bytes);if(!r.bytesRead)break;hash.update(buffer.subarray(0,r.bytesRead));bytes+=r.bytesRead;}
  const after=await handle.stat({bigint:true});
  need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k])&&BigInt(bytes)===after.size,
   'ZARR_FILE_CHANGED','The retained file changed while reading',409);
  return {path:name,bytes,sha256:hash.digest('hex'),device:String(after.dev),inode:String(after.ino)};
 }finally{await handle.close();}
}
export async function readJson(path,{maximum=1024*1024,privateFile=false}={}){
 const before=await fileIdentity(path,{maximum,privateFile});
 const bytes=await fsp.readFile(before.path);
 need(bytes.length===before.bytes&&sha(bytes)===before.sha256,'ZARR_FILE_CHANGED','The selected JSON file changed',409);
 return {value:parseExactJson(bytes.toString('utf8')),identity:before};
}
export async function writePrivate(path,value){
 const name=resolve(path),temp=name+'.partial-'+randomUUID(),raw=encoded(value);
 const handle=await fsp.open(temp,'wx',0o600);
 try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
 try{await fsp.rename(temp,name);const dir=await fsp.open(dirname(name),'r');try{await dir.sync();}finally{await dir.close();}}
 catch(error){await fsp.unlink(temp).catch(()=>{});throw error;}
 return fileIdentity(name,{privateFile:true});
}
export async function directoryIdentity(path,{privateDirectory=false}={}){
 const name=resolve(path),s=await fsp.lstat(name,{bigint:true});
 need(s.isDirectory()&&!s.isSymbolicLink(),'ZARR_DIRECTORY','Select an original real directory');
 if(privateDirectory)need((Number(s.mode)&0o077)===0,'ZARR_PRIVATE_DIRECTORY','Keep this workspace private (0700)');
 return {path:name,device:String(s.dev),inode:String(s.ino)};
}
export async function readZarrConnections(path,{expectedSha256}={}){
 const name=resolve(path),read=await readJson(name),v=read.value;
 if(expectedSha256)need(read.identity.sha256===expectedSha256,'ZARR_CONNECTIONS_CHANGED','The reviewed input declaration changed',409);
 fields(v,['schema','inputs','destinations','publisher'],['schema','inputs','destinations'],'host connections');
 if(v.publisher!==undefined){fields(v.publisher,['seller','resource']);need(typeof v.publisher.seller==='string'&&typeof v.publisher.resource==='string','ZARR_PUBLISHER_BINDING','Declare the original seller URL and resource together');}
 need(v.schema===CONNECTIONS_SCHEMA&&Array.isArray(v.inputs)&&Array.isArray(v.destinations),'ZARR_CONNECTIONS','Select the original Zarr host declaration');
 const seen=new Set(),inputs=[],destinations=[];
 for(const item of v.inputs){
  fields(item,['id','title','path','kind','root','provenance','sha256'],['id','title','path','kind','provenance'],'declared input');
  need(ALIAS.test(item.id)&&!seen.has(item.id),'ZARR_INPUT_ID','Use a unique declared input name');seen.add(item.id);
  need(typeof item.path==='string'&&item.path&&typeof item.title==='string'&&item.title.trim()&&['directory','zip','packet'].includes(item.kind),
   'ZARR_INPUT','Declare a complete directory, ZIP store or workspace packet');
  need(item.provenance&&typeof item.provenance==='object'&&!Array.isArray(item.provenance),'ZARR_PROVENANCE','Retain original input provenance');
  if(item.sha256!==undefined)need(HASH.test(item.sha256),'ZARR_INPUT_HASH','Use the complete input SHA-256');
  if(item.kind!=='directory')need(HASH.test(item.sha256??''),'ZARR_INPUT_HASH','Pin each ZIP or packet by its complete SHA-256');
  const root=item.root??'';
  need(typeof root==='string'&&!root.includes('\\')&&!root.startsWith('/')&&(!root||root.split('/').every(x=>x&&x!=='.'&&x!=='..')),
   'ZARR_INPUT_ROOT','Choose a canonical original ZIP store prefix');
  need(item.kind==='zip'||root==='','ZARR_INPUT_ROOT','Only a ZIP source can select an internal store root');
  inputs.push({...jsonCopy(item),title:item.title.trim(),path:resolve(dirname(name),item.path),root});
 }
 seen.clear();
 for(const item of v.destinations){
  fields(item,['id','title','path']);
  need(ALIAS.test(item.id)&&!seen.has(item.id)&&typeof item.title==='string'&&item.title.trim()&&typeof item.path==='string'&&item.path,
   'ZARR_DESTINATION','Declare a unique receiving root');seen.add(item.id);
  destinations.push({...item,title:item.title.trim(),path:resolve(dirname(name),item.path)});
 }
 return {schema:v.schema,path:name,sha256:read.identity.sha256,inputs,destinations,publisher:v.publisher??null};
}
export function publicConnections(config){
 return {sha256:config.sha256,inputs:config.inputs.map(({id,title,kind,root,sha256:hash,provenance})=>({id,title,kind,root,sha256:hash??null,provenance})),
  destinations:config.destinations.map(({id,title})=>({id,title})),publisher:config.publisher??null};
}
const OWNER_SOURCE=[
 'import fcntl,json,os,stat,sys',
 'p=sys.argv[1]',
 'f=os.open(p,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)',
 'try:',
 ' s=os.fstat(f)',
 ' if not stat.S_ISREG(s.st_mode): raise ValueError("The original operator lease is not regular")',
 ' fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)',
 ' print(json.dumps({"ready":True,"device":str(s.st_dev),"inode":str(s.st_ino)}),flush=True)',
 ' sys.stdin.buffer.read()',
 'except Exception as e:',
 ' print(json.dumps({"code":"ZARR_OPERATOR_BUSY","message":str(e),"status":409}),file=sys.stderr,flush=True)',
 ' sys.exit(1)',
 'finally: os.close(f)'
].join('\n');
const ACTION_FIELDS={
 import:['inputId','title','maxBytes','maxFiles'],selection:['sourceId','array','axes','title','maxCells','maxNativeBytes'],
 run:['selectionId'],review:['resultId','contentSha256','decision','comment'],
 freeze:['resultId','reviewId','title','valueType'],abandon:['operationId','reason']
};
const ACTION_REQUIRED={
 import:['inputId','title'],selection:['sourceId','array','axes','title'],run:['selectionId'],
 review:['resultId','contentSha256','decision','comment'],freeze:['resultId','reviewId','title','valueType'],abandon:['operationId','reason']
};
export class ZarrWorkspace {
 constructor({directory,python='python3',sourceDirectory=ZARR_ROOT,connections}){
  need(isAbsolute(directory),'ZARR_DIRECTORY','Select an absolute original workspace');
  this.directory=resolve(directory);this.python=python;this.sourceDirectory=resolve(sourceDirectory);
  this.connections=connections;this.pending=new Set();this.children=new Set();this.closing=false;this.closed=false;
  this.tail=Promise.resolve();this.owner=null;this.ownerEnded=null;this.identity=null;this.onOwnerLost=null;
 }
 async native(command,args=[],input=null,{duringClose=false}={}){
  need((!this.closing||duringClose)&&!this.closed,'ZARR_CLOSING','The original operator is closing',409);
  if(this.ownerLostError)throw this.ownerLostError;
  if(this.identity)await this.checkStorage();
  const argv=[join(this.sourceDirectory,'python/cli.py'),command,...args];
  const promise=new Promise((done,fail)=>{
   let child,spawnError=null,overrun=null,total=0,errorBytes=0,stdout=[],stderr=[];
   try{child=spawn(this.python,argv,{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});}
   catch(error){fail(error);return;}
   this.children.add(child);
   child.on('error',error=>{spawnError=error;});
   child.stdout.on('data',b=>{total+=b.length;if(total<=64*1024*1024)stdout.push(b);else{overrun=new ZarrOperatorError('ZARR_OUTPUT_LIMIT','The original command exceeded the complete JSON output limit',413);child.kill('SIGTERM');}});
   child.stderr.on('data',b=>{errorBytes+=b.length;if(errorBytes<=1024*1024)stderr.push(b);});
   child.stdin.on('error',error=>{if(error.code!=='EPIPE')spawnError??=error;});
   child.once('close',(code,signal)=>{
    this.children.delete(child);
    if(overrun||spawnError){fail(overrun??spawnError);return;}
    const errorText=Buffer.concat(stderr).toString('utf8'),text=Buffer.concat(stdout).toString('utf8');
    if(code!==0){let value;try{value=JSON.parse(errorText);}catch{}
     fail(new ZarrOperatorError(value?.code??'ZARR_NATIVE_INTERRUPTED',value?.message??('Original native command ended '+(signal??code)+': '+errorText.slice(-2000)),value?.status??503));return;}
    try{const value=parseExactJson(text);need(value&&typeof value==='object'&&!Array.isArray(value),'ZARR_NATIVE_RESPONSE','The native command returned no complete object',502);done(value);}
    catch(error){if(error instanceof ZarrOperatorError){fail(error);return;}fail(new ZarrOperatorError('ZARR_NATIVE_RESPONSE','The original command did not return one complete JSON object: '+error.message,502));}
   });
   child.stdin.end(input===null?undefined:encoded(input));
  });
  this.pending.add(promise);
  try{return await promise;}finally{this.pending.delete(promise);}
 }
 async checkStorage(){
  const dir=await directoryIdentity(this.directory,{privateDirectory:true}),db=await fsp.lstat(join(this.directory,'workspace.sqlite'),{bigint:true});
  need(db.isFile()&&!db.isSymbolicLink(),'ZARR_WORKSPACE_MISSING','The original workspace database is missing',409);
  exact({directory:dir,database:{device:String(db.dev),inode:String(db.ino)}},this.identity.storage,'The original workspace storage identity changed');
 }
 async open({create=false,owner=false}={}){
  if(create)await this.native('init',['--directory',this.directory]);
  const dir=await directoryIdentity(this.directory,{privateDirectory:true});
  try{
   if(owner)await this.acquireOwner();
   const status=await this.native('status',['--directory',this.directory]);
   need(status.schema===WORKSPACE_SCHEMA&&UUID.test(status.workspaceId)&&Number.isSafeInteger(status.revision),'ZARR_WORKSPACE','The original workspace identity is invalid');
   const db=await fsp.lstat(join(this.directory,'workspace.sqlite'),{bigint:true});
   need(db.isFile()&&!db.isSymbolicLink(),'ZARR_WORKSPACE','The original database is not regular');
   const storage={directory:dir,database:{device:String(db.dev),inode:String(db.ino)}};
   const identity={schema:'stellar-forge.zarr-workspace-identity.v1',workspaceId:status.workspaceId,storage};
   this.identity={...identity,sha256:sha(encoded(identity))};
   return this;
  }catch(error){await this.close();throw error;}
 }
 async acquireOwner(){
  const child=spawn(this.python,['-u','-c',OWNER_SOURCE,join(this.directory,'operator.lock')],
   {stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  child.stdin.on('error',()=>{});
  this.owner=child;let output='',err='',ready=false,failed=null;
  this.ownerEnded=new Promise(resolveEnd=>child.once('close',(code,signal)=>{
   resolveEnd({code,signal});if(ready&&!this.closing){failed=new ZarrOperatorError('ZARR_OPERATOR_LEASE_LOST','The original operator lease ended; reopen its retained workspace',503);this.ownerLostError=failed;this.onOwnerLost?.(failed);}
  }));
  await new Promise((resolveReady,reject)=>{
   child.on('error',reject);
   child.stderr.on('data',b=>{if(err.length<4096)err+=b.toString('utf8');});
   child.stdout.on('data',b=>{if(output.length>4096)return;output+=b.toString('utf8');const end=output.indexOf('\n');if(end>=0&&!ready){
    try{const value=JSON.parse(output.slice(0,end));need(value.ready===true,'ZARR_OPERATOR_BUSY','The original operator owner did not open',409);ready=true;resolveReady(value);}catch(error){reject(error);}
   }});
   child.once('close',()=>{if(!ready){let value;try{value=JSON.parse(err);}catch{}reject(new ZarrOperatorError(value?.code??'ZARR_OPERATOR_BUSY',value?.message??'The original workspace already has an operator or its lease could not open',value?.status??409));}});
  });
  if(failed)throw failed;
 }
 async status(){
  const value=await this.native('status',['--directory',this.directory]);
  need(value.workspaceId===this.identity.workspaceId,'ZARR_WORKSPACE_CHANGED','The original workspace identity changed',409);
  return value;
 }
 async runtime(){return this.native('runtime');}
 async operation(id){need(UUID.test(id),'ZARR_REQUEST_ID','Use the original UUID');return this.native('operation',['--directory',this.directory,'--id',id]);}
 async result(id,offset=0,limit=100){
  need(HASH.test(id)&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,
   'ZARR_RESULT_PAGE','Select an exact result and 1–500 rows');
  return this.native('result',['--directory',this.directory,'--id',id,'--offset',String(offset),'--limit',String(limit)]);
 }
 async frozen(id){need(HASH.test(id),'ZARR_FROZEN_ID','Choose a reviewed frozen source');return this.native('frozen',['--directory',this.directory,'--id',id]);}
 async checkedInput(id,kinds=['directory','zip','packet']){
  const item=this.connections.inputs.find(x=>x.id===id);
  need(item&&kinds.includes(item.kind),'ZARR_INPUT','Choose one declared original input');
  if(item.kind==='directory'){await directoryIdentity(item.path);need(!inside(item.path,this.directory)&&!inside(this.directory,item.path),'ZARR_INPUT','Select a source outside the original workspace');}
  else{const actual=await fileIdentity(item.path);need(actual.sha256===item.sha256,'ZARR_INPUT_CHANGED','The complete declared input changed',409);}
  return item;
 }
 async prepare(intent,{verifyInput=true}={}){
  fields(intent,['id','action','expectedRevision','input']);
  need(UUID.test(intent.id)&&Number.isSafeInteger(intent.expectedRevision)&&intent.expectedRevision>=0&&Object.hasOwn(ACTION_FIELDS,intent.action),
   'ZARR_REQUEST','Retain one original UUID, workspace revision and native action');
  fields(intent.input,ACTION_FIELDS[intent.action],ACTION_REQUIRED[intent.action],intent.action);
  let input=jsonCopy(intent.input),binding=null;
  if(intent.action==='import'){
   const declared=this.connections.inputs.find(x=>x.id===input.inputId&&['directory','zip'].includes(x.kind));
   need(declared,'ZARR_INPUT','Choose one declared original store input');
   const item=verifyInput?await this.checkedInput(declared.id,['directory','zip']):declared;binding={inputId:item.id};
   input={path:item.path,kind:item.kind,root:item.root,title:input.title,provenance:jsonCopy(item.provenance),...(item.kind==='zip'?{expectedSha256:item.sha256}:{}),
    ...(input.maxBytes===undefined?{}:{maxBytes:input.maxBytes}),...(input.maxFiles===undefined?{}:{maxFiles:input.maxFiles})};
  }
  const request={id:intent.id,action:intent.action,expectedRevision:intent.expectedRevision,input};
  return {schema:REQUEST_SCHEMA,workspaceId:this.identity.workspaceId,connectionsSha256:this.connections.sha256,
   intent:jsonCopy(intent),binding,request,requestSha256:sha(encoded(request))};
 }
 serial(callback){
  need(!this.closing,'ZARR_CLOSING','The original operator is closing',409);
  const promise=this.tail.then(callback);this.tail=promise.catch(()=>{});this.pending.add(promise);
  return promise.finally(()=>this.pending.delete(promise));
 }
 apply(prepared){
  return this.serial(async()=>{
   need(prepared?.schema===REQUEST_SCHEMA&&prepared.workspaceId===this.identity.workspaceId&&prepared.connectionsSha256===this.connections.sha256,
    'ZARR_PREPARED_CHANGED','Reopen this workspace’s exact prepared request',409);
   const current=await this.prepare(prepared.intent,{verifyInput:false});
   exact(current,prepared,'The complete prepared original request changed');
   let original=null;try{original=await this.native('operation',['--directory',this.directory,'--id',prepared.request.id],null,{duringClose:true});}
   catch(error){if(error.code!=='ZARR_OPERATION_NOT_FOUND')throw error;}
   if(original){
    exact(original.request,prepared.request,'This UUID already binds another original native request');
    if(original.state==='COMPLETE')return {...original.result,replayed:true};
    need(['RUNNING','INTERRUPTED'].includes(original.state),'ZARR_OPERATION_CLOSED','This original request was explicitly closed',409);
   }else await this.prepare(prepared.intent);
   return this.native('apply',['--directory',this.directory],prepared.request,{duringClose:true});
  });
 }
 resume(id){
  return this.serial(async()=>{
   need(UUID.test(id),'ZARR_REQUEST_ID','Use the original UUID');
   const op=await this.native('operation',['--directory',this.directory,'--id',id],null,{duringClose:true});
   if(op.state==='COMPLETE')return {...op.result,replayed:true};
   need(['RUNNING','INTERRUPTED'].includes(op.state),'ZARR_OPERATION_CLOSED','This original operation is already closed',409);
   if(op.request.action==='import'){
    const original=op.request.input,declared=this.connections.inputs.find(x=>x.kind===original.kind&&x.path===original.path&&x.root===(original.root??'')&&isDeepStrictEqual(x.provenance,original.provenance));
    need(declared,'ZARR_RESUME_INPUT','Declare the original input and provenance before resuming this retained request; otherwise explicitly close it',409);
   }
   return this.native('apply',['--directory',this.directory],op.request,{duringClose:true});
  });
 }
 export(id){
  need(UUID.test(id),'ZARR_REQUEST_ID','Retain one original export UUID');
  return this.serial(async()=>{
   const path=join(this.directory,'exports',id+'.zip');
   const native=await this.native('export',['--directory',this.directory,'--id',id,'--out',path],null,{duringClose:true});
   const file=await fileIdentity(path);
   return {operationId:id,native,file:{id,name:'Zarr_Workspace_'+id+'.zip',bytes:file.bytes,sha256:file.sha256}};
  });
 }
 async exportIdentity(id){
  need(UUID.test(id),'ZARR_FILE_ID','Use an original retained export UUID');
  const path=join(this.directory,'exports',id+'.zip');
  const native=await this.native('verify-packet',['--archive',path]);
  return {native,...await fileIdentity(path),id,name:'Zarr_Workspace_'+id+'.zip'};
 }
 receive({id,inputId,destinationId}){
  need(UUID.test(id),'ZARR_REQUEST_ID','Retain one receiving UUID');
  return this.serial(async()=>{
   const source=await this.checkedInput(inputId,['packet']),destination=this.connections.destinations.find(x=>x.id===destinationId);
   need(destination,'ZARR_DESTINATION','Choose a declared receiving root');
   await directoryIdentity(destination.path);
   const directory=join(destination.path,id);
   need(!inside(this.directory,directory)&&!inside(directory,this.directory)&&!inside(this.sourceDirectory,directory),
    'ZARR_RECEIVE_SCOPE','Receive into a separate declared workspace');
   const native=await this.native('receive',['--archive',source.path,'--directory',directory],null,{duringClose:true});
   return {operationId:id,inputId,destinationId,directory,native};
  });
 }
 async close(){
  if(this.closePromise)return this.closePromise;
  this.closing=true;
  this.closePromise=(async()=>{
   await this.tail;
   while(this.pending.size)await Promise.allSettled([...this.pending]);
   if(this.owner){this.owner.stdin.end();await this.ownerEnded;this.owner=null;}
   this.closed=true;
  })();
  return this.closePromise;
 }
}
export async function openZarrWorkspace(options){return new ZarrWorkspace(options).open({create:options.create??false,owner:options.owner??false});}
export async function readZarrConnection(path,{workspaceId,workspaceSha256}={}){
 const read=await readJson(path,{maximum:65536,privateFile:true}),v=read.value;
 need(v.schema===CONNECTION_SCHEMA&&UUID.test(v.instanceId)&&UUID.test(v.workspaceId)&&HASH.test(v.token??'')&&HASH.test(v.workspaceSha256??''),
  'ZARR_CONNECTION','Use the private connection from the original running operator');
 if(workspaceId)need(v.workspaceId===workspaceId,'ZARR_CONNECTION_WORKSPACE','The connection selects another original workspace',409);
 if(workspaceSha256)need(v.workspaceSha256===workspaceSha256,'ZARR_CONNECTION_WORKSPACE','The original workspace storage identity changed',409);
 const url=new URL(v.origin);
 need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash,
  'ZARR_CONNECTION_ORIGIN','Use the original loopback operator origin');
 need(Number.isSafeInteger(v.pid)&&v.pid>0,'ZARR_CONNECTION','The original process identity is missing');
 return {value:v,identity:read.identity};
}
export class ZarrWorkspaceClient {
 constructor(connection){this.connection=connection;this.pending=new Set();this.closing=false;}
 async request(path,{method='GET',body}={}){
  need(!this.closing,'ZARR_CLIENT_CLOSING','The original operator attachment is closing',409);
  need(typeof path==='string'&&path.startsWith('/api/')&&!path.includes('..'),'ZARR_CLIENT_PATH','Use a declared operator route');
  const promise=(async()=>{
   const response=await fetch(this.connection.origin+path,{method,redirect:'error',headers:{
    'authorization':'Bearer '+this.connection.token,'origin':this.connection.origin,
    ...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
   const length=Number(response.headers.get('content-length'));
   need(!Number.isFinite(length)||length<=64*1024*1024,'ZARR_RESPONSE_LIMIT','The original response is too large',502);
   const reader=response.body.getReader();let total=0;const chunks=[];
   for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>64*1024*1024){await reader.cancel();throw new ZarrOperatorError('ZARR_RESPONSE_LIMIT','The original response exceeds 64 MiB',502);}chunks.push(Buffer.from(value));}
   let value;try{value=parseExactJson(Buffer.concat(chunks).toString('utf8'));}catch{throw new ZarrOperatorError('ZARR_RESPONSE','The original operator returned incomplete JSON',502);}
   if(!response.ok)throw new ZarrOperatorError(value.code??'ZARR_OPERATOR_ERROR',value.message??'The original operator rejected this request',response.status);
   return value;
  })();
  this.pending.add(promise);try{return await promise;}finally{this.pending.delete(promise);}
 }
 async connect(){
  const session=await this.request('/api/session');
  need(session.instanceId===this.connection.instanceId&&session.workspaceId===this.connection.workspaceId&&session.workspaceSha256===this.connection.workspaceSha256,
   'ZARR_CONNECTION_CHANGED','The original operator instance changed; reconnect explicitly',409);
  return session;
 }
 async close(){this.closing=true;await Promise.allSettled([...this.pending]);}
}
export function bearerMatches(value,token){
 if(typeof value!=='string'||!value.startsWith('Bearer '))return false;
 const actual=Buffer.from(value.slice(7)),expected=Buffer.from(token);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
