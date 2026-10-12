#!/usr/bin/env node
// MIT. One installed continuation over the original builder, installer and Applications workflow.
import { readFile, writeFile, rename, lstat, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const OPERATION='SCF-USASPENDING-AWARD-TRANSACTIONS-64B7-20261012';
const DIST='stellar/scf-starforge-20261009/distribution';
const USA='stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending';
const need=(ok,code,message=code)=>{if(!ok)throw Object.assign(new Error(message),{code});};
const jsonFile=async path=>JSON.parse(await readFile(path,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function save(path,value){
  const temporary=path+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await rename(temporary,path);
}
async function privateDirectory(path){
  const info=await lstat(path);
  need(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(path)===path&&
    (info.mode&0o077)===0&&(!process.getuid||info.uid===process.getuid()),'ORIGINAL_PRIVATE_DIRECTORY_REQUIRED',path);
}
async function originalCommand(executable,args,{cwd,stdout,stderr,onStart}){
  const {open}=await import('node:fs/promises');
  const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);
  let child,completed;
  try{
    child=spawn(executable,args,{cwd,shell:false,stdio:['ignore',out.fd,err.fd],env:process.env});
    completed=new Promise((yes,no)=>{
      child.once('error',no);child.once('exit',(code,signal)=>yes({code,signal,pid:child.pid}));
    });
    completed.catch(()=>{});
    await new Promise((yes,no)=>{child.once('spawn',yes);child.once('error',no);});
    if(onStart)await onStart(child.pid);
    return await completed;
  }catch(error){
    if(child?.pid&&child.exitCode===null&&child.signalCode===null){
      child.kill('SIGTERM');await completed.catch(()=>{});
    }
    throw error;
  }finally{await out.close();await err.close();}
}
function selectedDirectory(value,base,prefix){
  need(typeof value==='string'&&resolve(value)===value&&dirname(value)===base&&
    (basename(value)===prefix||new RegExp('^'+prefix+'-[a-f0-9-]{36}$').test(basename(value))),
    'ORIGINAL_RECEIVING_SELECTION_CHANGED',String(value));
  return value;
}
async function childIdentity(pid){
  if(!Number.isSafeInteger(pid)||pid<1)return null;
  try{
    const [record,boot]=await Promise.all([readFile('/proc/'+pid+'/stat','utf8'),
      readFile('/proc/sys/kernel/random/boot_id','utf8')]);
    const fields=record.slice(record.lastIndexOf(')')+2).trim().split(/\s+/);
    need(fields.length>19,'ORIGINAL_PROCESS_IDENTITY_UNAVAILABLE');
    return {pid,start:fields[19],boot:boot.trim(),state:fields[0]};
  }catch(error){if(['ENOENT','ESRCH'].includes(error.code))return null;throw error;}
}
async function awaitOriginalChild(identity,resultPath){
  if(!identity)return;
  for(;;){
    const current=await childIdentity(identity.pid);
    if(!current||current.start!==identity.start||current.boot!==identity.boot||['Z','X','x'].includes(current.state))return;
    if(await exists(resultPath))return;
    await delay(500);
  }
}
async function receivingSelection(home,root,request,built,original){
  const path=join(home,'receiving-selection.json');
  const binding={operation:OPERATION,sourceCommit:request.sourceCommit,directory:root,
    archiveSha256:built.sha256,originalCaptureId:original.captureId,
    originalResponseSha256:original.originalResponseSha256};
  const selection=await exists(path)?await jsonFile(path):{
    schema:'stellar-forge.federal-awards-installed-selection.v1',...binding,
    runtime:{directory:join(home,'runtime'),attempts:[]},
    applications:{directory:join(root,'applications-managed'),attempts:[]}};
  need(selection.schema==='stellar-forge.federal-awards-installed-selection.v1'&&
    Object.entries(binding).every(([key,value])=>selection[key]===value)&&
    Array.isArray(selection.runtime?.attempts)&&Array.isArray(selection.applications?.attempts),
    'ORIGINAL_RECEIVING_SELECTION_CHANGED');
  selectedDirectory(selection.runtime.directory,home,'runtime');
  selectedDirectory(selection.applications.directory,root,'applications-managed');
  await save(path,selection);return {path,selection};
}
async function prepareSelectedRuntime({home,request,built,installer,retained}){
  const {selection,path}=retained,selected=selection.runtime;
  let runtime=selectedDirectory(selected.directory,home,'runtime');
  let previousPlanError=null;
  if(await exists(join(runtime,'runtime-install.json'))){
    try{await installer.inspectRuntimeInstall({directory:runtime,load:false});return runtime;}
    catch(error){previousPlanError={code:error.code??error.name,message:error.message};}
  }
  let from=null,recover=false;
  if(await exists(runtime)){
    await privateDirectory(runtime);from=runtime;
    recover=await exists(join(runtime,'preparation.json'));
    runtime=join(home,'runtime-'+randomUUID());
    selected.directory=runtime;
  }
  const attempt={id:randomUUID(),directory:runtime,from,method:recover?'recover':'prepare',
    phase:'preparing',startedAt:new Date().toISOString(),
    ...(previousPlanError?{previousPlanError}:{})};
  selected.attempts.push(attempt);await save(path,selection);
  try{
    const prepared=recover?
      await installer.recoverRuntime({from,directory:runtime,install:false,python:request.python}):
      await installer.prepareRuntimeInstall({directory:runtime,archive:built.archive,sha256:built.sha256,
        native:true,features:['schema','openapi','mcp'],operator:true,python:request.python,from});
    need(prepared.sourceCommit===request.sourceCommit,'ORIGINAL_PREPARED_SOURCE_CHANGED');
    Object.assign(attempt,{phase:'prepared',completedAt:new Date().toISOString(),
      installationId:prepared.installationId,sourceCommit:prepared.sourceCommit});
    await save(path,selection);await save(join(home,'runtime-prepared.json'),prepared);
    return runtime;
  }catch(error){
    Object.assign(attempt,{phase:'interrupted',updatedAt:new Date().toISOString(),
      error:error.code??error.name,message:error.message});
    await save(path,selection);throw error;
  }
}
function sameApplicationSource(application,original){
  return application?.schema==='usaspending.application-native-receiving.v1'&&application.operation===OPERATION&&
    application.mode==='original-managed-applications'&&application.originalCaptureId===original.captureId&&
    application.originalResponseSha256===original.originalResponseSha256;
}
function sameApplicationRuntime(application,runtime,inspected,request){
  return application.runtime?.directory===runtime&&application.runtime?.sourceRoot===inspected.sourceRoot&&
    application.runtime?.sourceCommit===request.sourceCommit&&application.runtime?.installationId===inspected.installationId;
}
async function receiveManagedApplication({root,home,request,inspected,original,runtime,retained,stamp}){
  const {selection,path}=retained,selected=selection.applications;
  let output=selectedDirectory(selected.directory,root,'applications-managed');
  let resultPath=join(output,'application-receiving-result.json'),application;
  const previous=selected.attempts.findLast(value=>value.directory===output);
  await awaitOriginalChild(previous?.process,resultPath);
  if(await exists(resultPath)){
    application=await jsonFile(resultPath);
    need(sameApplicationSource(application,original),'ORIGINAL_MANAGED_RECEIVING_CHANGED');
    if(sameApplicationRuntime(application,runtime,inspected,request))return {application,output,resultPath};
    application=undefined;
  }
  let from=null;
  if(await exists(output)){
    await privateDirectory(output);from=output;
    output=join(root,'applications-managed-'+randomUUID());
    selected.directory=output;resultPath=join(output,'application-receiving-result.json');
  }
  const attempt={id:randomUUID(),directory:output,from,runtimeDirectory:runtime,
    phase:'starting',startedAt:new Date().toISOString()};
  selected.attempts.push(attempt);await save(path,selection);
  const suffix=stamp+'-'+attempt.id;
  try{
    const entrypoint=join(inspected.sourceRoot,USA,'application-native.mjs');
    const journey=await originalCommand(process.execPath,[entrypoint,'--received',join(root,'native'),'--out',output,
      '--runtime',runtime,'--operation',OPERATION],{cwd:inspected.sourceRoot,
      stdout:join(home,'managed-applications-'+suffix+'.stdout'),
      stderr:join(home,'managed-applications-'+suffix+'.stderr'),
      onStart:async pid=>{
        attempt.phase='running';attempt.process=await childIdentity(pid);
        await save(path,selection);
      }});
    Object.assign(attempt,{phase:journey.code===0?'completed':'interrupted',
      completedAt:new Date().toISOString(),result:journey});
    await save(path,selection);await save(join(home,'managed-applications-process.json'),journey);
    need(journey.code===0,'ORIGINAL_MANAGED_APPLICATIONS_FAILED',
      'Read '+join(home,'managed-applications-'+suffix+'.stderr')+' and continue the same original operation.');
    application=await jsonFile(resultPath);
    need(sameApplicationSource(application,original)&&sameApplicationRuntime(application,runtime,inspected,request),
      'ORIGINAL_MANAGED_RECEIVING_CHANGED');
    attempt.resultPath=resultPath;attempt.resultSha256=digest(await readFile(resultPath));
    await save(path,selection);return {application,output,resultPath};
  }catch(error){
    Object.assign(attempt,{phase:'interrupted',updatedAt:new Date().toISOString(),
      error:error.code??error.name,message:error.message});
    await save(path,selection);throw error;
  }
}
async function run(request){
  need(request.operation===OPERATION&&/^[a-f0-9]{40}$/.test(request.sourceCommit),'ORIGINAL_OPERATION_REQUIRED');
  const root=resolve(request.directory),home=resolve(request.directoryForInstall),source=resolve(request.sourceRoot);
  await privateDirectory(root);await privateDirectory(home);await privateDirectory(source);
  const version=process.versions.node.split('.').map(Number);
  need(version[0]>22||version[0]===22&&version[1]>=16,'NODE_22_16_REQUIRED');
  const original=await jsonFile(join(root,'native','receiving-result.json'));
  const imported=await import(pathToFileURL(join(source,DIST,'build.mjs')).href);
  const installer=await import(pathToFileURL(join(source,DIST,'runtime-install.mjs')).href);
  const release=join(home,'release');
  let stage='original-selected-build';
  const events=[];
  const event=value=>{events.push({...value,at:new Date().toISOString()});process.stderr.write(JSON.stringify(value)+'\n');};
  try{
    const built=await imported.buildDistribution({repository:resolve(request.repository),
      ref:request.sourceCommit,output:release,selection:'federal-awards',offline:true,
      resume:await exists(release),python:request.python,onProgress:event});
    need(built.status==='PACKAGED'&&built.sourceCommit===request.sourceCommit&&built.sourceSelection?.id==='federal-awards',
      'ORIGINAL_FEDERAL_AWARDS_BUILD_REQUIRED');
    await save(join(home,'build-result.json'),built);
    await save(join(home,'build-events.json'),events);
    stage='original-runtime-prepare';
    const retained=await receivingSelection(home,root,request,built,original);
    const runtime=await prepareSelectedRuntime({home,request,built,installer,retained});
    const plan=await jsonFile(join(runtime,'runtime-install.json'));
    need(plan.source?.sourceCommit===request.sourceCommit&&plan.archiveSha256===built.sha256,
      'ORIGINAL_RUNTIME_PLAN_CHANGED');
    stage='original-runtime-install';
    const installed=await installer.installRuntime({directory:runtime,npm:request.npm,offline:request.offline,
      cache:request.cache,nodeHeaders:request.nodeHeaders,adoptExisting:request.adoptExisting});
    need(installed.status==='READY'&&installed.ready===true,'ORIGINAL_RUNTIME_NOT_READY');
    await save(join(home,'runtime-installed.json'),installed);
    stage='original-runtime-inspect';
    const inspected=await installer.inspectRuntimeInstall({directory:runtime,load:true,source:true,python:request.python});
    need(inspected.status==='READY'&&inspected.ready===true&&inspected.sourceVerified===true&&
      inspected.sourceCommit===request.sourceCommit,'ORIGINAL_INSTALLED_SOURCE_CHANGED');
    await save(join(home,'runtime-inspected.json'),inspected);
    stage='installed-command';
    const stamp=new Date().toISOString().replaceAll(':','-');
    const help=await originalCommand(process.execPath,[join(source,DIST,'runtime-install-cli.mjs'),
      'run','--dir',runtime,'--','usaspending-research','--help'],
      {cwd:root,stdout:join(home,'installed-help-'+stamp+'.stdout'),stderr:join(home,'installed-help-'+stamp+'.stderr')});
    need(help.code===0,'INSTALLED_USASPENDING_COMMAND_FAILED');
    await save(join(home,'installed-command.json'),help);
    stage='managed-applications';
    const {application,output,resultPath}=await receiveManagedApplication({
      root,home,request,inspected,original,runtime,retained,stamp});
    const result={schema:'stellar-forge.federal-awards-installed-receiving.v1',operation:OPERATION,status:'complete',
      completedAt:new Date().toISOString(),sourceCommit:request.sourceCommit,
      originalReceivingDirectory:join(root,'native'),originalCaptureId:original.captureId,
      awardKey:original.awardKey,transactions:original.transactions,netObligationUsd:original.netObligationUsd,
      release:{archive:built.archive,sha256:built.sha256,sourceFiles:built.sourceFiles,sourceBytes:built.sourceBytes},
      runtime:{directory:runtime,installationId:inspected.installationId,profileId:inspected.profileId,
        sourceRoot:inspected.sourceRoot,lockSha256:inspected.lockSha256,status:inspected.status},
      applications:{directory:output,result:resultPath,sha256:digest(await readFile(resultPath)),mode:application.mode},
      receivingSelection:retained.path,
      workflow:['original_git_objects','original_federal_awards_build','original_runtime_profile',
        'original_native_dependencies','installed_source_inspection','installed_usaspending_command',
        'managed_application_launch','same_workspace_reopen','new_workspace_first_launch','complete_restore_reopen']};
    await save(join(home,'installed-receiving-result.json'),result);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return result;
  }catch(error){
    await save(join(home,'build-events.json'),events);
    await save(join(home,'installed-receiving-error.json'),{operation:OPERATION,sourceCommit:request.sourceCommit,
      stage,at:new Date().toISOString(),error:error.code??error.name,message:error.message,
      ...(error.missingObjects?{missingObjects:error.missingObjects}:{}),
      ...(error.inspection?{inspection:error.inspection}:{})});
    throw error;
  }
}
if(process.argv.length!==4||process.argv[2]!=='--request'){
  process.stderr.write('node receive-installed.mjs --request ORIGINAL_REQUEST.json\n');process.exitCode=2;
}else run(await jsonFile(resolve(process.argv[3]))).catch(error=>{
  process.stderr.write(JSON.stringify({operation:OPERATION,error:error.code??error.name,message:error.message})+'\n');
  process.exitCode=1;
});
