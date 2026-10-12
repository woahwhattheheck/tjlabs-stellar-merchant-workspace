// MIT. Typed local attachment to the original Tenderly workspace and its sole listener owner.
import {constants} from 'node:fs';
import {lstat,mkdir,open,readFile,realpath,rename,link,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {acquireRunbookMetadataLease} from '../../../buyer-runbook/runbook.mjs';

export const TENDERLY_CONNECTION_SCHEMA='stellar-forge.tenderly-live-connection.v1';
export const TENDERLY_CONNECTION_FILENAME='tenderly.connection.json';
export const TENDERLY_LISTENER_SCHEMA='stellar-forge.tenderly-listener.v1';
const OWNER_SCHEMA='stellar-forge.tenderly-listener-owner.v1';
const OWNER_FILENAME='.tenderly-listener.json';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const CONTROL_BYTES=16*1024*1024;
export const TENDERLY_MAX_FILE_BYTES=128*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function tenderlyConnectionFailure(code,message,status=409) {
  return Object.assign(new Error(message),{code,status});
}
function need(ok,code,message,status=409) { if(!ok) throw tenderlyConnectionFailure(code,message,status); }
function absolute(path) {
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&!/[\x00-\x1f\x7f]/.test(path),
    'TENDERLY_PATH_INVALID','Use the original absolute private workspace path.',400);
  return path;
}
async function privateDirectory(path) {
  absolute(path);const info=await lstat(path);
  need(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&
    (typeof process.getuid!=='function'||info.uid===process.getuid())&&await realpath(path)===path,
    'TENDERLY_PRIVATE_DIRECTORY_REQUIRED','Use an operator-owned private directory without symbolic links.',400);
  return {path,dev:info.dev,ino:info.ino};
}
async function privateFile(path,maximum=65536) {
  absolute(path);await privateDirectory(dirname(path));
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const before=await handle.stat();
    need(before.isFile()&&(before.mode&0o077)===0&&before.size<=maximum&&
      (typeof process.getuid!=='function'||before.uid===process.getuid()),
    'TENDERLY_PRIVATE_FILE_REQUIRED','Use the original private file within its declared size.',400);
    const chunks=[];let position=0;
    while(position<=maximum) {
      const block=Buffer.alloc(Math.min(65536,maximum+1-position));
      const {bytesRead}=await handle.read(block,0,block.length,position);
      if(!bytesRead) break;position+=bytesRead;chunks.push(block.subarray(0,bytesRead));
    }
    const after=await handle.stat(),named=await lstat(path),bytes=Buffer.concat(chunks);
    need(bytes.length<=maximum&&bytes.length===after.size&&before.dev===after.dev&&before.ino===after.ino&&
      before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&
      named.dev===after.dev&&named.ino===after.ino&&!named.isSymbolicLink(),
    'TENDERLY_FILE_CHANGED','The original private file changed while it was being read.');
    return {path,bytes,sha256:digest(bytes),dev:after.dev,ino:after.ino};
  } finally {await handle.close();}
}
function parse(bytes) {
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch {throw tenderlyConnectionFailure('TENDERLY_CONNECTION_INVALID','Use the original UTF-8 connection or identity document.',400);}
}
async function syncDirectory(path) {const file=await open(path,constants.O_RDONLY);try{await file.sync();}finally{await file.close();}}
async function writePrivate(path,value,{replace=false}={}) {
  await privateDirectory(dirname(path));
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
  const temporary=join(dirname(path),'.'+basename(path)+'.'+randomUUID()+'.tmp');
  const file=await open(temporary,'wx',0o600);
  try {await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  try {
    if(replace) await rename(temporary,path);
    else {await link(temporary,path);await unlink(temporary);}
    await syncDirectory(dirname(path));
  } catch(error) {await unlink(temporary).catch(issue=>{if(issue.code!=='ENOENT')throw issue;});throw error;}
  return {path,sha256:digest(bytes),bytes:bytes.length};
}
async function optional(path) {try{return await privateFile(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function processIdentity(pid=process.pid) {
  let start=null,boot=null;
  try {
    const stat=await readFile('/proc/'+pid+'/stat','utf8'),end=stat.lastIndexOf(') ');
    const value=stat.slice(end+2).trim().split(/\s+/)[19];
    if(end>=0&&/^\d+$/.test(value)) start=value;
  } catch {}
  try {const value=(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();if(UUID.test(value))boot=value;}catch {}
  return {pid,start,boot};
}
async function alive(owner) {
  const current=await processIdentity(owner.process.pid);
  if(owner.process.boot&&current.boot&&owner.process.boot!==current.boot)return false;
  if(owner.process.start&&current.start&&owner.process.start!==current.start)return false;
  try {process.kill(owner.process.pid,0);return true;}
  catch(error){if(error.code==='ESRCH')return false;if(error.code==='EPERM')return true;throw error;}
}
function ownerDocument(value,directory) {
  need(plain(value)&&value.schema===OWNER_SCHEMA&&UUID.test(value.instanceId??'')&&value.directory===directory&&
    plain(value.process)&&Number.isSafeInteger(value.process.pid)&&value.process.pid>0&&
    (value.process.start===null||typeof value.process.start==='string'&&/^\d+$/.test(value.process.start))&&
    (value.process.boot===null||UUID.test(value.process.boot??'')),
  'TENDERLY_OWNER_INVALID','The original listener ownership record needs its original operator recovery.');
  return value;
}
async function sameDirectory(binding) {
  const now=await privateDirectory(binding.path);
  need(now.dev===binding.dev&&now.ino===binding.ino,'TENDERLY_DIRECTORY_CHANGED','The original workspace directory was replaced.');
}
/** Reserve one original server before opening its model; retired native owners are reconciled under the existing metadata lease. */
export async function claimTenderlyListener(directory) {
  need(typeof directory==='string'&&directory.length>0,'TENDERLY_PATH_INVALID','Supply the original private workspace directory.',400);
  directory=resolve(directory);
  await mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const binding=await privateDirectory(directory),ownerPath=join(directory,OWNER_FILENAME),connectionPath=join(directory,TENDERLY_CONNECTION_FILENAME);
  const owner={schema:OWNER_SCHEMA,instanceId:randomUUID(),directory,process:await processIdentity(),startedAt:new Date().toISOString()};
  const release=await acquireRunbookMetadataLease(directory);
  try {
    await sameDirectory(binding);
    const previous=await optional(ownerPath);
    if(previous) {
      const record=ownerDocument(parse(previous.bytes),directory);
      need(!await alive(record),'TENDERLY_WORKSPACE_ALREADY_OPEN',
        'This original Tenderly workspace already has a live owner. Use managed attachment or close that owner.');
      const live=await optional(connectionPath);
      if(live) {
        const value=parse(live.bytes);
        need(value.instanceId===record.instanceId&&value.directory===directory,'TENDERLY_OWNER_CHANGED',
          'The live connection belongs to another original listener.');
        await unlink(connectionPath);
      }
      await unlink(ownerPath);
    } else {
      need(!await optional(connectionPath),'TENDERLY_OWNER_MISSING',
        'The existing live connection has no matching owner record. Recover its original listener before reopening.');
    }
    await writePrivate(ownerPath,owner);
  } finally {await release();}
  let published=null,retired=false;
  async function underOwnership(operation) {
    const done=await acquireRunbookMetadataLease(directory);
    try {
      await sameDirectory(binding);
      const current=await optional(ownerPath);
      need(current&&ownerDocument(parse(current.bytes),directory).instanceId===owner.instanceId,
        'TENDERLY_OWNER_CHANGED','The original listener ownership changed.');
      return await operation();
    } finally {await done();}
  }
  return {
    directory,instanceId:owner.instanceId,startedAt:owner.startedAt,pid:owner.process.pid,
    async publish({origin,token,workspaceId,workspaceSha256,planFile=null,planSha256=null,facilitator=null}) {
      need(!retired&&!published&&UUID.test(workspaceId??'')&&HASH.test(workspaceSha256??'')&&
        typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token),
        'TENDERLY_CONNECTION_INVALID','Publish the original listener identity once.');
      const url=new URL(origin);
      need(url.origin===origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&
        !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/',
      'TENDERLY_CONNECTION_INVALID','Use the original loopback listener.');
      const value={schema:TENDERLY_CONNECTION_SCHEMA,instanceId:owner.instanceId,startedAt:owner.startedAt,
        pid:owner.process.pid,directory,workspaceId,workspaceSha256,origin,token,planFile,planSha256,facilitator};
      published=await underOwnership(()=>writePrivate(connectionPath,value));
      return Object.freeze({...published,instanceId:owner.instanceId,workspaceId});
    },
    async retire() {
      if(retired)return;
      await underOwnership(async()=>{
        const live=await optional(connectionPath);
        if(live) {
          const value=parse(live.bytes);
          need(value.instanceId===owner.instanceId&&(!published||live.sha256===published.sha256),
            'TENDERLY_OWNER_CHANGED','The original live connection changed before listener retirement.');
          await unlink(connectionPath);
        }
        await unlink(ownerPath);await syncDirectory(directory);
      });
      retired=true;
    },
  };
}
export async function readTenderlyWorkspaceConnection(path,options={}) {
  const original=await privateFile(absolute(path)),value=parse(original.bytes);
  need(plain(value)&&value.schema===TENDERLY_CONNECTION_SCHEMA&&UUID.test(value.instanceId??'')&&
    UUID.test(value.workspaceId??'')&&HASH.test(value.workspaceSha256??'')&&
    Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.startedAt==='string'&&Number.isFinite(Date.parse(value.startedAt))&&
    typeof value.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value.token),
  'TENDERLY_CONNECTION_INVALID','Use the private connection written by the original Tenderly listener.',400);
  absolute(value.directory);
  need(path===join(value.directory,TENDERLY_CONNECTION_FILENAME),'TENDERLY_CONNECTION_INVALID',
    'Use the connection inside its original workspace directory.',400);
  const directory=await privateDirectory(value.directory),manifest=await privateFile(join(value.directory,'workspace.json')),identity=parse(manifest.bytes);
  need(identity.schema==='stellar-forge.tenderly-workspace.v1'&&identity.id===value.workspaceId&&manifest.sha256===value.workspaceSha256,
    'TENDERLY_WORKSPACE_CHANGED','The listener and original workspace identity differ.');
  let url;try{url=new URL(value.origin);}catch{}
  need(url&&url.origin===value.origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&
    !url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/',
  'TENDERLY_CONNECTION_INVALID','Use the original loopback listener.',400);
  for(const [key,actual] of [['directory',value.directory],['workspaceId',value.workspaceId],
    ['workspaceSha256',value.workspaceSha256],['expectedInstanceId',value.instanceId]]) {
    need(options[key]===undefined||options[key]===null||options[key]===actual,
      key==='expectedInstanceId'?'TENDERLY_INSTANCE_CHANGED':'TENDERLY_WORKSPACE_CHANGED','The selected original listener identity changed.');
  }
  return {path,sha256:original.sha256,value,directory,manifest:Object.freeze(identity)};
}
async function bytesFrom(response,maximum) {
  const declared=response.headers.get('content-length');
  need(declared===null||/^\d+$/.test(declared)&&Number(declared)<=maximum,
    'TENDERLY_RESPONSE_TOO_LARGE','The original response exceeds the selected complete-file limit.',413);
  const chunks=[];let size=0;
  if(response.body)for await(const chunk of response.body){size+=chunk.length;need(size<=maximum,
    'TENDERLY_RESPONSE_TOO_LARGE','The original response exceeds the selected complete-file limit.',413);chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  need(declared===null||Number(declared)===bytes.length,'TENDERLY_RESPONSE_INCOMPLETE','The original listener response ended before all bytes arrived.',502);
  return bytes;
}
const INTERNAL=Symbol('TenderlyWorkspaceClient');
/** Every operation attaches to one original listener instance; mutations are never retried automatically. */
export class TenderlyWorkspaceClient {
  #source;#closed=false;#closing;#pending=new Set();#lastStatus=null;#lastStatusAt=null;
  constructor(marker,source) {need(marker===INTERNAL,'TENDERLY_CONNECTION_REQUIRED','Use TenderlyWorkspaceClient.connect.',400);this.#source=source;}
  static async connect(path,options={}) {
    const source=await readTenderlyWorkspaceConnection(path,options),client=new TenderlyWorkspaceClient(INTERNAL,source);
    try {
      const identity=await client.#json('/api/connection');
      need(identity.schema===TENDERLY_LISTENER_SCHEMA&&identity.instanceId===source.value.instanceId&&
        identity.workspaceId===source.value.workspaceId&&identity.workspaceSha256===source.value.workspaceSha256&&
        identity.directory===source.value.directory,
      'TENDERLY_INSTANCE_CHANGED','The current listener differs from the selected original connection.');
      await client.status();return client;
    } catch(error){await client.close();throw error;}
  }
  get connection() {
    const {token,...value}=this.#source.value;
    return Object.freeze({...value,connectionFile:this.#source.path,connectionSha256:this.#source.sha256});
  }
  get manifest(){return this.#source.manifest;}
  get lastStatus(){return this.#lastStatus===null?null:structuredClone(this.#lastStatus);}
  get lastStatusAt(){return this.#lastStatusAt;}
  async #assert() {
    need(!this.#closed,'TENDERLY_ATTACHMENT_CLOSED','Open a current original Tenderly attachment.');
    let current;
    try{current=await readTenderlyWorkspaceConnection(this.#source.path);}
    catch(error){if(error.code==='ENOENT')throw tenderlyConnectionFailure('TENDERLY_INSTANCE_CHANGED','The original listener has retired. Open the current saved application.');throw error;}
    need(current.sha256===this.#source.sha256&&current.directory.dev===this.#source.directory.dev&&
      current.directory.ino===this.#source.directory.ino,'TENDERLY_INSTANCE_CHANGED',
      'The original Tenderly listener changed. Open its current connection before continuing.');
  }
  async #request(path,{method='GET',value,maximum=CONTROL_BYTES}={}) {
    need(!this.#closed,'TENDERLY_ATTACHMENT_CLOSED','Open a current original Tenderly attachment.');
    const run=(async()=>{
      await this.#assert();
      const source=this.#source.value,headers={authorization:'Bearer '+source.token,origin:source.origin,
        'x-tenderly-workspace-instance':source.instanceId};
      let body;
      if(value!==undefined){body=JSON.stringify(value);need(Buffer.byteLength(body)<=2*1024*1024,'TENDERLY_REQUEST_TOO_LARGE',
        'Use the original complete request within the workspace API limit.',413);headers['content-type']='application/json';}
      const response=await fetch(source.origin+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(305000)});
      need(response.headers.get('x-tenderly-workspace-instance')===source.instanceId,
        'TENDERLY_INSTANCE_CHANGED','The HTTP response belongs to another Tenderly listener.');
      const bytes=await bytesFrom(response,response.ok?maximum:65536);
      if(!response.ok) {
        let error;try{error=parse(bytes);}catch{}
        const issue=tenderlyConnectionFailure(typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:'TENDERLY_REMOTE_OPERATION_FAILED',
          typeof error?.error==='string'&&error.error.length<=1000?error.error:'The original Tenderly operation failed.',response.status);
        if(typeof error?.retryAt==='string')issue.retryAt=error.retryAt;
        throw issue;
      }
      return {bytes,response};
    })();this.#pending.add(run);
    try{return await run;}finally{this.#pending.delete(run);}
  }
  async #json(path,options) {return parse((await this.#request(path,options)).bytes);}
  #query(path,input={}) {const query=new URLSearchParams();for(const[key,value]of Object.entries(input))if(value!==undefined&&value!==null)query.set(key,String(value));return path+(query.size?'?'+query:'');}
  #observe(value) {this.#lastStatus=structuredClone(value);this.#lastStatusAt=new Date().toISOString();return value;}
  async browser() {await this.#assert();return {url:this.#source.value.origin+'/#'+this.#source.value.token,instanceId:this.#source.value.instanceId,workspaceId:this.#source.value.workspaceId};}
  async bootstrap() {const value=await this.#json('/api/bootstrap');this.#observe(value.status);return value;}
  async status() {return this.#observe(await this.#json('/api/status'));}
  profiles(input={}) {return this.#json(this.#query('/api/profiles',input));}
  inspectProfile(profile) {return this.#json(this.#query('/api/profile',{profile}));}
  preview(plan) {return this.#json('/api/review',{method:'POST',value:{plan}});}
  saveProfile(input) {return this.#json('/api/profiles',{method:'POST',value:input});}
  prepare(profile) {return this.#json('/api/prepare',{method:'POST',value:{profile}});}
  async openProfile(profile) {return this.#observe(await this.#json('/api/open',{method:'POST',value:{profile}}));}
  async start(input) {return this.#observe(await this.#json('/api/start',{method:'POST',value:input}));}
  async stop(profile) {return this.#observe(await this.#json('/api/stop',{method:'POST',value:{profile}}));}
  issue(input) {return this.#json('/api/issue',{method:'POST',value:input});}
  requests(input) {return this.#json(this.#query('/api/requests',input));}
  inspectRequest(id) {return this.#json(this.#query('/api/request',{id}));}
  operations(input) {return this.#json(this.#query('/api/operations',input));}
  operation(input) {return this.#json(this.#query('/api/operation',input));}
  audit(input) {return this.#json(this.#query('/api/audit',input));}
  responseMetadata(input) {return this.#json(this.#query('/api/response',input));}
  async response(input) {
    const record=await this.responseMetadata(input),file=await this.download({profile:input.profile,kind:'response',id:input.operationKey});
    need(record.sha256===file.sha256&&record.bytes===file.bytes.length,'TENDERLY_FILE_CHANGED','The original response changed between its metadata and complete bytes.');
    const {preview,previewTruncated,...metadata}=record;return {...metadata,bytes:file.bytes};
  }
  recover(input) {return this.#json('/api/recover',{method:'POST',value:input});}
  lookupProvider(input) {return this.#json('/api/provider-lookup',{method:'POST',value:input});}
  providerLookups(input) {return this.#json(this.#query('/api/provider-lookups',input));}
  providerLookup(input) {return this.#json(this.#query('/api/provider-lookup',input));}
  providerResponseMetadata(input) {return this.#json(this.#query('/api/provider-response',input));}
  async providerResponse(input) {
    const record=await this.providerResponseMetadata(input),file=await this.download({profile:input.profile,kind:'provider-response',id:input.lookupId,observationId:input.observationId});
    if(record.sha256!==undefined)need(record.sha256===file.sha256,'TENDERLY_FILE_CHANGED','The original saved provider response changed.');
    const {preview,previewTruncated,...metadata}=record;return {record:metadata,...file};
  }
  recoverProvider(input) {return this.#json('/api/provider-recover',{method:'POST',value:input});}
  async download(input) {
    const {bytes,response}=await this.#request(this.#query('/api/download',input),{maximum:TENDERLY_MAX_FILE_BYTES});
    const sha256=digest(bytes);
    need(HASH.test(response.headers.get('x-tenderly-content-sha256')??'')&&sha256===response.headers.get('x-tenderly-content-sha256'),
      'TENDERLY_FILE_CHANGED','The complete original download differs from its declared digest.');
    const disposition=response.headers.get('content-disposition')??'',match=/^attachment; filename="([A-Za-z0-9._-]{1,128})"$/.exec(disposition);
    need(match,'TENDERLY_DOWNLOAD_INVALID','The original download name is missing.',502);
    return {bytes,sha256,name:match[1],mime:response.headers.get('content-type')||'application/octet-stream'};
  }
  close() {if(!this.#closing){this.#closed=true;this.#closing=Promise.allSettled([...this.#pending]).then(()=>undefined);}return this.#closing;}
}
/** A managed service handle detaches its client; Applications owns the original server lifecycle. */
export async function attachTenderlyWorkspace({directory,workspaceId,workspaceSha256,expectedInstanceId}={}) {
  absolute(directory);
  const client=await TenderlyWorkspaceClient.connect(join(directory,TENDERLY_CONNECTION_FILENAME),
    {directory,workspaceId,workspaceSha256,expectedInstanceId});
  try {
    const browser=await client.browser();
    return {client,model:client,instanceId:client.connection.instanceId,origin:client.connection.origin,
      url:browser.url,ownership:'managed',close:()=>client.close()};
  } catch(error){await client.close();throw error;}
}
