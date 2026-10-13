// SPDX-License-Identifier: MIT
/** Whole Econdb source and customer preparation inside the original Source Desk. */
import {open,mkdir,lstat,realpath,readdir,link,unlink} from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {regular,operationLease} from '../../../../scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {readProfile} from '../profiles.mjs';
import {bindingTemplate} from '../prepare-core.mjs';
import {commercialWorkshare} from '../commercial-workshare-core.mjs';
import {prepareEcondbInstallation,reopenEcondbInstallation} from './prepare.mjs';
import {catalogueEcondbInstallationSource,inspectEcondbInstallationSource} from './source.mjs';
import {retain as exactWrite,copy as copyExact,retainStream as streamExact,identity as exactIdentity} from './io.mjs';
import {ECONDB_INSTALLATION_SCHEMA as SOURCE_SCHEMA,ECONDB_INSTALLATION_PROFILE as PROFILE,ordinary,composeEcondbInstallation} from '../econdb-installation-core.mjs';

export const ECONDB_SOURCE_SERVICE_SCHEMA='stellar-forge.econdb-installation-preparation-service.v1';
const SCHEMA=ECONDB_SOURCE_SERVICE_SCHEMA,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const INPUTS=new Set(['archive','seed','bindings','commissioning','attachment']);
const KINDS=new Set([...INPUTS,'source','report','installation','preview','workorder','preparation','profile','request']);
const MiB=1024*1024,MAX_JSON=8*MiB,MAX_REPORT=64*MiB,MAX_ARCHIVE=Number.MAX_SAFE_INTEGER;
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const encode=v=>Buffer.from(JSON.stringify(v,null,2)+'\n'),canonical=v=>JSON.stringify(ordered(v));
const hash=v=>createHash('sha256').update(v).digest('hex');
const need=(ok,message,status=422)=>{if(!ok)throw Object.assign(new Error(message),{code:'ECONDB_SOURCE_DESK_INPUT',status});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const id=value=>{need(typeof value==='string'&&HASH.test(value),'Select the complete retained file identity.');return value;};
const uuid=value=>{need(typeof value==='string'&&UUID.test(value),'Retain the original request UUID.');return value;};
const name=value=>{need(ordinary(value),'Use an ordinary complete relative filename.');return value;};
const maximum=kind=>['archive','attachment'].includes(kind)?MAX_ARCHIVE:kind==='source'?Number.MAX_SAFE_INTEGER:
 ['report','preparation','workorder'].includes(kind)?MAX_REPORT:['seed','bindings','profile','request'].includes(kind)?2*MiB:
 ['installation','preview'].includes(kind)?256*1024:MAX_JSON;
const same=(a,b)=>canonical(a)===canonical(b);
// Only pure source validation is classified as an editable input rejection.
function inputReview(work){try{return work();}catch(error){throw Object.assign(new Error(String(error.message)),{code:'ECONDB_SOURCE_DESK_INPUT',status:422,cause:error});}}
async function privateDirectory(path){
 await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);
 need(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&await realpath(path)===path&&
  (process.getuid===undefined||info.uid===process.getuid()),'Select the owned private source directory without symbolic-link ancestors.');
 return path;
}
async function optional(path,limit=MAX_REPORT){
 try{return await regular(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function identity(path,limit){return exactIdentity(path,{limit});}

export async function createEcondbInstallationService({directory,signal}={}){
 need(typeof directory==='string'&&directory===resolve(directory),'Select an absolute original Source Desk directory.');
 // Keep source copies outside a producing Econdb workspace to avoid recursive exports.
 for(let parent=directory;;parent=dirname(parent)){
  let marker;try{marker=await regular(join(parent,'workspace.json'),MAX_REPORT);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(marker){let value;try{value=parse(marker);}catch{}need(!String(value?.schema??'').includes('econdb-workspace'),
   'Keep the Source Desk sidecar outside the producing Econdb workspace.');}
  if(dirname(parent)===parent)break;
 }
 const root=await privateDirectory(directory);
 for(const part of ['blobs','files','requests','transfers'])await privateDirectory(join(root,part));
 await exactWrite(join(root,'service.json'),encode({schema:SCHEMA}));
 let active=Promise.resolve(),closing=false,stopped;const accepted=new Set();
 const transaction=async(request,work)=>{
  uuid(request.requestId);let finish;const current=new Promise(r=>{finish=r;}),previous=active;active=current;await previous;
  let lease;
  try{
   signal?.throwIfAborted();lease=await operationLease(join(root,'econdb-source.lock'));
   const folder=await privateDirectory(join(root,'requests',request.requestId));
   await exactWrite(join(folder,'request.json'),encode(request));
   const prior=await optional(join(folder,'result.json'));
   if(prior){const result=parse(prior);await validateResult(request,result);return result;}
   if(!work)return null;
   const result=await work(folder,[lease.fd]);need(result.type===request.type&&result.requestId===request.requestId&&Array.isArray(result.files),
    'Preserve the complete original source request and result.');
   await exactWrite(join(folder,'result.json'),encode(result));return result;
  }finally{try{await lease?.close();}finally{finish();}}
 };
 async function descriptor(fileId){
  const row=parse(await regular(join(root,'files',id(fileId)+'.json'),MAX_JSON)),{fileId:ignored,...body}=row;
  need(row.fileId===fileId&&hash(canonical(body))===fileId&&body.schema===SCHEMA+'.file'&&KINDS.has(body.kind)&&
   HASH.test(body.sha256)&&Number.isSafeInteger(body.bytes)&&body.bytes>=0&&body.bytes<=maximum(body.kind),
   'The complete retained source descriptor differs.');name(row.name);return row;
 }
 async function file(fileId){
  const row=await descriptor(fileId),path=join(root,'blobs',row.sha256);
  need(same(await identity(path,maximum(row.kind)),{bytes:row.bytes,sha256:row.sha256}),'The complete retained source bytes differ.',409);
  return{path,descriptor:row};
 }
 async function retainFile(kind,filename,raw){
  need(KINDS.has(kind)&&Buffer.isBuffer(raw)&&raw.length<=maximum(kind),'Keep the complete file within its original kind capacity.');name(filename);
  const body={schema:SCHEMA+'.file',kind,name:filename,bytes:raw.length,sha256:hash(raw)},row={...body,fileId:hash(canonical(body))};
  await exactWrite(join(root,'blobs',row.sha256),raw);await exactWrite(join(root,'files',row.fileId+'.json'),encode(row));return row;
 }
 async function selected(fileId,kind){const value=await file(fileId);need(value.descriptor.kind===kind,'Select the complete original '+kind+' file.');return value;}
 async function jsonInput(fileId,kind){const value=await selected(fileId,kind);return{...value,raw:await regular(value.path,maximum(kind))};}
 async function validateResult(request,result){
  need(plain(result)&&result.schema===SCHEMA+'.result'&&result.type===request.type&&result.requestId===request.requestId&&Array.isArray(result.files),
   'The retained source operation differs from its original request.');
  for(const row of result.files){signal?.throwIfAborted();need(same((await file(row.fileId)).descriptor,row),'A complete retained result file differs.');}
  for(const key of ['archiveId','seedId','bindingsId','commissioningId'])if(request[key])await file(request[key]);
 }
 async function get(requestId){
  const folder=join(root,'requests',uuid(requestId)),requestRaw=await optional(join(folder,'request.json'),MAX_JSON);
  if(!requestRaw)return{schema:SCHEMA+'.pending',requestId,status:'NOT_RECORDED',request:null,files:[]};
  const request=parse(requestRaw),raw=await optional(join(folder,'result.json'));
  if(!raw)return{schema:SCHEMA+'.pending',requestId,type:request.type,request,status:'PENDING'};
  const result=parse(raw);await validateResult(request,result);return{...result,request,status:'COMPLETE'};
 }
 async function retainPath(kind,filename,path,expected){
  need(KINDS.has(kind)&&expected.bytes<=maximum(kind),'Keep the full original file within its kind capacity.');name(filename);
  const body={schema:SCHEMA+'.file',kind,name:filename,bytes:expected.bytes,sha256:expected.sha256},row={...body,fileId:hash(canonical(body))};
  await copyExact(path,join(root,'blobs',row.sha256),expected,{signal});
  await exactWrite(join(root,'files',row.fileId+'.json'),encode(row));return row;
 }
 async function importStream({requestId,kind,name:filename,bytes,sha256,stream}){
  uuid(requestId);need(INPUTS.has(kind),'Choose an original input file kind.');name(filename);
  need(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=maximum(kind)&&HASH.test(sha256??''),'Select the exact complete input bytes and digest.');
  const request={schema:SCHEMA+'.request',type:'import',requestId,kind,name:filename,bytes,sha256};await transaction(request,null);
  // A complete blob is atomically visible only after full streamed identity checks.
  await streamExact(join(root,'blobs',sha256),stream,{bytes,sha256},{signal});
  return transaction(request,async()=>{
   const body={schema:SCHEMA+'.file',kind,name:filename,bytes,sha256},row={...body,fileId:hash(canonical(body))};
   await exactWrite(join(root,'files',row.fileId+'.json'),encode(row));return result('import',requestId,[row],{file:row});
  });
 }
 async function importFile({requestId,path,kind,expectedSha256,name:filename}){
  need(typeof path==='string'&&path===resolve(path)&&INPUTS.has(kind),'Select an owned complete input path and kind.');
  const value=await identity(path,maximum(kind));need(expectedSha256===undefined||expectedSha256===value.sha256,'The selected original input digest differs.');
  return importStream({requestId,kind,name:filename??basename(path),...value,stream:createReadStream(path,{flags:constants.O_RDONLY|constants.O_NOFOLLOW})});
 }
 const result=(type,requestId,files,values={})=>({schema:SCHEMA+'.result',type,requestId,...values,files});
 async function catalogue({requestId,archiveId}){
  const request={schema:SCHEMA+'.request',type:'catalogue',requestId:uuid(requestId),archiveId:id(archiveId)};
  return transaction(request,async(_folder,leaseFds)=>{
   const archive=await selected(archiveId,'archive'),value=await catalogueEcondbInstallationSource({
    archivePath:archive.path,expectedArchiveSha256:archive.descriptor.sha256,expectedArchiveBytes:archive.descriptor.bytes,
    directory:join(root,'transfers',archive.descriptor.sha256),signal,leaseFds});
   return result('catalogue',requestId,[archive.descriptor,await retainFile('report','ECONDB_PROJECTS.json',encode(value))],
    {archiveId,...value,schema:SCHEMA+'.result',type:'catalogue',requestId});
  });
 }
 async function inspect({requestId,archiveId,projectId,projectRevision,expectedInputSha256}){
  need(typeof projectId==='string'&&Number.isSafeInteger(projectRevision)&&projectRevision>0&&HASH.test(expectedInputSha256??''),
   'Select the exact original catalogue project edition.');
  const request={schema:SCHEMA+'.request',type:'inspect',requestId:uuid(requestId),archiveId:id(archiveId),projectId,projectRevision,expectedInputSha256};
  return transaction(request,async(folder,leaseFds)=>{
   const archive=await selected(archiveId,'archive');
   const stampPath=join(folder,'observed-at.json'),old=await optional(stampPath,MAX_JSON);
   if(!old)await exactWrite(stampPath,encode({observedAt:new Date().toISOString()}));
   const stamp=parse(await regular(stampPath,MAX_JSON));
   const inspected=await inspectEcondbInstallationSource({archivePath:archive.path,...request,
    expectedArchiveSha256:archive.descriptor.sha256,expectedArchiveBytes:archive.descriptor.bytes,
    directory:join(root,'transfers',archive.descriptor.sha256),observedAt:stamp.observedAt,signal,leaseFds});
   const files=[archive.descriptor],selectedFiles=[];
   for(const item of inspected.files){
    const row=await retainPath('source','econdb-source/'+item.name,item.path,{bytes:item.bytes,sha256:item.sha256});
    files.push(row);selectedFiles.push({path:item.name,fileId:row.fileId,bytes:row.bytes,sha256:row.sha256});
   }
   const report=await retainFile('report','ECONDB_INSPECTED_SOURCE.json',encode(inspected.source));files.push(report);
   return result('inspect',requestId,files,{archiveId,source:inspected.source,report,selectedFiles});
  });
 }
 async function inspection(inspectionId){
  const value=await get(uuid(inspectionId));need(value.status==='COMPLETE'&&value.type==='inspect','Select the completed full original programme inspection.');
  const report=await jsonInput(value.report.fileId,'report'),source=parse(report.raw);
  need(same(source,value.source),'The full original inspected source report differs.');return value;
 }
 async function profileForRequest(requestId){
  const raw=await optional(join(root,'requests',uuid(requestId),'request.json'),MAX_JSON),prior=raw?parse(raw):null;
  if(prior?.profile){
   const retained=await selected(prior.profile.fileId,'profile');need(retained.descriptor.bytes===prior.profile.source.bytes&&
    retained.descriptor.sha256===prior.profile.source.sha256,'The exact original profile changed.');
   return{value:parse(await regular(retained.path,2*MiB)),source:prior.profile.source,descriptor:retained.descriptor};
  }
  const profile=readProfile(PROFILE),bytes=await regular(profile.source.path,2*MiB);
  need(bytes.length===profile.source.bytes&&hash(bytes)===profile.source.sha256,'The installed full profile changed while selecting it.');
  return{value:parse(bytes),source:profile.source,descriptor:await retainFile('profile','Original_Econdb_Customer_Profile.json',bytes)};
 }
 function selectedCase(seed,nativeCaseId){
  need(typeof nativeCaseId==='string'&&/^operation-[a-f0-9]{32}$/.test(nativeCaseId)&&seed?.source?.caseId===nativeCaseId,
   'Use this actual original customer case and its complete Workshare seed.');
 }
 async function template({requestId,inspectionId,seedId,commissioningId,nativeCaseId}){
  const profile=await profileForRequest(requestId),request={schema:SCHEMA+'.request',type:'template',requestId:uuid(requestId),
   inspectionId:uuid(inspectionId),seedId:id(seedId),commissioningId:id(commissioningId),nativeCaseId,
   profile:{fileId:profile.descriptor.fileId,source:profile.source}};
  return transaction(request,async()=>{
   const inspected=await inspection(inspectionId),seed=await jsonInput(seedId,'seed'),commissioning=await jsonInput(commissioningId,'commissioning');
   const seedValue=inputReview(()=>parse(seed.raw));selectedCase(seedValue,nativeCaseId);
   const bindings=inputReview(()=>bindingTemplate(seedValue,profile.value)),commercial=inputReview(()=>commercialWorkshare({seed:seedValue,commissioning:parse(commissioning.raw),profile:profile.value}));
   const files=[seed.descriptor,commissioning.descriptor,profile.descriptor,await retainFile('bindings','bindings.json',encode(bindings))];
   return result('template',requestId,files,{inspectionId,seedId,commissioningId,nativeCaseId,bindings,seed:seedValue,
    profile:{value:profile.value,source:profile.source},commercial,source:inspected.source});
  });
 }
 async function prepare({requestId,inspectionId,seedId,bindingsId,commissioningId,nativeCaseId,attachments=[]}){
  need(Array.isArray(attachments)&&attachments.length<=256,'Select up to 256 complete additional working files.');
  const names=new Set();
  for(const item of attachments){need(plain(item)&&Object.keys(item).every(k=>['fileId','name','purpose'].includes(k))&&
   ordinary(item.name)&&!names.has(item.name)&&typeof item.purpose==='string'&&item.purpose.trim()&&item.purpose.length<=4000,
   'Retain every distinct working filename, purpose and complete source.');id(item.fileId);names.add(item.name);}
  const profile=await profileForRequest(requestId),request={schema:SCHEMA+'.request',type:'prepare',requestId:uuid(requestId),
   inspectionId:uuid(inspectionId),seedId:id(seedId),bindingsId:id(bindingsId),commissioningId:id(commissioningId),
   nativeCaseId,attachments,profile:{fileId:profile.descriptor.fileId,source:profile.source}};
  return transaction(request,async(folder,leaseFds)=>{
   const inspected=await inspection(inspectionId),seed=await jsonInput(seedId,'seed'),bindings=await jsonInput(bindingsId,'bindings'),
    commissioning=await jsonInput(commissioningId,'commissioning'),archive=await selected(inspected.archiveId,'archive');
   selectedCase(inputReview(()=>parse(seed.raw)),nativeCaseId);
   const extra=[];let total=0;
   for(const item of attachments){const selected=await file(item.fileId);need(selected.descriptor.kind==='attachment','Select an original additional working file.');
    total+=selected.descriptor.bytes;extra.push({name:item.name,purpose:item.purpose,path:selected.path,bytes:selected.descriptor.bytes,sha256:selected.descriptor.sha256});}
   need(total<=1024*MiB,'The complete extra working files exceed one GiB.');
   const source=inspected.source,extraPath=join(folder,'attachments.json');
   inputReview(()=>composeEcondbInstallation(parse(seed.raw),profile.value,parse(bindings.raw),source,parse(commissioning.raw),
    {attachments:extra.map(item=>({name:'attachments/'+item.name,bytes:item.bytes,sha256:item.sha256,purpose:item.purpose}))}));
   await exactWrite(extraPath,encode({schema:SOURCE_SCHEMA+'.attachments',files:extra}));
   const preparedDirectory=join(folder,'preparation'),completed=await optional(join(preparedDirectory,'preparation.json'),MAX_REPORT);
   if(!completed)need(readProfile(PROFILE).source.sha256===profile.source.sha256,
    'The maintained profile changed before preparation. Select a new explicit request with its current profile.',409);
   const prepared=completed?await reopenEcondbInstallation({directory:preparedDirectory,signal,leaseFds}):
    await prepareEcondbInstallation({directory:preparedDirectory,archivePath:archive.path,expectedArchiveSha256:source.archive.sha256,
     projectId:source.project.record.id,projectRevision:source.project.record.revision,expectedInputSha256:source.project.inputSha256,observedAt:source.observedAt,
     seedPath:seed.path,bindingsPath:bindings.path,commissioningPath:commissioning.path,attachmentsPath:extraPath,signal,leaseFds});
   need(prepared.inputs.find(x=>x.name==='source/profile.json')?.sha256===profile.source.sha256,
    'The prepared original profile differs from its selected complete source.',409);
   const files=[],seen=new Set();
   for(const item of [...prepared.inputs,...prepared.outputs,{name:'prepare-request.json'},{name:'preparation.json'}]){
    if(seen.has(item.name))continue;seen.add(item.name);need(ordinary(item.name),'Preserve complete ordinary preparation paths.');
    const fixed={'source/seed.json':'seed','source/bindings.json':'bindings','source/profile.json':'profile',
     'source/commissioning.json':'commissioning','source/attachments.json':'request','prepare-request.json':'request',
     'derived-bindings.json':'bindings','source/econdb-workspace.zip':'archive'};
    const kind=fixed[item.name]??(item.name.startsWith('attachments/')?'attachment':
     item.name.startsWith('delivery/files/')?'source':item.name.endsWith('installation-input.json')?'installation':
     item.name.endsWith('installation-preview-input.json')?'preview':item.name.endsWith('WORKORDER.md')?'workorder':'preparation');
    const path=join(preparedDirectory,item.name),expected=await identity(path,maximum(kind));
    if(item.sha256)need(expected.bytes===item.bytes&&expected.sha256===item.sha256,'An original complete prepared file differs.');
    files.push(await retainPath(kind,item.name,path,expected));
   }
   return result('prepare',requestId,files,{inspectionId,nativeCaseId,archiveId:inspected.archiveId,archive:source.archive,
    source:prepared.source,workshareCaseId:prepared.workshareCaseId,preparationSha256:prepared.preparationSha256,
    readyReceiving:{preparationDirectory:preparedDirectory,expectedPreparationSha256:prepared.preparationSha256},
    installation:{source:prepared.installationSource,workshareCaseId:prepared.workshareCaseId,document:prepared.document,
     preview:prepared.preview,selections:prepared.selections},selections:prepared.selections});
  });
 }
 async function list({offset=0,limit=100}={}){
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'Choose a complete request page.');
  const ids=(await readdir(join(root,'requests'))).filter(x=>UUID.test(x)).sort(),rows=[];
  for(const requestId of ids.slice(offset,offset+limit)){
   const folder=join(root,'requests',requestId),requestRaw=await optional(join(folder,'request.json'),MAX_JSON);if(!requestRaw)continue;
   const request=parse(requestRaw),raw=await optional(join(folder,'result.json')),value=raw?parse(raw):null;
   rows.push({requestId,type:request.type,status:raw?'COMPLETE':'PENDING',request,files:value?.files??[]});
  }
  return{schema:SCHEMA+'.list',offset,limit,total:ids.length,nextOffset:offset+limit<ids.length?offset+limit:null,rows};
 }
 async function sourceFile({inspectionId,path}){
  const inspected=await inspection(inspectionId);need(ordinary(path),'Select an original complete source member.');
  const selected=inspected.selectedFiles.find(x=>x.path===path);need(selected,'The selected original member is absent.',404);
  return file(selected.fileId);
 }
 const owned=fn=>(...args)=>{
  need(!closing,'The original Source Desk service is closing.',409);signal?.throwIfAborted();
  const promise=Promise.resolve().then(()=>fn(...args));accepted.add(promise);
  promise.then(()=>accepted.delete(promise),()=>accepted.delete(promise));return promise;
 };
 return Object.freeze({directory:root,...Object.fromEntries(Object.entries({importFile,importStream,catalogue,inspect,template,prepare,get,list,file,sourceFile})
  .map(([key,fn])=>[key,owned(fn)])),close(){closing=true;return stopped??=Promise.allSettled([...accepted]).then(()=>active);}});
}
