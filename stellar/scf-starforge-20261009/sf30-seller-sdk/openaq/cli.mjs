#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readJson, atomicJson, privateDirectory } from '../postgres/publisher/files.mjs';
import { openOpenAQWorkspace } from './workspace.mjs';
import { startOpenAQServer } from './server.mjs';
import { STARTUP_SCHEMA, inspectOpenAQSource, inspectOpenAQWorkspace, readOpenAQConnection, verifyOpenAQConnection, operatorJSON } from './managed.mjs';
import { downloadOpenAQProject } from './download.mjs';
import { need } from './contract.mjs';
const HELP='OpenAQ station studies and customer delivery\n\n'+
 '  init --workspace NEW_DIR --config PRIVATE_PROJECT.json\n'+
 '  serve --workspace DIR [--port 0] [--connection FILE] [--startup-json]\n'+
 '  read --connection FILE --action READ_NAME [--input PRIVATE.json]\n'+
 '  action --connection FILE --action ACTION_NAME --input PRIVATE.json\n'+
 '  resume --connection FILE --request UUID\n'+
 '  pause --connection FILE --request UUID\n'+
 '  run --workspace DIR --action ACTION_NAME --input PRIVATE.json\n'+
 '  status --workspace DIR\n'+
 '  download --connection FILE --export UUID --directory NEW_OR_SAME_DIR\n'+
 '  receive --workspace NEW_ORIGINAL_DIR --config PRIVATE_PROJECT.json --archive FILE.tgz --sha256 HASH --request UUID\n\n'+
 'Actions: study.save, capture, review, report, publication.prepare/review/publish/recover,\n'+
 'release.prepare/stage, customer.start/resume, export. A request JSON supplies requestId;\n'+
 'use the same UUID after a lost response. Completed captures reopen without source calls.\n'+
 'Merchant reads: merchant.status, merchant.release, merchant.open, merchant.close.\n'+
 'Supply stageRequestId for release/open, and the current consoleId for close.\n'+
 'The owned original SF82 console performs activation, run, rollback and customer delivery.\n'+
 'Linux, Node22.16+ and Python3.10+ with util-linux flock; original DuckDB customer service\n'+
 'is optional and independently owned. Provider credentials remain environment references.\n';
function options(argv){
 const values={};for(let i=0;i<argv.length;i++){
  const key=argv[i];need(key.startsWith('--')&&!Object.hasOwn(values,key),'OPENAQ_OPTION_INVALID');
  if(key==='--startup-json'){values[key]=true;continue;}
  need(typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'OPENAQ_OPTION_VALUE_REQUIRED');values[key]=argv[++i];
 }return values;
}
const required=(o,key)=>{need(typeof o[key]==='string','OPENAQ_OPTION_REQUIRED','Supply '+key+'.');return o[key];};
const print=v=>process.stdout.write(JSON.stringify(v,null,2)+'\n');
export async function main(argv=process.argv.slice(2)){
 if(!argv.length||argv[0]==='--help'){process.stdout.write(HELP);return;}
 const command=argv[0],o=options(argv.slice(1));
 if(['read','action','resume','pause','download'].includes(command)){
  const connectionFile=resolve(required(o,'--connection')),binding=await readOpenAQConnection(connectionFile);await verifyOpenAQConnection(binding);
  if(command==='download')return print(await downloadOpenAQProject({connectionFile,exportId:required(o,'--export'),directory:resolve(required(o,'--directory'))}));
  if(command==='resume'||command==='pause')return print(await operatorJSON(binding,command==='resume'?'/api/resume':'/api/cancel',{method:'POST',body:{workspaceId:binding.workspaceId,requestId:required(o,'--request')}}));
  const input=o['--input']?await readJson(resolve(o['--input']),2*1024*1024):{};
  return print(await operatorJSON(binding,command==='read'?'/api/read':'/api/action',{method:'POST',
   body:{action:required(o,'--action'),input:command==='read'?input:{...input,workspaceId:binding.workspaceId}}}));
 }
 const directory=resolve(required(o,'--workspace'));
 if(command==='init'){
  const workspace=await openOpenAQWorkspace({directory,create:true,config:await readJson(resolve(required(o,'--config')),262144)});
  try{return print({workspaceId:workspace.id,directory,configurationSha256:workspace.configurationSha256,project:workspace.configuration.project});}finally{await workspace.close();}
 }
 if(command==='serve'){
  const sourceIdentity=await inspectOpenAQSource(undefined,o['--expected-source']);
  await inspectOpenAQWorkspace(directory,o['--expected-configuration']);
  const workspace=await openOpenAQWorkspace({directory});let server;
  const connectionFile=resolve(o['--connection']??join(directory,'connection.json'));
  try{server=await startOpenAQServer({workspace,port:Number(o['--port']??0),sourceIdentity,connectionFile});}
  catch(e){await workspace.close();throw e;}
  const startup={schema:STARTUP_SCHEMA,state:'READY',workspaceId:workspace.id,configurationSha256:workspace.configurationSha256,
   instanceId:server.instanceId,sourceIdentity,connectionFile,url:server.url};
  process.stdout.write(JSON.stringify(startup)+'\n');
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;try{await server.close();process.stdout.write(JSON.stringify({schema:STARTUP_SCHEMA,state:'CLOSED',workspaceId:workspace.id,instanceId:server.instanceId})+'\n');}catch(e){process.stderr.write((e.code??'OPENAQ_CLOSE_INCOMPLETE')+'\n');process.exitCode=1;}};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);return server;
 }
 if(command==='receive'){
  // The receiving request survives reopening this same private target. Initial configuration contains no copied provider credentials.
  let workspace;try{workspace=await openOpenAQWorkspace({directory});}
  catch(e){if(e.code!=='ENOENT')throw e;workspace=await openOpenAQWorkspace({directory,create:true,config:await readJson(resolve(required(o,'--config')),262144)});}
  try{const requestId=required(o,'--request'),input={workspaceId:workspace.id,requestId,archivePath:resolve(required(o,'--archive')),sha256:required(o,'--sha256')};
   const started=await workspace.start('receive',input);if(started.state==='FAILED'||started.state==='INTERRUPTED')await workspace.resume({workspaceId:workspace.id,requestId});
   const outcome=await workspace.wait(requestId);print(outcome);if(outcome.state!=='COMPLETE')process.exitCode=1;return outcome;
  }finally{await workspace.close();}
 }
 const workspace=await openOpenAQWorkspace({directory});
 try{
  if(command==='status')return print(await workspace.read('status'));
  need(command==='run','OPENAQ_COMMAND_INVALID');
  const input=await readJson(resolve(required(o,'--input')),2*1024*1024),started=await workspace.start(required(o,'--action'),{...input,workspaceId:workspace.id});
  const outcome=await workspace.wait(started.id);print(outcome);if(outcome.state!=='COMPLETE')process.exitCode=1;return outcome;
 }finally{await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{process.stderr.write(JSON.stringify({error:e.code??'OPENAQ_FAILED',message:e.code?e.message:'Inspect the selected private source and request.'})+'\n');process.exitCode=1;});
