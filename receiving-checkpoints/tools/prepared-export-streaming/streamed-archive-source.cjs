'use strict';

/** Turn immutable independently encoded durable chunks into exact asynchronous ranges.
 * readPart receives the original part metadata (path/gitBlob/provenance is retained).
 * Every fetched part is checked as original UTF-8 text and decoded binary bytes.
 * Only two decoded parts are retained by default; returned ranges are fresh copies.
 */
const Z=require('./connected_zip.cjs'),H=require('./sha256.cjs');
const HEX=/^[a-f0-9]{64}$/;
const fail=message=>{throw new TypeError(message);};
const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
function createStreamedArchiveSource(manifest,readPart,options={}){
 const maxBytes=options.maxBytes??0xffffffff,maxPartBytes=options.maxPartBytes??16*1024*1024,cacheParts=options.cacheParts??2;
 if(!integer(maxBytes,0xffffffff)||!integer(maxPartBytes,64*1024*1024)||!maxPartBytes||!integer(cacheParts,8)||!cacheParts)
 fail('Invalid streamed archive range limits');
 if(!manifest||manifest.schema!=='commons.streamed-archive-storage.v1'||manifest.encoding!=='base64-independent-parts'||
 !integer(manifest.bytes,maxBytes)||!HEX.test(manifest.sha256)||!Array.isArray(manifest.parts)||typeof readPart!=='function')
 fail('Choose a complete independently encoded archive');
 if(manifest.receipt&&(manifest.receipt.bytes!==manifest.bytes||manifest.receipt.sha256!==manifest.sha256))
 fail('Streamed archive receipt differs');
 const archiveBytes=manifest.bytes,archiveSha256=manifest.sha256;
 const parts=[],starts=[];let total=0;
 for(const input of manifest.parts){
  const p={...input};
  if(!HEX.test(p.sha256)||p.path!=='objects/'+p.sha256+'.part'||!HEX.test(p.decodedSha256)||
  !integer(p.bytes,maxPartBytes)||!p.bytes||!integer(p.decodedBytes,maxPartBytes)||!p.decodedBytes||
  p.bytes!==Math.ceil(p.decodedBytes/3)*4)fail('Invalid independently encoded archive part');
  starts.push(total);total+=p.decodedBytes;
  if(!Number.isSafeInteger(total)||total>archiveBytes)fail('Archive part lengths exceed the declared archive');
  parts.push(Object.freeze(p));
 }
 if(total!==archiveBytes||(!parts.length&&archiveBytes))fail('Archive part lengths differ');
 const cache=new Map(),inflight=new Map();let fetchedParts=0,textBytes=0,decodedBytes=0;
 async function part(index){
  if(cache.has(index)){const data=cache.get(index);cache.delete(index);cache.set(index,data);return data;}
  if(inflight.has(index))return inflight.get(index);
  const promise=(async()=>{
   const p=parts[index],text=await readPart(p,index);
   if(typeof text!=='string'||text.length!==p.bytes)fail('Archive part text length differs: '+p.path);
   const identity=H.sha256Utf8(text);
   if(identity.bytes!==p.bytes||identity.sha256!==p.sha256)fail('Archive part original text differs: '+p.path);
   const data=Z.fromBase64(text),binary=H.sha256Bytes(data);
   if(binary.bytes!==p.decodedBytes||binary.sha256!==p.decodedSha256)fail('Archive part decoded bytes differ: '+p.path);
   fetchedParts++;textBytes+=p.bytes;decodedBytes+=p.decodedBytes;
   cache.set(index,data);while(cache.size>cacheParts)cache.delete(cache.keys().next().value);
   return data;
  })();
  inflight.set(index,promise);
  try{return await promise;}finally{inflight.delete(index);}
 }
 function find(offset){
  let low=0,high=starts.length;
  while(low+1<high){const mid=(low+high)>>>1;if(starts[mid]<=offset)low=mid;else high=mid;}
  return low;
 }
 async function read(offset,length){
  if(!integer(offset,archiveBytes)||!integer(length,archiveBytes-offset))fail('Archive range exceeds its original boundary');
  const out=new Uint8Array(length);let cursor=offset,at=0;
  while(at<length){
   const index=find(cursor),data=await part(index),inside=cursor-starts[index],take=Math.min(length-at,data.length-inside);
   if(take<=0)fail('Archive range has an uncovered byte');
   out.set(data.subarray(inside,inside+take),at);at+=take;cursor+=take;
  }
  return out;
 }
 return Object.freeze({bytes:archiveBytes,sha256:archiveSha256,read,
 stats:()=>({fetchedParts,textBytes,decodedBytes,cachedParts:cache.size,declaredParts:parts.length})});
}
module.exports={createStreamedArchiveSource};
