#!/usr/bin/env node
// MIT. Complete installed project command surface; original owners drain on Stop.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {prepareProject,inspectProject,readProject,openProject} from './project.mjs';
import {connectProject,downloadFile,downloadHandover} from './client.mjs';
import {prepareReceiving,receiveHandover,inspectReceiving} from './receive.mjs';
import {STARTUP_SCHEMA} from './application.mjs';
import {absolute,need,json,fileIdentity,installedSource} from './common.mjs';
export const HELP=[
 'Lightdash commissioning project','',
 '  prepare --input PRIVATE_PROJECT.json',
 '  inspect --project PROJECT',
 '  serve --project PROJECT [--port 0]',
 '  call --project OPEN_PROJECT --input TOOL_REQUEST.json',
 '  download --project OPEN_PROJECT --input FILE_SELECTION.json',
 '  download-handover --project OPEN_PROJECT --input HANDOVER_SELECTION.json',
 '  prepare-receiving --input RECEIVING_SELECTION.json',
 '  receive --input RECEIVING_SELECTION.json',
 '  inspect-receiving --directory RECEIVING_DIRECTORY',
 '  installed-receive --input ORIGINAL_COMPLETED_OPERATION_SELECTION.json',
 '  uuid','',
 'Source intake uses host-declared complete inputs. Browser and authenticated MCP share',
 'one original SQLite/native owner. Retain source revisions and original operation IDs.',
 'Serve starts no dbt/Lightdash/provider command. Ctrl-C or SIGTERM drains all accepted work.',
 'Receiving uses the complete original ZIP and request.json, then opens its included',
 'application with the original host connection detached. Read RECEIVING.md.',''
].join('\n');
function options(argv,allowed,flags=[]){
 const value={};for(let i=0;i<argv.length;i++){
  const name=argv[i];need(allowed.includes(name)&&!Object.hasOwn(value,name),'LIGHTDASH_CLI_OPTION','Unknown or repeated option: '+name);
  if(flags.includes(name)){value[name]=true;continue;}
  need(typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'LIGHTDASH_CLI_VALUE','Missing option value: '+name);value[name]=argv[++i];
 }return value;
}
function numeric(value,fallback){
 if(value===undefined)return fallback;need(/^(?:0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)),'LIGHTDASH_CLI_NUMBER','Use a nonnegative integer.');
 return Number(value);
}
const emit=value=>console.log(JSON.stringify(value,null,2));
async function foreground(o){
 const directory=absolute(o['--project']),controller=new AbortController();let owner,stopped=false,wake,keepalive,drained=false;
 const stop=()=>{stopped=true;controller.abort();wake?.();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 const drain=async close=>{
  for(;;){try{await close();return;}catch(error){
   console.error(JSON.stringify({state:'CLOSE_INCOMPLETE',code:error.code??'LIGHTDASH_CLOSE_FAILED',
    message:'Original ownership retained. Inspect its failure, then signal this same process to retry draining.'}));
   keepalive??=setInterval(()=>{},60000);await new Promise(resolve=>{wake=resolve;});wake=null;
  }}
 };
 try{
  const state=await readProject(directory),projectIdentity=await fileIdentity(path.join(directory,'project.json'));
  for(const [flag,actual]of [['--expected-project-sha256',projectIdentity.sha256],['--expected-workspace-id',state.workspace.workspaceId],
   ['--expected-workspace-identity',state.workspaceIdentity],['--expected-manifest-sha256',state.installation.manifestSha256]])
   if(o[flag]!==undefined)need(o[flag]===actual,'LIGHTDASH_CLI_SELECTION_CHANGED','The reviewed original '+flag+' changed.');
  if(o['--startup-json'])need(['--expected-project-sha256','--expected-workspace-id','--expected-workspace-identity','--expected-manifest-sha256'].every(k=>o[k]),
   'LIGHTDASH_CLI_STARTUP_SELECTION','Managed startup requires all reviewed original identities.');
  try{owner=await openProject(directory,{port:numeric(o['--port'],0),signal:controller.signal});}
  catch(error){if(error.close)await drain(error.close);if(stopped&&error.code==='LIGHTDASH_PROJECT_START_CANCELLED')return;throw error;}
  if(!stopped){
   if(o['--startup-json']){
    const selected=await installedSource(state.installation.runtimeDirectory);
    console.log(JSON.stringify({schema:STARTUP_SCHEMA,status:'LIGHTDASH_PROJECT_READY',directory,projectId:state.id,
     projectSha256:projectIdentity.sha256,workspaceId:state.workspace.workspaceId,workspaceIdentity:state.workspaceIdentity,
     manifestSha256:state.installation.manifestSha256,applicationManifestSha256:selected.application.manifestSha256,
     sourceRoot:selected.sourceRoot,executingSourceRoot:selected.executingRoot,instanceId:owner.session.instanceId,
     authoringInstanceId:owner.session.authoringInstanceId,browserUrl:owner.session.browserUrl,mcpUrl:owner.session.mcpUrl,pid:process.pid}));
   }else console.log(JSON.stringify(owner.session));
   await new Promise(resolve=>{wake=resolve;if(stopped)resolve();});wake=null;
  }
  await drain(owner.close);drained=true;
 }finally{
  if(owner&&!drained)await drain(owner.close);
  if(keepalive)clearInterval(keepalive);
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
 }
}
export async function main(argv=process.argv.slice(2)){
 const action=argv[0],args=argv.slice(1);
 if(!action||['help','--help','-h'].includes(action)){console.log(HELP);return;}
 if(action==='uuid'){need(args.length===0,'LIGHTDASH_CLI_OPTION','uuid takes no arguments.');console.log(randomUUID());return;}
 if(action==='serve'){return foreground(options(args,['--project','--port','--startup-json','--expected-project-sha256',
  '--expected-workspace-id','--expected-workspace-identity','--expected-manifest-sha256'],['--startup-json']));}
 if(action==='inspect'){const o=options(args,['--project']);emit(await inspectProject(absolute(o['--project'])));return;}
 if(action==='inspect-receiving'){const o=options(args,['--directory']);emit(await inspectReceiving(absolute(o['--directory'])));return;}
 if(['prepare','prepare-receiving','receive','installed-receive'].includes(action)){
  const o=options(args,['--input']),input=await json(absolute(o['--input']),{maximum:8*1024*1024,privateFile:true});
  if(action==='prepare')emit(await prepareProject(input));
  else if(action==='prepare-receiving')emit(await prepareReceiving(input));
  else if(action==='receive')emit(await receiveHandover(input));
  else emit(await (await import('./installed-receiving.mjs')).receiveInstalled(input));
  return;
 }
 if(['call','download','download-handover'].includes(action)){
  const o=options(args,['--project','--input']),input=await json(absolute(o['--input']),{maximum:8*1024*1024,privateFile:true});
  const client=await connectProject(absolute(o['--project']));
  try{
   if(action==='call'){need(typeof input.tool==='string'&&input.tool.startsWith('merchant_lightdash_'),'LIGHTDASH_CLI_TOOL','Select an original commissioning tool.');
    emit(await client.call(input.tool,input.arguments??{},{timeoutMs:input.timeoutMs??120000}));}
   else emit(await (action==='download'?downloadFile:downloadHandover)(client,input));
  }finally{await client.close();}
  return;
 }
 need(false,'LIGHTDASH_CLI_ACTION','Unknown action. Read --help.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
 main().catch(error=>{console.error(JSON.stringify({error:{code:error.code??'LIGHTDASH_PROJECT_FAILED',message:error.message}}));process.exitCode=3;});
