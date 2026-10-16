#!/usr/bin/env node
// Node 18+. The checkpoint directory contains checkpoint.json and objects/*.part.
import {readFile,open,link,unlink,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import Stream from './prepared-stream.cjs';
import Ordinary from './ordinary-zip-range.cjs';
const args=process.argv.slice(2),flags={};
for(let i=0;i<args.length;i+=2){if(!['--checkpoint','--manifest-sha256','--output','--verification','--max-metadata-bytes','--max-manifest-bytes','--max-part-bytes'].includes(args[i])||!args[i+1]||flags[args[i]])throw Error('Usage: node finish-prepared.mjs --checkpoint PATH --manifest-sha256 SHA256 --output PATH.zip [--verification ordinary] [--max-metadata-bytes BYTES] [--max-manifest-bytes BYTES] [--max-part-bytes BYTES]');flags[args[i]]=args[i+1];}
if(!flags['--checkpoint']||!flags['--output']||!/^[a-f0-9]{64}$/.test(flags['--manifest-sha256'])||(flags['--verification']!==undefined&&flags['--verification']!=='ordinary'))throw Error('Pin the exact checkpoint file SHA-256 and select an output');
const streamOptions={};
for(const [flag,key]of [['--max-metadata-bytes','maxMetadataBytes'],['--max-manifest-bytes','maxManifestBytes'],['--max-part-bytes','maxPartBytes']]){
 const text=flags[flag];if(text===undefined)continue;
 if(!/^[1-9]\d*$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)>0x7fffffff)throw Error('Choose a positive bounded integer for '+flag);
 streamOptions[key]=Number(text);
}
const input=resolve(flags['--checkpoint']),output=resolve(flags['--output']),raw=await readFile(input);
if(createHash('sha256').update(raw).digest('hex')!==flags['--manifest-sha256'])throw Error('Checkpoint file differs from its pinned digest');
const index=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),base=dirname(input);
const read=async path=>{if(!/^objects\/[a-f0-9]{64}\.part$/.test(path))throw Error('Unsafe checkpoint object path');return new TextDecoder('utf-8',{fatal:true}).decode(await readFile(resolve(base,path)));};
await mkdir(dirname(output),{recursive:true});const temporary=output+'.partial-'+randomUUID();let handle;
async function hashFile(path){const hash=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path)){bytes+=chunk.length;hash.update(chunk);}return{bytes,sha256:hash.digest('hex')};}
async function publish(path,final,expected){try{await link(path,final);}catch(error){if(error.code!=='EEXIST')throw error;const old=await hashFile(final);if(old.bytes!==expected.bytes||old.sha256!==expected.sha256)throw Error('Existing output differs: '+final);}finally{await unlink(path).catch(()=>{});}}
try{
 handle=await open(temporary,'wx');
 const emit=flags['--verification']==='ordinary'?Stream.streamPreparedPayloads:Stream.streamPreparedExport;
 let receipt=await emit(index,read,async chunk=>{let at=0;while(at<chunk.length){const r=await handle.write(chunk,at,chunk.length-at);if(!r.bytesWritten)throw Error('Output write made no progress');at+=r.bytesWritten;}},streamOptions);
 await handle.sync();await handle.close();handle=null;
 if(flags['--verification']==='ordinary'){
  const inputHandle=await open(temporary,'r');let observed;
  try{
   const stat=await inputHandle.stat();
   if(stat.size!==receipt.bytes)throw Error('Written ZIP length differs from streamed bytes');
   observed=await Ordinary.readCompleteExportRanges({bytes:stat.size,read:async(offset,length)=>{
    const bytes=new Uint8Array(length);let at=0;
    while(at<length){const r=await inputHandle.read(bytes,at,length-at,offset+at);if(!r.bytesRead)throw Error('Archive read ended before its exact boundary');at+=r.bytesRead;}
    return bytes;
   }},{expectedSha256:receipt.sha256,maxBytes:receipt.bytes,maxUncompressedBytes:receipt.uncompressedBytes,maxEntries:receipt.members});
  }finally{await inputHandle.close();}
  if(observed.members.length!==receipt.members||observed.uncompressedBytes!==receipt.uncompressedBytes)throw Error('Ordinary complete members differ from prepared index');
  const {members,...ordinary}=observed;
  receipt={...receipt,emissionMemberVerification:receipt.memberVerification,memberVerification:'ordinary-zip-crc32-sha256-and-export-manifest',requiresOrdinaryReadback:false,
   ordinaryReadback:{...ordinary,members:members.length}};
 }else{const written=await hashFile(temporary);if(written.bytes!==receipt.bytes||written.sha256!==receipt.sha256)throw Error('Written ZIP differs from streamed bytes');}
 await publish(temporary,output,receipt);
 const receiptText=JSON.stringify({...receipt,checkpointFileSha256:flags['--manifest-sha256'],streamLimits:{maxMetadataBytes:streamOptions.maxMetadataBytes??16777216,maxManifestBytes:streamOptions.maxManifestBytes??16777216,maxPartBytes:streamOptions.maxPartBytes??4194304}},null,2)+'\n',receiptPath=output+'.receipt.json',receiptTemp=receiptPath+'.partial-'+randomUUID();
 const r=await open(receiptTemp,'wx');try{await r.writeFile(receiptText,'utf8');await r.sync();}finally{await r.close();}
 await publish(receiptTemp,receiptPath,{bytes:Buffer.byteLength(receiptText),sha256:createHash('sha256').update(receiptText).digest('hex')});
 process.stdout.write(JSON.stringify({output,receipt:receiptPath,...receipt},null,2)+'\n');
}catch(error){if(handle)await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error;}
