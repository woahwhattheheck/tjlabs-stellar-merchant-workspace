#!/usr/bin/env node
// MIT. One installed continuation over the original builder, installer and Applications workflow.
import { readFile, writeFile, rename, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

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
async function originalCommand(executable,args,{cwd,stdout,stderr}){
  const {open}=await import('node:fs/promises');
  const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);
  try{return await new Promise((yes,no)=>{
    const child=spawn(executable,args,{cwd,shell:false,stdio:['ignore',out.fd,err.fd],env:process.env});
    child.once('error',no);child.once('exit',(code,signal)=>yes({code,signal,pid:child.pid}));
  });}finally{await out.close();await err.close();}
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
  const release=join(home,'release'),runtime=join(home,'runtime');
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
    if(!await exists(join(runtime,'runtime-install.json'))){
      const prepared=await installer.prepareRuntimeInstall({directory:runtime,archive:built.archive,sha256:built.sha256,
        native:true,features:['schema','openapi','mcp'],operator:true,python:request.python});
      need(prepared.sourceCommit===request.sourceCommit,'ORIGINAL_PREPARED_SOURCE_CHANGED');
      await save(join(home,'runtime-prepared.json'),prepared);
    }
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
    const output=join(root,'applications-managed');
    const resultPath=join(output,'application-receiving-result.json');
    let application;
    if(await exists(resultPath)){
      application=await jsonFile(resultPath);
    }else{
      const entrypoint=join(inspected.sourceRoot,USA,'application-native.mjs');
      const journey=await originalCommand(process.execPath,[entrypoint,'--received',join(root,'native'),'--out',output,
        '--runtime',runtime,'--operation',OPERATION],{cwd:inspected.sourceRoot,
        stdout:join(home,'managed-applications-'+stamp+'.stdout'),stderr:join(home,'managed-applications-'+stamp+'.stderr')});
      await save(join(home,'managed-applications-process.json'),journey);
      need(journey.code===0,'ORIGINAL_MANAGED_APPLICATIONS_FAILED',
        'Read '+join(home,'managed-applications-'+stamp+'.stderr')+' and continue the same original operation.');
      application=await jsonFile(resultPath);
    }
    need(application.schema==='usaspending.application-native-receiving.v1'&&application.operation===OPERATION&&
      application.mode==='original-managed-applications'&&application.originalCaptureId===original.captureId&&
      application.originalResponseSha256===original.originalResponseSha256&&
      application.runtime?.directory===runtime&&application.runtime?.sourceRoot===inspected.sourceRoot&&
      application.runtime?.sourceCommit===request.sourceCommit&&application.runtime?.installationId===inspected.installationId,
      'ORIGINAL_MANAGED_RECEIVING_CHANGED');
    const result={schema:'stellar-forge.federal-awards-installed-receiving.v1',operation:OPERATION,status:'complete',
      completedAt:new Date().toISOString(),sourceCommit:request.sourceCommit,
      originalReceivingDirectory:join(root,'native'),originalCaptureId:original.captureId,
      awardKey:original.awardKey,transactions:original.transactions,netObligationUsd:original.netObligationUsd,
      release:{archive:built.archive,sha256:built.sha256,sourceFiles:built.sourceFiles,sourceBytes:built.sourceBytes},
      runtime:{directory:runtime,installationId:inspected.installationId,profileId:inspected.profileId,
        sourceRoot:inspected.sourceRoot,lockSha256:inspected.lockSha256,status:inspected.status},
      applications:{directory:output,result:resultPath,sha256:digest(await readFile(resultPath)),mode:application.mode},
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
