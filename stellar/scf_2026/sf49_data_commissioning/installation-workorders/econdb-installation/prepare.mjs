// SPDX-License-Identifier: MIT
/** Original Workshare + exact maritime project -> complete private Installation. */
import {join,resolve} from 'node:path';
import {operationLease} from '../../../../scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {readProfile} from '../profiles.mjs';
import {composeEcondbInstallation,econdbSourceSelection,validateEcondbInstallationSource,ECONDB_INSTALLATION_SCHEMA as SCHEMA,ECONDB_INSTALLATION_PROFILE as PROFILE} from '../econdb-installation-core.mjs';
import {inspectEcondbInstallationSource} from './source.mjs';
import {need,ordinary,canonical,same,json,parse,hash,directory,parent,identity,read,optional,retain,copy} from './io.mjs';
const FIXED=['source/econdb-workspace.zip','source/seed.json','source/bindings.json','source/profile.json','source/commissioning.json','source/attachments.json'];
const OUTPUTS=['derived-bindings.json','ECONDB_CUSTOMER_SOURCE.json','ECONDB_CUSTOMER_SOURCE.md','installation-input.json','installation-preview-input.json','WORKORDER.md','ECONDB_SOURCE_SELECTION.json','commercial.json','COMMERCIAL.md','commercial.html'];
const MAX_JSON=64*1024*1024;
const id=(name,raw)=>({name,bytes:raw.length,sha256:hash(raw)});
async function put(root,name,raw){await retain(await parent(root,name),raw);return id(name,raw);}
async function transfer(root,name,from,expected,signal){await copy(from,await parent(root,name),expected,{signal});return{name,...expected};}
function check(request,options={}){
 need(request?.schema===SCHEMA+'.request'&&Array.isArray(request.inputs)&&FIXED.every((n,i)=>request.inputs[i]?.name===n)&&
 request.inputs.length>=FIXED.length&&new Set(request.inputs.map(x=>x.name)).size===request.inputs.length,
 'Retain the complete original preparation request and all input identities.');
 for(const f of request.inputs)need(ordinary(f.name)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256),'Retain complete original input descriptors.');
 for(const [option,key]of [['projectId','projectId'],['projectRevision','projectRevision'],['expectedInputSha256','inputSha256'],['expectedArchiveSha256','archiveSha256']])
  need(options[option]===undefined||options[option]===request[key],'The selected project/source differs from this original preparation.',409);
}
async function checkFile(root,f,signal){need(same(await identity(join(root,f.name),{signal}),{bytes:f.bytes,sha256:f.sha256}),'The retained original member changed: '+f.name,409);}
function attachments(value){
 need(value?.schema===SCHEMA+'.attachments'&&Array.isArray(value.files)&&value.files.length<=256,'Select complete declared additional working files.');
 const names=new Set();
 for(const f of value.files){need(ordinary(f.name)&&!names.has(f.name)&&typeof f.purpose==='string'&&f.purpose.trim()&&
  Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256)&&typeof f.path==='string'&&f.path===resolve(f.path),
  'Retain every distinct original attachment name, purpose and identity.');names.add(f.name);}
 return value.files.map(f=>({name:'attachments/'+f.name,bytes:f.bytes,sha256:f.sha256,purpose:f.purpose,sourcePath:f.path}));
}
async function inputs(options){
 need(options.archivePath&&options.seedPath&&options.bindingsPath&&options.commissioningPath,'Select the complete original workspace, Workshare seed, explicit bindings and commissioning.');
 const profile=readProfile(PROFILE),profileRaw=await read(profile.source.path,2*1024*1024);
 need(same(id('profile',profileRaw),{name:'profile',bytes:profile.source.bytes,sha256:profile.source.sha256}),'Installed original profile changed.');
 const raw={seed:await read(resolve(options.seedPath),2*1024*1024),bindings:await read(resolve(options.bindingsPath),2*1024*1024),
 profile:profileRaw,commissioning:await read(resolve(options.commissioningPath),8*1024*1024),
 attachments:options.attachmentsPath?await read(resolve(options.attachmentsPath),2*1024*1024):json({schema:SCHEMA+'.attachments',files:[]})};
 const extra=attachments(parse(raw.attachments)),a=await identity(resolve(options.archivePath),{signal:options.signal});
 need(a.sha256===options.expectedArchiveSha256,'Retain the exact complete original archive.');
 const bodies=new Map([[FIXED[1],raw.seed],[FIXED[2],raw.bindings],[FIXED[3],raw.profile],[FIXED[4],raw.commissioning],[FIXED[5],raw.attachments]]);
 const paths=[options.archivePath,options.seedPath,options.bindingsPath,null,options.commissioningPath,options.attachmentsPath??null];
 const selected=FIXED.map((name,i)=>({...(i===0?{name,...a}:id(name,bodies.get(name))),sourcePath:paths[i]?resolve(paths[i]):null})).concat(extra);
 return {bodies,request:{schema:SCHEMA+'.request',projectId:options.projectId,projectRevision:options.projectRevision,inputSha256:options.expectedInputSha256,
 archiveSha256:a.sha256,observedAt:options.observedAt??new Date().toISOString(),inputs:selected}};
}
async function retainInputs(root,request,options,bodies){
 const overrides=new Map([[FIXED[0],options.archivePath],[FIXED[1],options.seedPath],[FIXED[2],options.bindingsPath],[FIXED[4],options.commissioningPath],[FIXED[5],options.attachmentsPath]]);
 for(const f of request.inputs){
  options.signal?.throwIfAborted();const expected={bytes:f.bytes,sha256:f.sha256};
  if(overrides.get(f.name)!==undefined)need(same(await identity(resolve(overrides.get(f.name)),{signal:options.signal}),expected),'An explicitly supplied original input changed.',409);
  try{await checkFile(root,f,options.signal);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  const raw=bodies?.get(f.name),origin=overrides.get(f.name)??f.sourcePath;
  if(raw!==undefined){need(same(id(f.name,raw),{name:f.name,...expected}),'Original input body differs.');await put(root,f.name,raw);}
  else {need(origin,'Receive the missing unchanged original input '+f.name);await transfer(root,f.name,origin,expected,options.signal);}
 }
}
async function source(root,request,signal,leaseFds=[]){
 const value=await inspectEcondbInstallationSource({archivePath:join(root,FIXED[0]),expectedArchiveSha256:request.archiveSha256,
 expectedArchiveBytes:request.inputs[0].bytes,directory:join(root,'retained-transfer'),projectId:request.projectId,projectRevision:request.projectRevision,
 expectedInputSha256:request.inputSha256,observedAt:request.observedAt,signal,leaseFds});
 validateEcondbInstallationSource(value.source);return value;
}
async function composition(root,request,inspected){
 const [seed,bindings,profile,commissioning,selected]=await Promise.all(FIXED.slice(1).map(n=>read(join(root,n),MAX_JSON).then(parse)));
 const extra=attachments(selected);need(same(extra,request.inputs.slice(FIXED.length)),'The complete attachment selection differs.');
 return composeEcondbInstallation(seed,profile,bindings,inspected.source,commissioning,
 {attachments:extra.map(({sourcePath,...f})=>f)});
}
function outputBodies(c){
 const raw=json(c.source);
 return [json(c.derivedBindings),raw,Buffer.from(c.sourceMarkdown),json(c.prepared.document),json(c.prepared.preview),
 Buffer.from(c.workorder),json(econdbSourceSelection(c.source,id('ECONDB_CUSTOMER_SOURCE.json',raw))),json(c.commercial),
 Buffer.from(c.commercialMarkdown),Buffer.from(c.commercialHtml)];
}
async function verify(root,requestRaw,options){
 const request=parse(requestRaw);check(request,options);await retainInputs(root,request,options,null);
 const inspected=await source(root,request,options.signal,options.leaseFds),composed=await composition(root,request,inspected);
 const completeRaw=await read(join(root,'preparation.json'),MAX_JSON),done=parse(completeRaw);
 const expectedNames=['source/operator-transfer.json',...inspected.source.files.map(f=>'delivery/files/'+f.name),...OUTPUTS];
 need(done.schema===SCHEMA&&done.state==='PREPARED'&&done.requestSha256===hash(requestRaw)&&same(done.inputs,request.inputs)&&
 same(done.outputs.map(f=>f.name),expectedNames)&&done.projectId===request.projectId&&done.projectRevision===request.projectRevision&&
 done.inputSha256===request.inputSha256&&done.archiveSha256===request.archiveSha256&&done.workspaceId===inspected.source.workspace.id&&
 done.workshareCaseId===composed.prepared.workshareCaseId&&same(done.installationSource,composed.prepared.source)&&same(done.selections,composed.prepared.selections),
 'The complete preparation differs from its original source and commercial case.',409);
 for(const f of done.outputs)await checkFile(root,f,options.signal);
 for(const f of inspected.source.files){const saved=done.outputs.find(x=>x.name==='delivery/files/'+f.name);need(saved.bytes===f.bytes&&saved.sha256===f.sha256,'Prepared source identity differs.');}
 const values=outputBodies(composed);
 for(let i=0;i<OUTPUTS.length;i++)need((await read(join(root,OUTPUTS[i]),MAX_JSON)).equals(values[i]),'The retained composed output differs: '+OUTPUTS[i],409);
 return {...done,directory:root,preparationSha256:hash(completeRaw),preparationBytes:completeRaw.length,
 source:composed.source,document:composed.prepared.document,preview:composed.prepared.preview};
}
async function owned(options,work){
 const root=await directory(resolve(options.directory)),lease=await operationLease(join(root,'econdb-preparation.lock'));
 try{return await work(root,[...(options.leaseFds??[]),lease.fd]);}finally{await lease.close();}
}
export async function prepareEcondbInstallation(options={}){
 return owned(options,async(root,leaseFds)=>{
 options={...options,leaseFds};
 let raw=await optional(join(root,'prepare-request.json'),MAX_JSON),request,bodies;
 if(raw){request=parse(raw);check(request,options);if(await optional(join(root,'preparation.json'),MAX_JSON))return verify(root,raw,options);}
 else{
  const first=await inputs(options);request=first.request;bodies=first.bodies;check(request,options);
  // Generated profile/empty attachment bytes are retained before the request.
  await put(root,FIXED[3],bodies.get(FIXED[3]));await put(root,FIXED[5],bodies.get(FIXED[5]));
  raw=json(request);await put(root,'prepare-request.json',raw);
 }
 await retainInputs(root,request,options,bodies);
 const inspected=await source(root,request,options.signal,options.leaseFds),composed=await composition(root,request,inspected);
 const outputs=[await transfer(root,'source/operator-transfer.json',inspected.transferManifestPath,
 {bytes:inspected.source.transferManifest.bytes,sha256:inspected.source.transferManifest.sha256},options.signal)];
 for(const f of inspected.files)outputs.push(await transfer(root,'delivery/files/'+f.name,f.path,{bytes:f.bytes,sha256:f.sha256},options.signal));
 const values=outputBodies(composed);need(values[3].length<=128*1024,'The complete Installation exceeds its existing 128 KiB native capacity.');
 for(let i=0;i<OUTPUTS.length;i++){need(values[i].length<=MAX_JSON,'The complete composed output exceeds 64 MiB.');outputs.push(await put(root,OUTPUTS[i],values[i]));}
 const complete={schema:SCHEMA,state:'PREPARED',requestSha256:hash(raw),workspaceId:inspected.source.workspace.id,
 archiveSha256:request.archiveSha256,projectId:request.projectId,projectRevision:request.projectRevision,inputSha256:request.inputSha256,
 inputs:request.inputs,outputs,workshareCaseId:composed.prepared.workshareCaseId,installationSource:composed.prepared.source,selections:composed.prepared.selections};
 await put(root,'preparation.json',json(complete));return verify(root,raw,options);
 });
}
export async function reopenEcondbInstallation(options={}){
 return owned(options,async(root,leaseFds)=>verify(root,await readRequest(root),{...options,leaseFds}));
}
async function readRequest(root){return read(join(root,'prepare-request.json'),MAX_JSON);}
