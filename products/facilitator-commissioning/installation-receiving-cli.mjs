#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Borrow the original Grant services and continue the selected complete Installation.
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GrantWorkspaceClient,inspectGrantAgentBinding} from '../../stellar/scf_2026/sf47_budget_model/workspace/agent-client.mjs';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
import {openInstallationReceiving,RECEIVING_SCHEMA} from './installation-receiving.mjs';

export const HOST_SCHEMA='stellar-forge.facilitator-installation-receiving-host.v1';
const HASH=/^[a-f0-9]{64}$/,ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'INSTALLATION_RECEIVING_INPUT'});};
function exact(x,allowed,required=allowed){need(object(x)&&Object.keys(x).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(x,k)),'Use the complete declared host configuration.');}
function path(value,base){need(typeof value==='string'&&value.length>0&&value.length<=4000&&!/[\x00-\x1f]/.test(value),'Select an actual host-owned path.');return resolve(base,value);}
const usage=[
'facilitator-installation-receive --connection HOST.json preview --preparation ALIAS --operation UUID --actor ACTUAL_OPERATOR --note REASON --receiving-name NAME',
'facilitator-installation-receive --connection HOST.json save|export|receive|show --operation UUID [--output NEW_FILE.json]',
'facilitator-installation-receive --connection HOST.json file --operation UUID --file DECLARED_NAME --output NEW_COMPLETE_FILE',
'facilitator-installation-receive --connection HOST.json list [--output NEW_FILE.json]',
'The host configuration selects existing source and receiving services only. It cannot authorize another service start.'
].join('\n');

export async function readInstallationReceivingHost(filename){
  const selected=resolve(filename),base=dirname(selected);
  const raw=await readWorkflowSeriesPrivateFile(selected,1024*1024);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  exact(value,['schema','directory','source','receiving','preparations']);
  need(value.schema===HOST_SCHEMA,'Select the original Installation receiving host schema.');
  const bindings={};
  for(const key of ['source','receiving']){
    const v=value[key];
    exact(v,['directory','scenarioFile','pythonExecutable','allowStart','label'],['directory','allowStart','label']);
    need(v.allowStart===false,'This integration borrows the existing Grant service; allowStart must be false.');
    const selected={directory:path(v.directory,base),allowStart:false,label:v.label,
      ...(v.scenarioFile?{scenarioFile:path(v.scenarioFile,base)}:{}),
      ...(v.pythonExecutable?{pythonExecutable:path(v.pythonExecutable,base)}:{})};
    bindings[key]=await inspectGrantAgentBinding(selected);
  }
  need(bindings.source.directory!==bindings.receiving.directory,'Select a distinct receiving workspace.');
  const directory=path(value.directory,base);
  need(directory!==bindings.source.directory&&directory!==bindings.receiving.directory,
    'Use a separate receiving-journal directory, not either original workspace root.');
  exact(value.preparations,Object.keys(value.preparations));
  const preparations=Object.create(null);
  for(const [alias,v]of Object.entries(value.preparations)){
    need(ALIAS.test(alias),'Choose a stable lowercase preparation alias.');
    exact(v,['directory','sha256']);need(HASH.test(v.sha256),'Pin the complete actual INSTALLATION_PREPARATION.json SHA256.');
    preparations[alias]={directory:path(v.directory,base),sha256:v.sha256};
  }
  return{schema:HOST_SCHEMA,directory,...bindings,preparations};
}
function parse(argv){
  if(argv.length===1&&['--help','help','-h'].includes(argv[0]))return{help:true};
  const values={},commands=['preview','save','export','receive','show','list','file'];
  let action;
  const fields=['connection','preparation','operation','actor','note','receiving-name','file','output'];
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(commands.includes(arg)&&!action){action=arg;continue;}
    need(arg.startsWith('--')&&fields.includes(arg.slice(2))&&values[arg.slice(2)]===undefined&&argv[i+1]!==undefined,
      usage);
    values[arg.slice(2)]=argv[++i];
  }
  need(action&&values.connection,usage);
  const allowed={preview:['connection','preparation','operation','actor','note','receiving-name','output'],
    save:['connection','operation','output'],export:['connection','operation','output'],
    receive:['connection','operation','output'],show:['connection','operation','output'],
    list:['connection','output'],file:['connection','operation','file','output']}[action];
  need(Object.keys(values).every(x=>allowed.includes(x)),usage);
  const required=action==='preview'?['preparation','operation','actor','note','receiving-name']:
    action==='list'?[]:action==='file'?['operation','file','output']:['operation'];
  need(required.every(x=>typeof values[x]==='string'&&values[x].length>0),usage);
  return{action,...values};
}
function within(root,filename){const r=relative(root,filename);return r===''||r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!r.startsWith('/');}
function outputPath(name,host,connection){
  const selected=resolve(name);
  for(const root of [host.directory,host.source.directory,host.receiving.directory,...Object.values(host.preparations).map(x=>x.directory)])
    need(!within(root,selected),'Choose an output outside original workspaces, preparations and the receiving journal.');
  need(selected!==resolve(connection),'Do not replace the original host configuration.');
  return selected;
}
export async function installationReceivingCLI(argv){
  const args=parse(argv);if(args.help)return{help:usage};
  const host=await readInstallationReceivingHost(args.connection);
  const destination=args.output?outputPath(args.output,host,args.connection):null;
  if(destination)await workflowSeriesPrivateDirectory(dirname(destination));
  const sourceClient=new GrantWorkspaceClient(host.source),receivingClient=new GrantWorkspaceClient(host.receiving);
  let bridge,result,primary;
  try{
    bridge=await openInstallationReceiving({directory:host.directory,sourceClient,receivingClient,
      sourceBinding:host.source,receivingBinding:host.receiving});
    if(['preview','save','export'].includes(args.action))await sourceClient.open({expectedSelectionSha256:host.source.selectionSha256});
    if(args.action==='receive')await receivingClient.open({expectedSelectionSha256:host.receiving.selectionSha256});
    if(args.action==='preview'){
      const selected=host.preparations[args.preparation];need(selected,'Choose an original host-declared preparation alias.');
      result=await bridge.prepare({operationId:args.operation,preparationDirectory:selected.directory,
        expectedPreparationSha256:selected.sha256,actor:args.actor,note:args.note,receivingName:args['receiving-name']});
    }else if(args.action==='show')result=await bridge.read(args.operation);
    else if(args.action==='list')result=await bridge.list();
    else if(args.action==='file')result=await bridge.file(args.operation,args.file);
    else result=await bridge[args.action](args.operation);
    if(args.output){
      const bytes=args.action==='file'?result.body:Buffer.from(JSON.stringify(result,null,2)+'\n');
      const saved=await writeConsoleWorkflowFile(destination,bytes);
      result={schema:RECEIVING_SCHEMA,action:args.action,...(args.operation?{operationId:args.operation}:{}),
        output:saved,...(args.action==='file'?{filename:result.filename,contentType:result.contentType}:{})};
    }
  }catch(error){primary=error;}
  finally{
    const errors=[];
    if(bridge)try{await bridge.close();}catch(error){errors.push(error);}
    // Only these freshly constructed borrowed clients belong to this CLI.
    // allowStart:false ensures close cannot stop the original Grant service.
    for(const client of [sourceClient,receivingClient])try{await client.close();}catch(error){errors.push(error);}
    if(primary&&errors.length)primary=new AggregateError([primary,...errors],'The original operation and borrowed-client close need recovery.');
    else if(!primary&&errors.length)primary=new AggregateError(errors,'The original borrowed-client close needs recovery.');
  }
  if(primary)throw primary;
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  installationReceivingCLI(process.argv.slice(2)).then(result=>{
    process.stdout.write((result.help??JSON.stringify(result,null,2))+'\n');
  }).catch(error=>{
    process.stderr.write(JSON.stringify({state:'INTERRUPTED',code:error.code??null,message:error.message,
      ...(error.errors?{errors:error.errors.map(e=>({code:e.code??null,message:e.message}))}:{})})+'\n');
    process.exitCode=1;
  });
}
