// MIT. Complete, immutable receiving files around the original Research APIs.
import {lstat,mkdir,realpath,readdir} from 'node:fs/promises';
import {dirname,basename,join,resolve,isAbsolute,relative,sep} from 'node:path';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {need,object,digest,jsonBytes,parseJson} from '../../node/store.mjs';
import {readResearchHostFile,openResearchSource} from '../workspace-files.mjs';
import {writePortableFile,PORTABLE_LIMIT} from '../portable.mjs';
import {citationDigest} from '../citation-updates.mjs';
export {need,object,digest,jsonBytes,parseJson,citationDigest};
export const same=(a,b)=>citationDigest(a)===citationDigest(b);
export const absolute=value=>{
  need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value,'CUSTOMER_ABSOLUTE_PATH_REQUIRED');
  return value;
};
export const key=value=>{
  need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value)&&value!=='.'&&value!=='..','CUSTOMER_KEY_INVALID');
  return value;
};
export const member=value=>{
  need(typeof value==='string'&&value.length<=1024&&!isAbsolute(value)&&!/[\\\u0000-\u001f\u007f]/.test(value)&&
    value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'CUSTOMER_MEMBER_INVALID');
  return value;
};
export async function directory(path){
  absolute(path);await mkdir(path,{mode:0o700,recursive:true});
  const info=await lstat(path);
  need(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(path)===path&&
    (process.platform==='win32'||(info.mode&0o077)===0)&&(!process.getuid||info.uid===process.getuid()),'CUSTOMER_PRIVATE_DIRECTORY_REQUIRED');
  return path;
}
export async function exists(file){
  try{const info=await lstat(file);need(info.isFile()&&!info.isSymbolicLink(),'CUSTOMER_FILE_TYPE_CHANGED');return true;}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
}
export async function read(file,maximum=PORTABLE_LIMIT,sha256){
  return readResearchHostFile(absolute(file),maximum,{...(sha256?{sha256}:{})});
}
export async function descriptor(file,maximum=PORTABLE_LIMIT){
  const source=await openResearchSource(absolute(file),maximum);
  try{return {file,bytes:source.bytes,sha256:source.sha256};}finally{await source.close();}
}
export async function checked(value,maximum=PORTABLE_LIMIT){
  need(object(value)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&
    /^[a-f0-9]{64}$/.test(value.sha256??''),'CUSTOMER_FILE_DESCRIPTOR_REQUIRED');
  const file=absolute(value.file??value.path),bytes=await read(file,maximum,value.sha256);
  need(bytes.length===value.bytes,'CUSTOMER_SELECTED_FILE_CHANGED');return bytes;
}
export async function retainBytes(file,input){
  absolute(file);const bytes=Buffer.from(input);need(bytes.length<=PORTABLE_LIMIT,'CUSTOMER_FILE_TOO_LARGE');
  await directory(dirname(file));
  if(await exists(file)){need((await read(file)).equals(bytes),'CUSTOMER_RETAINED_FILE_CHANGED');return descriptor(file);}
  try{return await writePortableFile(file,{body:Readable.from([bytes]),filename:basename(file),contentType:'application/octet-stream'});}
  catch(error){if(error.code!=='EEXIST')throw error;
    need((await read(file)).equals(bytes),'CUSTOMER_RETAINED_FILE_CHANGED');return descriptor(file);}
}
export async function retain(file,value){return retainBytes(file,jsonBytes(value));}
export async function value(file){return parseJson(await read(file));}
export async function copySelected(input,file){
  const bytes=await checked(input);return retainBytes(file,bytes);
}
export async function step(root,name,makeRequest,execute){
  const slot=await directory(join(root,key(name))),requestFile=join(slot,'request.json'),resultFile=join(slot,'result.json');
  let request;
  if(await exists(requestFile))request=await value(requestFile);
  else{request=await makeRequest();await retain(requestFile,request);}
  if(await exists(resultFile)){
    const result=await value(resultFile);
    need(result.requestSha256===citationDigest(request),'CUSTOMER_STEP_REQUEST_CHANGED');
    return result.result;
  }
  const result=await execute(request);
  await retain(resultFile,{requestSha256:citationDigest(request),result});
  return result;
}
export async function dossierList(client){
  const items=[];let next={limit:100},snapshot;
  do{
    const page=await client.list(next);
    need(Array.isArray(page.items)&&(!snapshot||snapshot===page.snapshot),'CUSTOMER_DOSSIER_INVENTORY_CHANGED');
    snapshot=page.snapshot;items.push(...page.items);next=page.next;
  }while(next);
  return {snapshot,items};
}
export async function section(client,id,name,revision){
  const items=[];let offset=0;
  do{
    const page=await client.section(id,{section:name,revision,offset,limit:100});
    need(page.revision===revision&&Array.isArray(page.items),'CUSTOMER_DOSSIER_PAGE_CHANGED');
    need(page.nextOffset===null||Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset,'CUSTOMER_DOSSIER_PAGE_INVALID');
    items.push(...page.items);offset=page.nextOffset;
  }while(offset!==null);
  return items;
}
export async function noticePages(client,id,revision){
  const items=[];let offset=0,first;
  do{
    const page=await client.citationUpdates(id,{revision,offset,limit:100});
    need(page.dossier.id===id&&page.dossier.revision===revision,'CUSTOMER_CITATION_PAGE_CHANGED');
    need(Array.isArray(page.items)&&page.offset===offset&&
      (page.nextOffset===null||Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset),'CUSTOMER_CITATION_PAGE_INVALID');
    first??=page;need(page.total===first.total,'CUSTOMER_CITATION_PAGE_TOTAL_CHANGED');
    items.push(...page.items);offset=page.nextOffset;
  }while(offset!==null);
  need(items.length===first.total,'CUSTOMER_CITATION_PAGE_INCOMPLETE');
  return {...first,items,offset:0,limit:100,nextOffset:null};
}
export async function requireRevision(client,id,revision){
  const actual=await client.metadata(id);
  need(actual.revision===revision,'CUSTOMER_DOSSIER_REVISION_CHANGED');return actual;
}
export async function verifyFiles(files){
  for(const file of files)await checked(file);
}
export async function runProcess(command,args,{cwd,env={},logFile}={}){
  need(typeof command==='string'&&command&&Array.isArray(args)&&args.every(value=>typeof value==='string'),'CUSTOMER_PROCESS_SELECTION_REQUIRED');
  const chunks=[];
  const result=await new Promise((accept,reject)=>{
    const child=spawn(command,args,{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
    let total=0;
    const receive=(stream,kind)=>stream.on('data',chunk=>{
      total+=chunk.length;
      if(total>16*1024*1024){child.kill('SIGTERM');reject(Object.assign(new Error('CUSTOMER_PROCESS_OUTPUT_TOO_LARGE'),{code:'CUSTOMER_PROCESS_OUTPUT_TOO_LARGE'}));return;}
      chunks.push({kind,bytes:Buffer.from(chunk)});
    });
    receive(child.stdout,'stdout');receive(child.stderr,'stderr');
    child.on('error',reject);child.on('close',(code,signal)=>accept({code,signal}));
  });
  const stdout=Buffer.concat(chunks.filter(row=>row.kind==='stdout').map(row=>row.bytes)).toString('utf8');
  const stderr=Buffer.concat(chunks.filter(row=>row.kind==='stderr').map(row=>row.bytes)).toString('utf8');
  if(logFile)await retain(logFile,{command,args,exitCode:result.code,signal:result.signal,stdout,stderr});
  need(result.code===0,'CUSTOMER_ORIGINAL_PROCESS_FAILED');
  return {stdout,stderr,...result};
}
export async function publicFiles(root){
  absolute(root);const rows=[];
  async function visit(path,prefix){
    for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      need(!entry.isSymbolicLink(),'CUSTOMER_OUTPUT_SYMLINK');
      const name=prefix?prefix+'/'+entry.name:entry.name;
      if(entry.isDirectory())await visit(join(path,entry.name),name);
      else if(entry.isFile())rows.push({name:member(name),...await descriptor(join(path,entry.name))});
      else need(false,'CUSTOMER_OUTPUT_FILE_TYPE_INVALID');
    }
  }
  await visit(root,'');return rows;
}
export function inside(root,file){
  const name=relative(absolute(root),absolute(file)).split(sep).join('/');
  member(name);return name;
}
