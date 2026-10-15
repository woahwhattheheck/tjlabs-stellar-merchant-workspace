#!/usr/bin/env node
// Fetch one pinned complete ZIP through the existing authenticated gh session.
// Part downloads resume from verified content-addressed local files.
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const execFile=promisify(execFileCallback),HEX=/^[a-f0-9]{64}$/,GIT=/^[a-f0-9]{40}$/;
const digest=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest('hex');
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const fail=message=>{throw Error(message);};
const integer=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const nofollow=constants.O_NOFOLLOW||0;

export async function writeAll(handle,bytes,position=0){
 let at=0;
 while(at<bytes.length){
  const result=await handle.write(bytes,at,bytes.length-at,position+at);
  if(!Number.isSafeInteger(result.bytesWritten)||result.bytesWritten<1||result.bytesWritten>bytes.length-at)
   fail('Archive destination did not accept the next bytes');
  at+=result.bytesWritten;
 }
 return at;
}
async function syncDirectory(path){
 const handle=await fs.open(path,constants.O_RDONLY|(constants.O_DIRECTORY||0));
 try{await handle.sync();}finally{await handle.close();}
}
async function prepareCache(path){
 const first=await fs.mkdir(path,{recursive:true});
 const stat=await fs.lstat(path);
 if(!stat.isDirectory()||stat.isSymbolicLink())fail('Choose a real archive cache directory');
 if(first){
  const stop=dirname(resolve(first));let current=resolve(path);
  for(;;){await syncDirectory(current);if(current===stop)break;const parent=dirname(current);if(parent===current)break;current=parent;}
 }
}
async function ghJson(endpoint){
 let stdout;
 try{({stdout}=await execFile('gh',['api',endpoint],{encoding:'utf8',maxBuffer:40*1024*1024}));}
 catch(error){throw Error('GitHub read failed through the existing gh session ('+String(error.code??'provider error')+')');}
 return JSON.parse(stdout);
}
function blobBytes(value,expectedSha,maxBytes){
 if(value?.encoding!=='base64'||typeof value.content!=='string'||value.sha!==expectedSha||
    !integer(value.size,maxBytes))fail('GitHub did not return the exact bounded immutable blob');
 const encoded=value.content.replace(/\r?\n/g,''),bytes=Buffer.from(encoded,'base64');
 if(bytes.length!==value.size||bytes.toString('base64')!==encoded||
    digest(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]),'sha1')!==expectedSha)
  fail('Immutable Git blob bytes differ');
 return bytes;
}
export function validateManifest(manifest){
 if(!manifest||manifest.schema!=='commons.streamed-archive-storage.v1'||
    manifest.encoding!=='base64-independent-parts'||!integer(manifest.bytes,0xffffffff)||
    !HEX.test(manifest.sha256)||!Array.isArray(manifest.parts)||manifest.parts.length>100000||
    manifest.receipt?.schema!=='commons.streamed-complete-export.v1'||
    manifest.receipt?.bytes!==manifest.bytes||manifest.receipt?.sha256!==manifest.sha256||
    manifest.receipt?.requiresOrdinaryReadback===true||!integer(manifest.receipt?.members,65535)||!manifest.receipt.members)
  fail('Choose a complete streamed archive manifest and receipt');
 let bytes=0;
 for(const p of manifest.parts){
  if(!p||!HEX.test(p.sha256)||!HEX.test(p.decodedSha256)||!GIT.test(p.gitBlob)||
     p.path!=='objects/'+p.sha256+'.part'||!integer(p.decodedBytes,16*1024*1024)||!p.decodedBytes||
     p.bytes!==Math.ceil(p.decodedBytes/3)*4)fail('Invalid immutable archive part');
  bytes+=p.decodedBytes;
  if(!Number.isSafeInteger(bytes)||bytes>manifest.bytes)fail('Archive parts exceed the declared size');
 }
 if(bytes!==manifest.bytes)fail('Archive parts omit original bytes');
 return manifest;
}
function verifyPart(bytes,part){
 if(bytes.length!==part.decodedBytes||digest(bytes)!==part.decodedSha256)
  fail('Cached archive part differs from its original bytes');
 const text=Buffer.from(bytes.toString('base64'),'utf8');
 if(text.length!==part.bytes||digest(text)!==part.sha256||
    digest(Buffer.concat([Buffer.from('blob '+text.length+'\0'),text]),'sha1')!==part.gitBlob)
  fail('Archive part encoding or immutable Git identity differs');
 return bytes;
}
async function readCached(path,part){
 let handle;
 try{handle=await fs.open(path,constants.O_RDONLY|nofollow);}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
 try{
  const stat=await handle.stat();if(!stat.isFile())fail('Archive cache entry is not a regular file');
  if(stat.size!==part.decodedBytes)return null;
  const bytes=Buffer.alloc(part.decodedBytes);let at=0;
  while(at<bytes.length){const r=await handle.read(bytes,at,bytes.length-at,at);if(!r.bytesRead)return null;at+=r.bytesRead;}
  try{return verifyPart(bytes,part);}catch{return null;}
 }finally{await handle.close();}
}
async function retainPart(path,bytes){
 const temporary=path+'.pending-'+randomUUID();let handle;
 try{
  handle=await fs.open(temporary,'wx',0o600);await writeAll(handle,bytes);await handle.sync();await handle.close();handle=null;
  // All cache writers use a new file and atomic rename, never modify a saved part.
  try{const old=await fs.lstat(path);if(!old.isFile()||old.isSymbolicLink())fail('Archive cache path is not a regular part');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.rename(temporary,path);await syncDirectory(dirname(path));
 }finally{if(handle)await handle.close();await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function existingOutput(path,manifest){
 let handle;try{handle=await fs.open(path,constants.O_RDONLY|nofollow);}catch(error){if(error.code==='ENOENT')return false;throw error;}
 try{
  const stat=await handle.stat();if(!stat.isFile()||stat.size!==manifest.bytes)fail('Existing output differs; choose a new output path');
  const hash=createHash('sha256'),buffer=Buffer.alloc(262144);let at=0;
  while(at<manifest.bytes){const r=await handle.read(buffer,0,Math.min(buffer.length,manifest.bytes-at),at);if(!r.bytesRead)fail('Existing output ended early');hash.update(buffer.subarray(0,r.bytesRead));at+=r.bytesRead;}
  if(hash.digest('hex')!==manifest.sha256)fail('Existing output differs; choose a new output path');
  await handle.sync();await syncDirectory(dirname(path));return true;
 }finally{await handle.close();}
}
export async function fetchAndAssemble(options,{readGithub=ghJson,progress=()=>{}}={}){
 const {repository,commit,manifest:manifestPath,manifestSha256}=options;
 if(typeof repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||
    !GIT.test(commit)||!HEX.test(manifestSha256)||typeof manifestPath!=='string'||
    manifestPath.startsWith('/')||manifestPath.includes('\\')||
    manifestPath.split('/').some(x=>!x||x==='.'||x==='..')||typeof options.output!=='string'||!options.output)
  fail('Bind repository, immutable commit, safe manifest path, manifest SHA-256 and output');
 const output=resolve(options.output),cache=resolve(options.cache||output+'.parts');
 if(output===cache)fail('Archive output and part cache must be different paths');
 const encodedPath=manifestPath.split('/').map(encodeURIComponent).join('/');
 let value=await readGithub('repos/'+repository+'/contents/'+encodedPath+'?ref='+commit);
 if(!GIT.test(value?.sha)||value.type!=='file')fail('Pinned manifest path is not an original file');
 const manifestBlob=value.sha;
 if(value.encoding!=='base64'||!value.content)value=await readGithub('repos/'+repository+'/git/blobs/'+manifestBlob);
 const original=blobBytes(value,manifestBlob,16*1024*1024);
 if(digest(original)!==manifestSha256)fail('Pinned manifest SHA-256 differs');
 const manifest=validateManifest(JSON.parse(decode(original)));
 const identity={repository,commit,manifest:manifestPath,manifestSha256,manifestBlob,output,bytes:manifest.bytes,sha256:manifest.sha256,members:manifest.receipt.members};
 if(await existingOutput(output,manifest))return {...identity,reusedCompleteOutput:true,downloadedParts:0,reusedParts:0};
 const parent=await fs.lstat(dirname(output));if(!parent.isDirectory())fail('Choose an existing output directory');
 await prepareCache(cache);
 const temporary=output+'.pending-'+randomUUID(),hash=createHash('sha256');let handle,at=0,downloadedParts=0,reusedParts=0;
 try{
  handle=await fs.open(temporary,'wx',0o600);
  for(let index=0;index<manifest.parts.length;index++){
   const part=manifest.parts[index],path=join(cache,part.decodedSha256+'.bin');let bytes=await readCached(path,part);
   if(bytes)reusedParts++;
   else{
    const body=blobBytes(await readGithub('repos/'+repository+'/git/blobs/'+part.gitBlob),part.gitBlob,Math.ceil(16*1024*1024/3)*4);
    const text=decode(body);
    if(body.length!==part.bytes||digest(body)!==part.sha256)fail('Original encoded archive part differs');
    bytes=Buffer.from(text,'base64');
    if(bytes.toString('base64')!==text)fail('Archive part is not canonical base64');
    verifyPart(bytes,part);await retainPart(path,bytes);downloadedParts++;
   }
   await writeAll(handle,bytes,at);hash.update(bytes);at+=bytes.length;
   await progress({parts:index+1,totalParts:manifest.parts.length,bytes:at,downloadedParts,reusedParts});
  }
  if(at!==manifest.bytes||hash.digest('hex')!==manifest.sha256)fail('Complete ordinary ZIP differs from its pinned identity');
  await handle.sync();await handle.close();handle=null;
  // Hard-link publication is atomic and cannot replace an existing output.
  try{await fs.link(temporary,output);}catch(error){if(error.code!=='EEXIST'||!await existingOutput(output,manifest))throw error;}
  await syncDirectory(dirname(output));await fs.unlink(temporary);await syncDirectory(dirname(output));
  return {...identity,reusedCompleteOutput:false,downloadedParts,reusedParts};
 }finally{if(handle)await handle.close();await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
function argumentsOf(argv){
 const values={},names={'--repository':'repository','--commit':'commit','--manifest':'manifest','--manifest-sha256':'manifestSha256','--output':'output','--cache':'cache'};
 for(let at=0;at<argv.length;at+=2){const key=names[argv[at]],value=argv[at+1];if(!key||!value||Object.hasOwn(values,key))fail('Use --repository --commit --manifest --manifest-sha256 --output and optional --cache');values[key]=value;}
 return values;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 fetchAndAssemble(argumentsOf(process.argv.slice(2)),{progress:p=>{if(p.parts%8===0||p.parts===p.totalParts)process.stderr.write(JSON.stringify(p)+'\n');}})
 .then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
 .catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}
