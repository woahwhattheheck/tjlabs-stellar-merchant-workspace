// MIT — Full research-store/original-file handover, through native verified reads.
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,open,writeFile,rm,link,unlink,lstat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {requireValue,verifyFile,digest,directory} from '../files.mjs';
import {ResearchClient} from './client.mjs';
import {PROJECT_SOURCE} from './project-source.mjs';
const helper=fileURLToPath(new URL('./project-archive.py',import.meta.url));
export async function projectCommand(command,args,{signal,python=process.env.STARFORGE_PYTHON??'python3'}={}){
  signal?.throwIfAborted();
  return await new Promise((resolve,reject)=>{
    const child=spawn(python,[helper,command,...args],{stdio:['ignore','pipe','pipe'],signal});
    let stdout='',stderr='';
    child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
    child.once('error',reject);child.once('close',code=>{
      if(code!==0){let message;try{message=JSON.parse(stderr.trim()).error;}catch{message='Research project helper failed';}
        return reject(Object.assign(new Error(message),{code:'PROJECT_HELPER_FAILED',status:409}));}
      try{resolve(JSON.parse(stdout));}catch{reject(Object.assign(new Error('PROJECT_HELPER_RESPONSE_INVALID'),{code:'PROJECT_HELPER_RESPONSE_INVALID'}));}
    });
  });
}
function readStores(root){
 const lib=new DatabaseSync(join(root,'library.sqlite'),{readOnly:true});
 const research=new DatabaseSync(join(root,'content-search.sqlite'),{readOnly:true});
 try{
  const setting=key=>JSON.parse(lib.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??'null');
  const config=setting('config'),scan=setting('scan');requireValue(scan?.generation,'LIBRARY_SCAN_REQUIRED',409);
  const resources=lib.prepare('SELECT metadata FROM records WHERE generation=? ORDER BY id').all(scan.generation).map(x=>JSON.parse(x.metadata));
  const originals=[...resources,...research.prepare('SELECT resource FROM members ORDER BY build,ordinal').all().map(x=>JSON.parse(x.resource))];
  for(const row of lib.prepare('SELECT content FROM resource_collections').all())originals.push(...JSON.parse(row.content).members);
  return {config,scan,resources,originals};
 }finally{research.close();lib.close();}
}
async function copyOriginal(record,config,root,signal){
 const verified=await verifyFile(record,{...config,tempRoot:root,spool:true,indexBytes:0,signal});
 let output;
 try{
  output=await open(join(root,'files',record.sha256),'wx',0o600);
  const buffer=Buffer.alloc(256*1024);let position=0;
  while(position<record.bytes){signal?.throwIfAborted();const {bytesRead}=await verified.file.read(buffer,0,Math.min(buffer.length,record.bytes-position),position);requireValue(bytesRead>0,'PROJECT_ORIGINAL_READ_STALLED',500);
   let written=0;while(written<bytesRead){const r=await output.write(buffer,written,bytesRead-written,position+written);requireValue(r.bytesWritten>0,'PROJECT_WRITE_STALLED',500);written+=r.bytesWritten;}position+=bytesRead;}
  await output.sync();
 }finally{await output?.close();await verified.dispose();}
}
async function copyHandovers(root,state,signal){
 const db=new DatabaseSync(join(root,'content-search.sqlite'),{readOnly:true});let operations=[];
 try{if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='reading_handover_operations'").get())operations=db.prepare('SELECT id,state,result FROM reading_handover_operations').all();}finally{db.close();}
 // Completed original handovers are immutable; never snapshot a changing producer.
 requireValue(!operations.some(x=>x.state==='PREPARING'),'PROJECT_HANDOVER_PREPARATION_ACTIVE',409);
 let copied=0;
 for(const operation of operations){
  const relative=join('reading-handovers',digest(operation.id));
  for(const name of ['sources.tar','handover.json','reading-handover.zip']){
   const source=join(state,relative,name),destination=join(root,relative,name);let input,output;
   try{
    let info;try{info=await lstat(source);}catch(e){if(e.code==='ENOENT'&&operation.state!=='COMPLETE')continue;throw e;}
    requireValue(info.isFile()&&!info.isSymbolicLink(),'PROJECT_HANDOVER_FILE_REQUIRED');
    input=await open(source,'r');const before=await input.stat();
    requireValue(before.ino===info.ino&&before.dev===info.dev,'PROJECT_HANDOVER_FILE_CHANGED',409);
    await mkdir(dirname(destination),{recursive:true,mode:0o700});output=await open(destination,'wx',0o600);
    const buffer=Buffer.alloc(256*1024);let position=0;
    while(true){signal?.throwIfAborted();const {bytesRead}=await input.read(buffer,0,buffer.length,position);if(!bytesRead)break;await output.writeFile(buffer.subarray(0,bytesRead));position+=bytesRead;}
    const after=await input.stat();requireValue(['size','mtimeMs','ctimeMs','ino','dev'].every(k=>before[k]===after[k]),'PROJECT_HANDOVER_FILE_CHANGED',409);
    await output.sync();copied++;
   }finally{await input?.close();await output?.close();}
  }
 }
 return {operations:operations.length,files:copied};
}
export async function projectDownload(search,options={},signal){
 const library=search.library;await directory(library.state,true);
 const root=await mkdtemp(join(library.state,'.research-project-'));let file,success=false;
 const dispose=async()=>{await file?.close().catch(()=>{});await rm(root,{recursive:true,force:true});};
 try{
  await mkdir(join(root,'files'),{mode:0o700});
  await projectCommand('snapshot',['--state',library.state,'--out',root],{...options,signal});
  const snapshot=readStores(root),id=randomUUID(),records=new Map();
  const handovers=await copyHandovers(root,library.state,signal);
  for(const r of snapshot.originals){if(r.deliveryStatus!=='SAVED')continue;requireValue(/^[a-f0-9]{64}$/.test(r.sha256??'')&&Number.isSafeInteger(r.bytes),'PROJECT_ORIGINAL_METADATA_INVALID');
   if(!records.has(r.sha256))records.set(r.sha256,[]);records.get(r.sha256).push(r);}
  let complete=0,totalBytes=0;
  for(const candidates of records.values()){
    let failure;for(const record of candidates){try{await copyOriginal(record,snapshot.config,root,signal);failure=null;totalBytes+=record.bytes;break;}catch(e){failure=e;if(signal?.aborted)throw e;await unlink(join(root,'files',record.sha256)).catch(()=>{});}}
    if(failure)throw failure;complete++;options.onProgress?.({state:'COPYING_ORIGINALS',completed:complete,total:records.size,bytes:totalBytes});
  }
  const source={schema:PROJECT_SOURCE,projectId:id,createdAt:new Date().toISOString(),originalConfig:snapshot.config,originalScan:snapshot.scan,resources:snapshot.resources};
  await writeFile(join(root,'project-source.json'),JSON.stringify(source),{mode:0o600,flag:'wx'});
  const packed=await projectCommand('pack',['--root',root,'--out',join(root,'project.sfrp')],{...options,signal});
  file=await open(join(root,'project.sfrp'),'r');success=true;
  return {file,bytes:packed.bytes,sha256:packed.sha256,resource:{id:digest(id),name:'research-project-'+id+'.sfrp'},project:{...packed,path:undefined,originals:records.size,originalBytes:totalBytes,handovers},dispose};
 }finally{if(!success)await dispose();}
}
export async function saveProject(search,destination,options={}){
 const target=resolve(destination),descriptor=await projectDownload(search,options,options.signal);let output,temporary;
 try{
  temporary=await mkdtemp(join(dirname(target),'.research-publish-'));
  const part=join(temporary,'project.sfrp');output=await open(part,'wx',0o600);const buffer=Buffer.alloc(256*1024);let position=0;
  while(position<descriptor.bytes){options.signal?.throwIfAborted();const {bytesRead}=await descriptor.file.read(buffer,0,buffer.length,position);requireValue(bytesRead>0,'PROJECT_COPY_STALLED');await output.writeFile(buffer.subarray(0,bytesRead));position+=bytesRead;}
  await output.sync();await output.close();output=null;await link(part,target);
  return {...descriptor.project,path:target,bytes:descriptor.bytes,sha256:descriptor.sha256};
 }finally{await output?.close();await descriptor.dispose();if(temporary)await rm(temporary,{recursive:true,force:true});}
}
export const inspectProject=(archive,options={})=>projectCommand('inspect',['--archive',resolve(archive),...(options.maximumBytes?['--maximum-bytes',String(options.maximumBytes)]:[])],options);
export const receiveProject=(archive,destination,options={})=>projectCommand('receive',['--archive',resolve(archive),'--out',resolve(destination),...(options.maximumBytes?['--maximum-bytes',String(options.maximumBytes)]:[])],options);

export class ResearchProjectClient extends ResearchClient {
  project(options={}){return this.request('/api/content-search/project',{...options,method:'POST',body:{}});}
}
