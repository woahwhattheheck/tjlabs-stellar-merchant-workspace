// MIT. Streaming local files for the original FRED Operating Source archive.
import { constants } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const FRED_OPERATING_ARCHIVE_MAX_BYTES = 4 * 1024 ** 3 + 128 * 1024 ** 2;
const fail = (code,message) => { const error=new Error(message); error.code=code; throw error; };
const same = (a,b) => ['size','mtimeMs','ctimeMs','ino','dev'].every(key=>a[key]===b[key]);
function digest(value) {
  if(value!==undefined&&!/^[a-f0-9]{64}$/.test(value))
    fail('FRED_HANDOVER_INPUT_INVALID','Use the original complete archive SHA256.');
}
export async function openFredOperatingArchiveFile(path,{expectedSha256,signal}={}) {
  digest(expectedSha256); signal?.throwIfAborted();
  const archivePath=resolve(path),handle=await open(archivePath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.size<1||before.size>FRED_OPERATING_ARCHIVE_MAX_BYTES)
      fail('FRED_HANDOVER_FILE_INVALID','Select one complete regular Operating Source archive within its native capacity.');
    const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);
    let offset=0;
    while(offset<before.size){
      signal?.throwIfAborted();
      const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-offset),offset);
      if(bytesRead<1)fail('FRED_HANDOVER_FILE_CHANGED','The original archive ended before its retained length.');
      hash.update(buffer.subarray(0,bytesRead)); offset+=bytesRead;
    }
    const sha256=hash.digest('hex');
    if(!same(before,await handle.stat())||expectedSha256!==undefined&&sha256!==expectedSha256)
      fail('FRED_HANDOVER_FILE_CHANGED','The complete original archive changed or differs from its selected SHA256.');
    let consumed=false;
    return {archivePath,bytes:before.size,sha256,
      async *body() {
        if(consumed)fail('FRED_HANDOVER_FILE_CHANGED','Reuse the same upload operation by reopening its original file.');
        consumed=true; const second=createHash('sha256'); let cursor=0;
        while(cursor<before.size){
          signal?.throwIfAborted();
          const chunk=Buffer.allocUnsafe(Math.min(256*1024,before.size-cursor));
          const {bytesRead}=await handle.read(chunk,0,chunk.length,cursor);
          if(bytesRead<1)fail('FRED_HANDOVER_FILE_CHANGED','The original archive ended during upload.');
          const bytes=chunk.subarray(0,bytesRead); second.update(bytes);cursor+=bytesRead;yield bytes;
        }
        if(!same(before,await handle.stat())||second.digest('hex')!==sha256)
          fail('FRED_HANDOVER_FILE_CHANGED','The original archive changed during upload.');
      },
      close:()=>handle.close()};
  }catch(error){await handle.close();throw error;}
}
export async function inspectFredOperatingArchiveFile(path,options={}) {
  const opened=await openFredOperatingArchiveFile(path,options);
  try{return {archivePath:opened.archivePath,bytes:opened.bytes,sha256:opened.sha256};}
  finally{await opened.close();}
}
/** Streams exact bytes to a create-only file; an identical complete retry is retained. */
export async function saveFredOperatingArchiveResponse(response,destination,archive,{signal}={}) {
  digest(archive?.sha256);
  if(!Number.isSafeInteger(archive?.bytes)||archive.bytes<1||archive.bytes>FRED_OPERATING_ARCHIVE_MAX_BYTES)
    fail('FRED_HANDOVER_FILE_INVALID','The original archive length is invalid.');
  if(response.headers.get('x-fred-file-sha256')!==archive.sha256||
      response.headers.get('content-length')!==String(archive.bytes)){
    await response.body?.cancel();
    fail('FRED_HANDOVER_FILE_CHANGED','The archive response differs from its retained original descriptor.');
  }
  const output=resolve(destination),temporary=output+'.'+randomUUID()+'.part';
  let handle,bytes=0,reused=false;const hash=createHash('sha256');
  try{
    handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
    for await(const chunk of response.body){
      signal?.throwIfAborted();const part=Buffer.from(chunk);bytes+=part.length;
      if(bytes>archive.bytes)fail('FRED_HANDOVER_FILE_CHANGED','The archive exceeded its original retained length.');
      hash.update(part);let offset=0;
      while(offset<part.length){
        const written=await handle.write(part,offset,part.length-offset);
        if(written.bytesWritten<1)fail('FRED_HANDOVER_WRITE_FAILED','The receiving file stopped accepting original bytes.');
        offset+=written.bytesWritten;
      }
    }
    if(bytes!==archive.bytes||hash.digest('hex')!==archive.sha256)
      fail('FRED_HANDOVER_FILE_CHANGED','The complete archive does not match its original length and SHA256.');
    await handle.sync();await handle.close();handle=null;
    try{await link(temporary,output);}catch(error){
      if(error.code!=='EEXIST')throw error;
      const existing=await inspectFredOperatingArchiveFile(output,{expectedSha256:archive.sha256,signal});
      if(existing.bytes!==archive.bytes)fail('FRED_HANDOVER_OUTPUT_EXISTS','The receiving path already holds a different archive.');
      reused=true;
    }
    const parent=await open(dirname(output),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{await parent.sync();}finally{await parent.close();}
    return {destination:output,bytes,sha256:archive.sha256,reused};
  }finally{
    await response.body?.cancel().catch(()=>{});
    await handle?.close();
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }
}
