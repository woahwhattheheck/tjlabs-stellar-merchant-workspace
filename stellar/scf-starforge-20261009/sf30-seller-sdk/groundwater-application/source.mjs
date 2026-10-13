// SPDX-License-Identifier: MIT
// Bind the complete selected application, existing interpreter and original scientific database.
import {constants} from 'node:fs';
import {open,lstat,realpath,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {GroundwaterWorkspace} from '../groundwater/index.mjs';
import {inspectScientificWorkspace,inspectReportPython,inspectReportLaunchSource} from '../groundwater-report/managed.mjs';
import {need,absolute,directory,read,readJSON,sha,canonical,fields,text,child} from '../groundwater-report/common.mjs';

export {need,absolute,directory,read,readJSON,sha,canonical,fields,text};
export const APP='stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-application';
export const SCIENCE='stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater';
export const SCHEMA='stellar-forge.groundwater-application.v1';
export const STARTUP='stellar-forge.groundwater-application-startup.v1';
export const EXECUTED_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
export const HASH=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const hash=value=>sha(canonical(value));
export const same=(a,b)=>canonical(a)===canonical(b);
export const inode=stat=>({dev:String(stat.dev),ino:String(stat.ino)});
export const disjoint=(a,b)=>a!==b&&!a.startsWith(b+'/')&&!b.startsWith(a+'/');
const stable=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);
export function checkExpected(actual,expected,label){
  need(expected===undefined||HASH.test(expected)&&actual===expected,
    'GROUNDWATER_APPLICATION_SELECTION_CHANGED','Review the current original '+label+' before continuing.');
}
export async function fileIdentity(file,{maximum=2*1024**3,expected}={}){
  absolute(file);need(await realpath(file)===file,'GROUNDWATER_APPLICATION_REAL_FILE','Select an original regular file without links.');
  const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{
    const first=await handle.stat({bigint:true});
    need(first.isFile()&&first.size>=0n&&first.size<=BigInt(maximum),'GROUNDWATER_APPLICATION_FILE_BOUND','The original file is outside the supported byte bound.',413);
    const digest=createHash('sha256'),buffer=Buffer.alloc(256*1024);let position=0;
    while(position<Number(first.size)){
      const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,Number(first.size)-position),position);
      need(bytesRead>0,'GROUNDWATER_APPLICATION_FILE_CHANGED','The original file changed while being read.');
      digest.update(buffer.subarray(0,bytesRead));position+=bytesRead;
    }
    const last=await handle.stat({bigint:true}),named=await lstat(file,{bigint:true});
    need(stable(first,last)&&stable(last,named)&&!named.isSymbolicLink()&&await realpath(file)===file,
      'GROUNDWATER_APPLICATION_FILE_CHANGED','The original file changed while being read.');
    const value={path:file,bytes:position,sha256:digest.digest('hex')};
    if(expected)need(value.bytes===expected.bytes&&value.sha256===expected.sha256,
      'GROUNDWATER_APPLICATION_ORIGINAL_UNAVAILABLE','The original file is unavailable or no longer has its retained bytes.');
    return value;
  }finally{await handle.close();}
}
export async function inspectReceivingRoot(value,{expectedIdentity}={}){
  absolute(value);await directory(value);const before=await lstat(value,{bigint:true});
  const identity={schema:SCHEMA+'.receiving-root',directory:value,...inode(before)};
  const sha256=hash(identity);checkExpected(sha256,expectedIdentity,'receiving directory');
  return {...identity,sha256};
}
export async function inspectSource(root,{expectedSha256}={}){
  absolute(root);await directory(root,{privateOnly:false});
  const contract=(await readJSON(join(root,APP,'SCIENTIFIC_SOURCE.json'))).value;
  need(contract.schema==='stellar-forge.groundwater-application-source.v1'&&contract.prefix===SCIENCE&&
    /^[a-f0-9]{40}$/.test(contract.sourceHead??'')&&/^[a-f0-9]{40}$/.test(contract.sourceCapsule??'')&&
    Array.isArray(contract.files)&&contract.files.length===64&&new Set(contract.files.map(row=>row.path)).size===64,
    'GROUNDWATER_APPLICATION_SOURCE_CONTRACT','Keep the complete original 64-file scientific selection.');
  // These are the maintained database/Python identity helpers and their original reader closure.
  const inherited=await inspectReportLaunchSource(root),rows=new Map(inherited.files.map(row=>[row.path,row]));
  for(const row of contract.files){
    need(typeof row.path==='string'&&!row.path.startsWith('/')&&!/[\\\u0000-\u0020]/.test(row.path)&&
      row.path.split('/').every(part=>part&&part!=='.'&&part!=='..')&&/^[a-f0-9]{40}$/.test(row.gitBlob??'')&&
      Number.isSafeInteger(row.bytes)&&row.bytes>=0,'GROUNDWATER_APPLICATION_SOURCE_CONTRACT','An original scientific member is invalid.');
    const name=SCIENCE+'/'+row.path,raw=await read(join(root,name),8*1024*1024);
    const git=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
    need(raw.length===row.bytes&&git===row.gitBlob,'GROUNDWATER_APPLICATION_SCIENCE_CHANGED','The selected original scientific source differs: '+row.path);
    rows.set(name,{path:name,bytes:raw.length,sha256:sha(raw)});
  }
  async function walk(relative){
    const full=join(root,relative),before=await lstat(full,{bigint:true});
    need(before.isDirectory()&&!before.isSymbolicLink()&&await realpath(full)===full,
      'GROUNDWATER_APPLICATION_SOURCE_PATH','Keep original regular source directories.');
    for(const name of (await readdir(full)).sort()){
      if(name==='__pycache__')continue;
      need(!name.startsWith('.')&&name!=='node_modules','GROUNDWATER_APPLICATION_SOURCE_PATH','Unexpected generated files occupy the selected adapter source.');
      const selected=relative+'/'+name,info=await lstat(join(root,selected),{bigint:true});
      if(info.isDirectory()){await walk(selected);continue;}
      need(info.isFile()&&!info.isSymbolicLink(),'GROUNDWATER_APPLICATION_SOURCE_PATH','The adapter source contains a linked or special member.');
      const raw=await read(join(root,selected),8*1024*1024);rows.set(selected,{path:selected,bytes:raw.length,sha256:sha(raw)});
    }
    const after=await lstat(full,{bigint:true});
    need(before.dev===after.dev&&before.ino===after.ino&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,
      'GROUNDWATER_APPLICATION_SOURCE_CHANGED','The original adapter file set changed during review.');
  }
  await walk(APP);
  for(const name of ['source.mjs','receiving.mjs','server.mjs','application-provider.mjs','cli.mjs','operator_host.py','ui/index.html','ui/app.js','ui/style.css','OPERATOR.md'])
    need(rows.has(APP+'/'+name),'GROUNDWATER_APPLICATION_SOURCE_INCOMPLETE','The installed adapter is missing '+name+'.');
  const files=[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path));
  need(files.length<=1024&&files.reduce((n,row)=>n+row.bytes,0)<=32*1024*1024,
    'GROUNDWATER_APPLICATION_SOURCE_BOUND','The selected complete direct application exceeds its supported source bound.');
  const value={schema:SCHEMA+'.source',scientific:{sourceHead:contract.sourceHead,sourceCapsule:contract.sourceCapsule,contractSha256:hash(contract)},files};
  const sha256=hash(value);checkExpected(sha256,expectedSha256,'installed application source');
  return {...value,sourceRoot:root,sha256};
}
export function coreFor(selected,workspace=selected.workspaceDirectory){
  return new GroundwaterWorkspace({workspace,python:selected.python,application:join(EXECUTED_ROOT,SCIENCE,'workspace.py')});
}
export async function inspectSelection(value,{executedRoot=EXECUTED_ROOT,probe=false}={}){
  const workspace=await inspectScientificWorkspace(value.workspaceDirectory,{expectedIdentity:value.expectedWorkspace});
  const receiving=await inspectReceivingRoot(value.receivingDirectory,{expectedIdentity:value.expectedReceiving});
  for(const pair of [[workspace.directory,receiving.directory],[value.sourceRoot,workspace.directory],[value.sourceRoot,receiving.directory]])
    need(disjoint(...pair),'GROUNDWATER_APPLICATION_DIRECTORY_OVERLAP','Keep installed source, original study and receiving storage in separate directories.');
  const source=await inspectSource(value.sourceRoot,{expectedSha256:value.expectedSource});
  const executed=await inspectSource(executedRoot,{expectedSha256:source.sha256});
  const python=await inspectReportPython(value.python,{expectedIdentity:value.expectedPython});
  let native=null;
  if(probe){
    native=JSON.parse(await child(value.python,['-B','-c',
      'import json,sys,sqlite3; assert sys.version_info >= (3,11); print(json.dumps({"python":sys.version.split()[0],"sqlite":sqlite3.sqlite_version}))'],
      {env:{PYTHONDONTWRITEBYTECODE:'1'},timeoutMs:30000}));
    await inspectReportPython(value.python,{expectedIdentity:python.identitySha256});
  }
  return {workspace,receiving,source,executed,python,native};
}
const OPTIONS=new Set(['--workspace','--receiving-root','--source-root','--python','--expected-workspace',
  '--expected-receiving','--expected-source','--expected-python','--actor','--port','--managed-operation']);
export function selection(args,{requireOperation=true,requireExpected=true}={}){
  need(Array.isArray(args)&&args[0]==='serve'&&(args.length-1)%2===0,'GROUNDWATER_APPLICATION_ARGUMENTS','Use the original named managed arguments.');
  const values={};for(let i=1;i<args.length;i+=2){
    need(OPTIONS.has(args[i])&&!Object.hasOwn(values,args[i]),'GROUNDWATER_APPLICATION_ARGUMENTS','Select each declared managed argument once.');
    values[args[i]]=args[i+1];
  }
  for(const key of ['--workspace','--receiving-root','--source-root','--python'])absolute(values[key],key);
  for(const key of ['--expected-workspace','--expected-receiving','--expected-source','--expected-python'])
    need((!requireExpected&&values[key]===undefined)||HASH.test(values[key]??''),'GROUNDWATER_APPLICATION_REVIEW_REQUIRED','Retain the reviewed '+key+'.');
  const port=values['--port']??'0';need(/^(0|[1-9]\d*)$/.test(port)&&Number(port)<=65535,'GROUNDWATER_APPLICATION_PORT','Choose an available local port.',422);
  if(values['--actor']!==undefined)text(values['--actor'],'named operator',200);
  need((!requireOperation&&values['--managed-operation']===undefined)||UUID.test(values['--managed-operation']??''),
    'GROUNDWATER_APPLICATION_OPERATION','Keep the original managed run UUID.');
  return {workspaceDirectory:values['--workspace'],receivingDirectory:values['--receiving-root'],sourceRoot:values['--source-root'],
    python:values['--python'],expectedWorkspace:values['--expected-workspace'],expectedReceiving:values['--expected-receiving'],
    expectedSource:values['--expected-source'],expectedPython:values['--expected-python'],actor:values['--actor']??'',
    port:Number(port),operationId:values['--managed-operation']??null};
}
export async function completeSelection(value,options){
  const observed=await inspectSelection(value,options);
  return {...value,expectedWorkspace:observed.workspace.sha256,expectedReceiving:observed.receiving.sha256,
    expectedSource:observed.source.sha256,expectedPython:observed.python.identitySha256};
}
export function workspaceKey(value){
  return hash({directory:value.directory,workspace:value.workspace,database:value.database});
}
export {inspectScientificWorkspace,inspectReportPython};
