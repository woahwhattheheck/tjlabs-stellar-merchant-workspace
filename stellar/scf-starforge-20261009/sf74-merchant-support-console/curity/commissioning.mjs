#!/usr/bin/env node
/**
 * Complete Curity commissioning on the selected original host and native case stores.
 * No service starts on import. The command uses one native flock and an immutable plan.
 */
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,open,link,unlink,lstat} from 'node:fs/promises';
import {dirname,resolve,relative,join,sep,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {startCurityConsole} from './http.mjs';
import {compareSourceEditions,openEdition,hash as sourceHash,stable as sourceStable} from './source.mjs';
import {validateReviewedEdition,selectedEventReferences,compareEditions} from './review.mjs';
import {reviewOAuthSource,readOAuthSource} from '../../sf93-seller-support-bundle/oauth-source.mjs';
import {importRuntimeHandoff} from '../runtime-support.mjs';

const own=Object.prototype.hasOwnProperty;
function need(value,message){if(!value)throw new Error(message);}
function canonical(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const equal=(a,b)=>canonical(a)===canonical(b);
const exists=async path=>{try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
async function json(path){return JSON.parse(await readFile(path,'utf8'));}
async function regular(path){
  const stat=await lstat(path);need(stat.isFile()&&!stat.isSymbolicLink(),'Select a complete regular original file: '+path);return stat;
}
async function fileIdentity(path){
  await regular(path);const digest=createHash('sha256');let bytes=0;
  for await(const block of createReadStream(path)){digest.update(block);bytes+=block.length;}
  return {sha256:digest.digest('hex'),bytes};
}
async function exactFile(path,bytes){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temporary=path+'.receiving-'+randomUUID();
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  try{await link(temporary,path);}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const actual=await readFile(path);
    need(actual.equals(bytes),'Existing original file differs; retain this operation and inspect '+path);
  }finally{await unlink(temporary).catch(()=>{});}
  return {path,...await fileIdentity(path)};
}
async function retainedJson(path,value){return exactFile(path,encode(value));}
async function newOrOriginal(path,factory){
  if(await exists(path))return json(path);
  const selected=await factory();
  try{await exactFile(path,encode(selected));return selected;}
  catch(error){if(await exists(path))return json(path);throw error;}
}
function safeName(value,label){
  need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(value),label+' must be a stable path-safe identifier.');return value;
}
function outside(child,parent,label){
  const rel=relative(parent,child);need(rel!==''&&(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)),label+' must be outside '+parent);
}
async function step(root,name,input,perform){
  const directory=join(root,'steps',safeName(name,'Step name'));
  await mkdir(directory,{recursive:true,mode:0o700});
  const request={schema:'curity.commissioning-step/v1',name,input,inputSha256:sha(canonical(input))};
  await retainedJson(join(directory,'INPUT.json'),request);
  const resultPath=join(directory,'RESULT.json');
  if(await exists(resultPath)){
    const old=await json(resultPath);
    need(old.inputSha256===request.inputSha256,'The original '+name+' input changed.');
    return old.value;
  }
  const value=await perform(directory);
  await retainedJson(resultPath,{schema:request.schema,name,inputSha256:request.inputSha256,completedAt:new Date().toISOString(),value});
  return value;
}
function serializablePlan(plan){
  need(plan&&plan.schema==='curity.commissioning-plan/v1','Expected a curity.commissioning-plan/v1 plan.');
  safeName(plan.operationId,'Operation ID');
  need(typeof plan.actor==='string'&&plan.actor.trim(),'Select the actual commissioning operator label.');
  need(typeof plan.installationId==='string'&&plan.installationId.trim(),'Select the installation identity for this publisher-example review.');
  need(plan.sourceContext==='PUBLISHER_EXAMPLE','This programme operates the exact published examples. Supplier work uses the original source operator.');
  need(plan.observer&&typeof plan.observer.endpoint==='string'&&typeof plan.observer.tokenEnv==='string','Select the existing observer endpoint and token environment-variable name.');
  need(/^[A-Za-z_][A-Za-z0-9_]*$/.test(plan.observer.tokenEnv),'Use the existing token variable NAME.');
  need(!own.call(plan.observer,'token')&&!own.call(plan.observer,'bearerToken'),'Do not put token values in the plan.');
  need(plan.incident&&plan.incident.sourceId&&plan.incident.incidentId&&plan.incident.routeId,'Select the actual original incident, source and registration route.');
  need(typeof plan.workspacePath==='string'&&isAbsolute(plan.workspacePath),'Select the actual serialized native workspace by absolute path.');
  need(plan.sender&&plan.recipient,'Select both original sender and separate recipient workspace locations.');
  need(Array.isArray(plan.applicationFiles)&&plan.applicationFiles.length,'Select the complete readable application closure.');
  need(typeof plan.root==='string'&&isAbsolute(plan.root),'Select an absolute private programme directory.');
  for(const side of ['sender','recipient']){
    for(const key of ['directory','casesDir'])need(typeof plan[side][key]==='string'&&isAbsolute(plan[side][key]),side+'.'+key+' must be absolute.');
    outside(resolve(plan[side].directory),resolve(plan[side].casesDir),side+' companion');
  }
  need(resolve(plan.sender.directory)!==resolve(plan.recipient.directory),'Recipient companion must be separate.');
  need(resolve(plan.sender.casesDir)!==resolve(plan.recipient.casesDir),'Recipient cases must be separate.');
  outside(resolve(plan.sender.directory),resolve(plan.recipient.directory),'Sender companion');
  outside(resolve(plan.recipient.directory),resolve(plan.sender.directory),'Recipient companion');
  outside(resolve(plan.sender.casesDir),resolve(plan.recipient.casesDir),'Sender cases');
  outside(resolve(plan.recipient.casesDir),resolve(plan.sender.casesDir),'Recipient cases');
  for(const side of ['sender','recipient'])outside(resolve(plan.root),resolve(plan[side].casesDir),'Programme directory');
  need(plan.sender.incidentSources,'Select the original configured incident-source profile.');
  need(plan.recipient.incidentSources===undefined,'The recipient imported incident binding is passive; do not attach the original incident source automatically.');
  return plan;
}
async function verifyClosure(files){
  const names=new Set();let total=0;
  for(const file of files){
    need(typeof file.name==='string'&&!isAbsolute(file.name)&&!file.name.split(/[\\/]/).some(part=>part==='..'||part==='.'||!part),'Use complete safe application member names.');
    need(!names.has(file.name),'Repeated application member: '+file.name);names.add(file.name);
    need(isAbsolute(file.path),'Application source paths must be absolute.');
    const identity=await fileIdentity(file.path);
    need(identity.sha256===file.sha256&&identity.bytes===file.bytes,'Application source identity changed: '+file.name);
    total+=identity.bytes;
  }
  need(files.some(file=>file.name.endsWith('/curity/commissioning.mjs')),'The readable application closure must include this complete commissioning programme.');
  return {count:files.length,bytes:total,inventorySha256:sha(canonical(files.map(({name,bytes,sha256})=>({name,bytes,sha256}))))};
}
async function selectedPublisherInputs(plan,root){
  const path=plan.publisherInputsPath||fileURLToPath(new URL('./publisher-inputs.json',import.meta.url));
  await regular(path);const original=await readFile(path);const packet=JSON.parse(original);
  need(packet.schema==='curity.publisher-inputs/v1'&&packet.sourceContext==='PUBLISHER_EXAMPLE','Select the retained publisher input packet.');
  need(packet.sourceStatus==='PRIMARY_WEB_READER_TRANSCRIPTION','Preserve the published-example source status.');
  const first=packet.examples.find(item=>item.id==='jsonlayout');
  const following=packet.examples.find(item=>item.id==='structured-ingestion');
  need(first&&following&&packet.examples.length===2,'Select the exact two published input representations.');
  const total=Buffer.byteLength(first.content)+Buffer.byteLength(following.content);
  need(total<=1024**3,'Initial and following original exports together exceed one GiB.');
  await exactFile(join(root,'originals','publisher-inputs.json'),original);
  const result={sourceUrl:packet.sourceUrl,sourceStatus:packet.sourceStatus,totalOriginalFiles:2,totalOriginalBytes:total,examples:[]};
  for(const example of [first,following]){
    const saved=await exactFile(join(root,'originals',safeName(example.name,'Published original filename')),Buffer.from(example.content));
    result.examples.push({...example,...saved,sourceUri:packet.sourceUrl});
  }
  return result;
}
async function observe(plan,root,environment){
  return step(root,'original-observer',{selection:plan.observer},async directory=>{
    const reviewed=await reviewOAuthSource(plan.observer,{environment});
    const actual=await readOAuthSource(reviewed.oauth,{environment});
    need(Buffer.isBuffer(actual.bytes),'The original observer reader must return original bytes.');
    need(actual.observation.configurationSha256===reviewed.source.configurationSha256,'The observer configuration changed between review and reading. Keep this operation and select the current original configuration.');
    need(actual.observation.resource===reviewed.oauth.resource,'The original observer resource changed.');
    const original=await exactFile(join(directory,'oauth-source.json'),actual.bytes);
    await retainedJson(join(directory,'source-review.json'),reviewed);
    return {review:reviewed,original,resource:actual.observation.resource,configurationSha256:actual.observation.configurationSha256,observation:actual.observation};
  });
}
function sourceInput(plan,ids,example,observer,following){
  const name=following?'following':'initial';
  const mapping=plan.mappingOverrides?.[name]||example.mapping;
  return {
    id:following?ids.followingInput:ids.initialInput,
    installationId:plan.installationId,sourceContext:'PUBLISHER_EXAMPLE',
    sourceEdition:plan.operationId+'.publisher.'+name,
    files:[{name:example.name,bytes:example.bytes,sha256:example.sha256,format:example.format,sourceUri:example.sourceUri,
      exportId:'Curity-publisher-'+example.id,metadata:{sourceStatus:'PRIMARY_WEB_READER_TRANSCRIPTION',exampleId:example.id}}],
    mapping,
    coverage:{profiles:[],listeners:[],source:'Published documentation examples',completeInstallationExport:false},
    binding:{installationId:plan.installationId,resourceId:observer.resource,configurationHash:observer.configurationSha256,
      window:{start:'2025-03-05T10:01:24Z',end:'2025-03-05T10:01:25Z'},observation:null},
    review:{confirmed:false,operator:null,reason:null,decisions:[],selection:[]}
  };
}
async function receiveSource(controller,plan,ids,example,observer,following,root){
  const label=following?'following':'initial';
  const input=sourceInput(plan,ids,example,observer,following);
  const built=await step(root,label+'-source',input,async()=>{
    await controller.prepareSource(input);
    await controller.uploadSource({inputId:input.id,index:0,stream:createReadStream(example.path)});
    return controller.buildSource({inputId:input.id});
  });
  const pages=await controller.source.events({editionId:built.editionId,after:0,limit:10});
  need(pages.total===1&&pages.items.length===1,'The complete published input must retain its one original event.');
  const event=pages.items[0];
  need(event.instant?.literal==='2025-03-05T10:01:24.615014186Z','The published nanosecond event instant was not retained exactly.');
  need(event.fields?.id?.value==='923cc315729340008510706b01990d8a','The original published event ID changed.');
  if(following)need(event.fields.message?.present===true&&event.fields.message.type==='string'&&event.fields.message.value==='','The published structured outer empty message must remain an explicit empty string.');
  const review={confirmed:true,operator:plan.actor,reason:'Commissioning review of the exact published '+example.id+' example and its explicitly selected mapping; documentation scope retained.',
    decisions:[],selection:[{sourceId:'source-1',recordOrdinal:1}]};
  const reviewInput={inputId:following?ids.followingReview:ids.initialReview,sourceInputId:input.id,review};
  const reviewed=await step(root,label+'-review',reviewInput,async()=>{
    await controller.freezeReview(reviewInput);
    return controller.buildSource({inputId:reviewInput.inputId});
  });
  const manifest=await controller.source.manifest(reviewed.editionId);
  validateReviewedEdition(manifest);
  const refs=selectedEventReferences(manifest);
  need(refs.length===1&&refs[0].recordOrdinal===1,'The reviewed original occurrence did not survive selection.');
  const located=await controller.source.locate(manifest.id);
  return {inputId:input.id,reviewInputId:reviewInput.inputId,editionId:manifest.id,reviewId:manifest.review.id,eventKeys:refs.map(ref=>ref.eventKey),directory:located.directory,manifestSha256:located.manifestSha256,manifest};
}
async function createNativeCase(sender,plan,ids,observer,root){
  const controller=sender.providerExtension.controller;
  need(controller.incidentDesk&&controller.store,'The selected original controller must expose its unchanged incident desk and native store.');
  const prepared=await step(root,'original-incident-case',{sourceId:plan.incident.sourceId,incidentId:plan.incident.incidentId,routeId:plan.incident.routeId,workspacePath:plan.workspacePath,configurationSha256:observer.configurationSha256},async directory=>{
    const workspaceText=await readFile(plan.workspacePath,'utf8');
    const view=await controller.incidentDesk.view(plan.incident.sourceId,plan.incident.incidentId);
    const actualIncident=view.incident;
    need(actualIncident&&actualIncident.revision!==undefined,'The original incident view is incomplete.');
    const result=await controller.incidentDesk.prepareCase(plan.incident.sourceId,plan.incident.incidentId,{
      expectedRevision:actualIncident.revision,workspaceText,routeId:plan.incident.routeId});
    need(typeof result.handoff==='string','The original incident desk must return its complete support handoff string.');
    const imported=await importRuntimeHandoff(result.handoff);
    need(typeof imported.workspaceText==='string'&&typeof imported.supportText==='string','The original native handoff did not restore both source documents.');
    await exactFile(join(directory,'original-incident-handoff.json'),Buffer.from(result.handoff));
    await exactFile(join(directory,'original-case-report.html'),Buffer.from(result.html));
    await retainedJson(join(directory,'original-case-report.json'),result.report);
    return {workspaceText:imported.workspaceText,supportText:imported.supportText,metadata:imported.metadata,incident:{sourceId:plan.incident.sourceId,incidentId:plan.incident.incidentId,expectedRevision:actualIncident.revision,configurationSha256:view.configHash}};
  });
  const metadata={...prepared.metadata,...plan.initialMetadata,merchant:plan.initialMetadata?.merchant||'Curity published-example commissioning',owner:plan.actor,followUpOn:'',
    notes:[prepared.metadata?.notes||'','[curity-commissioning:'+plan.operationId+']','Internal published-example commissioning case.'].filter(Boolean).join('\n')};
  const input={id:ids.caseId,expectedRevision:null,workspaceText:prepared.workspaceText,supportText:prepared.supportText,metadata};
  const result=await step(root,'create-native-case',input,()=>controller.store.save(input));
  need(result.case.id===ids.caseId,'Native case creation returned a different case identity.');
  return {caseId:ids.caseId,incident:prepared.incident,created:result};
}
async function attach(controller,root,label,operationId,caseId,source,actor,metadata,incident){
  return step(root,label,{operationId,caseId,editionId:source.editionId,reviewId:source.reviewId,eventKeys:source.eventKeys,actor,metadata,incident},async directory=>{
    const request=await newOrOriginal(join(directory,'BRIDGE_INPUT.json'),async()=>{
      const current=await controller.store.read(caseId);
      return {operationId,caseId,expectedRevision:current.revision,editionId:source.editionId,reviewId:source.reviewId,eventKeys:source.eventKeys,actor,
        note:'Retain the complete '+label+' published example, exact mapping and selected original occurrence.',metadata,...(incident?{incident}:{})};
    });
    const prepared=await controller.bridge.prepare(request);
    const result=await controller.bridge.apply({operationId});
    return {plan:prepared,result};
  });
}
async function editCase(controller,root,label,caseId,changes){
  return step(root,label,{caseId,changes},async directory=>{
    const request=await newOrOriginal(join(directory,'NATIVE_INPUT.json'),async()=>{
      const current=await controller.store.read(caseId);
      const metadata={...current.metadata,...changes};
      if(own.call(changes,'appendNote')){metadata.notes=[current.metadata.notes||'',changes.appendNote].filter(Boolean).join('\n');delete metadata.appendNote;}
      return {id:caseId,expectedRevision:current.revision,workspaceText:current.workspaceText,supportText:current.supportText,metadata};
    });
    const result=await controller.store.save(request);
    return {result,metadata:request.metadata};
  });
}
async function compareAll(root,initial,following){
  const before=await openEdition(initial.directory,{verify:true});
  const after=await openEdition(following.directory,{verify:true});
  need(before.id===initial.editionId&&after.id===following.editionId,'The selected complete source edition changed.');
  need(before.installationId===after.installationId,'Compare editions from the same selected installation.');
  const directory=join(root,'complete-source-comparison');
  if(await exists(join(directory,'comparison.json'))){
    const old=await json(join(directory,'comparison.json'));
    const {id,...body}=old;
    need(id==='curity-comparison-'+sourceHash(sourceStable(body)),'The retained complete comparison identity changed.');
    need(old.schema==='curity.complete-source-comparison/v1'&&old.scope==='ALL_CLASSIFIABLE_EVENT_IDENTITIES','The retained comparison has another schema or scope.');
    need(old.before===initial.editionId&&old.after===following.editionId&&old.installationId===before.installationId,'Existing complete comparison belongs to another source selection.');
    need(old.changes.path==='changes.jsonl','Select the original complete comparison member.');
    const actual=await fileIdentity(join(directory,old.changes.path));
    need(actual.sha256===old.changes.sha256&&actual.bytes===old.changes.bytes,'The complete comparison output changed.');
    return old;
  }
  return compareSourceEditions(initial.directory,following.directory,{directory});
}
async function openConsole(options,applicationFiles){
  return startCurityConsole({...options,applicationFiles,port:options.port??0,allowLoopback:true});
}
async function captureSelectedCase(controller,id){
  const current=await controller.store.read(id);
  return {id:current.id,revision:current.revision,metadata:current.metadata,workspaceSha256:sha(current.workspaceText),
    supportSha256:current.supportText===null?null:sha(current.supportText||'')};
}
export async function runCommissioning(planInput,{environment=process.env,lockHeld=false}={}){
  need(lockHeld,'Run the CLI under its native process lock, or supply an already-held programme lease.');
  const plan=serializablePlan(planInput),root=resolve(plan.root);
  await mkdir(root,{recursive:true,mode:0o700});
  const originalPlan=await retainedJson(join(root,'PLAN.json'),plan);
  const ids=await newOrOriginal(join(root,'IDENTITY.json'),async()=>({
    schema:'curity.commissioning-identity/v1',operationId:plan.operationId,createdAt:new Date().toISOString(),
    caseId:randomUUID(),initialInput:randomUUID(),initialReview:randomUUID(),followingInput:randomUUID(),followingReview:randomUUID(),
    initialAttach:randomUUID(),followingAttach:randomUUID(),exportId:randomUUID(),receiveId:randomUUID(),rollbackId:randomUUID(),returnedExportId:randomUUID()
  }));
  const closure=await verifyClosure(plan.applicationFiles);
  const publisher=await selectedPublisherInputs(plan,root);
  const observer=await observe(plan,root,environment);
  const startOptions={...plan.sender,environment};
  let sender,recipient;
  try{
    sender=await openConsole(startOptions,plan.applicationFiles);
    const control=sender.providerExtension.controller;
    const native=await createNativeCase(sender,plan,ids,observer,root);
    const initial=await receiveSource(control,plan,ids,publisher.examples[0],observer,false,root);
    const first=await attach(control,root,'attach-initial-source',ids.initialAttach,native.caseId,initial,plan.actor,
      {nextAction:'Inspect the original published Curity source and mapping.'},native.incident);
    const intervening=await editCase(control,root,'intervening-staff-edit',native.caseId,{
      appendNote:'Commissioning staff-edit scenario: preserve this note when the following source edition is attached.'
    });
    const following=await receiveSource(control,plan,ids,publisher.examples[1],observer,true,root);
    const fullComparison=await compareAll(root,initial,following);
    const selectedComparison=compareEditions(initial.manifest,following.manifest);
    await retainedJson(join(root,'reviewed-selection-comparison.json'),selectedComparison);
    const followingAttach=await attach(control,root,'attach-following-source',ids.followingAttach,native.caseId,following,plan.actor,
      {nextAction:'Review the following structured published Curity source.',followUpOn:plan.followUpOn||ids.createdAt.slice(0,10)},native.incident);
    const late=await editCase(control,root,'later-staff-edit',native.caseId,{
      nextAction:'Staff-owned follow-up retained after source review.',
      appendNote:'Commissioning staff-edit scenario: preserve this later note through export, receiving and rollback.'
    });
    const senderCompare=await control.bridge.compare({operationId:ids.followingAttach});
    need(senderCompare.fields.some(field=>field.key==='nextAction'&&field.state==='STAFF_CHANGED'),'The original case comparison must detect the later staff-owned next action.');
    const beforeExport=await captureSelectedCase(control,native.caseId);
    need(beforeExport.metadata.notes.includes(intervening.metadata.notes),'Following source handling lost the intervening staff note.');
    const exported=await step(root,'export-complete-case',{operationId:ids.followingAttach,exportId:ids.exportId},()=>control.portable.exportPackage({operationId:ids.followingAttach,exportId:ids.exportId}));
    const receiveRequest={packageDirectory:exported.directory,expectedManifestSha256:exported.manifestSha256,requestId:ids.receiveId,actor:plan.actor,
      receivingDirectory:join(resolve(plan.recipient.directory),'commissioning-receiving',ids.receiveId)};
    recipient=await openConsole({...plan.recipient,environment},plan.applicationFiles);
    let receiver=recipient.providerExtension.controller;
    const received=await step(root,'receive-complete-case',receiveRequest,()=>receiver.portable.receive(receiveRequest));
    const receivedId=received.caseBinding.case.id;
    const receivedOperationId=received.caseBinding.operationId;
    need(receivedId!==native.caseId,'The independent recipient must retain its actual native case identity.');
    for(const source of [initial,following]){
      const manifest=await receiver.source.manifest(source.editionId);
      need(manifest.id===source.editionId,'The complete case handover omitted a referenced source edition.');
      const located=await receiver.source.locate(source.editionId);
      await openEdition(located.directory,{verify:true});
    }
    const returnedStaff=await editCase(receiver,root,'recipient-staff-edit',receivedId,{
      nextAction:'Recipient staff-owned follow-up retained after reopening.',
      appendNote:'Commissioning recipient staff-edit scenario: this returned-case note remains authoritative.'
    });
    const beforeReopen=await captureSelectedCase(receiver,receivedId);
    await recipient.close();recipient=null;
    recipient=await openConsole({...plan.recipient,environment},plan.applicationFiles);
    receiver=recipient.providerExtension.controller;
    const reopened=await captureSelectedCase(receiver,receivedId);
    need(equal(beforeReopen,reopened),'Reopening the original recipient changed its native case.');
    const replay=await receiver.portable.receive(receiveRequest);
    need(replay.caseBinding.case.id===receivedId,'Repeated receiving created another native case.');
    const afterReplay=await captureSelectedCase(receiver,receivedId);
    need(equal(reopened,afterReplay),'Repeated receiving overwrote later recipient staff work.');
    const rollback=await step(root,'selective-rollback',{operationId:receivedOperationId,rollbackId:ids.rollbackId,actor:plan.actor},async directory=>{
      const request=await newOrOriginal(join(directory,'ROLLBACK_INPUT.json'),async()=>{
        const current=await receiver.store.read(receivedId);
        return {operationId:receivedOperationId,rollbackId:ids.rollbackId,expectedRevision:current.revision,actor:plan.actor};
      });
      return receiver.bridge.rollback(request);
    });
    const afterRollback=await captureSelectedCase(receiver,receivedId);
    need(afterRollback.metadata.nextAction===returnedStaff.metadata.nextAction,'Selective rollback overwrote the staff-owned next action.');
    need(afterRollback.metadata.notes===returnedStaff.metadata.notes,'Selective rollback overwrote later staff notes.');
    need(rollback.skipped.some(field=>field.key==='nextAction'&&field.reason==='STAFF_CHANGED'),'Rollback did not report the retained staff-owned field.');
    need(rollback.restored.length>0,'The programme must restore at least one still-matching source-owned field.');
    need(afterRollback.workspaceSha256===beforeReopen.workspaceSha256&&afterRollback.supportSha256===beforeReopen.supportSha256,'Rollback changed original case source documents.');
    const returnedPackage=await step(root,'export-returned-case',{operationId:receivedOperationId,exportId:ids.returnedExportId},()=>receiver.portable.exportPackage({operationId:receivedOperationId,exportId:ids.returnedExportId}));
    const report={
      schema:'curity.commissioning-result/v1',operationId:plan.operationId,status:'COMPLETE',completedAt:new Date().toISOString(),
      sourceContext:'PUBLISHER_EXAMPLE',publisherSourceStatus:publisher.sourceStatus,plan:originalPlan,application:closure,
      originalObserver:{source:observer.original,resource:observer.resource,configurationSha256:observer.configurationSha256},
      windows:{publishedEvents:{start:'2025-03-05T10:01:24Z',end:'2025-03-05T10:01:25Z'},liveObservation:'Retained separately in original-observer/oauth-source.json; no per-event aggregate join'},
      sourceBudget:{originalFiles:publisher.totalOriginalFiles,originalBytes:publisher.totalOriginalBytes,reviewEditionsReuseOriginals:true},
      originalIncident:native.incident,senderCase:{id:native.caseId,beforeExport},recipientCase:{id:receivedId,beforeReopen,reopened,afterReplay,afterRollback},
      sources:{initial:{editionId:initial.editionId,manifestSha256:initial.manifestSha256},following:{editionId:following.editionId,manifestSha256:following.manifestSha256}},
      completeComparison:fullComparison,selectedComparison,initialAttachment:first.result,followingAttachment:followingAttach.result,
      staffEditScenario:{performedBy:'Commissioning programme',operator:plan.actor,intervening:intervening.result,later:late.result,recipient:returnedStaff.result},
      senderComparison:senderCompare,exported,received,replay,rollback,returnedPackage,
      acceptance:{inputContext:'Published Curity examples',customerAcceptance:false,commercialOperation:'DBC61-CURITY-OAUTH-SUPPORT-WORKSHARE-20261013'}
    };
    const finalPath=join(root,'COMMISSIONING.json');
    if(await exists(finalPath)){
      const old=await json(finalPath);need(old.operationId===report.operationId,'The final report belongs to another operation.');return old;
    }
    await retainedJson(finalPath,report);
    return report;
  } finally{
    if(recipient)await recipient.close();
    if(sender)await sender.close();
  }
}
export async function commissioningStatus(root){
  const path=resolve(root);
  const identity=await exists(join(path,'IDENTITY.json'))?await json(join(path,'IDENTITY.json')):null;
  const complete=await exists(join(path,'COMMISSIONING.json'))?await json(join(path,'COMMISSIONING.json')):null;
  return {schema:'curity.commissioning-status/v1',root:path,identity,complete:!!complete,result:complete};
}
async function main(){
  const args=process.argv.slice(2);
  if(args[0]==='status'){
    need(args[1],'Usage: commissioning.mjs status /absolute/operation-directory');
    process.stdout.write(JSON.stringify(await commissioningStatus(args[1]),null,2)+'\n');return;
  }
  const underLock=args[0]==='--under-lock';
  const planPath=resolve(underLock?args[1]||'':args[0]||'');
  need((underLock?args[1]:args[0]),'Usage: commissioning.mjs /absolute/plan.json');
  const plan=serializablePlan(await json(planPath));
  await mkdir(resolve(plan.root),{recursive:true,mode:0o700});
  if(!underLock){
    const child=spawn('flock',['--nonblock',join(resolve(plan.root),'.commissioning.lock'),process.execPath,fileURLToPath(import.meta.url),'--under-lock',planPath],
      {stdio:'inherit',env:{...process.env,CURITY_COMMISSIONING_LOCK_ROOT:resolve(plan.root)}});
    const code=await new Promise((resolveCode,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>signal?reject(new Error('Original commissioning process exited by '+signal)):resolveCode(code??1));});
    process.exitCode=code;return;
  }
  need(process.env.CURITY_COMMISSIONING_LOCK_ROOT===resolve(plan.root),'The original programme lock was not selected.');
  const result=await runCommissioning(plan,{lockHeld:true});
  process.stdout.write(JSON.stringify({status:result.status,operationId:result.operationId,report:join(resolve(plan.root),'COMMISSIONING.json'),
    senderCase:result.senderCase.id,recipientCase:result.recipientCase.id,returnedPackage:result.returnedPackage.directory},null,2)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{
  process.stderr.write(error.stack+'\n');process.exitCode=1;
});
