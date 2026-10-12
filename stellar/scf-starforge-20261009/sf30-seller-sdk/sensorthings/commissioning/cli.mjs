#!/usr/bin/env node
// MIT. Complete commissioning commands through the original workspace writer.
import {resolve,dirname,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {open,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {openSensorThingsWorkspace} from '../core.mjs';
import {serveSensorThingsWorkspace} from '../server.mjs';
import {privateDirectory,readOwned,syncDir,atomicJSON} from '../../stellar-expert/store.mjs';
import {openPrivateFile,hashHeldFile,inspectRetainedFile} from '../portable.mjs';
import {fail,json} from './common.mjs';

const COMMANDS={
 overview:['workspace'],project:['workspace','id'],source:['workspace','id'],
 rows:['workspace','id','offset','limit','mapping'],plan:['workspace','id','offset','limit'],
 job:['workspace','id','offset','limit'],history:['workspace','id','offset','limit'],
 map:['workspace','id'],download:['workspace','id','output'],
 action:['workspace','input','source-inbox','frost-python','runtime-ready'],
 serve:['workspace','source-inbox','frost-python','runtime-ready','host','port','session-file']
};
export const HELP=[
 'SensorThings source-to-FROST commissioning on the original Operations Desk.',
 '',
 'overview --workspace PRIVATE_DIRECTORY',
 'project|source|plan|job|history|map --workspace PRIVATE_DIRECTORY --id EXACT_ID',
 'rows --workspace PRIVATE_DIRECTORY --id SOURCE_ID [--mapping MAPPING_ID]',
 'plan|job|history|rows also accept --offset N --limit N.',
 'download --workspace PRIVATE_DIRECTORY --id FILE_SHA256 --output NEW_PRIVATE_FILE',
 'action --workspace PRIVATE_DIRECTORY --input PRIVATE_REQUEST_JSON',
 '       [--source-inbox PRIVATE_DIRECTORY] [--frost-python VENV/bin/python --runtime-ready PRIVATE_RECEIPT]',
 'serve --workspace PRIVATE_DIRECTORY --source-inbox PRIVATE_DIRECTORY',
 '      --session-file PRIVATE_FILE [--host 127.0.0.1|::1 --port 8783]',
 '      [--frost-python VENV/bin/python --runtime-ready PRIVATE_RECEIPT]',
 '',
 'Action JSON uses the existing {operationId,expectedRevision,action,payload}.',
 'Keep the exact request on interruption; the original workspace owns replay.',
 'Native actions wait for that original job to close. Ctrl-C drains its actual worker.',
 'A running Desk owns its workspace; use its authenticated HTTP actions and reads.',
 'The two runtime environment references are SENSORTHINGS_FROST_PYTHON and',
 'SENSORTHINGS_FROST_RUNTIME_READY. Target authorization values stay in host environment.',
 'Server startup writes the private access URL to --session-file; stdout has no token.'
].join('\n');
function parse(args){
 const command=args.shift(),allowed=COMMANDS[command];
 if(!allowed)throw fail('CLI','Choose one complete commissioning command.');
 const values={};
 for(let i=0;i<args.length;i++){
  const key=args[i].startsWith('--')?args[i].slice(2):'';
  if(!allowed.includes(key)||Object.hasOwn(values,key)||!args[i+1]||args[i+1].startsWith('--'))throw fail('CLI','Use each declared option once.');
  values[key]=args[++i];
 }
 if(!isAbsolute(values.workspace??''))throw fail('CLI_PATH','Select the existing private workspace with an absolute path.');
 for(const key of ['input','source-inbox','frost-python','runtime-ready','session-file','output'])if(values[key]!==undefined&&!isAbsolute(values[key]))throw fail('CLI_PATH','Use an absolute '+key+' path.');
 for(const key of ['offset','limit','port'])if(values[key]!==undefined&&(!/^\d+$/.test(values[key])||!Number.isSafeInteger(Number(values[key]))))throw fail('CLI_NUMBER','Use a whole '+key+'.');
 if(Boolean(values['frost-python'])!==Boolean(values['runtime-ready']))throw fail('CLI_RUNTIME','Supply both selected runtime paths together.');
 return {command,values};
}
async function download(manager,id,path){
 const file=await manager.fileRecord(id);
 await privateDirectory(dirname(path));
 try{await inspectRetainedFile(path,{expectedBytes:file.bytes,expectedSha256:file.sha256,maximum:2*1024*1024*1024});return {id,bytes:file.bytes,sha256:file.sha256,reopened:true};}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=path+'.'+randomUUID()+'.partial',held=await openPrivateFile(file.path,{expectedBytes:file.bytes,maximum:2*1024*1024*1024});
 let output;
 try{
  await hashHeldFile(held.handle,{expectedBytes:file.bytes,expectedSha256:file.sha256,maximum:2*1024*1024*1024});
  output=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);
  const buffer=Buffer.alloc(1024*1024),digest=createHash('sha256');let offset=0;
  while(offset<file.bytes){
   const {bytesRead}=await held.handle.read(buffer,0,Math.min(buffer.length,file.bytes-offset),offset);
   if(!bytesRead)throw fail('FILE_CHANGED','The original complete file ended early.',409);
   const bytes=buffer.subarray(0,bytesRead);digest.update(bytes);await output.writeFile(bytes);offset+=bytesRead;
  }
  if(digest.digest('hex')!==file.sha256)throw fail('FILE_CHANGED','The retained complete file changed during download.',409);
  await output.sync();await output.close();output=null;
  try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;}
  await inspectRetainedFile(path,{expectedBytes:file.bytes,expectedSha256:file.sha256,maximum:2*1024*1024*1024});
  await syncDir(dirname(path));await unlink(temporary);
  return {id,bytes:file.bytes,sha256:file.sha256,reopened:false};
 }finally{if(output)await output.close().catch(()=>{});await held.handle.close();}
}
async function waitNative(workspace,jobId,isStopped){
 let last=null;
 for(;;){
  const current=await workspace.commissioning.job(jobId,{offset:0,limit:1});
  const key=JSON.stringify({state:current.state,snapshot:current.latest?.document.sha256,progress:current.progress});
  if(key!==last){process.stderr.write(JSON.stringify({jobId,state:current.state,progress:current.progress,closed:current.latest?.closed??null})+'\n');last=key;}
  if(current.latest?.closed===true||['RUNTIME_REQUIRED','START_FAILED'].includes(current.state)||current.received&&!current.localBinding||isStopped())return current;
  await new Promise(done=>setTimeout(done,500));
 }
}
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.includes('--help')){console.log(HELP);return;}
 const {command,values:v}=parse([...args]),options={directory:resolve(v.workspace),sourceInboxDirectory:v['source-inbox']??null,
  commissioningRuntime:v['frost-python']?{python:v['frost-python'],ready:v['runtime-ready']}:{}};
 if(command==='serve'){
  if(!v['session-file'])throw fail('CLI_SESSION','Select a private session file for the original access URL.');
  await privateDirectory(dirname(v['session-file']));
  const server=await serveSensorThingsWorkspace({...options,host:v.host??'127.0.0.1',port:Number(v.port??8783)});
  let closePromise=null;const closed=new Promise(done=>server.server.once('close',done));
  const close=()=>closePromise??=(async()=>{await server.close();})();
  const onSignal=()=>void close().catch(error=>{console.error(JSON.stringify({code:error.code??'CLOSE',message:error.message}));process.exitCode=1;});
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  try{
   const accessUrl=server.url.replace('/#','/commissioning/#');
   await atomicJSON(v['session-file'],{schema:'stellar-forge.sensorthings-commissioning-session.v1',workspaceId:server.workspaceId,origin:server.origin,accessUrl});
   console.log(JSON.stringify({workspaceId:server.workspaceId,origin:server.origin,path:'/commissioning/',sessionFile:v['session-file']}));
   await closed;
  }finally{process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);await close();}
  return;
 }
 const workspace=await openSensorThingsWorkspace(options);let stopping=false,closePromise=null;
 const close=()=>closePromise??=workspace.close();
 const onSignal=()=>{stopping=true;};
 process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
 try{
  const manager=workspace.commissioning,page={offset:Number(v.offset??0),limit:Number(v.limit??100)};let result;
  if(command==='action'){
   if(!v.input)throw fail('CLI_INPUT','Select the exact retained action request.');
   const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readOwned(v.input,2*1024*1024)));
   const output=await workspace.action(request);result=output;
   if(output.result?.jobId&&/^commissioning\.(?:run\.|target\.inspect)/.test(request.action))result={...output,native:await waitNative(workspace,output.result.jobId,()=>stopping)};
   if(result.native&&result.native.state!=='COMPLETE')process.exitCode=2;
  }else if(command==='overview')result=manager.overview();
  else{
   if(!v.id)throw fail('CLI_SELECTION','Select the original record ID.');
   if(command==='download'){if(!v.output)throw fail('CLI_OUTPUT','Select the private retained output file.');result=await download(manager,v.id,v.output);}
   else if(command==='map')result=await manager.mapData(v.id);
   else if(command==='rows')result=await manager.rows(v.id,{...page,mappingId:v.mapping??null});
   else result=await manager[command](v.id,page);
  }
  process.stdout.write(json(result));
 }finally{process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);await close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
 console.error(JSON.stringify({error:error.code??'COMMISSIONING_CLI',message:error.message,details:error.details??null}));process.exitCode=1;
});
