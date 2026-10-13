#!/usr/bin/env node
// MIT. Open a complete original customer handover and its accepted dossier extension.
import {constants,fstatSync} from 'node:fs';
import {open,lstat,readdir,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const HERE=dirname(fileURLToPath(import.meta.url));
const P='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/';
const SCHEMA='sf88.research-customer-handover-returns-package.v1';
const maximum=256*1024*1024;
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:message});};
const member=value=>{need(typeof value==='string'&&value&&!value.startsWith('/')&&!/[\\\u0000-\u001f\u007f]/.test(value)&&
  value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'CUSTOMER_HANDOVER_MEMBER_INVALID');return value;};
const stamp=x=>[x.dev,x.ino,x.size,x.mtimeNs,x.ctimeNs,x.mode].join(':');
async function measure(file,retain=false){
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await handle.stat({bigint:true});need(before.isFile()&&before.size<=BigInt(maximum),'CUSTOMER_HANDOVER_ORDINARY_SOURCE_REQUIRED');
    const hash=createHash('sha256'),parts=[];let bytes=0;
    for await(const part of handle.createReadStream({autoClose:false,start:0})){
      bytes+=part.length;hash.update(part);if(retain){need(bytes<=16*1024*1024,'CUSTOMER_HANDOVER_JSON_LIMIT');parts.push(part);}
    }
    need(BigInt(bytes)===before.size&&stamp(before)===stamp(await handle.stat({bigint:true})),'CUSTOMER_HANDOVER_SOURCE_CHANGED');
    return {bytes,sha256:hash.digest('hex'),mode:(before.mode&0o111n)?'100755':'100644',...(retain?{body:Buffer.concat(parts)}:{})};
  }finally{await handle.close();}
}
async function verifyPackage(root,expected){
  need(isAbsolute(root)&&await realpath(root)===root,'CUSTOMER_HANDOVER_PACKAGE_PATH_CHANGED');
  const original=await measure(join(root,'PACKAGE_MANIFEST.json'),true);
  if(expected!==undefined)need(/^[a-f0-9]{64}$/.test(expected)&&original.sha256===expected,'CUSTOMER_HANDOVER_MANIFEST_CHANGED');
  const manifest=JSON.parse(original.body.toString('utf8'));
  need(manifest.schema===SCHEMA&&Array.isArray(manifest.files)&&manifest.files.length>0,'CUSTOMER_HANDOVER_PACKAGE_REQUIRED');
  const selected=new Map();
  for(const row of manifest.files){
    member(row.path);need(!selected.has(row.path)&&row.path!=='PACKAGE_MANIFEST.json','CUSTOMER_HANDOVER_MEMBER_REPEATED');
    need(Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=maximum&&/^[a-f0-9]{64}$/.test(row.sha256)&&
      ['100644','100755'].includes(row.mode),'CUSTOMER_HANDOVER_MEMBER_DESCRIPTOR_INVALID');selected.set(row.path,row);
  }
  const actual=[];
  async function visit(directory,prefix=''){
    for(const name of await readdir(directory)){
      member(name);const path=prefix?prefix+'/'+name:name,file=join(directory,name),info=await lstat(file);
      need(!info.isSymbolicLink(),'CUSTOMER_HANDOVER_SYMLINK');
      if(info.isDirectory())await visit(file,path);
      else{need(info.isFile(),'CUSTOMER_HANDOVER_SPECIAL_MEMBER');actual.push(path);}
    }
  }
  await visit(root);
  need(actual.length===selected.size+1&&actual.every(name=>name==='PACKAGE_MANIFEST.json'||selected.has(name)),
    'CUSTOMER_HANDOVER_INVENTORY_CHANGED');
  for(const row of selected.values()){
    const current=await measure(join(root,...row.path.split('/')));
    need(current.bytes===row.bytes&&current.sha256===row.sha256&&current.mode===row.mode,'CUSTOMER_HANDOVER_COMPLETE_SOURCE_CHANGED');
  }
  for(const name of ['OPEN.mjs','COURSE.json','ENGINE_SELECTION.json','ENGINE_ORIGINAL_MANIFEST.json',
    'baseline/handover.json','dossier/current.json.gz','engine/'+P+'customer-updates/handover-returns.mjs',
    'engine/'+P+'server.mjs','engine/'+P+'workspace-client.mjs'])
    need(selected.has(name),'CUSTOMER_HANDOVER_COMPLETE_RECEIVER_REQUIRED');
  const engine=JSON.parse((await measure(join(root,'ENGINE_SELECTION.json'),true)).body.toString('utf8'));
  need(Array.isArray(engine.files)&&engine.files.length===manifest.engine.files,'CUSTOMER_HANDOVER_ENGINE_COUNT_CHANGED');
  const sourceNames=new Set();
  for(const row of engine.files){
    const name='engine/'+member(row.path),included=selected.get(name);
    need(included&&included.bytes===row.bytes&&included.sha256===row.sha256&&included.mode===row.mode,
      'CUSTOMER_HANDOVER_SELECTED_ENGINE_CHANGED');sourceNames.add(name);
  }
  need(sourceNames.size===engine.files.length&&sourceNames.size===[...selected.keys()].filter(x=>x.startsWith('engine/')).length,
    'CUSTOMER_HANDOVER_ENGINE_MEMBERSHIP_CHANGED');
  need(engine.manifestSha256===manifest.engine.manifestSha256&&
    (await measure(join(root,'ENGINE_ORIGINAL_MANIFEST.json'))).sha256===engine.manifestSha256,
    'CUSTOMER_HANDOVER_ENGINE_LINEAGE_CHANGED');
  const self=selected.get('OPEN.mjs'),originalOpen=selected.get('engine/'+P+'customer-updates/OPEN-handover-returns.mjs');
  need(originalOpen&&self.sha256===originalOpen.sha256&&self.bytes===originalOpen.bytes,'CUSTOMER_HANDOVER_OPENER_CHANGED');
  return {manifest,sha256:original.sha256};
}
async function privateDirectory(path){
  need(isAbsolute(path)&&resolve(path)===path&&path!=='/','CUSTOMER_HANDOVER_RECEIVING_DIRECTORY_REQUIRED');
  await mkdir(path,{recursive:true,mode:0o700});
  need((await lstat(path)).isDirectory()&&await realpath(path)===path,'CUSTOMER_HANDOVER_RECEIVING_DIRECTORY_CHANGED');
  return path;
}
export async function openCustomerHandoverReturns({packageDirectory=HERE,directory,manifestSha256,python='python3',
  verifyOnly=false,port=0,sourceActor}={}){
  if(process.env.CUSTOMER_HANDOVER_RECEIVING_LOCK_FD!==undefined){
    need(/^[0-9]+$/.test(process.env.CUSTOMER_HANDOVER_RECEIVING_LOCK_FD),'CUSTOMER_HANDOVER_RECEIVING_LOCK_INVALID');
    const inherited=Number(process.env.CUSTOMER_HANDOVER_RECEIVING_LOCK_FD);
    need(inherited>2&&fstatSync(inherited).isFile(),'CUSTOMER_HANDOVER_RECEIVING_LOCK_INVALID');
    // Keep the original inherited open-file description alive until this Node
    // process exits, including if its Python parent loses its connection.
  }
  const selected=await verifyPackage(resolve(packageDirectory),manifestSha256);
  const root=await privateDirectory(resolve(directory??join(dirname(packageDirectory),'editable-customer-handover')));
  need(root!==resolve(packageDirectory)&&!root.startsWith(resolve(packageDirectory)+'/'),'CUSTOMER_HANDOVER_RECEIVING_OUTSIDE_PACKAGE_REQUIRED');
  const [{startDossierWorkspace},{ResearchWorkspaceClient},{receiveCustomerHandoverReturns}]=await Promise.all([
    import(pathToFileURL(join(packageDirectory,'engine',P,'server.mjs')).href),
    import(pathToFileURL(join(packageDirectory,'engine',P,'workspace-client.mjs')).href),
    import(pathToFileURL(join(packageDirectory,'engine',P,'customer-updates/handover-returns.mjs')).href)
  ]);
  const workspace=await privateDirectory(join(root,'workspace'));
  const app=await startDossierWorkspace({directory:workspace,port,clinicalTrialsPython:python,extractionPython:python});
  const client=new ResearchWorkspaceClient({url:app.url,directory:workspace,expectedWorkspaceId:app.workspaceId});
  let keep=false;
  try{
    const received=await receiveCustomerHandoverReturns({client,directory:join(root,'receiving'),
      packageDirectory:resolve(packageDirectory),manifestSha256:selected.sha256,sourceActor});
    await client.close();
    if(verifyOnly){await app.close();return {...received,editableWorkspaceDirectory:workspace};}
    keep=true;return {...received,editableWorkspaceDirectory:workspace,app};
  }finally{
    if(!keep){await client.close();await app.close();}
  }
}
async function main(args){
  const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{
    directory:{type:'string'},'manifest-sha256':{type:'string'},python:{type:'string'},port:{type:'string'},
    'source-actor':{type:'string'},'verify-only':{type:'boolean'},help:{type:'boolean'}
  }});
  if(values.help){process.stdout.write('node OPEN.mjs --directory /absolute/editable-receiving [--verify-only] [--port 0] [--python python3]\n');return;}
  need(values.port===undefined||/^(0|[1-9][0-9]{0,4})$/.test(values.port)&&Number(values.port)<=65535,'CUSTOMER_HANDOVER_PORT_INVALID');
  const result=await openCustomerHandoverReturns({packageDirectory:HERE,directory:values.directory?resolve(values.directory):undefined,
    manifestSha256:values['manifest-sha256'],python:values.python??'python3',port:Number(values.port??0),
    sourceActor:values['source-actor'],verifyOnly:values['verify-only']??false});
  if(!result.app){process.stdout.write(JSON.stringify(result,null,2)+'\n');return;}
  const {app,...receipt}=result;
  process.stdout.write(JSON.stringify({...receipt,url:app.url},null,2)+'\n');
  let closed;
  const close=()=>closed??=(app.close().catch(error=>{process.exitCode=1;process.stderr.write(JSON.stringify({code:error.code??'CUSTOMER_HANDOVER_CLOSE_FAILED'})+'\n');}));
  process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({state:'INCOMPLETE',code:error.code??'CUSTOMER_HANDOVER_OPEN_FAILED',message:error.message})+'\n');process.exitCode=1;});
