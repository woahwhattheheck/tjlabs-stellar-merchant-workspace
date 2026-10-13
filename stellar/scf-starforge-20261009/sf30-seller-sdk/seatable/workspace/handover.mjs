// MIT. Complete private SeaTable workspaces, streamed and independently received.
import {DatabaseSync} from 'node:sqlite';
import {constants} from 'node:fs';
import {open,lstat,readdir,mkdir,rename,unlink,realpath,chmod,rm} from 'node:fs/promises';
import {join,dirname,relative,isAbsolute,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {absolute,privateDirectory,readPrivate,readJson,bytes,digest,identity,hashPrivate,
  createFile,atomicJson,syncDirectory,acquireWorkspace,fault,stamp} from '../../postgres/publisher/files.mjs';
import {makeSeaTablePlacement,readSeaTablePlacement} from './placement.mjs';
import {installDatasetReleaseStore,readReleaseState,listReleases} from '../../../sf82-seller-pilot/releases.mjs';

import {acquireDatasetLease} from '../../dataset-refresh/writer-lease.mjs';
export const MAX_WORKSPACE_BYTES=32*1024*1024*1024;
export const WORKSPACE_CHUNK_BYTES=1024*1024;
const MAX_MANIFEST=32*1024*1024,MAX_FILES=100000,MAGIC=Buffer.from('STWH0001\n');
const SCHEMA='stellar-forge.seatable-workspace-handover.v1',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{64}$/;
const ROOTS=['INIT.json','sources.sqlite','current-source.json','inputs','captures','previews','versions','interrupted','publisher','deployments','workspace-placement.json','workspace-history'];
const SKIP=new Set(['publisher.lock','writer.lock','writer.lease','control.sock','control.json','run.lock','state.lock','.sf82-state.lock.lifetime','.sf82-run.lock.lifetime','runtime.json','pilot-runtime.json']);
export const workspaceRequestId=id=>{if(!UUID.test(id??''))throw fault('SEATABLE_WORKSPACE_REQUEST_REQUIRED');return id;};
export const workspaceName=name=>{if(!/^[a-z][a-z0-9_-]{0,47}$/.test(name??''))throw fault('SEATABLE_WORKSPACE_NAME_REQUIRED');return name;};
const absent=async path=>{try{await lstat(path);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}};
const member=p=>{if(typeof p!=='string'||!p||p.startsWith('/')||p.includes('\\')||/[\u0000-\u001f\u007f]/.test(p)||p.split('/').some(x=>!x||x==='.'||x==='..'))throw fault('SEATABLE_WORKSPACE_MEMBER_INVALID');return p;};
const stableStat=s=>[String(s.dev),String(s.ino),String(s.size),String(s.mtimeNs),String(s.ctimeNs)].join(':');
async function make(path){await privateDirectory(path,true);}
async function sameFile(path,expected){const got=await hashPrivate(path,expected.bytes+1);if(got.bytes!==expected.bytes||got.hash!==expected.sha256)throw fault('SEATABLE_WORKSPACE_FILE_CHANGED');return got;}
async function immutable(path,content){try{await createFile(path,content);}catch(e){if(e.code!=='EEXIST')throw e;const old=await readPrivate(path,Math.max(MAX_MANIFEST,content.length));if(!old.equals(content))throw fault('SEATABLE_WORKSPACE_REQUEST_CHANGED',undefined,409);}}
async function exactWrite(handle,chunk,position){let offset=0;while(offset<chunk.length){const r=await handle.write(chunk,offset,chunk.length-offset,position===null?null:position+offset);if(!r.bytesWritten)throw fault('SEATABLE_WORKSPACE_WRITE_INTERRUPTED');offset+=r.bytesWritten;}}
async function copyExact(from,to,expected){
  if(!await absent(to)){await sameFile(to,expected);return;}
  await make(dirname(to));const temp=to+'.partial-'+randomUUID();let input,output;
  try{input=await open(from,constants.O_RDONLY|constants.O_NOFOLLOW);const before=await input.stat({bigint:true});
    if(!before.isFile()||before.nlink!==1n||before.mode&0o077n||before.size!==BigInt(expected.bytes))throw fault('SEATABLE_WORKSPACE_FILE_CHANGED');
    output=await open(temp,'wx',0o600);const hash=createHash('sha256');let total=0;
    for await(const chunk of input.createReadStream({autoClose:false,highWaterMark:WORKSPACE_CHUNK_BYTES})){total+=chunk.length;hash.update(chunk);await exactWrite(output,chunk,null);}
    if(total!==expected.bytes||hash.digest('hex')!==expected.sha256||stableStat(before)!==stableStat(await input.stat({bigint:true})))throw fault('SEATABLE_WORKSPACE_FILE_CHANGED');
    await output.sync();await output.close();output=null;await rename(temp,to);await syncDirectory(dirname(to));
  }finally{await input?.close();await output?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function inventory(root,prefix,files){
  await privateDirectory(root);
  for(const entry of (await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(SKIP.has(entry.name))continue;
    const path=join(root,entry.name),name=member(prefix?prefix+'/'+entry.name:entry.name),s=await lstat(path);
    if(s.isSymbolicLink())throw fault('SEATABLE_WORKSPACE_SYMLINK');
    if(s.isDirectory())await inventory(path,name,files);
    else if(s.isFile()){if(files.length>=MAX_FILES)throw fault('SEATABLE_WORKSPACE_TOO_MANY_FILES');const h=await hashPrivate(path,MAX_WORKSPACE_BYTES);files.push({path:name,bytes:h.bytes,sha256:h.hash,source:path});}
    else throw fault('SEATABLE_WORKSPACE_SPECIAL_FILE');
  }
}
async function sourceFiles(directory,settings){
  const files=[];
  for(const name of ROOTS){const path=join(directory,name);if(await absent(path))continue;const s=await lstat(path);
    if(s.isDirectory())await inventory(path,name,files);else if(s.isFile()&&!s.isSymbolicLink()){const h=await hashPrivate(path,MAX_WORKSPACE_BYTES);files.push({path:name,bytes:h.bytes,sha256:h.hash,source:path});}else throw fault('SEATABLE_WORKSPACE_SPECIAL_FILE');}
  if(!await absent(settings.targetDirectory))await inventory(settings.targetDirectory,'dataset',files);
  if(!files.some(f=>f.path==='sources.sqlite')||!files.some(f=>f.path==='INIT.json'))throw fault('SEATABLE_WORKSPACE_SOURCE_INCOMPLETE');
  files.sort((a,b)=>a.path.localeCompare(b.path));
  if(new Set(files.map(f=>f.path)).size!==files.length||files.reduce((n,f)=>n+f.bytes,0)>MAX_WORKSPACE_BYTES)throw fault('SEATABLE_WORKSPACE_SIZE_LIMIT');
  return files;
}
function checkManifest(m){
  if(m?.schema!==SCHEMA||!UUID.test(m.id??'')||!Array.isArray(m.files)||m.files.length<2||m.files.length>MAX_FILES||
    !m.source||!m.settings||!m.counts)throw fault('SEATABLE_WORKSPACE_MANIFEST_INVALID');
  absolute(m.source.directory);absolute(m.settings.targetDirectory);
  const seen=new Set();let total=0;
  for(const f of m.files){member(f.path);if(![...ROOTS,'dataset'].includes(f.path.split('/')[0])||f.path.split('/').some(p=>SKIP.has(p)))throw fault('SEATABLE_WORKSPACE_MANIFEST_INVALID');if(seen.has(f.path)||!SHA.test(f.sha256??'')||!Number.isSafeInteger(f.bytes)||f.bytes<0)throw fault('SEATABLE_WORKSPACE_MANIFEST_INVALID');seen.add(f.path);total+=f.bytes;}
  if(!seen.has('sources.sqlite')||!seen.has('INIT.json')||total>MAX_WORKSPACE_BYTES||total!==m.contentBytes)throw fault('SEATABLE_WORKSPACE_MANIFEST_INVALID');
  return m;
}
async function archiveHeader(handle){
  const header=Buffer.alloc(MAGIC.length+4);let n=0;while(n<header.length){const r=await handle.read(header,n,header.length-n,n);if(!r.bytesRead)throw fault('SEATABLE_WORKSPACE_ARCHIVE_TRUNCATED');n+=r.bytesRead;}
  if(!header.subarray(0,MAGIC.length).equals(MAGIC))throw fault('SEATABLE_WORKSPACE_ARCHIVE_FORMAT');
  const length=header.readUInt32BE(MAGIC.length);if(length<2||length>MAX_MANIFEST)throw fault('SEATABLE_WORKSPACE_MANIFEST_SIZE');
  const content=Buffer.alloc(length);n=0;while(n<length){const r=await handle.read(content,n,length-n,header.length+n);if(!r.bytesRead)throw fault('SEATABLE_WORKSPACE_ARCHIVE_TRUNCATED');n+=r.bytesRead;}
  let manifest;try{manifest=checkManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content)));}catch(e){if(e.code)throw e;throw fault('SEATABLE_WORKSPACE_MANIFEST_INVALID');}
  return {manifest,content,offset:header.length+length,manifestSha256:digest(content)};
}
export async function inspectSeaTableWorkspaceArchive(file,expectedSha256){
  absolute(file);if(expectedSha256!==undefined&&!SHA.test(expectedSha256))throw fault('SEATABLE_WORKSPACE_HASH_REQUIRED');
  const h=await hashPrivate(file,MAX_WORKSPACE_BYTES+MAX_MANIFEST+MAGIC.length+4);
  if(expectedSha256&&h.hash!==expectedSha256)throw fault('SEATABLE_WORKSPACE_ARCHIVE_CHANGED',undefined,409);
  const input=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const v=await archiveHeader(input);if(v.offset+v.manifest.contentBytes!==h.bytes)throw fault('SEATABLE_WORKSPACE_ARCHIVE_LENGTH');
    return {...v,bytes:h.bytes,sha256:h.hash};}finally{await input.close();}
}
function folder(directory,kind,id){workspaceRequestId(id);return join(directory,'.workspace-transfers',kind,id);}
async function receipt(directory,kind,id){try{return await readJson(join(folder(directory,kind,id),'receipt.json'),MAX_MANIFEST);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export const workspaceTransferStatus=(directory,kind,id)=>receipt(directory,kind,id);
export async function workspaceTransferList(directory,kind){
  const root=join(directory,'.workspace-transfers',kind);if(await absent(root))return[];
  const result=[];for(const name of await readdir(root)){if(!UUID.test(name))continue;const r=await receipt(directory,kind,name);if(r)result.push(r);}return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
async function begin(directory,kind,id,input){
  const root=folder(directory,kind,id);await make(root);const old=await receipt(directory,kind,id);
  if(old){if(identity(old.input)!==identity(input))throw fault('SEATABLE_WORKSPACE_REQUEST_CHANGED','Replay the original complete transfer input.',409);return{root,value:old};}
  const value={id,kind,input:structuredClone(input),status:'pending',createdAt:stamp(),result:null,error:null};await atomicJson(root,'receipt.json',value);return{root,value};
}
async function finish(root,value,result){const done={...value,status:'complete',result,error:null};await atomicJson(root,'receipt.json',done);return result;}
async function interrupted(root,value,e){await atomicJson(root,'receipt.json',{...value,status:'interrupted',error:{code:e.code??'SEATABLE_WORKSPACE_IO',message:e.code?e.message:'The original transfer can be resumed.'}});}
async function writeArchive(snapshot,manifest,file){
  const original=bytes(manifest);if(original.length>MAX_MANIFEST)throw fault('SEATABLE_WORKSPACE_MANIFEST_SIZE');
  const header=Buffer.alloc(MAGIC.length+4);MAGIC.copy(header);header.writeUInt32BE(original.length,MAGIC.length);
  const temp=file+'.partial-'+randomUUID();let out;
  try{out=await open(temp,'wx',0o600);const hash=createHash('sha256');let total=0;
    const write=async b=>{hash.update(b);total+=b.length;await exactWrite(out,b,null);};await write(header);await write(original);
    for(const f of manifest.files){const src=await open(join(snapshot,f.path),constants.O_RDONLY|constants.O_NOFOLLOW);try{const h=createHash('sha256');let n=0;
      for await(const chunk of src.createReadStream({autoClose:false,highWaterMark:WORKSPACE_CHUNK_BYTES})){h.update(chunk);n+=chunk.length;await write(chunk);}
      if(n!==f.bytes||h.digest('hex')!==f.sha256)throw fault('SEATABLE_WORKSPACE_FILE_CHANGED');
    }finally{await src.close();}}
    await out.sync();await out.close();out=null;await rename(temp,file);await syncDirectory(dirname(file));return {bytes:total,sha256:hash.digest('hex'),manifestSha256:digest(original)};
  }finally{await out?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
/** Caller holds the authoring writer, stopped publisher/SF82 and dataset leases. */
export async function createSeaTableWorkspaceHandover({directory,settings,source,counts,requestId,expectedDraftRevision,expectedSelectedVersion}){
  const input={requestId,expectedDraftRevision,expectedSelectedVersion};
  const existing=await receipt(directory,'exports',requestId);
  if(!existing&&(source.draftRevision!==expectedDraftRevision||source.selectedVersion!==expectedSelectedVersion))
    throw fault('SEATABLE_WORKSPACE_REVIEW_CHANGED','Review the current draft and selected version.',409);
  const opened=await begin(directory,'exports',requestId,input),{root,value}=opened;
  if(value.status==='complete'){await sameFile(join(root,'workspace.stwh'),value.result);return value.result;}
  try{let manifest;const manifestFile=join(root,'manifest.json'),snapshot=join(root,'snapshot');
    if(!await absent(manifestFile)){manifest=checkManifest(await readJson(manifestFile,MAX_MANIFEST));}
    else{if(source.draftRevision!==expectedDraftRevision||source.selectedVersion!==expectedSelectedVersion)throw fault('SEATABLE_WORKSPACE_REVIEW_CHANGED','Review the current draft and selected version.',409);
      for(const kind of ['exports','receives'])for(const prior of await workspaceTransferList(directory,kind)){
        if(prior.id===requestId&&kind==='exports')continue;
        const history=join(directory,'workspace-history','transfers',kind);await make(history);await atomicJson(history,prior.id+'.json',prior);
      }
      const files=await sourceFiles(directory,settings);manifest={schema:SCHEMA,id:requestId,createdAt:value.createdAt,source,settings,counts,
        contentBytes:files.reduce((n,f)=>n+f.bytes,0),files:files.map(({source,...f})=>f)};
      await immutable(manifestFile,bytes(manifest));await make(snapshot);
    }
    for(const f of manifest.files){const from=f.path.startsWith('dataset/')?join(settings.targetDirectory,f.path.slice(8)):join(directory,f.path);await copyExact(from,join(snapshot,f.path),f);}
    const archive=await writeArchive(snapshot,manifest,join(root,'workspace.stwh'));
    return finish(root,value,{id:requestId,filename:'seatable-workspace-'+requestId+'.stwh',...archive,source:manifest.source,counts:manifest.counts});
  }catch(e){try{await interrupted(root,value,e);}catch(persist){e.persistenceCode=persist.code??'SEATABLE_WORKSPACE_RECEIPT_WRITE';}throw e;}
}
export async function seaTableWorkspaceHandoverFile(directory,id){
  const r=await receipt(directory,'exports',id);if(r?.status!=='complete')throw fault('SEATABLE_WORKSPACE_EXPORT_NOT_COMPLETE',undefined,409);
  const path=join(folder(directory,'exports',id),'workspace.stwh');await sameFile(path,r.result);return{...r.result,path,mime:'application/octet-stream'};
}
async function unpackArchive(file,selected,target){
  const input=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);let position=selected.offset;
  try{const before=await input.stat({bigint:true});for(const f of selected.manifest.files){
    const destination=join(target,member(f.path));await make(dirname(destination));
    if(!await absent(destination)){await sameFile(destination,f);position+=f.bytes;continue;}
    const temp=destination+'.partial-'+randomUUID();let out;try{out=await open(temp,'wx',0o600);let left=f.bytes;const hash=createHash('sha256'),buffer=Buffer.alloc(WORKSPACE_CHUNK_BYTES);
      while(left){const n=Math.min(left,buffer.length),r=await input.read(buffer,0,n,position);if(!r.bytesRead)throw fault('SEATABLE_WORKSPACE_ARCHIVE_TRUNCATED');
        const chunk=buffer.subarray(0,r.bytesRead);hash.update(chunk);await exactWrite(out,chunk,null);position+=r.bytesRead;left-=r.bytesRead;}
      if(hash.digest('hex')!==f.sha256)throw fault('SEATABLE_WORKSPACE_MEMBER_CHANGED');await out.sync();await out.close();out=null;
      await rename(temp,destination);await syncDirectory(dirname(destination));
    }finally{await out?.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }if(stableStat(before)!==stableStat(await input.stat({bigint:true})))throw fault('SEATABLE_WORKSPACE_ARCHIVE_CHANGED');
  }finally{await input.close();}
}
async function placeReceived(target,final,selected,requestId){
  const manifest=selected.manifest,history=join(target,'workspace-history','receiving',requestId);await make(history);
  await immutable(join(history,'manifest.json'),selected.content);
  let originalSettings;const originalFile=join(history,'original-settings.json');
  if(!await absent(originalFile))originalSettings=await readJson(originalFile,1048576);
  const init=originalSettings?.init??await readJson(join(target,'INIT.json')),database=join(target,'sources.sqlite');let db,primary;
  try{db=new DatabaseSync(database);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL');
    const integrity=db.prepare('PRAGMA quick_check').get();if(!Object.values(integrity).every(x=>x==='ok'))throw fault('SEATABLE_WORKSPACE_DATABASE_INVALID');
    const schemas=db.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('view','trigger')").all();if(schemas.length)throw fault('SEATABLE_WORKSPACE_DATABASE_SCHEMA');
    const stored=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data),original=originalSettings?.settings??stored;
    if(original.schema!=='stellar-forge.seatable-authoring.v1'||original.sourceFile!==join(manifest.source.directory,'current-source.json')||
      original.publisherDirectory!==join(manifest.source.directory,'publisher')||original.targetDirectory!==manifest.settings.targetDirectory)throw fault('SEATABLE_WORKSPACE_SOURCE_BINDING');
    await immutable(originalFile,bytes({init,settings:original}));
    const validStored=identity(stored)===identity(original)||identity(stored)===identity({...original,targetDirectory:join(final,'dataset'),sourceFile:join(final,'current-source.json'),publisherDirectory:join(final,'publisher')});if(!validStored)throw fault('SEATABLE_WORKSPACE_SOURCE_BINDING');
    const local={...original,targetDirectory:join(final,'dataset'),sourceFile:join(final,'current-source.json'),publisherDirectory:join(final,'publisher')};
    db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(local));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   }catch(e){primary=e;throw e;}finally{if(db){try{db.close();}catch(e){let active=db;const close=async()=>{if(active){active.close();active=null;}};const issue=primary??e;Object.defineProperty(issue,'seaTableCleanup',{value:{close},enumerable:false,configurable:true});issue.cleanupCode=e.code??'SEATABLE_CLOSE_FAILED';if(!primary)throw issue;}}}
  await atomicJson(target,'INIT.json',{...init,directory:final,targetDirectory:join(final,'dataset')});
  let prior=null;const priorFile=join(history,'original-placement.json');
  if(!await absent(priorFile))prior=await readJson(priorFile);
  else{try{prior=await readJson(join(target,'workspace-placement.json'));}catch(e){if(e.code!=='ENOENT')throw e;}await immutable(priorFile,bytes(prior));}
  await atomicJson(target,'workspace-placement.json',makeSeaTablePlacement({directory:final,originalDirectory:manifest.source.directory,
    originalTargetDirectory:manifest.settings.targetDirectory,prior,manifestSha256:selected.manifestSha256,requestId}));
  const publisher=join(target,'publisher');if(!await absent(join(publisher,'workspace.json'))){const retained=join(history,'original-publisher-workspace.json');
    const original=await readPrivate(!await absent(retained)?retained:join(publisher,'workspace.json'),4096);
    await immutable(retained,original);
    const value=JSON.parse(original);await atomicJson(publisher,'workspace.json',{...value,pathBase:'workspace',sourceFile:'../current-source.json',targetDirectory:'../dataset'});}
  await immutable(join(history,'archive.json'),bytes({sha256:selected.sha256,bytes:selected.bytes,manifestSha256:selected.manifestSha256,requestId}));
  await syncDirectory(target);
}
async function installReceivedDatasets(directory,requestId,selected){
  const root=join(directory,'deployments','releases');if(await absent(root))return;
  const state=await readReleaseState(root),catalog=await listReleases(root);
  if(catalog.errors?.length)throw fault('SEATABLE_WORKSPACE_RELEASE_INVALID');
  if(!(catalog.releases??[]).some(r=>r.dataset))return state;
  const datasetDirectory=join(directory,'dataset'),dataset=await readJson(join(datasetDirectory,'state.json'));
  const manifestFile=join(directory,'workspace-history','receiving',requestId,'manifest.json');
  for(const release of catalog.releases??catalog){if(!release.dataset)continue;
    const path=join(root,'releases',release.id);
    // Prior machine placements stay in history; only this local pointer is replaced.
    const pointer=join(path,'dataset-installation.json');let previous=null;
    if(!await absent(pointer)){const old=await readJson(pointer);previous=identity(old);}
    await installDatasetReleaseStore(root,release.id,{expectedExecutionSha256:release.dataset.executionSha256,
      expectedDatasetDirectory:release.dataset.datasetDirectory,datasetDirectory,operationId:identity({requestId,releaseId:release.id,archive:selected.sha256}),
      expectedSnapshot:dataset.current,expectedRevision:dataset.revision,previousInstallationSha256:previous,
      source:{schema:SCHEMA,manifestFile,manifestSha256:selected.manifestSha256,planSha256:identity(selected.manifest.source),datasetPrefix:'dataset'}});
  }
  return state;
}
export async function receiveSeaTableWorkspaceFile({directory,archiveFile,expectedSha256,name,requestId}){
  workspaceRequestId(requestId);workspaceName(name);absolute(directory);absolute(archiveFile);
  if(!SHA.test(expectedSha256??''))throw fault('SEATABLE_WORKSPACE_HASH_REQUIRED');
  const input={requestId,name,archiveSha256:expectedSha256},opened=await begin(directory,'receives',requestId,input),{root,value}=opened;
  const parent=join(directory,'received-workspaces'),target=join(parent,name);await make(parent);
  const done=async()=>{const original=await readJson(join(target,'RECEIVED-WORKSPACE.json'),MAX_MANIFEST);
    if(original.requestId!==requestId||original.archiveSha256!==expectedSha256||original.name!==name)throw fault('SEATABLE_WORKSPACE_DESTINATION_EXISTS',undefined,409);
    return original;};
  if(value.status==='complete')return done();
  try{
    if(!await absent(target)){const result=await done();const selected=await readJson(join(target,'workspace-history','receiving',requestId,'manifest.json'),MAX_MANIFEST);
      await installReceivedDatasets(target,requestId,{manifest:selected,manifestSha256:digest(bytes(selected)),sha256:expectedSha256});return finish(root,value,result);}
    const selected=await inspectSeaTableWorkspaceArchive(archiveFile,expectedSha256),stage=join(parent,'.receiving-'+requestId);await make(stage);
    await immutable(join(root,'selected-manifest.json'),selected.content);
    const unpacked=join(root,'unpacked.json');
    if(await absent(unpacked)){await unpackArchive(archiveFile,selected,stage);await immutable(unpacked,bytes({manifestSha256:selected.manifestSha256,archiveSha256:expectedSha256}));}
    else{const done=await readJson(unpacked);if(done.manifestSha256!==selected.manifestSha256||done.archiveSha256!==expectedSha256)throw fault('SEATABLE_WORKSPACE_ARCHIVE_CHANGED');}
    await placeReceived(stage,target,selected,requestId);
    const result={name,requestId,archiveSha256:expectedSha256,bytes:selected.bytes,manifestSha256:selected.manifestSha256,
      source:selected.manifest.source,counts:selected.manifest.counts,directory:target,workspaceIdentity:identity({source:selected.manifest.source,manifestSha256:selected.manifestSha256})};
    await immutable(join(stage,'RECEIVED-WORKSPACE.json'),bytes(result));await rename(stage,target);await syncDirectory(parent);
    await installReceivedDatasets(target,requestId,selected);
    return finish(root,value,result);
  }catch(e){try{await interrupted(root,value,e);}catch(persist){e.persistenceCode=persist.code??'SEATABLE_WORKSPACE_RECEIPT_WRITE';}throw e;}
}
export async function receivedSeaTableWorkspaces(directory){
  const root=join(directory,'received-workspaces');if(await absent(root))return[];
  const found=[];for(const name of await readdir(root)){if(!/^[a-z][a-z0-9_-]{0,47}$/.test(name))continue;
    try{const v=await readJson(join(root,name,'RECEIVED-WORKSPACE.json'),MAX_MANIFEST);if(v.name===name)found.push(v);}catch(e){if(e.code!=='ENOENT')throw e;}}
  return found;
}

/** A package retained before transfer may be staged later; bind its unchanged release
 * to the current original local dataset under the native dataset/release leases. */
export async function installSeaTableReceivedRelease(directory,releaseId,requestId){
  const placement=await readSeaTablePlacement(directory);if(!placement)return null;
  const root=join(directory,'deployments','releases'),catalog=await listReleases(root);
  if(catalog.errors.length)throw fault('SEATABLE_WORKSPACE_RELEASE_INVALID');
  const release=catalog.releases.find(r=>r.id===releaseId);if(!release?.dataset)throw fault('SEATABLE_WORKSPACE_RELEASE_INVALID');
  const operationId=identity({requestId,releaseId,placementSha256:placement.sha256});
  const releasePath=join(root,'releases',releaseId),pointerPath=join(releasePath,'dataset-installation.json');
  let pointer=null;try{pointer=await readJson(pointerPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(pointer){const original=await readJson(join(releasePath,'dataset-installations',pointer.id+'.json'),1048576);
    if(original.operationId===operationId&&original.datasetDirectory===join(directory,'dataset'))return{reused:true,installation:original};}
  const datasetDirectory=join(directory,'dataset'),lease=acquireDatasetLease(datasetDirectory);
  try{
    const state=await readJson(join(datasetDirectory,'state.json')),files=[];await inventory(datasetDirectory,'dataset',files);
    const manifest={schema:'stellar-forge.seatable-dataset-placement-source.v1',files:files.map(({source,...f})=>f)};
    const content=bytes(manifest),hash=digest(content),history=join(directory,'workspace-history','dataset-installation');await make(history);
    const manifestFile=join(history,hash+'.json');await immutable(manifestFile,content);
    return await installDatasetReleaseStore(root,releaseId,{expectedExecutionSha256:release.dataset.executionSha256,
      expectedDatasetDirectory:release.dataset.datasetDirectory,datasetDirectory,operationId,
      expectedSnapshot:state.current,expectedRevision:state.revision,previousInstallationSha256:pointer?identity(pointer):null,
      source:{schema:manifest.schema,manifestFile,manifestSha256:hash,planSha256:placement.manifestSha256,datasetPrefix:'dataset'}});
  }finally{await lease.close();}
}
