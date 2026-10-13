import {readFile,writeFile,open,mkdir,rename,rm,lstat,readdir,statfs} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {openEdition,analyzeEdition,retainEdition} from './maritime-native.mjs';
import {validateProject,analyzeProject,projectRowsCSV,projectHTML} from './maritime-project-analysis.mjs';

import {saveProjectWorkspace,receiveProjectWorkspace} from './maritime-project-workspace.mjs';

const MODULE_ROOT=dirname(fileURLToPath(import.meta.url));
const SOURCE_FILES=['maritime-analysis.mjs','maritime-native.mjs','maritime-cli.mjs',
 'maritime-project-analysis.mjs','maritime-project-native.mjs','maritime-project-cli.mjs',
 'maritime-workbench.html','build-workbench.mjs','maritime-project-workspace.mjs','maritime-project-workbench.js','PROJECT_GUIDE.md','OPERATOR_GUIDE.md','AGENTS.md'];
const MAX_FILE_BYTES=128*1024*1024;
const MAX_PROJECT_BYTES=2*1024*1024*1024;
const MAX_CELLS=500000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(value,message)=>{if(!value)throw new Error(message)};
const canonical=value=>JSON.stringify(value===null||typeof value!=='object'?value:
 Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):
 Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])));
const equal=(a,b)=>canonical(a)===canonical(b);
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const safeName=name=>typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)&&name!=='.'&&name!=='..';
const safeRelative=name=>typeof name==='string'&&name.split('/').every(safeName)&&!name.includes('\\');
async function exists(path){try{await lstat(path);return true}catch(error){if(error.code==='ENOENT')return false;throw error}}
async function directory(path){
 const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink(),'Expected a real directory: '+path);return s;
}
async function read(path,max=MAX_FILE_BYTES){
 const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'Expected a bounded regular file: '+path);
 const bytes=await readFile(path),after=await lstat(path);
 need(s.dev===after.dev&&s.ino===after.ino&&s.size===after.size&&s.mtimeMs===after.mtimeMs&&s.ctimeMs===after.ctimeMs&&bytes.length===s.size,'File changed while receiving: '+path);
 return bytes;
}
async function readJSON(path,max=16*1024*1024){return JSON.parse(decode(await read(path,max)))}
async function syncDirectory(path){const fd=await open(path,'r');try{await fd.sync()}finally{await fd.close()}}
async function put(path,body){
 const bytes=Buffer.isBuffer(body)?body:Buffer.from(body,'utf8');
 need(bytes.length<=MAX_FILE_BYTES,'Generated member exceeds the 128 MiB file limit: '+path);
 await mkdir(dirname(path),{recursive:true});
 if(await exists(path)){need((await read(path)).equals(bytes),'Existing staged member differs: '+path);return}
 const capacity=await statfs(dirname(path));need(Number(capacity.bavail)*Number(capacity.bsize)>=bytes.length+4096,'Insufficient available disk space for member: '+path);
 const temp=path+'.writing-'+randomUUID(),fd=await open(temp,'wx',0o600);
 try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
 await rename(temp,path);await syncDirectory(dirname(path));
}
async function fileIdentity(path){const bytes=await read(path);return {bytes:bytes.length,sha256:sha(bytes)}}
async function walk(root,prefix=''){
 const result=[];
 for(const item of (await readdir(join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  need(safeName(item.name),'Unsafe project member name');
  const name=prefix?prefix+'/'+item.name:item.name,p=join(root,name),s=await lstat(p);
  need(!s.isSymbolicLink(),'Project contains a symlink: '+name);
  if(s.isDirectory())result.push(...await walk(root,name));
  else{need(s.isFile(),'Project contains a non-file member: '+name);result.push(name)}
 }
 return result;
}
async function moduleSources(){
 const result={};
 for(const name of SOURCE_FILES)result[name]=await read(join(MODULE_ROOT,name));
 return result;
}
function sourceIdentities(sources){return Object.fromEntries(Object.entries(sources).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha(bytes)}]))}
async function unchangedSources(sources){for(const [name,bytes]of Object.entries(sources))need((await read(join(MODULE_ROOT,name))).equals(bytes),'Loaded source changed during project build: '+name)}
async function withPublicationLock(target,action){
 await mkdir(dirname(target),{recursive:true});
 const lockPath=target+'.project.lock';
 // The existing Linux flock capability holds a kernel lease. The child exits on
 // stdin EOF if this parent dies; the stable lock file is never unlinked.
 if(await exists(lockPath)){const s=await lstat(lockPath);need(s.isFile()&&!s.isSymbolicLink(),'Unsafe project lock')}
 const child=spawn('flock',['--exclusive','--nonblock',lockPath,process.execPath,'-e',
  "process.stdout.write('PROJECT_LOCKED\\n');process.stdin.resume();process.stdin.on('end',()=>process.exit(0));"],
  {stdio:['pipe','pipe','pipe']});
 let acquired=false,errorText='';
 child.stderr.on('data',b=>{errorText=(errorText+b.toString()).slice(-2000)});
 child.stdin.on('error',()=>{});
 const exited=new Promise(resolveExit=>{child.once('exit',(code,signal)=>resolveExit({code,signal}));child.once('error',error=>resolveExit({error:error.message}))});
 try{
  await new Promise((ok,bad)=>{
   let text='';const timer=setTimeout(()=>bad(new Error('Project lock admission timed out')),10000);
   child.once('error',error=>{clearTimeout(timer);bad(error)});
   child.once('exit',code=>{clearTimeout(timer);if(!acquired)bad(new Error('Project is already being built, or flock is unavailable (exit '+code+'): '+errorText))});
   child.stdout.on('data',b=>{text+=b.toString();if(text.includes('PROJECT_LOCKED\n')){clearTimeout(timer);acquired=true;ok()}});
  });
  const ensureLease=()=>need(acquired&&child.exitCode===null&&child.signalCode===null,'Project publication lease ended');
  ensureLease();return await action(ensureLease);
 }finally{child.stdin.end();if(!acquired)child.kill();await exited}
}
async function exactEdition(directoryPath){
 const root=resolve(directoryPath);await directory(root);
 const manifest=await readJSON(join(root,'manifest.json'),2*1024*1024);
 need(manifest.schema==='econdb.file-bundle.v1'&&Array.isArray(manifest.files),'Expected original edition manifest');
 const names=new Set(),members=[];
 for(const entry of manifest.files){
  need(safeName(entry.name)&&entry.name!=='manifest.json'&&!names.has(entry.name),'Invalid edition member');
  names.add(entry.name);const body=await read(join(root,entry.name));
  need(entry.bytes===body.length&&entry.sha256===sha(body),'Original edition member mismatch: '+entry.name);
  members.push({name:entry.name,bytes:body.length,sha256:sha(body)});
 }
 for(const name of ['response.json','descriptor.json','receiving-state.json'])need(names.has(name),'Edition is missing original '+name);
 const listed=(await readdir(root)).sort();need(equal(listed,[...names,'manifest.json'].sort()),'Edition has unlisted members; retain them separately before project receiving');
 const opened=await openEdition(root);
 return {root,edition:opened.edition,members:[...members,{name:'manifest.json',...await fileIdentity(join(root,'manifest.json'))}],
  descriptor:opened.descriptor,source_sha256:opened.descriptor.source_sha256};
}
async function copyEdition(original,target){
 await mkdir(target,{recursive:true});
 for(const member of original.members){
  const body=await read(join(original.root,member.name));
  need(body.length===member.bytes&&sha(body)===member.sha256,'Original edition changed before copy');
  await put(join(target,member.name),body);
 }
 const copy=await exactEdition(target);
 need(equal(copy.members,original.members)&&equal(copy.edition,original.edition),'Copied edition differs');
}
async function verifyFlatBundle(path){
 await directory(path);const m=await readJSON(join(path,'manifest.json'),2*1024*1024);
 need(m.schema==='econdb.file-bundle.v1'&&Array.isArray(m.files),'Invalid child report manifest');
 const names=new Set();
 for(const f of m.files){
  need(safeName(f.name)&&f.name!=='manifest.json'&&!names.has(f.name),'Invalid child report member');
  names.add(f.name);need(equal(await fileIdentity(join(path,f.name)),{bytes:f.bytes,sha256:f.sha256}),'Child report member changed: '+f.name);
 }
 need(equal((await readdir(path)).sort(),[...names,'manifest.json'].sort()),'Unexpected child report member');
 return m;
}
async function ensureChild({stage,entry,expected,sourceHashes}){
 const output=join(stage,'entries',entry.id);
 const editionDirectory=join(stage,entry.current),previousDirectory=entry.previous?join(stage,entry.previous):null;
 if(!await exists(output)){
  await mkdir(dirname(output),{recursive:true});
  await analyzeEdition({editionDirectory,previousDirectory,selection:entry.selection,before:entry.before??null,after:entry.after??null,directory:output});
 }
 await verifyFlatBundle(output);
 const binding=await readJSON(join(output,'analysis-source.json'));
 need(binding.engine.sha256===sourceHashes['maritime-analysis.mjs'].sha256,'Child report uses another analysis engine');
 need(binding.current.id===expected.current.id&&binding.current.source_sha256===expected.current.source.source_sha256,'Child current source differs');
 need(equal(binding.selection,expected.period.selection),'Child period differs');
 need(equal(await readJSON(join(output,'selected-period.json')),expected.period),'Child selected observations differ');
 need(Boolean(binding.previous)===Boolean(expected.previous),'Child prior selection differs');
 if(expected.previous)need(binding.previous.id===expected.previous.id&&binding.previous.source_sha256===expected.previous.source.source_sha256,'Child previous source differs');
 for(const [name,value]of [['period-comparison.json',expected.comparison],['edition-comparison.json',expected.revisions]]){
  need(Boolean(await exists(join(output,name)))===Boolean(value),'Child comparison selection differs');
  if(value)need(equal(await readJSON(join(output,name)),value),'Child comparison differs');
 }
}
async function prepare(config,baseDirectory){
 const portable=validateProject(config),originals=new Map(),editions=new Map();let cells=0,totalBytes=0;
 for(const entry of portable.entries){
  const supplied=config.entries.find(x=>x.id===entry.id),pair={current:null,previous:null},loaded={current:null,previous:null};
  for(const role of ['current','previous']){
   if(role==='previous'&&!supplied.previous){entry.previous=null;continue}
   const original=await exactEdition(resolve(baseDirectory,supplied[role]));
   cells+=original.edition.rows.length;need(cells<=MAX_CELLS,'Project exceeds 500,000 current and previous source cells');
   totalBytes+=original.members.reduce((n,f)=>n+f.bytes,0);need(totalBytes<=MAX_PROJECT_BYTES,'Project original sources exceed 2 GiB');
   pair[role]=original;loaded[role]=original.edition;entry[role]='originals/'+entry.id+'/'+role;
  }
  originals.set(entry.id,pair);editions.set(entry.id,loaded);
 }
 return {portable,originals,editions,cells,totalBytes};
}
function inputBinding(prepared,sources){
 return {schema:'econdb.project-input-binding.v1',project:prepared.portable,source_modules:sourceIdentities(sources),
  editions:prepared.portable.entries.map(e=>({id:e.id,...Object.fromEntries(['current','previous'].map(role=>{
   const x=prepared.originals.get(e.id)[role];return [role,x?{id:x.edition.id,source_sha256:x.source_sha256,members:x.members}:null];
  }))}))};
}
async function buildManifest(stage,binding,created_at){
 const files=[];let total=0;
 for(const name of await walk(stage)){
  if(name==='project-manifest.json')continue;
  const member=join(stage,name),fd=await open(member,'r');try{await fd.sync()}finally{await fd.close()}
  const identity=await fileIdentity(member);total+=identity.bytes;
  need(total<=MAX_PROJECT_BYTES,'Complete project exceeds the 2 GiB handover limit');
  files.push({path:name,...identity});
 }
 for(const parent of [...new Set(files.map(f=>dirname(join(stage,f.path))))].sort((a,b)=>b.length-a.length))await syncDirectory(parent);
 return {schema:'econdb.maritime-project-bundle.v1',project_id:binding.project.id,created_at,input_sha256:sha(canonical(binding)),source_modules:binding.source_modules,total_bytes:total,files};
}
export async function verifyProject(directoryPath,{requireCurrentSource=false}={}){
 const root=resolve(directoryPath);await directory(root);
 const manifest=await readJSON(join(root,'project-manifest.json'));
 need(manifest.schema==='econdb.maritime-project-bundle.v1'&&Array.isArray(manifest.files),'Not a complete Econdb project');
 const actualNames=(await walk(root)).sort();
 const names=new Set();let total=0;
 for(const f of manifest.files){
  need(safeRelative(f.path)&&f.path!=='project-manifest.json'&&!names.has(f.path),'Invalid project manifest path');names.add(f.path);
  const identity=await fileIdentity(join(root,f.path));need(equal(identity,{bytes:f.bytes,sha256:f.sha256}),'Project member changed: '+f.path);total+=f.bytes;
 }
 need(total===manifest.total_bytes&&total<=MAX_PROJECT_BYTES,'Project total bytes differ');
 need(equal(actualNames,[...names,'project-manifest.json'].sort()),'Project has unlisted files');
 const config=await readJSON(join(root,'project.json')),binding=await readJSON(join(root,'project-state.json'));
 validateProject(config);need(binding.schema==='econdb.project-state.v1','Invalid project state');need(equal(config,binding.input.project)&&manifest.project_id===config.id,'Project configuration differs from its binding');
 need(sha(canonical(binding.input))===manifest.input_sha256&&binding.input_sha256===manifest.input_sha256,'Project input binding changed');
 need(equal(binding.input.source_modules,manifest.source_modules),'Project source identities differ');
 for(const name of SOURCE_FILES){
  need(names.has('source/'+name)&&equal(await fileIdentity(join(root,'source',name)),manifest.source_modules[name]),'Included source identity differs: '+name);
 }
 if(requireCurrentSource)need(equal(sourceIdentities(await moduleSources()),manifest.source_modules),'This receiver has another source edition; use the included source CLI');
 // Paths in a received project must be the portable originals, never host paths.
 for(const entry of config.entries){
  need(entry.current==='originals/'+entry.id+'/current','Current edition path is not portable');
  need(entry.previous===null||entry.previous===undefined||entry.previous==='originals/'+entry.id+'/previous','Previous edition path is not portable');
  const pinned=binding.input.editions.find(x=>x.id===entry.id);need(pinned,'Missing edition binding');
  for(const role of ['current','previous'])if(entry[role]){
   const original=await exactEdition(join(root,entry[role]));
   need(original.edition.id===pinned[role]?.id&&original.source_sha256===pinned[role]?.source_sha256&&equal(original.members,pinned[role]?.members),'Retained original differs from project binding');
  }
 }
 return {directory:root,project_id:config.id,input_sha256:manifest.input_sha256,manifest,config,binding};
}

async function cleanInterruptedWrites(stage,binding){
 const expected=['browser-workspace.json','project.json','project-analysis.json','observations.csv','report.html','REOPEN.md','project-manifest.json',
  ...SOURCE_FILES.map(name=>'source/'+name)];
 for(const entry of binding.editions)for(const role of ['current','previous']){
  if(entry[role])for(const m of entry[role].members)expected.push('originals/'+entry.id+'/'+role+'/'+m.name);
 }
 const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
 const escape=s=>s.replace(/[.*+?^{}$()|[\]\\]/g,char=>'\\'+char);
 const parents=new Map();
 for(const name of expected){
  const p=dirname(name),base=name.slice(p==='.'?0:p.length+1);
  if(!parents.has(p))parents.set(p,[]);parents.get(p).push(new RegExp('^'+escape(base)+'\\.writing-'+uuid+'$'));
 }
 for(const [parent,patterns]of parents){
  const dir=join(stage,parent);if(!await exists(dir))continue;await directory(dir);
  for(const name of await readdir(dir))if(patterns.some(re=>re.test(name))){
   const p=join(dir,name),info=await lstat(p);need(info.isFile()&&!info.isSymbolicLink(),'Unexpected interrupted member type');await rm(p);
  }
 }
 const entries=join(stage,'entries');if(await exists(entries)){
  await directory(entries);
  const patterns=binding.project.entries.map(e=>new RegExp('^'+escape(e.id)+'\\.receiving-'+uuid+'$'));
  for(const name of await readdir(entries))if(patterns.some(re=>re.test(name))){
   const p=join(entries,name);await directory(p);await rm(p,{recursive:true});
  }
 }
}

export async function buildProject({config,baseDirectory=process.cwd(),directory:destination}){
 const target=resolve(destination);
 return withPublicationLock(target,async ensureLease=>{
  const sources=await moduleSources(),prepared=await prepare(config,resolve(baseDirectory)),binding=inputBinding(prepared,sources),input_sha256=sha(canonical(binding));
  if(await exists(target)){
   const existing=await verifyProject(target,{requireCurrentSource:true});
   need(existing.input_sha256===input_sha256,'Existing destination belongs to a different exact project; choose a new destination');
   return {directory:target,resumed:true,project_id:config.id,input_sha256,manifest:existing.manifest};
  }
  for(const pair of prepared.originals.values())for(const original of Object.values(pair).filter(Boolean)){
   need(target!==original.root&&!target.startsWith(original.root+sep)&&!original.root.startsWith(target+sep),'Keep the project destination separate from its retained input edition');
  }
  const stage=target+'.project-receiving';let created_at;
  if(await exists(stage)){
   await directory(stage);const state=await readJSON(join(stage,'project-state.json'));
   need(state.input_sha256===input_sha256&&equal(state.input,binding),'Existing receiving directory belongs to another project; preserve it and choose another destination');
   created_at=state.created_at;
  }else{
   created_at=new Date().toISOString();
   const initializing=stage+'.initializing-'+randomUUID();await mkdir(initializing,{mode:0o700});
   try{
    await put(join(initializing,'project-state.json'),json({schema:'econdb.project-state.v1',created_at,input_sha256,input:binding}));
    await syncDirectory(initializing);await rename(initializing,stage);await syncDirectory(dirname(stage));
   }catch(error){await rm(initializing,{recursive:true,force:true});throw error}
  }
  await cleanInterruptedWrites(stage,binding);
  // Project-managed writes check available filesystem bytes; a completed receiving
  // directory can publish without requiring another copy's worth of free space.
  await put(join(stage,'project.json'),json(prepared.portable));
  await put(join(stage,'REOPEN.md'),sources['PROJECT_GUIDE.md']);
  for(const [name,body]of Object.entries(sources))await put(join(stage,'source',name),body);
  for(const entry of prepared.portable.entries)for(const role of ['current','previous']){
   const original=prepared.originals.get(entry.id)[role];if(original)await copyEdition(original,join(stage,entry[role]));
  }
  ensureLease();
  const analysis=analyzeProject(prepared.portable,prepared.editions);
  const sourceHashes=binding.source_modules;
  for(const entry of prepared.portable.entries){
   const expected=analysis.entries.find(x=>x.id===entry.id);need(expected,'Project analysis omitted an entry');
   await ensureChild({stage,entry,expected,sourceHashes});ensureLease();
  }
  const browserEntries=[];
  for(const entry of prepared.portable.entries){
   const pair=prepared.originals.get(entry.id);
   const retain=async original=>original?{raw:decode(await read(join(original.root,'response.json'))),descriptor:original.descriptor}:null;
   browserEntries.push({id:entry.id,title:entry.title,current:await retain(pair.current),previous:await retain(pair.previous),selection:entry.selection,before:entry.before,after:entry.after});
  }
  const browserWorkspace=saveProjectWorkspace({id:prepared.portable.id,title:prepared.portable.title},browserEntries,
   {analysis_sha256:sourceHashes['maritime-analysis.mjs'].sha256,project_sha256:sourceHashes['maritime-project-analysis.mjs'].sha256});
  await put(join(stage,'browser-workspace.json'),json(browserWorkspace));
  await put(join(stage,'project-analysis.json'),json(analysis));
  await put(join(stage,'observations.csv'),projectRowsCSV(analysis));
  await put(join(stage,'report.html'),projectHTML(analysis,{engine_sha256:sourceHashes['maritime-analysis.mjs'].sha256,project_engine_sha256:sourceHashes['maritime-project-analysis.mjs'].sha256}));
  await unchangedSources(sources);
  const manifest=await buildManifest(stage,binding,created_at);
  await put(join(stage,'project-manifest.json'),json(manifest));
  await verifyProject(stage,{requireCurrentSource:true});
  await syncDirectory(stage);ensureLease();
  need(!await exists(target),'Destination appeared during receiving; existing files are preserved');
  await rename(stage,target);await syncDirectory(dirname(target));
  return {directory:target,resumed:false,project_id:config.id,input_sha256,manifest};
 });
}
export async function rebuildProject({directory:originalDirectory,destination}){
 const received=await verifyProject(originalDirectory,{requireCurrentSource:true});
 const target=resolve(destination),original=resolve(originalDirectory);
 need(target!==original&&!target.startsWith(original+sep)&&!original.startsWith(target+sep),'Rebuild into a separate project directory');
 const result=await buildProject({config:received.config,baseDirectory:original,directory:target});
 need(result.input_sha256===received.input_sha256,'Rebuilt input binding differs');
 const originalAnalysis=await readJSON(join(original,'project-analysis.json'));
 const rebuiltAnalysis=await readJSON(join(target,'project-analysis.json'));
 need(equal(originalAnalysis,rebuiltAnalysis),'Rebuilt project analysis differs from the original received result');
 for(const name of ['observations.csv','report.html','browser-workspace.json'])need((await read(join(original,name))).equals(await read(join(target,name))),'Rebuilt project export differs: '+name);
 return {...result,received_from:original,independent_reopen:true};
}

export async function importProjectWorkspace({workspacePath,directory:destination}){
 const target=resolve(destination),inputPath=resolve(workspacePath);
 need(inputPath!==target&&!inputPath.startsWith(target+sep),'Keep the saved input workspace outside its new native destination');
 return withPublicationLock(target+'.browser-import',async ensureLease=>{
  const original=await read(inputPath),saved=JSON.parse(decode(original));
  const sources=await moduleSources(),sourceHashes=sourceIdentities(sources);
  const binding={analysis_sha256:sourceHashes['maritime-analysis.mjs'].sha256,project_sha256:sourceHashes['maritime-project-analysis.mjs'].sha256};
  const received=receiveProjectWorkspace(saved,binding),input_sha256=sha(original);
  const inputs=target+'.browser-inputs',identity={schema:'econdb.browser-project-input.v1',input_sha256,engine:binding};
  if(await exists(inputs)){
   await directory(inputs);need(equal(await readJSON(join(inputs,'input.json')),identity),'Existing browser input staging belongs to another workspace or engine; preserve it and choose a new destination');
  }else{
   const initializing=inputs+'.initializing-'+randomUUID();await mkdir(initializing,{mode:0o700});
   try{await put(join(initializing,'input.json'),json(identity));await syncDirectory(initializing);await rename(initializing,inputs);await syncDirectory(dirname(inputs));}
   catch(error){await rm(initializing,{recursive:true,force:true});throw error}
  }
  await put(join(inputs,'workspace.json'),original);
  const directories=new Map(),sourcesRoot=join(inputs,'sources');
  if(!await exists(sourcesRoot))await mkdir(sourcesRoot,{mode:0o700});await directory(sourcesRoot);
  for(const source of saved.sources){
   const holder=join(sourcesRoot,source.id);if(!await exists(holder))await mkdir(holder,{mode:0o700});await directory(holder);
   need(safeName(source.descriptor.id),'Use a file-safe original edition identifier');
   const editionTarget=join(holder,source.descriptor.id);if(await exists(editionTarget))await directory(editionTarget);
   const retained=await retainEdition({directory:holder,raw:source.raw,descriptor:source.descriptor});
   need(retained.status==='analyzable','Saved original requires source review: '+source.id);
   directories.set(source.id,retained.directory);
  }
  const config={schema:'econdb.maritime-project.v1',id:received.project.id,title:received.project.title,
   entries:saved.entries.map(entry=>({...entry,current:directories.get(entry.current),previous:entry.previous?directories.get(entry.previous):null}))};
  await unchangedSources(sources);ensureLease();
  const result=await buildProject({config,baseDirectory:inputs,directory:target});
  const restored=receiveProjectWorkspace(await readJSON(join(target,'browser-workspace.json'),MAX_FILE_BYTES),binding);
  need(equal(restored.analysis,received.analysis),'Native project does not reproduce the original browser workspace');
  return {...result,received_workspace:inputPath,workspace_sha256:input_sha256,browser_roundtrip:true};
 });
}
