#!/usr/bin/env node
// Node 18+. The checkpoint directory contains checkpoint.json and objects/*.part.
import {readFile,open,link,unlink,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import Stream from '../receiving/prepared-stream.cjs';
const args=process.argv.slice(2),flags={};
for(let i=0;i<args.length;i+=2){if(!['--checkpoint','--manifest-sha256','--output'].includes(args[i])||!args[i+1]||flags[args[i]])throw Error('Usage: node finish-prepared.mjs --checkpoint PATH --manifest-sha256 SHA256 --output PATH.zip');flags[args[i]]=args[i+1];}
if(Object.keys(flags).length!==3||!/^[a-f0-9]{64}$/.test(flags['--manifest-sha256']))throw Error('Pin the exact checkpoint file SHA-256 and select an output');
const input=resolve(flags['--checkpoint']),output=resolve(flags['--output']),raw=await readFile(input);
if(createHash('sha256').update(raw).digest('hex')!==flags['--manifest-sha256'])throw Error('Checkpoint file differs from its pinned digest');
const index=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),base=dirname(input);
const read=async path=>{if(!/^objects\/[a-f0-9]{64}\.part$/.test(path))throw Error('Unsafe checkpoint object path');return new TextDecoder('utf-8',{fatal:true}).decode(await readFile(resolve(base,path)));};
await mkdir(dirname(output),{recursive:true});const temporary=output+'.partial-'+randomUUID();let handle;
async function hashFile(path){const hash=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path)){bytes+=chunk.length;hash.update(chunk);}return{bytes,sha256:hash.digest('hex')};}
async function publish(path,final,expected){try{await link(path,final);}catch(error){if(error.code!=='EEXIST')throw error;const old=await hashFile(final);if(old.bytes!==expected.bytes||old.sha256!==expected.sha256)throw Error('Existing output differs: '+final);}finally{await unlink(path).catch(()=>{});}}
try{
 handle=await open(temporary,'wx');
 const receipt=await Stream.streamPreparedExport(index,read,async chunk=>{let at=0;while(at<chunk.length){const r=await handle.write(chunk,at,chunk.length-at);if(!r.bytesWritten)throw Error('Output write made no progress');at+=r.bytesWritten;}});
 await handle.sync();await handle.close();handle=null;
 const written=await hashFile(temporary);if(written.bytes!==receipt.bytes||written.sha256!==receipt.sha256)throw Error('Written ZIP differs from streamed bytes');
 await publish(temporary,output,receipt);
 const receiptText=JSON.stringify({...receipt,checkpointFileSha256:flags['--manifest-sha256']},null,2)+'\n',receiptPath=output+'.receipt.json',receiptTemp=receiptPath+'.partial-'+randomUUID();
 const r=await open(receiptTemp,'wx');try{await r.writeFile(receiptText,'utf8');await r.sync();}finally{await r.close();}
 await publish(receiptTemp,receiptPath,{bytes:Buffer.byteLength(receiptText),sha256:createHash('sha256').update(receiptText).digest('hex')});
 process.stdout.write(JSON.stringify({output,receipt:receiptPath,...receipt},null,2)+'\n');
}catch(error){if(handle)await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error;}
