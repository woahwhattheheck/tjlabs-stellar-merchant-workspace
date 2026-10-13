// MIT. File and lifetime helpers for one original Zarr receiving operation.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants, fstatSync } from 'node:fs';
import { readFile, mkdir, open, rename, lstat, realpath, link, unlink } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep, join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
export { assert, randomUUID, readFile, mkdir, lstat, join, dirname, resolve };
export const SCF='stellar/scf-starforge-20261009',SDK=SCF+'/sf30-seller-sdk',RELEASE=SCF+'/sf82-seller-pilot',MCP='stellar-forge/mcp-merchant-operator';
export const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const stamp=()=>new Date().toISOString();
export const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const errorView=error=>({code:error?.code??null,message:error?.message??String(error),stack:error?.stack?.slice(0,12000)??null});
export function absolute(value,label='path'){
 assert(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&!/[\0\r\n]/.test(value),label+' must be a canonical absolute path');return value;
}
export function contains(parent,child){const tail=relative(parent,child);return !tail||!isAbsolute(tail)&&tail!=='..'&&!tail.startsWith('..'+sep);}
export async function privateDirectory(directory,create=false){
 if(create)await mkdir(directory,{recursive:true,mode:0o700});
 const s=await lstat(directory);assert(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&await realpath(directory)===directory,'Original private directory: '+directory);
}
export async function optional(file){
 try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function fileIdentity(file){
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const before=await handle.stat({bigint:true});assert(before.isFile(),'Regular original file required');
 const digest=createHash('sha256');let bytes=0;for await(const chunk of handle.createReadStream({autoClose:false})){bytes+=chunk.length;digest.update(chunk);}
 const after=await handle.stat({bigint:true});assert.equal(after.size,before.size);assert.equal(after.mtimeNs,before.mtimeNs);assert.equal(after.ctimeNs,before.ctimeNs);assert.equal(BigInt(bytes),before.size);
 return {bytes,sha256:digest.digest('hex')};}finally{await handle.close();}
}
export async function saveBytes(file,content,{createOnly=false}={}){
 await mkdir(dirname(file),{recursive:true,mode:0o700});const old=await fileIdentity(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(old&&createOnly){assert.equal(old.bytes,content.length);assert.equal(old.sha256,hash(content),'Preserve differing retained file: '+file);return old;}
 const temporary=file+'.'+randomUUID()+'.partial',handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}
 if(createOnly){try{await link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;const saved=await fileIdentity(file);assert.equal(saved.bytes,content.length);assert.equal(saved.sha256,hash(content));}await unlink(temporary);}
 else await rename(temporary,file);
 const parent=await open(dirname(file),'r');try{await parent.sync();}finally{await parent.close();}
 return {bytes:content.length,sha256:hash(content)};
}
export const save=(file,value,options)=>saveBytes(file,jsonBytes(value),options);
export async function availablePort(){const s=createServer();await new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',ok);});const port=s.address().port;await new Promise((ok,no)=>s.close(e=>e?no(e):ok()));return port;}
export async function waitFor(action,label,timeout=120000){const end=Date.now()+timeout;for(;;){const v=await action();if(v)return v;if(Date.now()>end)throw new Error('Timed out waiting for '+label);await new Promise(ok=>setTimeout(ok,150));}}
export function verifyLease(operationDirectory){
 const fd=Number(process.env.ZARR_RECEIVING_LEASE_FD);assert(Number.isInteger(fd)&&fd>=3,'Use the complete receiving entry and original operation lease');const held=fstatSync(fd);
 return lstat(join(operationDirectory,'operation.lock')).then(named=>{assert(held.isFile()&&named.isFile()&&!named.isSymbolicLink()&&held.dev===named.dev&&held.ino===named.ino&&held.nlink===1&&!(held.mode&0o077),'Original receiving lease changed');return fd;});
}
export async function verifySources(input){
 const root=absolute(input.sourceRoot),manifestFile=absolute(input.sourceManifest.file);
 const raw=await readFile(manifestFile);assert.equal(hash(raw),input.sourceManifest.sha256,'Retained source manifest');
 const manifest=JSON.parse(raw),seen=new Set();assert(Array.isArray(manifest.files)&&manifest.files.length>0);
 for(const entry of manifest.files){assert(typeof entry.path==='string'&&!entry.path.startsWith('/')&&HASH.test(entry.sha256));const file=resolve(root,entry.path);assert(contains(root,file)&&file!==root);assert.equal(relative(root,file).split(sep).join('/'),entry.path);assert(!seen.has(entry.path));seen.add(entry.path);const actual=await fileIdentity(file);assert.equal(actual.sha256,entry.sha256,'Selected source changed: '+entry.path);if(entry.bytes!==undefined)assert.equal(actual.bytes,entry.bytes);}
 for(const path of [SDK+'/zarr/python/workspace.py',SDK+'/zarr/python/packet.py',SDK+'/zarr/workspace/server.mjs',SDK+'/zarr/publisher/model.mjs',SDK+'/zarr/deployment.mjs',SDK+'/zarr/receiving.mjs'])assert(seen.has(path),'Complete selected product source: '+path);
 return {manifest,files:seen};
}
export async function runJson(executable,args,{input,env=process.env,maximum=32*1024*1024}={}){
 const inherited=process.env.ZARR_RECEIVING_LEASE_FD,stdio=['pipe','pipe','pipe'];
 if(inherited!==undefined){const fd=Number(inherited);assert(Number.isInteger(fd)&&fd>=3&&fstatSync(fd).isFile(),'Original receiving descriptor');stdio.push(fd);env={...env,ZARR_RECEIVING_LEASE_FD:'3'};}
 const child=spawn(executable,args,{env,stdio});const output=[],errors=[];let size=0,errSize=0;
 child.stdout.on('data',b=>{size+=b.length;if(size>maximum)child.kill('SIGTERM');else output.push(b);});
 child.stderr.on('data',b=>{errSize+=b.length;if(errSize<1024*1024)errors.push(b);});
 child.stdin.end(input===undefined?undefined:jsonBytes(input));
 const ended=await new Promise((ok,no)=>{child.once('error',no);child.once('close',(code,signal)=>ok({code,signal}));});
 const out=Buffer.concat(output).toString('utf8'),err=Buffer.concat(errors).toString('utf8');
 if(ended.code!==0){let problem;try{problem=JSON.parse(err);}catch{problem={message:err||out};}throw Object.assign(new Error(problem.message||problem.error||'Original command failed'),{code:problem.code??problem.error??'ZARR_NATIVE_COMMAND_FAILED',native:problem,process:ended});}
 assert(size<=maximum,'Original command response exceeds its declared boundary');return JSON.parse(out);
}
export async function native(input,args,payload){
 return runJson(input.python,['-B',join(input.sourceRoot,SDK,'zarr/python/cli.py'),...args],{input:payload});
}
export async function paged(read,expectedRows,query={},limit=7){
 const rows=[];let cursor,snapshot,pages=0;const seen=new Set();
 do{const params=new URLSearchParams({...query,limit:String(limit),...(cursor?{cursor}:{})});if(cursor)params.delete('snapshot');
 const reply=await read(params.toString());assert(Array.isArray(reply.rows));snapshot??=reply.dataset.snapshot;assert.equal(reply.dataset.snapshot,snapshot);rows.push(...reply.rows);pages++;assert(rows.length<=expectedRows&&pages<=expectedRows+1);cursor=reply.page.nextCursor;if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);
 assert.equal(rows.length,expectedRows);return {rows,pages,snapshot};
}
export function exactRows(actual,expected,label){assert.deepEqual(actual,expected,label);return {rows:actual.length,valuesSha256:hash(jsonBytes(actual))};}
export async function openStage(input,inputSha256,name){
 const directory=join(input.operationDirectory,name);await privateDirectory(directory,true);
 const intentFile=join(directory,'intent.json');let intent=await optional(intentFile);
 const basis={schema:'stellar-forge.zarr-receiving-stage.v1',operationId:input.operationId,inputSha256,sourceManifestSha256:input.sourceManifest.sha256,workspaceDirectory:input.workspaceDirectory,stage:name};
 if(intent)assert.deepEqual(intent.basis,basis,'Original receiving stage input');else{intent={basis,createdAt:stamp(),requests:{},steps:{}};await save(intentFile,intent);}
 const completed=await optional(join(directory,'result.json'));if(completed?.state==='COMPLETE'){assert.deepEqual(completed.basis,basis);for(const f of completed.files??[])assert.deepEqual(await fileIdentity(join(directory,f.path)),{bytes:f.bytes,sha256:f.sha256});}
 const requestId=async key=>{if(!intent.requests[key]){intent.requests[key]=randomUUID();await save(intentFile,intent);}return intent.requests[key];};
 const checkpoint=async(key,value)=>{intent.steps[key]=value;await save(intentFile,intent);console.log(JSON.stringify({phase:'ZARR_RECEIVING',operationId:input.operationId,stage:name,step:key}));};
 return {directory,intent,intentFile,basis,completed:completed?.state==='COMPLETE'?completed:null,requestId,checkpoint,saveIntent:()=>save(intentFile,intent)};
}

/** Retain one actual browser capture; a resumed stage never overwrites its pixels. */
export async function captureOnce(stage,page,name){
 assert(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(name));
 stage.intent.captures??={};let selected=stage.intent.captures[name];
 const file=join(stage.directory,name);
 if(selected?.file){assert.deepEqual(await fileIdentity(file),selected.file);return selected.file;}
 if(!selected){selected={requestedAt:stamp()};stage.intent.captures[name]=selected;await save(stage.intentFile,stage.intent);}
 let actual=await fileIdentity(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!actual){const pixels=await page.screenshot({fullPage:true,type:'png'});actual=await saveBytes(file,pixels,{createOnly:true});}
 const signature=(await readFile(file)).subarray(0,8);assert.deepEqual(signature,Buffer.from([137,80,78,71,13,10,26,10]));
 selected.file=actual;selected.completedAt=stamp();await save(stage.intentFile,stage.intent);return actual;
}
