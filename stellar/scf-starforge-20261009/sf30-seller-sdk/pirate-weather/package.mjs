// SPDX-License-Identifier: MIT
// Complete original source and state use the maintained streaming archive engine.
import {constants} from 'node:fs';
import {open,lstat,readdir,realpath,link,unlink,rename,mkdir,readFile} from 'node:fs/promises';
import {join,resolve,dirname,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {privateDirectory,readOwned,writeNew,atomicJSON,syncDir,stable,acquireWorkspaceLease} from '../stellar-expert/store.mjs';
import {BUNDLE_SCHEMA,WORKSPACE_SCHEMA,SOURCE_ROOT,configuration,contract,identity,bytes,hash,need,sha,uuid,whole} from './contract.mjs';
import {inspectPirateSource,SOURCE_FILES,absolute} from './managed.mjs';
const HERE=fileURLToPath(new URL('.',import.meta.url)),MAX=1024**3;
const APPLICATION='stellar-forge.merchant-distribution-manifest.v1';
const INSTALL='stellar-forge.pirate-weather-project-installation.v1';
function member(value){
 need(typeof value==='string'&&value&&!value.startsWith('/')&&!value.includes('\\')&&!/[\0-\x1f\x7f]/.test(value)&&value.split('/').every(x=>x&&x!=='.'&&x!=='..'),
  'PIRATE_PROJECT_PATH','Use a retained relative project path.');return value;
}
async function optional(path,max=64*1024*1024){try{return JSON.parse(await readOwned(path,max));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function pin(path,max=512*1024*1024,{privateFile=false}={}){
 need(await realpath(path)===resolve(path),'PIRATE_PROJECT_PATH','A source path changed.',409);
 const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const before=await fd.stat({bigint:true});
  need(before.isFile()&&before.size<=BigInt(max)&&(!privateFile||!(Number(before.mode)&0o077)),'PIRATE_PROJECT_FILE','A retained file changed type, size or access.',409);
  const sum=createHash('sha256'),git=createHash('sha1').update('blob '+before.size+'\0'),buffer=Buffer.alloc(65536);let count=0;
  for(;;){const part=await fd.read(buffer,0,buffer.length,count);if(!part.bytesRead)break;count+=part.bytesRead;sum.update(buffer.subarray(0,part.bytesRead));git.update(buffer.subarray(0,part.bytesRead));}
  const after=await fd.stat({bigint:true}),current=await lstat(path,{bigint:true});
  need(BigInt(count)===before.size&&['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k])&&current.dev===before.dev&&current.ino===before.ino&&!current.isSymbolicLink(),
   'PIRATE_PROJECT_CHANGED','The selected original source changed while reading.',409);
  return {bytes:count,sha256:sum.digest('hex'),gitBlob:git.digest('hex')};
 }finally{await fd.close();}
}
function archivePin(value){return {bytes:String(value.bytes),sha256:value.sha256};}
async function copyExact(source,target,expected){
 await privateDirectory(dirname(target),{create:true});
 try{const found=await pin(target);need(identity(archivePin(found))===identity(archivePin(expected)),'PIRATE_RECEIVED_FILE_CHANGED','An existing received member differs.',409);await syncDir(dirname(target));return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const before=await pin(source);need(identity(archivePin(before))===identity(archivePin(expected)),'PIRATE_PROJECT_CHANGED','The original selected member changed.',409);
 const temporary=target+'.part-'+randomUUID();let input,output;
 try{
  input=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));output=await open(temporary,'wx',0o600);
  const sum=createHash('sha256'),buffer=Buffer.alloc(65536);let offset=0;
  for(;;){const read=await input.read(buffer,0,buffer.length,offset);if(!read.bytesRead)break;sum.update(buffer.subarray(0,read.bytesRead));
   let n=0;while(n<read.bytesRead){const w=await output.write(buffer,n,read.bytesRead-n,offset+n);need(w.bytesWritten>0,'PIRATE_PROJECT_WRITE','The destination write stopped.',507);n+=w.bytesWritten;}offset+=read.bytesRead;}
  need(String(offset)===String(expected.bytes)&&sum.digest('hex')===expected.sha256,'PIRATE_PROJECT_CHANGED','The original member changed during copy.',409);
  await output.sync();await output.close();output=null;await input.close();input=null;
  need(identity(archivePin(await pin(source)))===identity(archivePin(before)),'PIRATE_PROJECT_CHANGED','The original member changed during copy.',409);
  try{await link(temporary,target);}catch(e){if(e.code!=='EEXIST')throw e;need(identity(archivePin(await pin(target)))===identity(archivePin(expected)),'PIRATE_RECEIVED_FILE_CHANGED','A receiving destination changed.',409);}
  await syncDir(dirname(target));
 }finally{await input?.close();await output?.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDir(dirname(target));}
}
async function immutable(path,value){
 const raw=bytes(value),saved=await optional(path);
 if(saved){need(stable(saved)===stable(value),'PIRATE_PROJECT_INTENT_CHANGED','This original source request has another retained intent.',409);await syncDir(dirname(path));return saved;}
 await privateDirectory(dirname(path),{create:true});const tmp=path+'.'+randomUUID()+'.tmp';
 try{await writeNew(tmp,raw);try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await readOwned(path,raw.length+1)).equals(raw),'PIRATE_PROJECT_INTENT_CHANGED','This original source request already differs.',409);}await syncDir(dirname(path));}
 finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDir(dirname(path));}
 return value;
}
async function python(action,input){
 const executable=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||process.env.PYTHON||'python3';
 const child=spawn(executable,['-B',join(HERE,'portable.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const out=[],err=[];let size=0,errors=0,primary=null;
 const done=new Promise((yes,no)=>{child.once('error',no);child.once('close',(code,signal)=>yes({code,signal}));});
 child.stdout.on('data',c=>{size+=c.length;if(size>96*1024*1024){primary??=Error('The complete project response exceeds its retained capacity.');child.kill('SIGTERM');}else out.push(c);});
 child.stderr.on('data',c=>{errors+=c.length;if(errors<=131072)err.push(c);});
 child.stdin.on('error',e=>{primary??=e;});child.stdin.end(JSON.stringify({action,...input}));
 const result=await done;if(primary)throw primary;
 if(result.code!==0){let detail;try{detail=JSON.parse(Buffer.concat(err));}catch{}
  throw Object.assign(new Error(detail?.message??'The original source archive operation did not complete.'),{code:detail?.error??'PIRATE_PROJECT_INTERRUPTED',status:409});}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(out)));
}
export async function inspectApplication(applicationSource){
 const directory=absolute(applicationSource);need(await realpath(directory)===directory,'PIRATE_APPLICATION_PATH','Select the actual original installed package.');
 const raw=await readFile(join(directory,'manifest.json'));need(raw.length<=32*1024*1024,'PIRATE_APPLICATION_MANIFEST','The selected source manifest is too large.');
 const manifest=JSON.parse(raw);need(manifest.schema===APPLICATION&&Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<18000&&manifest.packageFiles&&/^[a-f0-9]{40}$/.test(manifest.sourceCommit??''),
  'PIRATE_APPLICATION_MANIFEST','Select the original built merchant package and source manifest.');
 const files=[],seen=new Set(),add=async(path,expected,gitBlob)=>{
  member(path);need(!seen.has(path),'PIRATE_APPLICATION_MANIFEST','The package repeats a source path.');seen.add(path);
  const actual=await pin(join(directory,path));need(actual.sha256===expected.sha256&&(expected.bytes===undefined||actual.bytes===expected.bytes)&&(!gitBlob||actual.gitBlob===gitBlob),
   'PIRATE_APPLICATION_CHANGED','An included source differs from the selected original package.',409);
  files.push({path,bytes:String(actual.bytes),sha256:actual.sha256,...(gitBlob?{gitBlob}:{})});
 };
 await add('manifest.json',{sha256:hash(raw),bytes:raw.length});
 for(const file of manifest.files){
  need(file.packagePath==='source/'+member(file.path)&&/^[a-f0-9]{40}$/.test(file.gitBlob??'')&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,
   'PIRATE_APPLICATION_MANIFEST','The native package source declaration differs.');
  await add(file.packagePath,file,file.gitBlob);
 }
 const packageNames=Object.keys(manifest.packageFiles).sort();need(stable(packageNames)===stable(['LICENSE','README.md','package.json']),'PIRATE_APPLICATION_MANIFEST','Retain the complete original generated package files.');
 for(const name of packageNames)await add(name,{sha256:sha(manifest.packageFiles[name])});
 const observedFiles=(await walk(directory)).sort();need(stable(observedFiles)===stable([...seen].sort()),
  'PIRATE_APPLICATION_EXTRA_SOURCE','The installed package has unlisted source members; use the exact source-selected package.',409);
 const own=await inspectPirateSource(join(directory,'source',SOURCE_ROOT));
 for(const source of own.files)need(files.some(f=>f.path==='source/'+SOURCE_ROOT+'/'+source.path&&f.sha256===source.sha256&&Number(f.bytes)===source.bytes),
  'PIRATE_APPLICATION_CLOSURE','The selected package omits a required Pirate source file.',409);
 return {directory,manifestSha256:hash(raw),sourceCommit:manifest.sourceCommit,sourceRepository:manifest.sourceRepository,
  sourceSelection:manifest.sourceSelection??null,sourceIdentity:own.sha256,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
}
function counts(state){return {...Object.fromEntries(['captures','contractEditions','reportIds','reviews','datasets','releases','receipts'].map(k=>[k,state[k].length])),operations:Object.keys(state.operations).length};}
async function walk(root,prefix='',rows=[],skip=()=>false){
 for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
  const path=prefix?prefix+'/'+entry.name:entry.name;member(path);if(skip(path))continue;
  if(entry.isSymbolicLink())throw Object.assign(Error('A retained workspace member is a symlink.'),{code:'PIRATE_PROJECT_PATH',status:409});
  if(entry.isDirectory())await walk(root,path,rows,skip);else if(entry.isFile())rows.push(path);else throw Object.assign(Error('The retained workspace includes an unsupported live device or socket.'),{code:'PIRATE_PROJECT_LIVE_FILE',status:409});
 }return rows;
}
function transient(path){
 // These are exact control/lease names owned by the original host engines.
 const name=path.split('/').at(-1);
 return path==='connection.json'||path==='workspace.lock'||path==='workspace.json'||path==='project-installation.json'||
  path.startsWith('project-exports/')||path.startsWith('project-receiving/')||
  name==='publisher.lock'||name==='control.json'||name==='control.sock'||name==='control-token'||
  name==='dataset.lock'||name==='writer.lease'||name==='writer.lock'||/^\.writer-upgrade-[a-f0-9-]{36}$/.test(name)||/^\.state-[a-f0-9-]{36}\.json$/.test(name)||/^\.(v2-stage|stage)-[a-f0-9-]{36}$/.test(name)||name==='.sf82-state.lock.lifetime'||name==='.sf82-run.lock.lifetime'||
  /(^|\/)(state\.lock|run\.lock)(\/|$)/.test(path)||name.startsWith('.source-archive-')||
  /(^|\/)\.pending-[0-9a-f-]{36}$/.test(path)||/^project-uploads\/[a-f0-9-]{36}\.lock$/.test(path);
}
async function publisherBindings(root,state,{copyLeaseHeld=false}={}){
 const {releaseStatus}=await import('../../sf82-seller-pilot/releases.mjs');const selected=[];
 for(const item of state.datasets){
  const publisher=member(item.relativePublisherDirectory??item.relativeDirectory+'/publisher'),base=join(root,publisher);
  const draft=await optional(join(base,'drafts','workspace.json'));if(!draft)continue;
  const version=await optional(join(base,'dataset','state.json'));if(!version)continue;
  if(!copyLeaseHeld){const status=await releaseStatus(join(base,'releases'));
   need(status.runtime?.state==='STOPPED','PIRATE_PROJECT_RELEASE_RUNNING','Stop the original dataset release explicitly before exporting its complete workspace.',409);}
  const releases=[];
  for(const row of state.releases.filter(r=>r.datasetId===item.id)){
   const target=join(base,'releases','releases',row.id),native=await optional(join(target,'release.json'));
   need(native?.digest===row.digest&&native.dataset,'PIRATE_RELEASE_CHANGED','The original staged dataset release differs.',409);
   const pointer=await optional(join(target,'dataset-installation.json'),32768);
   releases.push({id:row.id,digest:row.digest,executionSha256:native.dataset.executionSha256,
    originalDatasetDirectory:native.dataset.datasetDirectory,previousInstallationSha256:pointer===null?null:identity(pointer)});
  }
  selected.push({datasetId:item.id,publisher,oldDatasetDirectory:draft.datasetDirectory,draftRevision:draft.revision,
   snapshot:version.current,datasetRevision:version.revision,releases});
 }return selected;
}
async function withNativeCopy(root,state,publishers,action){
 // First require explicit stop. Closing a borrower must not become an implicit
 // stop operation. Every mutable original native store is then held throughout
 // enumeration, hashing and copying through its own maintained kernel lease.
 const selected=await publisherBindings(root,state);await publishers.close();
 const {acquireWorkspace}=await import('../postgres/publisher/files.mjs');
 const {acquireDatasetLease}=await import('../dataset-refresh/writer-lease.mjs');
 const {withStoppedReleaseCopy}=await import('../../sf82-seller-pilot/releases.mjs');
 const ordered=selected.slice().sort((a,b)=>a.publisher.localeCompare(b.publisher));
 async function hold(i){
  if(i===ordered.length)return action();
  const item=ordered[i],base=join(root,member(item.publisher)),unlock=await acquireWorkspace(join(base,'drafts'));
  try{return await withStoppedReleaseCopy(join(base,'releases'),async()=>{
    const lease=acquireDatasetLease(join(base,'dataset'));
    try{lease.assertHeld();const value=await hold(i+1);lease.assertHeld();return value;}
    finally{await lease.close();}
  });}finally{await unlock();}
 }
 return hold(0);
}

const RUNTIME_FILES=Object.freeze(['source.tgz','preparation.json','runtime-profile.json','package.json','runtime-install.json',
 'install-state.json','package-lock.json','RUNBOOK.md','retained-lock-intent.json','retained-lock.json','retained-lock-source.json']);
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function withProjectRuntime(store,app,action){
 const installation=dirname(app.directory);
 if(await exists(join(installation,'source.tgz'))){
  need(join(installation,'package')===app.directory,'PIRATE_RUNTIME_SOURCE_PATH','Select the original installed package directory.',409);
  const {withRuntimeSourceCopy}=await import('../../distribution/runtime-install.mjs');
  return withRuntimeSourceCopy({directory:installation},async original=>{
   const {plan,profile,state,lockSha256}=original;
   need(plan.source.manifestSha256===app.manifestSha256&&plan.source.sourceCommit===app.sourceCommit,
     'PIRATE_RUNTIME_SOURCE_CHANGED','The original runtime archive differs from the selected application.',409);
   const files=[];
   for(const path of RUNTIME_FILES){const source=join(installation,path);if(await exists(source)){const value=await pin(source);files.push({path,source,...archivePin(value)});}}
   need(files.find(f=>f.path==='source.tgz')?.sha256===plan.archiveSha256&&
     files.find(f=>f.path==='runtime-profile.json')?.sha256===plan.profileSha256&&
     (lockSha256===null||files.find(f=>f.path==='package-lock.json')?.sha256===lockSha256),
     'PIRATE_RUNTIME_SOURCE_CHANGED','The original runtime profile or archive changed.',409);
   const runtime={status:lockSha256?'ORIGINAL_INSTALLATION_LOCK_RETAINED':'SOURCE_ARCHIVE_PROFILE_RETAINED',
     archiveSha256:plan.archiveSha256,sourceManifestSha256:app.manifestSha256,profileId:profile.profileId,
     sourceCommit:app.sourceCommit,installationId:plan.installationId,originalPhase:state.phase,
     selection:profile.selection,lockSha256,files:files.map(({source,...f})=>f)};
   return action({runtime,files});
  });
 }
 // A previously received project keeps its original archive/profile/lock as
 // immutable source evidence. Its old absolute plan is never opened as a runtime.
 const received=await optional(join(store.root,'project-installation.json'));
 if(received&&received.applicationDirectory===app.directory){
  const manifestPath=join(store.root,'installation-sources',sha(received.manifestSha256)+'.json'),
   raw=await readOwned(manifestPath,32*1024*1024);
  need(hash(raw)===received.manifestSha256,'PIRATE_RUNTIME_RECEIVING_SOURCE','The original receiving manifest changed.',409);
  const manifest=JSON.parse(raw);applicationMatches(manifest,app);
  const runtime=manifest.runtime,files=[];
  need(runtime&&Array.isArray(runtime.files),'PIRATE_RUNTIME_RECEIVING_SOURCE','Retain the original runtime source inventory.');
  for(const file of runtime.files){
   need(RUNTIME_FILES.includes(file.path),'PIRATE_RUNTIME_RECEIVING_SOURCE','An original runtime file is not supported.');
   const declared=manifest.files.find(f=>f.path==='runtime/'+file.path),source=join(dirname(app.directory),'runtime',file.path),actual=await pin(source);
   need(declared&&identity(archivePin(declared))===identity(archivePin(file))&&identity(archivePin(actual))===identity(archivePin(file)),
    'PIRATE_RUNTIME_RECEIVING_SOURCE','An original retained runtime source changed.',409);
   files.push({...file,source});
  }
  return action({runtime,files});
 }
 return action({runtime:{status:'SOURCE_PACKAGE_ONLY',files:[]},files:[]});
}

export async function exportProject({store,operation,applicationSource,publishers}){
 const root=await privateDirectory(join(store.root,'project-exports',operation.operationId),{create:true}),stage=await privateDirectory(join(root,'source'),{create:true});
 const app=await inspectApplication(applicationSource);const snapshot=await store.object(operation.context.snapshot.sha256),state=JSON.parse(snapshot);
 need(state.workspaceId===store.read().workspaceId&&state.revision===operation.expectedRevision,'PIRATE_PROJECT_STATE_CHANGED','The original export snapshot differs.',409);
 let plan=await optional(join(root,'plan.json'));
 await withProjectRuntime(store,app,async runtimeSource=>withNativeCopy(store.root,state,publishers,async()=>{
 if(!plan){
  const bindings=await publisherBindings(store.root,state,{copyLeaseHeld:true});
  const rows=[],sources=[],seen=new Map();
  const add=async(path,source,expected)=>{const observed=expected??await pin(source,512*1024*1024,{privateFile:path.startsWith('workspace/')});
   if(seen.has(path)){need(identity(seen.get(path))===identity(archivePin(observed)),'PIRATE_PROJECT_SOURCE_CONFLICT','An original project member has different source bindings.',409);return;}
   seen.set(path,archivePin(observed));rows.push({path,bytes:String(observed.bytes),sha256:observed.sha256});sources.push({path,source,bytes:String(observed.bytes),sha256:observed.sha256});};
  await add('workspace/workspace.json',join(store.root,'objects',operation.context.snapshot.sha256),{bytes:snapshot.length,sha256:hash(snapshot)});
  const allowed=new Set(['objects','editions','datasets','releases','exports','receipts','responses','project-uploads','installation-sources','received-inputs']);
  for(const top of await readdir(store.root,{withFileTypes:true})){
   if(!allowed.has(top.name))continue;need(top.isDirectory()&&!top.isSymbolicLink(),'PIRATE_PROJECT_PATH','The original state root differs.');
   for(const suffix of await walk(join(store.root,top.name),'',[],x=>transient(top.name+'/'+x))){const rel=top.name+'/'+suffix;await add('workspace/'+rel,join(store.root,rel));}
  }
  const priorFiles=Object.values(state.fileIndex??{});
  for(const prior of Object.values(state.operations))if(prior.context?.projectExport){
   const retained=JSON.parse(await store.object(prior.context.projectExport.sha256));
   need(retained.operationId===prior.operationId,'PIRATE_PROJECT_REQUEST_CHANGED','A prepared original archive belongs to another request.',409);
   priorFiles.push(...retained.files);
  }
  for(const file of priorFiles)if(file.storage?.kind==='project'){
   const rel=member(file.storage.relativePath);need(rel.startsWith('project-exports/'),'PIRATE_PROJECT_OUTPUT_PATH','The prior complete output path differs.');
   await add('workspace/'+rel,join(store.root,rel),file);
  }
  for(const source of app.files)await add('application/'+source.path,join(app.directory,source.path),source);
  const runtime=runtimeSource.runtime;
  for(const file of runtimeSource.files)await add('runtime/'+file.path,file.source,file);
  rows.sort((a,b)=>a.path.localeCompare(b.path));need(rows.length<20000&&rows.reduce((n,r)=>n+Number(r.bytes),0)<=MAX,'PIRATE_PROJECT_CAPACITY','The complete selected project exceeds 1 GiB or 20,000 members.',413);
  const manifest={schema:BUNDLE_SCHEMA,title:operation.payload.title,createdAt:operation.createdAt,operationId:operation.operationId,
   workspace:{workspaceId:state.workspaceId,revision:state.revision,stateSha256:hash(snapshot),counts:counts(state)},
   application:{manifestSha256:app.manifestSha256,sourceCommit:app.sourceCommit,sourceRepository:app.sourceRepository,sourceSelection:app.sourceSelection,sourceIdentity:app.sourceIdentity},
   runtime,publisherBindings:bindings,files:rows,
   receiving:{authority:'CURRENT_TRUSTED_APPLICATION',native:'Original SF30 publisher relocation and SF82 dataset installation',providerInvocations:0,automaticNativeStart:false}};
  plan={schema:'stellar-forge.pirate-weather-export-plan.v1',operationId:operation.operationId,applicationDirectory:app.directory,applicationSha256:app.manifestSha256,manifest,sources};
  await immutable(join(root,'plan.json'),plan);
 }
 need(plan.operationId===operation.operationId&&plan.applicationSha256===app.manifestSha256&&plan.manifest.workspace.stateSha256===hash(snapshot)&&plan.manifest.title===operation.payload.title,'PIRATE_PROJECT_PLAN_CHANGED','Retain the selected original application and export plan.',409);
 for(const source of plan.sources)await copyExact(source.source,join(stage,member(source.path)),source);
 }));
 const output=join(root,'Pirate_Weather_Complete_Project.zip'),result=await python('archive',{manifest:plan.manifest,inventory:plan.manifest.files,source:stage,destination:output});
 const file={id:identity({operationId:operation.operationId,sha256:result.archive.sha256}),filename:'Pirate_Weather_Complete_Project.zip',type:'application/zip',
  bytes:Number(result.archive.bytes),sha256:result.archive.sha256,storage:{kind:'project',relativePath:relative(store.root,output)},role:'complete-source-project'};
 return {schema:BUNDLE_SCHEMA,operationId:operation.operationId,createdAt:plan.manifest.createdAt,workspaceId:state.workspaceId,revision:state.revision,application:plan.manifest.application,
  counts:plan.manifest.workspace.counts,members:result.members,files:[file],providerInvocations:0};
}
function publicPreview(result){
 return {schema:BUNDLE_SCHEMA,archive:result.archive,manifestSha256:result.manifestSha256,title:result.manifest.title,createdAt:result.manifest.createdAt,
  workspace:result.manifest.workspace,application:result.manifest.application,runtime:result.manifest.runtime,
  publisherBindings:result.manifest.publisherBindings,members:result.members,providerInvocations:0,automaticNativeStart:false};
}
function applicationMatches(manifest,app){
 need(manifest.application.manifestSha256===app.manifestSha256&&manifest.application.sourceIdentity===app.sourceIdentity,
  'PIRATE_RECEIVING_SOURCE_EDITION','Use the same trusted installed application edition as the selected project.',409);
 const actual=manifest.files.filter(f=>f.path.startsWith('application/')).map(f=>({path:f.path.slice(12),bytes:f.bytes,sha256:f.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
 const expected=app.files.map(({path,bytes,sha256})=>({path,bytes,sha256}));need(stable(actual)===stable(expected),'PIRATE_RECEIVING_SOURCE_CLOSURE','The complete included application differs from the trusted source manifest.',409);
}
export async function inspectProject({archive,applicationSource}){
 absolute(archive);need(applicationSource,'PIRATE_APPLICATION_REQUIRED','Use the selected trusted installed merchant package.',409);
 const app=await inspectApplication(applicationSource),result=await python('inspect',{archive});applicationMatches(result.manifest,app);
 const view=publicPreview(result);return {...view,previewSha256:identity(view)};
}
export async function retainProjectUpload(directory,{id,expectedSha256,stream}){
 uuid(id);sha(expectedSha256);const root=await privateDirectory(join(directory,'project-uploads'),{create:true}),control=join(root,id+'.lock'),lease=await acquireWorkspaceLease(control);
 const file=join(root,id+'.zip'),receiptPath=join(root,id+'.json');
 try{
  const old=await optional(receiptPath);
  if(old){need(old.id===id&&old.sha256===expectedSha256,'PIRATE_UPLOAD_ID_REUSED','This original upload UUID belongs to another file.',409);
   need(identity(archivePin(await pin(file,MAX)))===identity(archivePin(old)),'PIRATE_UPLOAD_CHANGED','The retained upload differs.',409);stream.resume?.();return old;}
  const intent={id,sha256:expectedSha256};await immutable(join(root,id+'.intent.json'),intent);
  if(await optional(join(root,id+'.completed.json'))){const observed=await pin(file,MAX);need(observed.sha256===expectedSha256,'PIRATE_UPLOAD_CHANGED','The original upload differs.',409);
   const saved={id,bytes:observed.bytes,sha256:observed.sha256};await immutable(receiptPath,saved);stream.resume?.();return saved;}
  const partial=join(root,id+'.partial');let prefix=0,input;
  try{input=await open(partial,constants.O_RDWR|(constants.O_NOFOLLOW??0));const st=await input.stat({bigint:true});
   need(st.isFile()&&(st.mode&0o077n)===0n&&st.size<=BigInt(MAX),'PIRATE_UPLOAD_STAGE','The original upload staging file differs.',409);
   if(st.nlink!==1n){const published=await lstat(file,{bigint:true});need(st.nlink===2n&&!published.isSymbolicLink()&&st.ino===published.ino&&st.dev===published.dev,'PIRATE_UPLOAD_STAGE','The original upload has another external file link.',409);}
   prefix=Number(st.size);}
  catch(e){if(e.code!=='ENOENT')throw e;input=await open(partial,'wx+',0o600);}
  const sum=createHash('sha256');let received=0;
  try{
   for await(const value of stream){const chunk=Buffer.from(value);need(received+chunk.length<=MAX,'PIRATE_PROJECT_CAPACITY','The original complete project exceeds 1 GiB.',413);sum.update(chunk);
    const compared=Math.min(chunk.length,Math.max(0,prefix-received));if(compared){const retained=Buffer.alloc(compared),r=await input.read(retained,0,compared,received);need(r.bytesRead===compared&&retained.equals(chunk.subarray(0,compared)),'PIRATE_UPLOAD_PREFIX','The resumed upload differs from its original bytes.',409);}
    let at=compared;while(at<chunk.length){const w=await input.write(chunk,at,chunk.length-at,received+at);need(w.bytesWritten>0,'PIRATE_UPLOAD_WRITE','The upload destination stopped accepting bytes.',507);at+=w.bytesWritten;}received+=chunk.length;
   }
   need(received>=prefix&&sum.digest('hex')===expectedSha256,'PIRATE_UPLOAD_CHANGED','The complete upload differs from the selected SHA256.',409);await input.sync();
  }finally{await input.close();}
  try{await link(partial,file);}catch(e){if(e.code!=='EEXIST')throw e;need((await pin(file,MAX)).sha256===expectedSha256,'PIRATE_UPLOAD_CHANGED','The original upload destination differs.',409);}
  await syncDir(root);await immutable(join(root,id+'.completed.json'),intent);await unlink(partial).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDir(root);
  const saved={id,bytes:received,sha256:expectedSha256};await immutable(receiptPath,saved);return saved;
 }finally{await lease.close();}
}
async function upload(directory,id,expected){
 const root=join(directory,'project-uploads'),receipt=await optional(join(root,uuid(id)+'.json'));
 need(receipt?.id===id&&receipt.sha256===sha(expected),'PIRATE_UPLOAD_REQUIRED','Finish retaining the exact complete project file first.',409);
 const archive=join(root,id+'.zip');need(identity(archivePin(await pin(archive,MAX)))===identity(archivePin(receipt)),'PIRATE_UPLOAD_CHANGED','The original upload bytes differ.',409);return {archive,receipt};
}
export async function previewUpload(directory,{uploadId,expectedArchiveSha256,applicationSource}){
 const selected=await upload(directory,uploadId,expectedArchiveSha256);return inspectProject({archive:selected.archive,applicationSource});
}
async function verifyState(root,manifest){
 const raw=await readOwned(join(root,'workspace.json'),64*1024*1024),state=JSON.parse(raw);
 need(state.schema===WORKSPACE_SCHEMA&&state.workspaceId===manifest.workspace.workspaceId&&state.revision===manifest.workspace.revision&&hash(raw)===manifest.workspace.stateSha256,
  'PIRATE_RECEIVED_STATE_CHANGED','The received original workspace differs.',409);configuration(state.providerReference);
 const members=new Map(manifest.files.map(f=>[f.path,f]));
 for(const [id,op] of Object.entries(state.operations)){
  uuid(id);need(op.operationId===id&&identity({action:op.action,payload:op.payload})===op.payloadSha256,'PIRATE_REQUEST_CHANGED','An original saved request differs.',409);
  for(const ref of [op.result,op.context?.snapshot,op.context?.projectExport])if(ref)need(members.get('workspace/objects/'+sha(ref.sha256))?.sha256===ref.sha256&&Number(members.get('workspace/objects/'+ref.sha256)?.bytes)===ref.bytes,
    'PIRATE_RECEIVED_SOURCE_MISSING','An original operation source object is missing.',409);
 }
 for(const value of [...state.contractEditions,...state.captures,...state.reportIds]){
  sha(value.id);need(members.has('workspace/editions/'+value.id+'.json'),'PIRATE_RECEIVED_EDITION_MISSING','An original source edition is missing.',409);
 }
 for(const file of Object.values(state.fileIndex??{}))if(file.storage.kind==='object')need(members.get('workspace/objects/'+sha(file.storage.sha256))?.sha256===file.sha256,
  'PIRATE_RECEIVED_SOURCE_MISSING','An original downloadable output is missing.',409);
 return state;
}
async function verifyExtractedPrefix(root,manifest,planSha256){
 const mutable=new Map(),pointers=new Set();
 for(const item of manifest.publisherBindings??[]){
  mutable.set('workspace/'+item.publisher+'/drafts/workspace.json',item);
  for(const r of item.releases)pointers.add('workspace/'+item.publisher+'/releases/releases/'+r.id+'/dataset-installation.json');
 }
 for(const file of manifest.files){
  if(file.path.startsWith('application/'))continue; // Full trusted source was just rechecked.
  if(pointers.has(file.path))continue; // Original CAS or exact new idempotent sidecar is checked by SF82.
  const actual=await pin(join(root,member(file.path)));
  if(actual.sha256===file.sha256&&String(actual.bytes)===file.bytes)continue;
  const item=mutable.get(file.path);need(item,'PIRATE_RECEIVED_SOURCE_CHANGED','A received original member changed before completion.',409);
  const current=await optional(join(root,file.path)),op=identity({planSha256,publisher:item.publisher}),history=current.datasetRelocations??[];
  const last=history.at(-1);
  need(current.datasetDirectory===join(root,'workspace',item.publisher,'dataset')&&current.revision===item.draftRevision+1&&
   last?.operationId===op&&last.previousRevision===item.draftRevision&&last.from===item.oldDatasetDirectory&&last.to===current.datasetDirectory&&
   last.sourcePlanSha256===planSha256&&last.snapshot===item.snapshot&&last.datasetRevision===item.datasetRevision,
   'PIRATE_RECEIVED_PUBLISHER_CHANGED','The original publisher relocation does not match this receiving plan.',409);
  // Strip only that exact native append and restore its original binding/revision.
  const restored={...current,datasetDirectory:item.oldDatasetDirectory,revision:item.draftRevision,datasetRelocations:history.slice(0,-1)};
  // The pure projection is compared below to the retained original object, not to
  // an invented JSON serialization. Its original bytes stay in the source ZIP.
  mutable.set(file.path,{...item,restored});
 }
 return mutable;
}
async function adoptReceivedDatasets(root,manifest,manifestFile,planSha256){
 const {openPublisherDrafts}=await import('../dataset-refresh/workspace-state.mjs');
 const {installDatasetReleaseStore}=await import('../../sf82-seller-pilot/releases.mjs');
 const outcomes=[];
 for(const item of manifest.publisherBindings??[]){
  const base=join(root,member(item.publisher)),target=join(base,'dataset'),draftDirectory=join(base,'drafts');
  const current=await optional(join(draftDirectory,'workspace.json')),operationId=identity({planSha256,publisher:item.publisher});
  need(current,'PIRATE_PUBLISHER_SOURCE_MISSING','The original publisher state is missing.',409);
  const drafts=await openPublisherDrafts({directory:draftDirectory,datasetDirectory:current.datasetDirectory});
  let publisher;try{publisher=await drafts.adoptDatasetDirectory({datasetDirectory:target,expectedDirectory:item.oldDatasetDirectory,
   expectedRevision:item.draftRevision,expectedSnapshot:item.snapshot,expectedDatasetRevision:item.datasetRevision,
   sourceManifestSha256:hash(await readOwned(manifestFile,32*1024*1024)),sourcePlanSha256:planSha256,operationId});}finally{await drafts.close();}
  const installed=[];
  for(const release of item.releases){
   const result=await installDatasetReleaseStore(join(base,'releases'),release.id,{datasetDirectory:target,expectedExecutionSha256:release.executionSha256,
    expectedDatasetDirectory:release.originalDatasetDirectory,expectedSnapshot:item.snapshot,expectedRevision:item.datasetRevision,
    previousInstallationSha256:release.previousInstallationSha256,operationId:identity({planSha256,release:release.id,publisher:item.publisher}),
    source:{schema:BUNDLE_SCHEMA,manifestFile,manifestSha256:hash(await readOwned(manifestFile,32*1024*1024)),planSha256,datasetPrefix:'workspace/'+item.publisher+'/dataset'}});
   installed.push({releaseId:release.id,installation:result.installation});
  }
  // Transport-only changed/reused flags are not part of the saved receiving identity.
  outcomes.push({datasetId:item.datasetId,publisher:{operationId,publisherDirectory:draftDirectory,datasetDirectory:target,
   originalRevision:item.draftRevision,revision:item.draftRevision+1,snapshot:item.snapshot,datasetRevision:item.datasetRevision,
   sourceManifestSha256:hash(await readOwned(manifestFile,32*1024*1024)),sourcePlanSha256:planSha256},installed});
 }return outcomes;
}
export async function receiveProject({store,operation,applicationSource}){
 const p=operation.payload,selected=await upload(store.root,p.uploadId,p.expectedArchiveSha256),view=await inspectProject({archive:selected.archive,applicationSource});
 need(view.previewSha256===p.expectedPreviewSha256,'PIRATE_PROJECT_PREVIEW_CHANGED','Review this exact complete project before receiving it.',409);
 const root=await privateDirectory(join(store.root,'project-receiving',selected.receipt.sha256),{create:true}),receiptPath=join(root,'RECEIVED.json');
 const existing=await optional(receiptPath);
 if(existing){need(existing.archive.sha256===selected.receipt.sha256&&existing.application.manifestSha256===view.application.manifestSha256,'PIRATE_RECEIVING_CHANGED','The existing received project differs.',409);return existing;}
 const intent={schema:'stellar-forge.pirate-weather-receiving-intent.v1',operationId:operation.operationId,archive:archivePin(selected.receipt),previewSha256:view.previewSha256,actor:p.actor,note:p.note};
 await immutable(join(root,'RECEIVING_INTENT.json'),intent);
 const progress=await optional(join(root,'SOURCE_EXTRACTED.json'));let source;
 if(!progress){source=await python('extract',{archive:selected.archive,destination:root});applicationMatches(source.manifest,await inspectApplication(applicationSource));
  await verifyState(join(root,'workspace'),source.manifest);await immutable(join(root,'SOURCE_EXTRACTED.json'),{archive:source.archive,manifestSha256:source.manifestSha256});
 }else{
  source=await python('inspect',{archive:selected.archive});need(identity(source.archive)===identity(progress.archive)&&source.manifestSha256===progress.manifestSha256,'PIRATE_RECEIVING_CHANGED','The original receiving source differs.',409);
  // Source extraction is complete. Native relocation may already have advanced
  // its own authenticated metadata; do not overwrite it by extracting again.
 }
 const manifest=source.manifest,workspace=join(root,'workspace');
 const copiedApp=await inspectApplication(join(root,'application'));applicationMatches(manifest,copiedApp);
 const originalManifest=await readOwned(join(root,'source-handover.json'),32*1024*1024);need(hash(originalManifest)===source.manifestSha256,'PIRATE_RECEIVING_MANIFEST_CHANGED','The original manifest receipt differs.',409);
 const manifestFile=join(workspace,'installation-sources',source.manifestSha256+'.json');await privateDirectory(dirname(manifestFile),{create:true});
 const temp=join(root,'source-handover.json');await copyExact(temp,manifestFile,{bytes:originalManifest.length,sha256:source.manifestSha256});
 const planSha256=identity({archive:source.archive,manifestSha256:source.manifestSha256,destination:workspace,publisherBindings:manifest.publisherBindings});
 const changed=await verifyExtractedPrefix(root,manifest,planSha256);
 for(const [path,value] of changed)if(value.restored){
  const original=JSON.parse(Buffer.from((await python('member',{archive:selected.archive,expectedArchiveSha256:selected.receipt.sha256,member:path})).data,'base64'));
  const normalized={...original,datasetRelocations:original.datasetRelocations??[]};
  need(stable(normalized)===stable(value.restored),'PIRATE_RECEIVED_PUBLISHER_CHANGED','The receiving would replace prior publisher source or decisions.',409);
 }
 const bindings=await adoptReceivedDatasets(workspace,manifest,manifestFile,planSha256);
 const installationPath=join(workspace,'project-installation.json'),priorInstallation=await optional(installationPath);
 let installation={schema:INSTALL,workspaceId:manifest.workspace.workspaceId,archive:source.archive,manifestSha256:source.manifestSha256,planSha256,
  originalRevision:manifest.workspace.revision,application:manifest.application,applicationDirectory:join(root,'application'),
  originalOperationId:operation.operationId,bindings,providerInvocations:0,nativeControlInvocations:0};
 if(priorInstallation){
  const {bindings:beforeBindings,...before}=priorInstallation,{bindings:afterBindings,...after}=installation;
  need(stable(before)===stable(after)&&stable(beforeBindings)===stable(afterBindings),'PIRATE_INSTALLATION_CHANGED','The original completed native relocation differs.',409);
  installation=priorInstallation;
 }
 await immutable(installationPath,installation);
 const receipt={schema:'stellar-forge.pirate-weather-project-received.v1',operationId:operation.operationId,archive:source.archive,
  manifestSha256:source.manifestSha256,planSha256,workspaceId:manifest.workspace.workspaceId,revision:manifest.workspace.revision,counts:manifest.workspace.counts,
  application:manifest.application,relativeDirectory:relative(store.root,root),actor:p.actor,note:p.note,receivedAt:operation.createdAt,
  installationSha256:identity(installation),providerInvocations:0,nativeControlInvocations:0};
 await immutable(receiptPath,receipt);return receipt;
}
export async function openReceivedProject(directory,receipt){
 need(receipt?.schema==='stellar-forge.pirate-weather-project-received.v1','PIRATE_RECEIVING_REQUIRED','Select an accepted original project receipt.',409);
 const root=join(directory,member(receipt.relativeDirectory)),retained=await optional(join(root,'RECEIVED.json'));
 need(stable(retained)===stable(receipt),'PIRATE_RECEIVING_CHANGED','The original receiving receipt differs.',409);
 const applicationDirectory=join(root,'application'),app=await inspectApplication(applicationDirectory);
 need(app.manifestSha256===receipt.application.manifestSha256&&app.sourceIdentity===receipt.application.sourceIdentity,'PIRATE_RECEIVING_SOURCE_CHANGED','The received included source differs.',409);
 const workspaceDirectory=join(root,'workspace'),state=await optional(join(workspaceDirectory,'workspace.json'));
 need(state?.schema===WORKSPACE_SCHEMA&&state.workspaceId===receipt.workspaceId&&state.revision>=receipt.revision,'PIRATE_RECEIVING_STATE_CHANGED','The received original workspace identity changed.',409);
 return {root,workspaceDirectory,applicationDirectory,receipt};
}
export async function readProjectSource(store,value){
 need(value.storage?.kind==='project','PIRATE_FILE_STORAGE','Select a retained project output.');
 const path=join(store.root,member(value.storage.relativePath)),observed=await pin(path,MAX+16*1024*1024);
 need(observed.bytes===value.bytes&&observed.sha256===value.sha256,'PIRATE_PROJECT_CHANGED','The complete project file differs.',409);return {...value,path};
}
export async function readProjectFile(store,value){
 const source=await readProjectSource(store,value);need(source.bytes<=256*1024*1024,'PIRATE_CHUNKED_DOWNLOAD_REQUIRED','Use the original chunked project download.',413);
 return {descriptor:value,bytes:await readOwned(source.path,256*1024*1024)};
}

/** Prepare an explicitly selected received project's original runtime archive
 * and lock in a fresh native installation. No dependency or provider call runs.
 * The copied old host plan remains immutable evidence in the received project.
 */
export async function prepareReceivedRuntime({receivedDirectory,applicationSource,directory,operationId}={}){
 const root=await privateDirectory(absolute(receivedDirectory)),target=absolute(directory);uuid(operationId);
 need(target!==root&&!target.startsWith(root+'/')&&!root.startsWith(target+'/'),
  'PIRATE_RUNTIME_DESTINATION','Choose a separate new native installation directory.',409);
 const receipt=await optional(join(root,'RECEIVED.json'));
 need(receipt?.schema==='stellar-forge.pirate-weather-project-received.v1',
  'PIRATE_RECEIVING_REQUIRED','Finish the selected project receiving operation before preparing its runtime.',409);
 const manifestFile=join(root,'source-handover.json'),raw=await readOwned(manifestFile,32*1024*1024);
 need(hash(raw)===receipt.manifestSha256,'PIRATE_RECEIVING_MANIFEST_CHANGED','The original receiving manifest differs.',409);
 const manifest=JSON.parse(raw),app=await inspectApplication(applicationSource);
 applicationMatches(manifest,app);
 const included=await inspectApplication(join(root,'application'));applicationMatches(manifest,included);
 need(receipt.workspaceId===manifest.workspace.workspaceId&&receipt.revision===manifest.workspace.revision&&
  receipt.application.manifestSha256===app.manifestSha256,
  'PIRATE_RECEIVING_CHANGED','The original project receiving identity differs.',409);
 const runtime=manifest.runtime,selected=new Map();
 need(runtime&&Array.isArray(runtime.files)&&runtime.files.length>0,
  'PIRATE_RUNTIME_ARCHIVE_REQUIRED','This project contains source only. Retain the original source-selected runtime archive/profile before cold preparation.',409);
 for(const row of runtime.files){
  need(RUNTIME_FILES.includes(row.path)&&!selected.has(row.path),'PIRATE_RUNTIME_SOURCE_CHANGED','The original runtime source inventory differs.',409);
  const source=join(root,'runtime',row.path),declared=manifest.files.find(f=>f.path==='runtime/'+row.path),actual=await pin(source);
  need(declared&&identity(archivePin(declared))===identity(archivePin(row))&&identity(archivePin(actual))===identity(archivePin(row)),
   'PIRATE_RUNTIME_SOURCE_CHANGED','The original retained runtime bytes differ.',409);
  selected.set(row.path,{...row,source});
 }
 const archive=selected.get('source.tgz'),profileFile=selected.get('runtime-profile.json');
 need(archive?.sha256===runtime.archiveSha256&&profileFile&&runtime.sourceManifestSha256===app.manifestSha256&&
  runtime.sourceCommit===app.sourceCommit,'PIRATE_RUNTIME_SOURCE_CHANGED','The original runtime archive belongs to another application.',409);
 const profile=JSON.parse(await readOwned(profileFile.source,4*1024*1024));
 const {verifyRuntimeProfile}=await import('../../distribution/runtime-profile.mjs');verifyRuntimeProfile(profile);
 need(profile.profileId===runtime.profileId&&profile.source.sourceCommit===app.sourceCommit&&
  stable(profile.selection)===stable(runtime.selection),
  'PIRATE_RUNTIME_PROFILE_CHANGED','The original source-selected dependency profile differs.',409);
 const lock=selected.get('package-lock.json')??null;
 need((lock?.sha256??null)===(runtime.lockSha256??null),
  'PIRATE_RUNTIME_LOCK_CHANGED','The original dependency lock binding differs.',409);
 // The compressed source is bound to the exact trusted application BEFORE
 // prepareRuntimeInstall reads any selected runtime declarations from it.
 const sourcePreview=await python('runtime-source',{archive:archive.source,expectedArchiveSha256:archive.sha256,
  expectedManifestSha256:app.manifestSha256});
 need(sourcePreview.sourceCommit===app.sourceCommit,'PIRATE_RUNTIME_SOURCE_CHANGED','The original compressed source commit differs.',409);
 const operations=await privateDirectory(join(root,'runtime-preparations'),{create:true}),lease=await acquireWorkspaceLease(join(operations,operationId+'.lock'));
 try{
  const binding={schema:'stellar-forge.pirate-weather-runtime-preparation.v1',operationId,directory:target,
   receivedDirectory:root,workspaceId:receipt.workspaceId,projectArchiveSha256:receipt.archive.sha256,
   sourceReceiptSha256:receipt.manifestSha256,sourceManifestSha256:app.manifestSha256,sourceCommit:app.sourceCommit,
   archiveSha256:archive.sha256,profileId:profile.profileId,lockSha256:lock?.sha256??null,selection:profile.selection};
  await immutable(join(operations,operationId+'.json'),binding);
  const {prepareRuntimeInstall,retainRuntimeLock,inspectRuntimeInstall}=await import('../../distribution/runtime-install.mjs');
  const existing=await exists(target);
  if(!existing){
   await prepareRuntimeInstall({directory:target,archive:archive.source,sha256:archive.sha256,...profile.selection,
    python:process.env.CODEX_PRIMARY_RUNTIME_PYTHON||process.env.PYTHON||'python3'});
  }else{
   const plan=await optional(join(target,'runtime-install.json'));
   need(plan,'PIRATE_RUNTIME_PREPARATION_INCOMPLETE',
    'Preserve this interrupted native preparation. Use the original runtime-install recover --prepare-only into a new directory, then retain the same original lock before installing.',409);
   need(plan.directory===target&&plan.profileId===profile.profileId&&plan.archiveSha256===archive.sha256&&
    plan.source?.manifestSha256===app.manifestSha256&&plan.source?.sourceCommit===app.sourceCommit,
    'PIRATE_RUNTIME_DESTINATION_CHANGED','The selected destination contains another source or profile.',409);
  }
  let retained=null;
  if(lock)retained=await retainRuntimeLock({directory:target,lockFile:lock.source,expectedLockSha256:lock.sha256,
    expectedProfileId:profile.profileId,expectedSourceManifestSha256:app.manifestSha256,expectedArchiveSha256:archive.sha256,
    sourceReceipt:manifestFile,expectedSourceReceiptSha256:receipt.manifestSha256,operationId});
  const observed=await inspectRuntimeInstall({directory:target,load:false,source:true});
  need(observed.profileId===profile.profileId&&observed.sourceCommit===app.sourceCommit&&observed.sourceVerified===true,
   'PIRATE_RUNTIME_PREPARATION_CHANGED','The prepared native source or profile differs.',409);
  const result={...binding,status:lock?'SOURCE_PREPARED_LOCK_RETAINED':'SOURCE_PREPARED_WITHOUT_RETAINED_LOCK',
    sourceRoot:observed.sourceRoot,dependencyRoot:observed.dependencyRoot,entrypoint:observed.entrypoint,
    lockReceipt:retained?.receipt??null,providerInvocations:0,dependencyInstallInvocations:0,
    next:{command:'runtime-install install',directory:target,lockBehavior:lock?'npm ci uses the exact retained lock':'The original installer resolves and retains a new lock'}};
  const resultPath=join(operations,operationId+'.result.json'),saved=await optional(resultPath);
  if(saved){need(stable(saved)===stable(result),'PIRATE_RUNTIME_PREPARATION_CHANGED','The original prepared result differs.',409);await syncDir(operations);}
  else await immutable(resultPath,result);
  return {...result,reused:!!saved,currentPhase:observed.status,ready:observed.ready};
 }finally{await lease.close();}
}
