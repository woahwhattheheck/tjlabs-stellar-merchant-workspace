// MIT. One complete award-administration journey using explicitly internal acceptance data.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open, mkdir, lstat, realpath, link, unlink, rename} from 'node:fs/promises';
import {resolve, join, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export const AWARDS_RECEIVING_OPERATION = 'SCF-GRANT-AWARDS-RECEIVING-7DE2-20261013';
const PROGRAMME_SCHEMA = 'stellar-forge.grant-programme.v1';
const INPUT_SCHEMA = 'stellar-forge.awards-receiving-input.v1';
const AWARDS_SCHEMA = 'stellar-forge.grant-awards.v1';
const AWARD_COLLECTIONS = ['rounds','applications','checks','assignments','assessments','decisions','agreements','claims','monitoring'];
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
    '--chromium','--playwright-module']);
  assert(argv.length%2===0,'Every receiving option has one explicit value.');
  const result = new Map();
  for(let i=0;i<argv.length;i+=2) {
    assert(allowed.has(argv[i])&&!result.has(argv[i]),'Use one original value for each receiving option.');
    result.set(argv[i],argv[i+1]);
  }
  for(const name of ['--sdk','--input','--out','--python','--source-commit']) assert(result.has(name),'Missing '+name);
  assert(COMMIT.test(result.get('--source-commit')),'Select the actual composed source commit.');
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

export async function runAwardsReceiving(argv=process.argv.slice(2)) {
  const options=parseArguments(argv),sdk=absolute(options.get('--sdk')),root=absolute(options.get('--out'));
  const python=absolute(options.get('--python')),sourceCommit=options.get('--source-commit');
  const foregroundSelectionSha256=process.env.SCF_AWARDS_FOREGROUND_SELECTION;
  assert(Number(process.env.SCF_AWARDS_FOREGROUND_PID)===process.ppid&&HASH.test(foregroundSelectionSha256??'')&&
    process.env.SCF_AWARDS_FOREGROUND_HELPER_SHA256==='8522835d848533ff66b8fad6900c5c0c781eaae4967a5b5ac2f9dac1ed458412',
    'Run this complete journey through its original ProcessFamily foreground.');
  await directory(root,{privateRoot:true});
  const privateRoot=await directory(join(root,'private'),{privateRoot:true});
  for(const name of ['actions','evidence','documents','exports','workspaces','source-inputs','console-closures'])
    await directory(join(root,name),{privateRoot:true});
  await directory(join(privateRoot,'children'),{privateRoot:true});
  await directory(join(privateRoot,'connections'),{privateRoot:true});
  const inputBytes=await readBytes(absolute(options.get('--input')),2*1024*1024);
  const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(inputBytes));
  exactKeys(input,['schema','actor','assessor','asOf','fixture','externalSources'],
    ['schema','actor','assessor','asOf','fixture','externalSources']);
  assert(input.schema===INPUT_SCHEMA&&input.fixture==='internal-grant-awards-v1');
  for(const person of [input.actor,input.assessor])assert(typeof person==='string'&&person.trim()&&person.length<=240);
  assert(input.actor!==input.assessor,'The internal conflict clearance uses a separately attributed actor.');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)&&new Date(input.asOf+'T00:00:00Z').toISOString().startsWith(input.asOf));
  assert(Array.isArray(input.externalSources)&&input.externalSources.length<=64);
  const sourceKeys=new Set();
  for(const row of input.externalSources) {
    exactKeys(row,['key','packet','expectedSourceId','payload','records'],['key','packet','expectedSourceId','payload','records']);
    assert(/^[a-z0-9][a-z0-9-]{0,63}$/.test(row.key)&&!sourceKeys.has(row.key));sourceKeys.add(row.key);
    exactKeys(row.packet,['path','bytes','sha256'],['path','bytes','sha256']);
    assert(HASH.test(row.expectedSourceId)&&HASH.test(row.packet.sha256)&&Number.isSafeInteger(row.packet.bytes)&&row.packet.bytes>0);
    absolute(row.packet.path);
    exactKeys(row.payload,['standard','label','coverage','selection'],['standard','label','coverage','selection']);
    assert(['iati','360giving'].includes(row.payload.standard)&&Array.isArray(row.records));
    for(const ref of row.records) {
      exactKeys(ref,['sourceId','entityKey','sha256'],['sourceId','entityKey','sha256']);
      assert(ref.sourceId===row.expectedSourceId&&HASH.test(ref.entityKey)&&HASH.test(ref.sha256));
    }
  }
  const sourceManifestPath=join(sdk,'grant-portfolio/source-files.json'),sourceManifestBytes=await readBytes(sourceManifestPath,1024*1024);
  const sourceManifest=JSON.parse(sourceManifestBytes);
  assert(sourceManifest.schema==='stellar-forge.grant-portfolio-source-files.v1'&&Array.isArray(sourceManifest.files));
  equal(sourceManifest.files,[...new Set(sourceManifest.files)].sort());
  const clientPath=absolute(options.get('--client-module')??join(sdk,'grant-portfolio/client.mjs'));
  
  for(const path of ['grant-portfolio/source-files.json','grant-portfolio/managed.py','grant-portfolio/workspace.py',
    'grant-portfolio/cli.py','grant-portfolio/cli.mjs','grant-portfolio/client.mjs','grant-portfolio/programme.py',
    'grant-portfolio/programme_service.py','grant-portfolio/programme-client.mjs',
    'grant-portfolio/awards.py','grant-portfolio/awards_service.py','grant-portfolio/awards-client.mjs',
    'grant-portfolio/web/awards.js','grant-portfolio/AWARDS.md','grant-portfolio/awards-exchange.mjs',
    'grant-portfolio/web/awards-exchange.js','grant-portfolio/awards-exchange-core.mjs',
    'grant-portfolio/check_programme_decimal.py','grant-portfolio/examples/awards/awards-receiving.mjs',
    'grant-portfolio/examples/awards/AWARDS_RECEIVING.md','grant-portfolio/examples/awards/receiving-input.example.json',
    'grant-portfolio/examples/awards/run-awards-receiving.py','grant-portfolio/examples/spc/process_family.py',
    relative(sdk,clientPath)])
    assert(sourceManifest.files.includes(path),'The complete joined source manifest must retain '+path);
  const sourceFiles=[];
  for(const path of sourceManifest.files) {
    assert(path&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'));
    const file=await fileInfo(join(sdk,path));sourceFiles.push({path,bytes:file.bytes,sha256:file.sha256});
  }
  assert((await readBytes(sourceManifestPath,1024*1024)).equals(sourceManifestBytes),'The selected source closure changed.');
  const selfPath=fileURLToPath(import.meta.url),self=await fileInfo(selfPath);
  assert(selfPath===join(sdk,'grant-portfolio/examples/awards/awards-receiving.mjs'),
    'Run this original programme from its complete selected source closure.');
  const browserSelection=options.has('--chromium')?{
    executable:await fileInfo(absolute(options.get('--chromium'))),
    playwright:await fileInfo(absolute(options.get('--playwright-module')))}:null;
  const binding={schema:'stellar-forge.awards-receiving-selection.v1',operation:AWARDS_RECEIVING_OPERATION,
    root,sdk,python,node:process.execPath,nodeVersion:process.version,sourceCommit,foregroundSelectionSha256,
    inputSha256:sha(inputBytes),fixture:input.fixture,sourceManifestSha256:sha(sourceManifestBytes),
    sourceFiles,programme:{path:selfPath,bytes:self.bytes,sha256:self.sha256},clientModule:clientPath,browser:browserSelection};
  const journalPath=join(root,'receiving.json');
  let journal=await readJson(journalPath,true);
  if(journal)equal(journal.binding,binding,'Continue the same full receiving selection.');
  else {
    journal={schema:'stellar-forge.awards-receiving.v1',operation:AWARDS_RECEIVING_OPERATION,
      runId:randomUUID(),startedAt:now(),binding,state:'PREPARED',phases:{},refs:{},resources:{closed:false}};
    await save(journalPath,journal);
  }
  await writeBytes(join(root,'source-inputs','receiving-input.json'),inputBytes,{immutable:true});
  await save(join(root,'executed-source.json'),binding,true);
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
    stopRequested??=Object.assign(new Error('Original receiving interrupted by '+signal),{code:'AWARDS_RECEIVING_STOPPED'});
    if(!controller.signal.aborted)controller.abort(stopRequested);
    for(const owned of children)if(!owned.closed)owned.child.kill('SIGTERM');
  };
  const onTerm=()=>requestStop('SIGTERM'),onInt=()=>requestStop('SIGINT');
  process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
  const checkStop=()=>{if(stopRequested)throw stopRequested;};
  const announce=value=>process.stdout.write(JSON.stringify({operation:AWARDS_RECEIVING_OPERATION,...value})+'\n');
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
    const identity={schema:'stellar-forge.awards-receiving-phase.v1',
      operation:AWARDS_RECEIVING_OPERATION,runId:journal.runId,phase:name,
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
    await save(join(directoryPath,'intent.json'),{operation:AWARDS_RECEIVING_OPERATION,label,attempt,
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
        {code:'AWARDS_NATIVE_CHILD_FAILED'});
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
      frozen={operationId:'awards-'+journal.runId+'-'+key,action,payload:await payload(),
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

  function newRecord(collection,key,fields) {
    return {collection,id:journal.refs.ids[key],expectedRevision:0,fields};
  }
  const awardOf=(portfolio,name,id)=>{
    const row=portfolio.definition.awards?.records[name]?.find(item=>item.id===id);
    assert(row,'Open the original award '+name+' record.');return row;
  };
  const awardFields=(schema,name,row)=>Object.fromEntries(Object.keys(schema.fields[name]).map(key=>[key,row[key]]));
  const newAward=(name,key,fields)=>({collection:name,id:journal.refs.ids[key],expectedRevision:0,fields});
  const money={value:'10000.00',currency:'GBP'};
  const claimMoney={value:'2500.00',currency:'GBP'};
  const criteria=[
    {id:'eligibility',title:'Internal fixture evidence supplied',kind:'eligibility',required:true,
      minimum:null,maximum:null,weight:null,guidance:'Acceptance fixture only; this is not a CIF eligibility policy.'},
    {id:'quality',title:'Internal fixture quality',kind:'score',required:true,
      minimum:'0',maximum:'5',weight:'6E-1',guidance:'Operator-configured internal arithmetic only.'},
    {id:'delivery',title:'Internal fixture delivery',kind:'score',required:true,
      minimum:'0',maximum:'5',weight:'4E-1',guidance:'Operator-configured internal arithmetic only.'},
  ];
  function fixtureDocument(kind) {
    const bodies={
      rules:'# Internal grant administration acceptance rules\n\nOne synthetic application; quality 4.00 × 6E-1 and delivery 3.00 × 4E-1 produce exact 3.600. A separate eligibility answer is not a score. These are internal software acceptance rules, not published CIF criteria.\n',
      application:'# Synthetic applicant evidence\n\nInternal Example Organisation is a fictional acceptance fixture. The proposed 10000.00 GBP request is not a real grant application or awarded funding. No personal data is supplied.\n',
      agreement1:'# Internal agreement specimen — edition 1\n\nSynthetic award decision 10000.00 GBP. Internal acceptance attribution is captured for software receiving only. This is not an executed customer contract or payment authority.\n',
      agreement2:'# Internal agreement specimen — edition 2\n\nThis later wording retains the same synthetic 10000.00 GBP amount, and adds the internal reporting contact. Edition 1 remains the evidence recorded by the original agreement. No real contract exists.\n',
      payment:'# Internal payment-evidence specimen\n\nSynthetic external statement: 2500.00 GBP. This fixture is a retained evidence document for an attributed reconciliation assertion. No payment was initiated, received or independently settled. It is not a financial-ledger row.\n',
    };
    assert(Object.hasOwn(bodies,kind));return Buffer.from(bodies[kind]+'\nAs of '+input.asOf+'\n');
  }
  function internalRecords(documents) {
    const id=journal.refs.ids,owner=input.actor;
    return [
      newRecord('nodes','portfolio',{kind:'portfolio',code:'INT-AWARDS',title:'Internal grant awards receiving',owner,
        description:'Synthetic acceptance records only; no real applicant, funding award or payment.'}),
      newRecord('nodes','programme',{kind:'programme',code:'INT-GRANT-PROGRAMME',title:'Internal grant-administration programme',
        parentId:id.portfolio,owner,description:'One complete application-to-reporting software journey.'}),
      newRecord('nodes','project',{kind:'project',code:'INT-APPLICANT-PROJECT',title:'Synthetic applicant project',
        parentId:id.programme,owner,description:'Internal software acceptance data.',dataManagementRequired:null,
        dataManagementBasis:'No production personal data; actual operator policies are independently configured.'}),
      newRecord('partners','partner',{code:'INT-APPLICANT',name:'Internal Example Organisation',roles:['internal-acceptance-fixture'],
        description:'Fictional organisation for native application receiving; not a real applicant or grantee.'}),
      newRecord('grants','grant',{code:'INT-AWARD-LINK',title:'Internal award linkage',projectId:id.project,
        recipientId:id.partner,owner,award:null,purpose:'Internal business-record linkage, not an actual awarded financial source.'}),
      ...['rules','application','agreement1','payment'].map(key=>newRecord('documents',key+'Doc',{
        nodeId:key==='rules'?id.programme:id.project,
        ...(key==='agreement1'||key==='payment'?{grantId:id.grant}:{}),
        title:key==='agreement1'?'Internal agreement specimen':key==='payment'?'Internal payment evidence specimen':
          key==='rules'?'Internal assessment rules':'Synthetic application evidence',
        category:key==='agreement1'?'agreement':'other',owner,status:'current',object:documents[key],
        documentDate:input.asOf,description:'Complete original internal acceptance bytes; no external transaction is asserted.'})),
      newRecord('indicators','indicator',{nodeId:id.project,grantId:id.grant,code:'INT-APPLICATIONS-RECORDED',
        title:'Internal applications recorded',owner,resultLevel:'output',unit:'internal records',aggregation:'latest',
        direction:'increase',baseline:[{date:input.asOf,value:'0'}],targets:[{date:input.asOf,value:'1',documentIds:[id.rulesDoc]}],
        documentIds:[id.rulesDoc],methodology:'Counts this one synthetic internal application only.'}),
      newRecord('observations','observation',{indicatorId:id.indicator,periodStart:input.asOf,periodEnd:input.asOf,
        reportedDate:input.asOf,value:'1',dimensions:{scope:'internal-awards-receiving'},status:'reported',collector:owner,
        documentIds:[id.applicationDoc],notes:'One synthetic application is entered in this internal workflow.'}),
      newRecord('milestones','milestone',{nodeId:id.project,grantId:id.grant,code:'INT-RECEIVING',
        title:'Internal receiving prepared',owner,dueDate:input.asOf,status:'planned',progress:'0',
        documentIds:[id.rulesDoc],description:'Software receiving target; no delivered grant outcome is asserted.'}),
    ];
  }
  async function changeAwards(client,key,actor,make) {
    return originalAction(client,key,'portfolio.save',async()=>{
      const previous=await currentPortfolio(client),definition=previous.definition;
      return {id:previous.id,expectedPortfolioRevision:previous.revision,
        name:definition.name,notes:definition.notes,sources:definition.sources,review:definition.review,
        awards:{schema:AWARDS_SCHEMA,expectedAwardsRevision:definition.awards?.revision??0,actor,...await make(previous)}};
    });
  }

  async function retainSourceInputs(client) {
    const received=[];
    for(const row of input.externalSources) {
      checkStop();
      const selected=await fileInfo(row.packet.path);
      equal({bytes:selected.bytes,sha256:selected.sha256},{bytes:row.packet.bytes,sha256:row.packet.sha256});
      const uploaded=await client.uploadFile(row.packet.path,{sha256:row.packet.sha256,signal:controller.signal});
      const actual=await originalAction(client,'external-'+row.key,'source.receive',async()=>({
        ...row.payload,object:uploaded.sha256}));
      assert(actual.result.id===row.expectedSourceId,'The received native source has another identity.');
      const source=await client.source(row.expectedSourceId,{signal:controller.signal});
      equal(source.object.sha256,row.packet.sha256);
      for(const field of ['standard','label','coverage','selection'])equal(source[field],row.payload[field]);
      received.push({key:row.key,id:source.id,standard:source.standard,counts:source.counts,
        object:source.object,operationId:actual.id,authority:row.payload.coverage});
    }
    return {state:received.length?'OWNER_SUPPLIED_SOURCES_RECEIVED':'EXTERNAL_SOURCES_NOT_SUPPLIED',
      sources:received,meaning:'Only original owner-supplied financial/source editions; fixture awards do not assert any payment'};
  }
  async function verifyExternalBindings(client,portfolio) {
    const evidence=[];
    for(const row of input.externalSources)for(const ref of row.records) {
      const found=await client.detail({portfolioId:portfolio.id,revision:portfolio.revision,
        sourceId:ref.sourceId,entityKey:ref.entityKey},{signal:controller.signal});
      assert(found.entity.sha256===ref.sha256,'The selected original external record changed.');
      evidence.push({key:row.key,...ref,originalId:found.entity.originalId,financialRows:found.financial.length});
    }
    return evidence;
  }
  async function rejectedAction(client,key,make) {
    const path=join(root,'actions',key+'.input.json'),resultPath=join(root,'actions',key+'.rejected.json');
    let original=await readJson(path,true);
    if(!original) {
      const previous=await currentPortfolio(client),definition=previous.definition;
      original={operationId:'awards-'+journal.runId+'-'+key,action:'portfolio.save',
        expectedRevision:(await client.state()).revision,payload:{id:previous.id,
          expectedPortfolioRevision:previous.revision,name:definition.name,notes:definition.notes,
          sources:definition.sources,review:definition.review,
          awards:{schema:AWARDS_SCHEMA,expectedAwardsRevision:definition.awards.revision,actor:input.actor,...await make(previous)}}};
      await retainCompleted('original rejected-action input',()=>save(path,original,true));
    }
    const before=await client.portfolio(original.payload.id,{revision:original.payload.expectedPortfolioRevision});
    let request;
    try { request=await client.request(original.operationId); }
    catch(error) { if(error.status!==404)throw error;checkStop();request=await client.action(original,{signal:controller.signal}); }
    while(request.state==='RUNNING'){checkStop();await sleep(200);request=await client.request(original.operationId);}
    equal(request.input,original);
    await retainCompleted('actual rejected-action return',()=>save(resultPath,request,true));
    assert(request.state==='FAILED'&&request.error?.retryable!==true,'The original invalid edit must fail without a new business revision.');
    equal(await currentPortfolio(client),before);
    return {requestId:request.id,error:request.error,unchangedSnapshot:before.snapshot,inputSha256:request.inputSha256};
  }
  function validateMonitoringInput(original,intent) {
    exactKeys(original,['operationId','action','payload','expectedRevision'],['operationId','action','payload']);
    assert(original.action==='portfolio.save'&&typeof original.operationId==='string');
    const payload=original.payload;
    exactKeys(payload,['id','expectedPortfolioRevision','name','notes','sources','review','awards'],
      ['id','expectedPortfolioRevision','name','notes','sources','review','awards']);
    equal(Object.fromEntries(['name','notes','sources','review'].map(key=>[key,payload[key]])),intent.definition);
    assert(payload.id===intent.portfolioId&&payload.expectedPortfolioRevision===intent.portfolioRevision);
    const batch=payload.awards;
    exactKeys(batch,['schema','expectedAwardsRevision','actor','changes'],['schema','expectedAwardsRevision','actor','changes']);
    assert(batch.schema===AWARDS_SCHEMA&&batch.expectedAwardsRevision===intent.awardsRevision&&batch.actor===input.actor);
    assert(batch.changes.length===1);
    equal(batch.changes[0],{collection:'monitoring',id:intent.recordId,expectedRevision:intent.recordRevision,
      fields:{...intent.fields,status:'recorded',narrative:'Internal browser-recorded monitoring; one synthetic application, no real payment or CIF result.'}});
  }
  async function recordMonitoringThroughBrowser(client,portfolio,schema) {
    const record=awardOf(portfolio,'monitoring',journal.refs.ids.monitoring);
    const intent={portfolioId:portfolio.id,portfolioRevision:portfolio.revision,awardsRevision:portfolio.definition.awards.revision,
      recordId:record.id,recordRevision:record.revision,fields:awardFields(schema,'monitoring',record),
      definition:Object.fromEntries(['name','notes','sources','review'].map(key=>[key,portfolio.definition[key]]))};
    await retainCompleted('original monitoring selection',()=>save(join(root,'actions','ui-monitoring.selection.json'),intent,true));
    const inputPath=join(root,'actions','ui-monitoring.input.json');
    let original=await readJson(inputPath,true),view=null,routeFailure=null;
    try {
      if(!original) {
        view=await browserPage('source',portfolio);
        await view.page.route('**/api/action',async route=>{
          try {
            const submitted=route.request().postDataJSON();validateMonitoringInput(submitted,intent);
            await retainCompleted('original UI monitoring input',()=>save(inputPath,submitted,true));
            original=submitted;
            if(stopRequested)await route.abort();else await route.continue();
          } catch(error){routeFailure=error;await route.abort();}
        });
        await selectRegister(view.page,'monitoring',record.title);
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        await view.page.getByRole('button',{name:'Edit draft',exact:true}).click();
        await view.page.getByLabel('Editor',{exact:true}).fill(input.actor);
        await view.page.getByLabel('Narrative',{exact:true}).fill('Internal browser-recorded monitoring; one synthetic application, no real payment or CIF result.');
        await view.page.getByLabel('Status',{exact:true}).selectOption('recorded');
        await view.page.getByRole('button',{name:'Save record',exact:true}).click();
        while(!original){if(routeFailure)throw routeFailure;checkStop();await sleep(100);}
      }
      validateMonitoringInput(original,intent);
      const completed=await completeOriginal(client,'ui-monitoring',original),after=awardOf(completed.result,'monitoring',record.id);
      assert(after.status==='recorded'&&after.publication&&after.revision===record.revision+1);
      if(view){await view.page.waitForFunction(revision=>document.querySelector('#revision-select')?.value===String(revision),completed.result.revision);equal(view.errors,[]);}
      return {requestId:completed.id,portfolio:completed.result,originalInputSha256:completed.inputSha256,uiGenerated:true};
    } finally {if(view)await view.context.close();}
  }

  async function browserPage(role,portfolio) {
    assert(browserSelection,'Full programme receiving requires the selected original browser.');
    if(!browser) {
      const runtime=await import(pathToFileURL(browserSelection.playwright.path).href);
      const chromium=runtime.chromium??runtime.default?.chromium;assert(chromium);
      const tmp=await directory(join(privateRoot,'browser-tmp'),{privateRoot:true});
      browser=await chromium.launch({executablePath:browserSelection.executable.path,headless:true,
        args:['--no-sandbox','--disable-dev-shm-usage'],env:{...environment,TMPDIR:tmp}});
    }
    const context=await browser.newContext({viewport:{width:1360,height:940},acceptDownloads:true});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(safeMessage(error)));
    try {
      await page.goto(consoles.get(role).ready.console);
      await page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Workspace revision'));
      await page.selectOption('#portfolio-select',portfolio.id);
      await page.waitForFunction(revision=>document.querySelector('#revision-select')?.value===String(revision),portfolio.revision);
      await page.locator('nav button[data-view="awards"]').click();
      await page.getByRole('heading',{name:'Grant applications and awards',exact:true}).waitFor();
      return {context,page,errors};
    } catch(error){await context.close();throw error;}
  }
  async function selectRegister(page,name,search='') {
    await page.locator('#content').getByLabel('Workspace',{exact:true}).selectOption(name);
    if(name==='queue')return;
    await page.getByLabel('Saved records',{exact:true}).selectOption('true');
    await page.getByLabel('Search this register',{exact:true}).fill(search);
    await page.getByRole('button',{name:'Apply',exact:true}).click();
  }
  async function browserQueue(portfolio,label,{unresolved=false}={}) {
    const view=await browserPage('source',portfolio),screenshots=[];
    try {
      await selectRegister(view.page,'queue');
      await view.page.getByRole('heading',{name:'Work queue',exact:true}).waitFor();
      const text=await view.page.locator('#content').innerText();
      if(unresolved){assert(/query/i.test(text),'Keep the recorded query in the work queue.');assert(/defer/i.test(text),'Keep the deferred decision in the work queue.');}
      for(const viewport of [{width:1360,height:940},{width:390,height:844}]) {
        await view.page.setViewportSize(viewport);
        const size=await view.page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        assert(size.scrollWidth<=size.width,'The award queue exceeds the selected viewport.');
        const path=join(root,'evidence',label+'-'+randomUUID()+'-'+viewport.width+'.png');
        await view.page.screenshot({path,fullPage:true});const info=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        screenshots.push({viewport,size,...info});
      }
      equal(view.errors,[]);
      return {portfolioId:portfolio.id,revision:portfolio.revision,text,unresolved,screenshots,pageErrors:view.errors,browserVersion:browser.version()};
    } finally {await view.context.close();}
  }
  async function retainBrowserDownload(view,trigger,target,{filename=null,expected=null}={}) {
    checkStop();
    const pending=view.page.waitForEvent('download');
    // A click failure must not leave a later rejected download promise unobserved.
    pending.catch(()=>{});
    await trigger();
    const download=await pending,originalFilename=download.suggestedFilename();
    if(filename!==null)equal(originalFilename,filename,'The browser selected a different original download.');
    const staged=target+'.download-'+randomUUID();
    let actual;
    try {
      await download.saveAs(staged);
      const failure=await download.failure();
      assert(failure===null,'The original browser download failed: '+String(failure));
      actual=await fileInfo(staged,{synchronize:true});
      if(expected)equal({bytes:actual.bytes,sha256:actual.sha256},expected,
        'The complete browser download differs from the original selected bytes.');
      await retainCompleted('complete original browser download',async()=>{
        try{await link(staged,target);}catch(error){if(error.code!=='EEXIST')throw error;}
        const retained=await fileInfo(target,{synchronize:true});
        equal({bytes:retained.bytes,sha256:retained.sha256},{bytes:actual.bytes,sha256:actual.sha256},
          'Preserve the original complete browser download.');
        await syncDirectory(dirname(target));
      });
      actual=await fileInfo(target,{synchronize:true});
      return {...actual,filename:originalFilename};
    } finally {
      try{await unlink(staged);await syncDirectory(dirname(staged));}catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  async function browserIntakeViews(view,label) {
    const screenshots=[];
    for(const viewport of [{width:1360,height:940},{width:390,height:844}]) {
      await view.page.setViewportSize(viewport);
      const size=await view.page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert(size.scrollWidth<=size.width,'The reviewed original CSV intake exceeds this viewport.');
      const path=join(root,'evidence',label+'-'+randomUUID()+'-'+viewport.width+'.png');
      await view.page.screenshot({path,fullPage:true});
      const actual=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
      screenshots.push({viewport,size,...actual});
    }
    equal(view.errors,[]);
    return screenshots;
  }
  function validateBrowserCsvPlan(module,plan,portfolio,csv,status) {
    assert(plan?.schema==='stellar-forge.awards-csv-import-plan.v1'&&plan.rows===1,
      'Retain the complete original one-application browser plan.');
    equal(plan.portfolio,{id:portfolio.id,revision:portfolio.revision,snapshot:portfolio.snapshot});
    equal(plan.source,{sha256:sha(csv),bytes:csv.length,filename:'Internal_Applications_Original.csv',contentType:'text/csv'});
    assert(UUID.test(plan.documentId)&&typeof plan.action?.operationId==='string'&&
      plan.action.operationId.startsWith('award-csv-')&&UUID.test(plan.action.operationId.slice(10)),'Keep the actual browser-allocated import identities.');
    const changes=plan.action.payload?.awards?.changes;
    assert(changes?.length===1&&changes[0].collection==='applications'&&UUID.test(changes[0].id));
    const id=journal.refs.ids,change=changes[0],prior=portfolio.definition.awards.records.applications.find(row=>row.id===change.id);
    equal(plan.mapping,{profile:{},answers:{eligibility:'Eligibility',quality:'Quality',delivery:'Delivery'},
      reference:'Ref',title:'Title',legalName:'Name',partnerKey:'Partner',projectKey:'Project',
      amount:'Amount',currency:'Currency',submittedDate:'Date',notes:'Notes'});
    assert(change.fields.partnerId===id.partner&&change.fields.projectId===id.project&&change.fields.roundId===id.round);
    assert(change.fields.status===status&&change.fields.reference==='INT-APP-1');
    if(status==='draft')assert(!prior&&change.expectedRevision===0);
    else {
      assert(prior?.id===id.application&&prior.status==='draft'&&!prior.archived);
      assert(change.expectedRevision===prior.revision);
    }
    const rebuilt=module.prepareAwardCsvImport(portfolio,{operationId:plan.action.operationId,csv,
      filename:plan.source.filename,documentId:plan.documentId,roundId:id.round,actor:input.actor,mapping:plan.mapping,
      identities:{applications:{'INT-APP-1':change.id},partners:{INTERNAL:id.partner},projects:{PROJECT:id.project}},status});
    equal(plan,rebuilt,'The browser plan must preserve the complete original native exchange contract.');
    assert(plan.actionSha256===sha(Buffer.from(JSON.stringify(plan.action),'utf8')));
    return change.id;
  }
  async function adoptBrowserCsvIdentities(plan,applicationId,status) {
    const documentKey=status==='draft'?'csvDraftDoc':'csvDoc';
    const captured={application:applicationId,[documentKey]:plan.documentId};
    for(const [key,value] of Object.entries(captured)) {
      if(journal.refs.ids[key]!==undefined)equal(journal.refs.ids[key],value,'Keep the original reviewed browser identity.');
      else assert(!Object.values(journal.refs.ids).includes(value),'Distinct original records cannot reuse an allocated identity.');
    }
    assert(applicationId!==plan.documentId);
    await retainCompleted('reviewed browser CSV identities',async()=>{
      Object.assign(journal.refs.ids,captured);await checkpoint();
    });
  }
  async function prepareCsvInBrowser(portfolio,csvPath,status,planPath) {
    const view=await browserPage('source',portfolio);
    const dialog=view.page.locator('#detail-dialog');
    try {
      await view.page.getByRole('button',{name:'Import application CSV',exact:true}).click();
      await dialog.getByRole('heading',{name:'Application CSV intake',exact:true}).waitFor();
      await dialog.getByLabel('Original application CSV',{exact:true}).setInputFiles(csvPath);
      await dialog.getByLabel('Retained filename',{exact:true}).fill('Internal_Applications_Original.csv');
      await dialog.getByLabel('Funding round',{exact:true}).selectOption(journal.refs.ids.round);
      await dialog.getByLabel('Recording actor',{exact:true}).fill(input.actor);
      await dialog.getByLabel('Imported status',{exact:true}).selectOption(status);
      await dialog.getByRole('button',{name:'Map CSV columns',exact:true}).click();
      await dialog.getByRole('heading',{name:'2. Map the application fields',exact:true}).waitFor();
      const columns=[
        ['Application reference *','Ref'],['Application title *','Title'],['Applicant legal name *','Name'],
        ['Partner matching key *','Partner'],['Project matching key','Project'],['Requested amount','Amount'],
        ['Requested currency','Currency'],['Actual submission date'+(status==='submitted'?' *':''),'Date'],
        ['Application notes','Notes'],
        ...criteria.map(c=>[c.title+' · '+c.id+(status==='submitted'&&c.required?' *':''),
          {eligibility:'Eligibility',quality:'Quality',delivery:'Delivery'}[c.id]]),
      ];
      for(const [name,column] of columns)await dialog.getByLabel(name,{exact:true}).selectOption(column);
      await dialog.getByRole('button',{name:'Match existing records',exact:true}).click();
      await dialog.getByRole('heading',{name:'3. Match existing programme records',exact:true}).waitFor();
      await dialog.getByLabel('Partner for INTERNAL',{exact:true}).selectOption(journal.refs.ids.partner);
      await dialog.getByLabel('Project for PROJECT',{exact:true}).selectOption(journal.refs.ids.project);
      const application=dialog.getByLabel('Application INT-APP-1',{exact:true});
      if(status==='draft')equal(await application.inputValue(),'new');
      else {
        equal(await application.inputValue(),journal.refs.ids.application,
          'The original draft is selected automatically by its round and CSV reference.');
        await application.selectOption(journal.refs.ids.application);
      }
      await dialog.getByRole('button',{name:'Review complete import',exact:true}).click();
      await dialog.getByRole('heading',{name:'4. Review and save the original import',exact:true}).waitFor();
      // This is the actual downloaded JSON, including its original key order.
      // Do not replace it with the canonical journal encoding.
      const retained=await retainBrowserDownload(view,()=>dialog.getByRole('button',{
        name:'Download original import plan',exact:true}).click(),planPath);
      const plan=await readJson(planPath);
      equal(retained.filename,'Award_Import_'+plan.action.operationId+'.json');
      equal(view.errors,[]);
      return retained;
    } finally {await view.context.close();}
  }
  async function resumeCsvInBrowser(client,portfolio,plan,csvPath,planPath,key,{replay=false}={}) {
    const inputPath=join(root,'actions',key+'.input.json');
    let original=await readJson(inputPath,true),routeFailure=null,posts=0;
    if(original)equal(original,plan.action);
    const view=await browserPage('source',portfolio);
    const dialog=view.page.locator('#detail-dialog');
    try {
      await view.page.getByRole('button',{name:'Import application CSV',exact:true}).click();
      await dialog.getByRole('heading',{name:'Application CSV intake',exact:true}).waitFor();
      await dialog.getByLabel('Original application CSV',{exact:true}).setInputFiles(csvPath);
      await dialog.getByLabel('Saved import plan',{exact:true}).setInputFiles(planPath);
      await dialog.getByRole('button',{name:'Review original saved import',exact:true}).click();
      await dialog.getByRole('heading',{name:'4. Review and save the original import',exact:true}).waitFor();
      const planFile=await fileInfo(planPath,{synchronize:true});
      const resumedPath=join(root,'exports',key+(replay?'-completed-replay':'-resumed')+'.plan.json');
      const resumed=await retainBrowserDownload(view,()=>dialog.getByRole('button',{
        name:'Download original import plan',exact:true}).click(),resumedPath,{
        filename:'Award_Import_'+plan.action.operationId+'.json',
        expected:{bytes:planFile.bytes,sha256:planFile.sha256}});
      equal(await readJson(resumedPath),plan);
      const screenshots=await browserIntakeViews(view,key+(replay?'-completed-replay':'-resumed-review'));
      const before=await client.state();
      await view.page.route('**/api/action',async route=>{
        try {
          const submitted=route.request().postDataJSON();equal(submitted,plan.action,
            'Resume must submit the complete original reviewed operation.');
          await retainCompleted('original browser CSV action',()=>save(inputPath,submitted,true));
          original=submitted;posts++;
          if(stopRequested)await route.abort();else await route.continue();
        } catch(error){routeFailure=error;await route.abort();}
      });
      await dialog.getByRole('button',{name:'Continue original import',exact:true}).click();
      while(!posts){
        if(routeFailure)throw routeFailure;checkStop();equal(view.errors,[]);
        const message=await dialog.getByRole('alert').textContent();
        assert(!message?.trim(),'The original browser import stopped before dispatch: '+message);
        await sleep(100);
      }
      if(routeFailure)throw routeFailure;
      equal(original,plan.action);
      const completed=await completeOriginal(client,key,original);
      await view.page.waitForFunction(revision=>document.querySelector('#revision-select')?.value===String(revision),
        completed.result.revision);
      equal(view.errors,[]);assert(posts===1,'The browser sends one original action on this explicit continuation.');
      const after=await client.state();
      if(replay) {
        equal(after.revision,before.revision,'Reopening a completed browser import must not create a workspace revision.');
        equal(await currentPortfolio(client),portfolio,'Reopening a completed browser import must not create a portfolio revision.');
      }
      return {requestId:completed.id,portfolio:completed.result,inputSha256:completed.inputSha256,
        uiGenerated:true,completedReplay:replay,browserPosts:posts,workspaceBefore:before.revision,workspaceAfter:after.revision,
        planDownload:resumed,screenshots,pageErrors:view.errors,browserVersion:browser.version()};
    } finally {await view.context.close();}
  }
  async function browserApplicationIntake(client,portfolio,status) {
    const module=await import(pathToFileURL(join(sdk,'grant-portfolio/awards-exchange.mjs')).href);
    const key=status==='draft'?'import-browser-draft':'import-original-applications';
    const csv=Buffer.from('Ref,Title,Name,Partner,Project,Amount,Currency,Eligibility,Quality,Delivery,Date,Notes\r\n'+
      'INT-APP-1,"Synthetic ""original"" application, version 1",Internal Example Organisation,INTERNAL,PROJECT,10000.00,GBP,'+
      '"Internal evidence supplied","Quality narrative","Delivery narrative",'+input.asOf+',"Internal acceptance only.\nNo real application or funding request."\r\n');
    const csvPath=join(root,'documents','Internal_Applications_Original.csv');
    await writeBytes(csvPath,csv,{immutable:true});
    const planPath=join(root,'exports',key+'.plan.json');
    if(!await exists(planPath))await prepareCsvInBrowser(portfolio,csvPath,status,planPath);
    const plan=await readJson(planPath),applicationId=validateBrowserCsvPlan(module,plan,portfolio,csv,status);
    await adoptBrowserCsvIdentities(plan,applicationId,status);
    const intent={schema:'stellar-forge.awards-browser-intake-selection.v1',status,
      portfolio:plan.portfolio,applicationId,documentId:plan.documentId,operationId:plan.action.operationId,
      actionSha256:plan.actionSha256,source:plan.source,plan:await fileInfo(planPath,{synchronize:true})};
    await retainCompleted('complete browser intake selection',()=>save(join(root,'actions',key+'.selection.json'),intent,true));
    const resumedPath=join(root,'evidence',key+'.browser-resume.json');
    let resumed=await readJson(resumedPath,true);
    if(!resumed) {
      // The new context must load the current portfolio to open the resume
      // dialog; the original plan itself resolves its historical basis.
      resumed=await resumeCsvInBrowser(client,await currentPortfolio(client),plan,csvPath,planPath,key);
      await retainCompleted('actual original browser import return',()=>save(resumedPath,resumed,true));
    }
    assert(resumed.requestId===plan.action.operationId);
    equal(resumed.portfolio.id,portfolio.id);
    const original=await readJson(join(root,'actions',key+'.input.json'));
    equal(original,plan.action);
    const returned=await completeOriginal(client,key,original);
    equal(returned.result,resumed.portfolio);
    const application=awardOf(returned.result,'applications',applicationId);
    assert(application.status===status&&application.reference==='INT-APP-1');
    assert(application.revision===(status==='draft'?1:awardOf(portfolio,'applications',applicationId).revision+1));
    equal(application.requestedAmount,money);
    assert(application.title==='Synthetic "original" application, version 1');
    assert(application.notes==='Internal acceptance only.\nNo real application or funding request.');
    assert(recordOf(returned.result,'documents',plan.documentId).object.sha256===sha(csv));
    const replayPath=join(root,'evidence',key+'.browser-completed-replay.json');
    let replayed=await readJson(replayPath,true);
    if(!replayed) {
      replayed=await resumeCsvInBrowser(client,returned.result,plan,csvPath,planPath,key,{replay:true});
      await retainCompleted('actual completed browser import replay',()=>save(replayPath,replayed,true));
    }
    assert(replayed.completedReplay===true&&replayed.requestId===returned.id);
    equal(replayed.portfolio,returned.result);
    return {operationId:returned.id,plan,planFile:intent.plan,csv:await fileInfo(csvPath,{synchronize:true}),
      portfolio:returned.result,status,applicationId,documentId:plan.documentId,
      browserResume:resumed,browserReplay:replayed,
      files:[intent.plan,resumed.planDownload,replayed.planDownload],
      screenshots:[...resumed.screenshots,...replayed.screenshots]};
  }
  async function browserApplicationExports(portfolio) {
    const module=await import(pathToFileURL(join(sdk,'grant-portfolio/awards-exchange.mjs')).href);
    const view=await browserPage('source',portfolio),files=[];
    const dialog=view.page.locator('#detail-dialog');
    try {
      await view.page.getByRole('button',{name:'Export applications',exact:true}).click();
      await dialog.getByRole('heading',{name:'Application exchange',exact:true}).waitFor();
      await dialog.getByLabel('Export funding round',{exact:true}).selectOption(journal.refs.ids.round);
      await dialog.getByLabel('Spreadsheet handling',{exact:true}).selectOption('true');
      for(const format of ['json','csv']) {
        const expected=module.exportAwardApplications(portfolio,{roundId:journal.refs.ids.round,format,spreadsheetSafe:true});
        assert(expected.schema==='stellar-forge.awards-exchange-file.v1'&&expected.rows===1);
        assert(expected.bytes instanceof Uint8Array&&sha(expected.bytes)===expected.sha256);
        const path=join(root,'exports','Internal_Applications.'+format);
        const actual=await retainBrowserDownload(view,()=>dialog.getByRole('button',{
          name:format==='json'?'Download application JSON':'Download application CSV',exact:true}).click(),path,{
          filename:'Award_Applications_'+portfolio.id+'_r'+portfolio.revision+'.'+format,
          expected:{bytes:expected.bytes.length,sha256:expected.sha256}});
        const body=await readBytes(path),original=awardOf(portfolio,'applications',journal.refs.ids.application);
        if(format==='json') {
          const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
          assert(decoded.schema==='stellar-forge.awards-application-exchange.v1'&&decoded.snapshot===portfolio.snapshot);
          equal(decoded.applications,[original]);
          equal(decoded.rounds,[awardOf(portfolio,'rounds',journal.refs.ids.round)]);
        } else {
          const decoded=module.parseAwardCsvText(new TextDecoder('utf-8',{fatal:true}).decode(body));
          assert(decoded.rows.length===1);const row=decoded.rows[0];
          equal({recordId:row.recordId,recordSha256:row.recordSha256,reference:row.reference,title:row.title,
            requestedAmount:row.requestedAmount,currency:row.currency,notes:row.notes},
            {recordId:original.id,recordSha256:original.sha256,reference:original.reference,title:original.title,
              requestedAmount:original.requestedAmount.value,currency:original.requestedAmount.currency,notes:original.notes});
          equal(JSON.parse(row.evidenceIds),original.evidenceIds);
          for(const answer of original.answers)assert(row['answer:'+answer.criterionId]===answer.response);
        }
        const receipt={...actual,format,rows:expected.rows,uiDownload:true,selection:{
          portfolioId:expected.portfolioId,revision:expected.revision,snapshot:expected.snapshot,awardsRevision:expected.awardsRevision}};
        await retainCompleted('complete browser application '+format+' export',()=>save(path+'.receipt.json',receipt,true));
        files.push(receipt);
      }
      equal(view.errors,[]);
      return {files,pageErrors:view.errors,browserVersion:browser.version()};
    } finally {await view.context.close();}
  }

  async function browserReadback(role,portfolio,label) {
    const view=await browserPage(role,portfolio),screenshots=[],downloads=[];
    try {
      for(const name of AWARD_COLLECTIONS) {
        await selectRegister(view.page,name);
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        await view.page.getByRole('button',{name:'Record history',exact:true}).click();
        await view.page.getByRole('button',{name:'Open saved edition',exact:true}).first().click();
        assert(await view.page.getByRole('button',{name:'Edit draft',exact:true}).count()===0,
          'A saved historical edition does not offer current draft mutation.');
        await view.page.locator('#close-detail').click();
      }
      for(const viewport of [{width:1360,height:940},{width:390,height:844}]) {
        await view.page.setViewportSize(viewport);
        await selectRegister(view.page,'assessments');
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        await view.page.getByRole('heading',{name:'Publication',exact:true}).waitFor();
        const size=await view.page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        assert(size.scrollWidth<=size.width,'The exact frozen award detail exceeds this viewport.');
        const path=join(root,'evidence',label+'-'+randomUUID()+'-'+viewport.width+'.png');
        await view.page.screenshot({path,fullPage:true});const info=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        screenshots.push({viewport,size,...info});
        await view.page.locator('#close-detail').click();
      }
      // Original programme document controls stream the same retained bytes
      // used by each award publication; no separate document transport is added.
      await view.page.locator('nav button[data-view="programme"]').click();
      await view.page.getByRole('heading',{name:'Programme delivery',exact:true}).waitFor();
      await view.page.locator('#content').getByLabel('Workspace',{exact:true}).selectOption('documents');
      await view.page.getByLabel('Programme or project',{exact:true}).selectOption('');
      await view.page.getByLabel('Archived records',{exact:true}).selectOption('true');
      for(const document of programmeOf(portfolio).records.documents.filter(row=>row.object)) {
        await view.page.getByLabel('Search this register',{exact:true}).fill(document.title);
        await view.page.getByRole('button',{name:'Apply',exact:true}).click();
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        const downloading=view.page.waitForEvent('download');
        await view.page.getByRole('button',{name:'Download document',exact:true}).click();
        const download=await downloading;assert(download.suggestedFilename()===document.object.filename);
        const target=join(root,'documents',label+'-browser-'+document.id+'-'+document.object.filename),staged=target+'.download-'+randomUUID();
        let info;
        try {
          await download.saveAs(staged);
          info=await fileInfo(staged,{synchronize:true});
          equal({bytes:info.bytes,sha256:info.sha256},{bytes:document.object.bytes,sha256:document.object.sha256});
          try{await link(staged,target);}catch(error){if(error.code!=='EEXIST')throw error;}
          info=await fileInfo(target,{synchronize:true});await syncDirectory(dirname(target));
          equal({bytes:info.bytes,sha256:info.sha256},{bytes:document.object.bytes,sha256:document.object.sha256});
        } finally {try{await unlink(staged);await syncDirectory(dirname(staged));}catch(error){if(error.code!=='ENOENT')throw error;}}
        downloads.push({recordId:document.id,...info});
        await view.page.locator('#close-detail').click();
      }
      await view.page.selectOption('#revision-select','1');
      await view.page.waitForFunction(()=>document.querySelector('#revision-select')?.value==='1');
      await view.page.locator('nav button[data-view="awards"]').click();
      await view.page.getByRole('heading',{name:'Grant applications and awards',exact:true}).waitFor();
      equal(view.errors,[]);
      return {workspaceId:consoles.get(role).ready.workspaceId,portfolioId:portfolio.id,revision:portfolio.revision,
        screenshots,downloads,oldRevisionOpened:1,pageErrors:view.errors,browserVersion:browser.version()};
    } finally {await view.context.close();}
  }

  async function verifyHistory(client,final,label,{reference=null}={}) {
    const versions=[],tableEvidence=[],documentEditions=new Map(),recordEvidence=[];
    for(let revision=1;revision<=final.revision;revision++) {
      checkStop();
      const portfolio=await client.portfolio(final.id,{revision,signal:controller.signal});
      if(reference)equal(portfolio,await reference.portfolio(final.id,{revision,signal:controller.signal}));
      assert(portfolio.sources.length===input.externalSources.length);
      for(const table of Object.keys(portfolio.tableSha256).sort()) {
        const observed=await tableRows(client,portfolio,table);
        if(reference)equal(observed,await tableRows(reference,portfolio,table),'The complete original table pages changed after receiving.');
        tableEvidence.push(observed);
      }
      equal(portfolio.tableSha256.financial,journal.refs.financialBaseline.tableSha256);
      equal(portfolio.financialTotals,journal.refs.financialBaseline.totals);
      for(const document of programmeOf(portfolio).records.documents)if(document.object) {
        const key=document.id+':'+document.object.sha256;
        if(!documentEditions.has(key))documentEditions.set(key,{portfolio,document});
      }
      versions.push({revision,snapshot:portfolio.snapshot,operationId:portfolio.operationId,
        programmeRevision:programmeOf(portfolio).revision,awardsRevision:portfolio.definition.awards?.revision??0,
        tableSha256:portfolio.tableSha256});
      await save(join(root,'evidence',label+'-portfolio-r'+revision+'.json'),portfolio,true);
    }
    for(const collection of AWARD_COLLECTIONS)for(const original of final.definition.awards.records[collection]) {
      const query={portfolioId:final.id,revision:final.revision,collection,id:original.id};
      const [record,history]=await Promise.all([client.awardsRecord(query,{signal:controller.signal}),
        client.awardsHistory(query,{signal:controller.signal})]);
      equal(record.record,original);assert(history.history.length>0);equal(history.history.at(-1).record,original);
      if(reference)equal(history,await reference.awardsHistory(query,{signal:controller.signal}));
      recordEvidence.push({collection,id:original.id,recordRevision:original.revision,recordSha256:original.sha256,
        history:history.history.map(item=>({portfolioRevision:item.portfolioRevision,operationId:item.operationId,
          recordRevision:item.record.revision,recordSha256:item.record.sha256}))});
    }
    const downloads=[];
    for(const {portfolio,document} of documentEditions.values())
      downloads.push(await downloadDocument(client,portfolio,document,label+'-'+document.id+'-'+document.object.sha256+'.bin'));
    const id=journal.refs.ids;
    const round=await client.awardsRound({portfolioId:final.id,revision:final.revision,roundId:id.round});
    const position=await client.awardsPosition({portfolioId:final.id,revision:final.revision,applicationId:id.application});
    equal(position.position.application,awardOf(final,'applications',id.application));
    const frozenAssessment=awardOf(final,'assessments',id.assessment);
    assert(frozenAssessment.publication.calculation.weightedTotal==='3.600');
    equal(position.position.calculations.find(row=>row.assessmentId===id.assessment).calculation,frozenAssessment.publication.calculation);
    assert(position.position.decisions.some(row=>row.id===id.deferred)&&position.position.decisions.some(row=>row.id===id.decision));
    assert(position.position.claims.some(row=>row.id===id.claimQuery)&&position.position.claims.some(row=>row.id===id.claimApproved));
    // Exercise the actual financial picker over the unchanged source-owned table.
    const financialPages=[];let offset=0;
    for(;;) {
      const page=await client.awardsFinancial({portfolioId:final.id,revision:final.revision,offset,limit:50});
      assert(page.snapshot===final.snapshot);
      for(const row of page.rows)assert(HASH.test(row.reference.sha256)&&row.reference.sourceId===row.record.sourceId&&row.reference.rowKey===row.record.rowKey);
      financialPages.push(page);if(page.nextOffset===null)break;offset=page.nextOffset;
    }
    if(reference) {
      equal(round,await reference.awardsRound({portfolioId:final.id,revision:final.revision,roundId:id.round}));
      equal(position,await reference.awardsPosition({portfolioId:final.id,revision:final.revision,applicationId:id.application}));
    }
    const originalAgreement=awardOf(final,'agreements',id.agreement);
    const savedDoc=originalAgreement.publication.programmeRecords.find(row=>row.collection==='documents'&&row.record.id===id.agreement1Doc);
    assert(savedDoc&&savedDoc.record.object.sha256===journal.phases['original-document-objects'].result.agreement1.sha256);
    assert(recordOf(final,'documents',id.agreement1Doc).object.sha256!==savedDoc.record.object.sha256);
    const monitoring=awardOf(final,'monitoring',id.monitoring);
    assert(monitoring.publication.programmeRecords.some(row=>row.collection==='observations'&&row.record.id===id.observation&&row.record.value==='1'));
    assert(recordOf(final,'observations',id.observation).value==='2');
    return {workspaceId:(await client.state()).workspaceId,versions,tables:tableEvidence,records:recordEvidence,
      documentEditions:downloads,round,position,financialPages,
      archivedDraft:awardOf(final,'checks',id.abandoned).archived,exactWeightedTotal:'3.600',
      originalAgreementDocumentSha256:savedDoc.record.object.sha256};
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
    return {closed:!browser&&consoles.size===0&&children.size===0,errors:[...closureErrors.values()],
      browserHeld:Boolean(browser),consoleOwners:consoles.size,childrenHeld:children.size};
  }
  let completedResult=null,failure=null,resourceResult=null,alreadyComplete=false;
  try {
    const existing=await readJson(join(root,'complete.json'),true);
    if(existing) {
      equal(existing.binding,binding);assert(existing.state==='COMPLETE'&&existing.resources.closed===true);
      for(const row of [existing.customer,existing.reexport,...existing.images,...existing.applicationFiles]) {
        const actual=await fileInfo(row.path);
        equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:row.bytes,sha256:row.sha256});
      }
      await retainCompleted('reconcile complete receiving journal',async()=>{
        journal.state='COMPLETE';journal.completedAt=existing.completedAt;
        journal.resources=existing.resources;delete journal.activePhase;delete journal.error;await checkpoint();
      });
      completedResult=existing;alreadyComplete=true;
    } else {
      assert(browserSelection,'Supply the original Chromium and Playwright selectors for the complete application journey.');
          await stage('source-and-internal-awards-input',async()=>{
        if(!journal.refs.ids) {
          const names=['portfolio','programme','project','partner','grant','rulesDoc','applicationDoc','agreement1Doc','paymentDoc',
            'indicator','observation','milestone','round','eligibilityQuery','eligibilityPass','diligence','abandoned',
            'recused','assignment','assessment','deferred','decision','agreement','claim','claimQuery','claimApproved',
            'reconciliation','monitoring','rejectedAssessment'];
          const captured=Object.fromEntries(names.map(name=>[name,randomUUID()]));
          await retainCompleted('internal award record identities',async()=>{journal.refs.ids=captured;await checkpoint();});
        }
        for(const key of ['rules','application','agreement1','agreement2','payment'])
          await writeBytes(join(root,'documents','internal-'+key+'.md'),fixtureDocument(key),{immutable:true});
        return {fixture:input.fixture,asOf:input.asOf,actors:{recorder:input.actor,assessor:input.assessor},
          rules:criteria,syntheticAmount:money,syntheticClaimAmount:claimMoney,
          meaning:'Internal acceptance fixture only. No CIF criteria, real applicant, award or payment.',
          sourceCommit,sourceManifestSha256:binding.sourceManifestSha256,sourceFiles:sourceFiles.length};
      });
      let client=await startConsole('source');
      const schema=await client.programmeSchema();assert(schema.schema===PROGRAMME_SCHEMA);
      const awardsSchema=await client.awardsSchema();assert(awardsSchema.schema===AWARDS_SCHEMA);
      equal(awardsSchema.collections,AWARD_COLLECTIONS);
      const external=await stage('original-source-editions',()=>retainSourceInputs(client));
      const descriptors=await stage('original-document-objects',async()=>{
        const records={};
        for(const key of ['rules','application','agreement1','agreement2','payment'])
          records[key]=await uploadDocument(client,join(root,'documents','internal-'+key+'.md'),'Internal_'+key+'.md','text/markdown');
        return records;
      });
      const initial=await stage('original-programme-and-document-records',async()=>{
        const result=await originalAction(client,'create-internal-awards-programme','portfolio.save',async()=>({
          name:'Grant administration — internal complete receiving',
          notes:'Explicitly synthetic acceptance records; external sources are separately original and unchanged.',
          sources:external.sources.map(row=>row.id),
          review:{status:'draft',reviewer:input.actor,note:'Internal software receiving; no customer acceptance or funding approval.'},
          programme:{schema:PROGRAMME_SCHEMA,actor:input.actor,expectedProgrammeRevision:0,
            settings:{asOf:input.asOf,riskScaleMaximum:5,highRiskScore:15},changes:internalRecords(descriptors)},
        }));
        const portfolio=result.result;
        await retainCompleted('original awards portfolio and financial basis',async()=>{
          journal.refs.portfolioId=portfolio.id;
          journal.refs.financialBaseline={tableSha256:portfolio.tableSha256.financial,totals:portfolio.financialTotals,
            sourceIds:portfolio.sources};await checkpoint();
        });
        await verifyExternalBindings(client,portfolio);
        assert(!portfolio.definition.awards,'The pre-awards original revision retains its original table inventory.');
        return portfolio;
      });
      const publishedRound=await stage('published-explicit-internal-round',async()=>{
        const result=await changeAwards(client,'publish-internal-round',input.actor,async()=>({changes:[
          newAward('rounds','round',{code:'INT-ROUND-1',title:'Internal grant round',programmeNodeId:journal.refs.ids.programme,
            owner:input.actor,opensDate:input.asOf,closesDate:input.asOf,criteria,scoringMethod:'weighted-sum',
            process:'Internal specimen: explicit criteria, attributed review, recorded panel decision, agreement and evidence.',
            evidenceIds:[journal.refs.ids.rulesDoc],status:'published'}),
        ]}));
        equal(awardOf(result.result,'rounds',journal.refs.ids.round).criteria,criteria);
        return result.result;
      });
      const draftApplicationIntake=await stage('browser-original-csv-draft-intake',()=>
        browserApplicationIntake(client,publishedRound,'draft'));
      const applicationIntake=await stage('original-csv-application-intake',()=>
        browserApplicationIntake(client,draftApplicationIntake.portfolio,'submitted'));

      await stage('attributed-checks-and-conflict-disposition',async()=>{
        const id=journal.refs.ids;
        const result=await changeAwards(client,'record-checks-and-recusal',input.actor,async()=>({changes:[
          newAward('checks','eligibilityQuery',{applicationId:id.application,kind:'eligibility',reviewer:input.actor,
            outcome:'query',items:[{criterionId:'eligibility',title:'Internal fixture evidence',outcome:'query',
              reason:'Clarify the synthetic evidence narrative before the following edition.',evidenceIds:[id.applicationDoc]}],
            completedDate:input.asOf,status:'recorded'}),
          newAward('checks','diligence',{applicationId:id.application,kind:'due-diligence',reviewer:input.actor,
            outcome:'pass',items:[{title:'Internal source edition',criterionId:null,outcome:'pass',
              reason:'The exact internal document is retained; no external diligence claim.',evidenceIds:[id.applicationDoc]}],
            completedDate:input.asOf,status:'recorded'}),
          newAward('checks','abandoned',{applicationId:id.application,kind:'due-diligence',reviewer:input.actor,
            outcome:'undetermined',items:[],status:'draft',notes:'An unused working draft will be archived after the complete workflow.'}),
          newAward('assignments','recused',{applicationId:id.application,assessor:input.assessor,assignedBy:input.actor,
            assignedDate:input.asOf,conflictDisclosure:{state:'declared',details:'Internal test conflict, disclosed explicitly.',evidenceIds:[id.rulesDoc]},
            conflictResolution:{outcome:'recused',decidedBy:input.actor,reason:'Internal independent disposition; scoring is unavailable on this edition.',date:input.asOf},
            status:'confirmed'}),
        ]}));
        return result.result;
      });
      const rejectedScoring=await stage('recused-assignment-remains-nonscoring',()=>rejectedAction(client,'reject-recused-assessment',async previous=>({
        actor:input.assessor,changes:[newAward('assessments','rejectedAssessment',{assignmentId:journal.refs.ids.recused,
          assessor:input.assessor,scores:[{criterionId:'quality',value:'4.00',reason:'Internal fixture',evidenceIds:[]},
            {criterionId:'delivery',value:'3.00',reason:'Internal fixture',evidenceIds:[]}],
          submittedDate:input.asOf,status:'submitted',recommendation:'This original recused assignment must reject the attempted return.'})],
      })));
      await stage('following-independent-conflict-clearance',async()=>{
        const id=journal.refs.ids;
        return (await changeAwards(client,'record-following-assignment',input.actor,async previous=>({changes:[
          newAward('assignments','assignment',{...awardFields(awardsSchema,'assignments',awardOf(previous,'assignments',id.recused)),
            supersedesId:id.recused,conflictResolution:{outcome:'clear',decidedBy:input.actor,
              reason:'Independent internal clearance records the documented mitigation on a new edition; the recusal remains retained.',date:input.asOf},
            status:'confirmed'}),
        ]}))).result;
      });
      const assessment=await stage('exact-published-weighted-assessment',async()=>{
        const id=journal.refs.ids;
        const result=await changeAwards(client,'submit-attributed-assessment',input.assessor,async()=>({changes:[
          newAward('assessments','assessment',{assignmentId:id.assignment,assessor:input.assessor,
            scores:[{criterionId:'quality',value:'4.00',reason:'Internal quality specimen rationale.',evidenceIds:[id.applicationDoc]},
              {criterionId:'delivery',value:'3.00',reason:'Internal delivery specimen rationale.',evidenceIds:[id.applicationDoc]}],
            recommendation:'Internal recorded assessment only; the panel decides separately.',
            submittedDate:input.asOf,status:'submitted'}),
        ]}));
        const calculation=awardOf(result.result,'assessments',id.assessment).publication.calculation;
        assert(calculation.weightedTotal==='3.600'&&calculation.ranking===null);
        equal(calculation.scores.map(row=>[row.criterionId,row.weight,row.value,row.weighted]),
          [['quality','6E-1','4.00','2.400'],['delivery','4E-1','3.00','1.200']]);
        return result.result;
      });
      const deferred=await stage('explicit-deferred-panel-edition',async()=>{
        const id=journal.refs.ids;
        return (await changeAwards(client,'record-deferred-decision',input.actor,async()=>({changes:[
          newAward('decisions','deferred',{applicationId:id.application,assessmentIds:[id.assessment],
            checkIds:[id.eligibilityQuery,id.diligence],panel:[{member:input.actor,role:'Internal panel chair',conflictState:'none',reason:''}],
            outcome:'defer',amount:null,reasons:'Internal eligibility query remains open; this is a deferred decision, not an award.',
            decisionDate:input.asOf,status:'recorded'}),
        ]}))).result;
      });
      const queueViews=await stage('unresolved-queries-and-decision-stay-visible',()=>browserQueue(deferred,'unresolved',{unresolved:true}));
      await stage('following-check-and-explicit-award-decision',async()=>{
        const id=journal.refs.ids;
        return (await changeAwards(client,'record-following-check-and-decision',input.actor,async previous=>({changes:[
          newAward('checks','eligibilityPass',{...awardFields(awardsSchema,'checks',awardOf(previous,'checks',id.eligibilityQuery)),
            supersedesId:id.eligibilityQuery,outcome:'pass',
            items:[{criterionId:'eligibility',title:'Internal fixture evidence',outcome:'pass',
              reason:'The following internal check explicitly resolves the narrative query.',evidenceIds:[id.applicationDoc]}],status:'recorded'}),
          newAward('decisions','decision',{...awardFields(awardsSchema,'decisions',awardOf(previous,'decisions',id.deferred)),
            supersedesId:id.deferred,checkIds:[id.eligibilityPass,id.diligence],outcome:'award',amount:money,
            reasons:'Explicit synthetic acceptance decision only; the score does not automatically decide an award.',status:'recorded'}),
        ]}))).result;
      });
      await stage('agreement-bound-to-original-decision-and-document',async()=>{
        const id=journal.refs.ids;
        return (await changeAwards(client,'record-agreement',input.actor,async()=>({changes:[
          newAward('agreements','agreement',{decisionId:id.decision,grantId:id.grant,agreementDocumentId:id.agreement1Doc,
            recipientPartnerId:id.partner,amount:money,startDate:input.asOf,endDate:input.asOf,
            acceptedBy:'Internal acceptance fixture',acceptedDate:input.asOf,
            conditions:'Internal agreement specimen only. No actual contract, disbursement or legal acceptance is asserted.',status:'recorded'}),
        ]}))).result;
      });
      const queriedClaim=await stage('distinct-submitted-claim-and-review-query',async()=>{
        const id=journal.refs.ids;
        return (await changeAwards(client,'record-claim-and-query',input.actor,async()=>({changes:[
          newAward('claims','claim',{agreementId:id.agreement,kind:'submission',claimId:null,owner:input.actor,
            amount:claimMoney,outcome:'pending',financialRefs:[],recordedDate:input.asOf,
            narrative:'Synthetic 2500.00 GBP claim specimen; submission alone is not approval or payment.',status:'recorded'}),
          newAward('claims','claimQuery',{agreementId:id.agreement,kind:'review',claimId:id.claim,owner:input.actor,
            amount:claimMoney,outcome:'query',financialRefs:[],recordedDate:input.asOf,
            narrative:'Internal reviewer asks for the selected specimen evidence.',evidenceIds:[id.paymentDoc],status:'recorded'}),
        ]}))).result;
      });
      const claimQueueViews=await stage('recorded-claim-query-stays-visible',async()=>{
        const observed=await browserQueue(queriedClaim,'claim-query');
        assert(/query/i.test(observed.text),'A recorded claim query remains outstanding.');return observed;
      });
      const monitoringDraft=await stage('following-review-and-attributed-evidence-reconciliation',async()=>{
        const id=journal.refs.ids;
        return (await changeAwards(client,'record-claim-approval-and-reconciliation',input.actor,async previous=>({changes:[
          newAward('claims','claimApproved',{...awardFields(awardsSchema,'claims',awardOf(previous,'claims',id.claimQuery)),
            supersedesId:id.claimQuery,outcome:'approved',narrative:'The following internal review resolves the evidence query. Approval is not payment.',status:'recorded'}),
          newAward('claims','reconciliation',{agreementId:id.agreement,kind:'reconciliation',claimId:id.claim,owner:input.actor,
            amount:claimMoney,outcome:'matched',financialRefs:[],evidenceIds:[id.paymentDoc],recordedDate:input.asOf,
            narrative:'Attributed matching assertion against an explicitly synthetic statement specimen. No financial row or settlement is invented.',status:'recorded'}),
          newAward('monitoring','monitoring',{agreementId:id.agreement,title:'Internal grant monitoring return',
            periodStart:input.asOf,periodEnd:input.asOf,reportedBy:input.actor,observationIds:[id.observation],
            milestoneIds:[id.milestone],outcome:'on-track',narrative:'Working internal monitoring draft.',
            actions:'Retain the original observation and evidence editions.',evidenceIds:[id.applicationDoc],status:'draft'}),
        ]}))).result;
      });
      const monitoring=await stage('actual-browser-monitoring-publication',async()=>{
        return recordMonitoringThroughBrowser(client,monitoringDraft,awardsSchema);
      });
      const final=await stage('later-source-editions-preserve-original-award-publications',async()=>{
        const id=journal.refs.ids;
        const result=await changeProgramme(client,'retain-later-programme-editions',previous=>({changes:[
          change('partners',recordOf(previous,'partners',id.partner),{name:'Internal Example Organisation — corrected current label'}),
          change('documents',recordOf(previous,'documents',id.agreement1Doc),{object:descriptors.agreement2,
            description:'A later internal document edition. Original recorded agreement retains complete edition 1.'}),
          change('observations',recordOf(previous,'observations',id.observation),{value:'2',
            notes:'Later internal observation edition; the earlier monitoring publication retains the original value 1.'}),
        ],archive:[{collection:'documents',id:id.applicationDoc,
          expectedRevision:recordOf(previous,'documents',id.applicationDoc).revision,
          reason:'Retained original synthetic application evidence; all award publications and history continue to include its bytes.'}]}));
        const before=await client.portfolio(result.input.payload.id,{revision:result.input.payload.expectedPortfolioRevision});
        equal(result.result.definition.awards,before.definition.awards,'Programme-only edits must retain the whole awards model unchanged.');
        const closed=await changeAwards(client,'close-round-and-retire-unused-draft',input.actor,previous=>({
          changes:[change('rounds',awardOf(previous,'rounds',id.round),{status:'closed'})],
          archive:[{collection:'checks',id:id.abandoned,expectedRevision:awardOf(previous,'checks',id.abandoned).revision,
            reason:'Unused internal working draft; the real recorded diligence remains unchanged.'}],
        }));
        const final=closed.result;
        equal(awardOf(final,'rounds',id.round).publication,awardOf(before,'rounds',id.round).publication);
        equal(awardOf(final,'assessments',id.assessment).publication,awardOf(assessment,'assessments',id.assessment).publication);
        equal(final.tableSha256.financial,initial.tableSha256.financial);equal(final.financialTotals,initial.financialTotals);
        return final;
      });
      const immutableArchive=await stage('published-award-edition-cannot-be-archived',()=>rejectedAction(client,'reject-published-archive',async previous=>({
        archive:[{collection:'agreements',id:journal.refs.ids.agreement,
          expectedRevision:awardOf(previous,'agreements',journal.refs.ids.agreement).revision,
          reason:'This attempted final-record archive must fail without replacing its publication.'}],
      })));

      const applicationExchange=await stage('complete-application-json-and-csv-exchange',async()=>({
        ...await browserApplicationExports(final),originalCsv:applicationIntake.csv,
      }));
      const sourceReadback=await stage('complete-source-history-and-document-streams',()=>verifyHistory(client,final,'source'));
      const sourceViews=await stage('actual-programme-desktop-and-phone',()=>browserReadback('source',final,'source'));
      const customer=await stage('complete-original-export-and-repeat',async()=>{
        const request=await originalAction(client,'complete-programme-export','portfolio.export',async()=>({
          portfolioId:final.id,revision:final.revision}));
        const path=join(root,'exports','Internal_Grant_Awards_Complete.zip');
        const returned=await client.downloadExport(request.result.sha256,path,{bytes:request.result.bytes,signal:controller.signal});
        const actual=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        equal({bytes:actual.bytes,sha256:actual.sha256},{bytes:request.result.bytes,sha256:request.result.sha256});
        const repeated=await client.action(await readJson(join(root,'actions','complete-programme-export.input.json')));
        equal(repeated,request,'Repeating the same original export must return its existing complete result.');
        const facts=await archiveFacts(path,'inspect-original-complete-export');
        assert(facts.historyCount===final.revision&&facts.manifest.snapshot===final.snapshot);
        for(const row of sourceFiles)equal(facts.manifest.files['runtime/sf30-seller-sdk/'+row.path],{bytes:row.bytes,sha256:row.sha256});
        for(const descriptor of Object.values(descriptors))
          equal(facts.manifest.files['programme/documents/'+descriptor.sha256],{bytes:descriptor.bytes,sha256:descriptor.sha256});
        equal(facts.manifest.files['programme/documents/'+applicationIntake.csv.sha256],{bytes:applicationIntake.csv.bytes,sha256:applicationIntake.csv.sha256});
        await save(join(root,'evidence','complete-export-inventory.json'),facts,true);
        return {...actual,filename:request.result.filename,operationId:request.id,snapshot:final.snapshot,
          manifestSha256:sha(encoded(facts.manifest)),historySha256:facts.historySha256,requests:facts.requests};
      });
      await stage('cold-original-workspace-reopen',async()=>{
        if(browser){await browser.close();browser=null;}
        const closed=await stopConsole('source');
        const cold=await cli('source','cold-original-portfolio',['portfolio','--id',final.id,'--revision',String(final.revision)]);
        equal(cold.returned,final);
        return {closed,native:cold.native,workspaceId:journal.refs.workspaces.source,snapshot:final.snapshot};
      });
      if(!consoles.has('source'))client=await startConsole('source');
      else client=consoles.get('source').client;
      const target=await startConsole('receiver');
      const received=await stage('independent-complete-native-receiving',async()=>{
        const uploaded=await target.uploadFile(customer.path,{sha256:customer.sha256,signal:controller.signal});
        const request=await originalAction(target,'receive-complete-programme','portfolio.receive',async()=>({object:uploaded.sha256}));
        assert(request.result.snapshot===final.snapshot&&request.result.historyCount===final.revision);
        assert((await target.state()).workspaceId!==journal.refs.workspaces.source);
        equal(await target.portfolio(final.id,{revision:final.revision}),final);
        const observations=await verifyHistory(target,final,'receiver',{reference:client});
        return {operationId:request.id,result:request.result,observations};
      });
      const receiverViews=await stage('received-application-desktop-phone-and-documents',
        ()=>browserReadback('receiver',final,'receiver'));
      const reexport=await stage('original-reexport-retains-foreign-history-and-documents',async()=>{
        const request=await originalAction(target,'reexport-complete-programme','portfolio.export',async()=>({
          portfolioId:final.id,revision:final.revision}));
        const path=join(root,'exports','Received_Internal_Grant_Awards_Complete.zip');
        await target.downloadExport(request.result.sha256,path,{bytes:request.result.bytes,signal:controller.signal});
        const actual=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        const before=await readJson(join(root,'evidence','complete-export-inventory.json'));
        const after=await archiveFacts(path,'inspect-original-reexport');
        assert(after.historySha256===before.historySha256);
        for(const [name,value]of Object.entries(before.manifest.files))if(name.startsWith('sources/')||
          name.startsWith('rows/')||name.startsWith('programme/documents/'))equal(after.manifest.files[name],value);
        const following=new Set(after.requests.map(row=>row.origin+':'+row.id+':'+row.sha256));
        for(const row of before.requests)assert(following.has(row.origin+':'+row.id+':'+row.sha256),'Preserve the full original origin-bound request.');
        await save(join(root,'evidence','complete-reexport-inventory.json'),after,true);
        return {...actual,operationId:request.id,snapshot:final.snapshot,historySha256:after.historySha256};
      });
      await stage('cold-received-workspace-and-original-receive-replay',async()=>{
        if(browser){await browser.close();browser=null;}
        const closed=await stopConsole('receiver');
        const cold=await cli('receiver','cold-received-portfolio',['portfolio','--id',final.id,'--revision',String(final.revision)]);
        equal(cold.returned,final);
        const reopened=await startConsole('receiver'),before=await reopened.state();
        const replay=await reopened.action(await readJson(join(root,'actions','receive-complete-programme.input.json')));
        assert(replay.state==='COMPLETED'&&replay.result.snapshot===final.snapshot);
        const after=await reopened.state();
        assert(after.revision===before.revision,'Reopening the completed receiving must not create another revision.');
        equal(await reopened.portfolio(final.id,{revision:final.revision}),final);
        return {closed,native:cold.native,workspaceId:before.workspaceId,unchangedWorkspaceRevision:after.revision,
          operationId:replay.id,receivedSnapshot:final.snapshot};
      });
      completedResult={schema:'stellar-forge.awards-complete-receiving.v1',state:'COMPLETE',
        operation:AWARDS_RECEIVING_OPERATION,runId:journal.runId,startedAt:journal.startedAt,completedAt:now(),binding,
        scope:'Explicitly synthetic internal grant-administration acceptance data and only exact owner-supplied external source editions. No real applicant, CIF criteria, award, acceptance or payment is asserted.',
        portfolioId:final.id,revision:final.revision,snapshot:final.snapshot,programmeRevision:programmeOf(final).revision,
        external,recordIds:journal.refs.ids,monitoringRequestId:monitoring.requestId,
        awardsRevision:final.definition.awards.revision,draftApplicationIntake,applicationIntake,rejectedScoring,immutableArchive,
        originalWorkspaceId:journal.refs.workspaces.source,receivingWorkspaceId:journal.refs.workspaces.receiver,
        customer,reexport,applicationFiles:[applicationIntake.csv,...draftApplicationIntake.files,...applicationIntake.files,...applicationExchange.files],applicationExchange,
        images:[...draftApplicationIntake.screenshots,...applicationIntake.screenshots,
          ...queueViews.screenshots,...claimQueueViews.screenshots,...sourceViews.screenshots,...receiverViews.screenshots],
        documentDownloads:sourceReadback.documentEditions.length+received.observations.documentEditions.length+
          sourceViews.downloads.length+receiverViews.downloads.length,
        sourceFinancialRowsAndGroupsUnchanged:true,paymentInstructions:[],tenantIntegrations:[],nativePhases:journal.phases};
    }
  } catch(error) {failure=error;}
  finally {
    // Keep the same owned browser/consoles/children until their actual closure
    // and retained outputs are known. No phase or business action runs here.
    for(;;) {
      resourceResult=await cleanup();
      if(resourceResult.closed)break;
      announce({state:'AWAITING_OWNED_RESOURCE_CLOSE',resources:resourceResult});
      await sleep(2000);
    }
    if(resourceResult.errors.length&&!failure)
      failure=Object.assign(new Error('Owned native resource closure returned an error: '+JSON.stringify(resourceResult.errors)),{code:'AWARDS_RECEIVING_CLOSE_FAILED'});
    if(!alreadyComplete) {
      if(failure) {
        const outcome={schema:'stellar-forge.awards-receiving-failure.v1',
          operation:AWARDS_RECEIVING_OPERATION,runId:journal.runId,at:now(),phase:journal.activePhase??null,
          error:{code:failure.code??null,message:safeMessage(failure)},resources:resourceResult,
          completedPhases:Object.keys(journal.phases),originalWorkspaceIds:journal.refs.workspaces??{}};
        await retainCompleted('original failed receiving outcome',async()=>{
          await save(join(root,'evidence','failure-'+sha(encoded(outcome))+'.json'),outcome,true);
          journal.state='FAILED';journal.error=outcome.error;journal.resources=resourceResult;await checkpoint();
        });
      } else {
        completedResult.resources=resourceResult;
        await retainCompleted('complete original programme receiving',async()=>{
          await save(join(root,'complete.json'),completedResult,true);
          journal.state='COMPLETE';journal.completedAt=completedResult.completedAt;
          journal.resources=resourceResult;delete journal.activePhase;delete journal.error;await checkpoint();
        });
      }
    }
    process.off('SIGTERM',onTerm);process.off('SIGINT',onInt);
  }
  if(failure) {
    announce({state:'FAILED',phase:journal.activePhase??null,error:{code:failure.code??null,message:safeMessage(failure)},
      originalReceiving:journalPath,resources:resourceResult});
    throw Object.assign(new Error(safeMessage(failure)),{code:failure.code??null});
  }
  announce({state:'COMPLETE',result:join(root,'complete.json'),portfolioId:completedResult.portfolioId,
    revision:completedResult.revision,customer:completedResult.customer,reexport:completedResult.reexport,
    images:completedResult.images.length,resources:completedResult.resources});
  return completedResult;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  await runAwardsReceiving().catch(error=>{
    process.stderr.write(JSON.stringify({operation:AWARDS_RECEIVING_OPERATION,state:'FAILED',
      code:error.code??null,message:String(error.message)
        .replace(/https?:\/\/127\.0\.0\.1:\d+\/#?[A-Za-z0-9_-]{32,}/g,'[private console]').slice(0,2000)})+'\n');
    process.exitCode=1;
  });
