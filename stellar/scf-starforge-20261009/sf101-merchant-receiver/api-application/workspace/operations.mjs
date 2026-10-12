// MIT. Complete merchant workflows, composed through original payment and execution owners.
import {join,dirname,relative,sep} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {lstat,rename} from 'node:fs/promises';
import {compileCheckout,orderHandoff} from '../../checkout-config.mjs';
import {prepareHandoff} from '../../checkout.mjs';
import {openOutbox} from '../../../sf98-merchant-delivery/outbox.mjs';
import {prepareApplicationConfiguration,materializeApplicationConfiguration,jsonBytes} from '../configuration.mjs';
import {readApplicationRuntime} from '../recovery.mjs';
import {native,originalApplication,merchantBackup,originalExecution} from './native.mjs';
import {createExport,exportView,readExport,retainJson,existingJson} from './exports.mjs';
import {need,UUID,HASH,REF,REQUEST,text,integer,absolute,ownedDirectory,ownedBytes,writeExact,encoded,parse,
 canonical,digest,offerDraft,readSelectedSource,selectedApiPort} from './configuration.mjs';

const FIELDS={
 source_refresh:[],offer_prepare:['expectedSourceSha256','title','allowanceUnits','routes','workerPort','apiPort'],
 offer_publish:['offerId'],offer_adopt:['label','profilePath','planFile'],
 order_prepare:['offerId','orderReference','label'],order_adopt:['offerId','orderReference','label'],
 start:['offerId'],stop:[],attach_pass:['orderReference'],
 access:['orderReference','accessRevision','action','reason','expiresAt'],
 recover_call:['offerId','orderReference','requestId','callRevision','reason'],
 release_call:['offerId','orderReference','requestId','callRevision','reason'],
 export_usage:['orderReference'],export_result:['offerId','executionId'],
 backup:['offerId','label','resumeService'],restore:['backupId','label'],
};
export const KINDS=Object.freeze(Object.keys(FIELDS));
const id=value=>need(UUID.test(value),'API_MERCHANT_IDENTIFIER_REQUIRED');
const reference=value=>need(REF.test(value),'ORDER_REFERENCE_INVALID');
export function validateAction(kind,body){
 need(FIELDS[kind]&&body&&typeof body==='object'&&!Array.isArray(body),'API_MERCHANT_ACTION_REQUIRED');
 need(Object.keys(body).every(key=>['operationId','expectedRevision',...FIELDS[kind]].includes(key)),
  'API_MERCHANT_ACTION_FIELDS_REQUIRED');
 id(body.operationId);integer(body.expectedRevision,1,Number.MAX_SAFE_INTEGER,'API_MERCHANT_REVISION_REQUIRED');
 for(const name of ['offerId','backupId'])if(body[name]!==undefined)id(body[name]);
 if(body.orderReference!==undefined)reference(body.orderReference);
 if(body.label!==undefined)text(body.label,240,'API_MERCHANT_LABEL_REQUIRED');
 if(body.reason!==undefined)text(body.reason,500,'API_MERCHANT_REASON_REQUIRED');
 if(body.requestId!==undefined)need(REQUEST.test(body.requestId),'API_MERCHANT_REQUEST_ID_REQUIRED');
 if(body.executionId!==undefined)need(/^sf101-[a-f0-9]{64}$/.test(body.executionId),'APP_OPERATION_REQUIRED');
 if(body.callRevision!==undefined)integer(body.callRevision,1,Number.MAX_SAFE_INTEGER,'APP_CALL_REVISION_REQUIRED');
 if(body.accessRevision!==undefined)integer(body.accessRevision,0,2147483646,'INVALID_EXPECTED_REVISION');
 if(kind==='access'){
  need(['suspend','resume','expire','clear-expiry'].includes(body.action),'INVALID_ACTION');
  need(body.action==='expire'?typeof body.expiresAt==='string':body.expiresAt===undefined||body.expiresAt===null,
   'INVALID_EXPIRY');
 }
 if(kind==='offer_prepare')need(HASH.test(body.expectedSourceSha256),'API_MERCHANT_SOURCE_ID_REQUIRED');
 if(kind==='offer_adopt'){absolute(body.profilePath);absolute(body.planFile);}
 if(kind==='backup')need(typeof body.resumeService==='boolean','API_MERCHANT_RESUME_SELECTION_REQUIRED');
 const optional={access:['expiresAt']};
 for(const field of FIELDS[kind])if(!(optional[kind]??[]).includes(field))
  need(body[field]!==undefined,'API_MERCHANT_ACTION_FIELD_REQUIRED');
 return structuredClone(body);
}
export function offerView(offer){
 return {id:offer.id,title:offer.title,status:offer.status,createdAt:offer.createdAt,plan:offer.plan,
  profilePath:offer.profilePath,planFile:offer.planFile,ports:offer.ports,sourceSha256:offer.sourceSha256,
  ...(offer.exportId?{exportId:offer.exportId}:{}),
  ...(offer.restoredFrom?{restoredFrom:offer.restoredFrom}:{}),...(offer.error?{error:offer.error}:{})};
}
function receiptMember(name,path,contentType){return {name,path,contentType};}
async function offerContext(workspace,offer){
 const raw=parse(await ownedBytes(offer.checkoutFile,131072));
 need(digest(encoded(raw))===offer.checkoutSha256,'API_MERCHANT_CHECKOUT_SELECTION_CHANGED',409);
 const checkout=compileCheckout(raw);
 const bytes=await ownedBytes(offer.planFile,1048576);
 need(bytes.length===offer.planBytes&&digest(bytes)===offer.planSha256,'API_MERCHANT_PLAN_CHANGED',409);
 const plan=await native(workspace.configuration,'plan',{plan:parse(bytes)},{environment:workspace.environment});
 need(canonical(plan)===canonical(offer.plan),'API_MERCHANT_PLAN_CHANGED',409);
 return {checkout,raw,bytes,plan};
}
async function ensureOfferRuntime(workspace,offer){
 need(offer.status==='READY','API_MERCHANT_OFFER_NOT_PUBLISHED',409);
 const runtime=await readApplicationRuntime(offer.profilePath);
 const {checkout}=await offerContext(workspace,offer);
 need(runtime.gateway.state===checkout.state&&runtime.profileSha256===offer.profileSha256&&
  canonical(runtime.source.identity)===canonical(offer.applicationSource),
  'API_MERCHANT_OFFER_RUNTIME_CHANGED',409);
 const selected=new Map(runtime.gateway.routes.map(route=>[route.id,route]));
 need(offer.plan.routes.every(route=>{
  const actual=selected.get(route.id);return actual&&route.method===actual.method&&route.path===actual.path;
 }),'API_MERCHANT_OFFER_ROUTES_CHANGED',409);
 return runtime;
}
export {offerContext,ensureOfferRuntime};

async function preparedOffer(workspace,operation,request,directory){
 const resultPath=join(directory,'prepared-offer.json');
 return retainJson(resultPath,async()=>{
  const source=await readSelectedSource(workspace.configuration);
  need(source.sha256===request.expectedSourceSha256,'API_MERCHANT_SELECTED_SOURCE_CHANGED',409);
  const draft=offerDraft(request,source),offerDirectory=join(workspace.configuration.directory,'offers',operation.id);
  await ownedDirectory(offerDirectory,{create:true});
  const plan=await native(workspace.configuration,'plan',{plan:{schema:'stellar-forge.sf101.api-pass.v1',
   title:draft.title,allowanceUnits:draft.allowanceUnits,routes:draft.routes.map(({id,method,path,units})=>({id,method,path,units}))}},
   {environment:workspace.environment});
  const planBytes=encoded(plan),planFile=join(offerDirectory,'api-pass.json');
  await writeExact(planFile,planBytes);
  const checkoutFile=join(offerDirectory,'checkout.json'),checkoutBytes=encoded(source.checkoutRaw);
  await writeExact(checkoutFile,checkoutBytes);
  const inputGateway=join(offerDirectory,'gateway-input.json');
  const gateway={schema:'stellar-forge.sf101.api-gateway.v1',state:source.checkout.state,actor:workspace.configuration.actor,
   routes:draft.routes.map(route=>({id:route.id,method:route.method,path:route.path,
    upstream:'http://127.0.0.1:'+draft.workerPort,query:[],headerEnv:{},
    timeoutSeconds:route.timeoutSeconds,maxRequestBytes:Math.min(route.maxRequestBytes,1048576),
    maxResponseBytes:route.maxResponseBytes}))};
  await writeExact(inputGateway,encoded(gateway));
  const preparationPath=join(offerDirectory,'application-preparation.json');
  const preparation=await retainJson(preparationPath,()=>prepareApplicationConfiguration({
   merchant:workspace.configuration.merchant,gateway:inputGateway,directory:join(offerDirectory,'application'),
   port:draft.workerPort,mappings:draft.routes.map(({id,functionId})=>({id,functionId})),bindRoutes:true}));
  return {id:operation.id,title:draft.title,status:'PREPARED',createdAt:operation.createdAt,
   sourceSha256:source.sha256,plan,planFile,planSha256:digest(planBytes),planBytes:planBytes.length,
   checkoutFile,checkoutSha256:digest(checkoutBytes),profilePath:preparation.result.profile,
   preparationPath,preparationSha256:digest(jsonBytes(preparation)),ports:{worker:draft.workerPort,api:draft.apiPort},
   originalSource:source.merchant.identity};
 });
}
async function offerExport(workspace,operation,offer){
 const members=[receiptMember('api-pass.json',offer.planFile,'application/json'),
  receiptMember('checkout.json',offer.checkoutFile,'application/json'),
  {name:'RECEIVING.md',content:'# API offer\n\n'+offer.title+'\n\n'+
   'The plan fixes purchased allowance and route prices. checkout.json retains the original payment terms and public checkout route. '+
   (offer.status==='READY'?'Use application.json with the original api-application commands, or start the service in the merchant workspace. ': 
    'Publish this prepared offer in its original merchant workspace to materialize the retained application configuration. ')+
   'Prepare a customer handoff against this offer to enroll the same exact plan.\n',contentType:'text/markdown; charset=utf-8'}];
 if(offer.status==='READY')members.push(receiptMember('application.json',offer.profilePath,'application/json'));
 const manifest=await createExport(workspace.configuration,{id:operation.id,kind:'api-offer',label:offer.title,
  createdAt:operation.createdAt,members});
 await workspace.rememberExport(manifest);
 await workspace.change(state=>{const selected=state.offers.find(item=>item.id===offer.id);
  need(selected,'API_MERCHANT_OFFER_NOT_FOUND',404);
  if(selected.status===offer.status||!selected.exportId)selected.exportId=manifest.id;});
 return exportView(manifest);
}
async function publishOffer(workspace,operation,offer){
 const preparation=parse(await ownedBytes(offer.preparationPath,4*1024*1024));
 await materializeApplicationConfiguration(preparation,{expectedSha256:offer.preparationSha256});
 const runtime=await readApplicationRuntime(offer.profilePath),{checkout}=await offerContext(workspace,offer);
 await native(workspace.configuration,'initialize',{state:checkout.state},{environment:workspace.environment});
 const updated={...offer,status:'READY',profileSha256:runtime.profileSha256,applicationSource:runtime.source.identity};
 await workspace.change(state=>{
  const index=state.offers.findIndex(item=>item.id===offer.id);
  need(index>=0,'API_MERCHANT_OFFER_NOT_FOUND',404);
  state.offers[index]=updated;
 });
 const exported=await offerExport(workspace,operation,updated);
 return {offerId:offer.id,offer:offerView(workspace.offer(offer.id)),export:exported};
}
async function handoffFiles(workspace,operation,request,directory,adopt){
 const offer=workspace.offer(request.offerId);await ensureOfferRuntime(workspace,offer);
 const {checkout,bytes}=await offerContext(workspace,offer);
 const original=workspace.findOrder(request.orderReference);
 if(original)need(original.offerId===offer.id&&original.label===request.label,
  'API_MERCHANT_ORDER_ALREADY_SELECTED',409);
 const orderDirectory=join(workspace.configuration.directory,'orders',digest(request.orderReference));
 await ownedDirectory(orderDirectory,{create:true});
 const context={context:checkout.context,orderReference:request.orderReference,
  planFile:offer.planFile,planSha256:digest(bytes),planBytes:bytes.length};
 if(original){
  await native(workspace.configuration,'adopt',context,{environment:workspace.environment});
  const attached=await native(workspace.configuration,'attach',{state:checkout.state,orderReference:request.orderReference},
   {environment:workspace.environment});
  return {existing:original,offer,attached};
 }
 let claim=null;
 if(!adopt){
  claim=await retainJson(join(orderDirectory,'claim.private.json'),async()=>({
   schema:'stellar-forge.sf101.api-merchant-order-claim.v1',orderReference:request.orderReference,
   token:randomBytes(32).toString('hex'),createdAt:operation.createdAt}));
  need(claim.orderReference===request.orderReference&&/^[a-f0-9]{64}$/.test(claim.token),
   'API_MERCHANT_RETAINED_CLAIM_CHANGED',409);
 }
 await native(workspace.configuration,adopt?'adopt':'enroll',
  {...context,...(!adopt?{claimFile:join(orderDirectory,'claim.private.json')}:{})},{environment:workspace.environment});
 const observed=await native(workspace.configuration,'order',context,{environment:workspace.environment});
 const expected=orderHandoff(checkout,observed.order),handoff=join(orderDirectory,'handoff.json');
 try{
  const retained=parse(await ownedBytes(handoff,1048576));
  need(canonical(retained)===canonical(expected),'API_MERCHANT_HANDOFF_CHANGED',409);
 }catch(error){
  if(error.code!=='ENOENT'&&error.code!=='API_MERCHANT_JSON_REQUIRED')throw error;
  if(error.code==='API_MERCHANT_JSON_REQUIRED'){
   // The original create-only handoff writer can leave a partial JSON file on interruption.
   // The enrolled order and retained claim above are already bound to these exact terms.
   await ownedBytes(handoff,1048576);
   await rename(handoff,join(orderDirectory,'handoff-interrupted-'+randomUUID()+'.json'));
  }
  try{await prepareHandoff(checkout,{ref:request.orderReference,output:handoff,env:workspace.environment});}
  catch(error){
   let retained;try{retained=parse(await ownedBytes(handoff,1048576));}catch{throw error;}
   need(canonical(retained)===canonical(expected),'API_MERCHANT_HANDOFF_CHANGED',409);
  }
 }
 const attached=await native(workspace.configuration,'attach',{state:checkout.state,orderReference:request.orderReference},
  {environment:workspace.environment});
 return {offer,checkout,orderDirectory,handoff,claim,attached,observed};
}
function orderGuide(workspace,offer,orderReference){
 return '# Purchased API access\n\n'+
  'Order: '+orderReference+'\n\n'+
  'The original handoff.json contains the exact checkout route, payment terms and enrolled plan identity. '+
  'Use the installed API customer workspace or the original api-purchase CLI to purchase that handoff. '+
  'After native entitlement, connect the same order and its private claim to '+workspace.configuration.gatewayBaseUrl+'.\n\n'+
  'The plan fixes the allowance and route costs. Reuse the same request ID and exact input when reopening a call. '+
  'The merchant retains completed outputs and original usage accounting. Keep credentials.json private and transfer it only to the intended customer.\n\n'+
  'Merchant application profile: '+offer.profilePath+'\n';
}
async function retainOrder(workspace,operation,request,directory,adopt){
 const result=await handoffFiles(workspace,operation,request,directory,adopt);
 if(result.existing){
  const manifest=await readExport(workspace.configuration,result.existing.handoffExportId,{verify:true});
  return {orderReference:request.orderReference,order:result.existing,pass:result.attached,export:exportView(manifest),replayed:true};
 }
 const members=[receiptMember('handoff.json',result.handoff,'application/json'),
  receiptMember('api-pass.json',result.offer.planFile,'application/json'),
  {name:'RECEIVING.md',content:orderGuide(workspace,result.offer,request.orderReference),contentType:'text/markdown; charset=utf-8'}];
 if(result.claim)members.push({name:'credentials.json',content:encoded({
  schema:'stellar-forge.sf101.api-customer-credentials.v1',orderReference:request.orderReference,
  gatewayBaseUrl:workspace.configuration.gatewayBaseUrl,claimEnv:'SF101_CLAIM_TOKEN',claim:result.claim.token}),
  contentType:'application/json'});
 const manifest=await createExport(workspace.configuration,{id:operation.id,kind:'customer-handoff',
  label:request.label,createdAt:operation.createdAt,members});
 await workspace.rememberExport(manifest);
 const row={orderReference:request.orderReference,label:request.label,offerId:result.offer.id,
  createdAt:operation.createdAt,handoffExportId:manifest.id,
  ...(result.claim?{credentialExportId:manifest.id}:{}),originalOrder:result.observed.order};
 await workspace.change(state=>{
  const old=state.orders.find(item=>item.orderReference===row.orderReference);
  if(old){need(old.offerId===row.offerId&&old.handoffExportId===row.handoffExportId,
   'API_MERCHANT_ORDER_SELECTION_CHANGED',409);}
  else state.orders.push(row);
 });
 return {orderReference:request.orderReference,order:row,pass:result.attached,export:exportView(manifest)};
}
async function adoptOffer(workspace,operation,request,directory){
 const prepared=await retainJson(join(directory,'adopted-offer.json'),async()=>{
  const runtime=await readApplicationRuntime(request.profilePath);
  const source=await readSelectedSource(workspace.configuration);
  need(runtime.gateway.state===source.checkout.state,'API_MERCHANT_ADOPT_CHECKOUT_STATE_CHANGED',409);
  const bytes=await ownedBytes(request.planFile,1048576),plan=await native(workspace.configuration,'plan',
   {plan:parse(bytes)},{environment:workspace.environment});
  const routes=new Map(runtime.gateway.routes.map(route=>[route.id,route]));
  need(plan.routes.every(route=>{
   const actual=routes.get(route.id);return actual&&route.method===actual.method&&route.path===actual.path;
  }),'API_MERCHANT_ADOPT_PLAN_ROUTES_CHANGED',409);
  const offerDirectory=join(workspace.configuration.directory,'offers',operation.id);
  await ownedDirectory(offerDirectory,{create:true});
  const checkoutFile=join(offerDirectory,'checkout.json'),checkoutBytes=encoded(source.checkoutRaw);
  await writeExact(checkoutFile,checkoutBytes);
  return {id:operation.id,title:request.label,status:'READY',createdAt:operation.createdAt,
   sourceSha256:source.sha256,profilePath:request.profilePath,profileSha256:runtime.profileSha256,
   applicationSource:runtime.source.identity,originalSource:runtime.profile.originalSource??runtime.source.identity,
   plan,planFile:request.planFile,planSha256:digest(bytes),planBytes:bytes.length,checkoutFile,
   checkoutSha256:digest(checkoutBytes),ports:{worker:runtime.profile.port,api:selectedApiPort(0,workspace.configuration.gatewayBaseUrl)},adopted:true};
 });
 await ensureOfferRuntime(workspace,prepared);
 await workspace.addOffer(prepared);
 const exported=await offerExport(workspace,operation,prepared);
 return {offerId:prepared.id,offer:offerView(workspace.offer(prepared.id)),export:exported};
}
function backupGuide(offer,backup,configuration){
 return '# Complete encrypted application recovery\n\n'+
  'This ZIP contains the original merchant-recovery encrypted bundle under bundle/. Its exact manifest identity is '+
  backup.encryptedManifestSha256+'.\n\n'+
  'Download the companion backup.json from this same original export. Extract this ZIP into a new private directory. '+
  'Set the original recovery passphrase in the '+configuration.backup.passEnv+
  ' environment variable, then receive the complete merchant runtime with the installed command:\n\n'+
  '    starforge api-merchant-workspace restore-bundle --bundle /ABSOLUTE/RECEIVED/bundle '+
  '--metadata /ABSOLUTE/RECEIVED/backup.json --out /ABSOLUTE/NEW_RUNTIME --pass-env '+
  configuration.backup.passEnv+'\n\n'+
  'The command authenticates the original encrypted application and merchant sidecar, restores the original merchant SQLite '+
  'and paid files, and retains the application imports, data, native executions and exact result bytes. '+
  'Its result includes profile and sidecar.checkoutFile. The latter binds the original checkout terms to the restored merchant '+
  'state and the captured original SF98 outbox, including delivery events, attempts and pending delivery history.\n\n'+
  'Use the returned profile with api-application serve and the returned sidecar.checkoutFile with the original checkout service. '+
  'Existing customers retain their original order references, request IDs, purchased allowance and saved results. '+
  'The merchant console Restore action additionally retains the selected or preserved mapping for each current workspace order.\n\n'+
  'Original offer: '+offer.title+'\nOriginal profile identity: '+offer.profileSha256+'\n';
}
function backupClosure(workspace,runtime,checkout){
 const selected=workspace.configuration.backup;
 const applicationRoot=absolute(runtime.recoveryApplicationRoot??selected.applicationRoot);
 const dataRoots=(runtime.recoveryDataRoots??selected.dataRoots).map(root=>({name:root.name,path:absolute(root.path)}));
 const environmentBindings=(runtime.recoveryEnvironmentBindings??selected.environmentBindings).map(binding=>({
  environment:binding.environment,dataRoot:binding.dataRoot??binding.root?.slice(5),path:binding.path||'.'}));
 const originalOutbox=absolute(checkout.outbox);
 const within=(root,path)=>path===root||path.startsWith(root+sep);
 let outboxBinding;
 if(within(applicationRoot,originalOutbox)){
  outboxBinding={root:'application',path:relative(applicationRoot,originalOutbox).split(sep).join('/')};
 }else{
  let root=dataRoots.find(root=>within(root.path,originalOutbox));
  if(!root){
   const names=new Set(dataRoots.map(root=>root.name));let name='merchant-outbox',suffix=1;
   while(names.has(name))name='merchant-outbox-'+suffix++;
   root={name,path:originalOutbox};dataRoots.push(root);
  }
  outboxBinding={root:'data-'+root.name,path:relative(root.path,originalOutbox).split(sep).join('/')};
 }
 need(dataRoots.length<=16,'APP_RECOVERY_DATA_ROOTS_REQUIRED');
 return {schema:'stellar-forge.sf101.api-merchant-backup-closure.v1',
  profileSha256:runtime.profileSha256,source:runtime.source.identity,applicationRoot,dataRoots,environmentBindings,
  originalOutbox,outboxBinding};
}
async function captureBackup(workspace,operation,request,directory,attempt){
 need(workspace.configuration.backup,'API_MERCHANT_BACKUP_NOT_CONFIGURED',409);
 const offer=workspace.offer(request.offerId),runtime=await ensureOfferRuntime(workspace,offer);
 const {bytes:planBytes,raw:checkout}=await offerContext(workspace,offer),checkoutBytes=encoded(checkout);
 const closure=backupClosure(workspace,runtime,checkout);
 const checkpoint=join(directory,'backup.json');
 let saved=await existingJson(checkpoint);
 const resumed=await retainJson(join(directory,'service-before-backup.json'),async()=>({
  wasRunning:workspace.serviceView().status==='RUNNING',offerId:workspace.serviceView().offerId}));
 const resumeService=async()=>{
  if(resumed.wasRunning&&request.resumeService&&!workspace.closing&&
   !await existingJson(join(directory,'service-resumed.json'))){
   await workspace.startService(workspace.offer(resumed.offerId));
   await writeExact(join(directory,'service-resumed.json'),encoded({offerId:resumed.offerId,resumed:true}));
  }
 };
 if(saved){
  await merchantBackup(workspace.configuration,'verify',{...saved,passEnv:workspace.configuration.backup.passEnv},
   {environment:workspace.environment});
  await resumeService();return saved;
 }
 if(workspace.serviceView().status!=='STOPPED')await workspace.stopService();
 await writeExact(join(directory,'backup-closure.json'),encoded(closure));
 const captureDirectory=join(directory,'capture');
 await ownedDirectory(captureDirectory,{create:true});
 const image=join(captureDirectory,'image'),bundle=join(captureDirectory,'encrypted');
 const imageResult=join(captureDirectory,'image-result.json');
 let imageDescription=await existingJson(imageResult);
 try{
  if(!imageDescription){
   let present;try{present=await lstat(image);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(present){
    await ownedDirectory(image);
    let complete=true;
    try{parse(await ownedBytes(join(image,'application-snapshot.json'),12*1024*1024));}
    catch(error){
     if(!['ENOENT','API_MERCHANT_JSON_REQUIRED'].includes(error.code))throw error;complete=false;
    }
    if(complete)imageDescription=await originalApplication(workspace.configuration,['inspect-snapshot','--snapshot',image],
     {environment:workspace.environment,timeout:3600000});
    else await rename(image,join(captureDirectory,'interrupted-image-'+attempt.id));
   }
   if(!imageDescription){
    // The original outbox initializes and validates its own delivery journals.
    // Its complete directory is captured by the original snapshot engine's
    // source/data traversal and checked again across the native database cutoff.
    const outbox=await openOutbox(closure.originalOutbox);
    await ownedDirectory(closure.originalOutbox);await outbox.status();
    const args=['snapshot','--config',offer.profilePath,'--out',image,'--application-root',closure.applicationRoot];
    for(const root of closure.dataRoots)args.push('--data',root.name,root.path);
    for(const binding of closure.environmentBindings)
     args.push('--path-env',binding.environment,binding.dataRoot,binding.path);
    imageDescription=await originalApplication(workspace.configuration,args,{environment:workspace.environment,timeout:3600000});
   }
   await writeExact(imageResult,encoded(imageDescription));
  }
  const sidecar=join(captureDirectory,'merchant-workspace');await ownedDirectory(sidecar,{create:true});
  await writeExact(join(sidecar,'api-pass.json'),planBytes);
  await writeExact(join(sidecar,'checkout.json'),checkoutBytes);
  const metadata={schema:'stellar-forge.sf101.api-merchant-backup-sidecar.v1',offerId:offer.id,title:offer.title,
   ports:offer.ports,sourceSha256:offer.sourceSha256,source:runtime.source.identity,
   profileSha256:runtime.profileSha256,originalSource:offer.originalSource,
   planSha256:digest(planBytes),planBytes:planBytes.length,checkoutSha256:digest(checkoutBytes),
   snapshotManifestSha256:imageDescription.manifestSha256,
   originalOutbox:closure.originalOutbox,outboxBinding:closure.outboxBinding};
  await writeExact(join(sidecar,'manifest.json'),encoded(metadata));
  const encrypted=await merchantBackup(workspace.configuration,'encrypt',{
   snapshot:image,sidecar,bundle,passEnv:workspace.configuration.backup.passEnv},{environment:workspace.environment});
  saved={schema:'stellar-forge.sf101.api-merchant-backup.v1',id:operation.id,offerId:offer.id,
   label:request.label,image,bundle,encryptedManifestSha256:encrypted.encryptedManifestSha256,
   snapshotManifestSha256:encrypted.snapshotManifestSha256,sidecarSha256:encrypted.sidecarSha256,
   source:runtime.source.identity,profileSha256:runtime.profileSha256,createdAt:operation.createdAt,
   imageDescription,encrypted};
  await writeExact(checkpoint,encoded(saved));
  return saved;
 }finally{
  await resumeService();
 }
}
async function backup(workspace,operation,request,directory,attempt){
 const offer=workspace.offer(request.offerId),saved=await captureBackup(workspace,operation,request,directory,attempt);
 const exportDirectory=join(workspace.configuration.directory,'exports',operation.id);
 await ownedDirectory(exportDirectory,{create:true});
 const archive=await native(workspace.configuration,'archive',{directory:saved.bundle,
  destination:join(exportDirectory,'application-backup.zip'),manifestSha256:saved.encryptedManifestSha256,
  guide:backupGuide(offer,saved,workspace.configuration)},
  {environment:workspace.environment,timeout:3600000});
 const manifest=await createExport(workspace.configuration,{id:operation.id,kind:'backup',label:request.label,
  createdAt:operation.createdAt,members:[
   {name:'application-backup.zip',path:archive.path,sha256:archive.sha256,bytes:archive.bytes,contentType:'application/zip'},
   {name:'backup.json',content:encoded(saved),contentType:'application/json'},
  ]});
 await workspace.rememberExport(manifest);
 await workspace.change(state=>{
  const old=state.backups.find(item=>item.id===saved.id);
  if(old)need(canonical(old)===canonical(saved),'API_MERCHANT_BACKUP_CHANGED',409);else state.backups.push(saved);
 });
 return {backupId:saved.id,offerId:offer.id,export:exportView(manifest),snapshotManifestSha256:saved.snapshotManifestSha256};
}
async function restore(workspace,operation,request,directory,attempt){
 need(workspace.configuration.backup,'API_MERCHANT_BACKUP_NOT_CONFIGURED',409);
 const backup=workspace.backup(request.backupId),originalOffer=workspace.offer(backup.offerId);
 if(workspace.serviceView().offerId===originalOffer.id&&workspace.serviceView().status!=='STOPPED')await workspace.stopService();
 const restoredRoot=join(workspace.configuration.directory,'restored',operation.id);
 const retained=await retainJson(join(directory,'restored-runtime.json'),()=>merchantBackup(workspace.configuration,'restore',{
  ...backup,destination:restoredRoot,passEnv:workspace.configuration.backup.passEnv},{environment:workspace.environment}));
 const runtime=await readApplicationRuntime(retained.profile),sidecar=retained.sidecar;
 need(runtime.profileSha256===backup.profileSha256&&canonical(runtime.source.identity)===canonical(backup.source)&&
  runtime.executionBinding?.snapshotManifestSha256===backup.snapshotManifestSha256&&sidecar?.sha256===backup.sidecarSha256,
  'API_MERCHANT_RESTORED_SOURCE_CHANGED',409);
 const checkoutFile=sidecar.checkoutFile,checkoutBytes=await ownedBytes(checkoutFile,131072);
 const planFile=sidecar.planFile,planBytes=await ownedBytes(planFile,1048576);
 need(digest(planBytes)===sidecar.planSha256&&planBytes.length===sidecar.planBytes,'API_MERCHANT_BACKUP_PLAN_CHANGED',409);
 const offer={id:operation.id,title:request.label,status:'READY',createdAt:operation.createdAt,
  sourceSha256:sidecar.sourceSha256,profilePath:retained.profile,profileSha256:runtime.profileSha256,
  applicationSource:runtime.source.identity,originalSource:sidecar.originalSource,plan:parse(planBytes),planFile,
  planSha256:digest(planBytes),planBytes:planBytes.length,checkoutFile,checkoutSha256:digest(checkoutBytes),
  ports:{...sidecar.ports},restoredFrom:{backupId:backup.id,offerId:originalOffer.id,snapshotManifestSha256:backup.snapshotManifestSha256}};
 await ensureOfferRuntime(workspace,offer);await workspace.addOffer(offer);
 const baseline=await retainJson(join(directory,'order-selection.json'),async()=>{
  const oldCheckout=compileCheckout(parse(await ownedBytes(originalOffer.checkoutFile,131072)));
  const restoredCheckout=compileCheckout(parse(checkoutBytes));
  const orderReferences=workspace.state.orders.filter(order=>order.offerId===originalOffer.id).map(order=>order.orderReference);
  const inputs={current:{context:oldCheckout.context,planSha256:originalOffer.planSha256,planBytes:originalOffer.planBytes},
   restored:{context:restoredCheckout.context,planSha256:offer.planSha256,planBytes:offer.planBytes}};
  const selected=await native(workspace.configuration,'restored-order-mapping',{...inputs,orderReferences},
   {environment:workspace.environment,timeout:3600000});
  return {inputs,...selected};
 });
 let mappings,mappingFile;
 const completed=workspace.offer(offer.id).orderMapping;
 if(completed){
  need(completed.operationId===operation.id&&completed.requestSha256===operation.requestSha256,
   'API_MERCHANT_RESTORE_MAPPING_CHANGED',409);
  const bytes=await ownedBytes(completed.file,20*1024*1024);
  need(digest(bytes)===completed.sha256,'API_MERCHANT_RESTORE_MAPPING_CHANGED',409);
  mappings=parse(bytes);mappingFile=completed.file;
 }else{
  const current=new Map(workspace.state.orders.map(order=>[order.orderReference,order]));
  const orderReferences=baseline.orders.filter(row=>row.status==='SELECTED'&&
   current.get(row.orderReference)?.offerId===originalOffer.id).map(row=>row.orderReference);
  const refreshed=await native(workspace.configuration,'restored-order-mapping',{...baseline.inputs,orderReferences},
   {environment:workspace.environment,timeout:3600000});
  const refreshedByRef=new Map(refreshed.orders.map(row=>[row.orderReference,row]));
  mappings={schema:'stellar-forge.sf101.api-merchant-restored-orders.v1',
   operationId:operation.id,requestSha256:operation.requestSha256,originalSelectionSha256:digest(encoded(baseline)),
   orders:baseline.orders.map(row=>{
    const active=current.get(row.orderReference);
    if(active?.offerId!==originalOffer.id)return {...row,status:'PRESERVED',reason:'CURRENT_OFFER_CHANGED'};
    return row.status==='SELECTED'?refreshedByRef.get(row.orderReference):row;
   })};
  mappingFile=join(directory,'order-mapping-'+attempt.id+'.json');
  const mappingBytes=encoded(mappings);await writeExact(mappingFile,mappingBytes);
  const selected=new Set(mappings.orders.filter(item=>item.status==='SELECTED').map(item=>item.orderReference));
  await workspace.change(state=>{
   const restoredOffer=state.offers.find(item=>item.id===offer.id);
   need(restoredOffer&&!restoredOffer.orderMapping,'API_MERCHANT_RESTORE_MAPPING_CHANGED',409);
   for(const order of state.orders)if(order.offerId===originalOffer.id&&selected.has(order.orderReference)){
    order.previousOfferIds=[...new Set([...(order.previousOfferIds??[]),originalOffer.id])];
    order.offerId=offer.id;
   }
   // Mapping and selected orders commit together. Reopening this exact operation
   // reuses this result; an uncommitted decision is rechecked against live authority.
   restoredOffer.orderMapping={operationId:operation.id,requestSha256:operation.requestSha256,
    file:mappingFile,sha256:digest(mappingBytes)};
  });
 }
 const manifest=await createExport(workspace.configuration,{id:operation.id,kind:'restored-application',
  label:request.label,createdAt:operation.createdAt,members:[
   receiptMember('checkout-restored.json',checkoutFile,'application/json'),
   receiptMember('api-pass.json',planFile,'application/json'),
   {name:'restore.json',content:encoded(retained),contentType:'application/json'},
   {name:'order-mapping.json',path:mappingFile,contentType:'application/json'},
   {name:'RECEIVING.md',content:'# Restored original API merchant\n\nUse '+retained.profile+
    ' with api-application serve. Restart the original checkout service with checkout-restored.json '+
    'to use its verified restored merchant state and outbox. Existing orders and request IDs remain unchanged.\n',
    contentType:'text/markdown; charset=utf-8'},
  ]});
 await workspace.rememberExport(manifest);
 await workspace.change(state=>{state.offers.find(item=>item.id===offer.id).exportId=manifest.id;});
 return {offerId:offer.id,offer:offerView(workspace.offer(offer.id)),restoration:retained,orderMappings:mappings.orders,export:exportView(manifest)};
}

export async function executeMerchantOperation(workspace,operation,request,attempt){
 const configuration=workspace.configuration,directory=join(configuration.directory,'operations',operation.id);
 await ownedDirectory(directory,{create:true});
 if(operation.kind==='source_refresh'){
  const selected=await readSelectedSource(configuration);
  await workspace.change(state=>{state.source={sha256:selected.sha256,view:selected.view};});
  return {source:selected.view};
 }
 if(operation.kind==='offer_prepare'){
  const offer=await preparedOffer(workspace,operation,request,directory);
  await workspace.addOffer(offer);
  const exported=await offerExport(workspace,operation,offer);
  return {offerId:offer.id,offer:offerView(workspace.offer(offer.id)),export:exported};
 }
 if(operation.kind==='offer_publish')return publishOffer(workspace,operation,workspace.offer(request.offerId));
 if(operation.kind==='offer_adopt')return adoptOffer(workspace,operation,request,directory);
 if(['order_prepare','order_adopt'].includes(operation.kind))return retainOrder(workspace,operation,request,directory,operation.kind==='order_adopt');
 if(operation.kind==='start'){const offer=workspace.offer(request.offerId);await ensureOfferRuntime(workspace,offer);return {offerId:offer.id,service:await workspace.startService(offer)};}
 if(operation.kind==='stop')return {service:await workspace.stopService()};
 if(operation.kind==='backup')return backup(workspace,operation,request,directory,attempt);
 if(operation.kind==='restore')return restore(workspace,operation,request,directory,attempt);
 if(operation.kind==='export_result'){
  const offer=workspace.offer(request.offerId);await ensureOfferRuntime(workspace,offer);
  const result=await retainJson(join(directory,'execution.json'),()=>originalExecution(configuration,offer.profilePath,request.executionId,{body:true}));
  need(result.execution?.id===request.executionId&&result.execution.result&&typeof result.bodyBase64==='string',
   'API_MERCHANT_EXECUTION_RESULT_REQUIRED',409);
  const bytes=Buffer.from(result.bodyBase64,'base64');
  need(bytes.length===result.execution.result.bytes&&digest(bytes)===result.execution.result.sha256,
   'APP_RETAINED_RESULT_CHANGED',409);
  const {bodyBase64,...metadata}=result;
  const manifest=await createExport(configuration,{id:operation.id,kind:'execution-result',label:'Application '+request.executionId,
   createdAt:operation.createdAt,members:[{name:'result.bin',content:bytes,contentType:result.execution.result.contentType},
    {name:'execution.json',content:encoded(metadata),contentType:'application/json'}]});
  await workspace.rememberExport(manifest);return {executionId:request.executionId,export:exportView(manifest)};
 }
 const order=workspace.order(request.orderReference),offer=workspace.offer(order.offerId);
 if(request.offerId)need(request.offerId===offer.id,'API_MERCHANT_ORDER_OFFER_CHANGED',409);
 const {checkout}=await offerContext(workspace,offer);
 if(operation.kind==='attach_pass')return native(configuration,'attach',{state:checkout.state,orderReference:request.orderReference},{environment:workspace.environment});
 if(operation.kind==='access')return native(configuration,'access',{...request,state:checkout.state,actor:configuration.actor},{environment:workspace.environment});
 if(operation.kind==='export_usage'){
  const source=await retainJson(join(directory,'usage.json'),()=>native(configuration,'usage',
   {state:checkout.state,orderReference:request.orderReference},{environment:workspace.environment}));
  const manifest=await createExport(configuration,{id:operation.id,kind:'usage',label:'Usage '+request.orderReference,
   createdAt:operation.createdAt,members:[receiptMember('api-pass-usage.json',join(directory,'usage.json'),'application/json')]});
  await workspace.rememberExport(manifest);
  return {orderReference:request.orderReference,export:exportView(manifest),snapshot:source.snapshot};
 }
 if(['recover_call','release_call'].includes(operation.kind)){
  await ensureOfferRuntime(workspace,offer);
  const command=operation.kind==='recover_call'?'recover':'release';
  return originalApplication(configuration,[command,'--config',offer.profilePath,'--order',request.orderReference,
   '--request-id',request.requestId,'--revision',String(request.callRevision),'--operation-id',operation.id,
   '--actor',configuration.actor,'--reason',request.reason],{environment:workspace.environment});
 }
 need(false,'API_MERCHANT_ACTION_REQUIRED');
}
