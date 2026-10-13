#!/usr/bin/env node
// MIT. Continue a completed Object Support case through the maintained recovery desk.
import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';

const APP_COMMIT='33600e3f5654a5199991562dedd166eee36d9e87';
const INPUT_SHA256='e5ac88b0132e5e457ca9a4ceae888befc7334391cf575bde2a3a2320373a08f1';
const ORIGINAL_CUSTOMER_GIT='3cff80371b90d14cff31d8b5dcdfca1ef65e08dc';
const sha=body=>crypto.createHash('sha256').update(body).digest('hex');
const git=body=>crypto.createHash('sha1').update(Buffer.from('blob '+body.length+'\0')).update(body).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const optional=async file=>{try{return await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function directory(file){
  assert.equal(path.resolve(file),file);await fs.mkdir(file,{recursive:true,mode:0o700});
  const st=await fs.lstat(file);assert(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0);
  assert.equal(await fs.realpath(file),file);return file;
}
async function write(file,value){
  const body=Buffer.isBuffer(value)?value:typeof value==='string'?Buffer.from(value):jsonBytes(value);
  await directory(path.dirname(file));
  const previous=await optional(file);if(previous!==null){assert(previous.equals(body),'Retained input differs: '+file);return;}
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  let handle=await fs.open(temporary,'wx',0o600);
  try{
    await handle.writeFile(body);await handle.sync();await handle.close();handle=null;
    try{await fs.link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;assert((await fs.readFile(file)).equals(body));}
    const folder=await fs.open(path.dirname(file),'r');try{await folder.sync();}finally{await folder.close();}
  }finally{if(handle)await handle.close();await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function retained(file,create){
  const previous=await optional(file);if(previous!==null)return JSON.parse(previous.toString('utf8'));
  const value=await create();await write(file,value);return value;
}
async function sourceReview(source,inputFile){
  let raw=await fs.readFile(inputFile);if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw,{maxOutputLength:8*1024*1024});
  assert.equal(sha(raw),INPUT_SHA256);const input=JSON.parse(raw.toString('utf8'));
  assert.equal(input.schema,'stellar-forge.incident-recovery-source-input.v1');
  assert.equal(input.source.commit,APP_COMMIT);
  const entries=new Map(input.metadata.tree.tree.map(row=>[row.path,row]));
  const selected=[...input.metadata.requiredPaths,...input.additionalPaths];assert.equal(selected.length,797);
  let total=0;
  for(const name of selected){
    const row=entries.get(name),file=path.join(source,name);
    assert(row&&row.type==='blob'&&['100644','100755'].includes(row.mode));
    assert.equal(await fs.realpath(file),file);
    const handle=await fs.open(file,'r');
    try{
      const before=await handle.stat();assert(before.isFile()&&before.size===row.size);
      const body=await handle.readFile(),after=await handle.stat();
      assert.equal(git(body),row.sha);assert.equal(body.length,row.size);
      assert(before.dev===after.dev&&before.ino===after.ino&&before.mtimeMs===after.mtimeMs&&before.size===after.size);
      assert.equal(Boolean(before.mode&0o100),row.mode==='100755');total+=body.length;
    }finally{await handle.close();}
  }
  assert.equal(total,11343307);
  return {commit:APP_COMMIT,tree:input.source.tree,files:selected.length,bytes:total,sourceInputSha256:INPUT_SHA256};
}
async function inventory(root){
  const output=[];
  async function walk(folder){
    for(const name of (await fs.readdir(folder)).sort()){
      const file=path.join(folder,name),before=await fs.lstat(file);
      assert(!before.isSymbolicLink(),'A retained original session cannot contain a symlink.');
      if(before.isDirectory()){await walk(file);continue;}
      assert(before.isFile());const body=await fs.readFile(file),after=await fs.lstat(file);
      assert(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs);
      output.push({path:path.relative(root,file),bytes:body.length,sha256:sha(body),mode:before.mode&0o777,mtimeMs:before.mtimeMs});
    }
  }
  await walk(root);return output;
}
const attachmentRows=capture=>(capture?.files??[]).map(({name,bytes,sha256})=>({name,bytes,sha256})).sort((a,b)=>a.name.localeCompare(b.name));

async function main(){
  assert.equal(process.argv.length,3,'Supply one private receiving configuration JSON file.');
  const cfg=await readJson(process.argv[2]);
  assert.equal(cfg.schema,'stellar-forge.incident-recovery-receiving.v1');
  assert.equal(cfg.sourceCommit,APP_COMMIT);
  for(const key of ['sourceDirectory','directory','baselineDirectory','baselineDelivery','originalCustomer','sourceInput','python'])
    assert(typeof cfg[key]==='string'&&path.resolve(cfg[key])===cfg[key],key+' must be an absolute path.');
  const source=await fs.realpath(cfg.sourceDirectory);assert.equal(source,cfg.sourceDirectory);
  const root=await directory(cfg.directory);
  assert(root!==cfg.baselineDirectory&&!root.startsWith(cfg.baselineDirectory+path.sep));
  await write(path.join(root,'configuration.private.json'),cfg);
  const completed=await optional(path.join(root,'result.json'));
  if(completed!==null){const result=JSON.parse(completed.toString('utf8'));assert.equal(result.state,'COMPLETE');
    process.stdout.write(JSON.stringify({phase:'INCIDENT_RECOVERY_RECEIVING_COMPLETE',reused:true,result:path.join(root,'result.json')})+'\n');return;}
  const baseline=await readJson(path.join(cfg.baselineDirectory,'result.json'));
  const delivery=await readJson(cfg.baselineDelivery);
  assert.equal(baseline.schema,'stellar-forge.object-incident-support-customer-result.v1');
  assert.equal(baseline.state,'COMPLETE');assert.equal(delivery.state,'COMPLETE');
  assert.equal(baseline.sourceCommit,'f7200d52fdc5722619d0cf708041ee46db447e7f');
  assert.equal(baseline.archivedSessionId??baseline.originalSessionId,'f269be5c-ca82-4a78-b603-3f526abf90a9');
  assert.match(baseline.originalSessionId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  if(baseline.originalSessionId!=='f269be5c-ca82-4a78-b603-3f526abf90a9'){
    assert.equal(baseline.sourceDataReceiving?.schema,'stellar-forge.object-source-receiving-lineage.v1');
    assert.equal(baseline.sourceDataReceiving.state,'COMPLETE');
    assert.equal(baseline.sourceDataReceiving.receivedSessionId,baseline.originalSessionId);
    assert.equal(baseline.sourceDataReceiving.sourceArchive.sha256,'427e862f51282bfb0c8dc71b04a13d75f1f9f305a49bc5405c2c37a11146d8b3');
  }
  assert.equal(baseline.objectSha256,'80bc251619f969166dd39f60290b0450663fbf54ab2dc037a2635dbfb921c19a');
  assert.equal(baseline.incidentFinalStatus,'RETIRED');assert.equal(baseline.incidentReason,'CONFIGURATION_CHANGED');
  assert.equal(baseline.originalSessionUnchanged,true);assert.equal(baseline.notificationConfigured,false);
  assert.equal(baseline.independentReceiving.state,'COMPLETE');
  assert.equal(git(await fs.readFile(cfg.originalCustomer)),ORIGINAL_CUSTOMER_GIT);
  const reviewedSource=await sourceReview(source,cfg.sourceInput);
  await write(path.join(root,'source-review.json'),reviewedSource);
  const previousSession=await readJson(path.join(cfg.baselineDirectory,'original-session-after.json'));
  const profiles=await readJson(path.join(cfg.baselineDirectory,'incident-sources.private.json'));
  assert.equal(profiles.schema,'stellar-forge.support-incident-sources.v1');assert.equal(profiles.sources.length,1);
  const originalSource=profiles.sources[0];assert.equal(originalSource.id,'operations');
  const session=originalSource.objectSessions[0].directory;
  assert.deepEqual(await inventory(session),previousSession,'Original Object bytes changed after the completed baseline.');
  const recoveryHome=await directory(path.join(root,'recovery'));
  const profileFile=path.join(root,'incident-sources.private.json');
  await write(profileFile,{...profiles,sources:[{...originalSource,recoveryDirectory:recoveryHome}]});
  const {readSupportLaunch}=await import(pathToFileURL(path.join(source,'stellar/scf-starforge-20261009/sf74-merchant-support-console/managed-launch.mjs')).href);
  const hosts=new Set();
  const event=async value=>{
    const handle=await fs.open(path.join(root,'events.private.jsonl'),'a',0o600);
    try{await handle.writeFile(JSON.stringify({...value,at:new Date().toISOString()})+'\n');await handle.sync();}
    finally{await handle.close();}
  };
  async function closeHost(host){
    if(!host||host.closed)return;
    if(!host.exit&&host.child.stdin.writable)host.child.stdin.end(JSON.stringify({action:'close'})+'\n');
    let timer;
    const deadline=milliseconds=>new Promise(resolve=>{timer=setTimeout(()=>resolve(null),milliseconds);});
    let result=await Promise.race([host.exited,deadline(30000)]).finally(()=>clearTimeout(timer));
    if(result===null){host.child.kill('SIGTERM');result=await Promise.race([host.exited,deadline(10000)]).finally(()=>clearTimeout(timer));}
    if(result===null){host.child.kill('SIGKILL');result=await host.exited;}
    host.lines.close();
    await Promise.all([new Promise(resolve=>host.stdout.end(resolve)),new Promise(resolve=>host.stderr.end(resolve))]);
    host.closed=true;hosts.delete(host);await event({phase:'HOST_CLOSED',label:host.label,result});
    assert.equal(result.code,0,'The maintained Support host did not close cleanly.');assert.equal(host.errors.length,0);
  }
  async function startHost(label,casesDir,incidentSources){
    const selected={casesDir,incidentSources},selection=path.join(root,'hosts',label+'.json');
    await write(selection,selected);
    const child=spawn(process.execPath,[cfg.originalCustomer,'host',source,selection],
      {stdio:['pipe','pipe','pipe'],env:{...process.env,SCF_PYTHON:cfg.python}});
    const stdout=createWriteStream(path.join(root,'hosts',label+'.stdout'),{flags:'a',mode:0o600});
    const stderr=createWriteStream(path.join(root,'hosts',label+'.stderr'),{flags:'a',mode:0o600});
    const host={label,child,stdout,stderr,errors:[],closed:false,exit:null};hosts.add(host);
    host.exited=new Promise(resolve=>{
      child.once('exit',(code,signal)=>{host.exit={code,signal};resolve(host.exit);});
      child.once('error',error=>{host.exit={code:null,signal:null,error:String(error)};resolve(host.exit);});
    });
    child.stdin.on('error',error=>{host.inputError=String(error);});
    for(const [stream,output] of [[child.stdout,stdout],[child.stderr,stderr]]){
      output.on('error',error=>{host.errors.push(String(error));stream.unpipe(output);stream.resume();});
      stream.pipe(output);
    }
    host.lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
    let timer;
    const ready=await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('The maintained Support startup did not complete.')),60000);
      host.lines.on('line',line=>{try{const value=JSON.parse(line);if(value.phase==='ORIGINAL_SUPPORT_READY')resolve(value);}catch{}});
      void host.exited.then(result=>reject(new Error('Support exited before ready: '+JSON.stringify(result))));
    }).finally(()=>clearTimeout(timer));
    assert.equal(host.errors.length,0);
    const binding=await readSupportLaunch(ready.launch,{...selected,selectionSha256:ready.launch.selectionSha256,port:0});
    assert.equal(ready.launch.pid,child.pid);
    host.origin=new URL(binding.url).origin;host.launch=ready.launch;
    await event({phase:'HOST_READY',label,launch:ready.launch});return host;
  }
  async function http(host,route,input,accepted=[200]){
    assert.equal(host.errors.length,0);
    const response=await fetch(host.origin+route,{method:input===undefined?'GET':'POST',
      headers:{Origin:host.origin,...(input===undefined?{}:{'Content-Type':'application/json'})},
      ...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(60000)});
    const chunks=[];let bytes=0;
    for await(const chunk of response.body){bytes+=chunk.length;assert(bytes<=16*1024*1024);chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!accepted.includes(response.status)){
      const error=new Error(route+' returned '+response.status+': '+JSON.stringify(body));
      error.response={status:response.status,body};throw error;
    }
    return {status:response.status,body};
  }
  const get=async(host,route,accepted)=>http(host,route,undefined,accepted);
  async function mutate(host,label,route,makeInput,{ephemeral=false,recoveryWorkspaceId=null}={}){
    let requestFile=path.join(root,'requests',label+'.json');
    let request=ephemeral?{route,input:await makeInput()}:
      await retained(requestFile,async()=>({route,input:await makeInput()}));
    assert.equal(request.route,route);
    if(recoveryWorkspaceId!==null){
      assert.match(route,/^\/api\/incidents\/[a-z0-9_-]+\/recovery\/[a-z-]+$/);
      assert.match(recoveryWorkspaceId,/^[a-f0-9]{64}$/);
      assert.deepEqual(Object.keys(request.input).sort(),['input','workspaceId']);
      if(request.input.workspaceId!==recoveryWorkspaceId){
        // Native access binds current directory inodes. Keep the original domain input.
        request={route,input:{...request.input,workspaceId:recoveryWorkspaceId}};
        if(!ephemeral){
          requestFile=path.join(root,'requests',label+'-access-'+sha(jsonBytes(request)).slice(0,20)+'.json');
          await write(requestFile,request);
        }
      }
    }
    const invocation=crypto.randomUUID();
    await event({phase:'HTTP_DISPATCHING',label,invocation,host:host.label,requestSha256:sha(jsonBytes(request)),
      ...(ephemeral?{request}:{requestFile})});
    try{
      const response=await http(host,route,request.input);
      await write(path.join(root,'responses',label+'-'+invocation+'.json'),response);
      await event({phase:'HTTP_RESPONSE',label,invocation,status:response.status});return response.body;
    }catch(error){
      if(error.response){
        await write(path.join(root,'responses',label+'-'+invocation+'.json'),error.response);
        await event({phase:'HTTP_ERROR_RESPONSE',label,invocation,status:error.response.status,error:String(error)});
      }else await event({phase:'HTTP_OUTCOME_UNCERTAIN',label,invocation,error:String(error)});
      throw error;
    }
  }
  async function saveCase(host,label,makeInput){
    const request=await retained(path.join(root,'requests',label+'.json'),async()=>({route:'/api/cases',input:await makeInput()}));
    const existing=await get(host,'/api/cases/'+request.input.id,[200,404]);
    if(existing.status===200&&existing.body.workspaceText===request.input.workspaceText&&
      existing.body.supportText===request.input.supportText&&JSON.stringify(existing.body.metadata)===JSON.stringify(request.input.metadata)){
      await event({phase:'ORIGINAL_CASE_SAVE_RECONCILED',label,id:existing.body.id,revision:existing.body.revision});
      return existing.body;
    }
    assert.equal(existing.status===404?null:existing.body.revision,request.input.expectedRevision,
      'The original case changed; retain the prepared request and current case for review.');
    await mutate(host,label,'/api/cases',()=>request.input);
    const saved=(await get(host,'/api/cases/'+request.input.id)).body;
    assert.equal(saved.workspaceText,request.input.workspaceText);assert.equal(saved.supportText,request.input.supportText);
    assert.deepEqual(saved.metadata,request.input.metadata);return saved;
  }
  async function exportCase(host,label,item){
    const file=path.join(root,'deliverables',label+'.support-handoff.json'),previous=await optional(file);
    let result;
    if(previous!==null){
      const original=await import(pathToFileURL(path.join(source,'stellar/scf-starforge-20261009/sf74-merchant-support-console/runtime-support.mjs')).href);
      const imported=await original.importRuntimeHandoff(previous.toString('utf8'));
      assert.equal(imported.workspaceText,item.workspaceText);assert.equal(imported.supportText,item.supportText);assert.deepEqual(imported.metadata,item.metadata);
      result=await original.exportRuntimeHandoff({...item,generatedAt:JSON.parse(previous.toString('utf8')).generatedAt});
      assert.equal(result.handoff,previous.toString('utf8'));
    }else result=await mutate(host,label,'/api/runtime/export',()=>({workspaceText:item.workspaceText,supportText:item.supportText,metadata:item.metadata}));
    await write(file,result.handoff);await write(path.join(root,'deliverables',label+'.html'),result.html);
    await write(path.join(root,'deliverables',label+'.report.json'),result.report);
    return {...result,file,sha256:sha(result.handoff)};
  }
  let operator;
  try{
    operator=await startHost('recovery-operator',path.join(cfg.baselineDirectory,'cases'),profileFile);
    const assets=[];
    for(const route of ['/incident-recovery-desk.mjs','/incident-desk.css']){
      const response=await fetch(operator.origin+route,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
      const body=Buffer.from(await response.arrayBuffer());
      const name=route.slice(1),file=path.join(source,'stellar/scf-starforge-20261009/sf74-merchant-support-console',name);
      assert(body.equals(await fs.readFile(file)));assets.push({route,bytes:body.length,sha256:sha(body)});
    }
    await write(path.join(root,'served-recovery-assets.json'),assets);
    const before=(await get(operator,'/api/incidents/operations/'+baseline.incidentId)).body;
    assert.equal(before.incident.status,'RETIRED');assert.equal(before.incident.retiredReason,'CONFIGURATION_CHANGED');
    assert.equal(before.worker.ownership,'none');assert.equal(before.worker.canStop,false);assert.equal(before.notifications.length,0);
    assert.equal(Object.keys(before.captureProblems).length,0);
    const view=(await get(operator,'/api/incidents/operations/recovery')).body;assert.equal(view.enabled,true);
    const operationIds={snapshot:'object-support-snapshot-20261012-33e6',receive:'object-support-receive-20261012-33e6',reconcile:'object-support-reconcile-20261012-33e6'};
    const originalAction=(action,label,input,options)=>mutate(operator,label,'/api/incidents/operations/recovery/'+action,
      ()=>({workspaceId:view.workspaceId,input}),{recoveryWorkspaceId:view.workspaceId,...options});
    const savedSnapshot=view.items.find(item=>item.kind==='snapshot'&&item.name===operationIds.snapshot&&item.status==='SAVED');
    const snapshot=savedSnapshot??await originalAction('snapshot','snapshot',{operationId:operationIds.snapshot,expectedRevision:view.sourceRevision});
    if(savedSnapshot)await event({phase:'ORIGINAL_SNAPSHOT_REOPENED',operationId:operationIds.snapshot,
      directory:savedSnapshot.directory,manifestSha256:savedSnapshot.manifestSha256});
    const inspected=await originalAction('inspect-snapshot','inspect-snapshot',
      {snapshotName:operationIds.snapshot,expectedManifestSha256:snapshot.manifestSha256});
    assert.equal(inspected.manifestSha256,snapshot.manifestSha256);assert(inspected.files>1);
    assert.equal(inspected.source.notifications,0);
    const snapshotState=await readJson(path.join(inspected.directory,'state.json'));
    assert.equal(snapshotState.config.notification,null);assert.equal(snapshotState.notifications.length,0);
    await write(path.join(root,'snapshot-inspection.json'),inspected);
    const savedReceive=view.items.find(item=>item.kind==='received'&&item.name===operationIds.receive&&item.status==='RECEIVED');
    if(savedReceive){
      assert.equal(savedReceive.manifestSha256,inspected.manifestSha256);
      await event({phase:'ORIGINAL_RECEIVED_STORE_REOPENED',operationId:operationIds.receive,
        directory:savedReceive.directory,manifestSha256:savedReceive.manifestSha256});
    }else await originalAction('receive','receive',{operationId:operationIds.receive,snapshotName:operationIds.snapshot,
      expectedManifestSha256:inspected.manifestSha256});
    const opened=await originalAction('open','open',{receiveName:operationIds.receive,expectedManifestSha256:inspected.manifestSha256},{ephemeral:true});
    assert.equal(opened.watcherStarted,false);assert.equal(opened.recovery.notificationCounts.total,0);
    const recoveredId=opened.source.id;
    const detail=(await get(operator,'/api/incidents/'+recoveredId+'/'+baseline.incidentId)).body;
    assert.equal(detail.incident.id,before.incident.id);assert.equal(detail.incident.kind,before.incident.kind);
    assert.equal(detail.incident.status,before.incident.status);
    assert.deepEqual(detail.incident.beforeCapture,before.incident.beforeCapture);
    assert.deepEqual(detail.incident.afterCapture,before.incident.afterCapture);
    assert.equal(Object.keys(detail.captureProblems).length,0);assert.equal(detail.worker.ownership,'none');assert.equal(detail.worker.canStop,false);
    const originalCase=(await get(operator,'/api/cases/'+baseline.case.caseId)).body;
    assert.equal(sha(originalCase.workspaceText),baseline.case.workspaceSha256);
    assert.equal(sha(originalCase.supportText),baseline.case.supportSha256);
    const caseRoute='/api/incidents/'+recoveredId+'/'+baseline.incidentId+'/case';
    const caseInput={expectedRevision:detail.incident.revision,workspaceText:originalCase.workspaceText,routeId:before.incident.merchantId};
    assert(Number.isSafeInteger(caseInput.expectedRevision)&&caseInput.expectedRevision>=1);
    // A fresh reviewed preparation preserves an earlier rejected request unchanged.
    const caseLabel='recovered-incident-case-'+sha(jsonBytes({route:caseRoute,input:caseInput})).slice(0,20);
    const caseCapture=await retained(path.join(root,'recovered-incident-case.json'),()=>mutate(operator,caseLabel,caseRoute,()=>caseInput));
    await write(path.join(root,'deliverables','recovered-incident.support-handoff.json'),caseCapture.handoff);
    await write(path.join(root,'deliverables','recovered-incident.html'),caseCapture.html);
    await write(path.join(root,'deliverables','recovered-incident.report.json'),caseCapture.report);
    const recoverView=(await get(operator,'/api/incidents/'+recoveredId+'/recovery')).body;
    const recovered=recoverView.recovery;
    assert.equal(recovered.originalAttemptsWaiting.length,0);assert.equal(recovered.notificationCounts.total,0);
    const originalNow=(await get(operator,'/api/incidents/operations/'+baseline.incidentId)).body;
    assert.equal(originalNow.worker.ownership,'none');assert.equal(originalNow.worker.canStop,false);
    const reconciliation=await mutate(operator,'reconcile','/api/incidents/'+recoveredId+'/recovery/reconcile',()=>({
      workspaceId:recoverView.workspaceId,input:{operationId:operationIds.reconcile,expectedRecoveryId:recovered.id,
        expectedManifestSha256:recovered.manifestSha256,expectedQueueSha256:recovered.queueSha256,expectedConfigHash:recovered.configHash,
        originalWriterStopped:true,by:'Commons SCF receiving engineer',
        notes:'The completed original customer closed its writer. Reopened original and received sources have no running worker or notification entries.'}}),
      {recoveryWorkspaceId:recoverView.workspaceId});
    const reconciled=(await get(operator,'/api/incidents/'+recoveredId+'/recovery')).body.recovery;
    assert.equal(reconciled.deliveryPaused,false);assert.equal(reconciled.notificationCounts.delivered,0);
    const continued=await saveCase(operator,'continue-original-case',()=>({
      id:baseline.case.caseId,expectedRevision:originalCase.revision,workspaceText:originalCase.workspaceText,supportText:originalCase.supportText,
      metadata:{...originalCase.metadata,notes:originalCase.metadata.notes+'\nThe complete incident store was snapshotted, inspected and received using '+APP_COMMIT+
        '. Snapshot '+operationIds.snapshot+' ('+inspected.manifestSha256+') was opened and reconciled under '+operationIds.receive+
        '. The original RETIRED / CONFIGURATION_CHANGED incident and both original Object captures remain available; no notification was sent.'}}));
    const exported=await exportCase(operator,'continued-original-case',continued);
    assert.deepEqual(attachmentRows(exported.report.before),baseline.case.beforeFiles);
    assert.deepEqual(attachmentRows(exported.report.after),baseline.case.afterFiles);
    assert.equal(exported.report.comparison.state,'OBJECT_SELECTION_CHANGED');
    const operatorInstanceId=operator.launch.instanceId;await closeHost(operator);operator=null;
    const emptyProfile=path.join(root,'receiving-empty-incident-sources.private.json');
    await write(emptyProfile,{schema:'stellar-forge.support-incident-sources.v1',sources:[]});
    const receiver=await startHost('independent-receiver',path.join(root,'received-cases'),emptyProfile);
    assert.notEqual(receiver.launch.instanceId,operatorInstanceId);
    assert.equal((await get(receiver,'/api/incidents/profiles')).body.sources.length,0);
    const imported=await mutate(receiver,'import-complete-case','/api/runtime/import',()=>({handoffText:exported.handoff}));
    assert.equal(imported.workspaceText,continued.workspaceText);assert.equal(imported.supportText,continued.supportText);
    const received=await saveCase(receiver,'receive-original-case',()=>({id:baseline.case.caseId,expectedRevision:null,
      workspaceText:imported.workspaceText,supportText:imported.supportText,metadata:imported.metadata}));
    const reviewed=await mutate(receiver,'review-received-case','/api/runtime/review',
      ()=>({supportText:received.supportText,inputs:JSON.parse(received.workspaceText).inputs}));
    assert.deepEqual(attachmentRows(reviewed.report.before),baseline.case.beforeFiles);
    assert.deepEqual(attachmentRows(reviewed.report.after),baseline.case.afterFiles);
    const finalExport=await exportCase(receiver,'independently-reopened',received);
    const receivingInstanceId=receiver.launch.instanceId;await closeHost(receiver);
    const after=await inventory(session);assert.deepEqual(after,previousSession);
    await write(path.join(root,'original-session-after.json'),after);
    const result={schema:'stellar-forge.incident-recovery-receiving-result.v1',state:'COMPLETE',source:reviewedSource,
      originalSessionId:baseline.originalSessionId,archivedSessionId:baseline.archivedSessionId??baseline.originalSessionId,
      sourceDataReceiving:baseline.sourceDataReceiving??null,objectSha256:baseline.objectSha256,originalSessionUnchanged:true,
      originalIncidentId:baseline.incidentId,originalIncidentStatus:detail.incident.status,
      snapshot:{operationId:operationIds.snapshot,directory:snapshot.directory,manifestSha256:inspected.manifestSha256,files:inspected.files,totalBytes:inspected.totalBytes},
      received:{operationId:operationIds.receive,directory:opened.directory,sourceId:recoveredId,reconciliation,notificationDeliveryPaused:reconciled.deliveryPaused},
      case:{id:baseline.case.caseId,baselineRevision:baseline.case.caseRevision,continuedRevision:continued.revision,receivedRevision:received.revision,
        workspaceSha256:sha(received.workspaceText),supportSha256:sha(received.supportText),operatorInstanceId,receivingInstanceId,
        fullHandoffFile:finalExport.file,fullHandoffSha256:finalExport.sha256,beforeFiles:attachmentRows(finalExport.report.before),afterFiles:attachmentRows(finalExport.report.after)},
      notificationConfigured:false,notificationsSent:0,buyerPurchased:false,buyerFinalized:false,completedAt:new Date().toISOString()};
    await write(path.join(root,'result.json'),result);
    process.stdout.write(JSON.stringify({phase:'INCIDENT_RECOVERY_RECEIVING_COMPLETE',result:path.join(root,'result.json'),caseId:result.case.id})+'\n');
  }finally{const settled=await Promise.allSettled([...hosts].map(closeHost));const errors=settled.filter(x=>x.status==='rejected').map(x=>x.reason);
    if(errors.length)throw new AggregateError(errors,'Support host cleanup failed.');}
}
main().catch(error=>{console.error(error?.stack??String(error));process.exitCode=1;});
