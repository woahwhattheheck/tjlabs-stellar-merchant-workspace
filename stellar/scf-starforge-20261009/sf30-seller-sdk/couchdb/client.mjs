// MIT. Attach to the actual original CouchDB workspace listener and saved requests.
import { join, resolve, dirname, basename } from 'node:path';
import { constants } from 'node:fs';
import { open, lstat, rename } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { readCouchdbWorkspaceIdentity } from './operator.mjs';
import { need, HASH, UUID, MAX_BODY, only, object, integer, bytes, digest, identity, privateDirectory, readPrivate, readJson, retainJSON, exists, syncDirectory } from './common.mjs';
const STARTUP='stellar-forge.couchdb-workspace-startup.v1';
export async function readCouchdbConnection(file,{expectedWorkspaceId}={}){
  const selected=await readJson(resolve(file),16384);
  need(selected.schema===STARTUP&&UUID.test(selected.workspaceId??'')&&UUID.test(selected.instanceId??'')&&HASH.test(selected.workspaceIdentitySha256??'')&&
    selected.connectionFile===resolve(file)&&selected.connectionFile===join(selected.stateDirectory,'connection.json'),'COUCHDB_CONNECTION_INVALID');
  const original=await readCouchdbWorkspaceIdentity(selected.stateDirectory);
  need(original.id===selected.workspaceId&&original.sha256===selected.workspaceIdentitySha256&&(!expectedWorkspaceId||original.id===expectedWorkspaceId),'COUCHDB_CONNECTION_IDENTITY_CHANGED');
  const url=new URL(selected.workspace);
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&!url.search&&!url.username&&!url.password&&
    Number(url.port)>0&&Number(url.port)<=65535&&/^#[a-f0-9]{64}$/.test(url.hash),'COUCHDB_CONNECTION_URL_INVALID');
  return {record:selected,url,token:url.hash.slice(1),identity:original};
}
async function responseJSON(response,maximum=MAX_BODY+16384){
  need(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'COUCHDB_RESPONSE_TYPE_CHANGED');
  const parts=[];let size=0;
  for await(const part of response.body??[]){size+=part.length;need(size<=maximum,'COUCHDB_RESPONSE_TOO_LARGE');parts.push(part);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts,size)));
}
export async function connectCouchdbWorkspace({connectionFile,expectedWorkspaceId,signal}={}){
  const selected=await readCouchdbConnection(connectionFile,{expectedWorkspaceId}),base=new URL(selected.url);base.hash='';
  const headers={'x-workspace-token':selected.token,'x-couchdb-workspace-id':selected.record.workspaceId};
  async function request(path,body,{method=body===undefined?'GET':'POST',signal:requestSignal=signal,rawBody}={}){
    const payload=rawBody??(body===undefined?undefined:bytes(body));
    need(payload===undefined||Buffer.byteLength(payload)<=MAX_BODY,'COUCHDB_REQUEST_TOO_LARGE');
    const response=await fetch(new URL(path,base),{method,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(300000),...(requestSignal?[requestSignal]:[])]),
      headers:{...headers,...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{body:payload})});
    const value=await responseJSON(response);
    need(value.workspaceId===selected.record.workspaceId&&value.instanceId===selected.record.instanceId,'COUCHDB_RESPONSE_IDENTITY_CHANGED',undefined,409);
    if(!response.ok){const error=value.data?.error;throw Object.assign(new Error(error?.message??'The original workspace returned HTTP '+response.status+'.'),{code:error?.code??'COUCHDB_HTTP_FAILED',status:response.status});}
    return value.data;
  }
  const info=await request('/api/info');
  need(info.schema==='stellar-forge.couchdb-workspace.v1'&&info.workspaceId===selected.record.workspaceId&&
    info.workspaceIdentitySha256===selected.record.workspaceIdentitySha256&&info.instanceId===selected.record.instanceId&&info.pid===selected.record.pid&&
    info.directory===selected.record.stateDirectory&&info.connectionFile===selected.record.connectionFile,'COUCHDB_LISTENER_CHANGED');
  const query=(name,input={})=>request('/api/query',{name,input});
  async function poll(id,{timeoutMs=300000,pollMs=500,signal:pollSignal=signal}={}){
    integer(timeoutMs,1,3600000);integer(pollMs,100,10000);const end=Date.now()+timeoutMs;
    for(;;){
      const status=await query('operation',{id,includeResult:false});
      if(['COMPLETE','FAILED','INTERRUPTED'].includes(status.state))return query('operation',{id,includeResult:true});
      if(Date.now()>=end)return {...status,waiting:true};
      await wait(Math.min(pollMs,end-Date.now()),undefined,{signal:pollSignal});
    }
  }
  async function action(command,input,{id=randomUUID(),wait:complete=false,...options}={}){
    const body={workspaceId:info.workspaceId,id,command,input};
    const accepted=await request('/api/action',body);
    need(accepted.id===id&&accepted.command===command&&accepted.requestSha256===identity({schema:'stellar-forge.couchdb-operation.v1',workspaceId:info.workspaceId,id,command,input}),'COUCHDB_OPERATION_ACCEPTANCE_CHANGED');
    return complete?poll(id,options):accepted;
  }
  async function resume(id,options={}){const accepted=await request('/api/resume',{id});need(accepted.id===id,'COUCHDB_OPERATION_ACCEPTANCE_CHANGED');return options.wait?poll(id,options):accepted;}
  async function download(kind,input,{directory,id=randomUUID(),expectedSha256,expectedBytes,signal:downloadSignal=signal}={}){
    need(UUID.test(id??'')&&HASH.test(expectedSha256??''),'COUCHDB_DOWNLOAD_REVIEW_REQUIRED');integer(expectedBytes,0,8*1024**3+16*1048576);
    const root=resolve(directory);await privateDirectory(root,true);
    const {acquireWorkspace}=await import('./common.mjs');const unlock=await acquireWorkspace(root);
    try{
      const requestRecord={schema:'stellar-forge.couchdb-download.v1',id,workspaceId:info.workspaceId,kind,input,expectedSha256,expectedBytes};
      await retainJSON(join(root,'request.json'),requestRecord);
      const complete=join(root,'file.bin'),partial=join(root,'.download.partial'),path=await exists(complete)?complete:partial;
      const handle=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
      const hash=createHash('sha256');let offset=0;
      try{
        const before=await handle.stat();need(before.isFile()&&before.nlink===1&&!(before.mode&0o077)&&before.size<=expectedBytes,'COUCHDB_DOWNLOAD_FILE_CHANGED');
        const buffer=Buffer.allocUnsafe(1048576);
        while(offset<before.size){const part=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset);need(part.bytesRead>0,'COUCHDB_DOWNLOAD_FILE_CHANGED');hash.update(buffer.subarray(0,part.bytesRead));offset+=part.bytesRead;}
        if(path===complete){need(offset===expectedBytes&&hash.digest('hex')===expectedSha256,'COUCHDB_DOWNLOAD_FILE_CHANGED');return {id,directory:root,file:complete,bytes:offset,sha256:expectedSha256,reused:true};}
        if(offset<expectedBytes){
          const url=new URL('/api/file',base);url.searchParams.set('kind',kind);url.searchParams.set('input',JSON.stringify(input));
          const response=await fetch(url,{redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(300000),...(downloadSignal?[downloadSignal]:[])]),headers:{...headers,...(offset?{range:'bytes='+offset+'-'}:{})}});
          need(response.status===(offset?206:200)&&response.headers.get('x-content-sha256')===expectedSha256&&Number(response.headers.get('content-length'))===expectedBytes-offset&&
            (!offset||response.headers.get('content-range')==='bytes '+offset+'-'+(expectedBytes-1)+'/'+expectedBytes),'COUCHDB_DOWNLOAD_SOURCE_CHANGED');
          for await(const part of response.body??[]){
            need(offset+part.length<=expectedBytes,'COUCHDB_DOWNLOAD_TOO_LARGE');let written=0;
            while(written<part.length){const step=await handle.write(part,written,part.length-written,offset+written);need(step.bytesWritten>0,'COUCHDB_DOWNLOAD_WRITE_FAILED');written+=step.bytesWritten;}
            hash.update(part);offset+=part.length;
          }
        }
        await handle.sync();need(offset===expectedBytes&&hash.digest('hex')===expectedSha256,'COUCHDB_DOWNLOAD_INCOMPLETE',undefined,409);
      }finally{await handle.close();}
      await rename(partial,complete);await syncDirectory(root);
      const result={id,directory:root,file:complete,bytes:offset,sha256:expectedSha256};await retainJSON(join(root,'result.json'),result);return result;
    }finally{await unlock();}
  }
  return Object.freeze({info,connection:selected.record,request,query,action,resume,poll,download,cancel:id=>request('/api/cancel',{id})});
}
