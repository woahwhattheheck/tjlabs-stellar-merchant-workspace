// MIT. Private attachment to the original managed Python preparation listener.
import {open,lstat,realpath,mkdir,link,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve,join,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PreparationClient} from './client.mjs';

export const PREPARATION_CONNECTION_SCHEMA='stellar-forge.data-preparation-listener.v1';
export const PREPARATION_STARTUP_SCHEMA='stellar-forge.data-preparation-managed-startup.v1';
export const PREPARATION_CONNECTION_FILENAME='preparation-connection.json';
export const PREPARATION_HASH=/^[a-f0-9]{64}$/;
export const PREPARATION_MAX_JSON_BYTES=64*1024*1024;
export const PREPARATION_DEFAULT_RECEIVING_BYTES=20*1024**3;
export const preparationPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
export function preparationNeed(condition,code,message,status=400){
  if(!condition) throw Object.assign(new Error(message??code),{code,status});
}
export function preparationExact(value,keys,required=[]){
  preparationNeed(preparationPlain(value)&&Object.keys(value).every(key=>keys.includes(key))&&
    required.every(key=>Object.hasOwn(value,key)),'PREPARATION_ARGUMENTS_INVALID','Use the declared operation arguments.');
}
export function preparationAbsolute(value){
  preparationNeed(typeof value==='string'&&value.startsWith('/')&&value===resolve(value)&&value!=='/'&&!value.includes('\0'),
    'PREPARATION_PATH_INVALID','Use a canonical absolute host path.');return value;
}
export const preparationDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function preparationPrivateDirectory(value){
  const path=preparationAbsolute(value),info=await lstat(path,{bigint:true});
  preparationNeed(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(path)===path&&
    info.uid===BigInt(process.getuid())&&(info.mode&0o077n)===0n,
  'PREPARATION_DIRECTORY_PRIVATE','Use an owned private directory with mode 0700.');
  return {path,dev:String(info.dev),ino:String(info.ino)};
}
export async function preparationOpenFile(value,{privateOnly=false,maximum=Number.MAX_SAFE_INTEGER}={}){
  const path=preparationAbsolute(value);
  preparationNeed(await realpath(path)===path,'PREPARATION_SOURCE_LINK','Select the original regular source file.');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const info=await handle.stat({bigint:true});
    preparationNeed(info.isFile()&&info.uid===BigInt(process.getuid())&&info.size>=0n&&info.size<=BigInt(maximum)&&
      (!privateOnly||(info.mode&0o077n)===0n),'PREPARATION_FILE_INVALID','Use an owned regular file within the declared size allowance.');
    return {path,handle,info,bytes:Number(info.size)};
  }catch(error){await handle.close();throw error;}
}
export async function preparationHashFile(source){
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let position=0;
  while(position<source.bytes){
    const {bytesRead}=await source.handle.read(buffer,0,Math.min(buffer.length,source.bytes-position),position);
    preparationNeed(bytesRead>0,'PREPARATION_FILE_CHANGED','The original file ended before its declared length.',409);
    hash.update(buffer.subarray(0,bytesRead));position+=bytesRead;
  }
  const after=await source.handle.stat({bigint:true}),before=source.info;
  preparationNeed(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>before[key]===after[key]),
    'PREPARATION_FILE_CHANGED','The original file changed during reading.',409);
  return hash.digest('hex');
}
export async function preparationReadJson(value,{privateOnly=true,maximum=PREPARATION_MAX_JSON_BYTES}={}){
  const source=await preparationOpenFile(value,{privateOnly,maximum});
  try{
    const bytes=await source.handle.readFile();
    preparationNeed(bytes.length===source.bytes,'PREPARATION_FILE_CHANGED','The selected JSON file changed.',409);
    const after=await source.handle.stat({bigint:true});
    preparationNeed(['dev','ino','size','mtimeNs','ctimeNs'].every(key=>source.info[key]===after[key]),
      'PREPARATION_FILE_CHANGED','The selected JSON file changed.',409);
    return {path:source.path,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:preparationDigest(bytes)};
  }finally{await source.handle.close();}
}
export async function preparationWriteJson(path,value){
  await preparationPrivateDirectory(dirname(path));
  const temporary=path+'.'+randomUUID()+'.partial';let handle;
  try{
    handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();
    await handle.close();handle=null;await rename(temporary,path);
  }finally{if(handle)await handle.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
export async function preparationWorkspaceIdentity(directory){
  const identity=await preparationPrivateDirectory(directory);
  const source=await preparationReadJson(join(directory,'workspace.json'),{privateOnly:false,maximum:16384});
  preparationNeed(source.value?.schema==='stellar-forge.data-preparation.v1','PREPARATION_WORKSPACE_INVALID',
    'Select an original preparation workspace created or received with its native command.');
  return {directory,directoryIdentity:{dev:identity.dev,ino:identity.ino},workspaceSha256:source.sha256,info:source.value};
}
export async function readPreparationConnection(path,{directory,workspaceSha256,expectedInstanceId}={}){
  const source=await preparationReadJson(preparationAbsolute(path),{maximum:16384});
  const value=source.value;
  preparationNeed(preparationPlain(value)&&value.schema===PREPARATION_CONNECTION_SCHEMA&&
    PREPARATION_HASH.test(value.token??'')&&PREPARATION_HASH.test(value.workspaceSha256??'')&&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.instanceId??'')&&
    Number.isSafeInteger(value.pid)&&value.pid>0&&preparationPlain(value.directoryIdentity),
  'PREPARATION_CONNECTION_INVALID','Choose the private connection written by the original managed listener.');
  preparationNeed(path===join(value.directory,PREPARATION_CONNECTION_FILENAME)&&
    (!directory||directory===value.directory)&&(!workspaceSha256||workspaceSha256===value.workspaceSha256)&&
    (!expectedInstanceId||expectedInstanceId===value.instanceId),
  'PREPARATION_INSTANCE_CHANGED','The selected original workspace or listener changed.',409);
  const original=await preparationWorkspaceIdentity(value.directory);
  preparationNeed(original.workspaceSha256===value.workspaceSha256&&
    original.directoryIdentity.dev===value.directoryIdentity.dev&&original.directoryIdentity.ino===value.directoryIdentity.ino,
  'PREPARATION_INSTANCE_CHANGED','The original workspace directory changed after listener startup.',409);
  const origin=new URL(value.origin);
  preparationNeed(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&origin.pathname==='/'&&
    !origin.username&&!origin.password&&!origin.search&&!origin.hash&&Number(origin.port)>0&&
    value.origin===origin.origin&&value.url===value.origin+'/#'+value.token,
  'PREPARATION_CONNECTION_INVALID','Use the original private loopback connection.');
  return source;
}
function publicConnection(value){
  const {token,url,...remaining}=value;return {...remaining};
}
async function jsonBody(response){
  const declared=response.headers.get('content-length');
  if(!(declared!==null&&/^(0|[1-9][0-9]*)$/.test(declared)&&Number.isSafeInteger(Number(declared))&&Number(declared)<=PREPARATION_MAX_JSON_BYTES))await response.body?.cancel();
  preparationNeed(declared!==null&&/^(0|[1-9][0-9]*)$/.test(declared)&&
    Number.isSafeInteger(Number(declared))&&Number(declared)<=PREPARATION_MAX_JSON_BYTES,
  'PREPARATION_RESPONSE_SIZE','The original JSON response is too large; use a smaller row page or its complete file.');
  const reader=response.body?.getReader(),parts=[];let bytes=0;
  try{
    if(reader)while(true){const result=await reader.read();if(result.done)break;
      bytes+=result.value.byteLength;preparationNeed(bytes<=Number(declared),'PREPARATION_RESPONSE_CHANGED','The response exceeded its declared length.');
      parts.push(Buffer.from(result.value));
    }
    preparationNeed(bytes===Number(declared),'PREPARATION_RESPONSE_CHANGED','The response ended before its complete declared length.');
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,bytes)));
    if(!response.ok)throw Object.assign(new Error(value.error??'The original preparation operation failed.'),{status:response.status,code:value.code??'PREPARATION_OPERATION_FAILED'});
    return value;
  }finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
}
export class PreparationWorkspaceClient extends PreparationClient {
  #record;#pending=new Set();#controllers=new Set();#closing=false;#closed;
  constructor(record){super(record.value.origin);this.#record=record;}
  static async connect(path,options={}){
    const result=new PreparationWorkspaceClient(await readPreparationConnection(path,options));
    try{await result.inspect({signal:AbortSignal.timeout(15000)});return result;}
    catch(error){await result.close();throw error;}
  }
  get connection(){return {...publicConnection(this.#record.value),connectionFile:this.#record.path,connectionSha256:this.#record.sha256};}
  async #binding(){
    let current;
    try{current=await readPreparationConnection(this.#record.path,{directory:this.#record.value.directory,
      workspaceSha256:this.#record.value.workspaceSha256,expectedInstanceId:this.#record.value.instanceId});}
    catch(error){throw Object.assign(new Error('The original application stopped or restarted; connect its current instance.'),{code:'PREPARATION_INSTANCE_CHANGED',status:409,cause:error});}
    preparationNeed(current.sha256===this.#record.sha256,'PREPARATION_INSTANCE_CHANGED','The private listener connection changed.',409);
  }
  async #fetch(path,options,signal){
    await this.#binding();
    preparationNeed(typeof path==='string'&&path.startsWith('/api/')&&!path.startsWith('//')&&
      new URL(path,this.origin).origin===this.origin,'PREPARATION_ROUTE_INVALID','Use an original preparation API route.');
    const headers=new Headers(options.headers);
    headers.set('Authorization','Bearer '+this.#record.value.token);
    headers.set('X-Preparation-Instance-ID',this.#record.value.instanceId);
    const response=await fetch(this.origin+path,{...options,headers,signal,redirect:'error'});
    if(response.headers.get('x-preparation-instance-id')!==this.#record.value.instanceId){
      await response.body?.cancel();throw Object.assign(new Error('The original HTTP listener instance changed.'),{code:'PREPARATION_INSTANCE_CHANGED',status:409});
    }
    return response;
  }
  #perform(action,signal){
    preparationNeed(!this.#closing,'PREPARATION_ATTACHMENT_CLOSED','The original workspace attachment is closing.',409);
    const controller=new AbortController();
    this.#controllers.add(controller);
    const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    const pending=Promise.resolve().then(()=>action(combined));
    this.#pending.add(pending);
    return pending.finally(()=>{this.#pending.delete(pending);this.#controllers.delete(controller);});
  }
  request(path,options={}){
    const {signal,...settings}=options;
    return this.#perform(async active=>jsonBody(await this.#fetch(path,settings,active)),signal);
  }
  async inspect(options){
    const value=await this.request('/api/managed/connection',options),expected=publicConnection(this.#record.value);
    preparationNeed(JSON.stringify(value)===JSON.stringify(expected),'PREPARATION_INSTANCE_CHANGED',
      'The HTTP listener does not match the private original connection.',409);return value;
  }
  status(options){return this.request('/api/managed/state',options);}
  records(collection,{offset=0,limit=50,expectedStateSha256,signal}={}){
    const query=new URLSearchParams({collection,offset,limit});
    if(expectedStateSha256!==undefined)query.set('expectedStateSha256',expectedStateSha256);
    return this.request('/api/managed/records?'+query,{signal});
  }
  async browser(){await this.inspect();return {url:this.#record.value.url,...this.connection};}
  exportDelivery(value,options){return this.post('/api/managed/export',value,options);}
  async importFile(file,{alias,format='csv',label=basename(file),nullToken,expectedSha256,signal}={}){
    preparationNeed(expectedSha256===undefined||PREPARATION_HASH.test(expectedSha256),'PREPARATION_SOURCE_SHA_INVALID','Use the original source SHA-256.');
    const source=await preparationOpenFile(file,{maximum:2*1024**3});let stream;
    try{
      const sha256=await preparationHashFile(source);
      preparationNeed(expectedSha256===undefined||sha256===expectedSha256,'PREPARATION_SOURCE_CHANGED','The declared source changed before import.',409);
      const query=new URLSearchParams({alias,format,label,filename:basename(file)});
      if(nullToken!==undefined)query.set('nullToken',nullToken);
      stream=source.handle.createReadStream({autoClose:false,start:0});
      const value=await this.request('/api/import?'+query,{method:'POST',headers:{
        'Content-Type':'application/octet-stream','Content-Length':String(source.bytes),
        'X-Preparation-Request':'1','X-Preparation-Source-SHA256':sha256
      },body:stream,duplex:'half',signal});
      preparationNeed(value.sha256===sha256,'PREPARATION_SOURCE_CHANGED','The retained native source differs from the selected input.',409);
      return value;
    }finally{stream?.destroy();await source.handle.close();}
  }
  downloadDelivery(record,destination,{signal}={}){
    preparationNeed(record?.schema==='stellar-forge.data-preparation-delivery.v1'&&
      record.workspaceSha256===this.#record.value.workspaceSha256&&PREPARATION_HASH.test(record.fileId??'')&&
      PREPARATION_HASH.test(record.sha256??'')&&Number.isSafeInteger(record.bytes)&&record.bytes>=0,
    'PREPARATION_DELIVERY_INVALID','Choose the complete original delivery record.');
    preparationAbsolute(destination);
    return this.#perform(async active=>{
      await preparationPrivateDirectory(dirname(destination));
      const temporary=destination+'.'+randomUUID()+'.partial';let file,reader;
      try{
        file=await open(temporary,'wx',0o600);
        const response=await this.#fetch('/api/managed/file/'+record.fileId,{},active);
        if(!response.ok)return await jsonBody(response);
        preparationNeed(response.headers.get('content-length')===String(record.bytes),
          'PREPARATION_DELIVERY_CHANGED','The original delivery length changed.',409);
        reader=response.body.getReader();let bytes=0;const hash=createHash('sha256');
        while(true){const result=await reader.read();if(result.done)break;
          bytes+=result.value.byteLength;preparationNeed(bytes<=record.bytes,'PREPARATION_DELIVERY_CHANGED','The delivery exceeded its saved length.',409);
          hash.update(result.value);await file.writeFile(result.value);
        }
        preparationNeed(bytes===record.bytes&&hash.digest('hex')===record.sha256,'PREPARATION_DELIVERY_CHANGED',
          'The complete delivery differs from its original saved length or SHA-256.',409);
        await file.sync();await file.close();file=null;await link(temporary,destination);
        return {...record,path:destination};
      }finally{
        await reader?.cancel().catch(()=>{});reader?.releaseLock();if(file)await file.close();
        await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
      }
    },signal);
  }
  close(){
    if(this.#closed)return this.#closed;this.#closing=true;
    for(const controller of this.#controllers)controller.abort(new Error('The managed attachment is closing.'));
    return this.#closed=Promise.allSettled([...this.#pending]).then(()=>undefined);
  }
}
