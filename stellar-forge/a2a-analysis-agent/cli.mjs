#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {parseArgs} from 'node:util';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureConfiguration} from './native.mjs';
import {initializeDatabase,checkConfiguration,openAnalysisServer} from './service.mjs';
import {loadConfig,validateConfig,saveNew,privateDirectory,need,NAME,safeError} from './config.mjs';

const HELP = `Stellar Forge analytical agent

Capture selected original saved procedures:
  sf-a2a-analysis capture --directory /private/a2a --database /private/analysis \
    --query monthly@1 --report operations@2 --public-url https://agent.example/a2a \
    --out /private/a2a/config.json

Initialize the official A2A task database, check the original selections, and serve:
  sf-a2a-analysis init --config /private/a2a/config.json
  sf-a2a-analysis check --config /private/a2a/config.json
  A2A_ANALYSIS_TOKEN=<environment secret> sf-a2a-analysis serve --config /private/a2a/config.json

capture options:
  --query NAME[@REVISION]       Repeat to expose selected original saved queries.
  --report NAME[@REVISION]      Repeat to expose selected original report definitions.
  --workspace NAME             Registered original workspace alias (customer).
  --name TEXT                  Agent Card name.
  --description TEXT           Agent Card description.
  --principal NAME             Caller identity (operator).
  --token-env NAME             Environment variable containing its token (A2A_ANALYSIS_TOKEN).
  --max-output-bytes INTEGER    Maximum complete native output set (16777216).
  --timeout-seconds NUMBER      Original query-export deadline (300).
  --allow-parameters            Permit unchanged JSON parameter text on selected queries.
  --host ADDRESS               Listener address (127.0.0.1).
  --port INTEGER               Listener port (41242).

Capture keeps exact source editions, revisions and parameter text. Select existing procedures
in the original Analysis Workspace before capture. Tokens stay in the process environment.
`;
const options={
  help:{type:'boolean',short:'h'},config:{type:'string'},directory:{type:'string'},database:{type:'string'},
  query:{type:'string',multiple:true},report:{type:'string',multiple:true},workspace:{type:'string'},
  'public-url':{type:'string'},out:{type:'string'},name:{type:'string'},description:{type:'string'},
  principal:{type:'string'},'token-env':{type:'string'},'max-output-bytes':{type:'string'},
  'timeout-seconds':{type:'string'},'allow-parameters':{type:'boolean'},host:{type:'string'},port:{type:'string'}
};
function selection(raw){
  const match=/^([A-Za-z][A-Za-z0-9_-]{0,63})(?:@([1-9][0-9]*))?$/.exec(raw);
  need(match,'A2A_ANALYSIS_PROCEDURE_SELECTION_INVALID');
  const revision=match[2]===undefined?undefined:Number(match[2]);
  need(revision===undefined||Number.isSafeInteger(revision),'A2A_ANALYSIS_REVISION_INVALID');
  return {name:match[1],...(revision===undefined?{}:{revision})};
}
function numeric(raw,fallback){
  if(raw===undefined)return fallback;
  need(/^[0-9]+(?:\.[0-9]+)?$/.test(raw),'A2A_ANALYSIS_NUMBER_INVALID');return Number(raw);
}
export async function main(args=process.argv.slice(2)){
  const {values:v,positionals}=parseArgs({args,options,allowPositionals:true,strict:true});
  const action=positionals[0];
  if(v.help||!action){process.stdout.write(HELP);return;}
  need(positionals.length===1,'A2A_ANALYSIS_COMMAND_INVALID');
  if(action==='capture'){
    need(v.directory&&v.database&&v['public-url']&&v.out,'A2A_ANALYSIS_CAPTURE_ARGUMENTS_REQUIRED');
    need((v.query?.length??0)+(v.report?.length??0)>0,'A2A_ANALYSIS_SELECT_ORIGINAL_PROCEDURES');
    const directory=resolve(v.directory),out=resolve(v.out);
    await privateDirectory(dirname(out),{create:true});
    const config=validateConfig(await captureConfiguration({
      directory,database:resolve(v.database),publicUrl:v['public-url'],
      queries:(v.query??[]).map(selection),reports:(v.report??[]).map(selection),
      ...(v.workspace?{workspace:v.workspace}:{}),...(v.name?{name:v.name}:{}),
      ...(v.description?{description:v.description}:{}),...(v.principal?{principal:v.principal}:{}),
      ...(v['token-env']?{tokenEnv:v['token-env']}:{}),
      maxOutputBytes:numeric(v['max-output-bytes'],16*1024*1024),
      timeoutSeconds:numeric(v['timeout-seconds'],300),port:numeric(v.port,41242),
      host:v.host??'127.0.0.1',allowParameters:v['allow-parameters']===true
    }));
    await saveNew(out,config);
    process.stdout.write(JSON.stringify({status:'CAPTURED',config:out,
      workspaces:config.workspaces.map(w=>({name:w.name,workspaceId:w.workspaceId})),
      procedures:config.procedures.map(p=>({id:p.id,kind:p.kind,name:p.name}))},null,2)+'\n');
    return;
  }
  need(['init','check','serve'].includes(action)&&v.config,'A2A_ANALYSIS_CONFIG_COMMAND_REQUIRED');
  const config=await loadConfig(resolve(v.config));
  if(action==='init'){process.stdout.write(JSON.stringify(await initializeDatabase(config),null,2)+'\n');return;}
  if(action==='check'){process.stdout.write(JSON.stringify(await checkConfiguration(config),null,2)+'\n');return;}
  const service=await openAnalysisServer(config);
  process.stdout.write(JSON.stringify({event:'analysis_agent_listening',publicUrl:service.config.publicUrl,
    address:service.address,procedures:config.procedures.length})+'\n');
  let closing;
  const stop=()=>{
    if(!closing)closing=service.close().then(()=>{
      process.stdout.write(JSON.stringify({event:'analysis_agent_stopped'})+'\n');
    }).catch(error=>{process.stderr.write(safeError(error)+'\n');process.exitCode=1;});
  };
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return service;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{process.stderr.write(safeError(error)+'\n');process.exitCode=1;});
}
