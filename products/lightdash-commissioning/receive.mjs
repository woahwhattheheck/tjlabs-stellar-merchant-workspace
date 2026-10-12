// MIT. Prepare one complete private customer handover receiving; no provider dispatch.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {APP,PRODUCT,MAX_FILE_BYTES,exact,absolute,identifier,uuid,sha,need,privateDirectory,outside,exists,json,
 installedSource,acquireWorkspace,fileIdentity,objectDigest,saveJson} from './common.mjs';
const SCHEMA='stellar-forge.lightdash-handover-receiving.v1';
export async function prepareReceiving(raw){
 exact(raw,['schema','operationId','directory','runtimeDirectory','archive','requestFile','allowOperatorPrivate','python'],
  ['schema','operationId','directory','runtimeDirectory','archive','requestFile']);
 need(raw.schema===SCHEMA,'LIGHTDASH_RECEIVING_SCHEMA','Use a complete original handover receiving selection.');
 const operationId=identifier(raw.operationId),directory=absolute(raw.directory),runtimeDirectory=absolute(raw.runtimeDirectory),
  installed=await installedSource(runtimeDirectory);
 exact(raw.archive,['file','bytes','sha256'],['file','bytes','sha256']);
 exact(raw.requestFile,['file','bytes','sha256'],['file','bytes','sha256']);
 for(const item of [raw.archive,raw.requestFile]){
  absolute(item.file);sha(item.sha256);
  need(Number.isSafeInteger(item.bytes)&&item.bytes>=0&&item.bytes<=MAX_FILE_BYTES,'LIGHTDASH_RECEIVING_SIZE','Use the complete received byte count.');
  const actual=await fileIdentity(item.file);
  need(actual.bytes===item.bytes&&actual.sha256===item.sha256,'LIGHTDASH_RECEIVING_FILE_CHANGED','The original downloaded file changed.');
 }
 need(path.basename(raw.archive.file)==='Lightdash_Commissioning_Handover.zip'&&path.basename(raw.requestFile.file)==='request.json'&&
  path.dirname(raw.requestFile.file)===path.dirname(raw.archive.file),'LIGHTDASH_RECEIVING_REQUEST','Keep both exact downloaded original files in their handover UUID directory.');
 const request=await json(raw.requestFile.file,{maximum:1024*1024,privateFile:true});
 uuid(request.id);uuid(request.workspaceId);
 need(request.schema==='lightdash.commissioning-handover-request.v1'&&path.basename(path.dirname(raw.archive.file))===request.id&&
  request.applicationSourceSha256===installed.application.manifestSha256&&typeof request.includeOperatorPrivate==='boolean'&&
  (!request.includeOperatorPrivate||raw.allowOperatorPrivate===true),'LIGHTDASH_RECEIVING_BASIS','Receive this selected original application and explicitly selected private diagnostics.');
 need(outside(directory,runtimeDirectory)&&outside(directory,path.dirname(raw.archive.file))&&outside(directory,installed.executingRoot),
  'LIGHTDASH_RECEIVING_OVERLAP','Keep receiving output separate from the installed source and exact downloaded archive.');
 const value={schema:SCHEMA,operationId,directory,runtimeDirectory,node:process.execPath,python:raw.python?absolute(raw.python):'/usr/bin/python3',
  archive:raw.archive,requestFile:raw.requestFile,allowOperatorPrivate:raw.allowOperatorPrivate===true,
  handoverId:request.id,workspaceId:request.workspaceId,workspaceRevision:request.workspaceRevision,
  application:{directory:installed.application.directory,manifestFile:installed.application.manifestFile,manifestSha256:installed.application.manifestSha256},
  source:{directory:installed.sourceRoot,manifestFile:installed.manifestFile,manifestSha256:installed.manifestSha256}};
 const inputSha256=objectDigest(value),input={...value,inputSha256};
 await privateDirectory(directory,true);const release=await acquireWorkspace(directory);
 try{
  const file=path.join(directory,'receiving.json');
  if(!await exists(file))need((await readdir(directory)).every(x=>x==='publisher.lock'),'LIGHTDASH_RECEIVING_NOT_EMPTY','Use a new receiving directory or its exact retained selection.');
  await saveJson(file,input,{createOnly:true});
  return {schema:SCHEMA,state:'PREPARED',operationId,directory,input:file,inputSha256,
   command:[input.python,path.join(installed.sourceRoot,PRODUCT,'receive.py'),'--input',file],providerDispatch:false};
 }finally{await release();}
}
export async function inspectReceiving(directory){
 absolute(directory);const input=await json(path.join(directory,'receiving.json'));
 need(input.directory===directory&&input.schema===SCHEMA&&objectDigest(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='inputSha256')))===input.inputSha256,
  'LIGHTDASH_RECEIVING_CHANGED','The original receiving input changed.');
 const result=await exists(path.join(directory,'result.json'))?await json(path.join(directory,'result.json')):null;
 return {schema:SCHEMA,operationId:input.operationId,inputSha256:input.inputSha256,result,providerDispatch:false};
}
export async function receiveHandover(input,{signal}={}){
 const prepared=await prepareReceiving(input),[executable,...args]=prepared.command;
 const child=spawn(executable,args,{stdio:'inherit',env:process.env,shell:false});
 const stop=()=>child.kill('SIGTERM');signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 try{
  const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  need(status.code===0,'LIGHTDASH_RECEIVING_INCOMPLETE','The original complete receiving needs its retained result/logs.');
  return inspectReceiving(prepared.directory);
 }finally{signal?.removeEventListener('abort',stop);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 (async()=>{need(process.argv.length===4&&process.argv[2]==='--input','LIGHTDASH_RECEIVING_ARGUMENTS','Use lightdash-receive --input PRIVATE_SELECTION.json.');
  console.log(JSON.stringify(await receiveHandover(await json(absolute(process.argv[3]),{maximum:8*1024*1024,privateFile:true})),null,2));
 })().catch(error=>{console.error(JSON.stringify({state:'INCOMPLETE',error:{code:error.code??'LIGHTDASH_RECEIVING_FAILED',message:error.message}}));process.exitCode=3;});
}
