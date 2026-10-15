#!/usr/bin/env node
'use strict';
// Materialize a complete retained ZIP from its named, hash-bound Git checkpoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'../..')),args=process.argv.slice(2);
if(args.length!==2)throw Error('Use node receiving-checkpoints/tools/restore-complete-archive.cjs <manifest.json> <new-output.zip>');
const within=p=>{const resolved=fs.realpathSync(path.resolve(root,p));if(resolved!==root&&!resolved.startsWith(root+path.sep))throw Error('Checkpoint path leaves the checkout');return resolved;};
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(within(args[0]),'utf8'));
if(manifest.schema!=='complete-archive-transfer/v1'||manifest.encoding!=='base64'||!Array.isArray(manifest.parts)||manifest.parts.length<1||manifest.parts.length>60000||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>256*1024*1024||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw Error('Select the complete bounded archive manifest');
const integrity=manifest.partIntegrity||'encoded-text';if(!['encoded-text','decoded-bytes'].includes(integrity))throw Error('Unsupported part integrity');
const dest=path.resolve(args[1]),tmp=dest+'.partial-'+crypto.randomUUID();if(fs.existsSync(dest))throw Error('Choose a new output path; existing files are retained');
const hash=crypto.createHash('sha256'),seen=new Set();let fd=null,total=0;
try{
 fd=fs.openSync(tmp,'wx',0o600);
 for(const part of manifest.parts){
  if(typeof part.path!=='string'||seen.has(part.path)||!Number.isSafeInteger(part.bytes)||part.bytes<1||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('Invalid archive part');seen.add(part.path);
  const encoded=fs.readFileSync(within(part.path)),text=encoded.toString('ascii');
  if(!Buffer.from(text,'ascii').equals(encoded)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))throw Error('Archive part is not canonical base64: '+part.path);
  const bytes=Buffer.from(text,'base64');if(bytes.toString('base64')!==text)throw Error('Archive base64 changed: '+part.path);
  const bound=integrity==='decoded-bytes'?bytes:encoded;if(bound.length!==part.bytes||digest(bound)!==part.sha256)throw Error('Archive part identity differs: '+part.path);
  total+=bytes.length;if(total>manifest.bytes)throw Error('Archive exceeds declared byte count');
  hash.update(bytes);let offset=0;while(offset<bytes.length){const written=fs.writeSync(fd,bytes,offset,bytes.length-offset);if(written<1)throw Error('Archive write made no progress');offset+=written;}
 }
 const sha256=hash.digest('hex');if(total!==manifest.bytes||sha256!==manifest.sha256)throw Error('Complete archive identity differs');
 fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.linkSync(tmp,dest);fs.unlinkSync(tmp);
 process.stdout.write(JSON.stringify({output:dest,bytes:total,sha256,sourceHead:manifest.sourceHead,members:manifest.members},null,2)+'\n');
}catch(error){if(fd!==null)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch{}throw error;}
