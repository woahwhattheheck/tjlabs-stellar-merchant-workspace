// MIT. One original Workspace/Console journey over an explicitly internal SPC implementation plan.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open, mkdir, lstat, realpath, link, unlink, rename} from 'node:fs/promises';
import {resolve, join, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

export const PROGRAMME_RECEIVING_OPERATION = 'ENGRANT-RESEARCH-APPLICATION-HANDOFF-7DE2-20261013';
const PROGRAMME_SCHEMA = 'stellar-forge.grant-programme.v1';
const INPUT_SCHEMA = 'stellar-forge.engrant-receiving-input.v1';
const COLLECTIONS = ['nodes','partners','grants','milestones','indicators','observations','risks','issues','documents','reports','closures'];
const HASH = /^[a-f0-9]{64}$/, COMMIT = /^[a-f0-9]{40}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value) ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const encoded = value => Buffer.from(JSON.stringify(canonical(value)) + '\n');
const equal = (actual,expected,message) => assert.deepEqual(actual,expected,message);
const now = () => new Date().toISOString();
const sleep = milliseconds => new Promise(done => setTimeout(done,milliseconds));
const exactKeys = (value,allowed,required=[]) => assert(plain(value) &&
  Object.keys(value).every(key=>allowed.includes(key)) && required.every(key=>Object.hasOwn(value,key)), 'Use the complete declared input fields.');
function absolute(value) {
  assert(typeof value==='string' && isAbsolute(value) && resolve(value)===value && !value.includes('\0'), 'Use an exact absolute path.');
  return value;
}
function parseArguments(argv) {
  const allowed = new Set(['--sdk','--input','--out','--python','--source-commit','--client-module',
    '--chromium','--playwright-module','--desk-root','--desk-commit']);
  assert(argv.length%2===0,'Every receiving option has one explicit value.');
  const result = new Map();
  for(let i=0;i<argv.length;i+=2) {
    assert(allowed.has(argv[i])&&!result.has(argv[i]),'Use one original value for each receiving option.');
    result.set(argv[i],argv[i+1]);
  }
  for(const name of ['--sdk','--input','--out','--python','--source-commit','--desk-root','--desk-commit']) assert(result.has(name),'Missing '+name);
  assert(COMMIT.test(result.get('--source-commit'))&&COMMIT.test(result.get('--desk-commit')),'Select the actual composed source commit.');
  assert(result.has('--chromium')===result.has('--playwright-module'),'Select both original browser executables or neither.');
  return result;
}
async function regular(path,maximum=64*1024*1024) {
  absolute(path);
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const info=await handle.stat();
    assert(info.isFile()&&info.size<=maximum&&await realpath(path)===path,'Select an original regular file within its limit.');
    return {handle,info};
  } catch(error) {await handle.close();throw error;}
}
function unchanged(before,after) {
  return ['dev','ino','size','mtimeMs','ctimeMs'].every(key=>before[key]===after[key]);
}
async function readBytes(path,maximum=64*1024*1024) {
  const {handle,info}=await regular(path,maximum);
  try {
    const chunks=[];let size=0;
    for await(const block of handle.createReadStream({autoClose:false,start:0,highWaterMark:1024*1024})) {
      size+=block.length;assert(size<=maximum,'The complete original record exceeded its byte limit.');chunks.push(block);
    }
    const after=await handle.stat(),attached=await lstat(path);
    assert(size===info.size&&unchanged(info,after)&&attached.dev===info.dev&&attached.ino===info.ino,'The selected record changed.');
    return Buffer.concat(chunks,size);
  } finally {await handle.close();}
}
async function readJson(path,optional=false) {
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(path)));}
  catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
async function fileInfo(path,{synchronize=false}={}) {
  const {handle,info}=await regular(path,4*1024*1024*1024);
  try {
    const digest=createHash('sha256');let bytes=0;
    for await(const block of handle.createReadStream({autoClose:false,start:0,highWaterMark:1024*1024})) {digest.update(block);bytes+=block.length;}
    const after=await handle.stat(),attached=await lstat(path);
    assert(bytes===info.size&&unchanged(info,after)&&attached.dev===info.dev&&attached.ino===info.ino,'The selected complete file changed.');
    if(synchronize)await handle.sync();
    return {path,bytes,sha256:digest.digest('hex')};
  } finally {await handle.close();}
}
async function syncDirectory(path) {
  const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
}
async function directory(path,{privateRoot=false}={}) {
  absolute(path);
  if(path!==dirname(path)) {
    try{const info=await lstat(path);assert(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(path)===path);}
    catch(error){if(error.code!=='ENOENT')throw error;await directory(dirname(path));await mkdir(path,{mode:0o700});}
    if(privateRoot){const info=await lstat(path);assert(!(info.mode&0o077)&&info.uid===process.getuid(),'Use the original private receiving directory.');}
    await syncDirectory(path);await syncDirectory(dirname(path));
  }
  return path;
}
async function writeBytes(path,body,{immutable=false}={}) {
  body=Buffer.from(body);await directory(dirname(path));
  if(immutable) {
    let present;
    try{present=await regular(path,Math.max(body.length,1));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(present) {
      try {
        const actual=await present.handle.readFile();assert(actual.equals(body),'Preserve the original immutable receiving record.');
        assert(unchanged(present.info,await present.handle.stat()),'The retained receiving record changed.');
        await present.handle.sync();
      } finally {await present.handle.close();}
      await syncDirectory(dirname(path));return;
    }
  }
  const temporary=path+'.pending-'+randomUUID();let handle;
  try {
    handle=await open(temporary,'wx',0o600);await handle.writeFile(body);await handle.sync();await handle.close();handle=null;
    if(immutable) {
      try{await link(temporary,path);}
      catch(error){if(error.code!=='EEXIST')throw error;assert((await readBytes(path,Math.max(body.length,1))).equals(body),'The receiving destination belongs to different bytes.');}
    } else await rename(temporary,path);
    await syncDirectory(dirname(path));
  } finally {
    if(handle)await handle.close();
    try{await unlink(temporary);await syncDirectory(dirname(path));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
const save=(path,value,immutable=false)=>writeBytes(path,encoded(value),{immutable});
async function exists(path){try{await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function tail(path,maximum=4000) {
  const {handle,info}=await regular(path,4*1024*1024*1024);
  try {
    const buffer=Buffer.alloc(Math.min(maximum,info.size));
    const read=await handle.read(buffer,0,buffer.length,Math.max(0,info.size-buffer.length));
    return buffer.subarray(0,read.bytesRead).toString('utf8');
  } finally {await handle.close();}
}


export async function runEngrantReceiving(argv=process.argv.slice(2)) {
  const options=parseArguments(argv),sdk=absolute(options.get('--sdk')),root=absolute(options.get('--out'));
  const python=absolute(options.get('--python')),sourceCommit=options.get('--source-commit');
  const deskRoot=absolute(options.get('--desk-root')),deskCommit=options.get('--desk-commit');
  assert(deskRoot===join(root,'customer-packages'),'Keep the same original owned customer-package output.');
  const foregroundSelectionSha256=process.env.SCF_ENGRANT_FOREGROUND_SELECTION;
  assert(Number(process.env.SCF_ENGRANT_FOREGROUND_PID)===process.ppid&&HASH.test(foregroundSelectionSha256??'')&&
    process.env.SCF_ENGRANT_FOREGROUND_HELPER_SHA256==='8522835d848533ff66b8fad6900c5c0c781eaae4967a5b5ac2f9dac1ed458412',
    'Run this complete journey through its original ProcessFamily foreground.');
  await directory(root,{privateRoot:true});
  const privateRoot=await directory(join(root,'private'),{privateRoot:true});
  for(const name of ['actions','evidence','documents','exports','workspaces','source-inputs','console-closures','desk-results'])
    await directory(join(root,name),{privateRoot:true});
  for(const name of ['children','connections'])await directory(join(privateRoot,name),{privateRoot:true});
  const inputBytes=await readBytes(absolute(options.get('--input')),2*1024*1024),input=JSON.parse(inputBytes);
  exactKeys(input,['schema','actor','asOf','fixture','originalSourcePacket','packageBuildPacket','packages'],
    ['schema','actor','asOf','fixture','originalSourcePacket','packageBuildPacket','packages']);
  assert(input.schema===INPUT_SCHEMA&&input.fixture==='internal-research-preparation-v1'&&typeof input.actor==='string'&&input.actor.trim());
  assert(/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)&&new Date(input.asOf+'T00:00:00Z').toISOString().startsWith(input.asOf));
  exactKeys(input.originalSourcePacket,['path','bytes','sha256'],['path','bytes','sha256']);
  equal({bytes:input.originalSourcePacket.bytes,sha256:input.originalSourcePacket.sha256},
    {bytes:349294,sha256:'1ef6f19beb2720da0665ee46dccc7bed0abf7b21a40a844df805aaab484b3fcc'});
  const originalBytes=await readBytes(absolute(input.originalSourcePacket.path),349294);
  assert(originalBytes.length===349294&&sha(originalBytes)===input.originalSourcePacket.sha256);
  const originalSource=JSON.parse(originalBytes);
  assert(originalSource.repository==='woahwhattheheck/commons'&&originalSource.commit==='bb5524556602a062e23bf1f260ca117960189f97'&&originalSource.files.length===22);
  const originals=new Map();
  for(const row of originalSource.files){
    assert(typeof row.content==='string'&&!originals.has(row.path));const bytes=Buffer.from(row.content);
    equal({bytes:bytes.length,sha256:sha(bytes)},{bytes:row.bytes,sha256:row.sha256});originals.set(row.path,row);
  }
  const allowedPackages=[
    {key:'free-sample',source_id:'engrant-20261013-free-sample',source_sha256:'ce097bd1f8c543df245bf4f98b06a816fc21b939a7eaddd86e440197a0224ae0',profiles:1,records:2},
    {key:'five-nonprofits',source_id:'engrant-20261013-five-nonprofits',source_sha256:'dce9b77f65dd7dd1ac90cbeed348e7350da5b514b714ace3c430785e5e119473',profiles:5,records:39}
  ];
  assert(Array.isArray(input.packages)&&input.packages.length===2);
  const safeRelative=path=>assert(typeof path==='string'&&path&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(x=>x&&x!=='.'&&x!=='..'),'Keep a selected relative source path.');
  exactKeys(input.packageBuildPacket,['path','bytes','sha256'],['path','bytes','sha256']);
  equal({bytes:input.packageBuildPacket.bytes,sha256:input.packageBuildPacket.sha256},
    {bytes:1044551,sha256:'27eaff1a8ceb7189cf7983d83b604585857882ab2ed09edfa4c4b6e90789b17d'});
  const packageSourceBytes=await readBytes(absolute(input.packageBuildPacket.path),1044551);
  assert(packageSourceBytes.length===1044551&&sha(packageSourceBytes)===input.packageBuildPacket.sha256);
  const packageSource=JSON.parse(packageSourceBytes),packageSourceRoot=await directory(join(root,'source-inputs','package-build'),{privateRoot:true});
  const buildFiles=[],buildPaths=new Set();
  for(const row of packageSource.files){
    safeRelative(row.path);assert(!buildPaths.has(row.path));buildPaths.add(row.path);
    const bytes=Buffer.from(row.content);equal({bytes:bytes.length,sha256:sha(bytes)},{bytes:row.bytes,sha256:row.sha256});
    await writeBytes(join(packageSourceRoot,row.path),bytes,{immutable:true});
    buildFiles.push({path:row.path,bytes:row.bytes,sha256:row.sha256});
  }
  assert(buildPaths.has('build-research-packages.mjs')&&buildPaths.has('package-build-input.json'));
  const packageBuildInput=await readJson(join(packageSourceRoot,'package-build-input.json'));
  assert(packageBuildInput.engine_commit==='38adac27b4d2f67d2335c2a397f8e82eb019a4b8'&&
    packageBuildInput.source_case_commit===deskCommit&&deskCommit==='bb5524556602a062e23bf1f260ca117960189f97');
  const deskFiles=[],packages=[];
  for(let index=0;index<allowedPackages.length;index++){
    const selected=input.packages[index],fixed=allowedPackages[index];
    exactKeys(selected,['key','directory'],['key','directory']);assert(selected.key===fixed.key&&selected.directory===fixed.key);
    const seed=JSON.parse(originals.get(fixed.key+'/research-source.json').content);
    equal({source_id:seed.source_id,source_sha256:seed.source_sha256},{source_id:fixed.source_id,source_sha256:fixed.source_sha256});
    assert(seed.profiles.length===fixed.profiles&&seed.profiles.reduce((n,p)=>n+p.records.length,0)===fixed.records);
    const paths=Object.fromEntries(['RESEARCH_DESK.html','research-brief-core.js','research-desk.js','research-desk.css'].map(name=>[name,selected.directory+'/'+name]));
    packages.push({...fixed,directory:selected.directory,paths,seed});
  }
  const sourceManifestPath=join(sdk,'grant-portfolio/source-files.json'),sourceManifestBytes=await readBytes(sourceManifestPath,1024*1024);
  const sourceManifest=JSON.parse(sourceManifestBytes);
  assert(sourceManifest.schema==='stellar-forge.grant-portfolio-source-files.v1'&&Array.isArray(sourceManifest.files));
  equal(sourceManifest.files,[...new Set(sourceManifest.files)].sort());
  const required=['grant-portfolio/client.mjs','grant-portfolio/workspace.py','grant-portfolio/cli.mjs','grant-portfolio/cli.py',
    'grant-portfolio/recipient-project.mjs','grant-portfolio/recipient-project-core.mjs','grant-portfolio/web/recipient-project.js',
    'grant-portfolio/examples/engrant/engrant-receiving.mjs','grant-portfolio/examples/engrant/run-engrant-receiving.py',
    'grant-portfolio/examples/spc/process_family.py'];
  for(const path of required)assert(sourceManifest.files.includes(path),'Retain the full receiving source '+path);
  const sourceFiles=[];
  for(const path of sourceManifest.files){safeRelative(path);const actual=await fileInfo(join(sdk,path));sourceFiles.push({path,bytes:actual.bytes,sha256:actual.sha256});}
  const clientPath=absolute(options.get('--client-module')??join(sdk,'grant-portfolio/client.mjs'));
  assert(sourceManifest.files.includes(relative(sdk,clientPath)));
  const selfPath=fileURLToPath(import.meta.url);assert(selfPath===join(sdk,'grant-portfolio/examples/engrant/engrant-receiving.mjs'));
  assert(options.has('--chromium')&&options.has('--playwright-module'),'The complete journey requires the actual selected browser.');
  const browserSelection={executable:await fileInfo(absolute(options.get('--chromium'))),playwright:await fileInfo(absolute(options.get('--playwright-module')))};
  const binding={schema:'stellar-forge.engrant-receiving-selection.v1',operation:PROGRAMME_RECEIVING_OPERATION,
    root,sdk,deskRoot,deskPublishedSuccessorCommit:'f6cb6688288e61fcd61f2b1afc5bd6cdf1a229a7',python,node:process.execPath,nodeVersion:process.version,sourceCommit,deskCommit,foregroundSelectionSha256,
    inputSha256:sha(inputBytes),sourceManifestSha256:sha(sourceManifestBytes),sourceFiles,
    packageBuilder:{bytes:packageSourceBytes.length,sha256:sha(packageSourceBytes),engineCommit:packageBuildInput.engine_commit,files:buildFiles},originalSource:{bytes:originalBytes.length,sha256:sha(originalBytes)},
    programme:await fileInfo(selfPath),clientModule:clientPath,browser:browserSelection};
  const journalPath=join(root,'receiving.json');
  let journal=await readJson(journalPath,true);
  if(journal)equal(journal.binding,binding,'Continue the same complete receiving selection.');
  else{journal={schema:'stellar-forge.engrant-receiving.v1',operation:PROGRAMME_RECEIVING_OPERATION,runId:randomUUID(),
    startedAt:now(),binding,state:'PREPARED',phases:{},refs:{},resources:{closed:false}};await save(journalPath,journal);}
  await writeBytes(join(root,'source-inputs','receiving-input.json'),inputBytes,{immutable:true});
  await writeBytes(join(root,'source-inputs','original-customer-sources.json'),originalBytes,{immutable:true});
  await writeBytes(join(root,'source-inputs','package-build-source.json'),packageSourceBytes,{immutable:true});
  await save(join(root,'executed-source.json'),binding,true);
  const legacyPath=join(root,'source-inputs','original-v1-core.cjs');
  await writeBytes(legacyPath,Buffer.from(originals.get('common/research-brief-core.js').content),{immutable:true});
  const require=createRequire(import.meta.url),legacy=require(legacyPath);
  const models=new Map();
  const recipient=await import(pathToFileURL(join(sdk,'grant-portfolio/recipient-project.mjs')).href);

  const selectedClientModule=await import(pathToFileURL(clientPath).href);
  const originalClientModule=await import(pathToFileURL(join(sdk,'grant-portfolio/client.mjs')).href);
  assert(typeof selectedClientModule.connectGrantPortfolio==='function'&&typeof originalClientModule.saveGrantPortfolioFile==='function');
  const connectGrantPortfolio=selectedClientModule.connectGrantPortfolio;
  const saveGrantPortfolioFile=originalClientModule.saveGrantPortfolioFile;
  const environment={...process.env,SF30_XML_NODE:process.execPath,SF30_NDJSON_NODE:process.execPath,
    SF30_GRANT_PORTFOLIO_NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'};
  const children=new Set(),consoles=new Map(),privateValues=new Set();
  let browser=null,stopRequested=null;
  const controller=new AbortController();
  const safeMessage=error=>{
    let message=String(error?.message??error);
    for(const value of privateValues)message=message.split(value).join('[private console]');
    return message.replace(/https?:\/\/127\.0\.0\.1:\d+\/#?[A-Za-z0-9_-]{32,}/g,'[private console]').slice(0,3000);
  };
  const requestStop=signal=>{
    stopRequested??=Object.assign(new Error('Original receiving interrupted by '+signal),{code:'PROGRAMME_RECEIVING_STOPPED'});
    if(!controller.signal.aborted)controller.abort(stopRequested);
    for(const owned of children)if(!owned.closed)owned.child.kill('SIGTERM');
  };
  const onTerm=()=>requestStop('SIGTERM'),onInt=()=>requestStop('SIGINT');
  process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
  const checkStop=()=>{if(stopRequested)throw stopRequested;};
  const announce=value=>process.stdout.write(JSON.stringify({operation:PROGRAMME_RECEIVING_OPERATION,...value})+'\n');
  async function retainCompleted(label,write) {
    let notice=null;
    for(;;) {
      try{return await write();}
      catch(error) {
        const current=String(error.code??'LOCAL_RETAIN')+': '+safeMessage(error);
        if(current!==notice){announce({state:'AWAITING_LOCAL_RETENTION',label,error:current});notice=current;}
        await sleep(2000);
      }
    }
  }
  const checkpoint=()=>save(journalPath,journal);
  async function stage(name,run) {
    const path=join(root,'evidence',name+'.json');
    const identity={schema:'stellar-forge.programme-receiving-phase.v1',
      operation:PROGRAMME_RECEIVING_OPERATION,runId:journal.runId,phase:name,
      inputSha256:binding.inputSha256,sourceManifestSha256:binding.sourceManifestSha256};
    function validate(completed) {
      exactKeys(completed,[...Object.keys(identity),'completedAt','result'],
        [...Object.keys(identity),'completedAt','result']);
      for(const [key,value] of Object.entries(identity))equal(completed[key],value);
      assert(typeof completed.completedAt==='string'&&Number.isFinite(Date.parse(completed.completedAt))&&
        plain(completed.result),'Open the complete original phase receipt.');
      return completed;
    }
    const recorded=await readJson(path,true),journaled=journal.phases[name];
    if(recorded||journaled) {
      const completed=validate(recorded??journaled);
      if(journaled)equal(validate(journaled),completed,'The original phase journal and evidence differ.');
      // A completed evidence file can precede its journal checkpoint. Recover
      // that exact returned value and time without running the phase again.
      await retainCompleted('recover completed phase '+name,async()=>{
        await save(path,completed,true);
        journal.phases[name]=completed;
        if(journal.activePhase===name)delete journal.activePhase;
        await checkpoint();
      });
      return completed.result;
    }
    checkStop();journal.activePhase=name;journal.state='RUNNING';await checkpoint();
    announce({state:'RUNNING',phase:name});
    const result=await run(),completed={...identity,completedAt:now(),result};
    validate(completed);
    // Keep the same actual returned values through a local publication failure.
    await retainCompleted('phase '+name,async()=>{
      await save(path,completed,true);
      journal.phases[name]=completed;delete journal.activePhase;await checkpoint();
    });
    return result;
  }

  async function launch(label,executable,args,{cwd=sdk}={}) {
    checkStop();
    const attempt=randomUUID(),directoryPath=await directory(join(privateRoot,'children',attempt),{privateRoot:true});
    const stdout=join(directoryPath,'stdout.log'),stderr=join(directoryPath,'stderr.log');
    await save(join(directoryPath,'intent.json'),{operation:PROGRAMME_RECEIVING_OPERATION,label,attempt,
      executable,args,cwd,startedAt:now(),stdout,stderr},true);
    let output,errorOutput,owned;
    try {
      output=await open(stdout,'wx',0o600);errorOutput=await open(stderr,'wx',0o600);
      const child=spawn(executable,args,{cwd,env:environment,shell:false,stdio:['ignore',output.fd,errorOutput.fd]});
      owned={attempt,label,child,stdout,stderr,output,errorOutput,directory:directoryPath,closed:false,spawnError:null};
      owned.outcome=new Promise(done=>{
        child.once('error',error=>{owned.spawnError={code:error.code??null,message:safeMessage(error)};});
        child.once('close',(exitCode,signal)=>{
          owned.closed=true;owned.actual={attempt,label,pid:child.pid??null,exitCode,signal,
            error:owned.spawnError,endedAt:now(),stdout,stderr};done(owned.actual);
        });
      });
      children.add(owned);
      await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});
      await save(join(directoryPath,'started.json'),{attempt,label,pid:child.pid,startedAt:now()},true);
      checkStop();return owned;
    } catch(error) {
      if(owned) {
        if(!owned.closed)owned.child.kill('SIGTERM');
        await closeChild(owned);
      } else {await output?.close();await errorOutput?.close();}
      throw error;
    }
  }
  async function closeChild(owned,{stop=false}={}) {
    if(stop&&!owned.closed)owned.child.kill('SIGTERM');
    const actual=await owned.outcome;
    if(!owned.retained) {
      await retainCompleted('native return '+owned.label,async()=>{
        if(owned.output)await owned.output.sync();
        if(owned.errorOutput)await owned.errorOutput.sync();
        const outputInfo=await fileInfo(owned.stdout),errorInfo=await fileInfo(owned.stderr);
        await save(join(owned.directory,'result.json'),{...actual,stdout:outputInfo,stderr:errorInfo},true);
        await save(join(root,'console-closures',owned.attempt+'.json'),{
          ...actual,stdout:{bytes:outputInfo.bytes,sha256:outputInfo.sha256},
          stderr:{bytes:errorInfo.bytes,sha256:errorInfo.sha256},
          stderrTail:safeMessage(await tail(owned.stderr))},true);
      });
      owned.retained=true;
    }
    if(owned.output){await owned.output.close();owned.output=null;}
    if(owned.errorOutput){await owned.errorOutput.close();owned.errorOutput=null;}
    children.delete(owned);return actual;
  }
  async function processJson(label,executable,args,{maximum=64*1024*1024}={}) {
    const owned=await launch(label,executable,args);
    try {
      const ended=await closeChild(owned);
      if(ended.exitCode!==0||ended.signal||ended.error)throw Object.assign(new Error(label+' ended: '+JSON.stringify({
        exitCode:ended.exitCode,signal:ended.signal,error:ended.error,stderr:safeMessage(await tail(owned.stderr))})),
        {code:'PROGRAMME_NATIVE_CHILD_FAILED'});
      const returned=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(owned.stdout,maximum)));
      return {returned,native:ended};
    } finally {if(children.has(owned))await closeChild(owned,{stop:true});}
  }
  const cli=(role,label,args)=>processJson(label,process.execPath,[
    join(sdk,'grant-portfolio/cli.mjs'),'--python',python,'--workspace',join(root,'workspaces',role),...args]);
  async function startConsole(role) {
    checkStop();assert(!consoles.has(role),'Keep the original console owner.');
    const workspace=join(root,'workspaces',role);
    if(!await exists(join(workspace,'workspace.json')))await cli(role,'initialize-'+role,['init']);
    const {returned:binding}=await cli(role,'binding-'+role,['binding']);
    journal.refs.workspaces??={};
    if(journal.refs.workspaces[role])assert(journal.refs.workspaces[role]===binding.workspaceId,'Use the original workspace UUID.');
    else {
      const captured=binding.workspaceId;
      await retainCompleted('workspace identity '+role,async()=>{journal.refs.workspaces[role]=captured;await checkpoint();});
    }
    const connection=join(privateRoot,'connections',role+'-'+randomUUID()+'.json');
    const owned=await launch('console-'+role,process.execPath,[join(sdk,'grant-portfolio/cli.mjs'),
      '--python',python,'--workspace',workspace,'serve','--port','0','--connection-file',connection,
      '--expected-binding',binding.sha256,'--startup-format','json']);
    let client;
    try {
      let ready=null;
      while(!ready) {
        checkStop();
        if(owned.closed)throw new Error('Original console ended before READY: '+safeMessage(await tail(owned.stderr)));
        if(await exists(connection))ready=await readJson(connection);
        else await sleep(100);
      }
      assert(ready.schema==='stellar-forge.grant-portfolio-workspace-launch.v1'&&ready.status==='GRANT_PORTFOLIO_WORKSPACE_READY');
      assert(ready.workspace===workspace&&ready.workspaceId===binding.workspaceId&&ready.bindingSha256===binding.sha256);
      assert(ready.sourceRoot===sdk&&Number.isSafeInteger(ready.pid)&&ready.pid>0);
      privateValues.add(ready.console);privateValues.add(new URL(ready.console).hash.slice(1));
      client=await connectGrantPortfolio({consoleUrlFile:connection,timeoutMs:900000});
      equal(await client.launch(),ready,'Open the actual original launch.');
      assert((await client.state()).workspaceId===binding.workspaceId);
      consoles.set(role,{role,workspace,ready,client,owned});
      await retainCompleted('console launch '+role,()=>save(join(owned.directory,'verified-launch.json'),{
        workspace,workspaceId:binding.workspaceId,bindingSha256:binding.sha256,pid:ready.pid,connection,
        sourceRoot:ready.sourceRoot,python:ready.python},true));
      return client;
    } catch(error) {
      await client?.dispose().catch(()=>{});
      await closeChild(owned,{stop:true});throw error;
    }
  }
  async function stopConsole(role) {
    const held=consoles.get(role);if(!held)return null;
    await held.client.dispose();
    const ended=await closeChild(held.owned,{stop:true});
    consoles.delete(role);
    assert(ended.exitCode===0&&!ended.signal&&!ended.error,'Retain and resolve the actual console close outcome.');
    return {workspaceId:held.ready.workspaceId,bindingSha256:held.ready.bindingSha256,
      attempt:ended.attempt,pid:held.ready.pid,exitCode:ended.exitCode,signal:ended.signal};
  }
  async function completeOriginal(client,key,inputValue) {
    const inputPath=join(root,'actions',key+'.input.json');
    await save(inputPath,inputValue,true);
    const resultPath=join(root,'actions',key+'.result.json');
    const retained=await readJson(resultPath,true);
    if(retained) {
      assert(retained.id===inputValue.operationId&&retained.state==='COMPLETED');
      equal(retained.input,inputValue);
      const actual=await client.request(inputValue.operationId);
      equal(actual,retained,'The original completed request changed.');
      return retained;
    }
    let request;
    try{request=await client.request(inputValue.operationId);}
    catch(error){if(error.status!==404)throw error;checkStop();request=await client.action(inputValue,{signal:controller.signal});}
    equal(request.input,inputValue,'The original request has a different frozen input.');
    if(request.state==='FAILED') {
      await retainCompleted('failed original request '+key,()=>save(join(root,'actions',key+'.failure-'+sha(encoded(request))+'.json'),request,true));
      assert(request.error?.retryable===true,'Resolve this original nonretryable request: '+safeMessage(request.error?.message));
      checkStop();request=await client.resume(inputValue.operationId,{signal:controller.signal});
    }
    while(request.state==='RUNNING') {
      checkStop();await sleep(500);
      request=await client.request(inputValue.operationId,{signal:controller.signal});
    }
    await retainCompleted('actual original request '+key,()=>save(
      request.state==='COMPLETED'?resultPath:join(root,'actions',key+'.failure-'+sha(encoded(request))+'.json'),request,true));
    assert(request.state==='COMPLETED','The original request did not complete: '+safeMessage(request.error?.message));
    equal(request.input,inputValue);
    return request;
  }
  async function originalAction(client,key,action,payload) {
    const path=join(root,'actions',key+'.input.json');
    let frozen=await readJson(path,true);
    if(!frozen) {
      checkStop();
      frozen={operationId:'engrant-'+journal.runId+'-'+key,action,payload:await payload(),
        expectedRevision:(await client.state({signal:controller.signal})).revision};
      await retainCompleted('original action selection '+key,()=>save(path,frozen,true));
    }
    assert(frozen.action===action);
    return completeOriginal(client,key,frozen);
  }
  const programmeOf=portfolio=>portfolio.definition.programme;
  const recordOf=(portfolio,collection,id)=>{
    const row=programmeOf(portfolio).records[collection].find(item=>item.id===id);
    assert(row,'Open the original '+collection+' record.');return row;
  };
  async function currentPortfolio(client) {
    const state=await client.state({signal:controller.signal}),current=state.portfolios.find(item=>item.id===journal.refs.portfolioId);
    assert(current);return client.portfolio(current.id,{revision:current.revision,signal:controller.signal});
  }
  async function changeProgramme(client,key,make) {
    return originalAction(client,key,'portfolio.save',async()=>{
      const previous=await currentPortfolio(client),definition=previous.definition;
      const change=await make(previous);
      return {id:previous.id,expectedPortfolioRevision:previous.revision,
        name:definition.name,notes:definition.notes,sources:definition.sources,review:definition.review,
        programme:{schema:PROGRAMME_SCHEMA,expectedProgrammeRevision:definition.programme.revision,
          actor:input.actor,...change}};
    });
  }
  function change(collection,row,fields) {
    return {collection,id:row.id,expectedRevision:row.revision,fields};
  }
  async function uploadDocument(client,path,filename,contentType) {
    const original=await fileInfo(path),{handle,info}=await regular(path,4*1024*1024*1024);let stream;
    try {
      stream=handle.createReadStream({autoClose:false,start:0,highWaterMark:1024*1024});
      const actual=await client.uploadProgrammeDocument({body:stream,bytes:original.bytes,sha256:original.sha256},
        {signal:controller.signal});
      assert(unchanged(info,await handle.stat()),'The original document changed during upload.');
      equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:original.bytes,sha256:original.sha256});
      return {sha256:actual.sha256,bytes:actual.bytes,filename,contentType};
    } finally {stream?.destroy();await handle.close();}
  }
  async function downloadDocument(client,portfolio,record,name) {
    const destination=join(root,'documents',name);
    const selected={portfolioId:portfolio.id,revision:portfolio.revision,id:record.id};
    const opened=await client.openProgrammeDocument(selected,{signal:controller.signal});
    const actual=await saveGrantPortfolioFile(opened,destination);
    await retainCompleted('downloaded document '+record.id,async()=>{
      const exact=await fileInfo(destination,{synchronize:true});await syncDirectory(dirname(destination));
      equal({bytes:exact.bytes,sha256:exact.sha256},{bytes:record.object.bytes,sha256:record.object.sha256});
      await save(destination+'.receipt.json',{selection:selected,descriptor:record.object,bytes:exact.bytes,sha256:exact.sha256},true);
    });
    return {selection:selected,descriptor:record.object,path:actual.path,bytes:actual.bytes,sha256:actual.sha256};
  }
  async function tableRows(client,portfolio,table,{retainName=null}={}) {
    const observed=createHash('sha256');let pages=0,count=0;
    for await(const page of client.pages({portfolioId:portfolio.id,revision:portfolio.revision,table,limit:50},
      {signal:controller.signal})) {
      assert(page.snapshot===portfolio.snapshot);pages++;count+=page.rows.length;
      assert(count<=page.total);
      if(page.nextOffset===null)assert(count===page.total);
      // This is an observation of parsed client pages, not a replacement for
      // the original native table hash or financial decimal representation.
      observed.update(encoded({offset:page.offset,rows:page.rows}));
    }
    const result={portfolioId:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot,
      table,declaredNativeSha256:portfolio.tableSha256[table],pages,rows:count,
      clientPageSequenceSha256:observed.digest('hex')};
    if(retainName)await save(join(root,'evidence',retainName+'.json'),result,true);
    return result;
  }
  async function archiveFacts(path,label) {
    const programme=[
      'import sys,json,zipfile,hashlib',
      'sys.path.insert(0,sys.argv[1])',
      'from domain import digest',
      'with zipfile.ZipFile(sys.argv[2]) as z:',
      ' m=json.loads(z.read("manifest.json")); h=z.read("history.json"); r=json.loads(z.read("requests.json"))',
      ' print(json.dumps({"manifest":m,"historyCount":len(json.loads(h)),"historySha256":hashlib.sha256(h).hexdigest(),',
      '  "requests":[{"origin":v["origin"],"id":v["request"]["id"],"inputSha256":v["request"]["inputSha256"],"sha256":digest(v)} for v in r]},sort_keys=True))',
    ].join('\n');
    return (await processJson(label,python,['-B','-c',programme,join(sdk,'grant-portfolio'),path])).returned;
  }



  async function prepareOriginalPackages(){
    const returned=await stage('original-engine-customer-file-revisions-and-packages',async()=>{
      const path=join(deskRoot,'packaging-result.json');let actual=await readJson(path,true);
      if(!actual){
        const module=await import(pathToFileURL(join(packageSourceRoot,'build-research-packages.mjs')).href);
        actual=await module.buildResearchPackages({engineRoot:join(packageSourceRoot,'original-engine'),
          inputPath:join(packageSourceRoot,'package-build-input.json'),outDirectory:deskRoot});
      }
      assert(actual.schema==='engrant.research-plans-package-result.v1'&&actual.engine_commit===packageBuildInput.engine_commit&&
        actual.source_case_commit===packageBuildInput.source_case_commit&&actual.independent_receive_exact===true&&actual.same_request_replayed===true);
      equal(actual.original_sample_archive,{bytes:packageBuildInput.expected.original_sample_archive.bytes,
        sha256:packageBuildInput.expected.original_sample_archive.sha256});
      const artifacts=[];
      for(const row of actual.artifacts){
        safeRelative(row.path);const value=await fileInfo(join(deskRoot,row.path),{synchronize:true});await syncDirectory(dirname(value.path));
        equal({bytes:value.bytes,sha256:value.sha256},{bytes:row.bytes,sha256:row.sha256});artifacts.push(value);
      }
      for(const expected of packageBuildInput.expected.archives){
        const pkg=actual.packages.find(row=>row.section===expected.section);assert(pkg&&pkg.package_id===expected.packageId&&
          pkg.customer_package_sha256===expected.customer_package_sha256&&pkg.members===expected.members);
        equal({bytes:pkg.zip.bytes,sha256:pkg.zip.sha256},{bytes:expected.bytes,sha256:expected.sha256});
      }
      const receipt=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
      return {result:actual,receipt,artifacts,archives:actual.packages.map(pkg=>({
        path:join(deskRoot,pkg.zip.path),bytes:pkg.zip.bytes,sha256:pkg.zip.sha256,packageId:pkg.package_id,members:pkg.members}))};
    });
    // Completed stage adoption still reopens every exact customer/source byte.
    // No second packaging engine or regenerated current package selection.
    for(const row of [...returned.artifacts,returned.receipt]){
      const actual=await fileInfo(row.path,{synchronize:true});equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:row.bytes,sha256:row.sha256});
    }
    for(const row of returned.result.artifacts)if(packages.some(pkg=>row.path.startsWith(pkg.directory+'/')))
      deskFiles.push({path:row.path,bytes:row.bytes,sha256:row.sha256});
    for(const pkg of packages){
      for(const path of Object.values(pkg.paths))assert(deskFiles.some(row=>row.path===path),'The actual complete customer package lacks '+path);
      const html=await readBytes(join(deskRoot,pkg.paths['RESEARCH_DESK.html']));
      const match=html.toString('utf8').match(/<script[^>]*id=["']source-data["'][^>]*>([\s\S]*?)<\/script>/);
      assert(match);equal(JSON.parse(match[1]),pkg.seed);
      assert(html.includes(Buffer.from('data-tab="plans"')));
      pkg.htmlSha256=sha(html);
      const modulePath=join(root,'source-inputs',pkg.key+'-actual-core.cjs');
      await writeBytes(modulePath,await readBytes(join(deskRoot,pkg.paths['research-brief-core.js'])),{immutable:true});
      const model=require(modulePath);assert(model.VERSION==='engrant.research-brief-desk.v2');models.set(pkg.key,model);
    }
    await save(join(root,'source-inputs','desk-source-manifest.json'),{
      schema:'stellar-forge.engrant-desk-receiving-source.v1',sourceCaseCommit:deskCommit,publishedSuccessorCommit:'f6cb6688288e61fcd61f2b1afc5bd6cdf1a229a7',
      engineCommit:packageBuildInput.engine_commit,packageBuilderSha256:sha(packageSourceBytes),files:deskFiles},true);
    return returned;
  }


  let deskServer=null,deskOrigin=null;
  async function startDeskServer(){
    if(deskServer)return;
    const routes=new Map();
    for(const row of deskFiles)routes.set('/'+row.path,join(deskRoot,row.path));
    deskServer=createServer(async(req,res)=>{
      try{
        const url=new URL(req.url,'http://127.0.0.1'),path=routes.get(decodeURIComponent(url.pathname));
        if(req.method!=='GET'||!path){res.writeHead(404);res.end();return;}
        const bytes=await readBytes(path,64*1024*1024);
        const type=path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':
          path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.json')?'application/json':'application/octet-stream';
        res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
      }catch(error){if(!res.headersSent)res.writeHead(500);res.end();announce({state:'DESK_SOURCE_READ_FAILED',error:safeMessage(error)});}
    });
    await new Promise((done,reject)=>{deskServer.once('error',reject);deskServer.listen(0,'127.0.0.1',done);});
    deskOrigin='http://127.0.0.1:'+deskServer.address().port;
  }
  async function ensureBrowser(){
    if(!browser){
      const runtime=await import(pathToFileURL(browserSelection.playwright.path).href),chromium=runtime.chromium??runtime.default?.chromium;assert(chromium);
      const tmp=await directory(join(privateRoot,'browser-tmp'),{privateRoot:true});
      browser=await chromium.launch({executablePath:browserSelection.executable.path,headless:true,
        args:['--no-sandbox','--disable-dev-shm-usage'],env:{...environment,TMPDIR:tmp}});
    }
    return browser;
  }
  async function openDesk(pkg,workspace){
    checkStop();await startDeskServer();await ensureBrowser();
    const context=await browser.newContext({viewport:{width:1360,height:940},acceptDownloads:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(safeMessage(e)));
    try{
      await page.goto(deskOrigin+'/'+pkg.paths['RESEARCH_DESK.html']);
      await page.waitForFunction(()=>Boolean(window.ResearchBrief)&&document.querySelector('#organisation')?.options.length>0);
      equal(await page.evaluate(()=>JSON.parse(document.getElementById('source-data').textContent)),pkg.seed);
      if(workspace){
        const payload=Buffer.from(JSON.stringify({format:'engrant.complete-research-desk.v2',source:pkg.seed,workspace},null,2)+'\n');
        await page.locator('#import-workspace').setInputFiles({name:'Original_Complete_Desk.json',mimeType:'application/json',buffer:payload});
        await page.waitForFunction(({sourceId,sourceHash,workspace})=>window.ResearchBrief.identical(
          JSON.parse(localStorage.getItem('engrant-research-brief:'+sourceId+':'+sourceHash)),workspace),
          {sourceId:pkg.source_id,sourceHash:pkg.source_sha256,workspace});
      }
      return {context,page,errors};
    }catch(error){await context.close();throw error;}
  }
  async function browserDownload(view,trigger,target){
    checkStop();await directory(dirname(target));const pending=view.page.waitForEvent('download');pending.catch(()=>{});
    await trigger();const download=await pending,filename=download.suggestedFilename(),staged=target+'.download-'+randomUUID();
    try{
      await download.saveAs(staged);assert(await download.failure()===null);
      const actual=await fileInfo(staged,{synchronize:true});
      await retainCompleted('original complete browser download',async()=>{
        try{await link(staged,target);}catch(error){if(error.code!=='EEXIST')throw error;}
        const found=await fileInfo(target,{synchronize:true});equal({bytes:found.bytes,sha256:found.sha256},{bytes:actual.bytes,sha256:actual.sha256});
        await syncDirectory(dirname(target));
      });
      return {...await fileInfo(target),filename};
    }finally{try{await unlink(staged);await syncDirectory(dirname(staged));}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  async function views(view,label){
    const images=[];
    for(const viewport of [{width:1360,height:940},{width:390,height:844}]){
      await view.page.setViewportSize(viewport);
      const size=await view.page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert(size.scrollWidth<=size.width,'The real receiving view exceeds its viewport.');
      const path=join(root,'evidence',label+'-'+viewport.width+'-'+randomUUID()+'.png');
      await view.page.screenshot({path,fullPage:true});const image=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
      images.push({...image,viewport,size});
    }
    equal(view.errors,[]);return images;
  }
  async function fieldValue(page,selector,value){
    const field=page.locator(selector);const tag=await field.evaluate(e=>e.tagName);
    if(tag==='SELECT')await field.selectOption(value);else await field.fill(value);
    await field.dispatchEvent('change');
  }
  const selectedDesk=(workspace,pkg)=>workspace.organisations.find(o=>o.lead_id===pkg.seed.profiles[0].lead_id);
  const fixtureCandidateId=key=>'internal-'+key+'-'+('r'.repeat(200));
  const deskCandidate=(workspace,pkg)=>selectedDesk(workspace,pkg).candidates.find(c=>c.id===fixtureCandidateId(pkg.key));
  function completeDesk(pkg,value){
    assert(value?.format==='engrant.complete-research-desk.v2');equal(value.source,pkg.seed);
    return models.get(pkg.key).validateWorkspace(value.workspace,pkg.seed);
  }
  async function deskPhase(pkg,name,before,mutate,validate,{capture=true}={}){
    return stage(pkg.key+'-'+name,async()=>{
      const phaseRoot=await directory(join(root,'desk-results',pkg.key,name),{privateRoot:true});
      const returnedPath=join(phaseRoot,'completed-return.json'),prior=await readJson(returnedPath,true);
      if(prior){
        equal(prior.source,{source_id:pkg.source_id,source_sha256:pkg.source_sha256});
        const workspace=completeDesk(pkg,await readJson(prior.file.path));equal(workspace,prior.workspace);validate(workspace);
        for(const f of [prior.file,...prior.images])equal(await fileInfo(f.path),{path:f.path,bytes:f.bytes,sha256:f.sha256});
        return prior;
      }
      const finalPath=join(phaseRoot,'complete-desk.json'),published=await readJson(finalPath,true);
      const view=await openDesk(pkg,published?completeDesk(pkg,published):before);
      try{
        if(!published)await mutate(view);
        const file=published?await fileInfo(finalPath):await browserDownload(view,()=>view.page.locator('#export-workspace').click(),finalPath);
        const workspace=completeDesk(pkg,await readJson(finalPath));validate(workspace);
        const images=capture?await views(view,pkg.key+'-'+name):[];
        const result={source:{source_id:pkg.source_id,source_sha256:pkg.source_sha256},phase:name,workspace,file,images,
          browserVersion:browser.version(),pageErrors:view.errors,recoveredPublishedReturn:Boolean(published)};
        await retainCompleted('complete desk phase '+name,()=>save(returnedPath,result,true));return result;
      }finally{await view.context.close();}
    });
  }
  async function selectCandidate(view,pkg,tab='review'){
    await view.page.selectOption('#organisation',pkg.seed.profiles[0].lead_id);
    await view.page.locator('[data-tab="'+tab+'"]').click();
    if(await view.page.locator('#show-archived').count())await view.page.locator('#show-archived').check();
    await view.page.selectOption('#candidate-picker',fixtureCandidateId(pkg.key));
  }
  async function decision(view,disposition,note){
    for(const [key,value]of Object.entries({decision:disposition,reviewer:input.actor,reviewed_on:input.asOf,rationale:note}))
      await fieldValue(view.page,'[data-decision="'+key+'"]',value);
    await view.page.locator('#record-decision').click();
    await view.page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Decision edition recorded'));
  }
  async function planEdition(view,note){
    for(const [key,value]of Object.entries({prepared_by:input.actor,prepared_on:input.asOf,note}))
      await fieldValue(view.page,'[data-record-plan="'+key+'"]',value);
    await view.page.locator('#record-plan').click();
    await view.page.waitForFunction(()=>document.getElementById('notice').textContent.includes('Complete application plan edition recorded'));
  }
  async function taskFields(view,index,fields){
    for(const [key,value]of Object.entries(fields))
      await fieldValue(view.page,'[data-task-index="'+index+'"] [data-task="'+key+'"]',value);
  }
  function legacyFixture(pkg){
    const original=JSON.parse(originals.get(pkg.key+'/saved-research-desk.json').content);
    equal(original.source,pkg.seed);const workspace=legacy.validateWorkspace(original.workspace,pkg.seed);
    const o=workspace.organisations[0];workspace.retained_receiving_note='Internal copy; every original source field remains unchanged.';
    o.retained_receiving_note='Original v1 allowed organisation metadata.';
    o.fields.requested_amount='10000000000000000000000000';
    o.fields.application_hours='0.25';o.fields.profile_review_note='Internal migration acceptance; no funding application is made.';
    const c=legacy.candidate(fixtureCandidateId(pkg.key));
    Object.assign(c,{title:'Internal research preparation for '+pkg.seed.profiles[0].organisation,
      funder:'Unselected — internal research preparation only',source_url:'https://engrant.eu/docs/how-to-find-grants-for-nonprofits',
      currency:'USD',amount:'1250.10',deadline:'',eligibility:'Actual eligibility must be checked against a current original opportunity.',
      payment_terms:'No award or payment is recorded.',effort_hours:'0.30',decision:'Pursue',notes:'=INTERNAL_RECEIVING_SOURCE'});
    o.candidates.push(c);legacy.validateWorkspace(workspace,pkg.seed);
    return {format:'engrant.complete-research-desk.v1',source:pkg.seed,workspace};
  }
  async function deskCourse(pkg){
    const model=models.get(pkg.key),lead=pkg.seed.profiles[0].lead_id,fixture=legacyFixture(pkg);
    const originalViews=await stage(pkg.key+'-all-original-profile-and-funding-rows',async()=>{
      const view=await openDesk(pkg,null),images=[],observations=[];
      try{
        for(const profile of pkg.seed.profiles){
          await view.page.selectOption('#organisation',profile.lead_id);
          await view.page.locator('[data-tab="sources"]').click();
          assert(await view.page.locator('#panel tbody tr').count()===profile.records.length);
          const rows=await view.page.locator('#panel tbody tr').allTextContents();
          for(let i=0;i<rows.length;i++){
            for(const expected of [profile.records[i].funder,profile.records[i].period_label,profile.records[i].source_title,profile.records[i].source_location])
              if(expected)assert(rows[i].includes(expected),'The original displayed source field is missing.');
          }
          const hrefs=await view.page.locator('#panel tbody tr td:last-child a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
          equal(hrefs,profile.records.map(r=>r.source_url));
          images.push(...await views(view,pkg.key+'-'+profile.lead_id+'-original-sources'));
          observations.push({leadId:profile.lead_id,rows:profile.records.length,recordsSha256:sha(encoded(profile.records)),originalSourceLinks:hrefs});
        }
        return {source:pkg.source_id,records:pkg.records,profiles:observations,images,pageErrors:view.errors};
      }finally{await view.context.close();}
    });
    const migrated=await deskPhase(pkg,'complete-v1-migration',null,async view=>{
      const originalPath=join(root,'source-inputs',pkg.key+'-original-saved-desk.json');
      await writeBytes(originalPath,Buffer.from(originals.get(pkg.key+'/saved-research-desk.json').content),{immutable:true});
      await view.page.locator('#import-workspace').setInputFiles(originalPath);
      await view.page.waitForFunction(({key,expected})=>window.ResearchBrief.identical(JSON.parse(localStorage.getItem(key)),expected),
        {key:'engrant-research-brief:'+pkg.source_id+':'+pkg.source_sha256,
          expected:model.validateWorkspace(JSON.parse(originals.get(pkg.key+'/saved-research-desk.json').content).workspace,pkg.seed)});
      const unchanged=await browserDownload(view,()=>view.page.locator('#export-workspace').click(),join(root,'desk-results',pkg.key,'original-migrated.json'));
      equal(completeDesk(pkg,await readJson(unchanged.path)),model.validateWorkspace(JSON.parse(originals.get(pkg.key+'/saved-research-desk.json').content).workspace,pkg.seed));
      const file=join(root,'source-inputs',pkg.key+'-legacy-edited-copy.json');await writeBytes(file,Buffer.from(JSON.stringify(fixture,null,2)+'\n'),{immutable:true});
      await view.page.locator('#import-workspace').setInputFiles(file);
      await view.page.waitForFunction(({key,expected})=>window.ResearchBrief.identical(JSON.parse(localStorage.getItem(key)),expected),
        {key:'engrant-research-brief:'+pkg.source_id+':'+pkg.source_sha256,expected:model.validateWorkspace(fixture.workspace,pkg.seed)});
    },workspace=>{
      equal(workspace,model.validateWorkspace(fixture.workspace,pkg.seed));const c=deskCandidate(workspace,pkg);
      assert(c.decisions.length===0&&c.plan_editions.length===0&&c.decision==='Pursue');
      assert(selectedDesk(workspace,pkg).fields.requested_amount==='10000000000000000000000000');
    });
    const reviewed=await deskPhase(pkg,'criteria-and-original-recorded-decision',migrated.workspace,async view=>{
      await selectCandidate(view,pkg);await view.page.locator('#add-criterion').click();
      const fields={requirement:'An actual current opportunity must be confirmed before any external application.',
        authority_url:'https://engrant.eu/docs/how-to-find-grants-for-nonprofits',authority_location:'Original organisation research workflow',
        organisation_evidence:'Original historic funding profile retained as context, not current eligibility.',
        evidence_url:pkg.seed.profiles[0].website,checked_on:input.asOf,
        rationale:'This is internal preparation; a current funder requirement has not yet been supplied.',outcome:'Unclear'};
      for(const [key,value]of Object.entries(fields))await fieldValue(view.page,'[data-criterion-index="0"] [data-criterion="'+key+'"]',value);
      assert((await view.page.locator('#criteria-summary').innerText()).includes('1 eligibility questions unresolved'));
      await decision(view,'Pursue','Pursue internal research preparation only; unresolved eligibility remains explicit and no application is submitted.');
    },workspace=>{
      const c=deskCandidate(workspace,pkg);assert(c.decisions.length===1&&c.decisions[0].decision==='Pursue'&&c.decisions[0].criteria[0].outcome==='Unclear');
      assert(!model.decisionChanged(selectedDesk(workspace,pkg),c));equal(c.decisions[0].brief,selectedDesk(workspace,pkg).fields);
    });
    const planned=await deskPhase(pkg,'exact-task-effort-and-plan-edition-one',reviewed.workspace,async view=>{
      await selectCandidate(view,pkg,'plans');await view.page.locator('#initialise-plan').click();
      await fieldValue(view.page,'[data-plan="owner"]',input.actor);
      await fieldValue(view.page,'[data-plan="objective"]','Prepare a reviewed original research handover. This internal course does not submit a grant application.');
      for(let i=0;i<4;i++)await view.page.locator('#add-task').click();
      await taskFields(view,0,{title:'Retain the original source periods',owner:input.actor,description:'Review the original published context without treating it as a current open opportunity.',
        due:input.asOf,effort_hours:'0.10',source_url:pkg.seed.profiles[0].website,
        completion_note:'The original profile and dated funding rows have been retained and reopened.',completed_on:input.asOf,status:'Completed'});
      await taskFields(view,1,{title:'Confirm a current opportunity',owner:input.actor,description:'Obtain the original current eligibility and submission requirements.',
        due:'2026-10-20',effort_hours:'0.20',status:'In progress',source_url:'https://engrant.eu/docs/how-to-find-grants-for-nonprofits'});
      await taskFields(view,2,{title:'Obtain the original document requirements',owner:input.actor,status:'Waiting',description:'No due date or effort is inferred before requirements are supplied.'});
      await taskFields(view,3,{title:'Cancelled preparation branch',owner:input.actor,effort_hours:'999.99',status:'Cancelled'});
      const metrics=await view.page.locator('#plan-summary').innerText();
      for(const text of ['0.30 known planned hours','0.20 remaining known hours','1 tasks without estimates','1 / 3 active tasks completed'])
        assert(metrics.includes(text),'The actual editable task metrics did not refresh: '+text);
      await planEdition(view,'First selected internal preparation plan; known and unknown work remain separate.');
    },workspace=>{
      const c=deskCandidate(workspace,pkg);assert(c.plan_editions.length===1);
      equal(model.planSummary(c.plan,selectedDesk(workspace,pkg).fields.application_hours,input.asOf),{
        active_tasks:3,completed_tasks:1,waiting_tasks:1,overdue_tasks:0,known_hours:'0.30',remaining_known_hours:'0.20',
        tasks_without_estimates:1,available_hours:'0.25',known_hours_exceed_capacity:true,deadline_passed:null});
      model.validateApplicationPlan(model.applicationPlan(pkg.seed,workspace,lead,c.id,1));
    });
    const changed=await deskPhase(pkg,'changed-review-requires-an-explicit-new-decision',planned.workspace,async view=>{
      await selectCandidate(view,pkg);await fieldValue(view.page,'[data-candidate="notes"]','=INTERNAL_CORRECTED_RESEARCH_NOTE');
      assert((await view.page.locator('#decision-status').innerText()).includes('have changed since that edition'));
      await view.page.locator('#open-plan').click();
      for(const [key,value]of Object.entries({prepared_by:input.actor,prepared_on:input.asOf,note:'Must be rejected until the changed review is recorded.'}))
        await fieldValue(view.page,'[data-record-plan="'+key+'"]',value);
      await view.page.locator('#record-plan').click();
      assert((await view.page.locator('#notice').innerText()).includes('Review the changed candidate'));
      await view.page.locator('[data-tab="review"]').click();
      await decision(view,'Pursue','The internal preparation note is corrected. The original eligibility uncertainty remains unresolved.');
      await view.page.locator('#open-plan').click();
      await taskFields(view,1,{description:'Retain the actual opportunity document before choosing the external application route.'});
      await planEdition(view,'Following full preparation edition; original task IDs and earlier decision remain retained.');
    },workspace=>{
      const c=deskCandidate(workspace,pkg);assert(c.decisions.length===2&&c.plan_editions.length===2);
      equal(c.plan_editions[0],deskCandidate(planned.workspace,pkg).plan_editions[0]);
      equal(c.decisions[0],deskCandidate(planned.workspace,pkg).decisions[0]);
      equal(c.plan_editions[0].plan.tasks.map(t=>t.id),c.plan_editions[1].plan.tasks.map(t=>t.id));
    });
    const historical=await stage(pkg.key+'-selected-plan-downloads-before-later-decision',()=>deskDownloads(pkg,changed.workspace,'before'));
    const archived=await deskPhase(pkg,'later-watch-decision-and-preserved-archive',changed.workspace,async view=>{
      await selectCandidate(view,pkg);await decision(view,'Watch','Pause the current research selection while awaiting the actual funder source. Earlier recorded preparation remains unchanged.');
      await view.page.locator('#open-plan').click();
      for(const [key,value]of Object.entries({prepared_by:input.actor,prepared_on:input.asOf,note:'Must not create a selected plan under Watch.'}))
        await fieldValue(view.page,'[data-record-plan="'+key+'"]',value);
      await view.page.locator('#record-plan').click();
      assert((await view.page.locator('#notice').innerText()).includes('Record a Pursue decision'));
      await view.page.locator('[data-tab="review"]').click();await view.page.locator('#archive-candidate').click();
      await view.page.locator('#archive-candidate').click(); // Restore once, retaining every edition.
      await view.page.locator('#archive-candidate').click(); // Final archive, with historical exports available.
    },workspace=>{
      const c=deskCandidate(workspace,pkg);assert(c.archived&&c.decision==='Watch'&&c.decisions.length===3&&c.plan_editions.length===2);
      equal(c.plan_editions,deskCandidate(changed.workspace,pkg).plan_editions);
      equal(model.applicationPlan(pkg.seed,workspace,lead,c.id,1),model.applicationPlan(pkg.seed,changed.workspace,lead,c.id,1));
    });
    const downloaded=await stage(pkg.key+'-historical-json-text-csv-and-fresh-desk-reopen',()=>deskDownloads(pkg,archived.workspace,'after',historical));
    return {key:pkg.key,source_id:pkg.source_id,source_sha256:pkg.source_sha256,records:pkg.records,profiles:pkg.profiles,
      workspace:archived.workspace,workspaceFile:archived.file,plan:downloaded.planFiles.find(f=>f.edition===1&&f.format==='json'),
      allDownloads:[...historical.files,...downloaded.files],images:[...originalViews.images,...migrated.images,...reviewed.images,
        ...planned.images,...changed.images,...archived.images,...downloaded.images],phases:{migrated,reviewed,planned,changed,archived}};
  }
  async function deskDownloads(pkg,workspace,label,reference=null){
    const view=await openDesk(pkg,workspace),directoryPath=await directory(join(root,'desk-results',pkg.key,'downloads-'+label),{privateRoot:true});
    const model=models.get(pkg.key),candidate=deskCandidate(workspace,pkg),lead=pkg.seed.profiles[0].lead_id,files=[],planFiles=[],images=[];
    try{
      await view.page.locator('[data-tab="brief"]').click();
      const brief=await browserDownload(view,()=>view.page.locator('#brief-download').click(),join(directoryPath,'brief.txt'));
      assert((await readBytes(brief.path)).equals(Buffer.from(model.briefText(pkg.seed,workspace,lead))));files.push(brief);
      await selectCandidate(view,pkg);
      const csv=await browserDownload(view,()=>view.page.locator('#review-export').click(),join(directoryPath,'candidate-review.csv'));
      assert((await readBytes(csv.path)).equals(Buffer.from(model.candidateCSV(pkg.seed,workspace,lead))));
      assert((await readBytes(csv.path)).toString('utf8').includes("'=INTERNAL_"));files.push(csv);
      await view.page.locator('#open-plan').click();
      for(const edition of [1,2]){
        await view.page.selectOption('#plan-edition',String(edition));
        const expected={json:Buffer.from(JSON.stringify(model.applicationPlan(pkg.seed,workspace,lead,candidate.id,edition),null,2)+'\n'),
          txt:Buffer.from(model.planText(pkg.seed,workspace,lead,candidate.id,edition)),csv:Buffer.from(model.planCSV(pkg.seed,workspace,lead,candidate.id,edition))};
        for(const format of ['json','txt','csv']){
          const file=await browserDownload(view,()=>view.page.locator('#plan-'+format).click(),join(directoryPath,'plan-'+edition+'.'+format));
          equal({bytes:file.bytes,sha256:file.sha256},{bytes:expected[format].length,sha256:sha(expected[format])});
          if(reference){const original=reference.planFiles.find(f=>f.edition===edition&&f.format===format);equal({bytes:file.bytes,sha256:file.sha256},{bytes:original.bytes,sha256:original.sha256});}
          planFiles.push({...file,edition,format});files.push(file);
        }
      }
      images.push(...await views(view,pkg.key+'-'+label+'-historical-plan'));
      const complete=await browserDownload(view,()=>view.page.locator('#export-workspace').click(),join(directoryPath,'complete-reopened.json'));
      equal(completeDesk(pkg,await readJson(complete.path)),workspace);files.push(complete);
      // The newly created context above has no previous browser storage; this
      // verifies the entire downloaded state, not a reused source tab.
      return {files,planFiles,images,pageErrors:view.errors,sourceRecordsUnchanged:true,freshBrowserContext:true};
    }finally{await view.context.close();}
  }


  async function programmePage(role,portfolio){
    await ensureBrowser();const context=await browser.newContext({viewport:{width:1360,height:940},acceptDownloads:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(safeMessage(error)));
    try{
      await page.goto(consoles.get(role).ready.console);
      await page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Workspace revision'));
      await page.selectOption('#portfolio-select',portfolio.id);
      await page.waitForFunction(revision=>document.querySelector('#revision-select')?.value===String(revision),portfolio.revision);
      await page.locator('nav button[data-view="programme"]').click();
      await page.getByRole('heading',{name:'Programme delivery',exact:true}).waitFor();
      return {page,context,errors};
    }catch(error){await context.close();throw error;}
  }
  async function selectRegister(page,name,search=''){
    await page.locator('#content').getByLabel('Workspace',{exact:true}).selectOption(name);
    await page.getByLabel('Programme or project',{exact:true}).selectOption('');
    await page.getByLabel('Archived records',{exact:true}).selectOption('true');
    await page.getByLabel('Search this register',{exact:true}).fill(search);
    await page.getByRole('button',{name:'Apply',exact:true}).click();
  }
  async function prepareBrowserRecipient(client,pkg,desk){
    const retained=await stage(pkg.key+'-review-and-download-recipient-plan',async()=>{
      const path=join(root,'documents',pkg.key+'-recipient-import-plan.json');
      const raw=await readJson(path,true);
      if(raw){
        const basis=await client.portfolio(raw.portfolio.id,{revision:raw.portfolio.revision});
        const source=await readBytes(desk.recipientSource.path);
        equal(recipient.prepareRecipientProject(basis,{...raw.selection,bytes:source}),raw);
        return {file:await fileInfo(path,{synchronize:true}),plan:raw,
          source:desk.recipientSource,images:[],recoveredDownloadedPlan:true};
      }
      const basis=await currentPortfolio(client),view=await programmePage('source',basis);
      try{
        const page=view.page;
        await page.getByRole('button',{name:'Import application plan',exact:true}).click();
        await page.getByRole('heading',{name:'Recipient project handover',exact:true}).waitFor();
        await page.getByLabel('Recorded application plan JSON',{exact:true}).setInputFiles(desk.recipientSource.path);
        await page.getByLabel('Retained source filename',{exact:true}).fill(pkg.key+'-original-application-plan.json');
        await page.getByRole('button',{name:'Review source and recipient',exact:true}).click();
        await page.getByLabel('Parent programme',{exact:true}).selectOption(journal.refs.ids.programme);
        await page.getByLabel('Recipient organisation',{exact:true}).selectOption(journal.refs.ids[pkg.key+'-partner']);
        await page.getByLabel('I confirm this partner represents the original organisation',{exact:true}).check();
        await page.getByLabel('Recording actor',{exact:true}).fill(input.actor);
        await page.getByLabel('New project code',{exact:true}).fill('INTERNAL-ENGRANT-'+pkg.key.toUpperCase());
        await page.getByLabel('Project title',{exact:true}).fill('Internal recipient planning — '+pkg.seed.profiles[0].organisation);
        await page.getByLabel('Project owner',{exact:true}).fill(input.actor);
        await page.getByLabel('Project description',{exact:true}).fill(
          'Internal receiving fixture using the original research profile. No external applicant, grant award, submission or payment is asserted.');
        const original=recipient.parseEngrantApplicationPlan(await readBytes(desk.recipientSource.path));
        for(const [index,task]of original.plan.plan.tasks.entries()){
          if(!task.due)continue;
          await page.getByLabel('Milestone code '+(index+1),{exact:true}).fill('INTERNAL-'+pkg.key.toUpperCase()+'.T'+(index+1));
          await page.getByLabel('Milestone owner '+(index+1),{exact:true}).fill(input.actor);
          const status={Completed:'complete','In progress':'in-progress',Cancelled:'cancelled',Planned:'planned'}[task.status];
          assert(status,'Choose the actual explicit source task status.');
          await page.getByLabel('Programme status '+(index+1),{exact:true}).selectOption(status);
          await page.getByLabel('Progress percent '+(index+1),{exact:true}).fill(status==='complete'?'100':status==='in-progress'?'25':'0');
        }
        await page.getByRole('button',{name:'Review complete recipient import',exact:true}).click();
        await page.getByRole('heading',{name:'4. Save the reviewed recipient project',exact:true}).waitFor();
        assert(await page.getByRole('button',{name:'Save reviewed project',exact:true}).isDisabled(),
          'Retain the actual downloaded handover before its first write.');
        const file=await browserDownload(view,()=>page.getByRole('button',{name:'Download original recipient plan',exact:true}).click(),path);
        const plan=await readJson(path),source=await readBytes(desk.recipientSource.path);
        equal(recipient.prepareRecipientProject(basis,{...plan.selection,bytes:source}),plan,
          'The actual browser plan must exactly match the maintained native planner.');
        assert(plan.binding.original.planEdition===1&&plan.binding.original.decisionEdition===1);
        assert(plan.selection.partnerId===journal.refs.ids[pkg.key+'-partner']&&plan.selection.recipientConfirmed===true);
        assert(plan.retainedOnlyTasks.length>=1&&plan.retainedOnlyTasks.some(task=>task.due===''));
        equal({bytes:plan.source.bytes,sha256:plan.source.sha256},{bytes:desk.recipientSource.bytes,sha256:desk.recipientSource.sha256});
        const images=await views(view,pkg.key+'-recipient-reviewed');
        // This phase deliberately ends before a save. The next phase opens a
        // new console and browser, using this actual downloaded original plan.
        return {file,plan,source:desk.recipientSource,images,uiGenerated:true,dispatched:false};
      }finally{await view.context.close();}
    });
    // The browser file retains actual JSON key order for actionSha256. Phase
    // evidence is canonical JSON; always reopen the raw downloaded plan.
    const originalPlan=await readJson(retained.file.path);equal(originalPlan,retained.plan);
    return {...retained,plan:originalPlan};
  }
  function assertRecipientResult(before,after,plan,source){
    assert(after.id===before.id&&after.revision===before.revision+1);
    equal(after.definition.sources,before.definition.sources);
    equal(after.definition.review,before.definition.review);
    equal(after.financialTotals,before.financialTotals);
    equal(after.tableSha256.financial,before.tableSha256.financial);
    equal(programmeOf(after).records.grants,programmeOf(before).records.grants);
    equal(after.definition.awards??null,before.definition.awards??null);
    for(const collection of COLLECTIONS){
      const earlier=programmeOf(before).records[collection],following=programmeOf(after).records[collection];
      for(const old of earlier)equal(following.find(row=>row.id===old.id),old);
      const selected=plan.action.payload.programme.changes.filter(row=>row.collection===collection);
      assert(following.length===earlier.length+selected.length);
    }
    const document=recordOf(after,'documents',plan.binding.documentId);
    equal(document.object,plan.source);
    const binding=JSON.parse(document.content);
    equal(binding.original,plan.binding.original);equal(binding.recipient,plan.binding.recipient);
    const parsed=recipient.parseEngrantApplicationPlan(source);
    for(const mapped of plan.selection.milestones){
      const original=parsed.plan.plan.tasks.find(task=>task.id===mapped.taskId),saved=recordOf(after,'milestones',mapped.id);
      assert(saved.nodeId===plan.binding.projectId&&saved.dueDate===original.due&&saved.status===mapped.status);
      equal(saved.documentIds,[plan.binding.documentId]);
      assert(saved.completedDate===(mapped.status==='complete'?original.completed_on:null));
    }
    return document;
  }
  async function resumeBrowserRecipient(client,pkg,prepared){
    return stage(pkg.key+'-cold-original-recipient-save',async()=>{
      const plan=prepared.plan,source=await readBytes(prepared.source.path);
      const basis=await client.portfolio(plan.portfolio.id,{revision:plan.portfolio.revision});
      equal(recipient.prepareRecipientProject(basis,{...plan.selection,bytes:source}),plan);
      const key=pkg.key+'-recipient-save',inputPath=join(root,'actions',key+'.input.json');
      await retainCompleted('same original recipient action',()=>save(inputPath,plan.action,true));
      let existing=null;
      try{existing=await client.request(plan.action.operationId);}
      catch(error){if(error.code!=='NOT_FOUND'&&error.status!==404)throw error;}
      let images=[],view=null,routeFailure=null,actualPost=false;
      try{
        if(!existing){
          view=await programmePage('source',basis);
          await view.page.getByRole('button',{name:'Import application plan',exact:true}).click();
          await view.page.getByLabel('Recorded application plan JSON',{exact:true}).setInputFiles(prepared.source.path);
          await view.page.getByLabel('Saved recipient import plan',{exact:true}).setInputFiles(prepared.file.path);
          await view.page.getByRole('button',{name:'Review original recipient import',exact:true}).click();
          await view.page.getByRole('button',{name:'Continue original recipient import',exact:true}).waitFor();
          images=await views(view,pkg.key+'-recipient-cold-resume');
          await view.page.route('**/api/action',async route=>{
            try{
              equal(route.request().postDataJSON(),plan.action);
              await retainCompleted('actual resumed browser action',()=>save(inputPath,plan.action,true));
              if(stopRequested)await route.abort();else{actualPost=true;await route.continue();}
            }catch(error){routeFailure=error;await route.abort();}
          });
          const response=view.page.waitForResponse(value=>new URL(value.url()).pathname==='/api/action'&&value.request().method()==='POST');
          response.catch(()=>{});
          await view.page.getByRole('button',{name:'Continue original recipient import',exact:true}).click();
          const accepted=await response;if(routeFailure)throw routeFailure;
          assert(actualPost&&[200,202].includes(accepted.status()),'Observe the original browser action response.');
          equal(view.errors,[]);
        }else equal(existing.input,plan.action);
        const request=await completeOriginal(client,key,plan.action),after=request.result;
        const document=assertRecipientResult(basis,after,plan,source);
        const downloaded=await downloadDocument(client,after,document,pkg.key+'-received-original-plan.json');
        equal(await readBytes(downloaded.path),source);
        const beforeRepeat=await client.state();
        // Exercise the original public native API with this same completed
        // operation. It verifies the historical basis and reuses its result.
        const repeated=await recipient.submitRecipientProject(client,plan,source,{signal:controller.signal});
        equal(repeated,request);assert((await client.state()).revision===beforeRepeat.revision);
        return {requestId:request.id,inputSha256:request.inputSha256,portfolio:after,
          projectId:plan.binding.projectId,documentId:document.id,milestoneIds:plan.selection.milestones.map(row=>row.id),
          document:downloaded,images,actualBrowserPost:actualPost,recoveredOriginalRequest:Boolean(existing),
          sameNativeApiOperationReplayed:true,unchangedReplayRevision:beforeRepeat.revision};
      }finally{if(view)await view.context.close();}
    });
  }
  async function recipientViews(role,portfolio,plans,label){
    const view=await programmePage(role,portfolio),images=[],downloads=[];
    try{
      for(const prepared of plans){
        const plan=prepared.plan,project=recordOf(portfolio,'nodes',plan.binding.projectId);
        await selectRegister(view.page,'nodes',project.code);
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        await view.page.getByText(project.title,{exact:true}).first().waitFor();
        images.push(...await views(view,label+'-'+project.id));
        await view.page.locator('#close-detail').click();
        const document=recordOf(portfolio,'documents',plan.binding.documentId);
        await selectRegister(view.page,'documents',document.title);
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        const downloaded=await browserDownload(view,
          ()=>view.page.getByRole('button',{name:'Download document',exact:true}).click(),
          join(root,'documents',label+'-'+document.id+'.json'));
        equal({bytes:downloaded.bytes,sha256:downloaded.sha256},{bytes:document.object.bytes,sha256:document.object.sha256});
        downloads.push(downloaded);
        await view.page.getByRole('button',{name:'Record history',exact:true}).click();
        await view.page.getByRole('button',{name:'Open edition',exact:true}).first().click();
        await view.page.locator('#close-detail').click();
      }
      await view.page.selectOption('#revision-select','1');
      await view.page.getByRole('heading',{name:'Programme delivery',exact:true}).waitFor();
      equal(view.errors,[]);return {images,downloads,historicalRevisionOpened:1,pageErrors:view.errors};
    }finally{await view.context.close();}
  }
  async function verifyHistory(client,final,label,{reference=null}={}){
    const versions=[],tables=[],documentEditions=new Map(),records=[];
    for(let revision=1;revision<=final.revision;revision++){
      const portfolio=await client.portfolio(final.id,{revision,signal:controller.signal});
      if(reference)equal(portfolio,await reference.portfolio(final.id,{revision,signal:controller.signal}));
      assert(portfolio.sources.length===0);equal(portfolio.financialTotals,journal.refs.financialBaseline.totals);
      equal(portfolio.tableSha256.financial,journal.refs.financialBaseline.tableSha256);
      assert(programmeOf(portfolio).records.grants.length===0);
      for(const table of Object.keys(portfolio.tableSha256).sort()){
        const actual=await tableRows(client,portfolio,table);
        if(reference)equal(actual,await tableRows(reference,portfolio,table));tables.push(actual);
      }
      for(const document of programmeOf(portfolio).records.documents)if(document.object){
        const key=document.id+':'+document.object.sha256;if(!documentEditions.has(key))documentEditions.set(key,{portfolio,document});
      }
      await save(join(root,'evidence',label+'-portfolio-r'+revision+'.json'),portfolio,true);
      versions.push({revision,snapshot:portfolio.snapshot,operationId:portfolio.operationId,
        programmeRevision:programmeOf(portfolio).revision,tableSha256:portfolio.tableSha256});
    }
    for(const collection of COLLECTIONS)for(const original of programmeOf(final).records[collection]){
      const query={portfolioId:final.id,revision:final.revision,collection,id:original.id};
      const record=await client.programmeRecord(query),history=await client.programmeHistory(query);
      equal(record.record,original);assert(history.history.length);equal(history.history.at(-1).record,original);
      if(reference)equal(history,await reference.programmeHistory(query));
      records.push({collection,id:original.id,recordRevision:original.revision,recordSha256:original.sha256,history:history.history});
    }
    const downloads=[];
    for(const {portfolio,document}of documentEditions.values())
      downloads.push(await downloadDocument(client,portfolio,document,label+'-'+document.id+'-'+document.object.sha256+'.json'));
    const position=await client.programmePosition({portfolioId:final.id,revision:final.revision,nodeId:journal.refs.ids.programme});
    assert(position.position.financialRowRefs.length===0);
    return {versions,tables,records,documentEditions:downloads,position};
  }

  const closureErrors=new Map();
  async function cleanup() {
    const recordCloseError=error=>{
      const captured={code:error.code??null,message:safeMessage(error)};
      closureErrors.set(JSON.stringify(captured),captured);
    };
    if(browser) {
      try{await browser.close();browser=null;}catch(error){recordCloseError(error);}
    }
    for(const role of [...consoles.keys()].reverse())
      try{await stopConsole(role);}catch(error){recordCloseError(error);}
    for(const owned of [...children])
      try{await closeChild(owned,{stop:true});}catch(error){recordCloseError(error);}
    if(deskServer){
      try{await new Promise((done,reject)=>deskServer.close(error=>error?reject(error):done()));deskServer=null;deskOrigin=null;}
      catch(error){recordCloseError(error);}
    }
    return {closed:!browser&&!deskServer&&consoles.size===0&&children.size===0,errors:[...closureErrors.values()],
      browserHeld:Boolean(browser),deskServerHeld:Boolean(deskServer),consoleOwners:consoles.size,childrenHeld:children.size};
  }


  let completedResult=null,failure=null,resourceResult=null,alreadyComplete=false;
  try{
    const packaging=await prepareOriginalPackages();
    const existing=await readJson(join(root,'complete.json'),true);
    if(existing){
      equal(existing.binding,binding);assert(existing.state==='COMPLETE'&&existing.operation===PROGRAMME_RECEIVING_OPERATION&&existing.resources.closed);
      for(const row of [...existing.customerArchives,...existing.receivedArchives,...existing.images,...existing.applicationFiles]){
        const actual=await fileInfo(row.path,{synchronize:true});equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:row.bytes,sha256:row.sha256});
      }
      await retainCompleted('reconcile original complete receiving',async()=>{
        journal.state='COMPLETE';journal.completedAt=existing.completedAt;journal.resources=existing.resources;
        delete journal.activePhase;delete journal.error;await checkpoint();
      });
      completedResult=existing;alreadyComplete=true;
    }else{
      const desks=[];
      for(const pkg of packages){const result=await deskCourse(pkg);result.recipientSource=result.plan;desks.push(result);}
      assert(desks.reduce((n,row)=>n+row.records,0)===41);
      await stage('original-internal-recipient-identities',async()=>{
        if(!journal.refs.ids){
          const ids=Object.fromEntries(['portfolio','programme',...packages.map(pkg=>pkg.key+'-partner')].map(key=>[key,randomUUID()]));
          await retainCompleted('same internal recipient identities',async()=>{journal.refs.ids=ids;await checkpoint();});
        }
        return {ids:journal.refs.ids,scope:'Internal receiving of original research profiles; no customer enrollment, external submission or awarded funding.'};
      });
      let client=await startConsole('source');
      const schema=await client.programmeSchema();assert(schema.schema===PROGRAMME_SCHEMA);equal(schema.collections,COLLECTIONS);
      const initial=await stage('original-empty-finance-recipient-programme',async()=>{
        const ids=journal.refs.ids,record=(collection,key,fields)=>({collection,id:ids[key],expectedRevision:0,fields});
        const request=await originalAction(client,'create-research-handover-portfolio','portfolio.save',async()=>({
          name:'Engrant internal research-to-recipient handover',notes:'Original historical research and internal preparation only. No live grant opportunity, applicant submission, award or payment is asserted.',
          sources:[],review:{status:'draft',reviewer:input.actor,note:'Internal receiving of complete original source and user-authored preparation.'},
          programme:{schema:PROGRAMME_SCHEMA,actor:input.actor,expectedProgrammeRevision:0,
            settings:{asOf:input.asOf,riskScaleMaximum:5,highRiskScore:15},changes:[
              record('nodes','portfolio',{kind:'portfolio',code:'INTERNAL-ENGRANT',title:'Internal source-backed research preparation',owner:input.actor,
                description:'Independent receiving of the original free and five-organisation research editions.'}),
              record('nodes','programme',{kind:'programme',parentId:ids.portfolio,code:'INTERNAL-ENGRANT-PLANNING',title:'Internal recipient preparation',
                owner:input.actor,description:'Application tasks selected by the receiving course. Historical funding remains source context.'}),
              ...packages.map(pkg=>record('partners',pkg.key+'-partner',{code:'INTERNAL-'+pkg.key.toUpperCase(),
                name:pkg.seed.profiles[0].organisation,roles:['internal-research-recipient'],
                description:'Internal receiving fixture for this original source profile; this does not assert customer enrollment or an external relationship.'}))
            ]}}));
        const portfolio=request.result;
        await retainCompleted('original recipient portfolio basis',async()=>{
          journal.refs.portfolioId=portfolio.id;journal.refs.financialBaseline={tableSha256:portfolio.tableSha256.financial,
            totals:portfolio.financialTotals,sourceIds:portfolio.sources};await checkpoint();
        });
        assert(programmeOf(portfolio).records.grants.length===0);
        return portfolio;
      });
      if(!journal.refs.portfolioId){
        await retainCompleted('recover original recipient portfolio basis',async()=>{
          journal.refs.portfolioId=initial.id;journal.refs.financialBaseline={tableSha256:initial.tableSha256.financial,
            totals:initial.financialTotals,sourceIds:initial.sources};await checkpoint();
        });
      }
      const preparedPlans=[],recipients=[];
      for(let index=0;index<packages.length;index++){
        const pkg=packages[index],desk=desks[index],prepared=await prepareBrowserRecipient(client,pkg,desk);
        preparedPlans.push(prepared);
        await stage(pkg.key+'-cold-console-before-recipient-resume',async()=>{
          if(browser){await browser.close();browser=null;}
          const closed=await stopConsole('source');
          const cold=await cli('source',pkg.key+'-cold-preimport-portfolio',['portfolio','--id',prepared.plan.portfolio.id,
            '--revision',String(prepared.plan.portfolio.revision)]);
          assert(cold.returned.snapshot===prepared.plan.portfolio.snapshot);
          return {closed,native:cold.native,basis:prepared.plan.portfolio};
        });
        client=consoles.has('source')?consoles.get('source').client:await startConsole('source');
        recipients.push(await resumeBrowserRecipient(client,pkg,prepared));
      }
      const final=await currentPortfolio(client);
      assert(final.id===initial.id&&final.revision===initial.revision+2);
      assert(programmeOf(final).records.grants.length===0);
      assert(programmeOf(final).records.nodes.filter(row=>row.kind==='project').length===2);
      equal(final.financialTotals,initial.financialTotals);equal(final.tableSha256.financial,initial.tableSha256.financial);
      const sourceReadback=await stage('complete-recipient-history-and-source-document-streams',()=>verifyHistory(client,final,'source'));
      const sourceViews=await stage('recipient-desktop-phone-and-original-document-downloads',()=>recipientViews('source',final,preparedPlans,'source'));
      const customer=await stage('complete-original-recipient-export',async()=>{
        const request=await originalAction(client,'complete-recipient-export','portfolio.export',async()=>({portfolioId:final.id,revision:final.revision}));
        const path=join(root,'exports','Engrant_Recipient_Projects_Complete.zip');
        await client.downloadExport(request.result.sha256,path,{bytes:request.result.bytes,signal:controller.signal});
        const actual=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:request.result.bytes,sha256:request.result.sha256});
        const repeated=await client.action(await readJson(join(root,'actions','complete-recipient-export.input.json')));
        equal(repeated,request);
        const facts=await archiveFacts(path,'inspect-complete-recipient-export');
        assert(facts.historyCount===final.revision&&facts.manifest.snapshot===final.snapshot);
        for(const row of sourceFiles)equal(facts.manifest.files['runtime/sf30-seller-sdk/'+row.path],{bytes:row.bytes,sha256:row.sha256});
        for(const prepared of preparedPlans)equal(facts.manifest.files['programme/documents/'+prepared.plan.source.sha256],
          {bytes:prepared.plan.source.bytes,sha256:prepared.plan.source.sha256});
        await save(join(root,'evidence','complete-export-inventory.json'),facts,true);
        return {...actual,filename:request.result.filename,operationId:request.id,snapshot:final.snapshot,
          historySha256:facts.historySha256,requests:facts.requests};
      });
      await stage('cold-original-recipient-workspace-reopen',async()=>{
        if(browser){await browser.close();browser=null;}
        const closed=await stopConsole('source');
        const cold=await cli('source','cold-final-original-portfolio',['portfolio','--id',final.id,'--revision',String(final.revision)]);
        equal(cold.returned,final);return {closed,native:cold.native,workspaceId:journal.refs.workspaces.source,snapshot:final.snapshot};
      });
      client=consoles.has('source')?consoles.get('source').client:await startConsole('source');
      const target=await startConsole('receiver');
      const received=await stage('independent-complete-recipient-receiving',async()=>{
        const uploaded=await target.uploadFile(customer.path,{sha256:customer.sha256,signal:controller.signal});
        const request=await originalAction(target,'receive-complete-recipient','portfolio.receive',async()=>({object:uploaded.sha256}));
        assert(request.result.snapshot===final.snapshot&&request.result.historyCount===final.revision);
        assert((await target.state()).workspaceId!==journal.refs.workspaces.source);
        equal(await target.portfolio(final.id,{revision:final.revision}),final);
        return {operationId:request.id,result:request.result,observations:await verifyHistory(target,final,'receiver',{reference:client})};
      });
      const receiverViews=await stage('received-recipient-desktop-phone-and-documents',()=>recipientViews('receiver',final,preparedPlans,'receiver'));
      const reexport=await stage('complete-recipient-reexport-preserves-history-and-original-requests',async()=>{
        const request=await originalAction(target,'reexport-complete-recipient','portfolio.export',async()=>({portfolioId:final.id,revision:final.revision}));
        const path=join(root,'exports','Engrant_Received_Recipient_Projects_Complete.zip');
        await target.downloadExport(request.result.sha256,path,{bytes:request.result.bytes,signal:controller.signal});
        const actual=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:request.result.bytes,sha256:request.result.sha256});
        const before=await readJson(join(root,'evidence','complete-export-inventory.json')),after=await archiveFacts(path,'inspect-complete-recipient-reexport');
        assert(after.historySha256===before.historySha256);
        for(const [name,value]of Object.entries(before.manifest.files))if(name.startsWith('sources/')||name.startsWith('rows/')||
          name.startsWith('programme/documents/'))equal(after.manifest.files[name],value);
        const following=new Set(after.requests.map(row=>row.origin+':'+row.id+':'+row.sha256));
        for(const row of before.requests)assert(following.has(row.origin+':'+row.id+':'+row.sha256));
        await save(join(root,'evidence','complete-reexport-inventory.json'),after,true);
        return {...actual,operationId:request.id,snapshot:final.snapshot,historySha256:after.historySha256};
      });
      await stage('cold-received-workspace-and-exact-receive-replay',async()=>{
        if(browser){await browser.close();browser=null;}
        const closed=await stopConsole('receiver');
        const cold=await cli('receiver','cold-received-portfolio',['portfolio','--id',final.id,'--revision',String(final.revision)]);
        equal(cold.returned,final);
        const reopened=await startConsole('receiver'),before=await reopened.state();
        const replay=await reopened.action(await readJson(join(root,'actions','receive-complete-recipient.input.json')));
        assert(replay.state==='COMPLETED'&&replay.result.snapshot===final.snapshot);
        assert((await reopened.state()).revision===before.revision);equal(await reopened.portfolio(final.id,{revision:final.revision}),final);
        return {closed,native:cold.native,workspaceId:before.workspaceId,unchangedWorkspaceRevision:before.revision,requestId:replay.id,snapshot:final.snapshot};
      });
      const images=[...desks.flatMap(row=>row.images),...preparedPlans.flatMap(row=>row.images),
        ...recipients.flatMap(row=>row.images),...sourceViews.images,...receiverViews.images];
      const selectedFiles=[...packaging.artifacts,packaging.receipt,...desks.flatMap(row=>[row.workspaceFile,...row.allDownloads]),...preparedPlans.flatMap(row=>[row.file,row.source]),
        ...recipients.map(row=>row.document),...sourceReadback.documentEditions,...received.observations.documentEditions,
        ...sourceViews.downloads,...receiverViews.downloads];
      const applicationFiles=[...new Map(selectedFiles.map(row=>[row.path,row])).values()];
      for(const row of applicationFiles){const actual=await fileInfo(row.path,{synchronize:true});equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:row.bytes,sha256:row.sha256});}
      completedResult={schema:'stellar-forge.engrant-complete-receiving.v1',operation:PROGRAMME_RECEIVING_OPERATION,state:'COMPLETE',
        runId:journal.runId,startedAt:journal.startedAt,completedAt:now(),binding,
        scope:'Original free and five-organisation source editions; internal user-authored research preparation and recipient projects only.',
        originalHistoricalFundingRecords:41,originalResearchSources:packages.map(pkg=>({source_id:pkg.source_id,source_sha256:pkg.source_sha256,records:pkg.records})),
        desks:desks.map(row=>({key:row.key,workspaceFile:row.workspaceFile,selectedPlan:row.plan,recordCount:row.records})),
        recipientPlans:preparedPlans.map(row=>({file:row.file,source:row.source,binding:row.plan.binding})),
        portfolioId:final.id,revision:final.revision,snapshot:final.snapshot,
        originalWorkspaceId:journal.refs.workspaces.source,receivingWorkspaceId:journal.refs.workspaces.receiver,
        originalRequestIds:recipients.map(row=>row.requestId),packaging:{receipt:packaging.receipt,packages:packaging.result.packages,
          originalSampleArchive:packaging.result.original_sample_archive,independentReceiveExact:true,sameRequestReplayed:true},
        customerArchives:[...packaging.archives,customer],receivedArchives:[reexport],
        images,applicationFiles,originalFundingRowsUnchanged:true,financialRowsAndTotalsUnchanged:true,
        externalGrantSubmissions:0,awardsCreated:0,paymentsCreated:0,nativePhases:journal.phases};
    }
  }catch(error){failure=error;}
  finally{
    for(;;){resourceResult=await cleanup();if(resourceResult.closed)break;
      announce({state:'AWAITING_OWNED_RESOURCE_CLOSE',resources:resourceResult});await sleep(2000);}
    if(resourceResult.errors.length&&!failure)failure=Object.assign(new Error(
      'Owned native resource closure returned an error: '+JSON.stringify(resourceResult.errors)),{code:'ENGRANT_RECEIVING_CLOSE_FAILED'});
    if(!alreadyComplete){
      if(failure){
        const outcome={schema:'stellar-forge.engrant-receiving-failure.v1',operation:PROGRAMME_RECEIVING_OPERATION,
          runId:journal.runId,at:now(),phase:journal.activePhase??null,error:{code:failure.code??null,message:safeMessage(failure)},
          resources:resourceResult,completedPhases:Object.keys(journal.phases),originalWorkspaceIds:journal.refs.workspaces??{}};
        await retainCompleted('original receiving failure',async()=>{
          await save(join(root,'evidence','failure-'+sha(encoded(outcome))+'.json'),outcome,true);
          journal.state='FAILED';journal.error=outcome.error;journal.resources=resourceResult;await checkpoint();
        });
      }else{
        completedResult.resources=resourceResult;
        await retainCompleted('complete original Engrant receiving',async()=>{
          await save(join(root,'complete.json'),completedResult,true);journal.state='COMPLETE';journal.completedAt=completedResult.completedAt;
          journal.resources=resourceResult;delete journal.activePhase;delete journal.error;await checkpoint();
        });
      }
    }
    process.off('SIGTERM',onTerm);process.off('SIGINT',onInt);
  }
  if(failure){announce({state:'FAILED',phase:journal.activePhase??null,error:{code:failure.code??null,message:safeMessage(failure)},
    originalReceiving:journalPath,resources:resourceResult});throw Object.assign(new Error(safeMessage(failure)),{code:failure.code??null});}
  announce({state:'COMPLETE',result:join(root,'complete.json'),portfolioId:completedResult.portfolioId,revision:completedResult.revision,
    customerArchives:completedResult.customerArchives,receivedArchives:completedResult.receivedArchives,images:completedResult.images.length,
    resources:completedResult.resources});
  return completedResult;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  await runEngrantReceiving().catch(error=>{
    process.stderr.write(JSON.stringify({operation:PROGRAMME_RECEIVING_OPERATION,state:'FAILED',code:error.code??null,
      message:String(error.message).replace(/https?:\/\/127\.0\.0\.1:\d+\/#?[A-Za-z0-9_-]{32,}/g,'[private console]').slice(0,2000)})+'\n');
    process.exitCode=1;
  });
