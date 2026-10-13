#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {readFile,open,link,unlink,realpath,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openPirateWorkspace} from './core.mjs';
import {startPirateServer} from './server.mjs';
import {inspectPirateSource,inspectPirateIdentity,STARTUP_SCHEMA,absolute} from './managed.mjs';
import {connectPirateWeather,inspectPirateFile} from './client.mjs';
import {bytes,need,sha,uuid,whole,configuration,safeError} from './contract.mjs';
import {atomicJSON,privateDirectory} from '../stellar-expert/store.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const COMMANDS=['init','serve','state','read','act','recover','resume','source-preview','source-import','download','upload-project','inspect-project','receive-project','open-received','prepare-runtime'];
function parse(argv){
 const command=argv.shift();need(COMMANDS.includes(command),'PIRATE_COMMAND','Use pirate-weather '+COMMANDS.join('|')+'.');
 const flags={};for(let i=0;i<argv.length;i++){const key=argv[i];need(/^--[a-z][a-z-]*$/.test(key)&&!Object.hasOwn(flags,key),'PIRATE_ARGUMENT','Use each named option once.');
  if(key==='--startup-json'){flags[key]=true;continue;}need(i+1<argv.length&&!argv[i+1].startsWith('--'),'PIRATE_ARGUMENT','Supply '+key+'.');flags[key]=argv[++i];}
 const allowed={
  init:['workspace','name','api-key-env'],serve:['workspace','port','connection-file','application-source','inbox','expected-configuration','expected-source','startup-json'],
  state:['workspace','connection'],read:['workspace','connection','method','input'],act:['workspace','connection','request','application-source','inbox'],
  recover:['workspace','connection','operation-id'],resume:['workspace','connection','operation-id','application-source','inbox'],
  'source-preview':['workspace','connection','input','file'],'source-import':['workspace','connection','request','file'],
  download:['connection','id','sha256','output'],'upload-project':['connection','id','sha256','file'],
  'inspect-project':['file','application-source'],'receive-project':['workspace','connection','request','application-source'],
  'open-received':['connection','operation-id'],
  'prepare-runtime':['received','application-source','directory','operation-id']
 }[command];
 need(Object.keys(flags).every(k=>allowed.includes(k.slice(2))),'PIRATE_ARGUMENT','An option is not supported by this command.');
 return {command,flags};
}
async function json(path,max=12*1024*1024){
 absolute(path);const raw=await readFile(path);need(raw.length<=max,'PIRATE_INPUT_CAPACITY','The original input file is too large.');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
}
async function sourceInput(input,file){
 absolute(file);const raw=await readFile(file);need(raw.length>0&&raw.length<=8*1024*1024,'PIRATE_RESPONSE_SIZE','Select the original response within 8 MiB.');
 const {createHash}=await import('node:crypto'),digest=createHash('sha256').update(raw).digest('hex');
 need(input.expectedBodySha256===digest,'PIRATE_SOURCE_CHANGED','The original file differs from the reviewed source SHA256.');
 return {...input,bodyBase64:raw.toString('base64')};
}
async function packageSource(selected){
 if(selected)return absolute(selected);
 // The original installed merchant layout is package/source/<repository path>.
 const candidate=resolve(HERE,'../../../../..');
 try{const value=await json(join(candidate,'manifest.json'),32*1024*1024);return value.schema==='stellar-forge.merchant-distribution-manifest.v1'?candidate:null;}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function main(argv=process.argv.slice(2)){
 const {command,flags:f}=parse([...argv]),out=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
 if(command==='init'){
  const config=configuration({name:f['--name']??'Pirate Weather',apiKeyEnv:f['--api-key-env']??'PIRATE_WEATHER_API_KEY'});
  const workspace=await openPirateWorkspace(absolute(f['--workspace']),{create:true,config});try{const state=await workspace.read('state');out({workspaceId:state.workspaceId,revision:state.revision,provider:state.provider,directory:workspace.directory});}finally{await workspace.close();}return;
 }
 if(command==='inspect-project'){
  const {inspectProject}=await import('./package.mjs');out(await inspectProject({archive:absolute(f['--file']),applicationSource:await packageSource(f['--application-source'])}));return;
 }
 if(command==='prepare-runtime'){
  const {prepareReceivedRuntime}=await import('./package.mjs');out(await prepareReceivedRuntime({receivedDirectory:absolute(f['--received']),applicationSource:await packageSource(f['--application-source']),directory:absolute(f['--directory']),operationId:uuid(f['--operation-id'])}));return;
 }
 if(command==='serve'){
  const directory=absolute(f['--workspace']);await inspectPirateIdentity(directory,f['--expected-configuration']);
  const source=await inspectPirateSource(HERE,f['--expected-source']),applicationSource=await packageSource(f['--application-source']);
  const workspace=await openPirateWorkspace(directory,{applicationSource,inboxDirectory:f['--inbox']?absolute(f['--inbox']):null});
  let server;
  try{server=await startPirateServer({workspace,sourceIdentity:source,port:whole(Number(f['--port']??0),'port',0,65535),connectionFile:f['--connection-file']?absolute(f['--connection-file']):join(directory,'connection.json')});}
  catch(e){await workspace.close();throw e;}
  let stopping=false;const stop=()=>{if(stopping)return;stopping=true;void server.close().then(()=>{process.exitCode=0;},e=>{process.stderr.write(JSON.stringify(safeError(e))+'\n');process.exitCode=1;});};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.stdout.write(JSON.stringify({...server.publicIdentity(),schema:STARTUP_SCHEMA,state:'READY',url:server.url,connectionFile:server.connectionFile})+'\n');
  await server.done;process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);return;
 }
 let api,owned;
 if(f['--connection']){api=await connectPirateWeather({connectionFile:absolute(f['--connection'])});owned=()=>api.close();}
 else{
  need(!['download','upload-project','open-received'].includes(command),'PIRATE_CONNECTION_REQUIRED','Use the original current --connection file for this transfer.');
  const workspace=await openPirateWorkspace(absolute(f['--workspace']),{applicationSource:await packageSource(f['--application-source']),inboxDirectory:f['--inbox']?absolute(f['--inbox']):null});
  api={state:()=>workspace.read('state'),read:(method,input)=>workspace.read(method,input),act:r=>workspace.act(r),recover:id=>workspace.read('operation',{operationId:id}),resume:id=>workspace.resume(id)};
  owned=()=>workspace.close();
 }
 try{
  if(command==='state')return out(await api.state());
  if(command==='read')return out(await api.read(f['--method'],f['--input']?await json(f['--input']):{}));
  if(command==='recover')return out(await api.recover(uuid(f['--operation-id'])));
  if(command==='resume')return out(await api.resume(uuid(f['--operation-id'])));
  if(command==='act'||command==='receive-project'){
   const request=await json(f['--request']);if(command==='receive-project')need(request.action==='project.receive','PIRATE_RECEIVING_REQUEST','Use the reviewed receiving request.');
   return out(await api.act(request));
  }
  if(command==='source-preview')return out(await api.read('source-preview',await sourceInput(await json(f['--input']),f['--file'])));
  if(command==='source-import'){const request=await json(f['--request']);need(['capture.import','capture.reconcile'].includes(request.action),'PIRATE_SOURCE_REQUEST','Use an original response import or reconciliation request.');
   return out(await api.act({...request,payload:await sourceInput(request.payload,f['--file'])}));}
  if(command==='download')return out(await api.download({id:sha(f['--id']),expectedSha256:sha(f['--sha256']),output:absolute(f['--output'])}));
  if(command==='upload-project')return out(await api.uploadProject({id:uuid(f['--id']),expectedSha256:sha(f['--sha256']),path:absolute(f['--file'])}));
  if(command==='open-received')return out(await api.openReceived(uuid(f['--operation-id'])));
 }finally{await owned();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(JSON.stringify({...safeError(error),operationId:error.operationId??null,currentRevision:error.currentRevision??null})+'\n');process.exitCode=1;});
