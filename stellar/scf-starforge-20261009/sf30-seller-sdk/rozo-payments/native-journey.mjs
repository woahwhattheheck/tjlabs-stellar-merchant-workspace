import { mkdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { RozoWorkspace } from './store.mjs';
import { RozoService } from './service.mjs';
import { acquireLease } from './lease.mjs';
import { inspectRozoSource, inspectRozoSourcePackage, materializePublisher, loadRozoConfiguration } from './source.mjs';
import { startRozoServer } from './server.mjs';
import { receiveDelivery, putOriginal, pythonArchive, hashOriginalFile } from './delivery.mjs';
import { nativeInventory, compareNativeInventory } from './native-inventory.mjs';
import { startNativeFixture, saveNative, FIXTURE_ASSETS, FIXTURE_APP, FIXTURE_WALLET, FIXTURE_KEY, FIXTURE_SECRET } from './native-fixture.mjs';
import { runRozoBrowser } from './browser-journey.mjs';
import { assert, canonical, digest, jsonDigest, clone } from './model.mjs';

const PRODUCT='stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments';
export const NATIVE_OPERATION='ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012';
async function child(command,args,{environment=process.env,onOutput}={}){
  const p=spawn(command,args,{env:environment,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  p.stdout.on('data',c=>{stdout+=c;onOutput?.(String(c));});p.stderr.on('data',c=>{stderr+=c;});
  const result=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',(code,signal)=>resolve({code,signal,pid:p.pid}));});return {...result,stdout,stderr};
}
function readJSON(path){return JSON.parse(readFileSync(path));}
function retainSource(root,manifest,identity,directory){
  const target=join(directory,'source-editions',identity.manifestSha256);mkdirSync(target,{recursive:true,mode:0o700});
  const metadata=inspectRozoSourcePackage(root,manifest),sourceDirectory=metadata?join(target,'source'):target;
  mkdirSync(sourceDirectory,{recursive:true,mode:0o700});
  for(const row of identity.files)putOriginal(join(sourceDirectory,row.path),readFileSync(join(root,row.path)));
  if(metadata){
    const sourceManifest=join(target,'source-package','manifest.json');
    putOriginal(sourceManifest,readFileSync(manifest));
    for(const row of metadata.files)putOriginal(join(target,'source-package',row.path),readFileSync(join(metadata.directory,row.path)));
    return {sourceDirectory,sourceManifest};
  }
  putOriginal(join(target,PRODUCT,'INSTALLED_SOURCE.json'),readFileSync(manifest));return {sourceDirectory};
}
export async function runRozoJourney({directory,sourceRoot,sourceManifest,python=process.env.ROZO_PYTHON??'python3',chromium,playwrightModule,onProgress}){
  directory=resolve(directory);sourceRoot=realpathSync(sourceRoot);sourceManifest=realpathSync(sourceManifest);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const identity=inspectRozoSource(sourceRoot,sourceManifest),progressFile=join(directory,'NATIVE_PROGRESS.json');
  let progress=existsSync(progressFile)?readJSON(progressFile):{schema:'stellar-forge.rozo-native-operation.v1',operationId:NATIVE_OPERATION,createdAt:new Date().toISOString(),steps:{},requests:{},sourceEditions:[],state:'prepared'};
  assert(progress.operationId===NATIVE_OPERATION&&progress.schema==='stellar-forge.rozo-native-operation.v1','NATIVE_OPERATION','Select the original saved receiving operation.',409);
  const sourceEdition=retainSource(sourceRoot,sourceManifest,identity,directory);
  if(!progress.sourceEditions.some(x=>x.manifestSha256===identity.manifestSha256))progress.sourceEditions.push({...identity,...sourceEdition});
  const save=()=>{saveNative(progressFile,progress);onProgress?.({operationId:NATIVE_OPERATION,state:progress.state,phase:progress.phase,steps:Object.keys(progress.steps)});};
  const workspaceDirectory=join(directory,'workspace'),exists=existsSync(join(workspaceDirectory,'workspace.json'));
  const w=new RozoWorkspace(workspaceDirectory,{create:!exists}),lease=acquireLease(w,'native-receiving-operation');
  if(progress.workspaceId)assert(progress.workspaceId===w.meta().workspaceId,'NATIVE_CASE','Keep the original saved workspace.',409);else progress.workspaceId=w.meta().workspaceId;
  let fixture,service,server,owner;
  const step=async(name,fn)=>{
    if(progress.steps[name])return progress.steps[name];
    progress.phase=name;progress.state='running';save();const result=await fn();progress.steps[name]=result;save();return result;
  };
  const invoke=async(label,command,payload)=>{
    let envelope=progress.requests[label],retained=w.request('native:'+label);
    if(!envelope)envelope=retained?.envelope??{workspaceId:w.meta().workspaceId,requestId:'native:'+label,expectedRevision:w.meta().revision,actor:'Native receiving operator',command,payload};
    assert(envelope.command===command&&canonical(envelope.payload)===canonical(payload),'NATIVE_REQUEST','Resume the exact original command and payload.',409);
    progress.requests[label]=envelope;save();return service.execute(envelope);
  };
  try{
    const product=join(sourceRoot,PRODUCT),catalogue=readJSON(join(product,'publishers.json')),checkout=catalogue.publishers.find(p=>p.repository==='RozoAI/rozo-checkout-skill'),publisher=join(directory,'publisher-checkout');
    materializePublisher(join(product,checkout.capsule),publisher,{expectedSha256:checkout.capsuleSha256});
    fixture=await startNativeFixture({directory:join(directory,'fixture'),checkoutSource:publisher});
    const configFile=join(directory,'connections.json'),config={schema:'stellar-forge.rozo-connections.v1',publisherSelectionsFile:join(product,'publishers.json'),connections:{
      merchant:{type:'merchant-key-v2',appId:FIXTURE_APP,baseUrl:fixture.origin+'/merchant',apiKeyEnv:'ROZO_NATIVE_KEY',webhookSecretEnv:'ROZO_NATIVE_WEBHOOK_SECRET',allowLocal:true},
      checkout:{type:'checkout-mpp-0.1.21',publisher:'RozoAI/rozo-checkout-skill',sourceRoot:publisher,mppBase:fixture.origin+'/mpp',intentsBase:fixture.origin+'/intents',allowLocal:true}
    }};
    if(existsSync(configFile)){
      const old=readJSON(configFile);assert(old.connections.merchant.baseUrl===config.connections.merchant.baseUrl,'NATIVE_PROVIDER','Keep the original local provider endpoint.',409);
      // Source relocation is an explicit following native source edition; actual
      // prepared requests bind the source hashes and provider identity.
      if(canonical(old)!==canonical(config))saveNative(configFile,config);
    }else putOriginal(configFile,Buffer.from(canonical(config)+'\n'));
    const configuration=loadRozoConfiguration(configFile),environment={...process.env,ROZO_NATIVE_KEY:FIXTURE_KEY,ROZO_NATIVE_WEBHOOK_SECRET:FIXTURE_SECRET};
    service=new RozoService({workspace:w,connections:configuration.connections,publisherSelections:configuration.publisherSelections,environment,sourceIdentity:identity,delivery:{sourceRoot,sourceManifest,configuration,python}});
    owner=acquireLease(w,'operator');
    server=await startRozoServer({service,host:'127.0.0.1',port:0});
    const jsonCall=async(path,{method='GET',value,headers={}}={})=>{const response=await fetch(server.startup.origin+path,{method,headers:{'X-Rozo-Session':server.startup.sessionToken,...(value!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:value===undefined?undefined:canonical(value)}),body=await response.json();return {status:response.status,body};};
    await step('profiles-and-original-orders',async()=>{
      await invoke('profile-merchant','profile.save',{id:'merchant',label:'Native merchant receiving',type:'merchant-key-v2',connection:'merchant',appId:FIXTURE_APP,assets:FIXTURE_ASSETS,wallet:FIXTURE_WALLET,notes:'DEVELOPMENT: full local original-contract exercise; no public merchant or funds operated.'});
      await invoke('profile-checkout','profile.save',{id:'checkout',label:'Original Checkout native receiving',type:'checkout-mpp-0.1.21',connection:'checkout',assets:FIXTURE_ASSETS,notes:'DEVELOPMENT: unchanged publisher code and its retained fixture bytes.'});
      await invoke('merchant-order','order.save',{id:'merchant-order',profileId:'merchant',orderId:'native-merchant-order',title:'Native merchant order',source:{chainId:'900',tokenSymbol:'USDT',amount:'5.000000'},expectedDestination:{chainId:'8453',tokenSymbol:'USDC',tokenAddress:FIXTURE_ASSETS[1].tokenAddress,amount:'4.995000',receiverAddress:FIXTURE_WALLET.address},fulfilmentRef:'Local native fulfilment record'});
      const c=fixture.state().checkout;
      await invoke('checkout-order','order.save',{id:'checkout-order',profileId:'checkout',orderId:c.create.linkId,title:'Original Checkout invoice',source:{chainId:'900',tokenSymbol:'USDT',amount:'5.021000'},checkout:{url:'https://payments.coinbase.com/'+c.create.linkId,provider:'coinbase'}});
      return {profiles:w.list('profile',{all:true}).total,orders:w.list('order',{all:true}).total};
    });
    await step('definite-create-rejection',async()=>{
      const rejected=await invoke('merchant-create-rejected','merchant.create',{profileId:'merchant',orderId:'merchant-order'});
      assert(rejected.result.outcome==='provider_rejected'&&rejected.result.nativeStatus===429,'NATIVE_REJECTION','Retain the definitive original provider rejection.');
      assert(w.request(rejected.requestId).state==='accepted'&&fixture.state().merchantRejectedCount===1&&!fixture.state().payments['rozo-local-created'],'NATIVE_REJECTION','A rejected create must retain its outcome without creating a payment.');
      const replay=await service.resume(rejected.requestId);
      const originalResult=value=>{const {reused,...original}=value;return original;};
      assert(canonical(originalResult(replay))===canonical(originalResult(rejected))&&fixture.state().merchantPostCount===1,'NATIVE_REJECTION','The same rejected request must replay without another dispatch.');
      return {requestId:rejected.requestId,outcome:rejected.result,postCount:fixture.state().merchantPostCount};
    });
    await step('accepted-create-response-loss',async()=>{
      try{await invoke('merchant-create','merchant.create',{profileId:'merchant',orderId:'merchant-order'});}catch(error){assert(['HTTP_TRANSPORT','HTTP_ABORTED'].includes(error.code),'NATIVE_CREATE','Only the controlled lost response is expected.',500,{code:error.code});}
      const request=w.request('native:merchant-create');assert(request,'NATIVE_CREATE','Retain the original create intent.');
      const result=request.state==='accepted'?request.result:await service.resume(request.id);
      assert(result.result.paymentId==='rozo-local-created'&&fixture.state().merchantPostCount===2&&fixture.state().merchantRejectedCount===1,'NATIVE_CREATE','The explicit following request and original order lookup must recover one accepted create after its retained rejection, without another POST.');
      return {requestId:request.id,paymentId:result.result.paymentId,postCount:fixture.state().merchantPostCount,result};
    });
    const createdAt=fixture.state().createdAt,period={from:new Date(Date.parse(createdAt)-86400000).toISOString(),to:new Date(Date.parse(createdAt)+86400000).toISOString(),field:'createdAt'};
    await step('complete-source-pagination',async()=>{
      const r=await invoke('capture-full','capture.payments',{id:'native-full',profileId:'merchant',fromDate:period.from,toDate:period.to,limit:100}),job=r.result.capture;
      assert(job.state==='complete'&&job.paymentIds.length===Object.keys(fixture.state().payments).length&&job.pages.length>=2,'NATIVE_PAGINATION','The actual original source list was not completely captured.');
      return {requestId:r.requestId,pages:job.pages,ids:job.paymentIds};
    });
    await step('signed-callback-and-out-of-order-history',async()=>{
      const original=fixture.state().payments['rozo-local-created'];
      const at=new Date(Date.parse(createdAt)+60000).toISOString(),updated={...clone(original),status:'payment_payout_completed',updatedAt:at,source:{...original.source,txHash:digest('native-original-payin'),amountReceived:'5.000000',confirmedAt:at},destination:{...original.destination,txHash:digest('native-original-payout'),confirmedAt:at}};
      fixture.updatePayment(original.id,updated);
      const post=async(callback)=>{const r=await fetch(server.startup.origin+'/callbacks/merchant',{method:'POST',headers:{'Content-Type':'application/json','X-Rozo-Timestamp':callback.timestamp,'X-Rozo-Signature':callback.signature},body:callback.raw});return {status:r.status,value:await r.json()};};
      const newer=fixture.callback(original.id,{eventId:'native-payout',at,payment:updated}),a=await post(newer),duplicate=await post(newer);
      assert(a.status===200&&duplicate.status===200&&duplicate.value.reused===true,'NATIVE_CALLBACK','The exact signed callback did not deduplicate.');
      const older=fixture.callback(original.id,{eventId:'native-earlier-payin',type:'payment_payin_completed',at:createdAt,payment:{...clone(original),status:'payment_payin_completed'}});const old=await post(older);assert(old.status===200,'NATIVE_CALLBACK','The original earlier event was not retained.');
      const conflict=fixture.callback(original.id,{eventId:'native-payout',at,payment:{...updated,metadata:{conflictingOriginal:true}}});const conflicting=await post(conflict);assert(conflicting.status===409,'NATIVE_CALLBACK','Changed bytes for one original event ID must remain a conflict.');
      const selected=service.payment('merchant',original.id).row;assert(selected.status==='payment_payout_completed'&&selected.sourcePayment.state==='provider_confirmed'&&selected.fulfilment.state==='unobserved','NATIVE_SETTLEMENT','Callback ordering or fulfilment separation differs.');
      return {original:a.value,duplicate:duplicate.value,earlier:old.value,conflict:conflicting.value,selected};
    });
    await step('baseline-report',async()=>{
      const result=await invoke('baseline-report','report.save',{id:'report-baseline',profileId:'merchant',title:'Native original baseline',period,notes:'Complete retained local source before staff fulfilment review.'});
      return {requestId:result.requestId,reportSha256:result.result.report.value.sha256,files:result.result.files};
    });
    await step('review-and-following-report',async()=>{
      const row=service.payment('merchant','rozo-local-created').row;
      await invoke('fulfilment-review','decision.save',{id:'native-fulfilment',profileId:'merchant',paymentId:row.paymentId,kind:'fulfilment',basisSha256:row.sourceSha256,reason:'The controlled native fulfilment record was reviewed independently of pay-in and payout.',value:{state:'delivered',reference:'native-fixture:observed-fulfilment'}});
      const result=await invoke('following-report','report.save',{id:'report-following',profileId:'merchant',title:'Native following reviewed period',period,supersedes:'report-baseline',notes:'Same original source period with an explicit staff fulfilment observation.'});
      const comparison=service.compare('report-baseline','report-following');assert(comparison.changes.some(c=>c.paymentId==='rozo-local-created'),'NATIVE_REPORT','The full retained period comparison lost the actual reviewed payment.');
      for(const f of result.result.files){const raw=w.wholeObject(f.sha256);assert(raw.length===f.bytes,'NATIVE_REPORT','A full report file differs.');putOriginal(join(directory,'reports',f.name),raw);}
      return {requestId:result.requestId,reportSha256:result.result.report.value.sha256,comparison,files:result.result.files};
    });
    await step('original-active-and-recurring-catch-up',async()=>{
      const active=await invoke('active-capture','capture.active',{id:'native-active',profileId:'merchant'});
      assert(active.result.capture.paymentIds.length===Object.keys(fixture.state().payments).length,'NATIVE_ACTIVE','The original refresh list omitted retained failed or expired payments.');
      await invoke('schedule-save','schedule.save',{id:'native-catch-up',profileId:'merchant',enabled:true,intervalSeconds:3600,lookbackHours:24});
      await service.pollSchedules();if(service.watchRunning)await service.watchRunning;const schedule=w.get('schedule','native-catch-up').value;
      assert(schedule.lastRequestId&&w.request(schedule.lastRequestId)?.state==='accepted','NATIVE_SCHEDULE','The original recurring capture did not retain its accepted request.');
      await invoke('schedule-pause','schedule.save',{id:'native-catch-up',profileId:'merchant',enabled:false,intervalSeconds:3600,lookbackHours:24});
      return {active:active.result.capture,originalScheduleRequest:schedule.lastRequestId};
    });
    await step('original-checkout-native-recovery',async()=>{
      await invoke('checkout-quote','checkout.quote',{profileId:'checkout',orderId:'checkout-order'});
      const create=await invoke('checkout-create','checkout.create',{profileId:'checkout',orderId:'checkout-order'});
      const original=w.request('native:checkout-create');
      if(original.state!=='accepted'){
        const c=fixture.state().checkout;
        await invoke('checkout-recover','native.recover',{profileId:'checkout',originalRequestId:original.id,paymentId:c.payment.id,linkId:c.create.linkId,provider:'coinbase'});
      }
      const accepted=w.request(original.id);assert(accepted.state==='accepted'&&fixture.state().checkout.postCount===1,'NATIVE_CHECKOUT','The native original creation must be recovered without a second MPP POST.');
      const c=fixture.state().checkout;
      const status=await invoke('checkout-status','checkout.status',{profileId:'checkout',paymentId:c.payment.id,linkId:c.create.linkId,provider:'coinbase'});
      const resume=await invoke('checkout-resume','checkout.resume',{profileId:'checkout',paymentId:c.payment.id});
      assert(status.result.native.payload.snapshot.rozoPaymentId===c.payment.id,'NATIVE_CHECKOUT','The original status result lost its actual payment identity.');
      assert(resume.result.native.payload.depositWithheld===true,'NATIVE_CHECKOUT','The receiving exercise must preserve the original unconfirmed, read-only resume.');
      return {originalRequestId:original.id,paymentId:c.payment.id,postCount:fixture.state().checkout.postCount,quote:w.request('native:checkout-quote').result,status,resume};
    });
    const reportValues=['report-baseline','report-following'].map(id=>w.get('report',id).value);
    if(!progress.steps['staff-browser']){
      if(!chromium||!playwrightModule){progress.state='pending';progress.phase='staff-browser';progress.pending={code:'BROWSER_RUNTIME',message:'The same saved workspace is ready for the actual staff browser; supply its original Chromium and Playwright module.'};save();return {...progress,directory,workspaceDirectory};}
      await step('staff-browser',()=>runRozoBrowser({directory:join(directory,'browser'),startup:server.startup,chromium,playwrightModule,workspace:w,reports:reportValues}));
    }
    await step('complete-working-snapshot',async()=>{
      const result=await invoke('working-export','workspace.export',{id:'native-working',title:'Complete native working snapshot'});
      const received=await receiveDelivery(result.delivery.path,join(directory,'working-received'),{sha256:result.delivery.sha256,python});
      let rejected=false;try{const unsafe=new RozoWorkspace(received.workspaceDirectory);unsafe.close();}catch(e){rejected=e.code==='RECEIVE_REQUIRED';}
      assert(rejected,'NATIVE_WORKING_COPY','The working snapshot must remain read-only without original handover activation.');
      return {delivery:result.delivery,readOnly:received,writeRejected:true};
    });
    const handed=await step('sealed-handover',async()=>{
      const result=await invoke('handover','workspace.handover',{id:'native-handover',title:'Complete ROZO original merchant workspace handover'});
      assert(w.get('control','operator').value.mode==='sealed','NATIVE_HANDOVER','The sender did not seal its original workspace.');
      const again=await service.resume(result.requestId);assert(again.delivery.sha256===result.delivery.sha256,'NATIVE_HANDOVER','Original handover recovery changed its complete archive.');
      return {delivery:result.delivery,workspace:w.meta()};
    });
    await server.close();server=null;owner.release();owner=null;
    await step('separate-source-native-receiver',async()=>{
      const target=join(directory,'received');
      await pythonArchive(['receive','--archive',handed.delivery.path,'--directory',target,'--sha256',handed.delivery.sha256],{python});
      const entry=join(target,'source',PRODUCT,'receiving-check.mjs');
      const executed=await child(process.execPath,[entry,'--directory',target,'--archive',handed.delivery.path,'--sha256',handed.delivery.sha256,'--python',python]);
      saveNative(join(directory,'RECEIVING_PROCESS.json'),executed);assert(executed.code===0,'NATIVE_RECEIVER','The actual separate receiving process did not complete.',500,executed);
      const result=readJSON(join(target,'NATIVE_RECEIVE_RESULT.json'));assert(result.workspaceId===w.meta().workspaceId&&result.originId===w.meta().originId,'NATIVE_RECEIVER','The receiving process changed the original identity.');
      return result;
    });
    const result={schema:'stellar-forge.rozo-native-completion.v1',operationId:NATIVE_OPERATION,dataContext:'DEVELOPMENT',workspaceId:w.meta().workspaceId,originId:w.meta().originId,sourceIdentity:identity,sourceEditions:progress.sourceEditions.map(s=>({manifestSha256:s.manifestSha256,selectionSha256:s.selectionSha256,sourceDirectory:s.sourceDirectory,...(s.sourceManifest?{sourceManifest:s.sourceManifest}:{})})),completedAt:new Date().toISOString(),phases:Object.keys(progress.steps),requests:progress.requests,checkoutPublisher:{repository:checkout.repository,commit:checkout.commit,sourceSelectionSha256:jsonDigest(checkout.files)},working:progress.steps['complete-working-snapshot'].delivery,handover:handed.delivery,receiving:progress.steps['separate-source-native-receiver'],browser:progress.steps['staff-browser'],providerFixture:join(directory,'fixture'),scope:{executed:['keyed merchant local HTTP contract','original Checkout 0.1.21 source','all seven staff views','signed callback and full raw capture','complete private archive and separate native receiving'],configuredSeparately:['Common SDK 0.1.43 compiled native runtime','Stellar SDK 15+ and original deployed RPC/contract profile'],publicProviderPayments:0,transactionsSignedOrSent:0}};
    progress.state='complete';progress.phase='complete';progress.result=result;delete progress.pending;save();saveNative(join(directory,'NATIVE_COMPLETION.json'),result);return {...result,directory};
  }catch(error){
    progress.state='pending';progress.lastError={code:error.code??'NATIVE_ERROR',message:error.message,details:error.details??{},at:new Date().toISOString()};save();throw error;
  }finally{
    if(server)await server.close();else await service?.close();owner?.release();await fixture?.close();lease.release();w.close();
  }
}
