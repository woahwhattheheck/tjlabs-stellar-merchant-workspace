// MIT. Complete commissioning history and native custody using the original
// immutable objects, held-file reader, edition codec and retained-stream writer.
import {open,link,unlink,readdir,lstat,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,resolve,relative,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createGzip,createGunzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {parseExactJSON} from '../../stellar-expert/exact-json.mjs';
import {privateDirectory,readOwned,syncDir} from '../../stellar-expert/store.mjs';
import {openPrivateFile,hashHeldFile,inspectRetainedFile,exportEdition,importEdition} from '../portable.mjs';
import {retainStream,retainedPath} from '../analysis/artifacts.mjs';
import {readBrowserAssets} from '../../../distribution/browser-assets.mjs';
import {identity,sha,json,stable,plain,hash,clone,fail,objectValue,saveValue,safeName} from './common.mjs';
import {validateProject,TABLES} from './history.mjs';
import {LIMITS} from './schema.mjs';
const FORMAT='stellar-forge.sensorthings-commissioning-transfer.v1',CHUNK=48*1024,META=64*1024*1024,OBJECT=256*1024*1024,EXPANDED=4*1024*1024*1024,MAX_MEMBERS=150000;
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..');
const isSame=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','uid','mode'].every(k=>a[k]===b[k]);
function count(value,max,label){if(!Number.isSafeInteger(value)||value<0||value>max)throw fail('PORTABLE_CAPACITY','The '+label+' exceeds the complete transfer capacity.',413);return value;}
function relativePath(value){
 if(typeof value!=='string'||!value||value.length>1024||value.startsWith('/')||/[\u0000-\u001f\u007f\\:]/.test(value)||value.split('/').some(x=>!x||x==='.'||x==='..'))throw fail('PORTABLE_PATH','An archive member has an unsafe relative path.',409);
 return value;
}
function decode(bytes){const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);parseExactJSON(value);return JSON.parse(value);}
function descriptor(value,max=OBJECT){
 if(!plain(value))throw fail('PORTABLE_OBJECT','Retain the original object descriptor.',409);
 hash(value.sha256);count(value.bytes,max,'object byte count');return {sha256:value.sha256,bytes:value.bytes};
}
function addObject(objects,value){
 if(!value)return;const object=descriptor(value),prior=objects.get(object.sha256);
 if(prior&&prior.bytes!==object.bytes)throw fail('PORTABLE_OBJECT','One source hash has two byte lengths.',409);objects.set(object.sha256,object);
}
/** Every historical terminal/native snapshot is part of the project closure.
 * Provider JSON bodies are opaque bytes, never recursively interpreted as
 * internal object references or as executable source. */
export async function projectObjects(store,snapshot){
 validateProject(snapshot);const objects=new Map(),editions=new Set(),records=new Map(),snapshots=new Map();
 for(const table of TABLES)for(const record of snapshot.tables[table])records.set(table+':'+identity(record),{table,record});
 for(const event of snapshot.project.history)for(const change of event.changes)records.set(change.table+':'+identity(change.record),change);
 function retainSnapshot(value){
  if(!value)return;addObject(objects,value.document);addObject(objects,value.journal);addObject(objects,value.files);
  if(value.files)snapshots.set(value.files.sha256,value.files);
 }
 for(const {table,record}of records.values()){
  if(table==='sources'){addObject(objects,record.raw);addObject(objects,record.normalized);if(record.editionId)editions.add(hash(record.editionId));}
  if(table==='mappings'){addObject(objects,record.document);addObject(objects,record.normalized);}
  if(table==='plans')addObject(objects,record.document);
  if(table==='reviews')addObject(objects,record.snapshot);
  if(table==='jobs'){addObject(objects,record.input);retainSnapshot(record.latest);}
 }
 for(const reference of snapshots.values()){
  const manifest=await objectValue(store,reference);
  if(manifest.schema!=='stellar-forge.sensorthings-commissioning-custody.v1'||!Array.isArray(manifest.members)||manifest.members.length>MAX_MEMBERS)throw fail('NATIVE_CUSTODY','A retained native file manifest is incomplete.',409);
  const paths=new Set();
  for(const member of manifest.members){
   relativePath(member.path);if(paths.has(member.path)||member.path.endsWith('.lock'))throw fail('NATIVE_CUSTODY','A native custody path is duplicated or is a live lock.',409);
   paths.add(member.path);addObject(objects,member);
  }
 }
 if(objects.size>MAX_MEMBERS)throw fail('PORTABLE_CAPACITY','The complete project object closure exceeds capacity.',413);
 const rows=[...objects.values()].sort((a,b)=>a.sha256.localeCompare(b.sha256));
 count(rows.reduce((sum,x)=>sum+x.bytes,0),EXPANDED,'project object closure');
 return {objects:rows,editionIds:[...editions].sort()};
}
async function sourceClosure(store){
 const queue=[],seen=new Set(),files=[];let total=0;
 const accepted=name=>/\.(?:mjs|cjs|js|py|json|md|txt|html|css|mts|svg|csv|toml|yaml|yml|xml|in|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|map)$/.test(name)||/^(?:LICENSE|COPYING|NOTICE|README)(?:[.-]|$)/.test(name);
 async function add(path,{directory=false,declaredAsset=false}={}){
  const full=resolve(path),rel=relative(REPO,full);if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw fail('SOURCE_CLOSURE','An editable dependency leaves the original source root.',409);
  const stat=await lstat(full);if(stat.isSymbolicLink())throw fail('SOURCE_CLOSURE','The editable source closure contains a symlink.',409);
  if(stat.isDirectory()){
   if(!directory)return;
   for(const e of (await readdir(full,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(e.name.startsWith('.')||['node_modules','__pycache__','dist','build'].includes(e.name))continue;
    if(e.isDirectory())await add(join(full,e.name),{directory:true});else if(accepted(e.name))await add(join(full,e.name));
   }return;
  }
  if(!stat.isFile()||!declaredAsset&&!accepted(basename(full)))return;if(!seen.has(full)){seen.add(full);queue.push(full);}
 }
 // Preserve the complete maintained SensorThings operator, including its
 // original launch/core/Desk entry points and every literal dependency.
 await add(resolve(HERE,'..'),{directory:true});
 for(const name of ['package.json','LICENSE','README.md'])try{await add(join(REPO,name));}catch(error){if(error.code!=='ENOENT')throw error;}
 for(let at=0;at<queue.length;at++){
  if(queue.length>10000)throw fail('SOURCE_CLOSURE','The complete editable source exceeds its declared member capacity.',413);
  const path=queue[at],before=await lstat(path,{bigint:true}),bytes=await readFile(path),after=await lstat(path,{bigint:true});
  if(!isSame(before,after)||BigInt(bytes.length)!==before.size)throw fail('SOURCE_CLOSURE','An editable source file changed while being retained.',409);
  total+=bytes.length;count(total,128*1024*1024,'editable source closure');
  const object=await store.putObject(bytes),rel=relativePath(relative(REPO,path).split('\\').join('/'));files.push({path:rel,...object});
  if(basename(path)==='browser-assets.json'){
   const assets=await readBrowserAssets(pathToFileURL(path));
   for(const entry of assets.values())await add(fileURLToPath(entry.url),{declaredAsset:true});
   if(!isSame(after,await lstat(path,{bigint:true})))throw fail('SOURCE_CLOSURE','The original browser asset manifest changed during source selection.',409);
  }
  if(/\.(?:mjs|cjs|js)$/.test(path)){
   const content=bytes.toString('utf8'),imports=new Set();
   for(const match of content.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*|require\s*\(\s*)['"](\.[^'"]+)['"]/g))imports.add(match[1]);
   for(const match of content.matchAll(/new\s+URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url/g))imports.add(match[1]);
   for(const value of imports){
    if(value.includes('$'+'{'))continue;
    const selected=resolve(dirname(path),value);
    try{await add(selected,{directory:false});}catch(error){if(error.code==='ENOENT')throw fail('SOURCE_CLOSURE','A literal original source dependency is missing: '+relative(REPO,selected),409);throw error;}
   }
  }
 }
 return files.sort((a,b)=>a.path.localeCompare(b.path));
}
function manifestIdentity(manifest){
 const body=json(manifest);count(body.length,META,'complete project manifest');return identity(manifest);
}
async function validateManifest(store,manifest){
 if(manifest?.schema!==FORMAT||typeof manifest.id!=='string'||typeof manifest.createdAt!=='string'||manifest.originalWorkspaceId!==manifest.snapshot?.project?.originWorkspaceId)throw fail('PORTABLE_MANIFEST','Select the complete original commissioning handoff.',409);
 validateProject(manifest.snapshot);
 if(manifest.snapshotSha256!==identity(manifest.snapshot)||!Array.isArray(manifest.objects)||!Array.isArray(manifest.sourceFiles)||!Array.isArray(manifest.editions))throw fail('PORTABLE_MANIFEST','The full project or source inventory differs.',409);
 const objects=new Map();for(const item of manifest.objects){if(objects.has(item.sha256))throw fail('PORTABLE_DUPLICATE','A retained object appears twice.',409);addObject(objects,item);}
 const paths=new Set();for(const source of manifest.sourceFiles){
  relativePath(source.path);if(paths.has(source.path))throw fail('PORTABLE_DUPLICATE','An editable source path repeats.',409);paths.add(source.path);
  const expected=objects.get(source.sha256);if(!expected||expected.bytes!==source.bytes)throw fail('SOURCE_CLOSURE','The editable source object is absent from the transfer inventory.',409);
 }
 const editions=new Set();
 for(const item of manifest.editions){
  hash(item.editionId);if(editions.has(item.editionId))throw fail('PORTABLE_DUPLICATE','A source edition repeats.',409);editions.add(item.editionId);
  descriptor(item.archive,LIMITS.portableBytes);safeName(item.archive.name);
 }
 count(objects.size+editions.size,MAX_MEMBERS,'transfer member count');
 count([...objects.values()].reduce((n,x)=>n+x.bytes,0)+manifest.editions.reduce((n,x)=>n+x.archive.bytes,0),EXPANDED,'complete source/native payload');
 manifestIdentity(manifest);return {objects,editions};
}
function members(manifest){
 return [...manifest.objects.map(x=>({key:'object:'+x.sha256,kind:'object',...x})),
  ...manifest.editions.map(x=>({key:'edition:'+x.editionId,kind:'edition',editionId:x.editionId,sha256:x.archive.sha256,bytes:x.archive.bytes}))];
}
async function* fileChunks(handle,size){
 const b=Buffer.alloc(CHUNK);let offset=0;while(offset<size){const q=await handle.read(b,0,Math.min(b.length,size-offset),offset);if(!q.bytesRead)throw fail('PORTABLE_TRUNCATED','The retained file ended before its complete byte count.',409);offset+=q.bytesRead;yield Buffer.from(b.subarray(0,q.bytesRead));}
}
export async function exportProject(store,{snapshot,edition,id,createdAt,label}){
 validateProject(snapshot);
 const directory=await privateDirectory(join(store.root,'exports',safeName(id)),{create:true}),selectionPath=join(directory,'commissioning-selection.json');
 let selection;
 try{selection=decode(await readOwned(selectionPath,META));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!selection){
  const closure=await projectObjects(store,snapshot),originalSources=[];
  for(const editionId of closure.editionIds){
   const selected=await edition(editionId),reviews=store.read().reviews.filter(x=>x.editionId===editionId),
    receipt=await exportEdition(store,{edition:selected,reviews,id:'commissioning-source-'+identity({id,editionId}).slice(0,48),createdAt});
   originalSources.push({editionId,receipt,archive:{name:receipt.file.filename,...receipt.file}});
  }
  const sourceFiles=await sourceClosure(store),objects=new Map(closure.objects.map(x=>[x.sha256,x]));
  for(const item of sourceFiles)addObject(objects,item);
  const manifest={schema:FORMAT,id,createdAt,label,originalWorkspaceId:snapshot.project.originWorkspaceId,snapshot:clone(snapshot),snapshotSha256:identity(snapshot),
   objects:[...objects.values()].sort((a,b)=>a.sha256.localeCompare(b.sha256)),sourceFiles,
   editions:originalSources.map(({editionId,archive})=>({editionId,archive})),
   meaning:'Complete selected project history, original source edition archives, exact native files and editable application source. Host tokens and environment values are not source. Pending received jobs require explicit local target binding.'};
  await validateManifest(store,manifest);
  selection={schema:'stellar-forge.sensorthings-commissioning-export-selection.v1',id,createdAt,manifest,originalSources};
  // Bank the exact source and review edition before the first stream plan.
  // Recovery keeps that selection even when installed application files advance.
  await store.immutable(selectionPath,json(selection));await syncDir(directory);
 }
 const {manifest,originalSources}=selection;
 if(selection.schema!=='stellar-forge.sensorthings-commissioning-export-selection.v1'||selection.id!==id||selection.createdAt!==createdAt||
    manifest?.id!==id||manifest.createdAt!==createdAt||manifest.label!==label||manifest.snapshotSha256!==identity(snapshot)||stable(manifest.snapshot)!==stable(snapshot)||
    !Array.isArray(originalSources))throw fail('PORTABLE_REPLAY','The retained original export selection belongs to another request or project edition.',409);
 await validateManifest(store,manifest);
 if(stable(originalSources.map(({editionId,archive})=>({editionId,archive})))!==stable(manifest.editions))throw fail('PORTABLE_REPLAY','The retained original source archive selection differs.',409);
 const manifestSha256=manifestIdentity(manifest),locations=new Map();
 for(const source of originalSources){
  if(source.receipt?.file?.sha256!==source.archive.sha256||source.receipt.file.bytes!==source.archive.bytes)throw fail('PORTABLE_REPLAY','An original source receipt differs from the retained archive.',409);
  const expectedId='commissioning-source-'+identity({id,editionId:source.editionId}).slice(0,48);
  if(source.receipt.id!==expectedId)throw fail('PORTABLE_REPLAY','The retained source export belongs to another original operation.',409);
  const path=join(store.root,'exports',safeName(source.receipt.id),safeName(source.archive.name));
  await inspectRetainedFile(path,{expectedBytes:source.archive.bytes,expectedSha256:source.archive.sha256,maximum:LIMITS.portableBytes});
  locations.set('edition:'+source.editionId,path);
 }
 async function* lines(){
  yield Buffer.from(JSON.stringify({kind:'manifest',manifest})+'\n');
  for(const member of members(manifest)){
   const path=member.kind==='object'?join(store.root,'objects',member.sha256):locations.get(member.key),
    held=await openPrivateFile(path,{expectedBytes:member.bytes,maximum:member.kind==='object'?OBJECT:LIMITS.portableBytes}),digest=createHash('sha256');let offset=0;
   try{
    yield Buffer.from(JSON.stringify({kind:'member',member})+'\n');
    for await(const chunk of fileChunks(held.handle,member.bytes)){
     digest.update(chunk);yield Buffer.from(JSON.stringify({kind:'chunk',key:member.key,offset,bytes:chunk.length,base64:chunk.toString('base64')})+'\n');offset+=chunk.length;
    }
    if(!isSame(held.identity,await held.handle.stat({bigint:true}))||digest.digest('hex')!==member.sha256)throw fail('PORTABLE_CHANGED','An original retained member changed during export.',409);
    yield Buffer.from(JSON.stringify({kind:'end',key:member.key,bytes:member.bytes})+'\n');
   }finally{await held.handle.close();}
  }
  yield Buffer.from(JSON.stringify({kind:'complete',manifestSha256,members:members(manifest).length})+'\n');
 }
 const input=Readable.from(lines()),gzip=createGzip({level:6});input.on('error',e=>gzip.destroy(e));gzip.on('error',()=>input.destroy());input.pipe(gzip);
 let file;try{file=await retainStream(store,gzip,{operationId:id,createdAt,filename:'commissioning-'+snapshot.project.id.slice(0,16)+'-r'+snapshot.project.sequence+'.ndjson.gz',
  type:'application/gzip',inputIdentity:{manifestSha256},maximum:LIMITS.portableBytes});}finally{input.destroy();gzip.destroy();}
 const saved=await saveValue(store,manifest);
 return {file,manifest:{...saved,identity:manifestSha256,projectId:snapshot.project.id,sequence:snapshot.project.sequence,objects:manifest.objects.length,sourceFiles:manifest.sourceFiles.length,editions:manifest.editions.length}};
}
async function* readLines(handle){
 const input=handle.createReadStream({autoClose:false,start:0}),gunzip=createGunzip();let produced=0,pending=Buffer.alloc(0);
 input.on('error',e=>gunzip.destroy(e));gunzip.on('error',()=>input.destroy());input.pipe(gunzip);
 try{
  for await(const chunk of gunzip){
   produced+=chunk.length;if(produced>EXPANDED*1.5+META)throw fail('PORTABLE_CAPACITY','The expanded transfer exceeds its original capacity.',413);
   pending=pending.length?Buffer.concat([pending,chunk]):chunk;let at;
   while((at=pending.indexOf(10))>=0){
    const line=pending.subarray(0,at);pending=pending.subarray(at+1);
    if(!line.length||line.length>META)throw fail('PORTABLE_LINE','The complete transfer line has an invalid size.',413);yield decode(line);
   }
   if(pending.length>META)throw fail('PORTABLE_CAPACITY','A transfer metadata line exceeds capacity.',413);
  }
  if(pending.length)throw fail('PORTABLE_TRUNCATED','The transfer ends inside an original record.',409);
 }finally{input.destroy();gunzip.destroy();}
}
async function keepArchive(store,source,{id,createdAt,expectedBytes,expectedSha256}){
 const retained=join(store.root,'exports',id,'received-commissioning.ndjson.gz');
 try{
  const receipt=decode(await readOwned(retained+'.receipt.json',65536));
  const plan={schema:'stellar-forge.sensorthings-analysis-file-plan.v1',operationId:id,createdAt,filename:'received-commissioning.ndjson.gz',type:'application/gzip',inputIdentity:{expectedBytes,expectedSha256}};
  if(receipt.planSha256!==identity(plan)||receipt.file.sha256!==expectedSha256||receipt.file.bytes!==expectedBytes)throw fail('PORTABLE_REPLAY','The retained original archive receipt differs.',409);
  await inspectRetainedFile(retained,{expectedBytes,expectedSha256,maximum:LIMITS.portableBytes});return receipt.file;
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const held=await openPrivateFile(source,{expectedBytes,maximum:LIMITS.portableBytes});
 try{
  await hashHeldFile(held.handle,{expectedBytes,expectedSha256,maximum:LIMITS.portableBytes});
  const file=await retainStream(store,fileChunks(held.handle,expectedBytes),{operationId:id,createdAt,filename:'received-commissioning.ndjson.gz',
   type:'application/gzip',inputIdentity:{expectedBytes,expectedSha256},maximum:LIMITS.portableBytes});
  if(file.sha256!==expectedSha256||file.bytes!==expectedBytes||!isSame(held.identity,await held.handle.stat({bigint:true})))throw fail('PORTABLE_CHANGED','The original incoming archive changed while being retained.',409);
  return file;
 }finally{await held.handle.close();}
}
export async function importProject(store,{inboxDirectory,filename,expectedSha256,expectedBytes,id,createdAt}){
 hash(expectedSha256,'archive SHA256');count(expectedBytes,LIMITS.portableBytes,'archive');if(!expectedBytes)throw fail('PORTABLE_EMPTY','Select the complete original package.');
 safeName(filename);await privateDirectory(inboxDirectory);
 const archive=await keepArchive(store,join(inboxDirectory,filename),{id,createdAt,expectedBytes,expectedSha256}),archivePath=retainedPath(store,archive),
  directory=await privateDirectory(join(store.root,'exports',id,'commissioning-receive'),{create:true}),receiptPath=join(directory,'received.json');
 try{
  const prior=decode(await readOwned(receiptPath,META));
  if(prior.id!==id||prior.createdAt!==createdAt||prior.archive.sha256!==expectedSha256||prior.archive.bytes!==expectedBytes)throw fail('PORTABLE_REPLAY','The same receiving operation selects a different archive.',409);
  const manifest=await objectValue(store,prior.manifest);await validateManifest(store,manifest);
  const closure=await projectObjects(store,manifest.snapshot),inventory=new Map(manifest.objects.map(x=>[x.sha256,x]));
  for(const object of closure.objects)if(inventory.get(object.sha256)?.bytes!==object.bytes)throw fail('PORTABLE_CLOSURE','A received project object is absent from its original inventory.',409);
  for(const object of manifest.objects)await inspectRetainedFile(join(store.root,'objects',object.sha256),{expectedBytes:object.bytes,expectedSha256:object.sha256,maximum:OBJECT});
  for(const source of manifest.editions)await store.edition(source.editionId);
  return {...prior,snapshot:manifest.snapshot,editionIds:manifest.editions.map(x=>x.editionId)};
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const attempt=await privateDirectory(join(directory,'attempt-'+randomUUID()),{create:true}),held=await openPrivateFile(archivePath,{expectedBytes,maximum:LIMITS.portableBytes});
 let manifest=null,expected=null,position=0,current=null,complete=false;const staged=new Map();
 try{
  for await(const row of readLines(held.handle)){
   if(complete)throw fail('PORTABLE_TRAILING','The complete transfer contains trailing records.',409);
   if(!manifest){
    if(row.kind!=='manifest')throw fail('PORTABLE_HEADER','The original manifest must be first.',409);
    manifest=row.manifest;await validateManifest(store,manifest);expected=members(manifest);continue;
   }
   if(row.kind==='member'){
    if(current||position>=expected.length||stable(row.member)!==stable(expected[position]))throw fail('PORTABLE_ORDER','The complete original member order differs.',409);
    const member=expected[position],path=join(attempt,'member-'+identity(member.key));
    const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    current={member,path,file,bytes:0,digest:createHash('sha256')};continue;
   }
   if(row.kind==='chunk'){
    if(!current||row.key!==current.member.key||row.offset!==current.bytes||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>CHUNK||typeof row.base64!=='string')throw fail('PORTABLE_CHUNK','An original chunk loses its member or offset binding.',409);
    const bytes=Buffer.from(row.base64,'base64');if(bytes.length!==row.bytes||bytes.toString('base64')!==row.base64||current.bytes+bytes.length>current.member.bytes)throw fail('PORTABLE_CHUNK','The original complete chunk bytes differ.',409);
    await current.file.writeFile(bytes);current.digest.update(bytes);current.bytes+=bytes.length;continue;
   }
   if(row.kind==='end'){
    if(!current||row.key!==current.member.key||row.bytes!==current.bytes||current.bytes!==current.member.bytes||current.digest.digest('hex')!==current.member.sha256)throw fail('PORTABLE_MEMBER','An original source or native member is incomplete.',409);
    await current.file.sync();await current.file.close();staged.set(current.member.key,{...current.member,path:current.path});current=null;position++;continue;
   }
   if(row.kind==='complete'){
    if(current||position!==expected.length||row.members!==expected.length||row.manifestSha256!==manifestIdentity(manifest))throw fail('PORTABLE_COMPLETE','The complete package marker differs from its retained inventory.',409);
    complete=true;continue;
   }
   throw fail('PORTABLE_RECORD','The incoming archive has an unknown record.',409);
  }
  if(!complete||!isSame(held.identity,await held.handle.stat({bigint:true})))throw fail('PORTABLE_TRUNCATED','The retained complete package is truncated or changed.',409);
 }finally{if(current)await current.file.close().catch(()=>{});await held.handle.close();}
 for(const member of staged.values())if(member.kind==='object'){
  const target=join(store.root,'objects',member.sha256);try{await link(member.path,target);}catch(error){if(error.code!=='EEXIST')throw error;}
  await inspectRetainedFile(target,{expectedBytes:member.bytes,expectedSha256:member.sha256,maximum:OBJECT});
 }
 await syncDir(join(store.root,'objects'));
 const closure=await projectObjects(store,manifest.snapshot),inventory=new Map(manifest.objects.map(x=>[x.sha256,x]));
 for(const object of closure.objects)if(inventory.get(object.sha256)?.bytes!==object.bytes)throw fail('PORTABLE_CLOSURE','A declared historical project object is absent from its complete archive.',409);
 if(stable(closure.editionIds)!==stable(manifest.editions.map(x=>x.editionId).sort()))throw fail('PORTABLE_CLOSURE','The original source-edition closure differs from the selected project.',409);
 const sourceReceipts=[];
 for(const source of manifest.editions){
  const original=staged.get('edition:'+source.editionId),name='source-'+source.editionId+'.ndjson.gz',target=join(attempt,name);
  await link(original.path,target);
  const received=await importEdition(store,{inboxDirectory:attempt,filename:name,expectedBytes:source.archive.bytes,expectedSha256:source.archive.sha256,
   id:'commissioning-import-'+identity({id,editionId:source.editionId}).slice(0,48),createdAt});
  if(received.editionId!==source.editionId)throw fail('PORTABLE_EDITION','The native edition importer returned another original source identity.',409);
  sourceReceipts.push(received);
 }
 const savedManifest=await saveValue(store,manifest),receipt={schema:'stellar-forge.sensorthings-commissioning-receiving.v1',id,createdAt,archive,
  manifest:{...savedManifest,identity:manifestIdentity(manifest)},projectId:manifest.snapshot.project.id,sourceReceipts};
 await store.immutable(receiptPath,json(receipt));await syncDir(directory);
 for(const member of staged.values())await unlink(member.path);
 for(const source of manifest.editions)await unlink(join(attempt,'source-'+source.editionId+'.ndjson.gz'));
 return {...receipt,snapshot:manifest.snapshot,editionIds:manifest.editions.map(x=>x.editionId)};
}
