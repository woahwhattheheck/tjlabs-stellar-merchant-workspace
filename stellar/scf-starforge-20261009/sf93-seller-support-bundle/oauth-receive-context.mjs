// MIT. Preserve the original OAuth producer handoff and continue only its retained Support work.
import {constants} from 'node:fs';
import {open, lstat, mkdir, readFile, realpath} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {acquireStateLease} from '../merchant-fleet-gateway/state-lease.mjs';
import {retainCaseArtifact} from '../sf74-merchant-support-console/case-store.mjs';
import {openIncidentStore, validateIncidentCapture} from './incident-store.mjs';
import {compileConfig} from './incident-config.mjs';
import {OAUTH_FILES, OAUTH_FILE_LIMIT, normalizeOAuthSource, readOAuthObservationFiles} from './oauth-observation.mjs';

const SCHEMA = 'stellar-forge.sf93.oauth-receive-context.v1';
const OPERATION = 'DBC61-SCF-OAUTH-SUPPORT-20261012';
const ROOT_NAME = 'receiving-input';
const CONTEXT_NAME = 'CONTEXT.json';
const LIMIT = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const utf8 = new TextDecoder('utf-8', {fatal:true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const ownPath = fileURLToPath(import.meta.url);
const fail = (code, message) => Object.assign(new Error(message), {code});
function check(value, message) {
  if (!value) throw fail('OAUTH_RECEIVE_CONTEXT_MISMATCH', message);
}
function stopping(signal) { signal?.throwIfAborted(); }
function same(a,b,label) { check(isDeepStrictEqual(a,b), label + ' differs from the original receiving context.'); }
function absolute(path,label) {
  check(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, 'Use the original absolute ' + label + '.');
  return path;
}
async function directory(path,create=false) {
  if (create) try { await mkdir(path,{mode:0o700}); } catch(error) { if(error.code !== 'EEXIST') throw error; }
  const stat = await lstat(path);
  check(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(path) === path &&
    stat.uid === process.getuid() && !(stat.mode & 0o077), 'The selected receiving directory must be an owned private ordinary directory.');
  return path;
}
async function read(path,{privateMode=true,maximum=LIMIT}={}) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({bigint:true});
    check(before.isFile() && before.size > 0n && before.size <= BigInt(maximum),
      'The selected source is not a complete bounded file.');
    if(privateMode) check(before.uid === BigInt(process.getuid()) && !(before.mode & 0o077n),
      'The original receiving artifact must remain private.');
    const bytes = await handle.readFile(), after = await handle.stat({bigint:true});
    check(before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
      before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs && bytes.length === Number(after.size),
      'The selected file changed during its complete read.');
    return bytes;
  } finally { await handle.close(); }
}
function descriptor(path,bytes) { return {path,bytes:bytes.length,sha256:hash(bytes)}; }
async function source(path) {
  absolute(path,'application source path');
  check(await realpath(path) === path, 'The selected application source path contains a symbolic link.');
  return descriptor(path,await read(path,{privateMode:false}));
}
async function verifySource(selected) {
  check(selected && Number.isSafeInteger(selected.bytes) && selected.bytes > 0 && HASH.test(selected.sha256),
    'The selected application source descriptor is incomplete.');
  same(await source(selected.path),selected,'Selected application source');
}
function browserSelection(browser) {
  if (!browser) return null;
  return {playwrightModule:absolute(browser.playwrightModule,'Playwright module'),
    executablePath:absolute(browser.executablePath,'browser executable')};
}
function finalFiles(sourceFiles) {
  check(sourceFiles && typeof sourceFiles === 'object' && !Array.isArray(sourceFiles), 'The original final OAuth files are required.');
  same(Object.keys(sourceFiles).sort(),[...OAUTH_FILES].sort(),'Final OAuth filenames');
  return Object.fromEntries(OAUTH_FILES.map(name=>{
    const bytes=sourceFiles[name];
    check(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= OAUTH_FILE_LIMIT,
      'Retain the full original final OAuth file: ' + name);
    return [name,Buffer.from(bytes)];
  }));
}
function incidentProjection(row) {
  return {id:row.id,merchantId:row.merchantId,kind:row.kind,status:row.status,revision:row.revision,
    beforeCapture:structuredClone(row.beforeCapture),afterCapture:structuredClone(row.afterCapture)};
}
async function originalIncidents(store,incidentIds,config,merchant,signal) {
  return store.transaction(async (state,io)=>{
    stopping(signal);same(state.config,config,'Original incident configuration');
    check(state.worker?.status === 'STOPPED', 'The original watcher must have recorded its completed stop.');
    const incidents=[];
    for(const id of incidentIds) {
      stopping(signal);
      const row=state.incidents.find(item=>item.id===id);
      check(row && row.merchantId===merchant.id && /^OAUTH_/.test(row.kind) && row.status==='RECOVERED',
        'The retained receiving context must select the same recovered original OAuth incident.');
      for(const side of ['before','after']) {
        const ref=row[side+'Capture'];
        check(ref?.kind==='OAUTH_RESOURCE', 'Keep both original OAuth capture references.');
        const bytes=await io.readCaptureBytes(ref);
        check(bytes.length===ref.bytes && hash(bytes)===ref.id, 'The original incident capture bytes changed.');
        const parsed=readOAuthObservationFiles(validateIncidentCapture(bytes,ref.id));
        check(parsed.meta.registration.id===merchant.id, 'The original capture selects another merchant.');
        same(parsed.meta.selection,merchant.oauth,'Original incident capture authority');
      }
      incidents.push(incidentProjection(row));
    }
    return {configRevision:state.configRevision,configHash:state.configHash,
      worker:{instanceId:state.worker.instanceId,status:state.worker.status,stoppedAt:state.worker.stoppedAt},
      incidents};
  },{readonly:true});
}

/** The original kernel lease serializes the producer and its retained receiving continuation. */
export async function acquireOAuthProgrammeLease(root,{signal}={}) {
  stopping(signal);absolute(root,'programme directory');await directory(root);
  const path=await directory(join(root,ROOT_NAME),true),lease=await acquireStateLease(path);
  try {stopping(signal);lease.assertHeld();return {directory:path,assertHeld:()=>lease.assertHeld(),close:()=>lease.close()};}
  catch(error) {await lease.close();throw error;}
}

/**
 * Publish complete immutable inputs before invoking the actual receiving export.
 * Only configuration references are saved: environment values and OAuth tokens are never copied.
 */
export async function retainOAuthReceiveContext({
  root,lease,incidentDirectory,incidentIds,incidentConfig,merchant,selection,sourceOrigin,
  sourceFiles,producer,report,receive,receivingModule,browser,signal
}) {
  stopping(signal);absolute(root,'programme directory');
  check(lease?.directory===join(root,ROOT_NAME), 'Use this original programme receiving lease.');
  lease.assertHeld();
  const files=finalFiles(sourceFiles),observation=readOAuthObservationFiles(files);
  const oauth=normalizeOAuthSource(selection),config=compileConfig(incidentConfig);
  check(observation.summary.coverage==='COMPLETE', 'Preserve the actual complete final source selected by this programme.');
  same(observation.meta.selection,oauth,'Final source selection');
  const registered=config.merchants.find(row=>row.id===merchant?.id);
  check(registered?.oauth && registered.label===merchant.label && observation.meta.registration.id===merchant.id,
    'Keep the original configured OAuth merchant.');
  same(normalizeOAuthSource(registered.oauth),oauth,'Original merchant authority');
  const selectedMerchant={id:registered.id,label:registered.label,oauth};
  const origin=new URL(sourceOrigin);
  check(['http:','https:'].includes(origin.protocol) && !origin.username && !origin.password &&
    origin.pathname==='/' && !origin.search && !origin.hash && origin.origin===new URL(oauth.endpoint).origin,
    'Keep the actual original source origin; it is not a live service promise.');
  absolute(incidentDirectory,'incident store');
  check(incidentDirectory===join(root,'private','incidents'), 'Select this original programme incident store.');
  await directory(incidentDirectory);
  check(Array.isArray(incidentIds) && incidentIds.length > 0 && incidentIds.length <= 64 &&
    incidentIds.every(id=>UUID.test(id)) && new Set(incidentIds).size===incidentIds.length,
    'Keep the original distinct incident IDs.');
  const ids=[...incidentIds].sort();
  const original=await originalIncidents(await openIncidentStore(incidentDirectory),ids,config,selectedMerchant,signal);
  let receiver=null;
  if(receive!==undefined) {
    check(typeof receive==='function', 'The original receiving export must be a function.');
    const path=receivingModule===undefined
      ? fileURLToPath(new URL('../sf74-merchant-support-console/oauth-receiving.mjs',import.meta.url))
      : absolute(receivingModule,'receiving module');
    receiver=await source(path);
    const module=await import(pathToFileURL(path).href);
    stopping(signal);
    check(module.receiveOAuthSupport===receive, 'The receiving function differs from its selected original module export.');
    await verifySource(receiver);
  } else check(receivingModule===undefined,'A receiving module requires its actual receiving export.');
  check(report?.schema==='stellar-forge.sf93.oauth-native-programme.v1' &&
    report.operation==='oauth-to-original-support' && report.status==='RUNNING' &&
    typeof report.startedAt==='string' && Array.isArray(report.phases) &&
    report.phases.at(-1)?.name==='same-source-recovery-and-retained-captures',
    'Retain the original producer at its completed incident recovery boundary.');
  const selectedFiles={};
  for(const name of OAUTH_FILES) {
    stopping(signal);lease.assertHeld();
    await retainCaseArtifact(join(lease.directory,name),files[name]);
    selectedFiles[name]=descriptor(name,files[name]);
  }
  // Keep the original programme's already-advertised source-only path as exact bytes.
  await retainCaseArtifact(join(root,'oauth-final-source.json'),files['oauth-source.json']);
  const value={schema:SCHEMA,operationId:OPERATION,createdAt:observation.meta.generatedAt,
    root,incidentDirectory,incidentIds:ids,incidentConfig:config,merchant:selectedMerchant,
    selection:oauth,sourceOrigin:origin.origin,sourceFiles:selectedFiles,originalIncidents:original,
    sourceIdentity:{sessionId:observation.source.sessionId,startedAt:observation.source.startedAt,
      capturedAt:observation.source.capturedAt,sequence:observation.source.sequence,
      configurationSha256:observation.source.configurationSha256,resource:observation.source.resource},
    producer:{module:await source(absolute(producer,'producer module')),
      resultPath:join(root,'oauth-native-result.json'),startedAt:report.startedAt,
      completedPhases:report.phases.map(({name,at})=>({name,at}))},
    contextModule:await source(ownPath),receiver,browser:browserSelection(browser),
    runtime:{node:process.execPath,nodeVersion:process.version},
    continuation:{mode:'RETAINED_SUPPORT_ONLY',requiresLiveOAuthHost:false,
      originalWatchersStarted:0,credentialEnvironment:'EMPTY'}};
  stopping(signal);lease.assertHeld();
  const bytes=encode(value),path=join(lease.directory,CONTEXT_NAME);
  await retainCaseArtifact(path,bytes);
  const stored=await read(path);check(stored.equals(bytes),'The complete original receive context changed after publication.');
  return {path,bytes:bytes.length,sha256:hash(bytes),sourceFiles:selectedFiles,
    receiver:receiver?{path:receiver.path,bytes:receiver.bytes,sha256:receiver.sha256}:null};
}

async function retainedInputs(contextPath,expectedContextSha256,signal) {
  check(HASH.test(expectedContextSha256), 'Supply the exact context SHA-256 returned by the original producer.');
  absolute(contextPath,'receive context');
  check(contextPath===join(dirname(dirname(contextPath)),ROOT_NAME,CONTEXT_NAME),
    'Select the original receiving-input/CONTEXT.json.');
  const root=dirname(dirname(contextPath));await directory(root);
  const lease=await acquireOAuthProgrammeLease(root,{signal});
  let workerLease;
  try {
    const bytes=await read(contextPath);
    check(hash(bytes)===expectedContextSha256, 'The original receiving context bytes differ from the selected SHA-256.');
    const value=JSON.parse(utf8.decode(bytes));
    check(value?.schema===SCHEMA && value.operationId===OPERATION && value.root===root,
      'The selected receive context belongs to another original operation.');
    check(value.incidentDirectory===join(root,'private','incidents') &&
      value.producer?.resultPath===join(root,'oauth-native-result.json'),'The original input paths changed.');
    same(value.contextModule,await source(ownPath),'Original receiving context implementation');
    await verifySource(value.producer.module);
    check(value.receiver,'This producer did not select a receiving module; no receiving continuation was issued.');
    await verifySource(value.receiver);
    same(value.browser,browserSelection(value.browser),'Original browser selection');
    same(value.continuation,{mode:'RETAINED_SUPPORT_ONLY',requiresLiveOAuthHost:false,
      originalWatchersStarted:0,credentialEnvironment:'EMPTY'},'Original continuation mode');
    check(value.runtime?.node===process.execPath && value.runtime.nodeVersion===process.version,
      'Use the original selected Node executable and version.');
    check(Array.isArray(value.incidentIds) && value.incidentIds.length>0 && value.incidentIds.length<=64 &&
      value.incidentIds.every(id=>UUID.test(id)) && new Set(value.incidentIds).size===value.incidentIds.length,
      'The original incident selection is invalid.');
    same(value.incidentIds,[...value.incidentIds].sort(),'Original incident order');
    const config=compileConfig(value.incidentConfig),selection=normalizeOAuthSource(value.selection);
    same(config,value.incidentConfig,'Retained compiled incident configuration');
    same(selection,value.selection,'Retained normalized source selection');
    const merchant=config.merchants.find(row=>row.id===value.merchant?.id);
    check(merchant?.oauth && merchant.label===value.merchant.label,'The retained merchant registration changed.');
    same(value.merchant,{id:merchant.id,label:merchant.label,oauth:normalizeOAuthSource(merchant.oauth)},
      'Retained merchant authority');
    const origin=new URL(value.sourceOrigin);
    check(origin.origin===value.sourceOrigin && origin.origin===new URL(selection.endpoint).origin,
      'The original source origin changed.');
    same(Object.keys(value.sourceFiles).sort(),[...OAUTH_FILES].sort(),'Retained final source filenames');
    const files={};
    for(const name of OAUTH_FILES) {
      stopping(signal);lease.assertHeld();
      const selected=value.sourceFiles[name];
      check(selected?.path===name && Number.isSafeInteger(selected.bytes) && selected.bytes>0 &&
        selected.bytes<=OAUTH_FILE_LIMIT && HASH.test(selected.sha256),'Invalid final source descriptor.');
      const body=await read(join(lease.directory,name),{maximum:OAUTH_FILE_LIMIT});
      same(descriptor(name,body),selected,'Original final OAuth file');
      files[name]=body;
    }
    const observation=readOAuthObservationFiles(files);
    check(observation.summary.coverage==='COMPLETE' && observation.meta.registration.id===merchant.id,
      'The retained final source is incomplete or selects a different registration.');
    same(observation.meta.selection,selection,'Retained final source authority');
    same(value.sourceIdentity,{sessionId:observation.source.sessionId,startedAt:observation.source.startedAt,
      capturedAt:observation.source.capturedAt,sequence:observation.source.sequence,
      configurationSha256:observation.source.configurationSha256,resource:observation.source.resource},
      'Original complete source identity');
    const store=await openIncidentStore(value.incidentDirectory);
    // The existing worker lease prevents any watcher from starting during this receiving invocation.
    workerLease=await store.acquireWorker();
    same(await originalIncidents(store,value.incidentIds,config,value.merchant,signal),
      value.originalIncidents,'Original stopped watcher and incident lifecycle');
    const reportBytes=await read(value.producer.resultPath),report=JSON.parse(utf8.decode(reportBytes));
    check(report?.schema==='stellar-forge.sf93.oauth-native-programme.v1' &&
      report.operation==='oauth-to-original-support' && report.startedAt===value.producer.startedAt &&
      ['RUNNING','FAILED','COMPLETED'].includes(report.status) && Array.isArray(report.phases),
      'The original producer result no longer selects this programme.');
    same(report.phases.slice(0,value.producer.completedPhases.length).map(({name,at})=>({name,at})),
      value.producer.completedPhases,'Original producer phase prefix');
    stopping(signal);lease.assertHeld();workerLease.assertHeld();
    return {value,files,context:descriptor(contextPath,bytes),
      producerResult:{...descriptor(value.producer.resultPath,reportBytes),status:report.status},
      assertHeld(){lease.assertHeld();workerLease.assertHeld();},
      async close(){try{await workerLease.close();}finally{await lease.close();}}};
  } catch(error) {
    try {await workerLease?.close();} finally {await lease.close();}
    throw error;
  }
}

/** Continue the same original Support selection, never the JOSE/host/watch producer. */
export async function continueOAuthSupportReceiving({contextPath,expectedContextSha256,signal}={}) {
  stopping(signal);
  const selected=await retainedInputs(contextPath,expectedContextSha256,signal);
  let attemptRoot,started;
  const startedAt=new Date().toISOString(),attemptId=randomUUID();
  try {
    const {value}=selected;
    const directoryPath=await directory(join(value.root,'receiving-continuations'),true);
    attemptRoot=await directory(join(directoryPath,attemptId),true);
    started={schema:'stellar-forge.sf93.oauth-receiving-continuation.v1',operationId:OPERATION,
      attemptId,startedAt,state:'STARTED',context:selected.context,
      originalProducerResult:selected.producerResult,sourceHost:'NOT_STARTED_OR_REQUIRED',
      originalWatchersStarted:0,credentialEnvironment:'EMPTY'};
    selected.assertHeld();await retainCaseArtifact(join(attemptRoot,'STARTED.json'),encode(started));
    const module=await import(pathToFileURL(value.receiver.path).href);
    stopping(signal);selected.assertHeld();await verifySource(value.receiver);
    check(typeof module.receiveOAuthSupport==='function','The retained original receiving export is unavailable.');
    const received=await module.receiveOAuthSupport({
      root:value.root,incidentDirectory:value.incidentDirectory,incidentIds:value.incidentIds,
      incidentConfig:value.incidentConfig,merchant:value.merchant,selection:value.selection,
      environment:Object.create(null),sourceOrigin:value.sourceOrigin,sourceFiles:selected.files,
      signal,browser:value.browser??undefined
    });
    check(received?.state==='COMPLETED','The original receiver has not completed its selected work.');
    selected.assertHeld();
    const receipt={...started,state:'COMPLETED',completedAt:new Date().toISOString(),received};
    const path=join(attemptRoot,'COMPLETE.json');
    await retainCaseArtifact(path,encode(receipt));
    return {resultPath:path,result:receipt};
  } catch(error) {
    if(attemptRoot && started) {
      const failed={...started,state:'FAILED',failedAt:new Date().toISOString(),
        error:{name:error.name,code:error.code??null,message:String(error.message).slice(0,2000)}};
      try {selected.assertHeld();await retainCaseArtifact(join(attemptRoot,'FAILED.json'),encode(failed));}
      catch(retentionError) {throw new AggregateError([error,retentionError],'Receiving failed and its continuation failure receipt could not be retained.');}
    }
    throw error;
  } finally {await selected.close();}
}

if(process.argv[1] && resolve(process.argv[1])===ownPath) {
  const args=process.argv.slice(2);
  if(args.length!==4 || args[0]!=='--context' || !isAbsolute(args[1]) ||
    args[2]!=='--expected-context-sha256' || !HASH.test(args[3]))
    throw new TypeError('Usage: node oauth-receive-context.mjs --context /absolute/original/receiving-input/CONTEXT.json --expected-context-sha256 SHA256');
  const controller=new AbortController(),stop=()=>controller.abort(new Error('The retained Support receiving continuation stopped.'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    const {resultPath,result}=await continueOAuthSupportReceiving({contextPath:resolve(args[1]),expectedContextSha256:args[3],signal:controller.signal});
    process.stdout.write(JSON.stringify({state:result.state,resultPath,contextSha256:result.context.sha256,
      originalProducerStatus:result.originalProducerResult.status,
      incidents:result.received.cases.map(row=>row.incidentId),originalWatchersStarted:0})+'\n');
  } finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
