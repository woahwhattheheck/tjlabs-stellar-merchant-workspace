// SPDX-License-Identifier: MIT
// Project delivery uses the original Frictionless capture/export/receiver and its complete byte validation.
import { join, dirname } from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';
import { runFrictionlessCommand, inspectFrictionlessSource } from '../frictionless/source.mjs';
import { privateDirectory, readJson, readPrivate, createFile, hashPrivate, digest, identity, bytes, fault } from '../postgres/publisher/files.mjs';
import { sourceDescriptor } from './projection.mjs';
import { need, uuid, HASH, SCHEMA } from './contract.mjs';
const DELIVERY='stellar-forge.openaq-project-delivery.v1';
const safe=n=>typeof n==='string'&&n.length<=1024&&!n.startsWith('/')&&!/[\\\0]/.test(n)&&n.split('/').every(x=>x&&x!=='.'&&x!=='..');
async function exists(p){try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function immutable(p,b){await privateDirectory(dirname(p),true);try{await createFile(p,b);}catch(e){if(e.code!=='EEXIST')throw e;need((await readPrivate(p,Math.max(1,b.length))).equals(b),'OPENAQ_DELIVERY_BYTES_CHANGED',undefined,409);}}
export async function exportOpenAQProject({directory,workspaceId,project,selection,captures,reviews,reports,readLogical,environment=process.env,signal}){
 const binding={workspaceId,selection,captures:captures.map(x=>({id:x.id,sha256:x.captureSha256})),reviews:reviews.map(x=>({id:x.id,sha256:identity(x)})),reports:reports.map(x=>({id:x.id,sha256:x.reportSha256}))};
 await privateDirectory(directory,true);await immutable(join(directory,'request.json'),bytes(binding));
 const resultFile=join(directory,'result.json');
 if(await exists(resultFile)){const result=await readJson(resultFile),actual=await hashPrivate(join(directory,result.file),256*1024*1024);need(result.sha256===actual.hash&&result.bytes===actual.bytes,'OPENAQ_DELIVERY_CHANGED',undefined,409);return {...result,reopened:true};}
 const staged=join(directory,'selected');await privateDirectory(staged,true);
 const logicalFiles=[],resources=[],refs=[],byPath=new Map();
 const add=async(path,data)=>{need(safe(path),'OPENAQ_DELIVERY_PATH_INVALID');const item={path,sha256:digest(data),bytes:data.length},old=byPath.get(path);if(old){need(old.sha256===item.sha256&&old.bytes===item.bytes,'OPENAQ_DELIVERY_MEMBER_CONFLICT',undefined,409);return old;}await immutable(join(staged,path),data);logicalFiles.push(item);refs.push(join(staged,path));byPath.set(path,item);return item;};
 for(let i=0;i<captures.length;i++){
  const c=captures[i],r=reviews[i],prefix='captures/'+uuid(c.id)+'/';
  await add(prefix+'capture.json',bytes(c));await add(prefix+'measurements.csv',await readLogical(prefix+'measurements.csv',64*1024*1024));
  for(const receipt of c.receipts){await add(prefix+receipt.file,await readLogical(prefix+receipt.file,32*1024*1024));const p=prefix+'requests/'+receipt.requestId+'/receipt.json';await add(p,await readLogical(p,262144));}
  await add('reviews/'+uuid(r.id)+'.json',bytes(r));
  const descriptor=sourceDescriptor(c,r,prefix+'measurements.csv').resources[0];resources.push({...descriptor,name:'capture_'+c.id.replaceAll('-','')});
 }
 for(const r of reports){await add('reports/'+uuid(r.id)+'/report.json',bytes(r));await add('reports/'+r.id+'/report.html',await readLogical('reports/'+r.id+'/report.html',8*1024*1024));}
 const manifest={schema:DELIVERY,sourceWorkspaceId:workspaceId,project,selection,bindingSha256:identity(binding),files:logicalFiles,
  captures:captures.map(x=>({id:x.id,captureSha256:x.captureSha256})),reviews:reviews.map(x=>x.id),reports:reports.map(x=>x.id),
  reopening:'Receive this complete source bundle through the original Frictionless source-receive operation, then import its exact declared OpenAQ records into a new private workspace. No provider request or payment is performed.'};
 const manifestBytes=bytes(manifest);await immutable(join(staged,'openaq-delivery.json'),manifestBytes);refs.push(join(staged,'openaq-delivery.json'));
 const descriptor={profile:'data-package',name:'openaq-project-'+selection.requestId,title:project.name,description:project.purpose,resources,
  openaqDelivery:{schema:DELIVERY,manifestSha256:digest(manifestBytes),manifestBytes:manifestBytes.length}};
 await immutable(join(staged,'datapackage.json'),bytes(descriptor));
 const captured=join(directory,'original-capture'),captureFile=join(captured,'capture.json');
 if(!await exists(captureFile)){
  const argv=['capture','--descriptor',join(staged,'datapackage.json'),'--output',captured];for(const p of refs)argv.push('--reference',p);
  await runFrictionlessCommand(argv,{env:environment,stdout:null,signal});
 }
 const sourceFile=join(directory,'source.json');
 if(!await exists(sourceFile))await runFrictionlessCommand(['suggest-source','--capture',captureFile,'--output',sourceFile],{env:environment,stdout:null,signal});
 await inspectFrictionlessSource(sourceFile,{env:environment});
 const file='OpenAQ_Project_'+selection.requestId+'.tgz',archive=join(directory,file);
 let result;
 if(!await exists(archive))result=await runFrictionlessCommand(['source-export','--source',sourceFile,'--output',archive],{env:environment,stdout:null,signal});
 else {const actual=await hashPrivate(archive,256*1024*1024);result={sha256:actual.hash,bytes:actual.bytes,reconciledArchive:true};}
 const value={schema:DELIVERY,requestId:selection.requestId,file,sha256:result.sha256,bytes:result.bytes,files:logicalFiles.length,
  captureIds:manifest.captures.map(x=>x.id),reportIds:manifest.reports,sourceWorkspaceId:workspaceId,manifestSha256:digest(manifestBytes)};
 await immutable(resultFile,bytes(value));return value;
}
export async function receiveOpenAQProject({archive,sha256,directory,environment=process.env,signal}){
 need(HASH.test(sha256??''),'OPENAQ_ARCHIVE_HASH_REQUIRED');
 const original=join(directory,'original-bundle');
 await privateDirectory(directory,true);
 const input={schema:DELIVERY,sha256};
 await immutable(join(directory,'receiving-input.json'),bytes(input));
 const receiptPath=join(directory,'received.json');
 if(await exists(receiptPath)){
  const previous=await readJson(receiptPath);need(previous.bundleSha256===sha256,'OPENAQ_RECEIVING_INPUT_CHANGED',undefined,409);
  const source=await inspectFrictionlessSource(join(original,'source.json'),{env:environment});
  need(source.captureSha256===previous.captureSha256,'OPENAQ_RECEIVED_SOURCE_CHANGED',undefined,409);
  need(previous.selectedDirectory===join(directory,'selected')&&Array.isArray(previous.manifest?.files),'OPENAQ_RECEIVED_SELECTION_CHANGED',undefined,409);
  const names=new Set();for(const item of previous.manifest.files){need(safe(item.path)&&!names.has(item.path)&&HASH.test(item.sha256??'')&&Number.isSafeInteger(item.bytes)&&item.bytes>=0,'OPENAQ_DELIVERY_MEMBER_INVALID');names.add(item.path);const actual=await hashPrivate(join(previous.selectedDirectory,item.path),256*1024*1024);need(actual.hash===item.sha256&&actual.bytes===item.bytes,'OPENAQ_RECEIVED_MEMBER_CHANGED',undefined,409);}
  return {...previous,reopened:true};
 }
 if(!await exists(join(original,'source.json')))await runFrictionlessCommand(['source-receive','--archive',archive,'--sha256',sha256,'--output',original],{env:environment,stdout:null,signal});
 const source=await inspectFrictionlessSource(join(original,'source.json'),{env:environment});
 const d=source.capture?.package?.openaqDelivery;
 need(d?.schema===DELIVERY&&HASH.test(d.manifestSha256??'')&&Number.isSafeInteger(d.manifestBytes),'OPENAQ_DELIVERY_MANIFEST_REQUIRED');
 const manifestEntry=source.capture.files.find(x=>x.sha256===d.manifestSha256&&x.bytes===d.manifestBytes);
 need(manifestEntry,'OPENAQ_DELIVERY_MANIFEST_MISSING');
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readPrivate(join(original,'capture',manifestEntry.file),8*1024*1024)));
 need(manifest.schema===DELIVERY&&Array.isArray(manifest.files)&&manifest.files.length<=9000&&Array.isArray(manifest.captures)&&manifest.captures.length>0,'OPENAQ_DELIVERY_INVALID');
 const selected=join(directory,'selected');await privateDirectory(selected,true);const names=new Set();
 for(const item of manifest.files){
  need(safe(item.path)&&!names.has(item.path)&&HASH.test(item.sha256??'')&&Number.isSafeInteger(item.bytes)&&item.bytes>=0,'OPENAQ_DELIVERY_MEMBER_INVALID');names.add(item.path);
  const entry=source.capture.files.find(x=>x.sha256===item.sha256&&x.bytes===item.bytes);need(entry,'OPENAQ_DELIVERY_MEMBER_MISSING');
  const raw=await readPrivate(join(original,'capture',entry.file),Math.min(256*1024*1024,Math.max(1,item.bytes)));
  need(raw.length===item.bytes&&digest(raw)===item.sha256,'OPENAQ_DELIVERY_MEMBER_CHANGED',undefined,409);await immutable(join(selected,item.path),raw);
 }
 for(const entry of manifest.captures){uuid(entry.id);const c=await readJson(join(selected,'captures',entry.id,'capture.json'),16*1024*1024);const{captureSha256,...body}=c;need(captureSha256===entry.captureSha256&&identity(body)===captureSha256,'OPENAQ_RECEIVED_CAPTURE_CHANGED');}
 const result={schema:DELIVERY,bundleSha256:sha256,captureSha256:source.captureSha256,manifest,selectedDirectory:selected,receivedFiles:manifest.files.length};
 await immutable(receiptPath,bytes(result));return result;
}
