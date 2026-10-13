// MIT. Durable continuation for the original native encrypted restore.
// Crypto and manifest validation are injected only by recover.mjs.
import {constants} from 'node:fs';
import {open,lstat,mkdir,readdir,realpath,link,unlink} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Writable} from 'node:stream';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {acquireDeliveryLease,assertDeliveryLease,deliveryLeaseDescriptor} from '../sf98-merchant-delivery/delivery-lock.mjs';

const SCHEMA='stellar-forge.merchant-recovery-restore-operation.v1';
const RECORDED='RECORDED_ONLY_NOT_FRESH_TREE_OR_NATIVE_VALIDATION';
const MAX_MANIFEST=12*1024*1024, MAX_META=64*1024;
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const inside=(a,b)=>a===b||b.startsWith(a+sep);
const id=st=>({dev:String(st.dev),ino:String(st.ino)});
const same=(a,b)=>String(a.dev)===String(b.dev)&&String(a.ino)===String(b.ino);
const stable=(a,b)=>same(a,b)&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&a.nlink===b.nlink&&a.mode===b.mode;
function canonical(value,label){
 need(typeof value==='string'&&value.length<=4096&&isAbsolute(value)&&resolve(value)===value&&!value.includes('\0'),label+' must be a canonical absolute path');
 return value;
}
function privateStat(st,label,directory=false,links=[1n]){
 need((directory?st.isDirectory():st.isFile())&&!st.isSymbolicLink()&&st.uid===BigInt(process.getuid())&&(st.mode&0o077n)===0n,label+' must be private and owned');
 if(!directory)need(links.includes(st.nlink),label+' has unexpected hard links');
}
async function stat(path){try{return await lstat(path,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function named(path,original){const actual=await lstat(path,{bigint:true});need(same(actual,original)&&!actual.isSymbolicLink(),'Original restore path changed: '+path);return actual;}
async function syncDir(path){const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await fd.sync();}finally{await fd.close();}}
async function directory(path,privateOnly=false){
 need(await realpath(path)===path,'Aliased restore directory: '+path);
 const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{const original=await fd.stat({bigint:true});need(original.isDirectory(),'Not a directory');if(privateOnly)privateStat(original,path,true);await named(path,original);
 return {path,fd,original,async check(){const current=await fd.stat({bigint:true});need(same(current,original)&&current.isDirectory(),'Restore directory changed');if(privateOnly)privateStat(current,path,true);await named(path,original);need(await realpath(path)===path,'Restore directory acquired an alias');},async close(){await fd.close();}};
 }catch(e){await fd.close();throw e;}
}
async function bounded(path,maximum,{missing=false,links=[1n]}={}){
 let fd;try{fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(e){if(missing&&e.code==='ENOENT')return null;throw e;}
 try{
  const before=await fd.stat({bigint:true});privateStat(before,path,false,links);need(before.size>=0n&&before.size<=BigInt(maximum),'Restore metadata exceeds its explicit bound');
  const raw=Buffer.alloc(Number(before.size)+1);let offset=0;
  while(offset<raw.length){const got=await fd.read(raw,offset,raw.length-offset,offset);if(!got.bytesRead)break;offset+=got.bytesRead;}
  const after=await fd.stat({bigint:true});need(stable(before,after)&&offset===Number(before.size),'Restore metadata changed during read');await named(path,after);
  return {raw:raw.subarray(0,offset),st:after};
 }finally{await fd.close();}
}
async function recordedFile(root,name,maximum,missing=true){
 const target=join(root,name),value=await bounded(target,maximum,{missing,links:[1n,2n]});
 if(value?.st.nlink===2n){const pending=await bounded(join(root,'.'+name+'.pending'),maximum,{links:[2n]});need(same(value.st,pending.st)&&value.raw.equals(pending.raw),'Unaccounted restore metadata link');}
 return value;
}
async function retain(root,name,raw,guard){
 const target=join(root,name),pending=join(root,'.'+name+'.pending');await guard();
 let final=await recordedFile(root,name,raw.length);
 if(final){
  need(final.raw.equals(raw),'Original restore metadata differs: '+name);
  const stage=await bounded(pending,raw.length,{missing:true,links:[1n,2n]});
  if(stage){need(same(final.st,stage.st)&&stage.st.nlink===2n&&stage.raw.equals(raw),'Original metadata stage differs');await syncDir(root);await unlink(pending);await syncDir(root);}
  await guard();return final;
 }
 let fd;try{fd=await open(pending,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);}
 catch(e){if(e.code!=='EEXIST')throw e;fd=await open(pending,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
 try{
  const prefix=await bounded(pending,raw.length);need(same(prefix.st,await fd.stat({bigint:true}))&&raw.subarray(0,prefix.raw.length).equals(prefix.raw),'Original metadata prefix differs');
  let position=prefix.raw.length;while(position<raw.length){const wrote=await fd.write(raw,position,raw.length-position,position);need(wrote.bytesWritten>0,'Restore metadata write made no progress');position+=wrote.bytesWritten;}
  await fd.sync();const complete=await bounded(pending,raw.length);need(complete.raw.equals(raw)&&same(complete.st,await fd.stat({bigint:true})),'Restore metadata changed');await guard();
  await link(pending,target);await syncDir(root);await unlink(pending);await syncDir(root);await guard();
  return await recordedFile(root,name,raw.length,false);
 }finally{await fd.close();}
}
function bindingOf(options){
 const binding={schema:SCHEMA,bundleDirectory:canonical(options.bundleDirectory,'bundleDirectory'),outputDirectory:canonical(options.outputDirectory,'outputDirectory'),operationDirectory:canonical(options.operationDirectory,'operationDirectory'),manifestSha256:options.expectedManifestSha256,passphraseEnv:options.passphraseEnv,python:canonical(options.python??'/usr/bin/python3','python')};
 need(/^[a-f0-9]{64}$/.test(binding.manifestSha256??''),'An exact original manifest SHA-256 is required');
 need(/^[A-Z][A-Z0-9_]{4,63}$/.test(binding.passphraseEnv??''),'Invalid private passphrase environment name');
 const paths=[binding.bundleDirectory,binding.outputDirectory,binding.operationDirectory];for(let a=0;a<paths.length;a++)for(let b=a+1;b<paths.length;b++)need(!inside(paths[a],paths[b])&&!inside(paths[b],paths[a]),'Restore controls and original backup must not overlap');
 need(!paths.some(path=>inside(path,binding.python)),'Python cannot be inside the restore selection');
 return binding;
}
function parse(raw){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
function validBinding(value,operationDirectory,expected){
 need(value&&value.schema===SCHEMA,'Invalid restore operation binding');
 need(isDeepStrictEqual(value,bindingOf({...value,expectedManifestSha256:value.manifestSha256})),'Unexpected restore binding fields');
 need(value.operationDirectory===operationDirectory&&value.manifestSha256===expected,'The original restore operation differs');return value;
}
function validResult(result,binding){
 need(result&&result.status==='RESTORED_TO_NEW_DIR'&&result.destination===binding.outputDirectory&&result.operationDirectory===binding.operationDirectory&&result.manifestSha256===binding.manifestSha256&&Number.isSafeInteger(result.files)&&result.files>=0&&Number.isSafeInteger(result.bytes)&&result.bytes>=0&&typeof result.restoredAt==='string'&&!Number.isNaN(Date.parse(result.restoredAt)),'Invalid original restore result');return result;
}
export async function inspectSnapshotRestoreOperation({operationDirectory,expectedManifestSha256}={}){
 canonical(operationDirectory,'operationDirectory');need(/^[a-f0-9]{64}$/.test(expectedManifestSha256??''),'An exact original manifest SHA-256 is required');
 const empty={schema:SCHEMA,status:'ABSENT',operationDirectory,manifestSha256:expectedManifestSha256,binding:null,stage:null,result:null,validation:RECORDED};
 if(!await stat(operationDirectory))return empty;
 const root=await directory(operationDirectory,true);
 try{
  const saved=await recordedFile(operationDirectory,'binding.json',MAX_META);if(!saved)return empty;
  const binding=validBinding(parse(saved.raw),operationDirectory,expectedManifestSha256);
  const stageBytes=await recordedFile(operationDirectory,'stage.json',MAX_META);
  const stage=stageBytes?parse(stageBytes.raw):null;
  if(stage)need(stage.path===join(operationDirectory,'tree')&&/^\d+$/.test(stage.dev)&&/^\d+$/.test(stage.ino),'Invalid original staged-tree identity');
  const resultBytes=await recordedFile(operationDirectory,'result.json',MAX_META);
  const result=resultBytes?validResult(parse(resultBytes.raw),binding):null;
  if(result){const manifest=await recordedFile(operationDirectory,'manifest.json',MAX_MANIFEST,false);need(hash(manifest.raw)===binding.manifestSha256,'Recorded original manifest differs');const value=parse(manifest.raw);need(result.files===value.fileCount&&result.bytes===value.totalPlainBytes,'Recorded original result totals differ');}
  const publication=await recordedFile(operationDirectory,'published.json',MAX_META);
  if(publication)need(stage&&isDeepStrictEqual(parse(publication.raw),{destination:binding.outputDirectory,...id(stage)}),'Invalid original publication identity');
  await root.check();
  return {...empty,status:result?'RECORDED_COMPLETE':publication?'PUBLISHED':stage?'STAGING':'PREPARED',binding,stage,result};
 }finally{await root.close();}
}
async function withTreeParent(tree,relative,action){
 const root=await directory(tree,true),nodes=[root];let display=tree;
 try{
  const parts=relative.split('/');const leaf=parts.pop();
  for(const part of parts){
   const parent=nodes.at(-1);await parent.check();display=join(display,part);
   const fd=await open('/proc/self/fd/'+parent.fd.fd+'/'+part,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
   let original;try{original=await fd.stat({bigint:true});privateStat(original,display,true);}catch(error){await fd.close();throw error;}
   const path=display,node={fd,path,original,async check(){const actual=await fd.stat({bigint:true});need(same(actual,original),'Original tree directory changed');privateStat(actual,path,true);await named(path,original);}};
   nodes.push(node);await node.check();
  }
  const check=async()=>{for(const node of nodes)await node.check();};
  await check();const parent=nodes.at(-1),result=await action('/proc/self/fd/'+parent.fd.fd+'/'+leaf,join(display,leaf),check,parent.fd);
  await check();return result;
 }finally{for(const node of nodes.reverse())await node.fd.close();}
}
async function inventory(tree,manifest,{partial=false}={}){
 const expected=new Map(manifest.entries.map(entry=>[entry.path,entry])),seen=new Set();
 const root=await directory(tree,true);
 async function walk(fd,relative=''){
  for(const name of (await readdir('/proc/self/fd/'+fd.fd)).sort()){
   const logical=relative?relative+'/'+name:name,path='/proc/self/fd/'+fd.fd+'/'+name;
   const value=await lstat(path,{bigint:true}),wanted=expected.get(logical);
   privateStat(value,logical,value.isDirectory());
   need(wanted&&wanted.kind===(value.isDirectory()?'directory':'file'),'Unexpected restored entry: '+logical);seen.add(logical);
   if(value.isDirectory()){
    const child=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{need(same(value,await child.stat({bigint:true})),'Restored directory changed');await walk(child,logical);await child.sync();}finally{await child.close();}
   }else need(value.size<=BigInt(wanted.size)&&(partial||value.size===BigInt(wanted.size)),'Restored file size differs');
  }
 }
 try{await walk(root.fd);if(!partial)need(seen.size===expected.size,'Restored tree is incomplete');await root.fd.sync();await root.check();}
 finally{await root.close();}
}
async function consumeFile(tree,entry,decrypt,guard,signal){
 return await withTreeParent(tree,entry.path,async(path,display,check,parent)=>{let fd;
 try{fd=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600);}
 catch(e){if(e.code!=='EEXIST')throw e;fd=await open(path,constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
 try{
  const before=await fd.stat({bigint:true});privateStat(before,path);need(before.size<=BigInt(entry.size),'Original plaintext stage exceeds member');await named(path,before);
  const prefix=Number(before.size);let position=0;
  const sink=new Writable({write(chunk,_encoding,callback){(async()=>{
   if(signal?.aborted)throw signal.reason??new Error('Restore interrupted');
   const overlap=Math.min(chunk.length,Math.max(0,prefix-position));
   if(overlap){const actual=Buffer.alloc(overlap);let done=0;while(done<overlap){const got=await fd.read(actual,done,overlap-done,position+done);need(got.bytesRead>0,'Original plaintext prefix shortened');done+=got.bytesRead;}need(actual.equals(chunk.subarray(0,overlap)),'Original plaintext prefix differs');}
   let offset=overlap;while(offset<chunk.length){const wrote=await fd.write(chunk,offset,chunk.length-offset,position+offset);need(wrote.bytesWritten>0,'Plaintext append made no progress');offset+=wrote.bytesWritten;}
   position+=chunk.length;
  })().then(()=>callback(),callback);}});
  await decrypt(entry,sink);
  need(position===entry.size,'Original decrypted member is incomplete');
  await fd.sync();const after=await fd.stat({bigint:true});privateStat(after,path);need(same(after,before)&&after.size===BigInt(entry.size),'Original plaintext identity changed');await named(path,after);await check();await parent.sync();await guard();
 }finally{await fd.close();}
 });
}
async function verifyTree(tree,manifest,guard){
 await inventory(tree,manifest);
 for(const entry of manifest.entries){if(entry.kind!=='file')continue;
  await withTreeParent(tree,entry.path,async(path,display,check)=>{const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const before=await fd.stat({bigint:true});privateStat(before,path);need(before.size===BigInt(entry.size),'Restored member size differs');const digest=createHash('sha256'),buffer=Buffer.alloc(64*1024);let position=0;
   while(position<entry.size){const got=await fd.read(buffer,0,Math.min(buffer.length,entry.size-position),position);need(got.bytesRead>0,'Restored member shortened');digest.update(buffer.subarray(0,got.bytesRead));position+=got.bytesRead;}
   const after=await fd.stat({bigint:true});need(stable(before,after)&&digest.digest('hex')===entry.sha256,'Restored member bytes differ');await named(path,after);await fd.sync();
  }finally{await fd.close();}
  await check();});
 }
 await inventory(tree,manifest);await guard();
}
async function publish(binding,stage,lease,signal,root,outputParent){
 const descriptor=await deliveryLeaseDescriptor(lease,binding.operationDirectory);
 if(signal?.aborted)throw signal.reason??new Error('Restore interrupted');
 return await new Promise((resolvePromise,reject)=>{
  const child=spawn(binding.python,[fileURLToPath(new URL('./restore-publish.py',import.meta.url)),binding.operationDirectory,binding.outputDirectory,stage.dev,stage.ino,String(root.original.dev),String(root.original.ino),String(outputParent.original.dev),String(outputParent.original.ino)],{stdio:['ignore','pipe','pipe',descriptor,root.fd.fd,outputParent.fd.fd]});
  let stdout='',stderr='',failure=null,timer;
  const stop=()=>{failure??=signal?.reason??new Error('Restore interrupted');child.kill('SIGTERM');timer??=setTimeout(()=>child.kill('SIGKILL'),2000);};
  const read=(kind,chunk)=>{if(kind==='out')stdout+=chunk.toString('utf8');else stderr+=chunk.toString('utf8');if(stdout.length+stderr.length>65536){failure=new Error('Publication helper output exceeds its bound');stop();}};
  child.stdout.on('data',chunk=>read('out',chunk));child.stderr.on('data',chunk=>read('err',chunk));child.on('error',e=>{failure=e;});
  const abort=()=>stop();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)stop();
  child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure)return reject(failure);if(code!==0)return reject(new Error('Native restore publication failed: '+stderr.trim()));try{const value=JSON.parse(stdout);need(value.status==='PUBLISHED'&&value.dev===stage.dev&&value.ino===stage.ino,'Publication helper identity differs');resolvePromise(value);}catch(e){reject(e);}});
 });
}
export async function continueSnapshotRestore(options,{authenticate,decrypt}){
 const binding=bindingOf(options),signal=options.signal,rootPath=binding.operationDirectory;
 const interrupted=()=>{if(signal?.aborted)throw signal.reason??new Error('Restore interrupted');};
 let lease,root,parent,outputParent,verified;
 try{
  interrupted();
  const prior=await inspectSnapshotRestoreOperation({operationDirectory:rootPath,expectedManifestSha256:binding.manifestSha256});
  if(prior.binding)need(isDeepStrictEqual(prior.binding,binding),'The original restore selection differs');
  if(prior.result)return {...prior.result,reopened:true,validation:RECORDED,restoreOperation:{directory:rootPath,status:'COMPLETE'}};
  // Authenticate every encrypted original before any operation directory or plaintext.
  verified=await authenticate();need(hash(verified.raw)===binding.manifestSha256,'Original manifest SHA-256 differs');interrupted();
  parent=await directory(dirname(rootPath));outputParent=await directory(dirname(binding.outputDirectory));
  need(parent.original.dev===outputParent.original.dev,'Restore staging and destination must share a filesystem');
  try{await mkdir(rootPath,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  root=await directory(rootPath,true);need(root.original.dev===outputParent.original.dev,'Original restore operation and destination must share a filesystem');await root.fd.sync();await parent.fd.sync();
  lease=await acquireDeliveryLease(rootPath,{purpose:'drain'});
  const guard=async()=>{await parent.check();await root.check();await outputParent.check();await assertDeliveryLease(lease,rootPath);};
  await guard();
  const allowed=new Set(['.sf98-delivery.lock','tree',...['binding.json','manifest.json','stage.json','published.json','ready.json','result.json'].flatMap(name=>[name,'.'+name+'.pending'])]);
  need((await readdir(rootPath)).every(name=>allowed.has(name)),'Original restore operation contains unrelated content');
  const saved=await recordedFile(rootPath,'binding.json',MAX_META);
  if(!saved){const names=await readdir(rootPath);need(names.every(name=>['.sf98-delivery.lock','.binding.json.pending'].includes(name)),'Unbound restore directory contains unrelated state');}
  await retain(rootPath,'binding.json',json(binding),guard);
  await retain(rootPath,'manifest.json',verified.raw,guard);
  const again=await inspectSnapshotRestoreOperation({operationDirectory:rootPath,expectedManifestSha256:binding.manifestSha256});
  if(again.result)return {...again.result,reopened:true,validation:RECORDED,restoreOperation:{directory:rootPath,status:'COMPLETE'}};
  let stage=again.stage,stagePath=join(rootPath,'tree'),staged=await stat(stagePath),final=await stat(binding.outputDirectory);
  if(!stage){
   need(!final,'Destination already exists without original publication ownership');
   if(!staged){await mkdir(stagePath,{mode:0o700});await root.fd.sync();staged=await lstat(stagePath,{bigint:true});}
   privateStat(staged,stagePath,true);need((await readdir(stagePath)).length===0,'Unbound staged restore contains data');
   stage={path:stagePath,...id(staged)};await retain(rootPath,'stage.json',json(stage),guard);
  }
  if(final){
   need(!staged&&same(final,stage),'Destination is not this original published tree');privateStat(final,binding.outputDirectory,true);
   await verifyTree(binding.outputDirectory,verified.m,guard);await outputParent.fd.sync();await root.fd.sync();
  }else{
   need(staged&&same(staged,stage),'Original staged tree is missing or changed');privateStat(staged,stagePath,true);
   await inventory(stagePath,verified.m,{partial:true});
   const dirs=verified.m.entries.filter(e=>e.kind==='directory').sort((a,b)=>a.path.split('/').length-b.path.split('/').length);
   for(const entry of dirs){interrupted();await withTreeParent(stagePath,entry.path,async(path,display,check,parent)=>{try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}privateStat(await lstat(path,{bigint:true}),display,true);await check();await parent.sync();});}
   for(const entry of verified.m.entries)if(entry.kind==='file'){interrupted();await guard();await consumeFile(stagePath,entry,(item,sink)=>decrypt(verified,item,sink),guard,signal);}
   await verifyTree(stagePath,verified.m,guard);await root.fd.sync();interrupted();
   await publish(binding,stage,lease,signal,root,outputParent);await guard();
   const published=await lstat(binding.outputDirectory,{bigint:true});need(same(published,stage),'Published original tree differs');await verifyTree(binding.outputDirectory,verified.m,guard);await outputParent.fd.sync();
  }
  await retain(rootPath,'published.json',json({destination:binding.outputDirectory,...id(stage)}),guard);
  const ready=await retain(rootPath,'ready.json',json({manifestSha256:binding.manifestSha256,destination:binding.outputDirectory}),guard);
  const result={status:'RESTORED_TO_NEW_DIR',destination:binding.outputDirectory,files:verified.m.fileCount,bytes:verified.m.totalPlainBytes,manifestSha256:binding.manifestSha256,operationDirectory:rootPath,restoredAt:new Date(Number(ready.st.mtimeNs/1000000n)).toISOString()};
  await retain(rootPath,'result.json',json(result),guard);await guard();
  return {...result,reopened:false,validation:'FRESH_AUTHENTICATED_RESTORE',restoreOperation:{directory:rootPath,status:'COMPLETE'}};
 }catch(error){
  error.details={...(error.details&&typeof error.details==='object'?error.details:{}),restoreOperation:{operationDirectory:rootPath,expectedManifestSha256:binding.manifestSha256,retry:'EXPLICIT_ONLY_SAME_ORIGINAL_SELECTION'}};throw error;
 }finally{
  verified?.key?.fill(0);
  try{await lease?.release();}finally{await root?.close();await parent?.close();await outputParent?.close();}
 }
}
