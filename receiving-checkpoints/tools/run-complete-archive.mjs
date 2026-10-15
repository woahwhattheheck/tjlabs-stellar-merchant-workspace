#!/usr/bin/env node
// Replay the actual installed exporter and complete readback from a retained compact workload.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const args=process.argv.slice(2);
if(args.length!==3)throw Error('Use node receiving-checkpoints/tools/run-complete-archive.mjs <products/product-root> <checkpoint-manifest.json> <new-output.zip>');
const within=async p=>{const real=await fs.realpath(path.resolve(root,p));if(real!==root&&!real.startsWith(root+path.sep))throw Error('Source path leaves the checkout');return real;};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const product=await within(args[0]),manifestPath=await within(args[1]),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(!['installed-complete-course-checkpoint/v1','complete-water-receiving-workload/v1'].includes(manifest.schema)||!Array.isArray(manifest.parts)||manifest.parts.length<1||manifest.parts.length>1000)throw Error('Choose a maintained complete workload checkpoint');
const compactBytes=manifest.compactBytes??manifest.bytes,compactSHA=manifest.compactSha256??manifest.sha256;
if(!Number.isSafeInteger(compactBytes)||compactBytes<1||compactBytes>128*1024*1024||!/^[a-f0-9]{64}$/.test(compactSHA))throw Error('Compact checkpoint identity is invalid');
const chunks=[],seen=new Set();let total=0;
for(const row of manifest.parts){
 if(typeof row.path!=='string'||seen.has(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<1||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Checkpoint part identity is invalid');
 seen.add(row.path);const bytes=await fs.readFile(await within(row.path));
 if(bytes.length!==row.bytes||sha(bytes)!==row.sha256)throw Error('Checkpoint part differs: '+row.path);
 total+=bytes.length;if(total>compactBytes)throw Error('Checkpoint exceeds its bound');chunks.push(bytes);
}
const compact=Buffer.concat(chunks);if(compact.length!==compactBytes||sha(compact)!==compactSHA)throw Error('Whole compact checkpoint differs');
const text=compact.toString('utf8');if(!Buffer.from(text,'utf8').equals(compact))throw Error('Checkpoint is not exact UTF-8');
const bank=JSON.parse(text);
if(bank.schema!=='complete-json-checkpoint/v1'||bank.bytes!==(manifest.expandedBytes??manifest.bytes)||bank.sha256!==(manifest.expandedSha256??manifest.sha256))throw Error('Expanded workload identity differs');
const reader=require(path.join(product,'receiving/checkpoint-reader.cjs'))(bank),records=reader.sequence(reader.field(reader.root,'records')),editions=reader.sequence(reader.field(reader.root,'editions'));
if(records.length!==manifest.requests||editions.length!==manifest.editions)throw Error('Complete request/edition population differs');
const runtime=await import(pathToFileURL(path.join(product,'runtime.mjs'))),exportModule=await import(pathToFileURL(path.join(product,'host/export.mjs'))),builderModule=await import(pathToFileURL(path.join(product,'src/build-installed.mjs'))),zip=(await import(pathToFileURL(path.join(product,'src/connected_zip.cjs')))).default;
const builders=Object.values(builderModule).filter(v=>typeof v==='function');if(builders.length!==1)throw Error('Choose the exact installed source builder');
const files=await exportModule.moduleSources(),run=require(path.join(product,'receiving/complete-archive-readback.cjs'));
const B={core:runtime.core,M:runtime.originalSessions,C:runtime.codec,sessions:runtime.sessions,build:builders[0],zip,strip:s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')};
process.stderr.write(JSON.stringify({phase:'complete-workload-open',product,checkpoint:manifestPath,compactBytes,requests:records.length,editions:editions.length,sourceFiles:Object.keys(files).length})+'\n');
const {bytes,result}=await run(B,files,bank,event=>process.stderr.write(JSON.stringify(event)+'\n'));
const output=path.resolve(args[2]);
async function publish(dest,data){
 const tmp=dest+'.partial-'+randomUUID();let handle;
 try{handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(data);await handle.sync();await handle.close();handle=null;await fs.link(tmp,dest);await fs.unlink(tmp);const directory=await fs.open(path.dirname(dest),'r');try{await directory.sync();}finally{await directory.close();}}
 catch(error){if(handle)await handle.close();await fs.unlink(tmp).catch(()=>{});throw error;}
}
await publish(output,bytes);await publish(output+'.json',JSON.stringify({...result,checkpoint:{path:args[1],compactBytes,compactSha256:compactSHA},sourceRoot:args[0],output},null,2)+'\n');
process.stdout.write(JSON.stringify({output,report:output+'.json',bytes:result.bytes,sha256:result.sha256,members:result.members,requests:result.requests,editions:result.editions},null,2)+'\n');
