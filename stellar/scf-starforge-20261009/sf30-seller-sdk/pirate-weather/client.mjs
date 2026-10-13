// SPDX-License-Identifier: MIT
import {constants} from 'node:fs';
import {open,rename,lstat,realpath,unlink} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {readPirateConnection,verifyPirateConnection,operatorJSON,absolute,privateOrigin} from './managed.mjs';
import {identity,need,sha,uuid,whole} from './contract.mjs';
async function sync(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function digestFile(path){
 const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const before=await fd.stat({bigint:true});need(before.isFile(),'PIRATE_FILE_TYPE','Use an original regular source file.');
  const sum=createHash('sha256'),buffer=Buffer.alloc(65536);let size=0;
  for(;;){const {bytesRead}=await fd.read(buffer,0,buffer.length,size);if(!bytesRead)break;size+=bytesRead;sum.update(buffer.subarray(0,bytesRead));}
  const after=await fd.stat({bigint:true});need(BigInt(size)===before.size&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'PIRATE_FILE_CHANGED','The selected file changed.');
  return {bytes:size,sha256:sum.digest('hex')};
 }finally{await fd.close();}
}
export async function connectPirateWeather({connectionFile,expectedWorkspaceId,expectedSourceSha256,signal}={}){
 const binding=await readPirateConnection(connectionFile);if(expectedWorkspaceId!==undefined)need(binding.workspaceId===uuid(expectedWorkspaceId),'PIRATE_WORKSPACE_CHANGED','The configured workspace differs.');
 if(expectedSourceSha256!==undefined)need(binding.sourceIdentity.sha256===sha(expectedSourceSha256),'PIRATE_APPLICATION_CHANGED','The selected source edition differs.');
 await verifyPirateConnection(binding);
 let closed=false;const pending=new Set(),controllers=new Set(),readIds=new Set(),ownedReadIds=new Set();
 function request(path,options={}){
  need(!closed,'PIRATE_CLIENT_CLOSED','Reconnect this original workspace.');
  const controller=new AbortController();controllers.add(controller);
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const work=operatorJSON(binding,path,{...options,signal:controller.signal}).finally(()=>{controllers.delete(controller);signal?.removeEventListener('abort',cancel);pending.delete(work);});
  pending.add(work);return work;
 }
 const post=(path,body)=>request(path,{method:'POST',body});
 async function readFile(input){
  sha(input.id);sha(input.expectedSha256);if(input.readId!==undefined)need(readIds.has(uuid(input.readId)),'PIRATE_FILE_READER_OWNER','Use a retained file reader opened by this client.',409);
  const value=await post('/api/file-read',input),data=Buffer.from(value.data,'base64');
  need(value.encoding==='base64'&&data.toString('base64')===value.data&&value.file?.sha256===input.expectedSha256&&value.offset===(input.offset??0)&&value.bytesRead===data.length,
   'PIRATE_DOWNLOAD_CHANGED','The exact source chunk or identity differs.');
  uuid(value.readId);need(input.readId===undefined||value.readId===input.readId,'PIRATE_FILE_READER_CHANGED','The original reader identity differs.',409);ownedReadIds.add(value.readId);whole(value.file.bytes,'the source byte count');if(value.nextOffset!==null)need(value.nextOffset===value.offset+data.length&&data.length>0,'PIRATE_DOWNLOAD_OFFSET','The original chunk offset differs.');
  if(value.nextOffset===null){need(value.offset+data.length===value.file.bytes,'PIRATE_DOWNLOAD_SIZE','The source size differs.');readIds.delete(value.readId);}else readIds.add(value.readId);
  return value;
 }
 const client={
  identity:{workspaceId:binding.workspaceId,instanceId:binding.instanceId,sourceSha256:binding.sourceIdentity.sha256,configurationSha256:binding.configurationSha256},
  state:()=>request('/api/state'),read:(method,input={})=>post('/api/read',{method,input}),
  act:input=>post('/api/action',input),
  recover:operationId=>post('/api/read',{method:'operation',input:{operationId:uuid(operationId)}}),
  resume:operationId=>post('/api/resume',{operationId:uuid(operationId)}),readFile,
  async releaseFile(readId){uuid(readId);need(ownedReadIds.has(readId),'PIRATE_FILE_READER_OWNER','Release only this client’s retained file reader.',409);if(!readIds.has(readId))return {released:readId,reused:true};const reply=await post('/api/file-release',{readId});need(reply.released===readId,'PIRATE_FILE_READER_CHANGED','The original reader release differs.',409);readIds.delete(readId);return {released:readId,reused:false};},
  openReceived:operationId=>post('/api/received/open',{operationId:uuid(operationId)}),
  async uploadProject({path,id,expectedSha256}){
   absolute(path);uuid(id);sha(expectedSha256);const before=await digestFile(path);
   need(before.sha256===expectedSha256&&before.bytes<=1024**3,'PIRATE_PROJECT_CHANGED','Select the exact complete project within 1 GiB.');
   const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)),controller=new AbortController();controllers.add(controller);
   const task=(async()=>{try{
    const response=await fetch(privateOrigin(binding.origin)+'/api/upload?id='+id+'&sha256='+expectedSha256,{method:'POST',headers:{authorization:'Bearer '+binding.token,'content-type':'application/zip','content-length':String(before.bytes)},body:fd.createReadStream({autoClose:false}),duplex:'half',signal:controller.signal,redirect:'manual'});
    need(response.headers.get('x-pirate-instance')===binding.instanceId,'PIRATE_INSTANCE_CHANGED','Reconnect the original listener.');
    const chunks=[];let length=0;try{for await(const chunk of response.body){length+=chunk.length;need(length<=262144,'PIRATE_REPLY_CAPACITY','The upload receipt is too large.');chunks.push(chunk);}}
    catch(error){controller.abort();throw error;}const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!response.ok)throw Object.assign(new Error(value.message??value.error),{code:value.error,status:response.status});
    need(value.id===id&&value.sha256===expectedSha256&&value.bytes===before.bytes,'PIRATE_UPLOAD_CHANGED','The retained source upload differs.');
    need(identity(await digestFile(path))===identity(before),'PIRATE_PROJECT_CHANGED','The selected project changed during transfer.');return value;
   }finally{controllers.delete(controller);await fd.close();}})();
   pending.add(task);try{return await task;}finally{pending.delete(task);}
  },
  async download({id,expectedSha256,output}){
   sha(id);sha(expectedSha256);absolute(output);need(await realpath(dirname(output))===dirname(output),'PIRATE_OUTPUT_PATH','Use a canonical output parent.');
   const stage=output+'.pirate-'+id+'-'+expectedSha256+'.partial';
   try{
    const existing=await digestFile(output);need(existing.sha256===expectedSha256,'PIRATE_OUTPUT_EXISTS','The selected output already contains different bytes.',409);
    // Recover only our exact published hardlink; preserve any independent partial.
    try{const [a,b]=await Promise.all([lstat(output,{bigint:true}),lstat(stage,{bigint:true})]);
     if(a.dev===b.dev&&a.ino===b.ino){await unlink(stage);await sync(dirname(stage));}}
    catch(error){if(error.code!=='ENOENT')throw error;}
    await sync(dirname(output));return {...existing,path:output,reused:true};
   }catch(e){if(e.code!=='ENOENT')throw e;}
   let fd,offset=0,readId=null,metadata=null;
   try{
    try{fd=await open(stage,constants.O_RDWR|(constants.O_NOFOLLOW??0));}catch(e){if(e.code!=='ENOENT')throw e;fd=await open(stage,'wx+',0o600);}
    const stat=await fd.stat();need(stat.isFile()&&stat.nlink===1&&(stat.mode&0o077)===0,'PIRATE_DOWNLOAD_STAGE','The original download staging file differs.');
    offset=stat.size;
    // Retained chunks are rechecked against the original source before appending.
    for(let pos=0;pos<offset;){
     const chunk=await readFile({id,expectedSha256,offset:pos,limit:Math.min(65536,offset-pos),...(readId?{readId}:{})}),raw=Buffer.from(chunk.data,'base64'),local=Buffer.alloc(raw.length);
     await fd.read(local,0,local.length,pos);need(local.equals(raw),'PIRATE_DOWNLOAD_PREFIX','The partial download differs from its original source.',409);
     readId=chunk.nextOffset===null?null:chunk.readId;metadata=chunk.file;pos+=raw.length;
     need(raw.length>0||pos===offset,'PIRATE_DOWNLOAD_SIZE','The partial file exceeds its original source.');
    }
    for(;;){
     const chunk=await readFile({id,expectedSha256,offset,limit:65536,...(readId?{readId}:{})});metadata=chunk.file;
     const raw=Buffer.from(chunk.data,'base64');let written=0;while(written<raw.length){const part=await fd.write(raw,written,raw.length-written,offset+written);need(part.bytesWritten>0,'PIRATE_DOWNLOAD_WRITE','The download destination stopped accepting bytes.',507);written+=part.bytesWritten;}
     offset+=raw.length;readId=chunk.nextOffset===null?null:chunk.readId;if(chunk.nextOffset===null)break;
    }
    await fd.sync();await fd.close();fd=null;const final=await digestFile(stage);
    need(final.bytes===metadata.bytes&&final.sha256===expectedSha256,'PIRATE_DOWNLOAD_DIGEST','The complete file differs from its original digest.');
    // No replacement of an existing independent output.
    const {link}=await import('node:fs/promises');
    try{await link(stage,output);}catch(e){if(e.code!=='EEXIST')throw e;need(identity(await digestFile(output))===identity(final),'PIRATE_OUTPUT_EXISTS','The output was changed by another writer.',409);}
    await sync(dirname(output));await unlink(stage);await sync(dirname(stage));return {...final,path:output,reused:false};
   }finally{await fd?.close();if(readId)await client.releaseFile(readId).catch(()=>{});}
  },
  async close(){
   if(closed)return;closed=true;for(const controller of controllers)controller.abort();await Promise.allSettled([...pending]);
   await Promise.allSettled([...readIds].map(readId=>operatorJSON(binding,'/api/file-release',{method:'POST',body:{readId},timeoutMs:15000})));readIds.clear();
  }
 };
 return client;
}
export {digestFile as inspectPirateFile};
