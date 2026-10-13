#!/usr/bin/env node
// MIT. One original merchant owner for query studies, complete files and its borrowed browser.
import {constants} from 'node:fs';
import {open,realpath,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONFIG_SCHEMA,readMerchantConfig} from './config.mjs';
import {exact,line,writePrivate} from './host-files.mjs';
import {readDatasetStudiesConfiguration} from './dataset-studies.mjs';

export const DATASET_STUDIES_AGENT_BINDING_SCHEMA='stellar-forge.dataset-studies-agent-binding.v1';
export const DATASET_STUDIES_AGENT_STARTUP_SCHEMA='stellar-forge.dataset-studies-agent-startup.v1';
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_CONFIG_BYTES=1024*1024;
const sha256=value=>createHash('sha256').update(value).digest('hex');
function need(condition, code, message) {
  if (condition) return;
  const error = new Error(message ?? code);
  error.code = code;
  throw error;
}
function selectedPort(value, label) {
  need(Number.isSafeInteger(value) && value >= 0 && value <= 65535,
    'DATASET_STUDIES_AGENT_PORT_INVALID', label + ' must be an integer from 0 through 65535.');
  return value;
}
function absoluteDirectory(value) {
  return typeof value === 'string' && value.length > 0 && resolve(value) === value;
}
async function originalConfiguration(path, kind) {
  const canonical = await realpath(resolve(path));
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size > 0 && before.size <= MAX_CONFIG_BYTES,
      'DATASET_STUDIES_AGENT_CONFIG_INVALID', 'Use the original merchant configuration file, no larger than 1 MiB.');
    const bytes = Buffer.allocUnsafe(before.size);
    let position = 0;
    while (position < bytes.length) {
      const result = await handle.read(bytes, position, Math.min(65536, bytes.length - position), position);
      need(result.bytesRead > 0, 'DATASET_STUDIES_AGENT_CONFIG_CHANGED', 'The original configuration changed during reading.');
      position += result.bytesRead;
    }
    const after = await handle.stat();
    need(before.size === after.size && before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs, 'DATASET_STUDIES_AGENT_CONFIG_CHANGED',
      'The original configuration changed during reading.');
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { need(false, 'DATASET_STUDIES_AGENT_CONFIG_INVALID', 'Use the original UTF-8 merchant configuration JSON.'); }
    return { value, identity: { kind, path: canonical, bytes: bytes.length, sha256: sha256(bytes) } };
  } finally { await handle.close(); }
}


function hostPath(value,label){
 need(typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\x00-\x1f\x7f]/.test(value),
  'CONFIGURATION_ERROR',label+' must be a nonempty original host path.');
 return resolve(value);
}
async function syncDirectory(path){const file=await open(path,constants.O_RDONLY);try{await file.sync();}finally{await file.close();}}
export async function initializeDatasetStudiesMerchant(options){
 exact(options,['directory','connection','name'],['directory','connection']);
 const root=hostPath(options.directory,'Merchant directory'),connection=hostPath(options.connection,'Private study connection');
 const name=line(options.name??'Starforge dataset study operator','Merchant name');
 const selected=await readDatasetStudiesConfiguration(connection);
 await mkdir(root,{mode:0o700});
 await (await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')).initReleaseStore(join(root,'releases'));
 await mkdir(join(root,'customer-exports'),{mode:0o700});
 const configuration=join(root,'merchant-mcp.json');
 await writePrivate(configuration,{schema:CONFIG_SCHEMA,name,releaseStore:'./releases',exportsDirectory:'./customer-exports',
  sources:{},datasetStudyConnection:connection});
 await readMerchantConfig(configuration);
 await syncDirectory(root);await syncDirectory(dirname(root));
 return {schema:CONFIG_SCHEMA,configuration,state:'INITIALIZED',datasetStudiesConfigured:true,
  workspaces:Object.entries(selected.workspaces).map(([workspace,item])=>({workspace,label:item.label})),
  authoring:'OPENED_BY_MERCHANT_DATASET_STUDY_OPEN'};
}

/** Configuration bytes and resolved declarations, without opening an engine or study store. */
export async function inspectDatasetStudiesAgentBinding({configPath,workspace}={}){
 need(typeof configPath==='string'&&configPath.length>0&&typeof workspace==='string'&&ALIAS.test(workspace),
  'DATASET_STUDIES_AGENT_SELECTION_REQUIRED','Select the original merchant configuration and declared study workspace alias.');
 const merchant=await originalConfiguration(configPath,'merchant'),configFile=merchant.identity.path;
 need(typeof merchant.value?.datasetStudyConnection==='string'&&merchant.value.datasetStudyConnection.length>0,
  'DATASET_STUDIES_AGENT_CONNECTION_REQUIRED','Declare the original datasetStudyConnection file in this merchant configuration.');
 const connection=await originalConfiguration(resolve(dirname(configFile),merchant.value.datasetStudyConnection),'dataset-studies');
 const originals=[merchant,connection],config=await readMerchantConfig(configFile);
 need(config.datasetStudies?.workspaces&&Object.hasOwn(config.datasetStudies.workspaces,workspace),
  'DATASET_STUDIES_AGENT_WORKSPACE_UNKNOWN','Choose a study alias declared by this merchant host.');
 const selected=config.datasetStudies.workspaces[workspace];
 need(absoluteDirectory(selected.studiesDirectory)&&Boolean(selected.datasetPath)!==Boolean(selected.stateDirectory),
  'DATASET_STUDIES_AGENT_SOURCE_INVALID','Keep the original dataset or service and private studies directory selection.');
 for(const original of originals){
  const current=await originalConfiguration(original.identity.path,original.identity.kind);
  need(JSON.stringify(current.identity)===JSON.stringify(original.identity),
   'DATASET_STUDIES_AGENT_CONFIG_CHANGED','The original configuration changed during inspection; inspect its current declarations.');
 }
 const identity={schema:DATASET_STUDIES_AGENT_BINDING_SCHEMA,configFile,workspace,
  declaration:{label:selected.label,datasetPath:selected.datasetPath??null,stateDirectory:selected.stateDirectory??null,
   resource:selected.resource??null,catalogDirectory:selected.catalogDirectory??null,studiesDirectory:selected.studiesDirectory,
   imports:{...selected.imports}},
  configurationFiles:originals.map(original=>original.identity)};
 return {...identity,bindingSha256:sha256(JSON.stringify(identity))};
}

/** Start one authenticated MCP host and borrow the exact opened native browser. */
export async function startDatasetStudiesAgentWorkspace({
 configPath,workspace,port=0,mcpPort=0,tokenEnv='MCP_ACCESS_TOKEN',environment=process.env,expectedBindingSha256
}={}){
 selectedPort(port,'Browser port');selectedPort(mcpPort,'MCP port');
 need(typeof tokenEnv==='string'&&/^[A-Z_][A-Z0-9_]{0,127}$/.test(tokenEnv),
  'DATASET_STUDIES_AGENT_TOKEN_ENV_INVALID','Select the existing environment name for MCP authentication.');
 need(expectedBindingSha256===undefined||typeof expectedBindingSha256==='string'&&HASH.test(expectedBindingSha256),
  'DATASET_STUDIES_AGENT_BINDING_INVALID','Use the SHA-256 returned by original configuration inspection.');
 const binding=await inspectDatasetStudiesAgentBinding({configPath,workspace});
 need(expectedBindingSha256===undefined||expectedBindingSha256===binding.bindingSha256,
  'DATASET_STUDIES_AGENT_BINDING_CHANGED','Inspect the current original configuration before starting its workspace.');
 const {startMerchantMcp}=await import('./serve.mjs');
 const host=await startMerchantMcp({configPath:binding.configFile,port:mcpPort,tokenEnv,environment});
 let closing;
 const close=()=>{
  if(!closing)closing=Promise.resolve().then(()=>host.close()).catch(error=>{closing=null;throw error;});
  return closing;
 };
 try{
  const current=await inspectDatasetStudiesAgentBinding({configPath:binding.configFile,workspace});
  need(current.bindingSha256===binding.bindingSha256,
   'DATASET_STUDIES_AGENT_BINDING_CHANGED','The original declaration changed while its owner was starting.');
  const opened=await host.operator.call('merchant_dataset_study_open',{workspace});
  need(opened.workspace===workspace&&opened.state==='OPEN'&&UUID.test(opened.workspaceId??'')&&UUID.test(opened.instanceId??'')&&
   opened.source?.mode===(binding.declaration.datasetPath?'file':'service')&&
   (binding.declaration.resource===null||(opened.source?.resource??null)===binding.declaration.resource),
   'DATASET_STUDIES_AGENT_STARTUP_CHANGED','The opened native workspace must match the selected original source declaration.');
  const identity={workspace,workspaceId:opened.workspaceId,instanceId:opened.instanceId};
  const browser=await host.operator.call('merchant_dataset_study_browser_open',{...identity,port});
  need(browser.workspace===workspace&&browser.workspaceId===opened.workspaceId&&browser.instanceId===opened.instanceId&&
   browser.state==='OPEN'&&typeof browser.url==='string',
   'DATASET_STUDIES_AGENT_BROWSER_CHANGED','The browser must borrow this exact original source and study store.');
  let url;try{url=new URL(browser.url);}catch{need(false,'DATASET_STUDIES_AGENT_BROWSER_CHANGED','The original browser returned an invalid session URL.');}
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&Boolean(url.hash),
   'DATASET_STUDIES_AGENT_BROWSER_CHANGED','Use the original private loopback browser session.');
  const startup={schema:DATASET_STUDIES_AGENT_STARTUP_SCHEMA,status:'DATASET_STUDIES_AGENT_READY',
   configFile:binding.configFile,bindingSha256:binding.bindingSha256,...identity,
   source:opened.source,declaration:binding.declaration,operatorUrl:browser.url,mcpUrl:host.url};
  return {startup,operator:host.operator,server:host.server,url:browser.url,close};
 }catch(error){
  try{await close();}catch(shutdown){
   const retained=new AggregateError([error,shutdown],'Study startup failed and its original owner still needs closing.');
   retained.code='DATASET_STUDIES_AGENT_CLOSE_INCOMPLETE';
   Object.defineProperty(retained,'close',{value:close,enumerable:false});
   throw retained;
  }
  throw error;
 }
}

const HELP=`Dataset query studies with an agent
  starforge dataset-studies-agent inspect --config MERCHANT_JSON --workspace ALIAS
  starforge dataset-studies-agent serve --config MERCHANT_JSON --workspace ALIAS
    [--port 0] [--mcp-port 0] [--token-env MCP_ACCESS_TOKEN]
    [--expected-binding-sha256 SHA256]

Declare datasetStudyConnection in the original merchant configuration.
Serve opens one native source and study store, authenticated MCP and its borrowed
browser. Keep the startup JSON and browser session URL private. Set the selected
MCP token in the original host environment.
`;
function argumentsFor(argv){
 const action=argv[0];
 if(!action||['--help','-h','help'].includes(action))return {help:true};
 need(['inspect','serve'].includes(action),'DATASET_STUDIES_AGENT_ARGUMENT_INVALID','Choose inspect or serve.');
 const allowed=new Set(['--config','--workspace','--port','--mcp-port','--token-env','--expected-binding-sha256']),options=new Map();
 for(let index=1;index<argv.length;index+=2){
  const name=argv[index],value=argv[index+1];
  need(allowed.has(name)&&!options.has(name)&&typeof value==='string'&&value.length>0&&!value.startsWith('--'),
   'DATASET_STUDIES_AGENT_ARGUMENT_INVALID','Use each declared option once with its value.');
  options.set(name,value);
 }
 need(options.has('--config')&&options.has('--workspace'),'DATASET_STUDIES_AGENT_SELECTION_REQUIRED','Select --config and --workspace.');
 if(action==='inspect')need([...options.keys()].every(name=>['--config','--workspace'].includes(name)),
  'DATASET_STUDIES_AGENT_ARGUMENT_INVALID','Inspection accepts only the original configuration and workspace.');
 const port=name=>{const value=options.get(name)??'0';need(/^(0|[1-9]\d*)$/.test(value),'DATASET_STUDIES_AGENT_PORT_INVALID','Choose an integer port.');return selectedPort(Number(value),name);};
 return {action,configPath:options.get('--config'),workspace:options.get('--workspace'),port:port('--port'),mcpPort:port('--mcp-port'),
  tokenEnv:options.get('--token-env')??'MCP_ACCESS_TOKEN',expectedBindingSha256:options.get('--expected-binding-sha256')};
}
export async function main(argv=process.argv.slice(2)){
 const options=argumentsFor(argv);
 if(options.help){process.stdout.write(HELP);return;}
 if(options.action==='inspect'){const result=await inspectDatasetStudiesAgentBinding(options);process.stdout.write(JSON.stringify(result)+'\n');return result;}
 let application;
 try{application=await startDatasetStudiesAgentWorkspace(options);}
 catch(error){
  if(typeof error.close==='function'){
   let retrying=false;
   const retry=async()=>{
    if(retrying)return;retrying=true;
    try{await error.close();process.removeListener('SIGINT',retry);process.removeListener('SIGTERM',retry);}
    catch(closeError){process.stderr.write(JSON.stringify({error:closeError.code??'DATASET_STUDIES_AGENT_CLOSE_INCOMPLETE',message:closeError.message})+'\n');}
    finally{retrying=false;}
   };
   process.on('SIGINT',retry);process.on('SIGTERM',retry);
  }
  throw error;
 }
 let stopping=false;
 const shutdown=async signal=>{
  if(stopping)return;stopping=true;
  try{await application.close();process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);process.exitCode=signal==='SIGINT'?130:143;}
  catch(error){stopping=false;process.stderr.write(JSON.stringify({error:error.code??'DATASET_STUDIES_AGENT_CLOSE_FAILED',message:error.message})+'\n');process.exitCode=1;}
 };
 const interrupt=()=>shutdown('SIGINT'),terminate=()=>shutdown('SIGTERM');
 process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
 process.stdout.write(JSON.stringify(application.startup)+'\n');return application;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 process.stderr.write(JSON.stringify({error:error.code??'DATASET_STUDIES_AGENT_FAILED',message:error.message})+'\n');process.exitCode=1;
});
