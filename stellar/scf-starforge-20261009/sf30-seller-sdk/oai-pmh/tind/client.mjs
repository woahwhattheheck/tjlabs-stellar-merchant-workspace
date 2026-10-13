// MIT. One live attachment to the original TIND Python workspace.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, rename, unlink, link } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE_SCHEMA = 'stellar-forge.tind-live-connection.v1';
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const MAX_TIND_PACKAGE_BYTES = 4 * 1024 ** 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const OPERATION = /^[A-Za-z0-9._:-]{1,128}$/;
const HERE = dirname(fileURLToPath(import.meta.url));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const tindError = (code, message, extra={}) => Object.assign(new Error(message), {code,...extra});
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(canonical(value)) + '\n');
export async function privateDirectory(path,{create=false}={}) {
  path = resolve(path);
  if (create) await mkdir(path,{recursive:true,mode:0o700});
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path)!==path ||
      process.platform!=='win32' && (info.mode&0o077))
    throw tindError('TIND_PRIVATE_DIRECTORY','Use a canonical private directory (0700).');
  return path;
}
export async function readPrivate(path, maximum=1024*1024) {
  const handle = await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size>maximum || process.platform!=='win32' && (info.mode&0o077))
      throw tindError('TIND_PRIVATE_FILE','Use a private regular file within the original byte limit.');
    const body = await handle.readFile();
    if(body.length>maximum) throw tindError('TIND_PRIVATE_FILE','The original file grew beyond its byte limit.');
    return body;
  } finally { await handle.close(); }
}
async function atomic(path,value) {
  const temporary=path+'.'+randomUUID()+'.partial', handle=await open(temporary,'wx',0o600);
  try { await handle.writeFile(encoded(value)); await handle.sync(); } finally { await handle.close(); }
  try { await rename(temporary,path); } finally { await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
}
async function once(path,value,maximum=MAX_REQUEST_BYTES+65536){
  const stage=path+'.'+randomUUID()+'.partial', handle=await open(stage,'wx',0o600);
  try{await handle.writeFile(encoded(value));await handle.sync();}finally{await handle.close();}
  try{
    try{await link(stage,path);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(!same(parse(await readPrivate(path,maximum),'immutable original input'),value))
        throw tindError('TIND_OPERATION_CHANGED','This original identity already selects different exact inputs.');
    }
  }finally{await unlink(stage);}
}
function parse(bytes,label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw tindError('TIND_SOURCE_INVALID','The original '+label+' is not complete JSON.'); }
}
function identity(info) { return {device:String(info.dev),inode:String(info.ino)}; }
function same(a,b) { return JSON.stringify(canonical(a))===JSON.stringify(canonical(b)); }
function id(value,label='operation') {
  if(typeof value!=='string'||!OPERATION.test(value)) throw tindError('TIND_INVALID_INPUT','Use the original stable '+label+' ID.');
  return value;
}
function endpoint(path,query={}) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query)) if(value!==undefined&&value!==null) params.set(key,String(value));
  return path+(params.size?'?'+params:'');
}
async function readConnection(directory) {
  const bytes=await readPrivate(join(directory,'oai/tind/live.json'),131072);
  const document=parse(bytes,'live connection'), launch=document?.launch;
  let url;try{url=new URL(launch?.url);}catch{}
  if(document?.schema!==LIVE_SCHEMA||document.workspace!==directory||!UUID.test(document.instanceId??'')||
      !plain(launch)||launch.schema!=='stellar-forge.tind-workspace-launch.v1'||
      launch.instanceId!==document.instanceId||launch.workspace!==directory||
      launch.status!=='TIND_WORKSPACE_READY'||!SHA.test(launch.bindingSha256??'')||
      launch.console!==launch.url||!Number.isSafeInteger(launch.pid)||launch.pid<1||
      !url||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||
      url.pathname!=='/'||url.search||url.username||url.password||!/^#[a-f0-9]{32}$/.test(url.hash))
    throw tindError('TIND_LIVE_CONNECTION_CHANGED','Open the original current TIND Applications listener.');
  return {document,sha256:sha256(bytes),origin:url.origin,token:url.hash.slice(1)};
}
async function limitedJSON(response,maximum=64*1024*1024) {
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maximum) {await response.body?.cancel();throw tindError('TIND_RESPONSE_SIZE','Use the paged original view or retained download.');}
  const chunks=[];let size=0;
  if(response.body) for await(const chunk of response.body) {
    size+=chunk.length;if(size>maximum)throw tindError('TIND_RESPONSE_SIZE','Use the paged original view or retained download.');
    chunks.push(chunk);
  }
  const result=parse(Buffer.concat(chunks),'workspace response');
  if(!response.ok) throw tindError('TIND_ORIGINAL_REJECTED',typeof result.error==='string'?result.error.slice(0,2000):'The original workspace rejected this request.',{status:response.status});
  return result;
}
/** Bind one actual host-selected input before retaining its immutable request. */
export async function bindTindSource(path,kind='file',alias){
  path=resolve(path);
  if(!['file','directory'].includes(kind)||await realpath(path)!==path)
    throw tindError('TIND_SOURCE_CHANGED','Select the canonical original source.');
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(kind==='directory'?(constants.O_DIRECTORY??0):0));
  try{
    const before=await handle.stat({bigint:true});
    if(!(kind==='directory'?before.isDirectory():before.isFile()))throw tindError('TIND_SOURCE_CHANGED','The selected source has another kind.');
    const bound={schema:'stellar-forge.tind-source-binding.v1',kind,path,device:String(before.dev),inode:String(before.ino)};
    if(alias!==undefined)bound.alias=alias;
    if(kind==='file'){
      const bytes=Number(before.size);
      if(!Number.isSafeInteger(bytes)||bytes>1024**4)throw tindError('TIND_SOURCE_SIZE','The original source exceeds the TIND file limit.');
      const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);
      let position=0;
      while(position<bytes){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,bytes-position),position);
        if(!bytesRead)throw tindError('TIND_SOURCE_CHANGED','The selected source ended before its complete byte count.');
        hash.update(buffer.subarray(0,bytesRead));position+=bytesRead;}
      Object.assign(bound,{bytes,sha256:hash.digest('hex'),modifiedNs:String(before.mtimeNs),changedNs:String(before.ctimeNs)});
    }
    const after=await handle.stat({bigint:true}),current=await lstat(path,{bigint:true});
    const keys=kind==='file'?['dev','ino','size','mtimeNs','ctimeNs']:['dev','ino'];
    if(current.isSymbolicLink()||keys.some(key=>before[key]!==after[key]||before[key]!==current[key])||await realpath(path)!==path)
      throw tindError('TIND_SOURCE_CHANGED','The original source changed during selection.');
    return bound;
  }finally{await handle.close();}
}
/** Attach one configured existing workspace. Managed mode never terminates Applications. */
export async function attachTindWorkspace({directory,mode='managed',pythonExecutable,environment=process.env,exportDirectory}) {
  directory=await privateDirectory(directory);
  const directoryIdentity=identity(await lstat(directory));
  const marker=await readPrivate(join(directory,'workspace.json'),1024*1024),markerSha=sha256(marker);
  if(!['managed','owned'].includes(mode))throw tindError('TIND_INVALID_MODE','Choose managed or owned mode.');
  let child=null,exited=null,announcement=null,stopping=false;
  const stopOwned=()=>{if(child&&!stopping&&child.exitCode===null&&child.signalCode===null){stopping=true;child.kill('SIGINT');}};
  const awaitExit=async()=> {
    if(!child||!child.pid||child.exitCode!==null||child.signalCode!==null)return;
    stopOwned();
    let timer;
    try { await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');resolve();},75000);})]); }
    finally { clearTimeout(timer); }
    if(child.exitCode===null&&child.signalCode===null) {
      let hard;
      try {await Promise.race([exited,new Promise(resolve=>{hard=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');resolve();},10000);})]);}
      finally{clearTimeout(hard);}
      await exited;
    }
  };
  try {
    if(mode==='owned') {
      if(typeof pythonExecutable!=='string'||resolve(pythonExecutable)!==pythonExecutable)throw tindError('TIND_PYTHON_REQUIRED','Configure the original absolute Python executable.');
      let stdout='',stderr='';
      child=spawn(pythonExecutable,[join(HERE,'cli.py'),'--workspace',directory,'serve','--port','0'],{env:{...environment},stdio:['ignore','pipe','pipe'],windowsHide:true});
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      exited=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',error=>resolve({error}));});
      let readyTimer;
      try {
        announcement=await new Promise((resolveReady,reject)=>{
          readyTimer=setTimeout(()=>reject(tindError('TIND_START_TIMEOUT','The original Python listener did not become ready.')),30000);
          child.stdout.on('data',chunk=>{
            stdout+=chunk.toString('utf8');
            if(stdout.length>131072){reject(tindError('TIND_START_OUTPUT','The original startup response exceeded its bound.'));return;}
            try{const value=JSON.parse(stdout);if(value?.status==='TIND_WORKSPACE_READY')resolveReady(value);}catch{}
          });
          child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-4096);});
          child.once('error',()=>reject(tindError('TIND_START_FAILED','The configured original Python executable could not start.')));
          child.once('exit',()=>reject(tindError('TIND_START_FAILED','The original TIND listener exited before startup.')));
        });
      } finally {clearTimeout(readyTimer);}
    }
    const selected=await readConnection(directory);
    if(announcement&&!same(announcement,selected.document.launch))throw tindError('TIND_INSTANCE_CHANGED','The owned original startup differs from its live connection.');
    await privateDirectory(join(directory,'oai/tind/agent-requests'),{create:true});
    exportDirectory=await privateDirectory(exportDirectory,{create:true});
    const nested=relative(directory,exportDirectory);
    if(!nested||nested!=='..'&&!nested.startsWith('..'+sep)&&!isAbsolute(nested))
      throw tindError('TIND_EXPORT_DIRECTORY','Keep retained downloads outside the original workspace tree.');
    const client=new TindWorkspaceClient({directory,directoryIdentity,markerSha,selected,mode,child,stopOwned,awaitExit,exportDirectory});
    await client.verify();
    return client;
  } catch(error) {await awaitExit();throw error;}
}
export class TindWorkspaceClient {
  #context;#closing=false;#closed;#pending=new Set();#controllers=new Set();#writes=new Map();
  constructor(context){this.#context=context;}
  get instanceId(){return this.#context.selected.document.instanceId;}
  get ownership(){return this.#context.mode;}
  get summary(){return {instanceId:this.instanceId,ownership:this.ownership,origin:this.#context.selected.origin,
    bindingSha256:this.#context.selected.document.launch.bindingSha256,closing:this.#closing};}
  async #connection(){
    if(this.#closing)throw tindError('TIND_CLOSING','The selected attachment is closing.');
    const c=this.#context;
    if(!same(identity(await lstat(c.directory)),c.directoryIdentity)||await realpath(c.directory)!==c.directory||
       sha256(await readPrivate(join(c.directory,'workspace.json'),1024*1024))!==c.markerSha)
      throw tindError('TIND_WORKSPACE_CHANGED','The original workspace directory or marker changed.');
    const current=await readConnection(c.directory);
    if(current.sha256!==c.selected.sha256)throw tindError('TIND_INSTANCE_CHANGED','The original live instance changed. Close this attachment and reopen the current listener.');
    return current;
  }
  async #tracked(action){
    if(this.#closing)throw tindError('TIND_CLOSING','The selected attachment is closing.');
    const promise=Promise.resolve().then(action);this.#pending.add(promise);
    try{return await promise;}finally{this.#pending.delete(promise);}
  }
  async #http(path,{body,consume=limitedJSON,timeout=90000}={}){
    const selected=await this.#connection(), controller=new AbortController();
    this.#controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),timeout);
    try {
      const headers={'X-Tind-Session':selected.token};
      if(body!==undefined)headers['Content-Type']='application/json';
      const response=await fetch(selected.origin+path,{method:body===undefined?'GET':'POST',headers,body,redirect:'error',signal:controller.signal});
      return await consume(response);
    } finally {clearTimeout(timer);this.#controllers.delete(controller);}
  }
  async verify(){
    return this.#tracked(async()=>{
      const actual=await this.#http('/api/launch');
      if(!same(actual,this.#context.selected.document.launch))throw tindError('TIND_INSTANCE_CHANGED','The original local listener identity differs from its private connection.');
      return this.summary;
    });
  }
  async get(path,query={}){
    if(!READ_PATHS.has(path))throw tindError('TIND_ROUTE_INVALID','Choose an original declared workspace view.');
    return this.#tracked(()=>this.#http(endpoint(path,query)));
  }
  async preview(kind,body){
    const path=kind==='source-case'?'/api/source-cases/plan':kind==='destination-job'?'/api/destination-job-preview':null;
    if(!path)throw tindError('TIND_ROUTE_INVALID','Choose the original source-case or destination-job preview.');
    return this.#tracked(()=>this.#http(path,{body:this.#body(body)}));
  }
  #body(value){
    const body=encoded(value);
    if(body.length>MAX_REQUEST_BYTES)throw tindError('TIND_REQUEST_SIZE','The complete encoded original request must fit within 8 MiB.');
    return body;
  }
  async #saved(kind,request){
    id(request.operationId);const key=sha256(kind+'\n'+request.operationId);
    if(this.#writes.has(key)) {
      const existing=this.#writes.get(key);
      if(existing.sha256!==sha256(this.#body(request)))throw tindError('TIND_OPERATION_CHANGED','This active operation has different exact inputs.');
      return existing.promise;
    }
    const body=this.#body(request),requestSha=sha256(body);
    const promise=this.#tracked(async()=>{
      const path=join(this.#context.directory,'oai/tind/agent-requests',key+'.json');
      const originalPath=join(this.#context.directory,'oai/tind/agent-requests',key+'.request.json');
      const original={schema:'stellar-forge.tind-agent-request-input.v1',kind,operationId:request.operationId,requestSha256:requestSha,request};
      await once(originalPath,original);
      let saved;
      try{saved=parse(await readPrivate(path,96*1024*1024),'saved agent request');}catch(error){if(error.code!=='ENOENT')throw error;}
      if(saved&&(saved.kind!==kind||saved.requestSha256!==requestSha||!same(saved.request,request)))
        throw tindError('TIND_OPERATION_CHANGED','Reuse the retained exact request and operation ID.');
      if(saved?.status==='returned')return saved.result;
      saved=saved??{schema:'stellar-forge.tind-agent-request.v1',kind,operationId:request.operationId,requestSha256:requestSha,request};
      saved.status='sending';saved.attemptedAt=new Date().toISOString();
      await atomic(path,saved);
      try {
        const result=await this.#http(kind==='apply'?'/api/apply':'/api/native',{body});
        saved.status='returned';saved.result=result;saved.returnedAt=new Date().toISOString();
        await atomic(path,saved);return result;
      }catch(error){
        saved.status=error.code==='TIND_ORIGINAL_REJECTED'?'rejected':'unknown';
        saved.error={code:error.code??'TIND_TRANSPORT_INTERRUPTED',status:error.status??null};
        await atomic(path,saved);
        if(saved.status==='unknown')throw tindError('TIND_OUTCOME_UNKNOWN','Read this exact saved operation before continuing; resume with the same operation ID and input.',{operationId:request.operationId,kind});
        throw error;
      }
    });
    this.#writes.set(key,{sha256:requestSha,promise});
    try{return await promise;}finally{this.#writes.delete(key);}
  }
  async apply(request){
    request=structuredClone(request);
    if(['destination-file','source-download-import','file-root'].includes(request.kind)&&request.input?.sourceBinding===undefined)
      request.input.sourceBinding=await bindTindSource(request.input.path,request.kind==='file-root'?'directory':'file');
    return this.#saved('apply',request);
  }
  async native(request){return this.#saved('native',request);}
  async #journal(kind,operationId){
    const key=sha256(kind+'\n'+id(operationId)),base=join(this.#context.directory,'oai/tind/agent-requests',key);
    let original=null,saved=null;
    try{original=parse(await readPrivate(base+'.request.json',MAX_REQUEST_BYTES+65536),'original immutable agent request');}catch(error){if(error.code!=='ENOENT')throw error;}
    try{saved=parse(await readPrivate(base+'.json',96*1024*1024),'saved agent request');}catch(error){if(error.code!=='ENOENT')throw error;}
    if(saved&&(!original||!same(original.request,saved.request)||original.requestSha256!==saved.requestSha256))
      throw tindError('TIND_OPERATION_CHANGED','The request journal differs from its original immutable input.');
    if(original&&(original.kind!==kind||original.operationId!==operationId||sha256(this.#body(original.request))!==original.requestSha256))
      throw tindError('TIND_OPERATION_CHANGED','The immutable original request identity changed.');
    return saved??(original?{...original,status:'prepared'}:null);
  }
  async operation({kind='apply',operationId,projectId,task,acquisitionId}){
    const saved=await this.#journal(kind,operationId);
    const observed=await this.get(kind==='apply'?'/api/operation':'/api/native-operation',
      {operation:operationId,project:projectId??saved?.request.projectId,task:task??saved?.request.task,acquisition:acquisitionId??saved?.request.input?.acquisitionId});
    return {saved,observed};
  }
  async resume({kind='apply',operationId}){
    const saved=await this.#journal(kind,operationId);
    if(!saved)throw tindError('TIND_OPERATION_NOT_SAVED','Receive the original complete request journal before resuming this operation.');
    // Native acceptance is distinct from completion. The original task engine
    // decides whether the retained exact request can continue.
    if(kind==='native'&&saved.status==='returned'){
      const status=await this.operation({kind,operationId});
      if(status.observed.process?.status==='running')return status.observed.process;
      await atomic(join(this.#context.directory,'oai/tind/agent-requests',sha256(kind+'\n'+operationId)+'.json'),{...saved,status:'unknown'});
    }
    return this.#saved(kind,saved.request);
  }
  async pause(projectId,acquisitionId){return this.#tracked(()=>this.#http('/api/source-download/stop',{body:this.#body({projectId,acquisitionId})}));}
  async download({exportId,kind,query={},expectedSelectionSha256}){
    id(exportId,'export');const route=DOWNLOAD_PATHS[kind];
    if(!route)throw tindError('TIND_DOWNLOAD_INVALID','Choose a complete original retained file.');
    const c=this.#context,key=sha256(exportId),manifestPath=join(c.exportDirectory,key+'.json');
    return this.#tracked(async()=>{
      let old;
      try{old=parse(await readPrivate(manifestPath,1048576),'retained download');}catch(error){if(error.code!=='ENOENT')throw error;}
      const selection={kind,query},selectionSha=sha256(encoded(selection));
      await once(join(c.exportDirectory,key+'.request.json'),{exportId,selection,selectionSha256:selectionSha,
        workspaceDirectory:c.directory,workspaceMarkerSha256:c.markerSha,workspaceDirectoryIdentity:c.directoryIdentity},1048576);
      if(expectedSelectionSha256!==undefined&&expectedSelectionSha256!==selectionSha)throw tindError('TIND_EXPORT_SELECTION_CHANGED','Use the exact retained download selection.');
      if(old) {
        if(old.exportId!==exportId||old.selectionSha256!==selectionSha)throw tindError('TIND_EXPORT_SELECTION_CHANGED','This export ID already selects another original file.');
        return old;
      }
      const before=await this.#http('/api/state');
      const revisions=sha256(encoded({workspaceIdentity:before.workspaceIdentity,projects:before.projects}));
      const temporary=join(c.exportDirectory,key+'.'+randomUUID()+'.partial');
      let handle=await open(temporary,'wx',0o600),metadata;
      try {
        metadata=await this.#http(endpoint(route,query),{timeout:30*60*1000,consume:async response=>{
          if(!response.ok)return limitedJSON(response);
          const rawLength=response.headers.get('content-length'),size=Number(rawLength),expected=response.headers.get('x-content-sha256');
          if(!/^\d+$/.test(rawLength??'')||!Number.isSafeInteger(size)||size>MAX_TIND_PACKAGE_BYTES||!SHA.test(expected??'')) {
            await response.body?.cancel();throw tindError('TIND_DOWNLOAD_IDENTITY','The original download must declare its complete length and SHA-256.');
          }
          const hash=createHash('sha256');let count=0;
          if(response.body)for await(const chunk of response.body) {
            count+=chunk.length;if(count>size)throw tindError('TIND_DOWNLOAD_CHANGED','The original download exceeded its declared length.');
            hash.update(chunk);await handle.writeFile(chunk);
          }
          const digest=hash.digest('hex');
          if(count!==size||digest!==expected)throw tindError('TIND_DOWNLOAD_CHANGED','The complete original download did not match its declared identity.');
          await handle.sync();
          return {bytes:count,sha256:digest,contentType:response.headers.get('content-type')??'application/octet-stream'};
        }});
        await handle.close();handle=null;
        const after=await this.#http('/api/state');
        if(sha256(encoded({workspaceIdentity:after.workspaceIdentity,projects:after.projects}))!==revisions)
          throw tindError('TIND_EXPORT_REVISION_CHANGED','The original project changed during export; select its current revision and retry this export.');
        const filename=metadata.sha256+'.bin',target=join(c.exportDirectory,filename);
        try{const present=await lstat(target);if(!present.isFile()||present.isSymbolicLink()||present.size!==metadata.bytes)throw tindError('TIND_EXPORT_CHANGED','A retained export with this identity changed.');await unlink(temporary);}
        catch(error){if(error.code!=='ENOENT')throw error;await rename(temporary,target);}
        const result={schema:'stellar-forge.tind-agent-export.v1',exportId,kind,query,selectionSha256:selectionSha,workspaceRevisionsSha256:revisions,
          createdAt:new Date().toISOString(),file:{name:DOWNLOAD_NAMES[kind],...metadata},filename};
        await atomic(manifestPath,result);return result;
      }finally{await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    });
  }
  async retained(exportId){
    id(exportId,'export');
    const c=this.#context,manifest=parse(await readPrivate(join(c.exportDirectory,sha256(exportId)+'.json'),1048576),'retained export');
    if(manifest.exportId!==exportId||!SHA.test(manifest.file?.sha256??'')||manifest.filename!==manifest.file.sha256+'.bin')
      throw tindError('TIND_EXPORT_CHANGED','The original retained export identity changed.');
    const handle=await open(join(c.exportDirectory,manifest.filename),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try{
      const info=await handle.stat();
      if(!info.isFile()||info.size!==manifest.file.bytes||process.platform!=='win32'&&(info.mode&0o077))
        throw tindError('TIND_EXPORT_CHANGED','The original retained export file changed.');
      return {readonlyFileHandle:handle,bytes:info.size,sha256:manifest.file.sha256,name:manifest.file.name,type:manifest.file.contentType};
    }catch(error){await handle.close();throw error;}
  }
  requestClose(){this.#closing=true;this.#context.stopOwned();for(const controller of this.#controllers)controller.abort();}
  close(){
    if(!this.#closed){
      const attempt=(async()=>{this.requestClose();await Promise.allSettled([...this.#pending]);await this.#context.awaitExit();return {instanceId:this.instanceId,ownership:this.ownership,state:this.ownership==='managed'?'DETACHED':'CLOSED'};})();
      this.#closed=attempt;void attempt.catch(()=>{if(this.#closed===attempt)this.#closed=null;});
    }
    return this.#closed;
  }
}
export const READ_PATHS=new Set(['/api/state','/api/history','/api/records','/api/record','/api/original','/api/production-collections',
 '/api/production-plans','/api/production-wave','/api/source-downloads','/api/files','/api/file-history',
 '/api/source-cases','/api/source-case','/api/source-case-reviews','/api/destination-jobs','/api/job-observation','/api/operation','/api/native-operation']);
export const DOWNLOAD_PATHS=Object.freeze({
 record:'/download/record',batch:'/download/batch','batch-file':'/download/batch-file',handover:'/download/handover',
 'production-plan':'/download/production-plan','source-acquisition':'/download/source-acquisition','source-document':'/download/source-document',
 'source-cases':'/download/source-cases','source-case-review':'/download/source-case-review','file-receipt':'/download/file-receipt',
 'destination-job':'/download/destination-job','job-response':'/download/job-response'});
export const DOWNLOAD_NAMES=Object.freeze({record:'tind-working-record.json',batch:'tind-native-batch.zip','batch-file':'tind-native-batch-file.bin',
 handover:'tind-editable-handover.zip','production-plan':'tind-production-plan.jsonl','source-acquisition':'tind-source-acquisition.json',
 'source-document':'tind-original-document.bin','source-cases':'tind-source-cases.json','source-case-review':'tind-source-case-review.json',
 'file-receipt':'tind-file-observation.json','destination-job':'tind-destination-job.zip','job-response':'tind-original-job-response.bin'});
