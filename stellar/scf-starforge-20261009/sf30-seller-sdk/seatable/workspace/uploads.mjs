// MIT. Durable bounded upload ranges for the complete private workspace archive.
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {privateDirectory,readJson,atomicJson,createFile,hashPrivate,fault,identity,syncDirectory} from '../../postgres/publisher/files.mjs';
import {workspaceRequestId,MAX_WORKSPACE_BYTES,WORKSPACE_CHUNK_BYTES} from './handover.mjs';
const SHA=/^[a-f0-9]{64}$/;
const root=(directory,id)=>join(directory,'.workspace-transfers','uploads',workspaceRequestId(id));
async function optional(path){try{return await readJson(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function workspaceUploadStatus(directory,id){
  const folder=root(directory,id),saved=await optional(join(folder,'upload.json'));if(!saved)return null;
  let size=0;try{const stat=await lstat(join(folder,'archive.part'));if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077||stat.nlink!==1||stat.size>saved.bytes)throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED');size=stat.size;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(saved.complete&&size!==saved.bytes)throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED');
  return {...saved,received:size};
}
export async function startWorkspaceUpload(directory,input){
  const {requestId,sha256=null,bytes,filename,...extra}=input??{};workspaceRequestId(requestId);
  if(Object.keys(extra).length||!(sha256===null||SHA.test(sha256))||!Number.isSafeInteger(bytes)||bytes<13||
    bytes>MAX_WORKSPACE_BYTES+32*1024*1024+13||typeof filename!=='string'||filename.length>240||/[\u0000-\u001f\u007f/\\]/.test(filename))throw fault('SEATABLE_WORKSPACE_UPLOAD_INPUT');
  const folder=root(directory,requestId);await privateDirectory(folder,true);const prior=await workspaceUploadStatus(directory,requestId);
  const intent={filename,bytes,expectedSha256:sha256};
  if(prior){if(identity(prior.input)!==identity(intent))throw fault('SEATABLE_WORKSPACE_UPLOAD_REQUEST_CHANGED',undefined,409);return prior;}
  const saved={id:requestId,filename,bytes,sha256,received:0,complete:false,input:intent};await atomicJson(folder,'upload.json',saved);
  return saved;
}
export async function appendWorkspaceUpload(directory,id,offset,chunk){
  const current=await workspaceUploadStatus(directory,id);
  if(!current)throw fault('SEATABLE_WORKSPACE_UPLOAD_MISSING',undefined,404);
  if(!Number.isSafeInteger(offset)||offset<0||!Buffer.isBuffer(chunk)||!chunk.length||chunk.length>WORKSPACE_CHUNK_BYTES||
    offset+chunk.length>current.bytes)throw fault('SEATABLE_WORKSPACE_UPLOAD_RANGE',undefined,400);
  const folder=root(directory,id),file=join(folder,'archive.part');let handle;
  try{handle=await open(file,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);const stat=await handle.stat();
    if(!stat.isFile()||stat.mode&0o077||stat.nlink!==1||stat.size!==current.received)throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED');
    if(offset>stat.size)throw fault('SEATABLE_WORKSPACE_UPLOAD_OFFSET','Replay retained ranges from offset zero before appending.',409);
    const overlap=Math.min(chunk.length,stat.size-offset);
    if(overlap){const old=Buffer.alloc(overlap);let n=0;while(n<overlap){const r=await handle.read(old,n,overlap-n,offset+n);if(!r.bytesRead)throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED');n+=r.bytesRead;}
      if(!old.equals(chunk.subarray(0,overlap)))throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED','The selected original file differs from the retained bytes.',409);}
    if(current.complete&&overlap!==chunk.length)throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED');
    let n=overlap;while(n<chunk.length){const r=await handle.write(chunk,n,chunk.length-n,offset+n);if(!r.bytesWritten)throw fault('SEATABLE_WORKSPACE_UPLOAD_INTERRUPTED');n+=r.bytesWritten;}
    await handle.sync();
  }finally{await handle?.close();}
  await syncDirectory(folder);return workspaceUploadStatus(directory,id);
}
export async function finishWorkspaceUpload(directory,id){
  const current=await workspaceUploadStatus(directory,id);if(!current)throw fault('SEATABLE_WORKSPACE_UPLOAD_MISSING',undefined,404);
  if(current.received!==current.bytes)throw fault('SEATABLE_WORKSPACE_UPLOAD_INCOMPLETE',undefined,409);
  const observed=await hashPrivate(join(root(directory,id),'archive.part'),current.bytes+1);
  if(observed.bytes!==current.bytes||current.input.expectedSha256&&observed.hash!==current.input.expectedSha256||current.complete&&observed.hash!==current.sha256)
    throw fault('SEATABLE_WORKSPACE_UPLOAD_CHANGED');
  const result={...current,sha256:observed.hash,complete:true};await atomicJson(root(directory,id),'upload.json',result);return result;
}
export async function completedWorkspaceUpload(directory,id,sha256){
  const current=await workspaceUploadStatus(directory,id);if(!current?.complete||current.sha256!==sha256)throw fault('SEATABLE_WORKSPACE_UPLOAD_REVIEW_CHANGED',undefined,409);
  return{...current,path:join(root(directory,id),'archive.part')};
}
