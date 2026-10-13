// SPDX-License-Identifier: MIT
// Complete portable native output and selected source; receiving calls the original customer engine.
import {open,lstat,readdir,link,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import * as client from '../odata-subscription-client.mjs';
import {
 need,HASH,bytes,identity,parse,read,readJSON,maybeJSON,privateDirectory,pathAt,atomic,
 immutable,copy,chunks,inventory,measure,measureChecked,leased,same,syncDir
} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/files.mjs';
export const PORTABLE_SCHEMA='stellar-forge.odata-customer-desk-portable.v1';
const PREFIX='stellar-forge/mcp-merchant-operator/odata-subscription-desk/';
const MAX_TOTAL=1024*1024*1024,MAX_FILES=20000,MAX_LINE=1048576;
const SOURCE_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
function safe(name){need(typeof name==='string'&&name.length<=1024&&!name.startsWith('/')&&!name.includes('\\')&&
 name.split('/').every(p=>p&&p!=='.'&&p!=='..'&&/^[A-Za-z0-9_.-]+$/.test(p)),'DESK_PORTABLE_PATH','Choose a canonical original file path.');return name;}
function descriptor(file){safe(file.path);need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=256*1024*1024&&HASH.test(file.sha256),'DESK_PORTABLE_FILE','Retain the complete original file identity.');return {path:file.path,bytes:file.bytes,sha256:file.sha256};}
async function sourceRead(root,name,max){
 safe(name);let current=resolve(root);
 for(const part of name.split('/')){current=join(current,part);const s=await lstat(current);need(!s.isSymbolicLink(),'DESK_SOURCE','The selected source contains a symbolic link.');}
 const f=await open(current,'r');try{const before=await f.stat({bigint:true});need(before.isFile()&&before.size<=BigInt(max),'DESK_SOURCE','Select a complete ordinary source file.');
 const raw=await f.readFile(),after=await f.stat({bigint:true});need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k]),'DESK_SOURCE','The selected source changed.');return raw;}finally{await f.close();}
}
export async function sourceManifestIdentity(path){path=resolve(path);return identity(await sourceRead(dirname(path),path.split('/').at(-1),32*1024*1024));}
/** Inventory the actual executing installed source directory, with relative paths. */
export async function writeSourceManifest({output,sourceRoot=SOURCE_ROOT}={}){
 sourceRoot=resolve(sourceRoot);output=resolve(output);
 need(sourceRoot===resolve(SOURCE_ROOT)&&!output.startsWith(sourceRoot+'/'),'DESK_SOURCE','Write the complete source inventory outside the actual executing source tree.');
 const files=[];let total=0;
 async function visit(directory,prefix=''){
  const rows=(await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  for(const row of rows){
   if(['.git','node_modules','__pycache__'].includes(row.name))continue;
   const path=prefix?prefix+'/'+row.name:row.name;safe(path);
   need(!row.isSymbolicLink(),'DESK_SOURCE','The installed source contains a symbolic link.');
   if(row.isDirectory()){await visit(join(directory,row.name),path);continue;}
   need(row.isFile(),'DESK_SOURCE','The installed source contains a nonregular member.');
   const raw=await sourceRead(sourceRoot,path,256*1024*1024);total+=raw.length;
   need(files.length<MAX_FILES&&total<=MAX_TOTAL,'DESK_SOURCE','The complete installed source exceeds its supported bound.');
   files.push({path,...identity(raw)});
  }
 }
 await visit(sourceRoot);
 const raw=bytes({schema:'stellar-forge.odata-customer-desk-source.v1',files});
 const root=await privateDirectory(dirname(output),{create:true});await immutable(root,output.split('/').at(-1),raw);
 return {path:output,...identity(raw),files:files.length,sourceBytes:total};
}
export async function selectedSource({sourceRoot=SOURCE_ROOT,sourceManifest}){
 need(typeof sourceManifest==='string','DESK_SOURCE','Select the complete installed source manifest before packaging.');
 const path=resolve(sourceManifest),raw=await sourceRead(dirname(path),path.split('/').at(-1),32*1024*1024),value=parse(raw);
 need(Array.isArray(value.files)&&value.files.length>0&&value.files.length<=MAX_FILES,'DESK_SOURCE','Use the complete original source inventory.');
 sourceRoot=resolve(sourceRoot);need(sourceRoot===resolve(SOURCE_ROOT),'DESK_SOURCE','Package the actual executing installed source tree.');
 const files=value.files.map(descriptor),seen=new Set();
 for(const file of files){need(!seen.has(file.path),'DESK_SOURCE','The source inventory repeats a file.');seen.add(file.path);}
 const required=[PREFIX+'workspace.mjs',PREFIX+'portable.mjs',PREFIX+'server.mjs',PREFIX+'cli.mjs',PREFIX+'public/app.mjs',PREFIX+'public/index.html',PREFIX+'public/style.css',PREFIX+'OPERATOR.md',
 'stellar-forge/mcp-merchant-operator/odata-subscription-client.mjs','stellar-forge/mcp-merchant-operator/retained-download.mjs',
 'stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/customer.mjs',
 'stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/files.mjs'];
 for(const name of required)need(seen.has(name),'DESK_SOURCE','The complete installed source omits '+name);
 // The manifest is a complete leaf set, not a list of convenient witnesses.
 const actual=[];
 async function walk(directory,base=''){for(const item of await readdir(directory,{withFileTypes:true})){
  if(['.git','node_modules','__pycache__'].includes(item.name))continue;
  const name=base?base+'/'+item.name:item.name;
  need(!item.isSymbolicLink(),'DESK_SOURCE','An undeclared source link changes the executing tree.');
  if(item.isDirectory())await walk(join(directory,item.name),name);
  else if(item.isFile())actual.push(name);else need(false,'DESK_SOURCE','The selected source has a nonregular member.');
 }}
 await walk(sourceRoot);
 const manifestRelative=path.startsWith(sourceRoot+'/')?path.slice(sourceRoot.length+1):null;
 const actualSet=new Set(actual.filter(n=>n!==manifestRelative));
 need(actualSet.size===seen.size&&files.every(f=>actualSet.has(f.path)),'DESK_SOURCE','Select every file in this exact installed source tree, excluding only its own manifest.');
 let total=0;
 for(const file of files){const body=await sourceRead(sourceRoot,file.path,file.bytes);need(same(identity(body),{bytes:file.bytes,sha256:file.sha256}),'DESK_SOURCE','A selected original source differs: '+file.path);total+=file.bytes;need(total<=MAX_TOTAL,'DESK_SOURCE','The complete source exceeds one GiB.');}
 return {root:sourceRoot,raw,manifest:{bytes:raw.length,sha256:identity(raw).sha256},files};
}
export async function exportCustomerPacket({directory,output,request,sourceRoot,sourceManifest,identity:expectedSource}){
 const root=await privateDirectory(directory),destination=await privateDirectory(dirname(resolve(output)),{create:true});
 const name=output.split('/').at(-1);safe(name);
 const selected=await selectedSource({sourceRoot,sourceManifest});
 need(expectedSource&&same(selected.manifest,expectedSource),'DESK_SOURCE_CHANGED','The selected source manifest changed after the request was saved.');
 const nativeFiles=request.files.map(descriptor);let total=0;const seen=new Set();
 const files=[...nativeFiles.map(f=>({...f,path:'customer/'+f.path})),...selected.files.map(f=>({...f,path:'source/'+f.path})),{path:'provenance/source-manifest.json',...selected.manifest}];
 for(const file of files){need(!seen.has(file.path),'DESK_PORTABLE_FILE','The complete package repeats a file.');seen.add(file.path);total+=file.bytes;}
 need(files.length<=MAX_FILES&&total<=MAX_TOTAL,'DESK_PORTABLE_LIMIT','The complete output and source exceed the portable limit.');
 const header={schema:PORTABLE_SCHEMA,kind:request.kind,title:request.title,customerRevision:request.customerRevision,editionSha256:request.editionSha256,
 nativeManifest:request.manifest,sourceManifest:selected.manifest,files};
 const headerRaw=bytes(header),headerSha256=identity(headerRaw).sha256;
 const receiptName=name+'.receipt.json',existing=await maybeJSON(destination,receiptName);
 if(existing){need(existing.headerSha256===headerSha256,'DESK_PORTABLE_SELECTED','The named package selects another original output/source.');need(same(await measure(join(destination,name),2*1024*1024*1024),{bytes:existing.bytes,sha256:existing.sha256}),'DESK_PACKET_CHANGED','The selected package changed.');return existing;}
 // A completed file can outlive its receipt write. Its exact header and every byte are verified before adoption.
 try{const recovered=await inspectCustomerPacket(join(destination,name));need(recovered.headerSha256===headerSha256,'DESK_PORTABLE_SELECTED','The existing package selects another original output/source.');
 const receipt={schema:PORTABLE_SCHEMA,filename:name,headerSha256,bytes:recovered.bytes,sha256:recovered.sha256,files:files.length,nativeManifest:request.manifest};
 await atomic(destination,receiptName,receipt);return receipt;}catch(e){if(e.code!=='ENOENT')throw e;}
 const temp=join(destination,'.desk-packet-'+randomUUID()+'.partial'),handle=await open(temp,'wx',0o600),hash=createHash('sha256');let count=0;
 const write=async raw=>{hash.update(raw);count+=raw.length;await handle.writeFile(raw);};
 try{
  await write(headerRaw);
  for(const file of files){
   const inSource=file.path.startsWith('source/'),relative=file.path.slice(inSource?7:9);let offset=0;
   if(inSource||file.path==='provenance/source-manifest.json'){const raw=inSource?await sourceRead(selected.root,relative,file.bytes):selected.raw;need(same(identity(raw),{bytes:file.bytes,sha256:file.sha256}),'DESK_SOURCE','Source changed before package publication.');
    for(let i=0;i<raw.length;i+=65536){const body=raw.subarray(i,i+65536);await write(bytes({path:file.path,offset:i,bodyBase64:body.toString('base64')}));offset+=body.length;}
   }else for await(const body of chunks(await pathAt(root,relative),file)){await write(bytes({path:file.path,offset,bodyBase64:body.toString('base64')}));offset+=body.length;}
   if(file.bytes===0)await write(bytes({path:file.path,offset:0,bodyBase64:''}));
   need(offset===file.bytes,'DESK_PORTABLE_FILE','The original file length changed.');
  }
  const footer=bytes({complete:true,files:files.length,contentBytes:total});await write(footer);await handle.sync();
 }finally{await handle.close();}
 const expected={bytes:count,sha256:hash.digest('hex')};
 try{await link(temp,join(destination,name));}catch(e){if(e.code!=='EEXIST')throw e;need(same(await measure(join(destination,name),2*1024*1024*1024),expected),'DESK_PACKET_CHANGED','The existing package differs.');}
 await unlink(temp);await syncDir(destination);
 const receipt={schema:PORTABLE_SCHEMA,filename:name,headerSha256,...expected,files:files.length,nativeManifest:request.manifest};
 await atomic(destination,receiptName,receipt);return receipt;
}
async function scan(path,destination=null){
 const rawFile=await measure(path,2*1024*1024*1024),input=createReadStream(path),reader=createInterface({input,crlfDelay:Infinity});
 let header=null,index=0,current=null,handle=null,footer=false,contentBytes=0,headerSha256=null,sourceVerified=false;
 const seen=new Set();async function finish(){
  if(!current)return;need(current.offset===current.file.bytes&&current.hash.digest('hex')===current.file.sha256,'DESK_PACKET_BYTES','An original package member is incomplete or changed.');
  if(current.file.path==='provenance/source-manifest.json'){
   const source=parse(Buffer.concat(current.parts)),selected=header.files.filter(f=>f.path.startsWith('source/'));
   need(Array.isArray(source.files)&&source.files.length===selected.length,'DESK_PACKET_SOURCE','The complete original source manifest omits or adds members.');
   const named=new Map(source.files.map(f=>{descriptor(f);return [f.path,f];}));
   need(named.size===selected.length&&selected.every(f=>{const v=named.get(f.path.slice(7));return v&&v.bytes===f.bytes&&v.sha256===f.sha256;}),'DESK_PACKET_SOURCE','The supplied source differs from its original complete inventory.');
   sourceVerified=true;
  }
  if(handle){await handle.sync();await handle.close();handle=null;
   try{await link(current.temporary,current.target);}catch(e){if(e.code!=='EEXIST')throw e;await measureChecked(current.target,{bytes:current.file.bytes,sha256:current.file.sha256});}
   await unlink(current.temporary);await syncDir(dirname(current.target));
  }index++;current=null;
 }
 try{for await(const line of reader){
  need(Buffer.byteLength(line)<=(header?MAX_LINE:32*1024*1024),'DESK_PACKET_LINE','The portable frame exceeds one MiB.');const row=parse(Buffer.from(line));
  if(!header){
   header=row;need(header.schema===PORTABLE_SCHEMA&&['analysis','customer-backup'].includes(header.kind)&&Array.isArray(header.files)&&header.files.length>0&&header.files.length<=MAX_FILES,
    'DESK_PACKET_HEADER','Choose a complete customer desk output package.');
   header.files=header.files.map(descriptor);let total=0;
   for(const f of header.files){need((f.path.startsWith('customer/')||f.path.startsWith('source/')||f.path==='provenance/source-manifest.json')&&!seen.has(f.path),'DESK_PACKET_PATH','The package repeats or adds an undeclared path.');seen.add(f.path);total+=f.bytes;}
   const manifest=header.files.find(f=>f.path==='customer/'+header.nativeManifest?.path),sourceManifest=header.files.find(f=>f.path==='provenance/source-manifest.json');
   need(manifest&&manifest.bytes===header.nativeManifest.bytes&&manifest.sha256===header.nativeManifest.sha256&&sourceManifest&&sourceManifest.bytes===header.sourceManifest?.bytes&&sourceManifest.sha256===header.sourceManifest?.sha256&&sourceManifest.bytes<=32*1024*1024,'DESK_PACKET_HEADER','The selected native/source manifest identity is missing.');
   need(total<=MAX_TOTAL&&seen.has('customer/'+header.nativeManifest?.path),'DESK_PACKET_HEADER','The complete native manifest is absent or package is oversized.');
   headerSha256=identity(Buffer.from(line+'\n')).sha256;continue;
  }
  need(!footer,'DESK_PACKET_TRAILING','Data follows the original completion frame.');
  if(row.complete===true){await finish();need(index===header.files.length&&row.files===index&&row.contentBytes===contentBytes,'DESK_PACKET_INCOMPLETE','The completion frame omits original files.');footer=true;continue;}
  if(!current||row.path!==current.file.path){
   await finish();const file=header.files[index];need(file&&row.path===file.path&&row.offset===0,'DESK_PACKET_ORDER','An original file was omitted, repeated or reordered.');
   current={file,offset:0,hash:createHash('sha256'),parts:[]};
   if(destination){const target=await pathAt(destination,file.path,{create:true});let exists=false;
    try{await measureChecked(target,{bytes:file.bytes,sha256:file.sha256});exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!exists){current.target=target;current.temporary=join(dirname(target),'.desk-receive-'+randomUUID()+'.partial');handle=await open(current.temporary,'wx',0o600);}
   }
  }
  need(row.offset===current.offset&&typeof row.bodyBase64==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.bodyBase64),
   'DESK_PACKET_FRAME','The original frame offset or encoding changed.');
  const body=Buffer.from(row.bodyBase64,'base64');need(body.length<=65536&&current.offset+body.length<=current.file.bytes,'DESK_PACKET_FRAME','The original file frame is oversized.');
  current.hash.update(body);if(current.file.path==='provenance/source-manifest.json')current.parts.push(body);current.offset+=body.length;contentBytes+=body.length;if(handle)await handle.writeFile(body);
 }
 need(header&&footer&&sourceVerified&&index===header.files.length,'DESK_PACKET_INCOMPLETE','The complete native output/source package is unfinished.');
 need(same(await measure(path,2*1024*1024*1024),rawFile),'DESK_PACKET_CHANGED','The package changed during inspection.');
 return {...rawFile,header,headerSha256};
 }finally{reader.close();input.destroy();await handle?.close();}
}
export async function inspectCustomerPacket(path){return scan(resolve(path));}
export async function receiveCustomerPacket({path,expectedSha256,directory,customerDirectory}){
 need(HASH.test(expectedSha256),'DESK_PACKET_IDENTITY','Select the complete saved package SHA.');
 const selected=await inspectCustomerPacket(path);need(selected.sha256===expectedSha256,'DESK_PACKET_CHANGED','The selected package differs.');
 directory=resolve(directory);customerDirectory=resolve(customerDirectory);
 need(!customerDirectory.startsWith(directory+'/')&&!directory.startsWith(customerDirectory+'/')&&customerDirectory!==directory,
 'DESK_PACKET_DIRECTORY','Keep received source/output and native customer in separate private directories.');
 return leased(directory,async root=>{
  const intent=await maybeJSON(root,'receiving.json');
  need(!intent||intent.sha256===expectedSha256,'DESK_PACKET_SELECTED','Resume the original selected complete package.');
  if(intent)need(intent.customerDirectory===customerDirectory,'DESK_PACKET_SELECTED','Preserve the original receiving destination.');
  if(intent?.state==='COMPLETE'){
   for(const f of selected.header.files)await measureChecked(await pathAt(root,'received/'+f.path),{bytes:f.bytes,sha256:f.sha256});
   return {...intent,replayed:true};
  }
  if(!intent)await atomic(root,'receiving.json',{schema:PORTABLE_SCHEMA,state:'SELECTED',sha256:expectedSha256,customerDirectory});
  else need(intent.customerDirectory===customerDirectory,'DESK_PACKET_SELECTED','Preserve the original receiving destination.');
  // The selected full package is verified before any receiving write. Every member
  // then publishes exclusively; replay verifies completed members and continues
  // the same input without another complete staging copy.
  const received=await privateDirectory(join(root,'received'),{create:true});
  await scan(resolve(path),received);
  const source=join(root,'received/customer'),native=await client.restoreODataSubscriptionCustomer({sourceDirectory:source,customerDirectory,kind:selected.header.kind,expectedSha256:selected.header.nativeManifest.sha256});
  const customer=await client.inspectReceivedODataSubscription({directory:customerDirectory});
  need(customer.revision===selected.header.customerRevision&&customer.editionSha256===selected.header.editionSha256,'DESK_PACKET_CUSTOMER','The original native receiving differs from the packaged customer edition.');
  const result={schema:PORTABLE_SCHEMA,state:'COMPLETE',sha256:expectedSha256,customerDirectory,headerSha256:selected.headerSha256,native,customer,files:selected.header.files};
  await atomic(root,'receiving.json',result);return {...result,replayed:false};
 });
}
