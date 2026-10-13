#!/usr/bin/env node
// MIT. Installed full API-customer encrypted handover and original receiving.
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openApiPassRecovery} from './recovery-jobs.mjs';
import {recoverySource} from './recovery.mjs';
import {startApiPassRecoveryServer} from './recovery-server.mjs';
import {runCustomerWorkspaceLifetime} from './cli.mjs';
import {privateDirectory,writeJson} from '../../../sf88-operator-buyer-cli/node/store.mjs';
import {absolute,need,codeOf,file,jsonFile,sha} from './recovery-files.mjs';
export const API_PASS_RECOVERY_CONFIG_SCHEMA='stellar-forge.sf101.api-customer-recovery-config.v1';
export const API_PASS_RECOVERY_LAUNCH_SCHEMA='stellar-forge.sf101.api-customer-recovery-launch.v1';
const ENTRY=fileURLToPath(import.meta.url);
const HELP=[
 'api-pass-recovery configure --directory ABS --out ABS [--source-config ABS --state-root ABS --agent-directory ABS]',
 'api-pass-recovery serve --config ABS [--port 0]',
 'api-pass-recovery review --config ABS',
 'api-pass-recovery start --config ABS --request ABS_JSON',
 'api-pass-recovery resume|inspect|open-result|files --config ABS --request-id UUID',
 'api-pass-recovery list --config ABS [--offset 0 --limit 50]',
 'api-pass-recovery read --config ABS --request-id UUID --name NAME [--offset 0 --limit 262144]',
 '',
 'Stop the original customer and agent writers before review/capture. Capture keeps',
 'the original managed Buyer ledger, keys, customer files, agent journals and inbox.',
 'Restore requires a completed VERIFY request in this same journal and the original',
 'empty state-root path. No command here submits an API call or purchase.',
 'Passphrases and customer claim tokens are supplied only through named host environment variables.',
].join('\n');
export async function readApiPassRecoveryConfig(path){
 path=absolute(path);const r=await jsonFile(path,65536),v=r.value;
 need(v?.schema===API_PASS_RECOVERY_CONFIG_SCHEMA&&Object.keys(v).every(k=>['schema','directory','source'].includes(k)),'API_RECOVERY_CONFIGURATION_INVALID');
 return {config:{directory:absolute(v.directory),...(v.source?{source:recoverySource(v.source)}:{})},configFile:path,configSha256:r.sha256};
}
export async function serveConfiguredApiPassRecovery({configFile,port=0,environment=process.env}={}){
 const selected=await readApiPassRecoveryConfig(configFile),recovery=await openApiPassRecovery({...selected.config,environment});
 const launchFile=join(recovery.directory,'recovery-launch.json');let app,launch,stopped=false;
 const beforeRelease=async()=>{if(launch&&!stopped){await writeJson(launchFile,{...launch,status:'STOPPED',stoppedAt:new Date().toISOString()});stopped=true;}};
 try{
  app=await startApiPassRecoveryServer({recovery,port,environment,beforeRelease});
  const entry={sha256:sha(await readFile(ENTRY))};
  launch={schema:API_PASS_RECOVERY_LAUNCH_SCHEMA,status:'LISTENING',instanceId:randomUUID(),journalId:recovery.journalId,directory:recovery.directory,
   configFile:selected.configFile,configSha256:selected.configSha256,url:app.url,processId:process.pid,startedAt:new Date().toISOString(),
   source:{entry:ENTRY,sha256:entry.sha256},sourceConfigured:!!selected.config.source};
  await writeJson(launchFile,launch);return {...app,launch,launchFile};
 }catch(e){
  const owner=app??recovery;try{await owner.close();}catch(closeError){Object.defineProperty(e,'customerWorkspaceRecovery',{value:{close:()=>owner.close(),error:codeOf(closeError)}});}throw e;
 }
}
function argumentsOf(argv){
 const command=argv.shift()??'help',o={};
 while(argv.length){const flag=argv.shift();need(/^--[a-z][a-z-]*$/.test(flag)&&o[flag]===undefined&&typeof argv[0]==='string','API_RECOVERY_OPTION_INVALID');o[flag]=argv.shift();}
 return {command,o};
}
export async function main(argv=process.argv.slice(2)){
 const {command,o}=argumentsOf([...argv]);
 if(['help','--help','-h'].includes(command)){process.stdout.write(HELP+'\n');return;}
 const allowed=command==='configure'?['--directory','--out','--source-config','--state-root','--agent-directory']:command==='serve'?['--config','--port']:
  command==='start'?['--config','--request']:command==='review'?['--config']:command==='list'?['--config','--offset','--limit']:
  command==='read'?['--config','--request-id','--name','--offset','--limit']:['--config','--request-id'];
 need(Object.keys(o).every(k=>allowed.includes(k)),'API_RECOVERY_OPTION_INVALID');
 if(command==='configure'){
  need(Boolean(o['--source-config'])===Boolean(o['--state-root'])&&(!o['--agent-directory']||o['--source-config']),'API_RECOVERY_SOURCE_REQUIRED');
  const value={schema:API_PASS_RECOVERY_CONFIG_SCHEMA,directory:absolute(o['--directory']),...(o['--source-config']?{source:recoverySource({configFile:o['--source-config'],stateRoot:o['--state-root'],...(o['--agent-directory']?{agentDirectory:o['--agent-directory']}:{})})}:{})};
  const out=absolute(o['--out']);await privateDirectory(dirname(out));await writeJson(out,value,{exclusive:true});
  process.stdout.write(JSON.stringify({configFile:out,configSha256:(await file(out)).sha256})+'\n');return;
 }
 if(command==='serve')return runCustomerWorkspaceLifetime(()=>serveConfiguredApiPassRecovery({configFile:o['--config'],port:Number(o['--port']??0)}),{describe:app=>app.launch});
 const selected=await readApiPassRecoveryConfig(o['--config']),r=await openApiPassRecovery(selected.config);
 try{
  let result;
  if(command==='review')result=await r.review();
  else if(command==='list')result=await r.list({offset:Number(o['--offset']??0),limit:Number(o['--limit']??50)});
  else if(command==='start'){const input=(await jsonFile(absolute(o['--request']),65536)).value;result=await r.start(input);result=await r.wait(result.requestId);}
  else if(command==='resume'){result=await r.resume(o['--request-id']);result=await r.wait(result.requestId);}
  else if(command==='inspect')result=await r.inspect(o['--request-id']);
  else if(command==='open-result')result=await r.openResult(o['--request-id']);
  else if(command==='files')result=await r.encryptedFiles(o['--request-id']);
  else if(command==='read')result=await r.readEncryptedFile(o['--request-id'],{name:o['--name'],offset:Number(o['--offset']??0),limit:Number(o['--limit']??262144)});
  else need(false,'API_RECOVERY_COMMAND_INVALID');
  process.stdout.write(JSON.stringify(result)+'\n');if(result.state&&result.state!=='COMPLETED')process.exitCode=1;
 }finally{await r.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(JSON.stringify({error:codeOf(e)})+'\n');process.exitCode=1;});
