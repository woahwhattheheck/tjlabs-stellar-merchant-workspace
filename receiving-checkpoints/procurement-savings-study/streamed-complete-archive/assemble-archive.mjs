// Reassemble the complete verified ZIP from independently encoded durable parts.
import {readFile,open,link,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url)),manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
if(manifest.schema!=='commons.streamed-archive-storage.v1'||manifest.encoding!=='base64-independent-parts'||!Array.isArray(manifest.parts)||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw Error('Select the complete archive manifest');
const output=resolve(process.argv[2]||join(root,'Complete_Source_Handover.zip')),temporary=output+'.pending-'+process.pid,handle=await open(temporary,'wx'),hash=createHash('sha256');let bytes=0,complete=false;
try{
 for(const part of manifest.parts){
  if(part.path!=='objects/'+part.sha256+'.part'||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('Unsafe archive part');
  const text=await readFile(join(root,part.path),'utf8'),encoded=Buffer.from(text,'utf8');
  if(encoded.length!==part.bytes||createHash('sha256').update(encoded).digest('hex')!==part.sha256)throw Error('Archive part changed '+part.path);
  const data=Buffer.from(text,'base64');if(data.toString('base64')!==text||data.length!==part.decodedBytes||createHash('sha256').update(data).digest('hex')!==part.decodedSha256)throw Error('Archive decoded part changed');
  for(let at=0;at<data.length;){const result=await handle.write(data,at,data.length-at);if(!result.bytesWritten)throw Error('Archive write made no progress');at+=result.bytesWritten;}
  hash.update(data);bytes+=data.length;
 }
 const sha256=hash.digest('hex');if(bytes!==manifest.bytes||sha256!==manifest.sha256)throw Error('Complete archive differs');
 await handle.sync();await handle.close();await link(temporary,output);await unlink(temporary);complete=true;process.stdout.write(JSON.stringify({output,bytes,sha256,members:manifest.receipt.members})+'\n');
}finally{if(!complete){await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});}}
