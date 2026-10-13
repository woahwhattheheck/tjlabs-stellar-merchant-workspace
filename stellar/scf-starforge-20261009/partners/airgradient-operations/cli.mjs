#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {pathToFileURL} from 'node:url';
import {readPrivate,readJson,publish} from '../open-meteo-operations/files.mjs';
import {need,encoded,MAX_PACKAGE} from './contract.mjs';
import {openWorkspace} from './workspace.mjs';
import {serveWorkspace} from './server.mjs';
import {zipBytes} from './exports.mjs';

function argumentsFor(argv){
 const [command='help',...args]=argv,options={};for(let i=0;i<args.length;i+=2){need(/^--[a-z-]+$/.test(args[i])&&typeof args[i+1]==='string'&&!args[i+1].startsWith('--')&&!Object.hasOwn(options,args[i].slice(2)),'INVALID_ARGUMENTS');options[args[i].slice(2)]=args[i+1];}return {command,options};
}
const HELP='AirGradient customer operations\n\ninit --workspace DIR [--network PRIVATE_JSON]\nserve --workspace DIR [--port 0] [--expected-configuration SHA]\nstatus --workspace DIR\ncatalogue --workspace DIR [--page 1] [--source-type outdoor|indoor]\nproject-save --workspace DIR --input PRIVATE_PROJECT_JSON [--expected-current ID]\nproject-select --workspace DIR --project ID\nplan --workspace DIR --input PRIVATE_PLAN_JSON\nacquire --workspace DIR --plan ID [--retry-failed true]\nreprocess --workspace DIR --plan ID\nreview --workspace DIR --plan ID\ncommit --workspace DIR --plan ID --expected-review SHA\nexport --workspace DIR --report ID --format html|json|summary|series|handover|zip --output NEW_PRIVATE_FILE\ndeliver --workspace DIR --report ID --destination PRIVATE_DIRECTORY\nreceive-inspect --workspace DIR --input PRIVATE_JSON_OR_ZIP\nreceive --workspace DIR --input PRIVATE_JSON_OR_ZIP\ndefinition --workspace DIR --output NEW_PRIVATE_JSON\ndashboard-add --workspace DIR --definition PRIVATE_SWAGGER_JSON --input PRIVATE_BINDING_JSON\n\nPaths are canonical absolute private paths. Initialise one customer workspace, then keep that workspace for acquisition, later editions, receiving and delivery.\n';
export async function main(argv=process.argv.slice(2)){
 const {command,options:o}=argumentsFor(argv);if(command==='help'){process.stdout.write(HELP);return;}
 need(o.workspace,'WORKSPACE_REQUIRED');
 if(command==='serve'){
  const server=await serveWorkspace(o.workspace,{port:Number(o.port??0),expectedConfiguration:o['expected-configuration']});
  process.stdout.write(JSON.stringify({...server,close:undefined})+'\n');let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{if(closing)return;closing=true;await server.close();});
  return server;
 }
 const workspace=await openWorkspace(o.workspace,{create:command==='init',network:o.network?await readJson(o.network):{}});let result;
 try{
  switch(command){
   case 'init':case 'status':result=workspace.state();break;
   case 'catalogue':result=await workspace.catalogue(Number(o.page??1),50,o['source-type']??'outdoor');break;
   case 'project-save':result=workspace.saveProject(await readJson(o.input),{expectedCurrent:o['expected-current']??null});break;
   case 'project-select':result=workspace.selectProject(o.project);break;
   case 'plan':result=workspace.createPlan(await readJson(o.input));break;
   case 'acquire':result=await workspace.run(o.plan,{retryFailed:o['retry-failed']==='true'});break;
   case 'reprocess':result=workspace.reprocess(o.plan);break;
   case 'review':result=workspace.review(o.plan);break;
   case 'commit':result=workspace.commit(o.plan,o['expected-review']);break;
   case 'export':{
    const files=await workspace.files(o.report),format=o.format??'zip',names={html:'report.html',json:'report.json',summary:'summary.csv',series:'series.csv',handover:'editable.airgradient.json'};
    need(format==='zip'||Object.hasOwn(names,format),'INVALID_EXPORT_FORMAT');const bytes=format==='zip'?zipBytes(files):files.find(x=>x.name===names[format]).bytes;result=await publish(o.output,bytes);break;
   }
   case 'deliver':result=await workspace.deliver(o.report,o.destination);break;
   case 'receive-inspect':result=workspace.inspectReceiving(await readPrivate(o.input,MAX_PACKAGE)).summary;break;
   case 'receive':result=workspace.receive(await readPrivate(o.input,MAX_PACKAGE));break;
   case 'definition':{const selected=await workspace.definition();result={...await publish(o.output,Buffer.from(selected.definitionBase64,'base64')),inspection:selected.inspection,source:selected.metadata};break;}
   case 'dashboard-add':result=workspace.addDashboard(await readPrivate(o.definition,16*1024*1024),await readJson(o.input));break;
   default:need(false,'UNKNOWN_COMMAND');
  }
  process.stdout.write(JSON.stringify(result)+'\n');return result;
 }finally{await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(JSON.stringify({code:error.code??'AIRGRADIENT_OPERATION_FAILED'})+'\n');process.exitCode=1;});
