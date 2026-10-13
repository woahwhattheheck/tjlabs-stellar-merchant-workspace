// SPDX-License-Identifier: MIT
// One foreground lifetime for the original Research comparison receiving operation.
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readdir,lstat,readFile,open,rename,chmod,realpath,link,unlink} from 'node:fs/promises';
import {resolve,join,relative,dirname,isAbsolute,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const SCHEMA='sf88-research-comparison-foreground/v1';
const PREFIX='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers';
const REQUIRED=['dossier.mjs','server.mjs','portable.mjs','public/app.js','public/index.html',
 'public/comparison.js','public/comparison.css','comparison/contracts.mjs','comparison/model.mjs',
 'comparison/store.mjs','comparison/render.mjs','comparison/receive.mjs','comparison/browser-receiving.mjs',
 'comparison/foreground-receiving.mjs','comparison/OPERATING.md','comparison/RECEIVING.md',
 'comparison/adoption-contracts.mjs','comparison/adoption-model.mjs','comparison/adoption-store.mjs',
 'comparison/adoption-routes.mjs','comparison/adoption-receiving.mjs','comparison/adoption-browser-receiving.mjs',
 'comparison/ADOPTION.md','comparison/ADOPTION_BROWSER.md','public/comparison-adoption.js',
 'public/comparison-adoption-store.js','public/comparison-adoption.css'];
const MAX_SOURCE=1024*1024*1024,MAX_FILES=30000;
const need=(ok,message)=>{if(!ok)throw Error(message);};
const json=x=>JSON.stringify(x,null,2)+'\n';
const hash=b=>createHash('sha256').update(b).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function optional(p){try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function atomic(p,value){
 const t=p+'.'+randomUUID()+'.tmp',h=await open(t,'wx',0o600);
 try{await h.writeFile(json(value));await h.sync();}finally{await h.close();}
 await rename(t,p);await syncDirectory(dirname(p));
}
async function syncDirectory(p){const h=await open(p,'r');try{await h.sync();}finally{await h.close();}}
async function retained(p,value){
 const bytes=Buffer.from(json(value)),temporary=p+'.'+randomUUID()+'.tmp',h=await open(temporary,'wx',0o600);
 try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
 try{await link(temporary,p);}catch(e){if(e.code!=='EEXIST')throw e;need((await readFile(p)).equals(bytes),'Original retained selection changed: '+p);}
 await syncDirectory(dirname(p));await unlink(temporary);return value;
}
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode].map(String);
async function fileIdentity(file,{copyTo}={}){
 const initial=await lstat(file,{bigint:true});need(initial.isFile()&&!initial.isSymbolicLink(),'Source must be an ordinary file: '+file);
 const h=await open(file,'r');let out,bytes=0;const digest=createHash('sha256');
 try{
  need(equal(stamp(initial),stamp(await h.stat({bigint:true}))),'Source changed before read: '+file);
  if(copyTo){await mkdir(dirname(copyTo),{recursive:true,mode:0o700});out=await open(copyTo,'wx',0o600);}
  for await(const b of h.createReadStream({autoClose:false})){
   bytes+=b.length;need(bytes<=MAX_SOURCE&&BigInt(bytes)<=initial.size,'Source grew during read: '+file);
   digest.update(b);if(out)await out.writeFile(b);
  }
  need(BigInt(bytes)===initial.size&&equal(stamp(initial),stamp(await h.stat({bigint:true})))&&
   equal(stamp(initial),stamp(await lstat(file,{bigint:true}))),'Source changed during read: '+file);
  if(out)await out.sync();
  return{bytes,sha256:digest.digest('hex'),executable:Boolean(initial.mode&0o111n)};
 }finally{if(out)await out.close();await h.close();}
}
async function scan(root){
 const files=[],directories=[];let bytes=0;
 async function visit(path){
  const entries=await readdir(path,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  for(const entry of entries){
   need(entry.name!=='.git','Use the complete exported source selection, not a Git object database.');
   const file=join(path,entry.name),p=relative(root,file).split(sep).join('/');
   need(!entry.isSymbolicLink()&&(entry.isFile()||entry.isDirectory()),'Unselected special source member: '+p);
   if(entry.isDirectory()){directories.push(p);await visit(file);}
   else{const d=await fileIdentity(file);bytes+=d.bytes;need(bytes<=MAX_SOURCE&&files.length<MAX_FILES,'Complete selected source exceeds this receiving bound');files.push({path:p,...d});}
  }
 }
 await visit(root);return{files,directories};
}
async function verifySelection(root,manifest){
 const found=await scan(root);need(equal(found.files,manifest.files)&&equal(found.directories,manifest.directories),'Retained complete application source changed');
}
async function selectSource(sourceRoot,directory){
 const manifestPath=join(directory,'source-selection.json'),destination=join(directory,'selected-source');
 let manifest=await optional(manifestPath);
 if(!manifest){
  const source=await scan(sourceRoot);
  for(const name of REQUIRED)need(source.files.some(f=>f.path===PREFIX+'/'+name),'Complete Research selection missing: '+name);
  manifest={schema:SCHEMA,originalSourceRoot:sourceRoot,...source};
  await retained(manifestPath,manifest);
 }
 need(manifest.originalSourceRoot===sourceRoot,'Original source selection root changed');
 let exists=true;try{await lstat(destination);}catch(e){if(e.code!=='ENOENT')throw e;exists=false;}
 if(!exists){
  // Retain the accepted exact source selection before copying. Every copied body
  // is read once through a stable descriptor and compared with that selection.
  const stage=join(directory,'source-stage-'+randomUUID());await mkdir(stage,{mode:0o700});
  for(const d of manifest.directories)await mkdir(join(stage,d),{recursive:true,mode:0o700});
  for(const f of manifest.files){
   const got=await fileIdentity(join(sourceRoot,f.path),{copyTo:join(stage,f.path)});
   need(equal(got,{bytes:f.bytes,sha256:f.sha256,executable:f.executable}),'Accepted original source body changed: '+f.path);
   await chmod(join(stage,f.path),f.executable?0o555:0o444);
  }
  await verifySelection(stage,manifest);
  for(const d of [...manifest.directories].sort((a,b)=>b.split('/').length-a.split('/').length))await chmod(join(stage,d),0o555);
  await chmod(stage,0o555);await rename(stage,destination);
 }
 await verifySelection(destination,manifest);
 return{directory:destination,manifest,sha256:hash(Buffer.from(json(manifest)))};
}
async function outputIdentity(p){const d=await fileIdentity(p);return{file:p,bytes:d.bytes,sha256:d.sha256};}
async function verifyOutputs(result){
 for(const d of result.files??[]){const got=await outputIdentity(d.file);need(got.bytes===d.bytes&&got.sha256===d.sha256,'Completed receiving output changed: '+d.file);}
}
async function runtimeSelection(options){
 const paths={python:await realpath(options.python),playwrightModule:await realpath(options.playwrightModule),chromium:await realpath(options.chromium)};
 const out={node:{path:await realpath(process.execPath),version:process.version},...paths};
 // These are exactly the requested executables/module; no host census or install.
 out.playwrightIdentity=await outputIdentity(paths.playwrightModule);
 out.pythonIdentity=await outputIdentity(paths.python);out.chromiumIdentity=await outputIdentity(paths.chromium);
 return out;
}
export async function receiveComparisonForeground(options){
 const directory=resolve(options.directory),sourceRoot=await realpath(resolve(options.sourceRoot));
 need(isAbsolute(options.sourceRoot)&&isAbsolute(options.directory),'Absolute source and original operation directory required');
 need(relative(sourceRoot,directory).startsWith('..'+sep)||relative(sourceRoot,directory)==='..','Operation output must be outside the complete source selection');
 need(typeof options.operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(options.operationId),'Stable original operation ID required');
 need(typeof options.reviewer==='string'&&options.reviewer.trim()&&options.reviewer.length<=200,'Actual reviewer required');
 await mkdir(directory,{recursive:true,mode:0o700});
 const runtime=await runtimeSelection(options);
 const intent={schema:SCHEMA,operationId:options.operationId,reviewer:options.reviewer,sourceRoot,directory,runtime};
 await retained(join(directory,'foreground-intent.json'),intent);
 const selected=await selectSource(sourceRoot,directory),app=join(selected.directory,PREFIX);
 const completed=await optional(join(directory,'foreground-result.json'));
 if(completed){need(completed.adoption?.browser&&completed.adoption?.backend,'An earlier completed original course remains preserved. Receive the explicitly reviewed adoption continuation from its complete selected source before claiming this whole edition.');need(completed.sourceSha256===selected.sha256&&completed.operationId===options.operationId,'Original foreground result changed');await verifyOutputs(completed);return completed;}
 const receive=await import(pathToFileURL(join(app,'comparison/receive.mjs')).href);
 const browserReview=await import(pathToFileURL(join(app,'comparison/browser-receiving.mjs')).href);
 const adoptionReceive=await import(pathToFileURL(join(app,'comparison/adoption-receiving.mjs')).href);
 const adoptionBrowser=await import(pathToFileURL(join(app,'comparison/adoption-browser-receiving.mjs')).href);
 const {startDossierWorkspace}=await import(pathToFileURL(join(app,'server.mjs')).href);
 const playwright=await import(pathToFileURL(runtime.playwrightModule).href);
 const chromium=playwright.chromium??playwright.default?.chromium;need(chromium,'Original Playwright Chromium API unavailable');
 const abort=new AbortController();let context=null,main=null,cold=null,primary=null,signalClose=null,result=null;
 const closers=new Map(),additionalListeners=new Map();
 const closeOnce=(key,value)=>{if(!value)return Promise.resolve();if(!closers.has(key))closers.set(key,Promise.resolve().then(()=>value.close()));return closers.get(key);};
 const closing=()=>[closeOnce('browser',context),closeOnce('cold',cold),closeOnce('main',main),...[...additionalListeners].map(([key,value])=>closeOnce(key,value))];
 const stop=()=>{
  if(abort.signal.aborted)return;abort.abort(Error('Original foreground receiving interrupted'));
  signalClose=Promise.allSettled(closing());
 };
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const active=()=>abort.signal.throwIfAborted();
 let ports=await optional(join(directory,'listener-ports.json'))??{};
 async function listener(key,storeDirectory){
  active();const value=await startDossierWorkspace({directory:storeDirectory,port:ports[key]??0,
   clinicalTrialsPython:runtime.python,extractionPython:runtime.python,extractionSignal:abort.signal});
  try{
   active();const port=Number(new URL(value.url).port);
   need(!ports[key]||ports[key]===port,'Original listener origin changed');
   ports={...ports,[key]:port};await atomic(join(directory,'listener-ports.json'),ports);
   await retained(join(directory,key+'-workspace-binding.json'),{schema:SCHEMA,operationId:options.operationId,
    directory:storeDirectory,workspaceId:value.workspaceId,port});
   return value;
  }catch(e){try{await value.close();}catch(closeError){throw new AggregateError([e,closeError],'Original listener start and close failed',{cause:e});}throw e;}
 }
 try{
  active();const backend=await receive.receiveComparison({directory:join(directory,'backend'),operationId:options.operationId,reviewer:options.reviewer});
  active();await verifySelection(selected.directory,selected.manifest);await verifyOutputs(backend);
  main=await listener('original',backend.storeDirectory);
  active();context=await chromium.launchPersistentContext(join(directory,'browser-profile'),{
   executablePath:runtime.chromium,headless:true,acceptDownloads:true,viewport:{width:1440,height:1000}});
  active();context.setDefaultTimeout(30000);context.setDefaultNavigationTimeout(60000);
  const page=context.pages()[0]??await context.newPage();
  const browser=await browserReview.reviewComparisonBrowser({page,url:main.url,receipt:backend,
   directory:join(directory,'browser'),reviewer:options.reviewer,
   openReceived:async({directory:receivedDirectory})=>{
    need(!cold,'Only one original received listener is allowed');cold=await listener('received',receivedDirectory);
    return{url:cold.url,close:()=>closeOnce('cold',cold)};
   }});
  active();await verifySelection(selected.directory,selected.manifest);
  // Preserve all completed original comparison/output phases. Following adoption
  // uses separate retained directories in this same locked foreground lifetime.
  await closeOnce('cold',cold);await closeOnce('main',main);active();
  const adoptionDirectory=join(directory,'adoption-backend');
  const adoption=await adoptionReceive.receiveComparisonAdoption({directory:adoptionDirectory,operationId:options.operationId,reviewer:options.reviewer});
  active();await verifySelection(selected.directory,selected.manifest);await verifyOutputs(adoption);
  const adoptionMain=await listener('adoption-original',adoption.authorStoreDirectory);additionalListeners.set('adoption-original',adoptionMain);
  active();
  const adoptedBrowser=await adoptionBrowser.reviewComparisonAdoptionBrowser({page,url:adoptionMain.url,receipt:adoption,
   directory:join(directory,'adoption-browser'),reviewer:options.reviewer,
   openReceived:async({directory:receivedDirectory})=>{
    const targets=new Map([
      [join(directory,'adoption-browser','received-adoption-author'),'adoption-received'],
      [join(directory,'adoption-browser','received-interrupted-adoption'),'adoption-interrupted']]);
    const key=targets.get(resolve(receivedDirectory));need(key&&!additionalListeners.has(key),'Only the original selected adoption receiving stores are opened');
    const value=await listener(key,receivedDirectory);additionalListeners.set(key,value);
    return{url:value.url,close:()=>closeOnce(key,value)};
   }});
  active();await verifySelection(selected.directory,selected.manifest);
  const files=[...backend.files,...browser.files,...browser.screens,...adoption.files,...adoptedBrowser.files,...adoptedBrowser.screens,
   await outputIdentity(join(adoptionDirectory,'adoption-receiving-result.json')),
   await outputIdentity(join(directory,'adoption-browser','adoption-browser-result.json')),
   await outputIdentity(join(directory,'backend','receiving-result.json')),
   await outputIdentity(join(directory,'browser','browser-result.json'))];
  result={schema:SCHEMA,status:'COMPLETE_REQUIRES_VISUAL_INSPECTION',operationId:options.operationId,
   directory,sourceSha256:selected.sha256,sourceSelection:join(directory,'source-selection.json'),runtime,
   backend:{file:join(directory,'backend','receiving-result.json'),dossierId:backend.dossierId,revision:backend.revision},
   browser:{file:join(directory,'browser','browser-result.json'),status:browser.status,version:context.browser()?.version()??null},files,
   adoption:{backend:{file:join(adoptionDirectory,'adoption-receiving-result.json'),dossierId:adoption.dossierId,revision:adoption.authorRevision},
    browser:{file:join(directory,'adoption-browser','adoption-browser-result.json'),status:adoptedBrowser.status}},
   literalInspection:{status:'AWAITING_ACTUAL_REVIEWER_VIEW',original:browser.literalInspection,adoption:adoptedBrowser.literalInspection}};
  // Publish completion only after both original listeners and the owned browser close.
 }catch(e){
  primary=e;try{await atomic(join(directory,'foreground-error.json'),{schema:SCHEMA,operationId:options.operationId,
   message:e.message,stack:e.stack,sourceSha256:selected.sha256});}catch(retainError){primary=new AggregateError([e,retainError],'Original receiving failure and error retention failure',{cause:e});}throw primary;
 }finally{
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  const closed=await Promise.allSettled(closing());
  if(signalClose)await signalClose;
  const failures=closed.filter(x=>x.status==='rejected').map(x=>x.reason);
  if(failures.length)throw new AggregateError(primary?[primary,...failures]:failures,'Owned Research browser/listener cleanup failed',{cause:primary??failures[0]});
 }
 await retained(join(directory,'foreground-result.json'),result);return result;
}
export async function main(argv=process.argv.slice(2)){
 const {values:v}=parseArgs({args:argv,options:Object.fromEntries(['source-root','directory','operation','reviewer','python','playwright-module','chromium'].map(k=>[k,{type:'string'}]).concat([['lock-held',{type:'boolean',default:false}]])),strict:true});
 for(const key of ['source-root','directory','operation','reviewer','python','playwright-module','chromium'])need(v[key],'Missing --'+key);
 const directory=resolve(v.directory);await mkdir(directory,{recursive:true,mode:0o700});
 if(!v['lock-held']){
  await mkdir(join(directory,'backend'),{recursive:true,mode:0o700});
  const child=spawn('flock',['--no-fork','--nonblock',join(directory,'backend','course.lock'),process.execPath,fileURLToPath(import.meta.url),...argv,'--lock-held'],{stdio:'inherit'});
  const stop=()=>child.kill('SIGTERM');process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{const outcome=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});need(outcome.code===0&&!outcome.signal,'Original foreground child failed');}
  finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}return;
 }
 const result=await receiveComparisonForeground({sourceRoot:v['source-root'],directory,operationId:v.operation,
  reviewer:v.reviewer,python:v.python,playwrightModule:v['playwright-module'],chromium:v.chromium});
 process.stdout.write(json(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{
 process.stderr.write(json({error:e.message,stack:e.stack}));process.exitCode=1;
});
