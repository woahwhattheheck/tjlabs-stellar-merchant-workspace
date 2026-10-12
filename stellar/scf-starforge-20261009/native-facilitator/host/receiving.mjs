#!/usr/bin/env node
// MIT. One resumable operator receiving case using the actual original SDK/CLI/systemd service.
import { pathToFileURL,fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { stage,readBundle,compareBundles } from './plan.mjs';
import { begin,resume,drain,exportHandover,status } from './host.mjs';
import { run as originalHostCLI } from './cli.mjs';
import { need,absolute,readJSON,maybeJSON,regular,hash,json,atomicFile,realDirectory,processIdentity,inside } from './shared.mjs';

const sameProc=(a,b)=>a?.pid===b?.pid&&a?.startTicks===b?.startTicks&&a?.bootId===b?.bootId;
export async function receiveCase({input,output}){
  need(process.getuid?.()===0,'HOST_ADMINISTRATOR_REQUIRED');
  input=absolute(input);output=absolute(output);
  const original=await readJSON(input),request=original.value;
  need(request.schema==='stellar-forge.native-facilitator-host-receiving.v1'&&request.authoredTestnet===true,
    'HOST_AUTHORED_TESTNET_CASE_REQUIRED');
  need(typeof request.operationPrefix==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,60}$/.test(request.operationPrefix),
    'HOST_OPERATION_PREFIX_INVALID');
  const beforeSelection=request.before,afterSelection=request.after,receiveSelection=request.receiving;
  for(const s of [beforeSelection,afterSelection,receiveSelection]){
    need(s&&s.enableAtBoot===false,'HOST_RECEIVING_BOOT_DISABLED_REQUIRED');
    const cfg=(await readJSON(absolute(s.config))).value;need(cfg.network==='stellar:testnet','HOST_TESTNET_RECEIVING_REQUIRED');
    need(!inside(s.hostDirectory,output)&&!inside(s.runtimeDirectory,output)&&!inside(s.ownershipDirectory,output),
      'HOST_RECEIVING_OUTPUT_MUST_BE_SEPARATE');
  }
  need(beforeSelection.hostDirectory===afterSelection.hostDirectory&&
    receiveSelection.hostDirectory!==beforeSelection.hostDirectory&&receiveSelection.unit!==beforeSelection.unit&&
    receiveSelection.port!==beforeSelection.port,'HOST_RECEIVING_SEPARATE_TARGET_REQUIRED');
  need(beforeSelection.ownershipDirectory===receiveSelection.ownershipDirectory&&
    beforeSelection.user===receiveSelection.user&&beforeSelection.group===receiveSelection.group,
    'HOST_SAME_HOST_SHARED_SIGNER_IDENTITY_REQUIRED');
  await realDirectory(dirname(output),{uid:0});
  try{await realDirectory(output,{newOnly:true,uid:0,gid:0,mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;await realDirectory(output,{uid:0,mode:0o700});}
  const progressFile=join(output,'progress.json'),saved=await maybeJSON(progressFile);
  need(!saved||saved.value.inputSha256===original.sha256,'HOST_RECEIVING_INPUT_CHANGED');
  const p=saved?.value??{schema:'stellar-forge.native-facilitator-host-receiving-result.v1',
    inputSha256:original.sha256,startedAt:new Date().toISOString(),steps:{},status:'RUNNING'};
  if(p.status==='COMPLETED'){
    await atomicFile(join(output,'result.json'),json(p),{allowed:[null,hash(json(p))]});
    return {status:'COMPLETED',result:join(output,'result.json'),handover:join(output,'handover'),scope:p.scope,replayed:true};
  }
  async function checkpoint(name,value){
    p.steps[name]=value;p.updatedAt=new Date().toISOString();
    const old=await maybeJSON(progressFile);await atomicFile(progressFile,json(p),{allowed:[old?.sha256??null]});return value;
  }
  async function once(name,fn){return p.steps[name]??checkpoint(name,await fn());}
  const id=name=>request.operationPrefix+'-'+name;
  async function complete(name,start,root,opid){
    if(p.steps[name])return p.steps[name];
    let r=await start();const deadline=Date.now()+180000;
    while(['WAITING_FOR_ORIGINAL_DRAIN','WAITING_FOR_ORIGINAL_READINESS'].includes(r.status)){
      if(Date.now()>=deadline){p.pending={step:name,hostDirectory:root,operationId:opid,status:r.status};
        const old=await maybeJSON(progressFile);await atomicFile(progressFile,json(p),{allowed:[old?.sha256??null]});
        return Object.assign(r,{receivingPending:true});}
      await new Promise(resolve=>setTimeout(resolve,500));
      r=await resume({hostDirectory:root,operationId:opid,waitSeconds:10});
    }
    delete p.pending;return checkpoint(name,r);
  }
  const before=await once('beforeStage',()=>stage({...beforeSelection,stageId:id('before')}));
  const applied=await complete('beforeApply',()=>begin({bundle:before.directory,operationId:id('install'),
    reviewedBundleId:before.bundleId,expectedCurrentBundleId:null,waitSeconds:10}),before.hostDirectory,id('install'));
  if(applied.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(applied.status==='COMPLETED'&&applied.observation.ready,'HOST_RECEIVING_INITIAL_START_FAILED');
  const replay=await once('lostReplyReplay',async()=>{
    const result=await begin({bundle:before.directory,operationId:id('install'),reviewedBundleId:before.bundleId,
      expectedCurrentBundleId:null,waitSeconds:0});
    const observed=await status({hostDirectory:before.hostDirectory});
    need(result.status==='COMPLETED'&&sameProc(applied.observation.process,observed.observation?.process),
      'HOST_RECEIVING_REPLAY_RESTARTED_PROCESS');
    return {status:result.status,originalProcessPreserved:true,process:observed.observation.process};
  });
  const after=await once('afterStage',()=>stage({...afterSelection,stageId:id('after')}));
  const difference=await once('reviewedDifference',async()=>{
    const d=compareBundles(await readBundle(before.directory),await readBundle(after.directory));
    need(before.configSha256!==after.configSha256,'HOST_RECEIVING_DISTINCT_EDITION_REQUIRED');return d;
  });
  const transitioned=await complete('transition',()=>begin({bundle:after.directory,operationId:id('transition'),
    reviewedBundleId:after.bundleId,expectedCurrentBundleId:before.bundleId,waitSeconds:10}),after.hostDirectory,id('transition'));
  if(transitioned.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(transitioned.status==='COMPLETED'&&transitioned.observation.ready,'HOST_RECEIVING_TRANSITION_FAILED');
  need(!sameProc(applied.observation.process,transitioned.observation.process),'HOST_RECEIVING_OLD_PROCESS_REUSED');
  // Explicit local connection-refused fault: no payment, SDK replacement or fake RPC response.
  const faultConfig=join(output,'refused-rpc-config.json');
  const afterConfig=(await readJSON(afterSelection.config)).value;
  const fault={...afterConfig,rpcUrl:'https://127.0.0.1:9',operations:{...afterConfig.operations,rpcTimeoutMs:100,requireReady:true}};
  const faultBytes=json(fault);
  await atomicFile(faultConfig,faultBytes,{allowed:[null,hash(faultBytes)]});
  const faultBundle=await once('faultStage',()=>stage({...afterSelection,config:faultConfig,stageId:id('refused-rpc')}));
  const failed=await complete('failedStart',()=>begin({bundle:faultBundle.directory,operationId:id('failed-start'),
    reviewedBundleId:faultBundle.bundleId,expectedCurrentBundleId:after.bundleId,waitSeconds:10}),after.hostDirectory,id('failed-start'));
  if(failed.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(failed.status==='ORIGINAL_START_FAILED','HOST_RECEIVING_EXPECTED_ORIGINAL_START_FAILURE');
  const restored=await complete('rollback',()=>resume({hostDirectory:after.hostDirectory,operationId:id('failed-start'),
    rollback:true,waitSeconds:10}),after.hostDirectory,id('failed-start'));
  if(restored.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(restored.status==='ROLLED_BACK'&&restored.observation.ready,'HOST_RECEIVING_ROLLBACK_FAILED');
  const publicDir=join(output,'handover');
  const handover=await once('handover',async()=>{
    const captureFile=join(output,'handover-capture.json'),captured=await maybeJSON(captureFile);
    let frozen=captured?.value;
    if(!frozen){
      const selected=await exportHandover({bundle:after.directory,hostDirectory:after.hostDirectory});
      frozen={bundleId:after.bundleId,files:Object.fromEntries(Object.entries(selected).map(([name,bytes])=>[name,bytes.toString('base64')]))};
      await atomicFile(captureFile,json(frozen));
    }
    need(frozen.bundleId===after.bundleId,'HOST_RECEIVING_HANDOVER_CHANGED');
    const files=Object.fromEntries(Object.entries(frozen.files).map(([name,bytes])=>{
      need(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)&&typeof bytes==='string','HOST_RECEIVING_HANDOVER_INVALID');
      return [name,Buffer.from(bytes,'base64')];
    }));
    try{await realDirectory(publicDir,{newOnly:true,uid:0,gid:0,mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
    for(const [name,bytes]of Object.entries(files))await atomicFile(join(publicDir,name),bytes,{allowed:[null,hash(bytes)]});
    const manifest=(await readJSON(join(publicDir,'MANIFEST.json'))).value;
    for(const entry of manifest.files){const r=await regular(join(publicDir,entry.path));need(r.sha256===entry.sha256&&r.bytes.length===entry.bytes,'HOST_RECEIVING_EXPORTED_FILE_CHANGED');}
    return {directory:publicDir,manifestSha256:(await regular(join(publicDir,'MANIFEST.json'))).sha256,files:manifest.files};
  });
  const stoppedOriginal=await complete('originalDrained',()=>drain({hostDirectory:after.hostDirectory,operationId:id('drain-original'),
    expectedCurrentBundleId:after.bundleId,waitSeconds:10}),after.hostDirectory,id('drain-original'));
  if(stoppedOriginal.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(stoppedOriginal.status==='DRAINED'&&stoppedOriginal.observation.stopped,'HOST_RECEIVING_ORIGINAL_NOT_DRAINED');
  const receivingFile=join(output,'receiving-selection.json'),receivingBytes=json({...receiveSelection,stageId:id('receiver')});
  await atomicFile(receivingFile,receivingBytes,{allowed:[null,hash(receivingBytes)]});
  const received=await once('receivedStage',()=>originalHostCLI(['receive','--handover',join(publicDir,'HOST-HANDOVER.json'),
    '--selection',receivingFile]));
  need(received.status==='RECEIVED_STAGED','HOST_RECEIVING_TARGET_NOT_STAGED');
  const rb=received.bundle;
  const accepted=await complete('receivedActive',()=>begin({bundle:rb.directory,operationId:id('receive-activate'),
    reviewedBundleId:rb.bundleId,expectedCurrentBundleId:null,waitSeconds:10}),rb.hostDirectory,id('receive-activate'));
  if(accepted.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(accepted.status==='COMPLETED'&&accepted.observation.ready,'HOST_RECEIVING_TARGET_START_FAILED');
  const stoppedReceiver=await complete('receiverDrained',()=>drain({hostDirectory:rb.hostDirectory,operationId:id('drain-receiver'),
    expectedCurrentBundleId:rb.bundleId,waitSeconds:10}),rb.hostDirectory,id('drain-receiver'));
  if(stoppedReceiver.receivingPending)return {status:'PENDING',progressFile,pending:p.pending};
  need(stoppedReceiver.status==='DRAINED'&&stoppedReceiver.observation.stopped,'HOST_RECEIVING_TARGET_NOT_DRAINED');
  p.status='COMPLETED';p.finishedAt=new Date().toISOString();
  p.scope={actualOriginalSDK:true,actualSystemdServices:true,actualRPCReadiness:true,paymentCalls:0,
    sourceEditions:2,originalStartFailure:'LOCAL_HTTPS_CONNECTION_REFUSED',originalRollback:true,
    sameHostReceiving:true,remoteHostCommissioning:false,finalServices:'DRAINED',sharedSignerInodesRetained:true};
  const own=['shared.mjs','plan.mjs','probe.mjs','host.mjs','cli.mjs','receiving.mjs'];
  p.sourceFiles=[];for(const name of own){const r=await regular(fileURLToPath(new URL('./'+name,import.meta.url)));p.sourceFiles.push({path:name,sha256:r.sha256,bytes:r.bytes.length});}
  const old=await maybeJSON(progressFile);await atomicFile(progressFile,json(p),{allowed:[old?.sha256??null]});
  await atomicFile(join(output,'result.json'),json(p),{allowed:[null,hash(json(p))]});
  return {status:p.status,result:join(output,'result.json'),handover:publicDir,scope:p.scope};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const a=process.argv.slice(2);need(a.length===4&&a[0]==='--input'&&a[2]==='--output','HOST_RECEIVING_ARGUMENTS_INVALID');
    const r=await receiveCase({input:a[1],output:a[3]});process.stdout.write(json(r));if(r.status==='PENDING')process.exitCode=75;
  }catch(e){process.stderr.write(json({error:e.code||'HOST_RECEIVING_FAILED'}));process.exitCode=2;}
}
