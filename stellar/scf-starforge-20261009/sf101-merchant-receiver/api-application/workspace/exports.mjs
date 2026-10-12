// MIT. Immutable operator receiving files; original native sources keep their identities.
import {constants} from 'node:fs';
import {open,realpath,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {need,absolute,ownedDirectory,ownedBytes,writeExact,encoded,parse,digest,UUID,HASH,text} from './configuration.mjs';

const SCHEMA='stellar-forge.sf101.api-merchant-export.v1';
const NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export async function retainedFile(path){
 absolute(path);
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|(constants.O_NONBLOCK??0));
 try{
  const before=await handle.stat();
  need(before.isFile()&&before.nlink===1&&!(before.mode&0o077)&&
   (!process.getuid||before.uid===process.getuid())&&await realpath(path)===path,
   'API_MERCHANT_EXPORT_FILE_REQUIRED');
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){hash.update(chunk);bytes+=chunk.length;}
  const after=await handle.stat();
  need(bytes===before.size&&before.dev===after.dev&&before.ino===after.ino&&
   before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs,'API_MERCHANT_EXPORT_FILE_CHANGED',409);
  return {path,bytes,sha256:hash.digest('hex')};
 }finally{await handle.close();}
}
export async function createExport(configuration,{id,kind,label,createdAt,members}){
 need(UUID.test(id)&&Array.isArray(members)&&members.length>0&&members.length<=64,'API_MERCHANT_EXPORT_REQUIRED');
 text(kind,80,'API_MERCHANT_EXPORT_KIND_REQUIRED');text(label,240,'API_MERCHANT_EXPORT_LABEL_REQUIRED');
 const directory=join(configuration.directory,'exports',id);
 await ownedDirectory(directory,{create:true});
 const names=new Set(),files=[];
 for(const member of members){
  need(NAME.test(member.name??'')&&!names.has(member.name)&&member.name!=='manifest.json','API_MERCHANT_EXPORT_NAME_REQUIRED');
  names.add(member.name);
  let path=member.path;
  if(member.content!==undefined){
   path=join(directory,member.name);
   const body=Buffer.isBuffer(member.content)?member.content:Buffer.from(member.content);
   await writeExact(path,body);
  }
  const retained=await retainedFile(path);
  if(member.sha256!==undefined)need(retained.sha256===member.sha256&&retained.bytes===member.bytes,
   'API_MERCHANT_EXPORT_SOURCE_CHANGED',409);
  need(typeof member.contentType==='string'&&member.contentType.length<=255&&!/[^\x20-\x7e]/.test(member.contentType),
   'API_MERCHANT_EXPORT_TYPE_REQUIRED');
  files.push({name:member.name,...retained,contentType:member.contentType});
 }
 const manifest={schema:SCHEMA,id,kind,label,createdAt,files};
 await writeExact(join(directory,'manifest.json'),encoded(manifest));
 return manifest;
}
export function exportView(manifest){
 return {schema:SCHEMA,id:manifest.id,kind:manifest.kind,label:manifest.label,createdAt:manifest.createdAt,
  files:manifest.files.map(({path,...file})=>({...file,
   downloadUrl:'/api/exports/'+encodeURIComponent(manifest.id)+'/files/'+encodeURIComponent(file.name)}))};
}
export async function readExport(configuration,id,{verify=false}={}){
 need(UUID.test(id),'API_MERCHANT_EXPORT_ID_REQUIRED');
 const manifest=parse(await ownedBytes(join(configuration.directory,'exports',id,'manifest.json'),1024*1024));
 need(manifest.schema===SCHEMA&&manifest.id===id&&Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=64,
  'API_MERCHANT_EXPORT_MANIFEST_CHANGED',409);
 const seen=new Set();
 for(const file of manifest.files){
  need(NAME.test(file.name??'')&&!seen.has(file.name)&&HASH.test(file.sha256??'')&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,
   'API_MERCHANT_EXPORT_MANIFEST_CHANGED',409);seen.add(file.name);absolute(file.path);
  if(verify){const actual=await retainedFile(file.path);need(actual.sha256===file.sha256&&actual.bytes===file.bytes,
   'API_MERCHANT_EXPORT_FILE_CHANGED',409);}
 }
 return manifest;
}
/** The returned descriptor remains open across exact-hash verification and delivery. */
export async function openExportFile(configuration,id,name){
 need(NAME.test(name??''),'API_MERCHANT_EXPORT_NAME_REQUIRED');
 const manifest=await readExport(configuration,id),file=manifest.files.find(item=>item.name===name);
 need(file,'API_MERCHANT_EXPORT_FILE_NOT_FOUND',404);
 const handle=await open(file.path,constants.O_RDONLY|constants.O_NOFOLLOW|(constants.O_NONBLOCK??0));
 try{
  const before=await handle.stat();
  need(before.isFile()&&before.nlink===1&&before.size===file.bytes&&!(before.mode&0o077)&&
   (!process.getuid||before.uid===process.getuid())&&await realpath(file.path)===file.path,
   'API_MERCHANT_EXPORT_FILE_CHANGED',409);
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of handle.createReadStream({autoClose:false})){hash.update(chunk);bytes+=chunk.length;}
  const after=await handle.stat(),named=await lstat(file.path);
  need(bytes===file.bytes&&hash.digest('hex')===file.sha256&&before.dev===after.dev&&before.ino===after.ino&&
   before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&!named.isSymbolicLink()&&
   named.dev===before.dev&&named.ino===before.ino,'API_MERCHANT_EXPORT_FILE_CHANGED',409);
  return {handle,file,manifest};
 }catch(error){await handle.close();throw error;}
}
export async function existingJson(path){
 try{return parse(await ownedBytes(path,20*1024*1024));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function retainJson(path,produce){
 const present=await existingJson(path);if(present!==null)return present;
 const result=await produce();await writeExact(path,encoded(result));return result;
}
