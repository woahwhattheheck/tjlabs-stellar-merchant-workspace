#!/usr/bin/env node
// MIT. One complete original-source preparation and copied-directory receiving.
import {readFile,open,mkdir,lstat,readdir,copyFile,rename,mkdtemp,rm,realpath,link,unlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {prepareMaterialInstallationFiles,reopenMaterialInstallation} from './files.mjs';
import {SCHEMA,identity,same,need,parseJson} from './core.mjs';
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
async function sync(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function retain(path,bytes){
 try{const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&(await readFile(path)).equals(bytes),'The existing original receiving file differs.');}
 catch(e){if(e.code!=='ENOENT')throw e;const temporary=path+'.'+process.pid+'.tmp',h=await open(temporary,'wx',0o600);
  try{await h.writeFile(bytes);await h.sync();await h.close();try{await link(temporary,path);}catch(x){if(x.code!=='EEXIST')throw x;need((await readFile(path)).equals(bytes),'The concurrent original receiving file differs.');}await sync(dirname(path));}
  finally{await h.close().catch(()=>{});await unlink(temporary).catch(()=>{});}}
}
async function copyWhole(source,target){
 await mkdir(target,{mode:0o700});
 for(const e of await readdir(source,{withFileTypes:true})){
  need(!e.isSymbolicLink(),'The complete preparation contains a symbolic link.');
  const a=join(source,e.name),b=join(target,e.name);
  if(e.isDirectory())await copyWhole(a,b);
  else{need(e.isFile(),'The preparation contains a nonregular file.');await copyFile(a,b);await sync(b);}
 }
 await sync(target);
}
export async function receiveMaterialInstallation({requestPath,directory}){
 const root=resolve(directory),source=resolve(requestPath);
 need(source!==root&&!source.startsWith(root+'/'),'Keep the original request outside the owned receiving output.');
 const s=await lstat(source);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=1024*1024&&await realpath(source)===source,'Use a complete original request file.');
 const raw=await readFile(source),request=parseJson(raw);
 need(request.schema===SCHEMA+'.receiving-request'&&request.options&&typeof request.options.out==='string','Select the complete source receiving options.');
 const prepared=resolve(request.options.out);
 need(prepared!==root&&!prepared.startsWith(root+'/')&&!root.startsWith(prepared+'/'),'Keep prepared customer and receiving directories disjoint.');
 await mkdir(root,{recursive:true,mode:0o700});need(await realpath(root)===root,'Use the original real private receiving directory.');
 const state=await lstat(root);need(state.isDirectory()&&(state.mode&0o077)===0,'Keep the receiving directory private.');
 await retain(join(root,'request.json'),raw);
 const first=await prepareMaterialInstallationFiles(request.options);
 const replay=await prepareMaterialInstallationFiles(request.options);need(same(first,replay),'Same original preparation replay differs.');
 const cold=await reopenMaterialInstallation(prepared);need(same(first,cold),'The original complete preparation reopen differs.');
 const target=join(root,'received');
 try{await lstat(target);}
 catch(e){if(e.code!=='ENOENT')throw e;const stage=await mkdtemp(join(root,'.receiving-'));
  try{const copied=join(stage,'complete');await copyWhole(prepared,copied);await rename(copied,target);await sync(root);}
  finally{await rm(stage,{recursive:true,force:true});}}
 const beforeChild=await reopenMaterialInstallation(target);need(same(first,beforeChild),'The existing received directory belongs to a different source.');
 // Execute the copied complete original application from its own retained source.
 const child=spawnSync(process.execPath,[join(target,'application/products/material-catalog/commissioning/cli.mjs'),'reopen','--directory',target],
  {cwd:target,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 if(child.error)throw child.error;need(child.status===0&&!child.signal,'Original received application reopen failed: '+child.stderr);
 const received=JSON.parse(child.stdout);need(same(first,received),'The complete independently received source differs.');
 const result={schema:SCHEMA+'.receiving-result',operationId:first.operationId,completed:true,request:identity(raw),
  preparedDirectory:prepared,receivedDirectory:target,workshareCaseId:first.workshareCaseId,installationSource:first.installationSource,
  selectedBundle:first.bundle,files:first.files,completeReopenExact:true,sameRequestReplayExact:true,
  browserReceiving:'PENDING_EXACT_OUTPUT_OPEN_USE_AND_PRODUCER_VIEW',nativeInstallation:'CONTINUE_ORIGINAL_CUSTOMER_INSTALLATIONS_PREVIEW_SAVE_EXPORT_RECEIVE'};
 await retain(join(root,'MATERIAL_INSTALLATION_RECEIVING.json'),encode(result));await sync(root);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const a=process.argv.slice(2);
 if(a.length!==4||a[0]!=='--request'||a[2]!=='--directory')throw Error('Use --request ORIGINAL_REQUEST.json --directory OWNED_RECEIVING.');
 receiveMaterialInstallation({requestPath:a[1],directory:a[3]}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.stack??e);process.exitCode=1;});
}
