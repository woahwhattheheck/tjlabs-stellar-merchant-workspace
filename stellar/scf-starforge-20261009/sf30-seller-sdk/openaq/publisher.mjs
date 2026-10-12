// SPDX-License-Identifier: MIT
// The maintained Frictionless publisher owns source capture, extraction, review, publication and customer delivery.
import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { openFrictionlessPublisher } from '../frictionless/model.mjs';
import { runFrictionlessCommand, inspectFrictionlessSource } from '../frictionless/source.mjs';
import { prepareFrictionlessRelease, stageFrictionlessRelease } from '../frictionless/release.mjs';
import { openLocalDatasetReceiving } from '../local-dataset-receiving/model.mjs';
import { startLocalDatasetReceivingServer } from '../local-dataset-receiving/server.mjs';
import { openPostgresSchedule } from '../postgres/publisher/schedule.mjs';
import { privateDirectory, readPrivate, readJson, createFile, atomicJson, bytes, digest, identity, fault } from '../postgres/publisher/files.mjs';
import { COLUMNS, sourceDescriptor } from './projection.mjs';
import { need, uuid } from './contract.mjs';
async function exists(p){try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function immutable(p,b){try{await createFile(p,b);}catch(e){if(e.code!=='EEXIST')throw e;need((await readPrivate(p,Math.max(1,b.length))).equals(b),'OPENAQ_PACKAGE_BYTES_CHANGED',undefined,409);}}
export async function openOpenAQPublication({directory,captureDirectory,capture,review,customer,environment=process.env,create=false}={}){
 need(capture.state==='COMPLETE'&&review.captureId===capture.id&&review.captureSha256===capture.captureSha256&&review.decision==='accepted'&&review.allowDerivedDelivery===true,'OPENAQ_ACCEPTED_DELIVERY_REVIEW_REQUIRED');
 const original={captureId:capture.id,captureSha256:capture.captureSha256,reviewId:review.id,reviewSha256:identity(review)};
 if(create){
  await privateDirectory(directory,true);await privateDirectory(join(directory,'source'),true);
  await immutable(join(directory,'binding.json'),bytes(original));
  await immutable(join(directory,'source','measurements.csv'),await readPrivate(join(captureDirectory,'measurements.csv'),64*1024*1024));
  await immutable(join(directory,'source','datapackage.json'),bytes(sourceDescriptor(capture,review)));
  await immutable(join(directory,'source','openaq-capture.json'),bytes(capture));
  await immutable(join(directory,'source','openaq-review.json'),bytes(review));
  const output=join(directory,'source-edition'),manifest=join(output,'capture.json');
  if(!await exists(manifest)){
   const args=['capture','--descriptor',join(directory,'source','datapackage.json'),'--output',output,
    '--reference',join(directory,'source','openaq-capture.json'),'--reference',join(directory,'source','openaq-review.json')];
   const references=new Set();
   for(const receipt of capture.receipts){references.add(join(captureDirectory,receipt.file));references.add(join(captureDirectory,'requests',receipt.requestId,'receipt.json'));}
   for(const path of references)args.push('--reference',path);
   await runFrictionlessCommand(args,{env:environment,stdout:null});
  }
  await runFrictionlessCommand(['inspect-capture','--capture',manifest],{env:environment,stdout:null});
  const source=join(directory,'source.json');
  if(!await exists(source))await runFrictionlessCommand(['suggest-source','--capture',manifest,'--output',source],{env:environment,stdout:null});
 }
 need(identity(await readJson(join(directory,'binding.json')))===identity(original),'OPENAQ_PUBLICATION_BINDING_CHANGED',undefined,409);
 const sourceFile=join(directory,'source.json'),publisherDirectory=join(directory,'publisher'),targetDirectory=join(directory,'dataset-versions');
 const publisher=await openFrictionlessPublisher({directory:publisherDirectory,create:!await exists(publisherDirectory),sourceFile,targetDirectory,environment});
 let local=null,schedule=null,browser=null,closed=false,closing=null;
 const check=()=>need(!closed,'OPENAQ_PUBLICATION_CLOSED');
 async function prepare(runId){
  check();uuid(runId);
  let saved;try{saved=publisher.run(runId);}catch(e){if(e.code!=='RUN_NOT_FOUND')throw e;}
  if(saved){
   if(['INTERRUPTED','FAILED','CANCELLED'].includes(saved.state)){try{return await publisher.recover(runId);}catch(e){return {...saved,recoveryError:e.code??'ORIGINAL_RECOVERY_FAILED'};}}
   return saved;
  }
  const source=await inspectFrictionlessSource(sourceFile,{env:environment});
  need(source.queries?.measurements,'OPENAQ_ORIGINAL_MEASUREMENT_QUERY_REQUIRED');
  let savedPlan;try{savedPlan=publisher.plan(1);}catch(e){if(e.code!=='PLAN_NOT_FOUND')throw e;}
  if(!savedPlan){
   savedPlan=await publisher.savePlan({title:'OpenAQ '+capture.id,query:'measurements',input:{},sourceHash:source.hash,
    dataset:{name:'openaq_observations',columns:Object.fromEntries(COLUMNS.map(name=>[name,{type:'string',nullable:false}])),
     filters:['location_id','sensor_id','parameter','unit','resolution','local_day','archive_local_day'],ranges:[],sorts:['datetime_utc','source_row'],
     defaultLimit:50,maxLimit:250,maxCellChars:65536,maxPageBytes:921600},
    extraction:{order:[{column:'capture_id',direction:'asc'}],maxRows:250000,maxBytes:64*1024*1024,maxRowBytes:1048576,timeoutMs:300000}});
  }
  need(savedPlan.data.sourceHash===source.hash&&savedPlan.data.query==='measurements','OPENAQ_ORIGINAL_PLAN_CHANGED',undefined,409);
  return publisher.startExtraction(savedPlan.id,{id:runId}).completion;
 }
 async function customerWorkspace(){
  check();need(customer,'OPENAQ_CUSTOMER_CONFIGURATION_REQUIRED','Choose the existing original DuckDB customer workspace in the host configuration.');
  if(!local)local=await openLocalDatasetReceiving({publisher,customer,environment});
  return local;
 }
 async function customerBrowser(){
  const workspace=await customerWorkspace();
  if(!schedule)schedule=await openPostgresSchedule({publisher});
  if(!browser)browser=await startLocalDatasetReceivingServer({workspace,port:0,schedule,ownsWorkspace:false});
  return {url:browser.url??browser.origin,workspaceId:workspace.workspaceId,customer:workspace.customer,publisherDirectory:publisher.directory};
 }
 async function close(){
  if(closing)return closing;closed=true;
  closing=(async()=>{const errors=[];
   for(const [name,handle]of[['browser',browser],['local',local],['schedule',schedule],['publisher',publisher]]){
    if(!handle)continue;try{await handle.close();if(name==='browser')browser=null;if(name==='local')local=null;if(name==='schedule')schedule=null;}catch(e){errors.push({name,error:e});}
   }
   if(errors.length){closing=null;throw new AggregateError(errors.map(x=>x.error),'OpenAQ original publication disposals failed: '+errors.map(x=>x.name).join(', '));}
  })();return closing;
 }
 return Object.freeze({directory,binding:original,publisher,prepare,customerWorkspace,customerBrowser,
  status:()=>publisher.status({limit:100}),
  inspect:(id,query)=>publisher.inspect(id,query),
  review:(id,input)=>publisher.review(id,input),publish:(id,reviewId)=>publisher.publish(id,reviewId),recover:id=>publisher.recover(id),
  async prepareRelease(runId,outputDirectory,payment,origin,path='/data'){
   check();return prepareFrictionlessRelease({publisher,runId,outputDirectory,payment,origin,path});
  },
  async stageRelease(input){check();return stageFrictionlessRelease(input);},close});
}
