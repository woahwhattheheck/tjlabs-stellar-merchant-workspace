import {
  mkdirSync, readFileSync, existsSync, realpathSync, lstatSync, openSync, closeSync,
  writeFileSync, fsyncSync, linkSync, unlinkSync, readdirSync
} from 'node:fs';
import { join, resolve, dirname, delimiter } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { buildDistribution } from '../../distribution/build.mjs';
import { prepareRuntimeInstall, installRuntime, inspectRuntimeInstall, recoverRuntime } from '../../distribution/runtime-install.mjs';
import {
  exportRuntimeTransfer, inspectRuntimeTransfer, beginRuntimeTransferReceive,
  receiveRuntimeTransferPart, copyRuntimeTransferPart, installReceivedRuntime
} from '../../distribution/runtime-transfer.mjs';
import { inspectMerchantRuntime } from '../../sf46-release/runtime-package.mjs';
import { operationLease, operationRunning } from '../../distribution/runtime-workspace/storage.mjs';
import { selectRozoSource, sourcePath } from './source.mjs';
import { RozoWorkspace } from './store.mjs';
import { nativeInventory } from './native-inventory.mjs';
import { hashOriginalFile, putOriginal } from './delivery.mjs';
import { saveNative, FIXTURE_KEY, FIXTURE_SECRET } from './native-fixture.mjs';
import { openInstalledRozoBrowser } from './applications-browser.mjs';
import { assert, canonical, digest, clone } from './model.mjs';

const PRODUCT='stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments';
const DISTRIBUTION='stellar/scf-starforge-20261009/distribution';
export const APPLICATIONS_OPERATION='ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012:installed-applications';
const NATIVE_OPERATION='ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012';
const read=path=>JSON.parse(readFileSync(path));
const delay=ms=>new Promise(done=>setTimeout(done,ms));
function same(left,right,code,message){assert(canonical(left)===canonical(right),code,message,409);}
function checkedFile(path,expected){
  const actual=hashOriginalFile(path);
  assert(actual.bytes===expected.bytes&&actual.sha256===expected.sha256,'APPLICATIONS_FILE','The complete original file differs: '+path,409);
  return actual;
}
function retain(path,value){putOriginal(path,Buffer.from(canonical(clone(value))+'\n'));return {path,...hashOriginalFile(path)};}
function contained(root,path){return path===root||path.startsWith(root+'/');}
function originalRows(before,after){
  assert(before.workspace.workspaceId===after.workspace.workspaceId&&before.workspace.originId===after.workspace.originId,
    'APPLICATIONS_ORIGINAL_WORKSPACE','The installed workflow changed the original workspace identity.',409);
  for(const [name,rows]of Object.entries(before.tables)){
    const current=new Map(after.tables[name].map(row=>[canonical(row.key),row]));
    for(const row of rows)same(current.get(canonical(row.key))??null,row,'APPLICATIONS_ORIGINAL_ROW','The installed workflow changed an earlier '+name+' row.');
  }
}
async function downloadOriginal(url,headers,destination,expected){
  if(existsSync(destination)){checkedFile(destination,expected);return {path:destination,...expected,reused:true};}
  mkdirSync(dirname(destination),{recursive:true,mode:0o700});
  const temporary=destination+'.receiving-'+randomUUID(),fd=openSync(temporary,'wx',0o600);
  const hash=createHash('sha256');let bytes=0;
  try{
    try{
      const response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(120000)});
      assert(response.status===200,'APPLICATIONS_DOWNLOAD','The original archive download did not return its complete file.',409,{status:response.status});
      const declared=response.headers.get('content-length');
      assert(declared===null||declared===String(expected.bytes),'APPLICATIONS_DOWNLOAD','The original archive length differs.',409);
      for await(const chunk of response.body){const raw=Buffer.from(chunk);bytes+=raw.length;assert(bytes<=expected.bytes,'APPLICATIONS_DOWNLOAD','The archive exceeded its retained byte count.');writeFileSync(fd,raw);hash.update(raw);}
      assert(bytes===expected.bytes&&hash.digest('hex')===expected.sha256,'APPLICATIONS_DOWNLOAD','The complete native archive hash differs.',409);
      fsyncSync(fd);
    }finally{closeSync(fd);}
    try{linkSync(temporary,destination);}catch(error){if(error.code!=='EEXIST')throw error;checkedFile(destination,expected);}
  }finally{unlinkSync(temporary);}
  return {path:destination,...expected,reused:false};
}
async function nativeChild(entry,selection,lease,directory){
  const child=spawn(process.execPath,[entry,'--selection',selection],{
    stdio:['ignore','pipe','pipe',lease.fd],env:process.env
  });
  const out=openSync(join(directory,'receiving-stdout.log'),'a',0o600),err=openSync(join(directory,'receiving-stderr.log'),'a',0o600);
  child.stdout.on('data',bytes=>writeFileSync(out,bytes));child.stderr.on('data',bytes=>writeFileSync(err,bytes));
  try{
    return await new Promise((done,reject)=>{
      child.once('error',reject);child.once('close',(code,signal)=>done({pid:child.pid,code,signal}));
    });
  }finally{closeSync(out);closeSync(err);}
}

/**
 * Following installed programme for the already completed original ROZO case.
 * Shared Applications and runtime-transfer APIs remain the writers and receivers.
 */
export async function runRozoApplications({
  directory,repository,ref,python=process.env.ROZO_PYTHON??'python3',npm='npm',
  chromium,playwrightModule,onProgress=()=>{},waitMilliseconds=180000
}){
  assert(/^[a-f0-9]{40}$/.test(ref??''),'APPLICATIONS_SOURCE_COMMIT','Select the full published source commit.',409);
  assert(Number(process.versions.node.split('.')[0])>=24,'APPLICATIONS_NODE','The installed ROZO selection requires Node 24 or later.');
  assert(Number.isSafeInteger(waitMilliseconds)&&waitMilliseconds>=1000&&waitMilliseconds<=30*60*1000,'APPLICATIONS_WAIT','Use a bounded native wait.');
  directory=realpathSync(directory);repository=realpathSync(repository);
  const completionFile=join(directory,'NATIVE_COMPLETION.json'),completionRaw=readFileSync(completionFile),completed=JSON.parse(completionRaw);
  assert(completed.schema==='stellar-forge.rozo-native-completion.v1'&&completed.operationId===NATIVE_OPERATION&&
    completed.receiving?.workspaceId===completed.workspaceId&&completed.receiving?.originId===completed.originId,
    'APPLICATIONS_NATIVE_COMPLETION','Complete and retain the original native ROZO receiver first.',409);
  const root=join(directory,'installed-applications');mkdirSync(root,{recursive:true,mode:0o700});
  assert(!lstatSync(root).isSymbolicLink(),'APPLICATIONS_DIRECTORY','Use the original ordinary receiving directory.');
  const lease=await operationLease(join(root,'operation.lock')),progressFile=join(root,'PROGRESS.json');
  const binding={nativeOperation:NATIVE_OPERATION,nativeCompletionSha256:digest(completionRaw),repository,ref,python,npm,
    workspaceId:completed.workspaceId,originId:completed.originId};
  let progress;
  try{
    if(!existsSync(progressFile))assert(readdirSync(root).every(name=>name==='operation.lock'||name==='temporary'),
      'APPLICATIONS_PROGRESS_MISSING','Restore the original installed operation journal before continuing its retained files.',409);
    progress=existsSync(progressFile)?read(progressFile):{
    schema:'stellar-forge.rozo-installed-applications-progress.v1',operationId:APPLICATIONS_OPERATION,
    binding,createdAt:new Date().toISOString(),phase:'prepared',state:'prepared',stages:{},requests:{},files:[],runtimeTargets:[],workspaceTargets:[],receivingTargets:[]
    };
  }catch(error){await lease.close();throw error;}
  let host,model,browser;
  const previousEnvironment={PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,TEMP:process.env.TEMP,TMP:process.env.TMP};
  const temporary=join(root,'temporary');
  try{mkdirSync(temporary,{recursive:true,mode:0o700});}catch(error){await lease.close();throw error;}
  process.env.PATH=dirname(process.execPath)+delimiter+(process.env.PATH??'');
  process.env.TMPDIR=process.env.TEMP=process.env.TMP=temporary;
  const save=()=>{saveNative(progressFile,progress);onProgress({operationId:APPLICATIONS_OPERATION,phase:progress.phase,state:progress.state});};
  const emitArtifact=value=>{
    assert(contained(root,resolve(value.path))&&resolve(value.path)!==root,'APPLICATIONS_ARTIFACT_PATH','Retain artifacts within the original operation directory.',409);
    const name=value.path.slice(root.length+1),known=progress.files.find(item=>item.name===name);
    if(known)same({bytes:known.bytes,sha256:known.sha256},{bytes:value.bytes,sha256:value.sha256},'APPLICATIONS_ARTIFACT','The retained original artifact differs.');
    else progress.files.push({name,bytes:value.bytes,sha256:value.sha256});
    save();
  };
  const stage=async(name,action)=>{
    const path=join(root,'receipts',name+'.json');mkdirSync(dirname(path),{recursive:true,mode:0o700});
    const previous=progress.stages[name];
    if(previous?.result){checkedFile(path,previous.result);return read(path);}
    if(previous?.state==='started'&&existsSync(path)){
      const value=read(path);progress.stages[name]={state:'complete',result:{path,...hashOriginalFile(path)}};save();return value;
    }
    progress.phase=name;progress.state='running';progress.stages[name]={state:'started'};save();
    const value=clone(await action());retain(path,value);progress.stages[name]={state:'complete',result:{path,...hashOriginalFile(path)}};save();return value;
  };
  const input=(name,path,body)=>{
    const original=progress.requests[name],value={path,body:clone(body)};
    const pathOnDisk=join(root,'requests',name+'.json');
    if(original){same(original,value,'APPLICATIONS_REQUEST_CHANGED','Keep the complete original '+name+' request.');
      retain(pathOnDisk,original);same(read(pathOnDisk),original,'APPLICATIONS_REQUEST_CHANGED','The original retained request bytes differ.');}
    else{if(existsSync(pathOnDisk))same(read(pathOnDisk),value,'APPLICATIONS_REQUEST_CHANGED','Keep the already retained original request.');
      progress.requests[name]=value;retain(pathOnDisk,value);save();}
    return progress.requests[name];
  };
  const request=async(name,path,body)=>{
    const original=input(name,path,body);
    const response=await fetch(host.origin+original.path,{
      method:'POST',headers:{Origin:host.origin,'Content-Type':'application/json','X-Runtime-Workspace-Token':new URL(host.url).hash.slice(1)},
      body:canonical(original.body),redirect:'error',signal:AbortSignal.timeout(120000)
    });
    const text=await response.text();let value;try{value=JSON.parse(text);}catch{throw Object.assign(Error('The original Applications response needs reconciliation.'),{code:'APPLICATIONS_RESPONSE_UNCERTAIN'});}
    const attempt=join(root,'http-receipts',name+'-'+digest(text)+'.json');
    retain(attempt,{request:original,status:response.status,value});emitArtifact({path:attempt,...hashOriginalFile(attempt)});
    assert(response.ok,'APPLICATIONS_NATIVE_ACTION','The original Applications '+name+' request did not complete.',409,{status:response.status,value});
    return value;
  };
  const successfulResponses=name=>{
    const directory=join(root,'http-receipts');
    if(!existsSync(directory))return [];
    const values=[];
    for(const file of readdirSync(directory).filter(file=>file.startsWith(name+'-')&&file.endsWith('.json')).sort()){
      const receipt=read(join(directory,file));
      same(receipt.request,progress.requests[name],'APPLICATIONS_HTTP_REQUEST','The retained response belongs to another original request.');
      if(receipt.status>=200&&receipt.status<300)values.push(receipt.value);
    }
    return values;
  };
  const selectedApplication=async()=>{
    const state=await model.applicationsState({historyLimit:100});
    const application=state.applications.find(value=>value.id===progress.applicationId);
    assert(application&&!application.error,'APPLICATIONS_SELECTION','The saved original application is unavailable.',409,application?.error);
    assert((!progress.applicationRevision||application.revision===progress.applicationRevision)&&application.kind==='rozo-payments'&&application.runtimeId===progress.runtimeId,
      'APPLICATIONS_SELECTION','The saved original application binding differs.',409);
    return application;
  };
  const waitFor=async(description,probe)=>{
    const until=Date.now()+waitMilliseconds;let value;
    do{value=await probe();if(value)return value;await delay(500);}while(Date.now()<until);
    throw Object.assign(Error(description+' is still pending in its original managed operation.'),{code:'APPLICATIONS_NATIVE_PENDING'});
  };
  try{
    same(progress.binding,binding,'APPLICATIONS_OPERATION','Keep the same native completion, committed source and receiving operation.');
    assert(progress.schema==='stellar-forge.rozo-installed-applications-progress.v1'&&progress.operationId===APPLICATIONS_OPERATION,
      'APPLICATIONS_OPERATION','Select the original installed Applications continuation.',409);
    save();
    const finalFile=join(root,'APPLICATIONS_COMPLETION.json');
    if(progress.state==='complete')assert(existsSync(finalFile),'APPLICATIONS_COMPLETION_MISSING','Restore the complete original accepted result.',409);
    if(existsSync(finalFile)){
      const completedResult=read(finalFile);
      assert(completedResult.operationId===APPLICATIONS_OPERATION&&completedResult.nativeCompletionSha256===binding.nativeCompletionSha256&&
        completedResult.sourceCommit===binding.ref,'APPLICATIONS_COMPLETION_CHANGED','The accepted original completion differs.',409);
      for(const file of completedResult.artifacts)checkedFile(join(root,file.name),file);
      progress.state='complete';progress.phase='complete';delete progress.pending;save();
      return {...completedResult,directory:root,reused:true};
    }
    const workspaceDirectory=join(directory,'received','workspace'),receivedRoot=join(directory,'received');
    const original=new RozoWorkspace(workspaceDirectory,{readOnly:true});
    try{
      const meta=original.meta(),control=original.get('control','operator')?.value;
      assert(meta.workspaceId===binding.workspaceId&&meta.originId===binding.originId&&control?.mode==='active',
        'APPLICATIONS_NATIVE_WORKSPACE','Open the original active received workspace.',409);
      await stage('original-workspace',()=>Promise.resolve(nativeInventory(original)));
    }finally{original.close();}
    const initial=read(join(root,'receipts','original-workspace.json'));
    const built=await stage('selected-distribution',async()=>{
      const value=await buildDistribution({repository,ref,output:join(root,'source-package'),selection:'rozo-payments',
        offline:true,resume:true,python,onProgress:event=>onProgress({phase:'selected-distribution',...event})});
      assert(value.status==='PACKAGED'&&value.sourceCommit===ref,'APPLICATIONS_BUILD','The original selected source build differs.',409);
      return value;
    });
    checkedFile(built.archive,{bytes:built.archiveBytes,sha256:built.sha256});
    const cache=join(root,'npm-cache');mkdirSync(cache,{recursive:true,mode:0o700});
    if(!progress.runtimeTargets.length){progress.runtimeTargets.push({directory:join(root,'runtime-1'),from:null});save();}
    let target=progress.runtimeTargets.at(-1),runtimeDirectory=target.directory;
    if(!existsSync(join(runtimeDirectory,'runtime-install.json'))){
      assert(!progress.stages['installed-runtime']?.result,'APPLICATIONS_RUNTIME_MISSING','Restore the previously accepted original runtime and its retained plan.',409);
      if(existsSync(runtimeDirectory)){
        assert(existsSync(join(runtimeDirectory,'preparation.json')),'APPLICATIONS_PREPARATION','Preserve and inspect the incomplete original runtime directory.',409);
        target={directory:join(root,'runtime-'+(progress.runtimeTargets.length+1)),from:runtimeDirectory};
        progress.runtimeTargets.push(target);save();runtimeDirectory=target.directory;
      }
      if(target.from)await recoverRuntime({from:target.from,directory:runtimeDirectory,offline:true,cache,npm,python,install:false});
      else await prepareRuntimeInstall({directory:runtimeDirectory,archive:built.archive,sha256:built.sha256,native:false,features:['rozo-payments'],operator:true,python});
    }
    const plan=read(join(runtimeDirectory,'runtime-install.json')),profile=read(join(runtimeDirectory,'runtime-profile.json'));
    assert(plan.archiveSha256===built.sha256&&plan.source.sourceCommit===ref&&profile.selection.native===false&&
      canonical(profile.selection.features)===canonical(['rozo-payments'])&&profile.selection.operator===true&&profile.dependencies.length===0&&
      /^>=24\./.test(profile.host.node),
      'APPLICATIONS_RUNTIME_PROFILE','Retain the original dependency-free Node 24 ROZO selection.',409);
    await installRuntime({directory:runtimeDirectory,offline:true,cache,npm});
    const ready=await inspectRuntimeInstall({directory:runtimeDirectory,load:true,source:true,python});
    assert(ready.status==='READY'&&ready.ready,'APPLICATIONS_READY','The original runtime did not reach READY.',409,ready);
    const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:true}),sourceSelection=selectRozoSource(runtime.sourceRoot);
    assert(runtime.sourceCommit===ref&&runtime.dependencyCount===0&&sourceSelection.sourceIdentity.distribution?.sourceCommit===ref,
      'APPLICATIONS_RUNTIME_SOURCE','The installed original package identity differs.',409);
    const executedSource=sourceSelection.sourceIdentity.files.find(file=>file.path===PRODUCT+'/native-applications.mjs');
    assert(executedSource,'APPLICATIONS_PROGRAMME_SOURCE','Include this complete installed programme in the selected product.');
    checkedFile(fileURLToPath(import.meta.url),executedSource);
    await stage('installed-runtime',()=>Promise.resolve({runtime,profile,sourceIdentity:sourceSelection.sourceIdentity}));
    same(read(join(root,'receipts','installed-runtime.json')).runtime,runtime,'APPLICATIONS_RUNTIME_CHANGED','The original READY runtime binding changed.');
    progress.runtimeDirectory=runtimeDirectory;save();
    const installedModule=path=>import(pathToFileURL(join(runtime.sourceRoot,path)).href);
    const workspaceAPI=await installedModule(DISTRIBUTION+'/runtime-workspace/model.mjs');
    const workspaceServer=await installedModule(DISTRIBUTION+'/runtime-workspace/server.mjs');
    const applicationCore=await installedModule(DISTRIBUTION+'/runtime-workspace/applications-core.mjs');
    const environmentAPI=await installedModule(DISTRIBUTION+'/runtime-workspace/application-environment.mjs');
    const template=read(join(receivedRoot,'configuration','received-template.json'));
    for(const connection of Object.values(template.connections))for(const name of ['sourceRoot','modulePath','runtimeRoot','decoderModule','decoderPackageJson','decoderRuntimeRoot'])
      if(connection[name]?.startsWith('@ROOT/'))connection[name]=join(receivedRoot,connection[name].slice(6));
    template.publisherSelectionsFile=join(runtime.sourceRoot,PRODUCT,'publishers.json');
    const configFile=join(root,'connections.json'),environmentFile=join(root,'environment.json');
    retain(configFile,template);
    retain(environmentFile,{ROZO_NATIVE_KEY:FIXTURE_KEY,ROZO_NATIVE_WEBHOOK_SECRET:FIXTURE_SECRET,ROZO_PYTHON:python,TMPDIR:temporary,TEMP:temporary,TMP:temporary});
    await environmentAPI.applicationEnvironment(environmentFile);
    if(!progress.workspaceTargets.length){progress.workspaceTargets.push(join(root,'staff-workspace-1'));save();}
    let staffDirectory=progress.workspaceTargets.at(-1);
    if(!existsSync(join(staffDirectory,'workspace.json'))){
      assert(!progress.staffWorkspaceId,'APPLICATIONS_STAFF_WORKSPACE_MISSING','Restore the accepted original Applications workspace before another save.',409);
      if(existsSync(staffDirectory)){staffDirectory=join(root,'staff-workspace-'+(progress.workspaceTargets.length+1));progress.workspaceTargets.push(staffDirectory);save();}
      await workspaceAPI.createRuntimeWorkspace({directory:staffDirectory});
    }
    model=await workspaceAPI.openRuntimeWorkspace({directory:staffDirectory});
    const workspaceState=await model.state();
    if(progress.staffWorkspaceId)assert(workspaceState.workspaceId===progress.staffWorkspaceId,'APPLICATIONS_STAFF_WORKSPACE','Keep the original saved Applications workspace.',409);
    else{progress.staffWorkspaceId=workspaceState.workspaceId;save();}
    const attached=await model.attach({directory:runtimeDirectory,label:'ROZO original native receiving'});
    if(progress.runtimeId)assert(attached.runtimeId===progress.runtimeId,'APPLICATIONS_RUNTIME_CHANGED','The original attached runtime differs.',409);
    else{progress.runtimeId=attached.runtimeId;save();}
    progress.staffDirectory=staffDirectory;save();
    host=await workspaceServer.startRuntimeWorkspace({directory:staffDirectory,port:0});
    const review=await stage('application-review',()=>request('review','/api/applications/review',{
      runtimeId:progress.runtimeId,kind:'rozo-payments',label:'ROZO original merchant workspace',
      settings:{workspaceDirectory,connectionsFile:configFile,environmentFile,port:0}
    }));
    assert(review.schema==='stellar-forge.application-review.v1'&&review.runtimeId===progress.runtimeId&&review.kind==='rozo-payments',
      'APPLICATIONS_REVIEW','The original reviewed application differs.',409);
    if(!progress.saveRequestId){progress.saveRequestId=randomUUID();save();}
    const earlierSave=successfulResponses('save').filter(value=>value?.saved===true);
    if(progress.applicationId||earlierSave.length){
      const originalId=progress.applicationId??earlierSave[0].applicationId;
      for(const value of earlierSave)assert(value.applicationId===originalId,'APPLICATIONS_SAVE_CHANGED','Earlier success names another original application.',409);
      if(!progress.applicationId){progress.applicationId=originalId;save();}
      await selectedApplication();
    }
    const saved=await request('save','/api/applications/save',{requestId:progress.saveRequestId,reviewId:review.id,applicationId:null});
    assert(saved.saved&&!saved.superseded,'APPLICATIONS_SAVE','The original application save was superseded.',409,saved);
    if(progress.applicationId)assert(saved.applicationId===progress.applicationId,'APPLICATIONS_SAVE','Keep the original application ID.',409);
    else{progress.applicationId=saved.applicationId;save();}
    if(progress.applicationRevision)assert(saved.revision===progress.applicationRevision,'APPLICATIONS_SAVE_CHANGED','The original saved application revision changed.',409);
    else{progress.applicationRevision=saved.revision;save();}
    await stage('application-save',()=>Promise.resolve(saved));
    let application=await selectedApplication();
    if(!application.release)await request('connect','/api/applications/connect',{applicationId:progress.applicationId});
    application=await waitFor('The original managed runtime connection',async()=>{
      const value=await selectedApplication();return value.release?value:null;
    });
    await stage('application-connected',()=>Promise.resolve({applicationId:application.id,revision:application.revision,release:application.release,home:application.home}));
    const currentRun=()=>applicationCore.applicationRunState(staffDirectory,{applicationId:progress.applicationId,operationId:progress.startRequestId});
    if(!progress.startRequests?.length){
      progress.startRequestId=progress.startRequestId??randomUUID();
      progress.startRequests=[{requestId:progress.startRequestId,previous:null}];save();
    }
    assert(progress.startRequests.at(-1).requestId===progress.startRequestId,'APPLICATIONS_START_CHANGED','Keep the original current listener request.',409);
    let started=await currentRun();
    const dispatchStart=async()=>{
      const suffix=progress.startRequestId,reviewName='start-review-'+suffix,requestName='start-'+suffix;
      const accepted=successfulResponses(requestName);
      assert(!accepted.length,'APPLICATIONS_START_MISSING','An accepted managed start is missing from its original store; restore it before continuing.',409);
      const reviewStart=await stage('application-start-review-'+suffix,()=>request(reviewName,'/api/applications/start-review',{applicationId:progress.applicationId}));
      const value=await request(requestName,'/api/applications/start',{applicationId:progress.applicationId,requestId:suffix,reviewId:reviewStart.id});
      assert(value.applicationId===progress.applicationId&&value.operationId===suffix,'APPLICATIONS_START_CHANGED','The accepted managed start names another operation.',409);
      const retained=await currentRun();assert(retained,'APPLICATIONS_START_MISSING','Retain the accepted original managed run.',409);return retained;
    };
    if(!started){
      assert(!progress.requests.stop&&!progress.stages['working-export']?.result&&
        !progress.stages['application-open-state-'+progress.startRequestId]?.result,
        'APPLICATIONS_START_MISSING','Restore the original already observed listener before continuing.',409);
      started=await dispatchStart();
    }else if(!started.active&&!progress.requests.stop&&!progress.stages['working-export']?.result){
      if(['PENDING','QUEUED','RUNNING','FAILED','INTERRUPTED'].includes(started.phase)){
        await request('recover-start-'+progress.startRequestId,'/api/applications/recover',{applicationId:progress.applicationId,operationId:progress.startRequestId});
        started=await currentRun();
      }
      if(!started.active&&started.phase==='SUCCEEDED'){
        const outcome=started.result??started.state?.result;
        assert(!started.stop&&!outcome?.stopRequested&&['EXITED','LAUNCH_FAILED','RECONCILED'].includes(outcome?.state)&&
          !await operationRunning(join(staffDirectory,'operations',progress.startRequestId,'worker.lock')),
          'APPLICATIONS_EARLIER_STOP','Retain an explicit stop or unknown process outcome; finish its original reconciliation before another listener.',409,started);
        await stage('drained-listener-'+progress.startRequestId,()=>Promise.resolve(started));
        const previous=progress.startRequestId;progress.startRequestId=randomUUID();
        progress.startRequests.push({requestId:progress.startRequestId,previous});save();
        started=await dispatchStart();
      }
    }
    const exportComplete=progress.stages['working-export']?.result;
    if(!exportComplete){
      application=await waitFor('The original managed application start',async()=>{
        const value=await selectedApplication();
        if(value.current?.id===progress.startRequestId&&value.current.active&&value.current.privateUrl)return value;
        return null;
      });
      assert(application.current.id===progress.startRequestId,'APPLICATIONS_START','The actual managed run differs.',409);
      const address=new URL(application.current.privateUrl),token=new URLSearchParams(address.hash.slice(1)).get('session');
      assert(address.hostname==='127.0.0.1'&&token,'APPLICATIONS_START','The original private startup is invalid.',409);
      const rozoRead=async(path)=>{
        const response=await fetch(address.origin+path,{headers:{'X-Rozo-Session':token},redirect:'error',signal:AbortSignal.timeout(30000)});
        const value=await response.json();assert(response.ok,'APPLICATIONS_ROZO_READ','The installed original state is unavailable.',409,value);return value;
      };
      const live=await rozoRead('/api/state');
      assert(live.workspace.workspaceId===binding.workspaceId&&live.workspace.originId===binding.originId&&
        canonical(live.sourceIdentity)===canonical(sourceSelection.sourceIdentity),
        'APPLICATIONS_LIVE_BINDING','The authenticated installed workspace/source differs.',409);
      await stage('application-open-state-'+progress.startRequestId,()=>Promise.resolve({applicationId:application.id,revision:application.revision,operationId:progress.startRequestId,state:live}));
      if(!chromium||!playwrightModule){
        progress.state='pending';progress.phase='installed-browser';progress.pending={code:'BROWSER_RUNTIME',applicationId:progress.applicationId,operationId:progress.startRequestId};save();
        return {...progress,directory:root};
      }
      browser=await openInstalledRozoBrowser({directory:join(root,'browser',progress.startRequestId),startup:host,application,expectedWorkspace:binding,
        chromium,playwrightModule,onArtifact:emitArtifact,onStopRequest:async body=>{
          const original=input('stop','/api/applications/stop',{applicationId:progress.applicationId,operationId:progress.startRequestId});
          same(body,original.body,'APPLICATIONS_STOP_CHANGED','Keep the exact original UI Stop request.');
          progress.uiStopRequestSeen=true;save();
        }});
      await stage('installed-browser-'+progress.startRequestId,()=>Promise.resolve(browser.receipt));
      await stage('working-export',async()=>{
        let envelope=progress.exportRequest;
        if(!envelope){
          const state=await rozoRead('/api/state');
          envelope={workspaceId:binding.workspaceId,requestId:'native:installed-working-export',expectedRevision:state.workspace.revision,
            actor:'Installed Applications receiving operator',command:'workspace.export',
            payload:{id:'native-installed-working',title:'Complete installed ROZO working snapshot'}};
          progress.exportRequest=envelope;retain(join(root,'requests','rozo-working-export.json'),envelope);save();
        }
        const response=await fetch(address.origin+'/api/commands',{method:'POST',headers:{
          Origin:address.origin,'Content-Type':'application/json','X-Rozo-Session':token
        },body:canonical(envelope),redirect:'error',signal:AbortSignal.timeout(120000)});
        const value=await response.json();
        assert(response.ok&&value.requestId===envelope.requestId&&value.delivery?.mode==='working'&&
          value.delivery.workspaceId===binding.workspaceId&&value.delivery.originId===binding.originId,
          'APPLICATIONS_EXPORT','Finish the exact original working export request.',409,value);
        const archive=await downloadOriginal(address.origin+'/api/deliveries/'+encodeURIComponent(value.delivery.deliveryId)+'/file',
          {'X-Rozo-Session':token},join(root,'Rozo_Installed_Workspace.zip'),{bytes:value.delivery.bytes,sha256:value.delivery.sha256});
        const w=new RozoWorkspace(workspaceDirectory,{readOnly:true});let inventory,originalRequest;
        try{inventory=nativeInventory(w);originalRows(initial,inventory);originalRequest=w.request(envelope.requestId);
          same(originalRequest.envelope,envelope,'APPLICATIONS_EXPORT_REQUEST','The accepted original export envelope differs.');
          assert(originalRequest.state==='accepted'&&originalRequest.intent.sourceSha256===sourceSelection.sourceIdentity.manifestSha256,
            'APPLICATIONS_EXPORT_REQUEST','The installed working export source differs.',409);
        }finally{w.close();}
        const inventoryFile=retain(join(root,'EXPORTED_WORKSPACE_INVENTORY.json'),inventory);
        emitArtifact(archive);emitArtifact(inventoryFile);
        return {archive,delivery:value.delivery,request:originalRequest,inventory:inventoryFile};
      });
    }
    const exported=read(join(root,'receipts','working-export.json'));
    checkedFile(exported.archive.path,exported.archive);checkedFile(exported.inventory.path,exported.inventory);
    const stop=input('stop','/api/applications/stop',{applicationId:progress.applicationId,operationId:progress.startRequestId});
    application=await selectedApplication();
    const originalRun=await currentRun();
    assert(application.current?.id===progress.startRequestId&&originalRun&&originalRun.phase!=='PENDING'&&
      existsSync(join(staffDirectory,'operations',progress.startRequestId,'request.json')),
      'APPLICATIONS_STOP_SOURCE','Restore the originally observed run or reconcile a later selected run before Stop.',409);
    if(application.current?.active&&browser&&!progress.uiStopRequestSeen)
      await stage('application-stop-control',()=>browser.stop(stop.body));
    const stoppedResult=await request('stop',stop.path,stop.body);
    application=await waitFor('The original application drain',async()=>{
      const value=await selectedApplication(),run=await currentRun();
      return run&&!run.active&&!await operationRunning(join(staffDirectory,'operations',progress.startRequestId,'worker.lock'))?value:null;
    });
    assert(application.current?.id===progress.startRequestId,'APPLICATIONS_STOP','Retain the original selected run after Stop.',409);
    if(browser)await browser.stopped();
    await stage('application-stopped',()=>Promise.resolve({application,stop:stoppedResult,uiRequestSeen:progress.uiStopRequestSeen===true}));
    await browser?.close();browser=null;
    const current=new RozoWorkspace(workspaceDirectory,{readOnly:true});
    try{same(nativeInventory(current),read(exported.inventory.path),'APPLICATIONS_POST_STOP','Stopping the installed listener changed the saved ROZO workspace.');}finally{current.close();}
    const histories=[];let cursor=null;
    do{
      const page=await model.applicationsHistory({applicationId:progress.applicationId,limit:100,...(cursor?{cursor}:{})});
      histories.push(page);cursor=page.nextCursor??null;
    }while(cursor);
    await stage('complete-application-history',async()=>({state:await model.applicationsState({historyLimit:100}),pages:histories,workspace:await model.state()}));
    const transferDirectory=join(root,'runtime-transfer');
    const transferred=await exportRuntimeTransfer({runtimeDirectory,directory:transferDirectory,cache,npm,offline:true,
      expectedLockSha256:runtime.lockSha256,onProgress:event=>onProgress({phase:'runtime-transfer',...event})});
    assert(transferred.complete,'APPLICATIONS_TRANSFER','The complete original runtime transfer is not retained.',409);
    await stage('runtime-transfer',()=>Promise.resolve({transferId:transferred.manifest.transferId,manifestSha256:transferred.manifestSha256,manifest:transferred.manifest,parts:transferred.parts}));
    const transferReceive=join(root,'runtime-transfer-received'),manifestFile=join(transferDirectory,'manifest.json');
    await beginRuntimeTransferReceive({directory:transferReceive,manifest:readFileSync(manifestFile),manifestSha256:transferred.manifestSha256});
    for(const part of transferred.manifest.parts){
      const path=join(root,'transfer-parts',part.name);mkdirSync(dirname(path),{recursive:true,mode:0o700});
      await copyRuntimeTransferPart({directory:transferDirectory,index:part.index,file:path});
      checkedFile(path,part);
      await receiveRuntimeTransferPart({directory:transferReceive,index:part.index,file:path});emitArtifact({path,...hashOriginalFile(path)});
    }
    if(!progress.receivingTargets.length){progress.receivingTargets.push({directory:join(root,'received-runtime-1'),from:null});save();}
    let receiver=progress.receivingTargets.at(-1);
    if(existsSync(receiver.directory)&&!existsSync(join(receiver.directory,'runtime-install.json'))){
      receiver={directory:join(root,'received-runtime-'+(progress.receivingTargets.length+1)),from:receiver.directory};
      progress.receivingTargets.push(receiver);save();
    }
    await installReceivedRuntime({directory:transferReceive,runtimeDirectory:receiver.directory,npm,python,install:false,recoverFrom:receiver.from});
    const installedSelection=selectRozoSource(join(receiver.directory,'package','source'));
    same(installedSelection.sourceIdentity,sourceSelection.sourceIdentity,'APPLICATIONS_TRANSFER_SOURCE','The received package/source bytes changed.');
    const selection={
      schema:'stellar-forge.rozo-installed-receiving-selection.v1',operationId:APPLICATIONS_OPERATION,nativeOperation:NATIVE_OPERATION,
      nativeCompletionSha256:binding.nativeCompletionSha256,workspaceId:binding.workspaceId,originId:binding.originId,
      applicationId:progress.applicationId,applicationRevision:application.revision,applicationRunId:progress.startRequestId,
      transfer:{directory:transferReceive,transferId:transferred.manifest.transferId,manifestSha256:transferred.manifestSha256},
      runtimeDirectory:receiver.directory,recoverFrom:receiver.from,runtime,sourceIdentity:sourceSelection.sourceIdentity,
      archive:exported.archive,inventory:exported.inventory,exportRequestId:progress.exportRequest.requestId,
      directory:join(root,'received-working-workspace'),resultFile:join(root,'INSTALLED_RECEIVING_RESULT.json'),npm,python
    };
    const selectionPath=join(root,'requests','installed-receiving-'+digest(receiver.directory)+'.json');retain(selectionPath,selection);
    const executed=await nativeChild(join(installedSelection.sourceRoot,PRODUCT,'applications-receiving.mjs'),selectionPath,lease,root);
    retain(join(root,'receiving-process-'+digest(canonical(executed))+'.json'),executed);
    assert(executed.code===0,'APPLICATIONS_COLD_RECEIVER','The separate original installed receiver needs its retained continuation.',409,executed);
    const received=read(selection.resultFile);
    assert(received.selectionSha256===digest(readFileSync(selectionPath))&&received.applicationId===progress.applicationId&&received.readOnly,
      'APPLICATIONS_COLD_RECEIVER','The original cold receiver result differs.',409);
    const finalTransfer=await inspectRuntimeTransfer({directory:transferReceive,verify:true});
    assert(finalTransfer.complete&&finalTransfer.manifestSha256===transferred.manifestSha256,'APPLICATIONS_COLD_TRANSFER','The exact complete transfer was not received.',409);
    emitArtifact({path:selection.resultFile,...hashOriginalFile(selection.resultFile)});
    const result={
      schema:'stellar-forge.rozo-installed-applications-completion.v1',operationId:APPLICATIONS_OPERATION,
      nativeOperation:NATIVE_OPERATION,nativeCompletionSha256:binding.nativeCompletionSha256,dataContext:'DEVELOPMENT',
      sourceCommit:ref,sourceIdentity:sourceSelection.sourceIdentity,originalWorkspace:{workspaceId:binding.workspaceId,originId:binding.originId,
        originalRevision:initial.workspace.revision,exportRevision:read(exported.inventory.path).workspace.revision},
      built,runtime,application:{workspaceId:progress.staffWorkspaceId,directory:staffDirectory,id:progress.applicationId,
        revision:application.revision,saveRequestId:progress.saveRequestId,runId:progress.startRequestId,runs:progress.startRequests,phase:application.phase},
      browser:read(join(root,'receipts','installed-browser-'+progress.startRequestId+'.json')),working:exported.archive,
      transfer:{directory:transferDirectory,transferId:transferred.manifest.transferId,manifestSha256:transferred.manifestSha256},
      receiving:received,artifacts:progress.files,phases:Object.keys(progress.stages),
      completedAt:new Date().toISOString(),publicProviderPayments:0,transactionsSignedOrSent:0
    };
    retain(finalFile,result);progress.state='complete';progress.phase='complete';delete progress.pending;save();return {...result,directory:root};
  }catch(error){
    progress.state='pending';progress.lastError={code:error.code??'APPLICATIONS_ERROR',message:error.message,details:error.details??{},at:new Date().toISOString()};
    try{save();}catch(checkpointError){error.checkpointError={code:checkpointError.code??'CHECKPOINT_ERROR',message:checkpointError.message};}throw error;
  }finally{
    await browser?.close();await host?.close();await model?.close();
    for(const [name,value]of Object.entries(previousEnvironment))if(value===undefined)delete process.env[name];else process.env[name]=value;
    await lease.close();
  }
}
