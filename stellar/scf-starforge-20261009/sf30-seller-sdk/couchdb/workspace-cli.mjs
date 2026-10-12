#!/usr/bin/env node
// MIT. CLI for the same original operator, managed listener and receiving store.
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { initializeCouchdbWorkspace } from './operator.mjs';
import { startCouchdbWorkspace } from './server.mjs';
import { connectCouchdbWorkspace } from './client.mjs';
import { receiveCouchdbProject, inspectCouchdbProject } from './portable.mjs';
import { need, UUID, HASH, MAX_BODY, integer, only, readPrivate, safeIssue } from './common.mjs';
function argumentsFor(argv){
  const options={},words=[];
  for(let i=0;i<argv.length;i++){
    const word=argv[i];if(word==='--wait'){options.wait=true;continue;}
    if(word.startsWith('--')){need(!Object.hasOwn(options,word.slice(2))&&typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'COUCHDB_CLI_OPTION_INVALID');options[word.slice(2)]=argv[++i];}
    else words.push(word);
  }
  return {options,words};
}
const out=value=>process.stdout.write(JSON.stringify(value)+'\n');
export async function couchdbWorkspaceMain(argv=process.argv.slice(2)){
  const {options,words}=argumentsFor(!argv.length||argv.length===1&&['--help','-h'].includes(argv[0])?['help']:argv),command=words[0]??'help';
  if(command==='help'){out({commands:{
    init:'init --directory ABS [--id ORIGINAL_UUID]',
    serve:'serve --directory ABS [--expected-workspace-id UUID] [--port 0] [--connection-file ABS]',
    action:'action COMMAND --connection ABS --input PRIVATE_JSON --operation UUID [--wait]',
    query:'query NAME --connection ABS [--input PRIVATE_JSON]',
    resume:'resume UUID --connection ABS [--wait]',
    cancel:'cancel UUID --connection ABS',
    download:'download KIND --connection ABS --input PRIVATE_JSON --directory ABS --operation UUID --sha256 SHA --bytes N',
    receive:'receive --archive ABS --sha256 SHA --directory ABS',
    inspect:'inspect --archive ABS --sha256 SHA'
  },credentials:'Host environment variables referenced by the saved native connection; optional COUCHDB_PYTHON for the original archive helper.'});return;}
  if(command==='init'){only(options,['directory','id'],'COUCHDB_CLI_OPTION_INVALID');need(options.directory,'COUCHDB_DIRECTORY_REQUIRED');out(await initializeCouchdbWorkspace({directory:resolve(options.directory),id:options.id}));return;}
  if(command==='serve'){
    only(options,['directory','expected-workspace-id','port','connection-file'],'COUCHDB_CLI_OPTION_INVALID');need(options.directory,'COUCHDB_DIRECTORY_REQUIRED');
    const server=await startCouchdbWorkspace({directory:resolve(options.directory),expectedWorkspaceId:options['expected-workspace-id'],port:options.port===undefined?0:Number(options.port),connectionFile:options['connection-file']});
    out(server.startup);let closing;
    const close=()=>{if(!closing)closing=server.close().then(()=>{process.exitCode=0;},error=>{out({error:safeIssue(error)});process.exitCode=1;});};
    process.once('SIGTERM',close);process.once('SIGINT',close);return server;
  }
  if(command==='receive'||command==='inspect'){
    only(options,command==='receive'?['archive','sha256','directory']:['archive','sha256'],'COUCHDB_CLI_OPTION_INVALID');
    const input={file:resolve(options.archive),expectedSha256:options.sha256};
    out(await (command==='receive'?receiveCouchdbProject({...input,directory:resolve(options.directory)}):inspectCouchdbProject(input)));return;
  }
  only(options,['connection','input','operation','wait','directory','sha256','bytes','timeout'],'COUCHDB_CLI_OPTION_INVALID');
  need(options.connection,'COUCHDB_CONNECTION_REQUIRED');
  const client=await connectCouchdbWorkspace({connectionFile:resolve(options.connection)});
  const input=options.input?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readPrivate(resolve(options.input),MAX_BODY))):{};
  if(command==='query'){out(await client.query(words[1],input));return;}
  if(command==='action'){need(UUID.test(options.operation??''),'COUCHDB_OPERATION_ID_REQUIRED');out(await client.action(words[1],input,{id:options.operation,wait:options.wait??false,timeoutMs:options.timeout?Number(options.timeout):300000}));return;}
  if(command==='resume'){out(await client.resume(words[1],{wait:options.wait??false,timeoutMs:options.timeout?Number(options.timeout):300000}));return;}
  if(command==='cancel'){out(await client.cancel(words[1]));return;}
  if(command==='download'){out(await client.download(words[1],input,{directory:resolve(options.directory),id:options.operation,expectedSha256:options.sha256,expectedBytes:Number(options.bytes)}));return;}
  need(false,'COUCHDB_CLI_COMMAND_INVALID');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)couchdbWorkspaceMain().catch(error=>{process.stderr.write(JSON.stringify({error:safeIssue(error)})+'\n');process.exitCode=1;});
