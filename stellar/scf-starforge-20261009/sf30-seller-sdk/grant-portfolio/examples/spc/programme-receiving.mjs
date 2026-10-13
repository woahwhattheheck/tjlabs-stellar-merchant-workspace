// MIT. One original Workspace/Console journey over an explicitly internal SPC implementation plan.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open, mkdir, lstat, realpath, link, unlink, rename} from 'node:fs/promises';
import {resolve, join, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export const PROGRAMME_RECEIVING_OPERATION = 'SCF-SPC-PMRS-PROGRAMME-RECEIVING-7DE2-20261013';
const PROGRAMME_SCHEMA = 'stellar-forge.grant-programme.v1';
const INPUT_SCHEMA = 'stellar-forge.spc-programme-receiving-input.v1';
const REQUIREMENTS = {bytes:29198, sha256:'10e118cf448a08ba261af49d28f10bfe7886a71399b0f552808e4d438e7e58a6'};
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

export async function runProgrammeReceiving(argv=process.argv.slice(2)) {
  const options=parseArguments(argv),sdk=absolute(options.get('--sdk')),root=absolute(options.get('--out'));
  const python=absolute(options.get('--python')),sourceCommit=options.get('--source-commit');
  const foregroundSelectionSha256=process.env.SCF_PROGRAMME_FOREGROUND_SELECTION;
  assert(Number(process.env.SCF_PROGRAMME_FOREGROUND_PID)===process.ppid&&HASH.test(foregroundSelectionSha256??'')&&
    process.env.SCF_PROGRAMME_FOREGROUND_HELPER_SHA256==='8522835d848533ff66b8fad6900c5c0c781eaae4967a5b5ac2f9dac1ed458412',
    'Run this complete journey through its original ProcessFamily foreground.');
  await directory(root,{privateRoot:true});
  const privateRoot=await directory(join(root,'private'),{privateRoot:true});
  for(const name of ['actions','evidence','documents','exports','workspaces','source-inputs','console-closures'])
    await directory(join(root,name),{privateRoot:true});
  await directory(join(privateRoot,'children'),{privateRoot:true});
  await directory(join(privateRoot,'connections'),{privateRoot:true});
  const inputBytes=await readBytes(absolute(options.get('--input')),2*1024*1024);
  const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(inputBytes));
  exactKeys(input,['schema','actor','asOf','issuedRequirements','externalSources','selectedProgramme'],
    ['schema','actor','asOf','issuedRequirements','externalSources']);
  assert(input.schema===INPUT_SCHEMA&&typeof input.actor==='string'&&input.actor.trim()&&input.actor.length<=240);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)&&new Date(input.asOf+'T00:00:00Z').toISOString().startsWith(input.asOf),'Use a real reporting date.');
  exactKeys(input.issuedRequirements,['path','bytes','sha256'],['path','bytes','sha256']);
  equal({bytes:input.issuedRequirements.bytes,sha256:input.issuedRequirements.sha256},REQUIREMENTS);
  const requirementBytes=await readBytes(absolute(input.issuedRequirements.path),REQUIREMENTS.bytes);
  assert(requirementBytes.length===REQUIREMENTS.bytes&&sha(requirementBytes)===REQUIREMENTS.sha256,'Select the complete issued requirements.');
  const requirements=JSON.parse(requirementBytes);
  equal(requirements.payment_milestones.map(row=>[row.date,row.percent]),[
    ['2026-10-30',20],['2026-11-20',25],['2026-12-14',25],['2027-01-10',30]]);
  assert(requirements.dates.warranty_end==='2028-01-10'&&requirements.authority.implementation_rules_are_proposed===true);
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
  let selectedProgramme=null,selectedProgrammeBytes=null;
  if(input.selectedProgramme!==undefined&&input.selectedProgramme!==null) {
    exactKeys(input.selectedProgramme,['path','bytes','sha256'],['path','bytes','sha256']);
    selectedProgrammeBytes=await readBytes(absolute(input.selectedProgramme.path),1024*1024);
    assert(selectedProgrammeBytes.length===input.selectedProgramme.bytes&&sha(selectedProgrammeBytes)===input.selectedProgramme.sha256);
    selectedProgramme=JSON.parse(selectedProgrammeBytes);
    exactKeys(selectedProgramme,['schema','authority','sourceIds','projectIds','flagshipNodeId','changes'],
      ['schema','authority','sourceIds','projectIds','changes']);
    assert(selectedProgramme.schema==='stellar-forge.spc-selected-programme-records.v1'&&
      typeof selectedProgramme.authority==='string'&&selectedProgramme.authority.trim()&&
      Array.isArray(selectedProgramme.changes)&&selectedProgramme.changes.length>0&&selectedProgramme.changes.length<=1500);
    assert(Array.isArray(selectedProgramme.sourceIds)&&selectedProgramme.sourceIds.every(id=>input.externalSources.some(row=>row.expectedSourceId===id)));
    assert(Array.isArray(selectedProgramme.projectIds)&&selectedProgramme.projectIds.every(id=>UUID.test(id)));
    for(const change of selectedProgramme.changes) assert(COLLECTIONS.includes(change.collection)&&UUID.test(change.id)&&
      change.expectedRevision===0&&plain(change.fields),'Retain the owner-supplied new records and IDs.');
  }
  const sourceManifestPath=join(sdk,'grant-portfolio/source-files.json'),sourceManifestBytes=await readBytes(sourceManifestPath,1024*1024);
  const sourceManifest=JSON.parse(sourceManifestBytes);
  assert(sourceManifest.schema==='stellar-forge.grant-portfolio-source-files.v1'&&Array.isArray(sourceManifest.files));
  equal(sourceManifest.files,[...new Set(sourceManifest.files)].sort());
  const clientPath=absolute(options.get('--client-module')??join(sdk,'grant-portfolio/client.mjs'));
  const checkPath=join(sdk,'grant-portfolio/check_programme_decimal.py');
  for(const path of ['grant-portfolio/source-files.json','grant-portfolio/managed.py','grant-portfolio/workspace.py',
    'grant-portfolio/cli.py','grant-portfolio/cli.mjs','grant-portfolio/client.mjs','grant-portfolio/programme.py',
    'grant-portfolio/programme_service.py','grant-portfolio/programme-client.mjs',
    'grant-portfolio/check_programme_decimal.py','grant-portfolio/examples/spc/programme-receiving.mjs',
    'grant-portfolio/examples/spc/PROGRAMME_RECEIVING.md','grant-portfolio/examples/spc/receiving-input.example.json',
    'grant-portfolio/examples/spc/run-programme-receiving.py','grant-portfolio/examples/spc/process_family.py',
    relative(sdk,clientPath)])
    assert(sourceManifest.files.includes(path),'The complete joined source manifest must retain '+path);
  const sourceFiles=[];
  for(const path of sourceManifest.files) {
    assert(path&&!path.startsWith('/')&&!path.includes('\\')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..'));
    const file=await fileInfo(join(sdk,path));sourceFiles.push({path,bytes:file.bytes,sha256:file.sha256});
  }
  assert((await readBytes(sourceManifestPath,1024*1024)).equals(sourceManifestBytes),'The selected source closure changed.');
  const selfPath=fileURLToPath(import.meta.url),self=await fileInfo(selfPath);
  assert(selfPath===join(sdk,'grant-portfolio/examples/spc/programme-receiving.mjs'),
    'Run this original programme from its complete selected source closure.');
  const browserSelection=options.has('--chromium')?{
    executable:await fileInfo(absolute(options.get('--chromium'))),
    playwright:await fileInfo(absolute(options.get('--playwright-module')))}:null;
  const binding={schema:'stellar-forge.programme-receiving-selection.v1',operation:PROGRAMME_RECEIVING_OPERATION,
    root,sdk,python,node:process.execPath,nodeVersion:process.version,sourceCommit,foregroundSelectionSha256,
    inputSha256:sha(inputBytes),requirements:REQUIREMENTS,sourceManifestSha256:sha(sourceManifestBytes),
    sourceFiles,programme:{path:selfPath,bytes:self.bytes,sha256:self.sha256},clientModule:clientPath,browser:browserSelection};
  const journalPath=join(root,'receiving.json');
  let journal=await readJson(journalPath,true);
  if(journal)equal(journal.binding,binding,'Continue the same full receiving selection.');
  else {
    journal={schema:'stellar-forge.spc-programme-receiving.v1',operation:PROGRAMME_RECEIVING_OPERATION,
      runId:randomUUID(),startedAt:now(),binding,state:'PREPARED',phases:{},refs:{},resources:{closed:false}};
    await save(journalPath,journal);
  }
  await writeBytes(join(root,'source-inputs','receiving-input.json'),inputBytes,{immutable:true});
  await writeBytes(join(root,'source-inputs','issued-requirements.json'),requirementBytes,{immutable:true});
  if(selectedProgrammeBytes)await writeBytes(join(root,'source-inputs','selected-programme.json'),selectedProgrammeBytes,{immutable:true});
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
      frozen={operationId:'programme-'+journal.runId+'-'+key,action,payload:await payload(),
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
  function implementationPlan(edition) {
    const lines=['# Internal PMRS implementation plan — edition '+edition,'',
      'This is the Commons implementation breakdown for the issued RFQ. It is not SPC pilot selection, a grant award, an approved inception plan, a staff clearance, or evidence of a payment.',
      '', 'As of: '+input.asOf, 'Issued requirements SHA-256: '+REQUIREMENTS.sha256,
      'Issued RFQ: '+requirements.authority.rfq,'',
      '## Proposed workstreams','',
      '1. Application build: hierarchy, grants, workplan, results, evidence, reporting and complete customer handover.',
      '2. Finance integration: source-owned Business Central/IATI interfaces, original field/period/currency mappings and visible reconciliation.',
      '3. Staff UAT and handover: original role/action dispatcher, the actual selected pilot projects, deployment and staff documentation.','',
      '## Issued target milestones',''];
    for(const row of requirements.payment_milestones)
      lines.push('- '+row.date+': '+row.deliverable+'; '+row.percent+'% contractual tranche target, with no payment asserted.');
    lines.push('','Actual SPC-selected CCS projects and the Climate Change Flagship portfolio must be supplied by their original source owners.',
      'No corporate project registration, donor agreement, awarded amount or production financial transaction is created by this internal plan.');
    if(edition===2)lines.push('','## Scope correction and support','',
      'This edition adds the full warranty and evidence boundaries omitted from the initial working outline.',
      'Implementation acceptance target: 2027-01-10. Defect warranty continues through 2028-01-10.',
      'Critical defect acknowledgment: one business day; other defects: two business days. Correction timing is agreed by severity.',
      'New functionality, new integrations and material changes require a separate agreement.',
      'The four milestone dates and 20/25/25/30 tranches remain unchanged. They are planned contractual gates, not completed delivery or cash receipts.',
      'The internal result counts workstreams recorded in this application; it does not measure SPC project outcomes.',
      'Business Central and selected financial editions remain explicitly absent until their original sources and identities are supplied.');
    return Buffer.from(lines.join('\n')+'\n');
  }
  function internalRecords(documents) {
    const id=journal.refs.ids,owner=input.actor,description=
      'Internal proposed implementation work only. Preserve issued requirements and await SPC/OBJ source-owned pilot and finance selections.';
    const records=[
      newRecord('nodes','portfolio',{kind:'portfolio',code:'IP-SPC-PMRS',title:'SPC PMRS — internal implementation planning',owner,
        description,startDate:input.asOf,endDate:'2028-01-10'}),
      newRecord('nodes','programme',{kind:'programme',code:'IP-PMRS-IMPLEMENTATION',title:'Proposed PMRS application delivery',
        parentId:id.portfolio,owner,description,startDate:input.asOf,endDate:'2028-01-10'}),
      ...[['application','IP-APPLICATION-BUILD','Application build'],['finance','IP-FINANCE-INTEGRATION','Finance integration'],
        ['handover','IP-STAFF-UAT-HANDOVER','Staff UAT and handover']].map(([key,code,title])=>
        newRecord('nodes',key,{kind:'project',code,title:'Internal workstream: '+title,parentId:id.programme,owner,description,
          startDate:input.asOf,endDate:'2027-01-10',dataManagementRequired:null,
          dataManagementBasis:'SPC and donor policy selection is pending; this internal record grants no exemption.'})),
      newRecord('partners','partner',{code:'IP-COMMONS-TEAM',name:'Commons internal implementation team',
        roles:['implementation-planning'],description:'The authoring team for this internal plan; no SPC grantee or applicant status is asserted.'}),
      newRecord('grants','grant',{code:'IP-WORKSHARE-SCOPE',title:'Internal work package — no awarded funding',
        projectId:id.application,recipientId:id.partner,owner,award:null,
        purpose:'Planning register for the proposed implementation workshare. No donor grant, contract award or disbursement is asserted.'}),
      newRecord('grants','subgrant',{code:'IP-RECEIVING-SCOPE',title:'Internal receiving work package — no awarded funding',
        projectId:id.application,parentGrantId:id.grant,recipientId:id.partner,owner,award:null,
        purpose:'Source, programme and complete receiving work within the same internal application-build scope.'}),
      newRecord('documents','requirements',{nodeId:id.portfolio,title:'Issued RFQ requirements — original captured source',
        category:'other',owner,status:'current',uri:requirements.authority.rfq,object:documents.requirements,
        sourceEdition:requirements.authority.edition,documentDate:'2026-10-06',
        description:'The complete unchanged 29,198-byte issued-requirements capture; proposed implementation rules are identified within it.'}),
      newRecord('documents','plan1',{nodeId:id.portfolio,title:'Internal implementation plan — working outline',
        category:'workplan-budget',owner,status:'working',object:documents.plan1,documentDate:input.asOf,
        description:'Original internal outline. Contains no awarded budget; full support detail is added in its following edition.'}),
      newRecord('indicators','indicator',{nodeId:id.application,grantId:id.grant,code:'IP-WORKSTREAMS-RECORDED',
        title:'Internal implementation workstreams recorded',owner,resultLevel:'output',unit:'internal workstreams',
        aggregation:'latest',direction:'increase',baseline:[{date:input.asOf,value:'0'}],
        targets:[{date:input.asOf,value:'3',documentIds:[id.plan1]}],documentIds:[id.plan1],
        methodology:'Count only the three internal implementation project records saved in this original action. This is not a count of selected SPC pilots or delivered external outcomes.'}),
      newRecord('observations','observation',{indicatorId:id.indicator,periodStart:input.asOf,periodEnd:input.asOf,
        reportedDate:input.asOf,value:'3',dimensions:{scope:'internal-implementation-plan'},
        status:'reported',collector:owner,documentIds:[id.plan1],
        notes:'Three internal workstream records are actually created by this batch; no external project result is reported.'}),
      newRecord('risks','risk',{nodeId:id.programme,title:'Source and access dependencies remain owner-selected',
        category:'implementation-dependency',owner,likelihood:3,impact:4,reviewDate:input.asOf,status:'open',
        mitigation:'Keep the original source owners and explicit pending selections. Do not synthesize pilot projects or corporate finance.',
        documentIds:[id.requirements],description}),
      newRecord('issues','issue',{nodeId:id.programme,title:'Complete the internal outline with issued support scope',
        owner,severity:'medium',dueDate:input.asOf,status:'open',
        action:'Add the twelve-month warranty boundary and clarify that local result counts are implementation-plan records.',
        documentIds:[id.plan1]}),
      newRecord('reports','report',{nodeId:id.programme,title:'Internal implementation-plan receiving report',
        owner,periodStart:input.asOf,periodEnd:input.asOf,dueDate:input.asOf,status:'draft',
        recipient:'Internal engineering source review',documentIds:[id.requirements],
        narrative:'Internal receiving record only. No SPC approval, submission, delivery acceptance, staff clearance or payment is asserted.'}),
      newRecord('closures','closure',{nodeId:id.programme,title:'Internal receiving edition closure',
        owner,closedDate:input.asOf,status:'prepared',documentIds:[id.requirements],
        remainingIssueIds:[id.issue],summary:'Prepared closure of this internal source/record receiving edition. Implementation milestones, source delivery and SPC acceptance remain separate.'}),
    ];
    requirements.payment_milestones.forEach((row,index)=>records.push(newRecord('milestones','milestone'+index,{
      nodeId:id.programme,code:'IP-ISSUED-M'+(index+1),title:'Issued target: '+row.deliverable,owner,
      dueDate:row.date,status:'planned',progress:'0',dependencyIds:index?[id['milestone'+(index-1)]]:[],
      documentIds:[id.requirements],description:row.percent+'% target tranche in the issued requirements. No completion or payment has been recorded.'})));
    return records;
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
      sources:received,selectedProgrammeAuthority:selectedProgramme?.authority??null,
      selectedProjectIds:selectedProgramme?.projectIds??[],flagshipNodeId:selectedProgramme?.flagshipNodeId??null};
  }
  async function verifyExternalBindings(client,portfolio) {
    const evidence=[];
    for(const row of input.externalSources)for(const ref of row.records) {
      const found=await client.detail({portfolioId:portfolio.id,revision:portfolio.revision,
        sourceId:ref.sourceId,entityKey:ref.entityKey},{signal:controller.signal});
      assert(found.entity.sha256===ref.sha256,'The selected original external record changed.');
      evidence.push({key:row.key,...ref,originalId:found.entity.originalId,financialRows:found.financial.length});
    }
    if(selectedProgramme) {
      const records=programmeOf(portfolio).records;
      for(const id of selectedProgramme.projectIds)assert(records.nodes.some(row=>row.id===id&&row.kind==='project'));
      if(selectedProgramme.flagshipNodeId)assert(records.nodes.some(row=>row.id===selectedProgramme.flagshipNodeId));
      for(const expected of selectedProgramme.changes)assert(records[expected.collection].some(row=>row.id===expected.id));
    }
    return evidence;
  }
  function validateAcknowledgment(inputValue,intent) {
    assert(inputValue.action==='portfolio.save'&&typeof inputValue.operationId==='string');
    const payload=inputValue.payload,change=payload.programme;
    exactKeys(inputValue,['operationId','action','payload','expectedRevision'],['operationId','action','payload']);
    exactKeys(payload,['id','expectedPortfolioRevision','name','notes','sources','review','programme'],
      ['id','expectedPortfolioRevision','name','notes','sources','review','programme']);
    equal(Object.fromEntries(['name','notes','sources','review'].map(key=>[key,payload[key]])),intent.definition,
      'The original UI acknowledgment must preserve the complete selected portfolio definition.');
    exactKeys(change,['schema','expectedProgrammeRevision','actor','changes'],
      ['schema','expectedProgrammeRevision','actor','changes']);
    assert(payload.id===intent.portfolioId&&payload.expectedPortfolioRevision===intent.portfolioRevision);
    assert(change.schema===PROGRAMME_SCHEMA&&change.expectedProgrammeRevision===intent.programmeRevision&&change.actor===input.actor);
    assert(change.changes.length===1&&!change.archive?.length);
    equal(change.changes[0],{collection:'reports',id:intent.reportId,expectedRevision:intent.recordRevision,fields:{status:'acknowledged'}});
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
      await page.locator('nav button[data-view="programme"]').click();
      await page.getByRole('heading',{name:'Programme delivery',exact:true}).waitFor();
      return {context,page,errors};
    } catch(error){await context.close();throw error;}
  }
  async function selectRegister(page,name,search='') {
    await page.locator('#content').getByLabel('Workspace',{exact:true}).selectOption(name);
    await page.getByLabel('Programme or project',{exact:true}).selectOption('');
    await page.getByLabel('Archived records',{exact:true}).selectOption('true');
    await page.getByLabel('Search this register',{exact:true}).fill(search);
    await page.getByRole('button',{name:'Apply',exact:true}).click();
  }
  async function acknowledgeThroughBrowser(client,portfolio) {
    const report=recordOf(portfolio,'reports',journal.refs.ids.report);
    const intent={portfolioId:portfolio.id,portfolioRevision:portfolio.revision,programmeRevision:programmeOf(portfolio).revision,
      reportId:report.id,recordRevision:report.revision,publication:report.publication,
      definition:Object.fromEntries(['name','notes','sources','review'].map(key=>[key,portfolio.definition[key]]))};
    const intentPath=join(root,'actions','report-acknowledgement.selection.json');
    const retainedIntent=await readJson(intentPath,true);
    if(retainedIntent)equal(retainedIntent,intent);
    else await save(intentPath,intent,true);
    const inputPath=join(root,'actions','report-acknowledgement.input.json');
    let original=await readJson(inputPath,true),view=null,routeFailure=null;
    try {
      if(!original) {
        view=await browserPage('source',portfolio);
        // Persist the actual UI-generated operation before its first HTTP POST.
        // Reentry reconciles these exact bytes with the original request API.
        await view.page.route('**/api/action',async route=>{
          try {
            const submitted=route.request().postDataJSON();
            validateAcknowledgment(submitted,intent);
            await retainCompleted('original UI acknowledgement input',()=>save(inputPath,submitted,true));
            original=submitted;
            if(stopRequested)await route.abort();else await route.continue();
          } catch(error){routeFailure=error;await route.abort();}
        });
        await selectRegister(view.page,'reports',report.title);
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        await view.page.getByRole('button',{name:'Acknowledge report',exact:true}).click();
        await view.page.getByLabel('Editor',{exact:true}).fill(input.actor);
        await view.page.getByRole('button',{name:'Record acknowledgment',exact:true}).click();
        for(;;) {
          if(routeFailure)throw routeFailure;
          if(original)break;
          checkStop();await sleep(100);
        }
      }
      validateAcknowledgment(original,intent);
      const completed=await completeOriginal(client,'report-acknowledgement',original);
      const actual=completed.result,after=recordOf(actual,'reports',report.id);
      assert(actual.revision===portfolio.revision+1&&after.revision===report.revision+1&&after.status==='acknowledged');
      equal(after.publication,report.publication,'Acknowledgement must preserve the original dated position.');
      if(view) {
        await view.page.waitForFunction(revision=>document.querySelector('#revision-select')?.value===String(revision),actual.revision);
        equal(view.errors,[]);
      }
      return {requestId:completed.id,portfolio:actual,publicationSha256:after.publication.sha256,
        originalInputSha256:completed.inputSha256,uiGenerated:true};
    } finally {if(view)await view.context.close();}
  }
  async function browserReadback(role,portfolio,label) {
    const view=await browserPage(role,portfolio);
    const screenshots=[],downloads=[],attempt=randomUUID();
    try {
      for(const name of ['nodes','grants','milestones','indicators','observations','risks','issues','reports','closures'])
        await selectRegister(view.page,name);
      await selectRegister(view.page,'documents');
      const documents=programmeOf(portfolio).records.documents.filter(row=>row.object&&
        [journal.refs.ids.requirements,journal.refs.ids.plan1,journal.refs.ids.plan2].includes(row.id));
      for(const document of documents) {
        await selectRegister(view.page,'documents',document.title);
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        const downloading=view.page.waitForEvent('download');
        await view.page.getByRole('button',{name:'Download document',exact:true}).click();
        const download=await downloading;
        assert(download.suggestedFilename()===document.object.filename);
        const target=join(root,'documents',label+'-browser-'+document.id+'-'+document.object.filename);
        const staged=target+'.download-'+randomUUID();
        let info;
        try {
          await download.saveAs(staged);
          const bytes=await fileInfo(staged,{synchronize:true});
          equal({bytes:bytes.bytes,sha256:bytes.sha256},{bytes:document.object.bytes,sha256:document.object.sha256});
          try{await link(staged,target);}catch(error){if(error.code!=='EEXIST')throw error;}
          info=await fileInfo(target,{synchronize:true});await syncDirectory(dirname(target));
          equal({bytes:info.bytes,sha256:info.sha256},{bytes:document.object.bytes,sha256:document.object.sha256});
        } finally {
          try{await unlink(staged);await syncDirectory(dirname(staged));}catch(error){if(error.code!=='ENOENT')throw error;}
        }
        downloads.push({recordId:document.id,...info});
        await view.page.getByRole('button',{name:'Record history',exact:true}).click();
        await view.page.getByRole('button',{name:'Open edition',exact:true}).first().click();
        await view.page.locator('#close-detail').click();
      }
      for(const viewport of [{width:1360,height:940},{width:390,height:844}]) {
        await view.page.setViewportSize(viewport);
        await selectRegister(view.page,'reports','Internal implementation-plan receiving report');
        await view.page.getByRole('button',{name:'Open record',exact:true}).first().click();
        await view.page.getByText('Saved reporting position',{exact:true}).waitFor();
        const size=await view.page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        assert(size.scrollWidth<=size.width,'The original programme UI overflows this viewport.');
        const path=join(root,'evidence',label+'-'+attempt+'-'+viewport.width+'.png');
        await view.page.screenshot({path,fullPage:true});
        const info=await fileInfo(path,{synchronize:true});await syncDirectory(dirname(path));
        screenshots.push({viewport,size,...info});
        await view.page.locator('#close-detail').click();
      }
      await view.page.selectOption('#revision-select','1');
      await view.page.waitForFunction(()=>document.querySelector('#revision-select')?.value==='1');
      await view.page.getByRole('heading',{name:'Programme delivery',exact:true}).waitFor();
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
        if(reference) {
          const expected=await tableRows(reference,portfolio,table);
          equal(observed,expected,'The complete original table pages differ after receiving.');
        }
        tableEvidence.push(observed);
      }
      equal(portfolio.tableSha256.financial,journal.refs.financialBaseline.tableSha256);
      equal(portfolio.financialTotals,journal.refs.financialBaseline.totals);
      for(const document of programmeOf(portfolio).records.documents)if(document.object) {
        const key=document.id+':'+document.object.sha256;
        if(!documentEditions.has(key))documentEditions.set(key,{portfolio,document});
      }
      versions.push({revision,snapshot:portfolio.snapshot,operationId:portfolio.operationId,
        programmeRevision:programmeOf(portfolio).revision,tableSha256:portfolio.tableSha256});
      await save(join(root,'evidence',label+'-portfolio-r'+revision+'.json'),portfolio,true);
    }
    for(const collection of COLLECTIONS)for(const original of programmeOf(final).records[collection]) {
      const query={portfolioId:final.id,revision:final.revision,collection,id:original.id};
      const [record,history]=await Promise.all([client.programmeRecord(query,{signal:controller.signal}),
        client.programmeHistory(query,{signal:controller.signal})]);
      equal(record.record,original);assert(history.history.length>0);
      equal(history.history.at(-1).record,original);
      if(reference)equal(history,await reference.programmeHistory(query,{signal:controller.signal}));
      recordEvidence.push({collection,id:original.id,recordRevision:original.revision,recordSha256:original.sha256,
        history:history.history.map(item=>({portfolioRevision:item.portfolioRevision,operationId:item.operationId,
          recordRevision:item.record.revision,recordSha256:item.record.sha256}))});
    }
    const downloads=[];
    for(const {portfolio,document} of documentEditions.values())
      downloads.push(await downloadDocument(client,portfolio,document,label+'-'+document.id+'-'+document.object.sha256+'.bin'));
    const internalIds=journal.refs.ids;
    const position=await client.programmePosition({portfolioId:final.id,revision:final.revision,nodeId:internalIds.programme});
    assert(position.position.financialRowRefs.length===0,'Internal planning records must not acquire external financial amounts.');
    assert(position.position.completedMilestones===0,'Issued future delivery milestones remain planned.');
    const qa=[];
    for(const nodeId of [internalIds.application,internalIds.finance,internalIds.handover])
      qa.push(await client.programmeQa({portfolioId:final.id,revision:final.revision,nodeId}));
    return {workspaceId:(await client.state()).workspaceId,versions,tables:tableEvidence,records:recordEvidence,
      documentEditions:downloads,position,qa};
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
      for(const row of [existing.customer,existing.reexport,...existing.images]) {
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
      await stage('source-and-internal-plan-input',async()=>{
        if(!journal.refs.ids) {
          const names=['portfolio','programme','application','finance','handover','partner','grant','subgrant','requirements',
            'plan1','plan2','indicator','observation','risk','issue','report','closure','milestone0','milestone1','milestone2','milestone3'];
          const captured=Object.fromEntries(names.map(name=>[name,randomUUID()]));
          await retainCompleted('internal record IDs',async()=>{journal.refs.ids=captured;await checkpoint();});
        }
        if(selectedProgramme)for(const row of selectedProgramme.changes)
          assert(!Object.values(journal.refs.ids).includes(row.id),'The supplied owner record collides with an internal plan ID.');
        await writeBytes(join(root,'documents','internal-plan-edition-1.md'),implementationPlan(1),{immutable:true});
        await writeBytes(join(root,'documents','internal-plan-edition-2.md'),implementationPlan(2),{immutable:true});
        return {requirements:REQUIREMENTS,authority:requirements.authority,asOf:input.asOf,
          internalPlan:'Proposed implementation breakdown; not SPC-selected pilots, delivery acceptance, awarded finance or payment.',
          milestoneTargets:requirements.payment_milestones,warrantyEnd:requirements.dates.warranty_end,
          pendingSourcePolicy:'Accept only complete owner-supplied native source ZIPs, original source/record IDs and selected programme records.',
          sourceCommit,sourceManifestSha256:binding.sourceManifestSha256,sourceFiles:sourceFiles.length};
      });
      await stage('original-exact-decimal-receiving',async()=>{
        const result=await processJson('original-exact-decimal-receiving',python,['-B',checkPath,join(sdk,'grant-portfolio')]);
        assert(result.returned.schema==='stellar-forge.programme-exact-decimal-receiving.v1'&&result.returned.state==='COMPLETE');
        assert(result.returned.sourceSha256===sourceFiles.find(row=>row.path==='grant-portfolio/programme.py').sha256);
        return result;
      });
      let client=await startConsole('source');
      const schema=await client.programmeSchema();assert(schema.schema===PROGRAMME_SCHEMA);
      equal(schema.collections,COLLECTIONS);
      const external=await stage('original-source-editions',()=>retainSourceInputs(client));
      const descriptors=await stage('original-document-objects',async()=>({
        requirements:await uploadDocument(client,join(root,'source-inputs','issued-requirements.json'),
          'SPC_Issued_Requirements.json','application/json'),
        plan1:await uploadDocument(client,join(root,'documents','internal-plan-edition-1.md'),
          'Internal_Implementation_Plan_Edition_1.md','text/markdown'),
        plan2:await uploadDocument(client,join(root,'documents','internal-plan-edition-2.md'),
          'Internal_Implementation_Plan_Edition_2.md','text/markdown'),
      }));
      const initial=await stage('original-programme-and-workstream-records',async()=>{
        const result=await originalAction(client,'create-internal-programme','portfolio.save',async()=>({
          name:'SPC PMRS — internal implementation and original selected sources',
          notes:'Internal implementation receiving. The three local workstreams are our proposed breakdown; actual SPC pilot selections and finance remain separately source-owned.',
          sources:external.sources.map(row=>row.id),
          review:{status:'draft',reviewer:input.actor,note:'Internal source/record receiving only; no SPC staff clearance or acceptance is asserted.'},
          programme:{schema:PROGRAMME_SCHEMA,actor:input.actor,expectedProgrammeRevision:0,
            settings:{asOf:input.asOf,riskScaleMaximum:5,highRiskScore:15},
            changes:[...internalRecords(descriptors),...(selectedProgramme?.changes??[])]},
        }));
        const portfolio=result.result;
        await retainCompleted('original portfolio and financial basis',async()=>{
          journal.refs.portfolioId=portfolio.id;
          journal.refs.financialBaseline={tableSha256:portfolio.tableSha256.financial,totals:portfolio.financialTotals,
            sourceIds:portfolio.sources};await checkpoint();
        });
        assert(programmeOf(portfolio).records.grants.filter(row=>[journal.refs.ids.grant,journal.refs.ids.subgrant].includes(row.id))
          .every(row=>row.award===null));
        await verifyExternalBindings(client,portfolio);
        return portfolio;
      });
      const corrected=await stage('corrected-plan-and-dated-report-draft',async()=>{
        const id=journal.refs.ids;
        const result=await changeProgramme(client,'correct-plan-scope',async previous=>({
          changes:[
            newRecord('documents','plan2',{nodeId:id.portfolio,title:'Internal implementation plan — full scope edition',
              category:'workplan-budget',owner:input.actor,status:'current',object:descriptors.plan2,documentDate:input.asOf,
              replacesId:id.plan1,description:'Adds the issued warranty/evidence boundaries while preserving every original target and the complete earlier edition.'}),
            change('documents',recordOf(previous,'documents',id.plan1),{status:'superseded'}),
            change('issues',recordOf(previous,'issues',id.issue),{status:'resolved',
              resolution:'The following internal plan edition records warranty through 2028-01-10 and distinguishes internal workstream counts from SPC pilot outcomes.',
              documentIds:[id.plan2]}),
            change('reports',recordOf(previous,'reports',id.report),{documentIds:[id.requirements,id.plan2],
              narrative:'Internal planning source review. Four issued milestone targets and their 20/25/25/30 tranches remain planned. Three internal workstreams are recorded. Support ends 2028-01-10. External SPC pilot/finance selections are '+(external.sources.length?'limited to the exact supplied native editions.':'not supplied. No external acceptance or payment is asserted.')}),
          ]}));
        return result.result;
      });
      const submitted=await stage('frozen-dated-internal-report',async()=>{
        const id=journal.refs.ids;
        const request=await changeProgramme(client,'submit-internal-report',previous=>({changes:[
          change('reports',recordOf(previous,'reports',id.report),{status:'submitted',submittedDate:input.asOf}),
        ]}));
        const report=recordOf(request.result,'reports',id.report),publication=report.publication;
        assert(publication&&publication.operationId===request.id&&publication.reportingPeriod.end===input.asOf);
        for(const [collection,ids] of Object.entries({observations:[id.observation],partners:[id.partner],
          documents:[id.requirements,id.plan1,id.plan2]}))
          for(const selected of ids)assert(publication.recordRefs[collection].some(row=>row.id===selected),'The original frozen contributor is missing.');
        equal(publication.position.financialRowRefs,[]);
        return request.result;
      });
      const acknowledgement=await stage('original-ui-report-acknowledgement',()=>acknowledgeThroughBrowser(client,submitted));
      const final=await stage('following-record-editions-and-source-preserving-archive',async()=>{
        const id=journal.refs.ids;
        const result=await changeProgramme(client,'preserve-following-editions',previous=>({
          changes:[
            change('observations',recordOf(previous,'observations',id.observation),{
              documentIds:[id.plan2],notes:'Evidence now points to the complete corrected plan. The actual value remains three internal workstreams; this is not an SPC pilot or implementation outcome.'}),
            change('risks',recordOf(previous,'risks',id.risk),{status:'mitigating',residualLikelihood:2,residualImpact:4,
              mitigation:'The full issued scope is now captured. External pilot IDs, staff actions and finance editions still require original owner selection.',
              documentIds:[id.requirements,id.plan2]}),
            change('closures',recordOf(previous,'closures',id.closure),{status:'recorded',remainingIssueIds:[],
              documentIds:[id.requirements,id.plan2],summary:'This closes the internal record/source receiving edition only. All four issued delivery milestones remain planned, the three local workstreams are not SPC pilots, and no contract acceptance or payment is asserted.'}),
          ],
          archive:[
            {collection:'documents',id:id.plan1,expectedRevision:recordOf(previous,'documents',id.plan1).revision,
              reason:'Superseded by the retained full-scope edition; preserve the original bytes, report references and all history.'},
            {collection:'issues',id:id.issue,expectedRevision:recordOf(previous,'issues',id.issue).revision,
              reason:'The internal outline correction is resolved and remains in the recorded source history.'},
          ]}));
        const portfolio=result.result,report=recordOf(portfolio,'reports',id.report);
        equal(report.publication,recordOf(submitted,'reports',id.report).publication);
        assert(report.status==='acknowledged'&&recordOf(portfolio,'documents',id.plan1).archived);
        const originalObserved=recordOf(submitted,'observations',id.observation),followingObserved=recordOf(portfolio,'observations',id.observation);
        assert(followingObserved.revision===originalObserved.revision+1&&followingObserved.sha256!==originalObserved.sha256);
        equal(followingObserved.value,originalObserved.value);
        assert(report.publication.recordRefs.observations.some(row=>row.id===originalObserved.id&&row.sha256===originalObserved.sha256));
        equal(portfolio.tableSha256.financial,initial.tableSha256.financial);
        equal(portfolio.financialTotals,initial.financialTotals);
        return portfolio;
      });
      const sourceReadback=await stage('complete-source-history-and-document-streams',()=>verifyHistory(client,final,'source'));
      const sourceViews=await stage('actual-programme-desktop-and-phone',()=>browserReadback('source',final,'source'));
      const customer=await stage('complete-original-export-and-repeat',async()=>{
        const request=await originalAction(client,'complete-programme-export','portfolio.export',async()=>({
          portfolioId:final.id,revision:final.revision}));
        const path=join(root,'exports','SPC_PMRS_Internal_Programme_Complete.zip');
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
        const path=join(root,'exports','SPC_PMRS_Received_Programme_Complete.zip');
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
      completedResult={schema:'stellar-forge.spc-programme-complete-receiving.v1',state:'COMPLETE',
        operation:PROGRAMME_RECEIVING_OPERATION,runId:journal.runId,startedAt:journal.startedAt,completedAt:now(),binding,
        scope:'Internal proposed implementation plan and only the exact owner-supplied external editions. No external approval, contract acceptance, awarded finance or payment is asserted.',
        portfolioId:final.id,revision:final.revision,snapshot:final.snapshot,programmeRevision:programmeOf(final).revision,
        external,recordIds:journal.refs.ids,acknowledgementRequestId:acknowledgement.requestId,
        originalWorkspaceId:journal.refs.workspaces.source,receivingWorkspaceId:journal.refs.workspaces.receiver,
        customer,reexport,images:[...sourceViews.screenshots,...receiverViews.screenshots],
        documentDownloads:sourceReadback.documentEditions.length+received.observations.documentEditions.length+
          sourceViews.downloads.length+receiverViews.downloads.length,
        sourceFinancialRowsAndGroupsUnchanged:true,internalAwardedAmounts:[],nativePhases:journal.phases};
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
      failure=Object.assign(new Error('Owned native resource closure returned an error: '+JSON.stringify(resourceResult.errors)),{code:'PROGRAMME_RECEIVING_CLOSE_FAILED'});
    if(!alreadyComplete) {
      if(failure) {
        const outcome={schema:'stellar-forge.spc-programme-receiving-failure.v1',
          operation:PROGRAMME_RECEIVING_OPERATION,runId:journal.runId,at:now(),phase:journal.activePhase??null,
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
  await runProgrammeReceiving().catch(error=>{
    process.stderr.write(JSON.stringify({operation:PROGRAMME_RECEIVING_OPERATION,state:'FAILED',
      code:error.code??null,message:String(error.message)
        .replace(/https?:\/\/127\.0\.0\.1:\d+\/#?[A-Za-z0-9_-]{32,}/g,'[private console]').slice(0,2000)})+'\n');
    process.exitCode=1;
  });
