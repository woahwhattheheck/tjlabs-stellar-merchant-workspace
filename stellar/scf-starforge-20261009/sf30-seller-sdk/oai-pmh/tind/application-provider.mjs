// MIT. Complete TIND migration in the maintained Applications lifecycle.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { absolute, canonical, digest, need, plain } from '../../../distribution/runtime-workspace/storage.mjs';
import { APPLICATION_PROVIDER_SCHEMA, applicationPreparation, observeApplicationStartup }
  from '../../../distribution/runtime-workspace/application-provider.mjs';

const run = promisify(execFile);
const ROOT = 'stellar/scf-starforge-20261009/sf30-seller-sdk';
const BINDING = 'stellar-forge.tind-managed-binding.v1';
const STARTUP = 'stellar-forge.tind-workspace-launch.v1';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

async function prepare(settings, { inputPath, selectedExecutable, runtimeDirectory, applicationEnvironment }) {
  need(typeof inputPath === 'function' && typeof selectedExecutable === 'function' &&
    typeof applicationEnvironment === 'function', 'APPLICATION_TIND_CONTEXT_REQUIRED');
  const workspace = await inputPath(settings.workspaceDirectory, 'directory', false, true);
  const python = await selectedExecutable(settings.pythonExecutable);
  const { inspectMerchantRuntime } = await import('../../../sf46-release/runtime-package.mjs');
  const selected = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const sourceRoot = await realpath(join(selected.sourceRoot, ROOT));
  const cli = join(sourceRoot, 'oai-pmh', 'tind', 'cli.py');
  const inputs = [workspace, ...python.inputs, await inputPath(cli, 'file')];
  const { environment } = await applicationEnvironment(settings.environmentFile);
  let observed;
  try {
    const output = await run(python.executable, [cli, '--workspace', workspace.path, 'binding'], {
      encoding:'utf8', maxBuffer:131072, timeout:15000, windowsHide:true, env:environment,
    });
    observed = JSON.parse(output.stdout);
  } catch (error) {
    need(false, 'APPLICATION_TIND_BINDING_UNAVAILABLE',
      'Open the original repository workspace with this Python: ' +
      String(error.stderr || error.message || error).trim().slice(0,1500));
  }
  need(plain(observed) && observed.schema === BINDING && observed.workspace === workspace.path &&
    observed.sourceRoot === sourceRoot && plain(observed.workspaceIdentity) && plain(observed.python) &&
    plain(observed.source) && hex(observed.sha256), 'APPLICATION_TIND_BINDING_CHANGED');
  const { sha256, sourceRoot: inspectedSourceRoot, ...core } = observed;
  need(digest(JSON.stringify(canonical(core)) + '\n') === sha256, 'APPLICATION_TIND_BINDING_CHANGED');
  need(await realpath(observed.python.executable) === await realpath(python.executable) &&
    Array.isArray(observed.python.version) && observed.python.version.length === 3 &&
    observed.python.version.every(Number.isSafeInteger) &&
    (observed.python.version[0] > 3 || observed.python.version[0] === 3 && observed.python.version[1] >= 11),
    'APPLICATION_TIND_PYTHON_CHANGED');
  const sourceFiles = Object.entries(observed.source), indexed = new Set(inputs.map(value=>value.path));
  need(sourceFiles.length >= 26 && hex(observed.source['oai-pmh/tind/migration.py']) &&
    hex(observed.source['oai-pmh/tind/native.py']) && hex(observed.source['oai-pmh/workspace.py']) &&
    hex(observed.source['xml/workspace.py']), 'APPLICATION_TIND_SOURCE_INCOMPLETE');
  for (const [relative, expected] of sourceFiles) {
    need(/^(?:oai-pmh\/(?:tind\/)?[A-Za-z0-9_.-]+|xml\/[A-Za-z0-9_.-]+|dataset-handler\.mjs)$/.test(relative) &&
      !relative.split('/').some(part=>!part||part==='.'||part==='..') && hex(expected), 'APPLICATION_TIND_SOURCE_CHANGED');
    const item = await inputPath(join(sourceRoot,relative),'file');
    need(item.sha256===expected,'APPLICATION_TIND_SOURCE_CHANGED','The original TIND source changed during application review.');
    if(!indexed.has(item.path)){indexed.add(item.path);inputs.push(item);}
  }
  const marker = await inputPath(join(workspace.path,'workspace.json'),'file');
  need(marker.sha256===observed.workspaceIdentity.markerSha256 &&
    String(marker.dev)===observed.workspaceIdentity.markerDevice &&
    String(marker.ino)===observed.workspaceIdentity.markerInode &&
    String(workspace.dev)===observed.workspaceIdentity.device &&
    String(workspace.ino)===observed.workspaceIdentity.inode,'APPLICATION_TIND_WORKSPACE_CHANGED');
  inputs.push(marker);
  return {args:['--python',python.executable,'--workspace',workspace.path,'serve',
    '--expected-binding',sha256,'--startup-format','json'],inputs};
}

function selected(request) {
  if(request.command!=='tind-migration'||!Array.isArray(request.args))return null;
  const args=request.args;
  need(args.length===11&&args[0]==='--python'&&args[2]==='--workspace'&&args[4]==='serve','APPLICATION_TIND_STARTUP_CHANGED');
  const options=new Map(), flags=[...args.slice(0,4),...args.slice(5)];
  for(let i=0;i<flags.length;i+=2){
    const key=flags[i],value=flags[i+1];
    need(['--python','--workspace','--expected-binding','--startup-format','--port'].includes(key)&&
      !options.has(key)&&typeof value==='string','APPLICATION_TIND_STARTUP_CHANGED');
    options.set(key,value);
  }
  need(options.size===5&&options.get('--startup-format')==='json'&&hex(options.get('--expected-binding'))&&
    /^(0|[1-9]\d*)$/.test(options.get('--port'))&&Number(options.get('--port'))<=65535,'APPLICATION_TIND_STARTUP_CHANGED');
  return {directory:absolute(options.get('--workspace')),python:absolute(options.get('--python')),
    binding:options.get('--expected-binding'),port:Number(options.get('--port'))};
}

export async function tindStartup(request, text) {
  if(request.command!=='tind-migration'||typeof text!=='string'||text.length>16384||!text.startsWith('{'))return null;
  let value;try{value=JSON.parse(text);}catch{return null;}
  if(!plain(value)||value.schema!==STARTUP||value.status!=='TIND_WORKSPACE_READY')return null;
  const original=selected(request);
  need(original&&value.workspace===original.directory&&value.bindingSha256===original.binding&&
    plain(value.python)&&Array.isArray(value.python.version)&&typeof value.sourceRoot==='string'&&
    Number.isSafeInteger(value.pid)&&value.pid>0,'APPLICATION_TIND_STARTUP_CHANGED');
  let consoleUrl;try{consoleUrl=new URL(value.console);}catch{need(false,'APPLICATION_TIND_STARTUP_CHANGED');}
  const port=Number(consoleUrl.port||80);
  need(consoleUrl.protocol==='http:'&&consoleUrl.hostname==='127.0.0.1'&&port>=1&&port<=65535&&
    (!original.port||port===original.port)&&!consoleUrl.username&&!consoleUrl.password&&!consoleUrl.search&&
    consoleUrl.pathname==='/'&&/^[a-f0-9]{32}$/.test(consoleUrl.hash.slice(1))&&value.url===consoleUrl.href,
    'APPLICATION_TIND_STARTUP_CHANGED');
  const response=await fetch(new URL('/api/launch',consoleUrl),{redirect:'error',
    headers:{'X-Tind-Session':consoleUrl.hash.slice(1)},signal:AbortSignal.timeout(5000)});
  need(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')&&
    /^\d+$/.test(response.headers.get('content-length')??'')&&
    Number(response.headers.get('content-length'))<=16384,'APPLICATION_TIND_STARTUP_UNAVAILABLE');
  const active=await response.json();
  need(JSON.stringify(canonical(active))===JSON.stringify(canonical(value)),'APPLICATION_TIND_STARTUP_CHANGED');
  return {url:consoleUrl.href,links:[{id:'tind-migration',label:'Open TIND migration',url:consoleUrl.href}],
    original:{schema:STARTUP,workspace:original.directory,bindingSha256:original.binding,
      sourceRoot:value.sourceRoot,python:value.python,pid:value.pid}};
}

export default {
  schema:APPLICATION_PROVIDER_SCHEMA,id:'tind-migration',order:1028,
  catalog({common,field}){
    return [{id:'tind-migration',command:'tind-migration',title:'TIND scholarly migration',terminal:false,
      requiredSource:ROOT+'/oai-pmh/tind/managed.py',
      description:'Map complete repository editions into native TIND records, receive original files and native jobs, preserve staff edits and deliver the complete editable migration.',
      fields:[
        field('workspaceDirectory','Original repository workspace','path',true,'Choose the private workspace initialized or received by the original OAI command.'),
        field('pythonExecutable','Existing Python executable','path',true,'Absolute Python 3.11+ executable with Expat 2.6+; the selected environment stays in use.'),
        ...common,
      ]}];
  },
  async prepare(_type,settings,context){
    const base=applicationPreparation(settings,context.inputPath),original=await prepare(settings,context);
    base.args.push(...original.args);base.inputs.push(...original.inputs);
    return {args:base.args,inputs:base.inputs,createDirectories:base.createDirectories};
  },
  resourceKey(_type,settings,{hash}){return hash({family:'xml',directory:settings.workspaceDirectory});},
  matchRequest(request){return !request.pythonCommand&&request.command==='tind-migration';},
  createObserver(request,directory){
    return observeApplicationStartup(request,directory,text=>text.startsWith('{')?()=>tindStartup(request,text):null);
  },
};
