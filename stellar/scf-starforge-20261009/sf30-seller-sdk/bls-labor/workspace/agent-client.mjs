// MIT. Durable customer-agent attachment to the original BLS analyst workspace.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, rename, unlink, link } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {openBlsLaborWorkspaceClient} from './client.mjs';

export const LIVE_SCHEMA = 'stellar-forge.bls-workspace-connection.v1';
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const MAX_BLS_PACKAGE_BYTES = 8 * 1024 ** 3;
const INSTANCE = /^[a-f0-9]{32}$/;
const SHA = /^[a-f0-9]{64}$/;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const HERE = dirname(fileURLToPath(import.meta.url));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const blsError = (code, message, extra={}) => Object.assign(new Error(message), {code,...extra});
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
    throw blsError('BLS_ANALYST_PRIVATE_DIRECTORY','Use a canonical private directory (0700).');
  return path;
}
export async function readPrivate(path, maximum=1024*1024) {
  const handle = await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size>maximum || process.platform!=='win32' && (info.mode&0o077))
      throw blsError('BLS_ANALYST_PRIVATE_FILE','Use a private regular file within the original byte limit.');
    const body = await handle.readFile();
    if(body.length>maximum) throw blsError('BLS_ANALYST_PRIVATE_FILE','The original file grew beyond its byte limit.');
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
        throw blsError('BLS_ANALYST_OPERATION_CHANGED','This original identity already selects different exact inputs.');
    }
  }finally{await unlink(stage);}
}
function parse(bytes,label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw blsError('BLS_ANALYST_SOURCE_INVALID','The original '+label+' is not complete JSON.'); }
}
function identity(info) { return {device:String(info.dev),inode:String(info.ino)}; }
function same(a,b) { return JSON.stringify(canonical(a))===JSON.stringify(canonical(b)); }
function id(value,label='operation') {
  if(typeof value!=='string'||!OPERATION.test(value)) throw blsError('BLS_ANALYST_INVALID_INPUT','Use the original stable '+label+' ID.');
  return value;
}
function endpoint(path,query={}) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query)) if(value!==undefined&&value!==null) params.set(key,String(value));
  return path+(params.size?'?'+params:'');
}

async function fileIdentity(path){
 path=resolve(path);if(await realpath(path)!==path)throw blsError('BLS_SOURCE_CHANGED','Select the canonical complete original file.');
 const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await handle.stat({bigint:true}),size=Number(before.size);
  if(!before.isFile()||!Number.isSafeInteger(size)||size<1||size>MAX_BLS_PACKAGE_BYTES)throw blsError('BLS_SOURCE_SIZE','Use one complete original source up to 8 GiB.');
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let position=0;
  while(position<size){const part=await handle.read(buffer,0,Math.min(buffer.length,size-position),position);if(!part.bytesRead)throw blsError('BLS_SOURCE_CHANGED','The original source ended early.');hash.update(buffer.subarray(0,part.bytesRead));position+=part.bytesRead;}
  const after=await handle.stat({bigint:true}),current=await lstat(path,{bigint:true}),keys=['dev','ino','size','mtimeNs','ctimeNs'];
  if(current.isSymbolicLink()||keys.some(key=>before[key]!==after[key]||before[key]!==current[key]))throw blsError('BLS_SOURCE_CHANGED','The complete original source changed during reading.');
  return {path,bytes:size,sha256:hash.digest('hex'),device:String(before.dev),inode:String(before.ino),modifiedNs:String(before.mtimeNs),changedNs:String(before.ctimeNs)};
 }finally{await handle.close();}
}
export {fileIdentity as bindBlsSource};
async function live(directory){
 const bytes=await readPrivate(join(directory,'bls.connection.json'),131072),value=parse(bytes,'BLS connection');
 if(value.schema!==LIVE_SCHEMA||value.workspace!==directory||!INSTANCE.test(value.instanceId??'')||!SHA.test(value.bindingSha256??'')||
    !Number.isSafeInteger(value.pid)||value.pid<1||value.launch?.instanceId!==value.instanceId||
    value.launch?.workspaceId!==value.workspaceId||value.launch?.bindingSha256!==value.bindingSha256||
    value.launch?.pid!==value.pid||value.launch?.status!=='BLS_WORKSPACE_READY')
  throw blsError('BLS_LIVE_CHANGED','Open the selected original BLS Applications listener.');
 return {value,sha256:sha256(bytes)};
}
export async function attachBlsAnalystWorkspace({directory,mode='managed',pythonExecutable,environment=process.env,exportDirectory}){
 directory=await privateDirectory(directory);const directoryIdentity=identity(await lstat(directory));
 const marker=await readPrivate(join(directory,'workspace.json')),markerSha=sha256(marker),workspace=parse(marker,'workspace');
 if(workspace.schema!=='stellar-forge.bls-labor-workspace.v1')throw blsError('BLS_WORKSPACE_CHANGED','Select the original BLS analyst workspace.');
 let child=null,exited=null,stopping=false,sdk=null;
 const stopOwned=()=>{if(child&&!stopping&&child.exitCode===null&&child.signalCode===null){stopping=true;child.kill('SIGINT');}};
 const awaitExit=async()=>{
  if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;stopOwned();
  let timer;try{await Promise.race([exited,new Promise(done=>{timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');done();},75000);})]);}finally{clearTimeout(timer);}
  if(child.exitCode===null&&child.signalCode===null){let timer;try{await Promise.race([exited,new Promise(done=>{timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');done();},10000);})]);}finally{clearTimeout(timer);}await exited;}
 };
 try{
  let announcement;
  if(mode==='owned'){
   if(typeof pythonExecutable!=='string'||resolve(pythonExecutable)!==pythonExecutable)throw blsError('BLS_PYTHON_REQUIRED','Configure the original Python executable.');
   child=spawn(pythonExecutable,[join(HERE,'cli.py'),'--workspace',directory,'serve','--port','0'],{env:{...environment},stdio:['ignore','pipe','pipe'],windowsHide:true});
   exited=new Promise(done=>{child.once('exit',(code,signal)=>done({code,signal}));child.once('error',error=>done({error}));});
   let stdout='',timer;
   try{announcement=await new Promise((done,reject)=>{
    timer=setTimeout(()=>reject(blsError('BLS_START_TIMEOUT','The original Python workspace did not announce startup.')),30000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>131072)return reject(blsError('BLS_START_OUTPUT','Original startup output exceeds its bound.'));try{const value=JSON.parse(stdout);if(value.status==='BLS_WORKSPACE_READY')done(value);}catch{}});
    child.stderr.on('data',()=>{});
    child.once('error',()=>reject(blsError('BLS_START_FAILED','The configured original Python executable could not start.')));
    child.once('exit',()=>reject(blsError('BLS_START_FAILED','The original Python owner exited before readiness.')));
   });}finally{clearTimeout(timer);}
  }else if(mode!=='managed')throw blsError('BLS_MODE','Choose managed or owned attachment.');
  const selected=await live(directory);
  if(selected.value.workspaceId!==workspace.workspace_id||announcement&&!same(announcement,selected.value.launch))throw blsError('BLS_INSTANCE_CHANGED','The original listener selects another workspace.');
  exportDirectory=await privateDirectory(exportDirectory,{create:true});
  const nested=relative(directory,exportDirectory);if(!nested||nested!=='..'&&!nested.startsWith('..'+sep)&&!isAbsolute(nested))throw blsError('BLS_EXPORT_DIRECTORY','Keep complete retained downloads outside the original workspace.');
  await privateDirectory(join(directory,'agent-requests'),{create:true});
  sdk=await openBlsLaborWorkspaceClient({connectionFile:join(directory,'bls.connection.json'),expectedWorkspaceId:workspace.workspace_id,expectedInstanceId:selected.value.instanceId,expectedBinding:selected.value.bindingSha256});
  const client=new BlsAnalystClient({directory,directoryIdentity,markerSha,selected,mode,exportDirectory,sdk,stopOwned,awaitExit});
  await client.verify();return client;
 }catch(error){sdk?.close();await awaitExit();throw error;}
}
export class BlsAnalystClient{
 #c;#pending=new Set();#closing=false;#closed;
 constructor(context){this.#c=context;}
 get instanceId(){return this.#c.selected.value.instanceId;}
 get summary(){const c=this.#c;return {workspaceId:c.selected.value.workspaceId,instanceId:this.instanceId,ownership:c.mode,origin:c.selected.value.origin,bindingSha256:c.selected.value.bindingSha256};}
 async verify(){
  const c=this.#c,selected=await live(c.directory),info=await lstat(c.directory);
  if(!same(identity(info),c.directoryIdentity)||sha256(await readPrivate(join(c.directory,'workspace.json')))!==c.markerSha||selected.sha256!==c.selected.sha256)
   throw blsError('BLS_INSTANCE_CHANGED','The exact original workspace or listener changed; reopen its current attachment.');
  await c.sdk.verify();return this.summary;
 }
 async #tracked(action){
  if(this.#closing)throw blsError('BLS_CLOSING','The original BLS attachment is closing.');
  const pending=Promise.resolve().then(async()=>{await this.verify();return action();});this.#pending.add(pending);
  try{return await pending;}finally{this.#pending.delete(pending);}
 }
 async view(view,query={}){
  const sdk=this.#c.sdk;return this.#tracked(()=>{
   switch(view){
    case 'state':return sdk.state(query);case 'default-selection':return sdk.defaultSelection();
    case 'edition':return sdk.edition(query.id);case 'observations':return sdk.observations(query);
    case 'note':return sdk.note(query.subject);case 'report':return sdk.report(query);
    case 'regional-definition':return sdk.regionalDefinition(query.id);case 'native-state':return sdk.nativeState(query.id);
    default:throw blsError('BLS_VIEW','Choose an original analyst view.');
   }
  });
 }
 #paths(operationId){const key=sha256(id(operationId));return {intent:join(this.#c.directory,'agent-requests',key+'.intent.json'),request:join(this.#c.directory,'agent-requests',key+'.request.json')};}
 async operation(operationId){
  return this.#tracked(async()=>{
   const paths=this.#paths(operationId);let saved=null,request=null;
   try{saved=parse(await readPrivate(paths.intent,MAX_REQUEST_BYTES+65536),'original agent intent');}catch(error){if(error.code!=='ENOENT')throw error;}
   try{request=parse(await readPrivate(paths.request,MAX_REQUEST_BYTES),'original operation request');}catch(error){if(error.code!=='ENOENT')throw error;}
   return {saved,request,observed:await this.#c.sdk.operationLookup(operationId)};
  });
 }
 async save(request,{sourcePath,sourceAlias,destinationPath,destinationAlias}={}){
  request=structuredClone(request);
  return this.#tracked(async()=>{
   const c=this.#c,paths=this.#paths(request.id),logical={request,sourceAlias:sourceAlias??null,destinationAlias:destinationAlias??null};
   if(!plain(request)||!plain(request.input)||!Number.isSafeInteger(request.expected_revision)||request.expected_revision<0)
    throw blsError('BLS_REQUEST','Use the complete original operation request and current revision.');
   const lookup=await c.sdk.operationLookup(request.id);let intent;
   try{intent=parse(await readPrivate(paths.intent,MAX_REQUEST_BYTES+65536),'original agent intent');}catch(error){if(error.code!=='ENOENT')throw error;}
   if(intent){
    if(!same(intent.logical,logical)||intent.workspaceId!==c.selected.value.workspaceId)throw blsError('BLS_OPERATION_CHANGED','This operation already belongs to different exact customer input.');
    if(lookup.found){
     let retained;
     try{retained=parse(await readPrivate(paths.request,MAX_REQUEST_BYTES),'original accepted request');}catch(error){if(error.code==='ENOENT')throw blsError('BLS_REQUEST_MISSING','The workspace has accepted this ID but its immutable agent request is missing; restore the original agent request before continuing.');throw error;}
     if(!same(retained,lookup.request))throw blsError('BLS_OPERATION_CHANGED','The original saved workspace request differs from the retained input.');
     if(['complete','pending','running'].includes(lookup.operation.state))return lookup.operation;
    }
    if(intent.workspaceDirectory!==c.directory)throw blsError('BLS_RELOCATED_REQUEST','Continue this unsatisfied operation in its original workspace or prepare a new operation against the received project.');
   }else{
    if(lookup.found)throw blsError('BLS_OPERATION_OWNED','The selected ID belongs to an existing original operation; inspect its exact saved request.');
    intent={schema:'stellar-forge.bls-agent-intent.v1',logical,workspaceId:c.selected.value.workspaceId,workspaceDirectory:c.directory,
      source:sourcePath?await fileIdentity(sourcePath):null,destination:destinationPath??null};
    await once(paths.intent,intent);
   }
   let actual;
   try{actual=parse(await readPrivate(paths.request,MAX_REQUEST_BYTES),'original request');}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!actual){
    actual=structuredClone(request);
    if(intent.source){
     const uploadId='agent-'+sha256(request.id).slice(0,40);let receipt;
     try{receipt=await c.sdk.uploadReceipt(uploadId);}catch(error){if(error.status!==400)throw error;}
     if(!receipt){
      const current=await fileIdentity(sourcePath??intent.source.path);
      if(!same(current,intent.source))throw blsError('BLS_SOURCE_CHANGED','Resume with the exact original configured source identity and bytes.');
      receipt=await c.sdk.upload({file:current.path,id:uploadId,name:current.path.split('/').at(-1),expectedSha256:current.sha256});
     }
     if(receipt.bytes!==intent.source.bytes||receipt.sha256!==intent.source.sha256)throw blsError('BLS_UPLOAD_CHANGED','The retained original upload differs from its selected source.');
     const digestKey=request.kind==='import'?'archive_sha256':'sha256';
     if(request.input[digestKey]!==undefined&&request.input[digestKey]!==receipt.sha256)throw blsError('BLS_SOURCE_SELECTION_CHANGED','The requested original SHA-256 differs from the configured complete source.');
     actual.input.archive=receipt.path;
     actual.input[digestKey]=receipt.sha256;
    }
    if(intent.destination)actual.input.destination=intent.destination;
    await once(paths.request,actual,MAX_REQUEST_BYTES);
   }
   if(lookup.found&&!same(lookup.request,actual))throw blsError('BLS_OPERATION_CHANGED','The retained native operation differs from this exact request.');
   return c.sdk.save(actual,{requestFile:paths.request});
  });
 }
 async resume(operationId){
  const status=await this.operation(operationId);
  if(!status.saved)throw blsError('BLS_REQUEST_MISSING','Select the exact saved analyst operation.');
  if(status.observed.found&&['complete','pending','running'].includes(status.observed.operation.state)){
   if(!same(status.request,status.observed.request))throw blsError('BLS_OPERATION_CHANGED','The original saved workspace request differs from its retained input.');
   return status.observed.operation;
  }
  const intent=status.saved;
  return this.save(intent.logical.request,{sourcePath:intent.source?.path,sourceAlias:intent.logical.sourceAlias??undefined,destinationPath:intent.destination??undefined,destinationAlias:intent.logical.destinationAlias??undefined});
 }
 previewDefinition(document){return this.#tracked(()=>this.#c.sdk.receiveRegionalDefinition(document));}
 stop(operationId){return this.#tracked(()=>this.#c.sdk.stopNative(id(operationId)));}
 async download({exportId,kind,id:itemId,name=''}){
  return this.#tracked(async()=>{
   const c=this.#c,key=sha256(id(exportId,'export')),path=join(c.exportDirectory,key+'.json');
   const selection={kind,id:itemId,name},intent={schema:'stellar-forge.bls-agent-export-request.v1',exportId,selection,workspaceId:c.selected.value.workspaceId};
   await once(join(c.exportDirectory,key+'.request.json'),intent,1048576);let prior;
   try{prior=parse(await readPrivate(path,1048576),'retained export');}catch(error){if(error.code!=='ENOENT')throw error;}
   if(prior){if(!same(prior.selection,selection)||prior.workspaceId!==intent.workspaceId)throw blsError('BLS_EXPORT_CHANGED','Use the retained original file selection.');return prior;}
   const destination=join(c.exportDirectory,key+'.'+randomUUID()+'.bin');
   const result=await c.sdk.download({kind,id:itemId,name,destination});
   const metadata={schema:'stellar-forge.bls-agent-export.v1',exportId,selection,workspaceId:intent.workspaceId,
    filename:destination.split('/').at(-1),file:{name:name||'bls-workspace.zip',bytes:result.bytes,sha256:result.sha256,type:result.contentType}};
   await once(path,metadata,1048576);return metadata;
  });
 }
 async retained(exportId){
  const c=this.#c,metadata=parse(await readPrivate(join(c.exportDirectory,sha256(id(exportId))+'.json'),1048576),'retained export');
  if(metadata.exportId!==exportId||metadata.workspaceId!==c.selected.value.workspaceId||!SHA.test(metadata.file?.sha256??'')||
     !/^[a-f0-9]{64}\.[a-f0-9-]{36}\.bin$/.test(metadata.filename??''))throw blsError('BLS_EXPORT_CHANGED','The selected retained file identity changed.');
  const handle=await open(join(c.exportDirectory,metadata.filename),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const info=await handle.stat();if(!info.isFile()||info.size!==metadata.file.bytes||process.platform!=='win32'&&(info.mode&0o077))throw blsError('BLS_EXPORT_CHANGED','The original retained file changed.');
   return {readonlyFileHandle:handle,bytes:info.size,sha256:metadata.file.sha256,name:metadata.file.name,type:metadata.file.type};
  }catch(error){await handle.close();throw error;}
 }
 requestClose(){this.#closing=true;this.#c.sdk.close();this.#c.stopOwned();}
 close(){
  if(!this.#closed){const attempt=(async()=>{this.requestClose();await Promise.allSettled([...this.#pending]);await this.#c.awaitExit();return {instanceId:this.instanceId,ownership:this.#c.mode,state:this.#c.mode==='managed'?'DETACHED':'CLOSED'};})();this.#closed=attempt;void attempt.catch(()=>{if(this.#closed===attempt)this.#closed=null;});}
  return this.#closed;
 }
}
