// MIT. One original workspace writer; FROST workers own their actual kernel lease.
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {open,lstat,readdir,readFile} from 'node:fs/promises';
import {join,dirname,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {privateDirectory,readOwned,atomicJSON,acquireWorkspaceLease} from '../../stellar-expert/store.mjs';
import {sha,json,identity,objectValue,fail,hash,clone,saveValue} from './common.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),TERMINAL=new Set(['COMPLETE','FAILED','CANCELLED','AWAITING_RECONCILIATION','DEFERRED']);
const nativeBytes=value=>Buffer.from(JSON.stringify(value)+'\n');
const safeRelative=value=>typeof value==='string'&&value&&!value.startsWith('/')&&!value.includes('\\')&&!value.split('/').some(x=>!x||x==='.'||x==='..');
export function createNativeRuntime({store,environment=process.env,runtime={},onSnapshot=async()=>{}}){
 const root=join(store.root,'commissioning-native'),running=new Map(),launches=new Map(),reading=new Map(),observations=new Map(),fileCache=new Map();
 let closing=false,closePromise=null;
 function selection(){
  const python=runtime.python??environment.SENSORTHINGS_FROST_PYTHON,ready=runtime.ready??environment.SENSORTHINGS_FROST_RUNTIME_READY;
  if(typeof python!=='string'||!python||typeof ready!=='string'||!ready)return null;
  if(!python.startsWith('/')||!ready.startsWith('/'))throw fail('RUNTIME','Select absolute paths for the original FROST environment and runtime receipt.');
  // Preserve the venv executable spelling. Resolving this symlink would silently
  // replace the selected environment with its base interpreter.
  return {python:resolve(python),ready:resolve(ready)};
 }
 const directory=id=>join(root,hash(id,'native job'));
 async function prepare(job){
  await privateDirectory(root,{create:true});const dir=await privateDirectory(directory(job.id),{create:true});
  for(const name of ['objects','steps','logs'])await privateDirectory(join(dir,name),{create:true});
  const bytes=await store.object(job.input.sha256);
  await store.immutable(join(dir,'job.json'),bytes);
  const input=JSON.parse(bytes.toString('utf8'));
  if(input.id!==job.id||input.schema!=='stellar-forge.sensorthings-commissioning-job.v1')throw fail('JOB_SOURCE','The original job input differs from its retained identity.',409);
  return {dir,input};
 }
 async function targetBusy(input){
  const lock=join(directory(input.id),'lifetime.lock');
  try{const held=await acquireWorkspaceLease(lock);await held.close();return false;}
  catch(error){if(error.code==='STELLAR_WORKSPACE_BUSY')return true;throw error;}
 }
 async function writeControl(job,value){
  const {dir}=await prepare(job);let prior;
  try{prior=JSON.parse((await readOwned(join(dir,'control.json'),4*1024*1024)).toString('utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;prior={jobId:job.id,cancel:false,resolutions:{},events:[]};}
  if(prior.jobId!==job.id)throw fail('JOB_CONTROL','The original job control changed.',409);
  const next=value(prior);
  await atomicJSON(join(dir,'control.json'),next);return next;
 }
 async function cancel(job,event){
  await writeControl(job,prior=>{if(!prior.events.some(x=>x.id===event.id)){prior.events.push(event);prior.cancel=true;}return prior;});
  const owner=running.get(job.id);if(owner&&!owner.ended)owner.child.kill('SIGTERM');
 }
 async function resume(job,event){
  await writeControl(job,prior=>{if(!prior.events.some(x=>x.id===event.id)){prior.events.push(event);prior.cancel=false;}return prior;});
  return launch(job);
 }
 async function resolution(job,decision){
  await writeControl(job,prior=>{
   const list=prior.resolutions[decision.stepId]??=[];if(!list.some(x=>x.id===decision.id))list.push(decision);
   if(!prior.events.some(x=>x.id===decision.id))prior.events.push({id:decision.id,type:'resolution',createdAt:decision.createdAt});
   prior.cancel=false;return prior;
  });return launch(job);
 }
 async function collect(dir){
  const records=[];
  async function visit(at,prefix){
   const entries=(await readdir(at,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
   for(const entry of entries){
    if(entry.name.endsWith('.tmp')||entry.name.endsWith('.lock'))continue;
    const rel=prefix?prefix+'/'+entry.name:entry.name,path=join(at,entry.name);
    if(!safeRelative(rel)||entry.isSymbolicLink())throw fail('NATIVE_CUSTODY','The original native custody contains an unsafe path.',409);
    if(entry.isDirectory()){await privateDirectory(path);await visit(path,rel);continue;}
    if(!entry.isFile())throw fail('NATIVE_CUSTODY','The original native custody contains a non-regular file.',409);
    const before=await lstat(path,{bigint:true}),key=[before.dev,before.ino,before.size,before.mtimeNs,before.ctimeNs].join(':');
    let saved=fileCache.get(path);
    if(!saved||saved.key!==key){const bytes=await readOwned(path,256*1024*1024),object=await store.putObject(bytes);saved={key,object};fileCache.set(path,saved);}
    records.push({path:rel,...saved.object});
   }
  }
  await visit(dir,'');return records;
 }
 async function inspect(job){
  if(reading.has(job.id))return reading.get(job.id);
  const pending=(async()=>{
   let prepared;
   try{prepared=await prepare(job);}catch(error){if(error.code==='ENOENT')return null;throw error;}
   const {dir,input}=prepared;let raw;
   try{raw=await readOwned(join(dir,'journal.json'),16*1024*1024);}catch(error){
    if(error.code!=='ENOENT')throw error;
    let launch;try{launch=JSON.parse((await readOwned(join(dir,'launch.json'),1024*1024)).toString('utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
    const active=running.has(job.id)||await targetBusy(input);
    const state=active?'STARTING':launch.endedAt?'FAILED':'INTERRUPTED';
    raw=nativeBytes({schema:'stellar-forge.sensorthings-commissioning-native.v1',jobId:job.id,planSha256:sha(nativeBytes(input.plan)),state,
     sequence:0,createdAt:job.createdAt,updatedAt:launch.endedAt??launch.startedAt,counts:{total:input.plan.steps.length,complete:0},
     error:active?null:{code:'NATIVE_START_ENDED',message:'The original native worker ended before its application journal was created.',receipt:launch},attempts:[]});
   }
   const original=JSON.parse(raw.toString('utf8'));
   if(original.jobId!==job.id||original.planSha256!==sha(nativeBytes(input.plan)))throw fail('JOB_IDENTITY','The original native journal belongs to another plan.',409);
   const owned=running.has(job.id),busy=owned||await targetBusy(input),closed=!busy;
   // Terminal provider state is adopted as complete only after the actual
   // native owner has released its kernel lock and all file writes are closed.
   const state=!closed&&TERMINAL.has(original.state)?'DRAINING':closed&&original.state==='RUNNING'?'INTERRUPTED':original.state;
   const key=identity({native:sha(raw),closed,state});
   if(observations.get(job.id)?.key===key)return observations.get(job.id).snapshot;
   const members=await collect(dir),memberMap=new Map(members.map(x=>[x.path,x])),steps=[];
   for(const definition of input.plan.steps){
    const file=memberMap.get('steps/'+definition.stepId+'.json');if(!file)continue;
    const record=JSON.parse((await store.object(file.sha256)).toString('utf8'));
    if(record.stepId!==definition.stepId)throw fail('STEP_IDENTITY','The native step file differs from its original plan.',409);
    steps.push({stepId:record.stepId,entityKind:record.entityKind,sourceKey:record.sourceKey,originalStepId:record.originalStepId??null,
     targetIdJson:record.targetIdJson??null,state:record.state,record:{sha256:file.sha256,bytes:file.bytes}});
   }
   const fileManifest=await saveValue(store,{schema:'stellar-forge.sensorthings-commissioning-custody.v1',jobId:job.id,members}),
    journal=await saveValue(store,{...original,state,nativeState:original.state,closed,steps}),
    snapshot={schema:'stellar-forge.sensorthings-commissioning-snapshot.v1',jobId:job.id,sequence:original.sequence,state,nativeState:original.state,closed,
     counts:{...original.counts,complete:steps.filter(x=>x.state==='COMPLETE').length},error:original.error??null,notBefore:original.notBefore??null,
     updatedAt:original.updatedAt,completedAt:state==='COMPLETE'?original.completedAt??null:null,runtimeIdentity:original.runtimeIdentity??null,journal,files:fileManifest};
   const saved={...snapshot,document:await saveValue(store,snapshot)};
   await onSnapshot(job.id,saved);observations.set(job.id,{key,snapshot:saved});return saved;
  })();reading.set(job.id,pending);
  try{return await pending;}finally{reading.delete(job.id);}
 }
 function launch(job){
  if(closing)throw fail('CLOSING','The original commissioning manager is closing.',503);
  if(running.has(job.id))return Promise.resolve({state:'RUNNING',jobId:job.id});
  if(launches.has(job.id))return launches.get(job.id);
  const pending=(async()=>{
   const selected=selection();if(!selected)return {state:'RUNTIME_REQUIRED',jobId:job.id};
   const {dir,input}=await prepare(job);
   if(job.received===true&&!job.localBinding)throw fail('RECEIVING_BINDING','Explicitly bind this received pending job to the displayed local target before execution.',409);
   const bytes=await readOwned(selected.ready,16*1024*1024),ready=JSON.parse(bytes.toString('utf8'));
   if(ready.schema!=='stellar-forge.frost-client-runtime.v1'||resolve(ready.python)!==selected.python)throw fail('RUNTIME','The selected original runtime receipt does not match its interpreter.',409);
   let controlExists=true;try{await readOwned(join(dir,'control.json'),4*1024*1024);}catch(error){if(error.code!=='ENOENT')throw error;controlExists=false;}
   if(!controlExists)await atomicJSON(join(dir,'control.json'),{jobId:job.id,cancel:false,resolutions:{},events:[]});
   const attemptId=randomUUID(),stdout=await open(join(dir,'logs',attemptId+'.stdout'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600),
    stderr=await open(join(dir,'logs',attemptId+'.stderr'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
   const launchRecord={jobId:job.id,attemptId,startedAt:new Date().toISOString(),state:'STARTED',runtimeReceiptSha256:sha(bytes)};
   await atomicJSON(join(dir,'launch.json'),launchRecord);
   const args=[join(HERE,'native_worker.py'),'--operation',dir,'--job',join(dir,'job.json'),'--job-sha256',job.input.sha256,'--runtime-ready',selected.ready];
   const child=spawn(selected.python,args,{cwd:dir,env:{...environment,PYTHONUNBUFFERED:'1'},detached:process.platform!=='win32',stdio:['ignore',stdout.fd,stderr.fd],windowsHide:true});
   const owner={child,attemptId,ended:false,promise:null};running.set(job.id,owner);
   const closed=new Promise(resolveExit=>{
    child.once('error',error=>resolveExit({kind:'spawn-error',message:error.message}));
    child.once('exit',(code,signal)=>resolveExit({kind:'exit',code,signal}));
   });
   owner.promise=(async()=>{
    const result=await closed;owner.ended=true;await stdout.close();await stderr.close();running.delete(job.id);
    const ended={...launchRecord,state:'ENDED',endedAt:new Date().toISOString(),result};
    await store.immutable(join(dir,'logs',attemptId+'.launch.json'),json(ended));
    await atomicJSON(join(dir,'launch.json'),ended);
    // A journal-free launch error is retained as the same native job result.
    if(result.kind==='spawn-error')await atomicJSON(join(dir,'launch-'+attemptId+'.json'),{jobId:job.id,attemptId,state:'SPAWN_FAILED',error:result.message,endedAt:new Date().toISOString()});
    try{await inspect(job);}catch(error){owner.reconciliationError=error;}
    return result;
   })();void owner.promise.catch(()=>{});
   return {state:'RUNNING',jobId:job.id,attemptId};
  })();launches.set(job.id,pending);
  return pending.finally(()=>launches.delete(job.id));
 }
 async function files(job){
  const snapshot=await inspect(job)??job.latest;if(!snapshot)return [];
  const manifest=await objectValue(store,snapshot.files);return manifest.members;
 }
 async function restore(job,members){
  if(running.has(job.id)||launches.has(job.id))throw fail('NATIVE_CUSTODY_BUSY','The original job has a live local owner.',409);
  const {dir,input}=await prepare(job);if(await targetBusy(input))throw fail('NATIVE_CUSTODY_BUSY','The actual native target owner is still running.',409);
  for(const member of members){
   if(!safeRelative(member.path)||member.path.endsWith('.lock'))throw fail('NATIVE_CUSTODY','A received native file path is invalid.',409);
   const path=join(dir,...member.path.split('/'));await privateDirectory(dirname(path),{create:true});
   await store.immutable(path,await store.object(member.sha256));
  }
 }
 async function drain(job){
  const owner=running.get(job.id);if(!owner)return;
  owner.child.kill('SIGTERM');
  const timeout=(job.targetTimeoutMs??120000)+10000;
  let timer;
  await Promise.race([owner.promise,new Promise(resolveWait=>{timer=setTimeout(resolveWait,timeout);})]);clearTimeout(timer);
  if(!owner.ended){
   // Only this live child and its originally created group are signalled.
   try{if(process.platform!=='win32')process.kill(-owner.child.pid,'SIGKILL');else owner.child.kill('SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
   await owner.promise;
  }
 }
 function close(){
  if(closePromise)return closePromise;closing=true;
  closePromise=(async()=>{const started=await Promise.allSettled([...launches.values()]);
   const drained=await Promise.allSettled([...running].map(async([id])=>{const job={id};await drain(job);}));
   const read=await Promise.allSettled([...reading.values()]);
   const failed=[...started,...drained,...read].find(x=>x.status==='rejected');if(failed)throw failed.reason;
  })();return closePromise;
 }
 return {selection,prepare,launch,inspect,cancel,resume,resolution,files,restore,drain,close,
  hasOwner:id=>running.has(id)||launches.has(id),directory};
}
