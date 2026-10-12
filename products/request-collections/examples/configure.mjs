#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Prepare explicit private JSON inputs for the original collection commands.
// This example never starts a service, initializes buyer state, or restores data.
import {createHash} from 'node:crypto';
import {mkdir,open,readFile,lstat,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const SCHEMA='tjlabs.request-collections.example-layout.v1';
const PROFILE='stellar-forge.mcp-native-collection-recovery-profile.v1';
const ALIAS=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const PASS_ENV=/^[A-Z][A-Z0-9_]{4,63}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const encode=value=>JSON.stringify(value,null,2)+'\n';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function need(ok,message){if(!ok)throw new Error(message);}
function fields(value,keys,name){
  need(plain(value),name+' must be an object');
  need(Object.keys(value).every(key=>keys.includes(key)),name+' contains an unknown field');
}
function absolute(value,name){
  need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&
    value!=='/'&&!value.includes('\0'),name+' must be a canonical absolute path');
  return value;
}
function inside(root,path){
  const value=relative(root,path);
  return value===''||(!value.startsWith('..'+sep)&&value!=='..'&&!isAbsolute(value));
}
function separate(a,b,name){
  need(!inside(a,b)&&!inside(b,a),name+' must be disjoint');
}
function named(value,name){
  need(typeof value==='string'&&ALIAS.test(value),name+' must be an original alias');
  return value;
}
function pathMap(value,name){
  need(plain(value)&&Object.keys(value).length<=500,name+' must be an alias-to-path object');
  return Object.fromEntries(Object.entries(value).map(([key,path])=>
    [named(key,name+' alias'),absolute(path,name+'.'+key)]));
}

/** Produce configuration bytes only; the original native registration validates live state. */
export function configurationFiles(selection,directory){
  fields(selection,[
    'schema','label','stateRoot','collectionsDirectory','inboxDirectory','collectionAlias',
    'profileAlias','passEnv','python','sources','buyers','source','receiver'
  ],'selection');
  need(selection.schema===SCHEMA,'Select the documented layout schema');
  need(typeof selection.label==='string'&&selection.label.length<=200,'label must be at most 200 characters');
  const stateRoot=absolute(selection.stateRoot,'stateRoot');
  const out=absolute(directory,'output directory');
  const collectionsDirectory=absolute(selection.collectionsDirectory,'collectionsDirectory');
  const inboxDirectory=absolute(selection.inboxDirectory,'inboxDirectory');
  need(inside(stateRoot,collectionsDirectory)&&inside(stateRoot,inboxDirectory),
    'The original collection store and inbox must be inside stateRoot');
  separate(collectionsDirectory,inboxDirectory,'The collection store and inbox');
  const collectionAlias=named(selection.collectionAlias,'collectionAlias');
  const profileAlias=named(selection.profileAlias,'profileAlias');
  need(PASS_ENV.test(selection.passEnv??''),'passEnv must name an existing host environment variable');
  const python=absolute(selection.python,'python');
  const sources=pathMap(selection.sources,'sources'),buyers=pathMap(selection.buyers,'buyers');
  for(const path of [...Object.values(sources),...Object.values(buyers)])
    need(inside(stateRoot,path),'Selected original sources and buyers must be inside stateRoot');
  fields(selection.source,['connectionFile','mcpDirectory','bundle','recoveryAlias'],'source');
  fields(selection.receiver,[
    'connectionFile','mcpDirectory','journalDirectory','bundle','recoveryAlias','collectionAlias'
  ],'receiver');
  const source={
    connectionFile:absolute(selection.source.connectionFile,'source.connectionFile'),
    mcpDirectory:absolute(selection.source.mcpDirectory,'source.mcpDirectory'),
    bundle:absolute(selection.source.bundle,'source.bundle'),
    recoveryAlias:named(selection.source.recoveryAlias,'source.recoveryAlias')
  };
  const receiver={
    connectionFile:absolute(selection.receiver.connectionFile,'receiver.connectionFile'),
    mcpDirectory:absolute(selection.receiver.mcpDirectory,'receiver.mcpDirectory'),
    journalDirectory:absolute(selection.receiver.journalDirectory,'receiver.journalDirectory'),
    bundle:absolute(selection.receiver.bundle,'receiver.bundle'),
    recoveryAlias:named(selection.receiver.recoveryAlias,'receiver.recoveryAlias'),
    collectionAlias:named(selection.receiver.collectionAlias,'receiver.collectionAlias')
  };
  for(const [name,path]of Object.entries({
    output:out,sourceMcp:source.mcpDirectory,sourceConnection:source.connectionFile,
    sourceBundle:source.bundle,receiverMcp:receiver.mcpDirectory,
    receiverConnection:receiver.connectionFile,receiverJournal:receiver.journalDirectory,
    receiverBundle:receiver.bundle
  }))separate(stateRoot,path,'stateRoot and '+name);
  for(const [name,path]of Object.entries({
    sourceMcp:source.mcpDirectory,sourceBundle:source.bundle,
    receiverMcp:receiver.mcpDirectory,receiverBundle:receiver.bundle,
    receiverJournal:receiver.journalDirectory
  }))separate(out,path,'output and '+name);
  separate(receiver.journalDirectory,receiver.bundle,'Receiving journal and encrypted bundle');
  separate(receiver.mcpDirectory,receiver.journalDirectory,'Receiving MCP directory and recovery journal');
  separate(source.mcpDirectory,source.bundle,'Source MCP directory and encrypted bundle');
  separate(receiver.mcpDirectory,receiver.bundle,'Receiving MCP directory and encrypted bundle');
  separate(source.connectionFile,out,'Source launch file and configuration directory');
  separate(receiver.connectionFile,out,'Receiving launch file and configuration directory');
  const common={schema:PROFILE,stateRoot,passEnv:selection.passEnv,python};
  const value={
    'source-collection-registration.json':{
      name:collectionAlias,connectionFile:source.connectionFile,sources,buyers
    },
    'source-recovery-profile.json':{
      ...common,label:selection.label+' — capture',bundle:source.bundle,kinds:['SNAPSHOT','VERIFY']
    },
    'receiving-recovery-profile.json':{
      ...common,label:selection.label+' — receive',bundle:receiver.bundle,kinds:['VERIFY','RESTORE'],
      afterRestore:{name:receiver.collectionAlias,sources,buyers}
    },
    'source-recovery-registration.json':{
      name:source.recoveryAlias,connectionFile:source.connectionFile,
      profiles:{[profileAlias]:join(out,'source-recovery-profile.json')}
    },
    'receiving-recovery-registration.json':{
      name:receiver.recoveryAlias,connectionFile:receiver.connectionFile,
      profiles:{[profileAlias]:join(out,'receiving-recovery-profile.json')}
    },
    'source-profiles.call.json':{
      action:'collection-recovery',recoveryWorkspace:source.recoveryAlias,
      recoveryOperation:'profiles',recoveryRequest:{offset:0,limit:25}
    },
    'receiving-profiles.call.json':{
      action:'collection-recovery',recoveryWorkspace:receiver.recoveryAlias,
      recoveryOperation:'profiles',recoveryRequest:{offset:0,limit:25}
    },
    'collections.call.json':{
      action:'collections',collectionWorkspace:collectionAlias,
      collectionOperation:'collections',collectionRequest:{offset:0,limit:25}
    }
  };
  return Object.fromEntries(Object.entries(value).map(([name,data])=>[name,encode(data)]));
}

async function writePrivate(path,bytes){
  const handle=await open(path,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write(
      'Prepare original Request Collections registration/profile JSON.\n'+
      'node products/request-collections/examples/configure.mjs --selection /ABS/layout.json --out /ABS/NEW_CONFIG_DIRECTORY\n'+
      'Edit layout.example.json to the actual original paths first. The existing output parent must be private.\n'+
      'This command only creates configuration files; register them with the maintained native commands.\n');
    return;
  }
  need(args.length===4,'Use --selection FILE --out NEW_DIRECTORY');
  const options={};
  for(let i=0;i<args.length;i+=2){
    need(['--selection','--out'].includes(args[i])&&!Object.hasOwn(options,args[i])&&args[i+1],
      'Use each documented option once');
    options[args[i]]=args[i+1];
  }
  const selectionPath=absolute(options['--selection'],'selection file');
  const directory=absolute(options['--out'],'output directory');
  const info=await lstat(selectionPath);
  need(info.isFile()&&!info.isSymbolicLink()&&info.size<=65536,
    'Select a regular layout JSON file of at most 65,536 bytes');
  const raw=await readFile(selectionPath);
  need(raw.length<=65536,'Layout JSON exceeds 65,536 bytes');
  const selection=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  const files=configurationFiles(selection,directory);
  need(!inside(directory,selectionPath),'The selected layout must be outside the new output directory');
  const parent=dirname(directory),parentInfo=await lstat(parent);
  need(parentInfo.isDirectory()&&await realpath(parent)===parent,'Output parent must be an existing canonical directory');
  need((parentInfo.mode&0o077)===0,'Output parent must be private (0700)');
  await mkdir(directory,{mode:0o700});
  for(const [name,text]of Object.entries(files))await writePrivate(join(directory,name),text);
  const manifest={
    schema:'tjlabs.request-collections.configuration-files.v1',
    selectionSha256:sha(raw),directory,
    files:Object.entries(files).map(([filename,text])=>({
      filename,bytes:Buffer.byteLength(text),sha256:sha(Buffer.from(text))
    })),
    originalStateCreated:false,listenerStarted:false,operationStarted:false,
    note:'Native registration still verifies the original live listener, profiles, source files and buyer directories.'
  };
  await writePrivate(join(directory,'configuration-manifest.json'),encode(manifest));
  const folder=await open(directory,'r');
  try{await folder.sync();}finally{await folder.close();}
  process.stdout.write(encode(manifest));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv.slice(2)).catch(error=>{
    process.stderr.write('Configuration preparation failed: '+error.message+
      '\nAny created configuration directory is retained for inspection; no native operation was started.\n');
    process.exitCode=2;
  });
}
