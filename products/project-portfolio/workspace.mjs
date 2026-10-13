// SPDX-License-Identifier: MIT
// Open the original Project Portfolio application from its complete selected source.
import {constants} from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
import {open,lstat,realpath,mkdir,rename,rm,readFile,access} from 'node:fs/promises';
import {resolve,dirname,join,delimiter,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export const PRODUCT_SCHEMA='stellar-forge.project-portfolio-product.v1';
export const SELECTION_SCHEMA='stellar-forge.project-portfolio-selection.v1';
export const READY_SCHEMA='stellar-forge.project-portfolio-ready.v1';
export const CONNECTION_SCHEMA='stellar-forge.project-portfolio-connection.v1';
export const SOURCE_COMMIT='bb1214f14e6df3068784845c589242713d21242a';
export const SOURCE_TREE='3851466b3b489ed1d6e3aae1654ae1d04436ff27';
export const PRODUCT_DIRECTORY=fileURLToPath(new URL('./',import.meta.url));
export const HASH=/^[a-f0-9]{64}$/;
export const ALIAS=/^[a-z][a-z0-9-]{0,63}$/;
const ownFiles=['workspace.mjs','launch.py','client.mjs','client.d.mts','cli.mjs',
 'merchant-catalog.mjs','merchant.mjs','merchant-provider.mjs','application-provider.mjs'];
const bytes=value=>Buffer.from(JSON.stringify(canonical(value))+'\n','utf8');
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function need(condition,code,message=code){if(!condition)throw Object.assign(new Error(message),{code});}
export function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
export function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export function exact(value,allowed,required=[]){
 need(plain(value)&&Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),
  'PROJECT_PORTFOLIO_INPUT','Use the declared fields for the selected operation.');
}
export function identity(value,label='identity'){
 need(typeof value==='string'&&HASH.test(value),'PROJECT_PORTFOLIO_ID','Use the complete original '+label+'.');return value;
}
export function portNumber(value=0){
 const port=typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)?Number(value):value;
 need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'PROJECT_PORTFOLIO_PORT');return port;
}
export function fullPath(value){
 need(typeof value==='string'&&value.length>0&&value.length<=4096&&!value.includes('\0')&&isAbsolute(value),
  'PROJECT_PORTFOLIO_PATH','Choose one absolute local path.');return resolve(value);
}
function stamp(stat){
 return {dev:String(stat.dev),ino:String(stat.ino),bytes:String(stat.size),
  mtimeNs:String(stat.mtimeNs),ctimeNs:String(stat.ctimeNs)};
}
export async function readRegular(file,maximum=1024*1024,{privateFile=false}={}){
 file=fullPath(file);const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const first=await handle.stat({bigint:true});
  need(first.isFile()&&first.size>=0n&&first.size<=BigInt(maximum),'PROJECT_PORTFOLIO_FILE','Choose the complete original regular file.');
  if(privateFile)need(!(Number(first.mode)&0o077)&&(typeof process.getuid!=='function'||Number(first.uid)===process.getuid()),
   'PROJECT_PORTFOLIO_PRIVATE_FILE','Keep this selected connection file private to its original operator.');
  const raw=await handle.readFile(),last=await handle.stat({bigint:true}),named=await lstat(file,{bigint:true});
  need(raw.length===Number(first.size)&&JSON.stringify(stamp(first))===JSON.stringify(stamp(last))&&
   JSON.stringify(stamp(first))===JSON.stringify(stamp(named)),'PROJECT_PORTFOLIO_FILE_CHANGED');
  return raw;
 }finally{await handle.close();}
}
export async function readJson(file,maximum=1024*1024,options){
 const raw=await readRegular(file,maximum,options);
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
 catch{need(false,'PROJECT_PORTFOLIO_JSON','Read the complete original UTF-8 JSON file.');}
}
export async function privateDirectory(directory,{create=false}={}){
 directory=fullPath(directory);
 if(create)await mkdir(directory,{recursive:true,mode:0o700});
 const actual=await realpath(directory),info=await lstat(directory);
 need(actual===directory&&info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077)&&
  (typeof process.getuid!=='function'||info.uid===process.getuid()),'PROJECT_PORTFOLIO_PRIVATE_DIRECTORY');
 return directory;
}
export async function atomicJson(file,value,{immutable=false}={}){
 file=fullPath(file);await privateDirectory(dirname(file),{create:true});
 const raw=bytes(value),temporary=join(dirname(file),'.'+randomUUID()+'.incoming');
 const handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
 try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
 try{
  if(immutable){
   const {link}=await import('node:fs/promises');
   try{await link(temporary,file);}
   catch(error){if(error.code!=='EEXIST')throw error;need((await readRegular(file,raw.length,{privateFile:true})).equals(raw),'PROJECT_PORTFOLIO_ALREADY_CONFIGURED');}
  }else await rename(temporary,file);
  const parent=await open(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);
  try{await parent.sync();}finally{await parent.close();}
 }finally{await rm(temporary,{force:true});}
 return {path:file,bytes:raw.length,sha256:sha(raw)};
}
async function selectedDirectory(directory){
 directory=fullPath(directory);
 try{need(await realpath(directory)===directory,'PROJECT_PORTFOLIO_DIRECTORY_ALIAS');}
 catch(error){
  if(error.code!=='ENOENT')throw error;
  need(await realpath(dirname(directory))===dirname(directory),'PROJECT_PORTFOLIO_PARENT_ALIAS');
 }
 return directory;
}
export function controlDirectory(workspace){return join(dirname(fullPath(workspace)),fullPath(workspace).split('/').at(-1)+'-project-portfolio-host');}
export async function executablePath(value=process.env.PROJECT_PORTFOLIO_PYTHON||'python3'){
 need(typeof value==='string'&&value&&!value.includes('\0'),'PROJECT_PORTFOLIO_PYTHON');
 const candidates=isAbsolute(value)?[value]:(process.env.PATH??'').split(delimiter).filter(Boolean).map(base=>join(base,value));
 for(const candidate of candidates){
  try{
   await access(candidate,constants.X_OK);const selected=await realpath(candidate),info=await lstat(selected,{bigint:true});
   if(info.isFile()){
    const handle=await open(selected,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    let fingerprint;
    try{
     const first=await handle.stat({bigint:true});need(first.isFile()&&first.size<=268435456n,
      'PROJECT_PORTFOLIO_PYTHON_FILE');
     const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
     while(position<Number(first.size)){
      const part=await handle.read(buffer,0,Math.min(buffer.length,Number(first.size)-position),position);
      need(part.bytesRead>0,'PROJECT_PORTFOLIO_PYTHON_CHANGED');
      hash.update(buffer.subarray(0,part.bytesRead));position+=part.bytesRead;
     }
     need(JSON.stringify(stamp(first))===JSON.stringify(stamp(await handle.stat({bigint:true})))&&
      JSON.stringify(stamp(first))===JSON.stringify(stamp(await lstat(selected,{bigint:true}))),
      'PROJECT_PORTFOLIO_PYTHON_CHANGED');
     fingerprint={...stamp(first),sha256:hash.digest('hex')};
    }finally{await handle.close();}
    let configuration=null;
    const configurationPath=join(dirname(dirname(resolve(candidate))),'pyvenv.cfg');
    try{const raw=await readRegular(configurationPath,65536);
     configuration={path:configurationPath,bytes:raw.length,sha256:sha(raw)};}
    catch(error){if(error.code!=='ENOENT')throw error;}
    return {path:resolve(candidate),realPath:selected,...fingerprint,configuration};
   }
  }catch(error){if(!['ENOENT','EACCES','ENOTDIR'].includes(error.code))throw error;}
 }
 need(false,'PROJECT_PORTFOLIO_PYTHON','Select an installed Python 3 executable.');
}
export async function inspectProjectPortfolioSelection({workspaceDirectory,profilesFile=null,pythonExecutable,controlDirectory:control,sourceDirectory=PRODUCT_DIRECTORY}={}){
 const directory=await selectedDirectory(workspaceDirectory);
 control=await selectedDirectory(control??controlDirectory(directory));
 need(control!==directory&&!control.startsWith(directory+'/'),'PROJECT_PORTFOLIO_CONTROL_LOCATION',
  'Keep the private host connection outside the portable project workspace.');
 const executionSourceDirectory=await realpath(PRODUCT_DIRECTORY),root=await realpath(fullPath(sourceDirectory));
 const adoption=await readJson(join(root,'SOURCE_ADOPTION.json'));
 need(adoption.schema==='stellar-forge.project-portfolio-source-adoption.v1'&&adoption.commit===SOURCE_COMMIT&&
  adoption.productTree===SOURCE_TREE&&Array.isArray(adoption.files)&&adoption.files.length===63,
 'PROJECT_PORTFOLIO_SOURCE_SELECTION');
 const files=[];
 for(const item of adoption.files){
  need(typeof item.path==='string'&&item.path&&!item.path.includes('\\')&&!item.path.startsWith('/')&&
   item.path.split('/').every(part=>part&&part!=='.'&&part!=='..'),'PROJECT_PORTFOLIO_SOURCE_PATH');
  const path=join(root,'source',item.path),raw=await readRegular(path,16*1024*1024);
  need(raw.length===item.bytes&&sha(raw)===item.sha256,'PROJECT_PORTFOLIO_SOURCE_CHANGED',item.path);
  files.push({path,bytes:raw.length,sha256:item.sha256});
 }
 for(const name of ['SOURCE_ADOPTION.json',...ownFiles]){
  const path=join(root,name),raw=await readRegular(path,2*1024*1024);files.push({path,bytes:raw.length,sha256:sha(raw)});
 }
 // Applications prepares the installed runtime source and executes its reviewed
 // managed release copy. The complete executing copy must have those same bytes.
 if(root!==executionSourceDirectory)for(const item of files){
  need(item.path.startsWith(root+'/'),'PROJECT_PORTFOLIO_SOURCE_PATH');
  const path=join(executionSourceDirectory,item.path.slice(root.length+1));
  const raw=await readRegular(path,16*1024*1024);
  need(raw.length===item.bytes&&sha(raw)===item.sha256,'PROJECT_PORTFOLIO_EXECUTION_SOURCE_CHANGED',path);
 }
 files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
 let profiles=null;
 if(profilesFile){
  const path=await realpath(fullPath(profilesFile));need(!path.startsWith(directory+'/'),'PROJECT_PORTFOLIO_PROFILE_LOCATION',
   'Keep target credentials in the selected private file outside the portable workspace.');
  const raw=await readRegular(path,2*1024*1024,{privateFile:true});
  profiles={path,bytes:raw.length,sha256:sha(raw)};
 }
 const python=await executablePath(pythonExecutable);
 const selection={schema:SELECTION_SCHEMA,sourceDirectory:root,sourceCommit:SOURCE_COMMIT,sourceTree:SOURCE_TREE,
  workspaceDirectory:directory,controlDirectory:control,python,profiles,files};
 return {selection,selectionSha256:sha(bytes(selection)),sourceFiles:files.map(item=>item.path),executionSourceDirectory};
}
export async function initializeProjectPortfolio({workspaceDirectory,connectionFile,label='Project portfolio',...options}={}){
 need(typeof label==='string'&&label.trim()&&label.length<=300,'PROJECT_PORTFOLIO_LABEL');
 const selected=await inspectProjectPortfolioSelection({workspaceDirectory,...options});
 const selection=selected.selection;
 await privateDirectory(selection.workspaceDirectory,{create:true});
 await privateDirectory(selection.controlDirectory,{create:true});
 const connection={schema:CONNECTION_SCHEMA,label,workspaceDirectory:selection.workspaceDirectory,
  controlDirectory:selection.controlDirectory,entryFile:join(selection.controlDirectory,'entry.json')};
 const target=fullPath(connectionFile??join(selection.controlDirectory,'connection.json'));
 need(!target.startsWith(selection.workspaceDirectory+'/'),'PROJECT_PORTFOLIO_CONNECTION_LOCATION');
 const saved=await atomicJson(target,connection,{immutable:true});
 return {schema:PRODUCT_SCHEMA,workspaceDirectory:selection.workspaceDirectory,controlDirectory:selection.controlDirectory,
  connectionFile:target,label,connection:saved,sourceCommit:SOURCE_COMMIT};
}
export async function readProjectPortfolioConnection(file){
 file=fullPath(file);const connection=await readJson(file,65536,{privateFile:true});
 exact(connection,['schema','label','workspaceDirectory','controlDirectory','entryFile'],
  ['schema','label','workspaceDirectory','controlDirectory','entryFile']);
 need(connection.schema===CONNECTION_SCHEMA&&typeof connection.label==='string'&&connection.label.trim(),'PROJECT_PORTFOLIO_CONNECTION');
 fullPath(connection.workspaceDirectory);fullPath(connection.controlDirectory);
 need(connection.entryFile===join(connection.controlDirectory,'entry.json')&&
  connection.controlDirectory!==connection.workspaceDirectory&&!connection.controlDirectory.startsWith(connection.workspaceDirectory+'/'),
 'PROJECT_PORTFOLIO_CONNECTION');
 return {...connection,connectionFile:file};
}
export async function readProjectPortfolioEntry(connection){
 const entry=await readJson(connection.entryFile,65536,{privateFile:true});
 need(entry.schema===READY_SCHEMA&&entry.state==='LISTENING'&&entry.workspaceDirectory===connection.workspaceDirectory&&
  entry.controlDirectory===connection.controlDirectory&&HASH.test(entry.workspaceId)&&HASH.test(entry.selectionSha256),
 'PROJECT_PORTFOLIO_NOT_OPEN','Open the original Project Portfolio application and read its current connection.');
 const url=new URL(entry.url);
 need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/'&&!url.search&&!url.username&&!url.password&&
  url.hash.startsWith('#token=')&&url.origin===entry.origin&&Number(url.port)>0,'PROJECT_PORTFOLIO_LOCAL_CONNECTION');
 const token=url.hash.slice(7);
 need(/^[A-Za-z0-9_-]{32,128}$/.test(token),'PROJECT_PORTFOLIO_LOCAL_CONNECTION');
 return {...entry,token};
}
export async function readProjectPortfolioLaunch(options,announcement){
 const selected=await inspectProjectPortfolioSelection(options);
 need(plain(announcement)&&announcement.schema===READY_SCHEMA&&announcement.state==='LISTENING'&&
  announcement.selectionSha256===selected.selectionSha256,'PROJECT_PORTFOLIO_STARTUP_SELECTION');
 const connection={workspaceDirectory:selected.selection.workspaceDirectory,controlDirectory:selected.selection.controlDirectory,
  entryFile:join(selected.selection.controlDirectory,'entry.json')};
 const current=await readProjectPortfolioEntry(connection);
 need(current.instanceId===announcement.instanceId&&current.pid===announcement.pid&&current.url===announcement.url&&
  current.selectionSha256===selected.selectionSha256&&current.sourceDirectory===selected.selection.sourceDirectory&&
  current.executionSourceDirectory===selected.executionSourceDirectory,'PROJECT_PORTFOLIO_STARTUP_CHANGED');
 const stat=await readFile('/proc/'+current.pid+'/stat');
 need(stat.length<=8192,'PROJECT_PORTFOLIO_PROCESS_CHANGED');
 const fields=stat.toString('utf8').slice(stat.toString('utf8').lastIndexOf(')')+2).split(/\s+/);
 need(fields[19]===current.processStart,'PROJECT_PORTFOLIO_PROCESS_CHANGED');
 const response=await fetch(new URL('/api/hello',current.origin),{redirect:'error',
  headers:{Authorization:'Bearer '+current.token},signal:AbortSignal.timeout(10000)});
 try{
  need(response.status===200,'PROJECT_PORTFOLIO_STARTUP_UNAVAILABLE');
  const raw=await response.text();need(Buffer.byteLength(raw)<=65536,'PROJECT_PORTFOLIO_STARTUP_TOO_LARGE');
  const hello=JSON.parse(raw);need(hello.schema==='portfolio.operator-hello.v1'&&hello.workspace_id===current.workspaceId,
   'PROJECT_PORTFOLIO_WORKSPACE_CHANGED');
 }finally{await response.body?.cancel().catch(()=>{});}
 return {url:current.url,original:{schema:READY_SCHEMA,workspaceId:current.workspaceId,pid:current.pid,
  processStart:current.processStart,instanceId:current.instanceId,selectionSha256:current.selectionSha256,
  workspaceDirectory:current.workspaceDirectory,sourceCommit:SOURCE_COMMIT,
  sourceDirectory:current.sourceDirectory,executionSourceDirectory:current.executionSourceDirectory}};
}
export async function openProjectPortfolio(options={},{
 onReady=value=>process.stdout.write(JSON.stringify(value)+'\n'),environment=process.env,signal
}={}){
 const selected=await inspectProjectPortfolioSelection(options);
 if(options.expectedSelectionSha256)need(identity(options.expectedSelectionSha256)===selected.selectionSha256,
  'PROJECT_PORTFOLIO_SELECTION_CHANGED','Reopen the selected source and private configuration before starting.');

 const defaultConnection=join(selected.selection.controlDirectory,'connection.json');
 try{
  const original=await readProjectPortfolioConnection(defaultConnection);
  need(original.workspaceDirectory===selected.selection.workspaceDirectory&&original.controlDirectory===selected.selection.controlDirectory,
   'PROJECT_PORTFOLIO_CONNECTION_CHANGED');
 }catch(error){
  if(error.code!=='ENOENT')throw error;
  await initializeProjectPortfolio({...options,connectionFile:defaultConnection});
 }
 const port=portNumber(options.port??0);
 let child=null,stopping=false,firstError=null,buffer='',ready=null;const decoder=new StringDecoder('utf8');
 const stop=()=>{if(stopping)return;stopping=true;if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGINT');};
 const onSignal=()=>stop();
 for(const name of ['SIGHUP','SIGINT','SIGTERM'])process.on(name,onSignal);
 signal?.addEventListener('abort',stop,{once:true});
 try{
  if(signal?.aborted)throw signal.reason??new Error('The selected application start was cancelled.');
  child=spawn(selected.selection.python.path,['-B',join(PRODUCT_DIRECTORY,'launch.py'),'--port',String(port)],{
   cwd:PRODUCT_DIRECTORY,env:{...environment,PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1'},
   stdio:['pipe','pipe','pipe'],shell:false});
  const exited=new Promise((resolveExit,reject)=>{
   child.once('error',reject);child.once('close',(code,signal)=>resolveExit({code,signal}));
  });
  void exited.catch(()=>{});
  child.stdin.on('error',error=>{firstError??=error;stop();});
  child.stdout.on('error',error=>{firstError??=error;stop();});
  child.stderr.on('error',error=>{firstError??=error;stop();});
  child.stderr.on('data',chunk=>{try{process.stderr.write(chunk);}catch(error){firstError??=error;stop();}});
  child.stdout.on('data',chunk=>{
   try{
    buffer+=decoder.write(chunk);need(buffer.length<=65536,'PROJECT_PORTFOLIO_STARTUP_OUTPUT');
    let end;while((end=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
     const value=JSON.parse(line);
     if(value.schema===READY_SCHEMA&&value.state==='LISTENING'){
      need(!ready&&value.selectionSha256===selected.selectionSha256,'PROJECT_PORTFOLIO_STARTUP_CHANGED');
      ready=value;onReady(value);
     }else if(value.error)firstError??=Object.assign(new Error(value.error.message),{code:value.error.code});
    }
   }catch(error){firstError??=error;stop();}
  });
  child.stdin.end(bytes({selection:selected.selection,selectionSha256:selected.selectionSha256}));
  const result=await exited;
  if(firstError)throw firstError;
  need(result.code===0,'PROJECT_PORTFOLIO_HOST_EXIT','The original application exited with '+(result.signal??result.code)+'.');
  need(ready||stopping,'PROJECT_PORTFOLIO_STARTUP_MISSING');
  return {schema:PRODUCT_SCHEMA,state:'CLOSED',workspaceDirectory:selected.selection.workspaceDirectory,
   instanceId:ready?.instanceId??null,sourceCommit:SOURCE_COMMIT};
 }finally{
  signal?.removeEventListener('abort',stop);
  for(const name of ['SIGHUP','SIGINT','SIGTERM'])process.removeListener(name,onSignal);
  if(child&&child.exitCode===null&&child.signalCode===null){
   stop();await new Promise(resolveClose=>child.once('close',resolveClose));
  }
 }
}
export async function runProjectPortfolioCommand(kind,args=[],{pythonExecutable,environment=process.env}={}){
 need(['source','operator'].includes(kind)&&Array.isArray(args)&&args.every(v=>typeof v==='string'&&!v.includes('\0')),
  'PROJECT_PORTFOLIO_COMMAND');
 const python=await executablePath(pythonExecutable);
 const entry=kind==='source'?join(PRODUCT_DIRECTORY,'source/portfolio/__main__.py'):join(PRODUCT_DIRECTORY,'source/operator/cli.py');
 const original=kind==='source'?['-B','-m','portfolio',...args]:['-B',entry,...args];
 const env={...environment,PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',
  PYTHONPATH:join(PRODUCT_DIRECTORY,'source')+(environment.PYTHONPATH?delimiter+environment.PYTHONPATH:'')};
 const child=spawn(python.path,original,{cwd:join(PRODUCT_DIRECTORY,'source'),env,stdio:'inherit',shell:false});
 const stop=()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGINT');};
 for(const signal of ['SIGHUP','SIGINT','SIGTERM'])process.on(signal,stop);
 try{return await new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolveExit(code??(signal==='SIGINT'?130:1)));});}
 finally{for(const signal of ['SIGHUP','SIGINT','SIGTERM'])process.removeListener(signal,stop);}
}
