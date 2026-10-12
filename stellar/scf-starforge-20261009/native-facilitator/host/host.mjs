// MIT. One original systemd service; durable configuration transitions, no payment dispatcher.
import { join } from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { SCHEMA, now, hash, json, need, absolute, regular, maybeJSON, readJSON, realDirectory, atomicFile,
  saveJSON, removeOwned,hostLease,command,processIdentity,serviceState,groupProcesses,signerFiles,sameInode } from './shared.mjs';
import { readBundle,publicBundle,compareBundles,preflight } from './plan.mjs';

const stateFile=root=>join(root,'current.json'),activeFile=root=>join(root,'active-operation.json');
const opFile=(root,id)=>join(root,'operations',id+'.json');
const markerText=op=>json({schema:SCHEMA,operationId:op.request.operationId,requestSha256:op.requestSha256});
const processSame=(a,b)=>!!a&&!!b&&a.pid===b.pid&&a.startTicks===b.startTicks&&a.bootId===b.bootId;
const finished=new Set(['COMPLETED','ROLLED_BACK','DRAINED']);
async function saveOperation(op){
  const file=opFile(op.request.hostDirectory,op.request.operationId),old=await maybeJSON(file);
  need(!old||old.value.requestSha256===op.requestSha256,'HOST_OPERATION_ID_REUSED');
  await saveJSON(file,op,[old?.sha256??null]);
}
async function phase(op,value,detail={}){
  if(op.phase!==value){op.phase=value;op.history.push({phase:value,at:now(),...detail});}
  op.updatedAt=now();await saveOperation(op);
}
function sameHost(a,b){
  for(const name of ['hostDirectory','unit','systemdDirectory','ownershipDirectory','network','port'])
    need(a[name]===b[name],'HOST_TRANSITION_IDENTITY_CHANGED');
  need(json(a.account)===json(b.account),'HOST_TRANSITION_ACCOUNT_CHANGED');
}
async function installed(plan,allowed,{absent=false}={}){
  let bytes=null;try{bytes=await regular(plan.unitFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  const row=await serviceState(plan);
  if(!bytes){
    need(absent&&['not-found','masked'].includes(row.LoadState)&&row.MainPID===0&&row.ControlPID===0,
      'HOST_ORIGINAL_UNIT_REQUIRED');return {row,sha256:null};
  }
  need(allowed.includes(bytes.sha256)&&bytes.stat.uid===0&&bytes.stat.mode===0o644,'HOST_INSTALLED_UNIT_CHANGED');
  need(row.LoadState==='loaded'&&row.FragmentPath===plan.unitFile&&!row.DropInPaths,'HOST_UNIT_OVERRIDE_PRESENT');
  need(row.User===plan.account.user&&row.Group===plan.account.group&&row.DynamicUser!=='yes','HOST_EFFECTIVE_ACCOUNT_CHANGED');
  need(row.KillMode==='mixed'&&['15','SIGTERM'].includes(row.KillSignal)&&
    ['15','SIGTERM'].includes(row.RestartKillSignal)&&row.SendSIGKILL==='no'&&row.SendSIGHUP==='no'&&
    row.TimeoutStopUSec==='infinity'&&row.Restart==='no'&&!row.RestartForceExitStatus&&!row.ExecStop&&!row.ExecStopPost,
    'HOST_EFFECTIVE_DRAIN_CONFIGURATION_CHANGED');
  return {row,sha256:bytes.sha256};
}
function originalArgv(plan){return [plan.node.path,plan.cli,'--serve','--config',plan.configFile,'--port',String(plan.port),
  '--state',plan.ownershipDirectory,'--require-ready'];}
async function nativeProcess(plan,row){
  const process=await processIdentity(row.MainPID);
  if(!process)return null;
  need(process.uid===plan.account.uid&&process.executable===plan.node.path&&
    json(process.argv)===json(originalArgv(plan)),'HOST_ORIGINAL_PROCESS_MISMATCH');
  return process;
}
async function endpoint(plan,row){
  const before=await nativeProcess(plan,row);need(before,'HOST_ORIGINAL_PROCESS_ABSENT');
  const healthResponse=await fetch(plan.url+'/healthz',{redirect:'error',signal:AbortSignal.timeout(5000)});
  need(healthResponse.status===200,'HOST_HEALTH_UNAVAILABLE');
  const health=await healthResponse.json();
  need(health.mode==='NATIVE_X402_FACILITATOR'&&health.network===plan.network&&health.state==='ACCEPTING'&&
    health.ownership?.mode==='HOST_SIGNER_LEASES'&&health.ownership.state==='HELD'&&
    json([...health.ownership.accounts].sort())===json(plan.accounts),'HOST_ENDPOINT_SELECTION_MISMATCH');
  const custody=await signerFiles(plan,{baseline:plan.signerCustody,requireAll:true,
    owner:{pid:before.pid,ownerId:health.ownership.ownerId}});
  const readyResponse=await fetch(plan.url+'/readyz',{redirect:'error',signal:AbortSignal.timeout(15000)});
  const readiness=await readyResponse.json();
  const after=await processIdentity(before.pid);
  need(processSame(before,after),'HOST_PROCESS_CHANGED_DURING_OBSERVATION');
  return {observedAt:now(),process:before,health,readiness,ready:readyResponse.status===200&&readiness.ready===true,custody};
}
async function stopped(plan,op,row){
  const members=await groupProcesses(row,op.baseline.unit.ControlGroup);
  const original=op.stopProcess?await processIdentity(op.stopProcess.pid):null;
  return {stopped:['inactive','failed'].includes(row.ActiveState)&&row.MainPID===0&&row.ControlPID===0&&
    !processSame(original,op.stopProcess)&&members.length===0&&(!row.Job||row.Job==='0'),
    unit:row,remainingProcesses:members,originalProcessAlive:processSame(original,op.stopProcess)};
}
async function ensureMarker(op,p){
  const marker=await maybeJSON(p.marker),expected=hash(markerText(op));
  need(!marker||marker.sha256===expected,'HOST_OTHER_MAINTENANCE_OPERATION');
  await atomicFile(p.marker,markerText(op),{allowed:[marker?.sha256??null,expected]});
}
async function clearMarker(op,p){await removeOwned(p.marker,hash(markerText(op)));}
async function startEvidence(row){
  const fields=['InvocationID','ExecMainStartTimestampMonotonic','ExecMainExitTimestampMonotonic',
    'ActiveEnterTimestampMonotonic','InactiveEnterTimestampMonotonic','ExecStartPre',
    'ExecMainCode','ExecMainStatus','Result'];
  return {bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),
    fields:Object.fromEntries(fields.map(k=>[k,row[k]??null]))};
}
async function ctl(p,args,lease){return command(p.binaries.systemctl,args,{passFd:lease.fd});}
function requireAdmin(){need(process.platform==='linux'&&process.getuid?.()===0,'HOST_ADMINISTRATOR_REQUIRED');}
async function operation(root,id){
  need(typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(id),'HOST_OPERATION_ID_INVALID');
  const op=(await readJSON(opFile(root,id))).value;
  need(op.schema===SCHEMA&&op.request.hostDirectory===root&&op.request.operationId===id&&
    hash(json(op.request))===op.requestSha256,'HOST_OPERATION_CHANGED');return op;
}
async function current(root){return (await maybeJSON(stateFile(root)))?.value??null;}
async function reserve(op){
  const file=activeFile(op.request.hostDirectory),old=await maybeJSON(file);
  need(!old||old.value.operationId===op.request.operationId&&old.value.requestSha256===op.requestSha256,
    'HOST_OTHER_OPERATION_ACTIVE');
  await saveJSON(file,{schema:SCHEMA,operationId:op.request.operationId,requestSha256:op.requestSha256},[old?.sha256??null]);
}
async function release(op){
  const file=activeFile(op.request.hostDirectory),old=await maybeJSON(file);
  if(old){need(old.value.operationId===op.request.operationId&&old.value.requestSha256===op.requestSha256,'HOST_OTHER_OPERATION_ACTIVE');
    await removeOwned(file,old.sha256);}
}
export async function begin({bundle,operationId,expectedCurrentBundleId=null,reviewedBundleId,waitSeconds=10,kind='transition'}){
  requireAdmin();const candidate=await readBundle(bundle),p=candidate.plan;
  need(reviewedBundleId===candidate.bundleId,'HOST_REVIEWED_BUNDLE_CHANGED');
  need(['transition','drain'].includes(kind),'HOST_OPERATION_KIND_INVALID');
  need(typeof operationId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(operationId),'HOST_OPERATION_ID_INVALID');
  const lease=await hostLease(p.hostDirectory,p.binaries.flock);
  try{
    const existing=await maybeJSON(opFile(p.hostDirectory,operationId));
    if(existing){
      const request=existing.value.request;
      need(request.candidate===bundle&&request.reviewedBundleId===reviewedBundleId&&
        request.expectedCurrentBundleId===expectedCurrentBundleId&&request.kind===kind,'HOST_OPERATION_ID_REUSED');
      return await advance(await operation(p.hostDirectory,operationId),{waitSeconds,lease});
    }
    const occupied=await maybeJSON(activeFile(p.hostDirectory));
    need(!occupied,'HOST_OTHER_OPERATION_ACTIVE');
    const pointer=await current(p.hostDirectory);
    need((pointer?.bundleId??null)===expectedCurrentBundleId,'HOST_CURRENT_BUNDLE_CHANGED');
    const previous=pointer?.bundleDirectory?await readBundle(pointer.bundleDirectory):null;
    if(previous){sameHost(previous.plan,p);need(previous.bundleId===pointer.bundleId,'HOST_CURRENT_BUNDLE_CHANGED');}
    await preflight(p);
    const live=await installed(p,previous?[previous.plan.unitSha256]:[],{absent:!previous});
    need(!['activating','deactivating','reloading'].includes(live.row.ActiveState),'HOST_ORIGINAL_SERVICE_BUSY');
    const original=previous&&live.row.MainPID?await nativeProcess(previous.plan,live.row):null;
    const custodyAccounts=[...new Set([...p.accounts,...(previous?.plan.accounts??[])])].sort();
    const custody=await signerFiles({...p,accounts:custodyAccounts},{baseline:p.signerCustody});
    need(kind!=='drain'||previous?.bundleId===candidate.bundleId,'HOST_DRAIN_CURRENT_BUNDLE_REQUIRED');
    const request={kind,hostDirectory:p.hostDirectory,operationId,candidate:bundle,reviewedBundleId,
      previous:previous?.plan.directory??null,expectedCurrentBundleId};
    const op={schema:SCHEMA,request,requestSha256:hash(json(request)),phase:'PREPARED',direction:'forward',
      createdAt:now(),updatedAt:now(),history:[{phase:'PREPARED',at:now()}],
      baseline:{unit:live.row,unitSha256:live.sha256,current:pointer,custody,custodyAccounts},
      stopProcess:original,stopObserved:null,observation:null};
    await saveOperation(op);await reserve(op);
    return await advance(op,{waitSeconds,lease});
  }finally{await lease.close();}
}
async function commitCurrent(op,target,status){
  const root=op.request.hostDirectory,file=stateFile(root),old=await maybeJSON(file);
  need(!old||[op.request.expectedCurrentBundleId,op.request.reviewedBundleId,target?.bundleId??null].includes(old.value.bundleId),
    'HOST_CURRENT_POINTER_CHANGED');
  const value={schema:SCHEMA,unit:target?.plan.unit??op.baseline.unit.Id,bundleId:target?.bundleId??null,
    bundleDirectory:target?.plan.directory??null,status,operationId:op.request.operationId,updatedAt:now()};
  await saveJSON(file,value,[old?.sha256??null]);return value;
}
async function advance(op,{waitSeconds=10,lease}){
  need(Number.isInteger(waitSeconds)&&waitSeconds>=0&&waitSeconds<=45,'HOST_WAIT_RANGE_INVALID');
  const candidate=await readBundle(op.request.candidate),previous=op.request.previous?await readBundle(op.request.previous):null;
  const p=candidate.plan,rollback=op.direction==='rollback',target=rollback?previous:candidate;
  const custodyPlan={...p,accounts:op.baseline.custodyAccounts??p.accounts};
  const allowed=[p.unitSha256,...(previous?[previous.plan.unitSha256]:[])];
  if(previous)sameHost(previous.plan,p);
  if(finished.has(op.phase)){
    const active=await maybeJSON(activeFile(op.request.hostDirectory));
    if(active?.value.operationId===op.request.operationId){
      await commitCurrent(op,op.phase==='ROLLED_BACK'?previous:candidate,
        op.finalStatus??(op.phase==='DRAINED'?'INACTIVE':target?'ACTIVE':'UNINSTALLED'));
      await release(op);
    }
    return {status:op.phase,operationId:op.request.operationId,bundleId:target?.bundleId??null,observation:op.observation};
  }
  await reserve(op);
  await signerFiles(custodyPlan,{baseline:op.baseline.custody});
  // Recheck staged source, selected account and Node before any service mutation.
  if(op.phase==='PREPARED'){
    need(json(await current(p.hostDirectory))===json(op.baseline.current),'HOST_CURRENT_POINTER_CHANGED');
    await preflight(p);await phase(op,'DRAIN_PENDING');
  }
  const draining=new Set(['DRAIN_PENDING','STOP_REQUESTED','ROLLBACK_DRAIN_PENDING','ROLLBACK_STOP_REQUESTED']);
  if(draining.has(op.phase)){
    await ensureMarker(op,p);
    const live=await installed(p,allowed,{absent:!previous});
    if(!op.stopProcess&&live.row.MainPID){
      const selected=live.sha256===p.unitSha256?p:previous?.plan;
      need(selected,'HOST_ORIGINAL_UNIT_REQUIRED');op.stopProcess=await nativeProcess(selected,live.row);await saveOperation(op);
    }
    if(op.phase.endsWith('DRAIN_PENDING')){
      await phase(op,rollback?'ROLLBACK_STOP_REQUESTED':'STOP_REQUESTED');
      if(live.row.LoadState==='loaded')await ctl(p,['stop','--no-block','--',p.unit],lease);
    }else if(live.row.LoadState==='loaded'&&live.row.ActiveState!=='deactivating'&&
      !['inactive','failed'].includes(live.row.ActiveState)){
      // Lost-reply recovery repeats only the same owned stop request.
      await ctl(p,['stop','--no-block','--',p.unit],lease);
    }
    const until=Date.now()+waitSeconds*1000;let observation;
    do{
      const row=await serviceState(p);
      observation=await stopped(p,op,row);
      if(observation.stopped)break;
      if(Date.now()>=until)break;
      await new Promise(r=>setTimeout(r,250));
    }while(true);
    op.stopObserved=observation;await saveOperation(op);
    if(!observation.stopped)return {status:'WAITING_FOR_ORIGINAL_DRAIN',operationId:op.request.operationId,...observation};
    await signerFiles(custodyPlan,{baseline:op.baseline.custody});
    await phase(op,rollback?'ROLLBACK_STOPPED':'STOPPED');
    if(op.request.kind==='drain'&&!rollback){
      await clearMarker(op,p);op.finalStatus='INACTIVE';op.observation=observation;await phase(op,'DRAINED');
      await commitCurrent(op,candidate,'INACTIVE');await release(op);
      return {status:'DRAINED',operationId:op.request.operationId,observation};
    }
  }
  if(['STOPPED','ROLLBACK_STOPPED'].includes(op.phase)){
    if(target)await preflight(target.plan);
    await phase(op,rollback?'ROLLBACK_INSTALLING':'INSTALLING');
  }
  if(['INSTALLING','ROLLBACK_INSTALLING'].includes(op.phase)){
    const row=await serviceState(p);need((await stopped(p,op,row)).stopped,'HOST_SERVICE_NOT_STOPPED');
    if(target){
      const bytes=(await regular(join(target.plan.directory,target.plan.unit))).bytes;
      await atomicFile(p.unitFile,bytes,{allowed:[...allowed,...(!previous?[null]:[])],mode:0o644});
      await ctl(p,['daemon-reload'],lease);
      await installed(target.plan,[target.plan.unitSha256]);
      const enabled=rollback?op.baseline.unit.UnitFileState==='enabled':target.plan.enableAtBoot;
      await ctl(p,[enabled?'enable':'disable','--',p.unit],lease);
    }else{
      // Initial commissioning rollback removes only this exact generated service.
      const live=await serviceState(p);
      if(live.LoadState==='loaded')await ctl(p,['disable','--',p.unit],lease);
      await removeOwned(p.unitFile,p.unitSha256);await ctl(p,['daemon-reload'],lease);
      await clearMarker(op,p);op.observation=null;await phase(op,'ROLLED_BACK');
      await commitCurrent(op,null,'UNINSTALLED');await release(op);
      return {status:'ROLLED_BACK',operationId:op.request.operationId,bundleId:null};
    }
    if(rollback&&op.baseline.unit.ActiveState!=='active'){
      await clearMarker(op,p);op.finalStatus='INACTIVE';op.observation={unit:await serviceState(p)};
      await phase(op,'ROLLED_BACK');await commitCurrent(op,previous,'INACTIVE');await release(op);
      return {status:'ROLLED_BACK',operationId:op.request.operationId,observation:op.observation};
    }
    await phase(op,rollback?'ROLLBACK_START_PENDING':'START_PENDING');
  }
  if(['START_PENDING','ROLLBACK_START_PENDING'].includes(op.phase)){
    const prior=(await installed(target.plan,[target.plan.unitSha256])).row;
    op.startBasis=await startEvidence(prior);op.startSeen=false;
    await clearMarker(op,p);
    await phase(op,rollback?'ROLLBACK_START_REQUESTED':'START_REQUESTED');
    await ctl(p,['start','--no-block','--',p.unit],lease);
  }
  if(['START_REQUESTED','ROLLBACK_START_REQUESTED'].includes(op.phase)){
    const until=Date.now()+waitSeconds*1000;let row,observed=null,error=null;
    do{
      row=(await installed(target.plan,[target.plan.unitSha256])).row;
      if(row.ActiveState==='failed')return {status:'ORIGINAL_START_FAILED',operationId:op.request.operationId,
        unit:row,rollbackAvailable:!!previous,originalExitStatusPreserved:true};
      if(row.ActiveState==='inactive'){
        // A crash before the original start command is safe to resume, but do not
        // replay a process that has already executed and exited successfully.
        need(op.startBasis,'HOST_ORIGINAL_START_BASIS_MISSING');
        const evidence=await startEvidence(row);
        if(op.startSeen||json(evidence)!==json(op.startBasis))return {
          status:evidence.bootId!==op.startBasis.bootId?'ORIGINAL_HOST_RESTARTED':'ORIGINAL_PROCESS_EXITED',
          operationId:op.request.operationId,unit:row,startBasis:op.startBasis,observedStart:evidence};
        await ctl(p,['start','--no-block','--',p.unit],lease);
      }
      if(!op.startSeen&&(row.MainPID||row.ControlPID)){op.startSeen=true;await saveOperation(op);}
      if(row.ActiveState==='active'&&row.MainPID){
        try{observed=await endpoint(target.plan,row);if(observed.ready)break;}
        catch(e){error=e.code||'HOST_ENDPOINT_NOT_READY';}
      }
      if(Date.now()>=until)break;
      await new Promise(r=>setTimeout(r,250));
    }while(true);
    if(!observed?.ready)return {status:'WAITING_FOR_ORIGINAL_READINESS',operationId:op.request.operationId,
      unit:row,observation:observed,error};
    op.observation=observed;
    await signerFiles(custodyPlan,{baseline:op.baseline.custody});
    await phase(op,rollback?'ROLLED_BACK':'COMPLETED');
    await commitCurrent(op,target,'ACTIVE');await release(op);
    return {status:op.phase,operationId:op.request.operationId,bundleId:target.bundleId,observation:observed};
  }
  need(false,'HOST_OPERATION_PHASE_UNKNOWN');
}
export async function resume({hostDirectory,operationId,waitSeconds=10,rollback=false}){
  requireAdmin();absolute(hostDirectory);const op=await operation(hostDirectory,operationId),bundle=await readBundle(op.request.candidate);
  const lease=await hostLease(hostDirectory,bundle.plan.binaries.flock);
  try{
    if(rollback&&op.direction!=='rollback'){
      need(op.phase!=='ROLLED_BACK','HOST_ALREADY_ROLLED_BACK');
      if(finished.has(op.phase)){const pointer=await current(hostDirectory);need(pointer?.operationId===operationId,'HOST_ROLLBACK_NOT_CURRENT');}
      op.direction='rollback';op.stopProcess=null;op.stopObserved=null;op.startSeen=false;op.observation=null;
      await reserve(op);await phase(op,'ROLLBACK_DRAIN_PENDING');
    }
    return await advance(op,{waitSeconds,lease});
  }finally{await lease.close();}
}
export async function status({hostDirectory,operationId=null}){
  absolute(hostDirectory);const pointer=await current(hostDirectory),active=await maybeJSON(activeFile(hostDirectory));
  const id=operationId??active?.value.operationId??pointer?.operationId;
  const op=id?await operation(hostDirectory,id):null;
  const path=pointer?.bundleDirectory??op?.request.candidate;
  if(!path)return {schema:SCHEMA,current:pointer,operation:op};
  const bundle=await readBundle(path),p=bundle.plan,row=await serviceState(p);
  let observation=null,error=null;try{if(row.ActiveState==='active')observation=await endpoint(p,row);}catch(e){error=e.code||'HOST_OBSERVATION_UNAVAILABLE';}
  return {schema:SCHEMA,current:pointer,activeOperation:active?.value??null,
    bundle:publicBundle(bundle),unit:row,remainingProcesses:await groupProcesses(row),
    observation,error,operation:op?{operationId:id,phase:op.phase,direction:op.direction,
      createdAt:op.createdAt,updatedAt:op.updatedAt,history:op.history,stopObserved:op.stopObserved}:null};
}
export async function exportHandover({bundle,hostDirectory=null}){
  const original=await readBundle(bundle),p=original.plan;
  if(hostDirectory)need(hostDirectory===p.hostDirectory,'HOST_HANDOVER_SELECTION_MISMATCH');
  const state=hostDirectory?await status({hostDirectory}):null;
  const source=(await readJSON(p.configFile)).value;
  // Keep only the original review's public RPC origin; never include private path/query credentials.
  const template={...source,rpcUrl:p.review.rpcOrigin,operations:{...source.operations,ownershipDirectory:'REPLACE_WITH_NEW_HOST_SHARED_DIRECTORY',requireReady:true}};
  const envelope={schema:'stellar-forge.native-facilitator-host-handover.v1',createdAt:now(),
    bundle:publicBundle(original),observed:state,secretValuesIncluded:false,
    originalConfigRequired:{sha256:p.configSha256,environmentNames:p.environmentNames},
    receiving:{sourceArchiveSha256:p.runtime.archiveSha256,profileId:p.runtime.profileId,sourceCommit:p.runtime.sourceCommit,
      originalAccountAddresses:p.accounts,network:p.network,
      sharedSignerDirectoryRule:'All cooperating same-host signers use one real private directory and stable OS account. Never transport or replace live lock inodes.'}};
  const files={
    'HOST-HANDOVER.json':Buffer.from(json(envelope)),
    'facilitator.template.json':Buffer.from(json(template)),
    'signer.env.example':Buffer.from(p.environmentNames.map(n=>n+'=REPLACE_WITH_ORIGINAL_SIGNER_SEED').join('\n')+'\n'),
    'installed-unit-reference.service':(await regular(join(p.directory,p.unit))).bytes,
    'RECEIVING.md':Buffer.from('# Receive the original native facilitator host\n\n'
      +'Use the maintained runtime-install workflow to verify/install the exact original source archive and native profile under the selected service account. '
      +'Supply the original private facilitator configuration and signer-only environment file locally; their values are absent here. '
      +'Run host stage, compare the returned source/config/account/endpoint identity, then host apply with its exact reviewed bundle ID. '
      +'Use the new host directory for operations; the old host must finish its original graceful drain before the same signing accounts are commissioned elsewhere. '
      +'Same-host transitions keep the original ownership directory and all existing lock inodes. '
      +'The original native SDK determines signer/public-address agreement and actual readiness. '
      +'The generated template retains only the public RPC origin and requires the original private RPC selection before use. '
      +'This package contains no payment replay, settlement re-submission, key values or live-lock copy.\n')
  };
  files['MANIFEST.json']=Buffer.from(json({schema:'stellar-forge.native-facilitator-host-files.v1',
    files:Object.entries(files).map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)}))}));
  return files;
}

export async function drain({hostDirectory,operationId,expectedCurrentBundleId,waitSeconds=10}){
  const p=await current(absolute(hostDirectory));need(p?.bundleDirectory&&p.bundleId===expectedCurrentBundleId,'HOST_CURRENT_BUNDLE_CHANGED');
  return begin({bundle:p.bundleDirectory,operationId,expectedCurrentBundleId,reviewedBundleId:p.bundleId,waitSeconds,kind:'drain'});
}
