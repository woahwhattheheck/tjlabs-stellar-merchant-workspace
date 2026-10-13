// SPDX-License-Identifier: MIT
// Complete two-provider commissioning over the original SF82 release and SF88 buyer records.
import { constants } from 'node:fs';
import { open, mkdir, lstat, readdir, realpath, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeFacilitatorProfiles, reviewReleaseFacilitator, stageReleaseFacilitator, readFacilitatorReview }
  from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/release-facilitator.mjs';
import { inspectRelease, readReleaseState, activateRelease, runActiveRelease, releaseStatus }
  from '../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs';
import { lockPrivateDirectory }
  from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';
import { config as readBuyerConfig, execution as validateBuyerExecution }
  from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/config.mjs';
import { analyzeOne, aggregateOutcomes }
  from '../../stellar/scf-starforge-20261009/sf52-buyer-outcomes/outcomes.mjs';

export const SCHEMA = 'stellar-forge.facilitator-commissioning.v1';
const LIMIT = 64 * 1024 * 1024;
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const normalized = x => Array.isArray(x) ? x.map(normalized) : obj(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, normalized(x[k])])) : x;
const stable = x => JSON.stringify(normalized(x));
const digest = x => createHash('sha256').update(x).digest('hex');
const utf8 = raw => new TextDecoder('utf-8', { fatal: true }).decode(raw);
const encode = x => Buffer.from(JSON.stringify(x, null, 2) + '\n');
const fail = (code, message) => Object.assign(new Error(message), { code });
function need(ok, code, message) { if (!ok) throw fail(code, message); }
function line(x, name, max = 1000) {
  need(typeof x === 'string' && x.trim() && x.length <= max && !/[\x00-\x1f\x7f]/.test(x),
    'INVALID_SELECTION', name + ' must be nonempty single-line text.'); return x.trim();
}
function id(x, name = 'Identifier') {
  need(typeof x === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(x), 'INVALID_SELECTION', name + ' must be a stable lowercase identifier.');
  return x;
}
function uuid(x) {
  need(typeof x === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x),
    'OPERATION_ID_REQUIRED', 'Use one original UUID for this command.'); return x;
}
function exact(x, keys, required = []) {
  need(obj(x) && Object.keys(x).every(k => keys.includes(k)) && required.every(k => Object.hasOwn(x,k)),
    'INVALID_SELECTION', 'Use only the documented fields and include every required field.');
}
function absolute(x, base = process.cwd()) { return resolve(base, line(x, 'File path', 4096)); }
async function readBytes(path, maximum = LIMIT) {
  const h = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const s = await h.stat();
    need(s.isFile() && s.size <= maximum, 'SOURCE_FILE_INVALID', 'Select a complete ordinary file within the source limit.');
    const raw = await h.readFile();
    need(raw.length <= maximum, 'SOURCE_FILE_INVALID', 'Source file grew beyond its limit.');
    return raw;
  } finally { await h.close(); }
}
async function json(path, optional = false) {
  try { return JSON.parse(utf8(await readBytes(path))); }
  catch (e) { if (optional && e.code === 'ENOENT') return null; throw e; }
}
async function syncDir(path) {
  const h = await open(path, 'r'); try { await h.sync(); } finally { await h.close(); }
}
async function privateDir(path, create = false) {
  if (create) await mkdir(path, {mode:0o700}).catch(e => {if(e.code !== 'EEXIST') throw e;});
  const s = await lstat(path);
  need(s.isDirectory() && !s.isSymbolicLink() && await realpath(path) === path &&
    (process.platform === 'win32' || (s.mode & 0o077) === 0 && s.uid === process.getuid()),
    'PRIVATE_DIRECTORY_REQUIRED', 'Select an existing private directory owned by this operator.');
}
/** Atomic, create-only complete files. An exact repeated publication receives its original bytes. */
async function publish(path, raw) {
  try {
    const old = await readBytes(path);
    need(old.equals(raw), 'RETAINED_CONTENT_CONFLICT', 'Existing retained file has different content: ' + path);
    return;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const temp = join(dirname(path), '.commissioning-' + randomUUID() + '.tmp');
  const h = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
    (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    try { await h.writeFile(raw); await h.sync(); } finally { await h.close(); }
    try { await link(temp, path); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      need((await readBytes(path)).equals(raw), 'RETAINED_CONTENT_CONFLICT', 'Concurrent retained content differs.');
    }
    await syncDir(dirname(path));
  } finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
async function blob(root, file) {
  const raw = await readBytes(file), sha256 = digest(raw);
  await publish(join(root, 'blobs', sha256), raw);
  return {sha256, bytes:raw.length};
}
async function blobValue(root, ref) {
  need(obj(ref) && /^[a-f0-9]{64}$/.test(ref.sha256) && Number.isSafeInteger(ref.bytes),
    'SOURCE_IDENTITY_INVALID', 'Retain the complete source file identity.');
  const raw = await readBytes(join(root, 'blobs', ref.sha256));
  need(raw.length === ref.bytes && digest(raw) === ref.sha256, 'SOURCE_IDENTITY_CHANGED', 'Retained source bytes changed.');
  return raw;
}
async function attach(root, file, base) { return blob(root, absolute(file, base)); }
function providerOf(job, alias) {
  const p = job.providers.find(p => p.alias === alias);
  need(p, 'PROVIDER_NOT_SELECTED', 'Select one of this job’s two original providers.'); return p;
}
async function foundation(job, store) {
  const current = await inspectRelease(store, job.release.id);
  need(current.digest === job.release.digest && stable(current.source) === stable(job.release.source) &&
    stable(current.routes) === stable(job.release.routes), 'ORIGINAL_RELEASE_CHANGED',
    'Open the original retained seller source selected by this job.');
  return current;
}
async function lock(root) {
  await privateDir(root);
  return lockPrivateDirectory({directory:root, filename:'commissioning.lock', namespace:'facilitator-commissioning',
    busyCode:'COMMISSIONING_ALREADY_OWNED', unavailableCode:'COMMISSIONING_LOCK_UNAVAILABLE'});
}
async function initializeFolders(root) {
  await privateDir(root, true);
  for (const name of ['blobs','commands','results','reviews','runs','buyers']) await privateDir(join(root,name),true);
}

/** Prepare the useful operation once; no provider, seller listener or buyer is invoked. */
export async function createCommissioningJob({directory, selection, baseDirectory = process.cwd()} = {}) {
  const root = absolute(directory);
  exact(selection,['schema','id','title','store','releaseId','profilesFile','providers','service','requests'],
    ['schema','id','title','store','releaseId','profilesFile','providers','service','requests']);
  need(selection.schema === SCHEMA,'INVALID_SELECTION','Select the commissioning schema.');
  id(selection.id); line(selection.title,'Job title',240);
  await initializeFolders(root);
  const releaseLock = await lock(root);
  try {
    const requestHash = digest(stable(selection)), existing = await json(join(root,'job.json'),true);
    if(existing) {
      need(existing.selectionSha256 === requestHash,'JOB_ALREADY_SELECTED','This directory retains a different original selection.');
      return await inspectJob(root, existing);
    }
    const store = await realpath(absolute(selection.store,baseDirectory));
    const release = await inspectRelease(store,id(selection.releaseId,'Retained release'));
    const profileRaw = await readBytes(absolute(selection.profilesFile,baseDirectory),65536);
    const profiles = normalizeFacilitatorProfiles(JSON.parse(utf8(profileRaw)));
    need(Array.isArray(selection.providers) && selection.providers.length === 2,'TWO_PROVIDERS_REQUIRED','Select exactly two independently operated providers.');
    const providers = [];
    for(const p of selection.providers) {
      exact(p,['alias','releaseId','operatorId','operatorName','authorityReference','authorityFile','supportedResponseFile'],
        ['alias','releaseId','operatorId','operatorName','authorityReference','authorityFile']);
      const alias = id(p.alias), config = profiles.providers[alias];
      need(config,'PROVIDER_NOT_CONFIGURED','Select a host-declared facilitator alias.');
      providers.push({alias,releaseId:id(p.releaseId),operatorId:line(p.operatorId,'Operator identity',240),
        operatorName:line(p.operatorName,'Operator name',240),authorityReference:line(p.authorityReference,'Operator/source reference',2000),
        authority:await attach(root,p.authorityFile,baseDirectory),config,
        ...(p.supportedResponseFile ? {supportedResponse:await attach(root,p.supportedResponseFile,baseDirectory)} : {})});
    }
    for(const key of ['alias','releaseId','operatorId'])
      need(providers[0][key] !== providers[1][key],'PROVIDERS_NOT_DISTINCT','The two providers require distinct ' + key + ' values.');
    need(new URL(providers[0].config.url).origin !== new URL(providers[1].config.url).origin,
      'PROVIDERS_NOT_DISTINCT','Two aliases of one facilitator origin do not establish independent providers.');
    need(providers.every(p=>p.releaseId !== release.id),'RELEASE_ID_CONFLICT','Preserve the original source release ID.');
    const s = selection.service;
    exact(s,['purpose','sourceReference','sourceEdition','scopeFile','schemaFile','receiver','acceptanceFile'],
      ['purpose','sourceReference','sourceEdition','scopeFile','schemaFile','receiver','acceptanceFile']);
    exact(s.receiver,['name','system','operator'],['name','system','operator']);
    const service = {purpose:line(s.purpose,'Useful customer task',4000),
      sourceReference:line(s.sourceReference,'Source authority',2000),sourceEdition:line(s.sourceEdition,'Source edition',240),
      scope:await attach(root,s.scopeFile,baseDirectory),schema:await attach(root,s.schemaFile,baseDirectory),
      acceptance:await attach(root,s.acceptanceFile,baseDirectory),
      receiver:{name:line(s.receiver.name,'Receiver',240),system:line(s.receiver.system,'Receiving application',500),
        operator:line(s.receiver.operator,'Receiving operator',240)}};
    need(Array.isArray(selection.requests) && selection.requests.length >= 1 && selection.requests.length <= 1000,
      'COMPLETE_REQUEST_SET_REQUIRED','Select all requests/pages in the useful customer task.');
    const requests = [], seen = new Set();
    for(const r of selection.requests) {
      exact(r,['id','routeId','url','method','bodyFile','outputFile','mediaType'],['id','routeId','url','method','outputFile','mediaType']);
      id(r.id); need(!seen.has(r.id),'REQUEST_ID_DUPLICATE','Each page/request requires one stable ID.');seen.add(r.id);
      const route = release.routes.find(x=>x.id === r.routeId), u = new URL(r.url);
      need(route && r.method === route.method && u.origin === release.publicOrigin &&
        u.pathname === route.path && !u.username && !u.password && !u.hash,
        'REQUEST_OUTSIDE_RETAINED_ROUTE','Each exact request must select the retained origin, literal route and method.');
      need(!['GET','HEAD'].includes(r.method) || r.bodyFile === undefined,
        'REQUEST_BODY_INVALID','GET/HEAD requests have no body file.');
      requests.push({id:r.id,routeId:r.routeId,url:u.href,method:r.method,
        body:r.bodyFile ? await attach(root,r.bodyFile,baseDirectory) : null,
        output:await attach(root,r.outputFile,baseDirectory),mediaType:line(r.mediaType,'Output content type',240),
        requestContractSha256:route.requestContractSha256});
    }
    const job = {schema:SCHEMA,id:selection.id,title:selection.title,createdAt:new Date().toISOString(),
      selectionSha256:requestHash,store,release,profiles,providers,service,requests};
    await publish(join(root,'selection.json'),encode(selection));
    await publish(join(root,'job.json'),encode(job));
    return await inspectJob(root,job);
  } finally { await releaseLock(); }
}
async function records(root,folder) {
  const names = (await readdir(join(root,folder))).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).sort();
  return Promise.all(names.map(n=>json(join(root,folder,n))));
}
async function inspectJob(root,job) {
  for(const ref of [job.service.scope,job.service.schema,job.service.acceptance,
    ...job.providers.flatMap(p=>[p.authority,...(p.supportedResponse?[p.supportedResponse]:[])]),
    ...job.requests.flatMap(r=>[r.output,...(r.body?[r.body]:[])])]) await blobValue(root,ref);
  const results = await records(root,'results'), commands = await records(root,'commands');
  const runs = await Promise.all((await readdir(join(root,'runs'))).filter(n=>!n.startsWith('.')).sort().map(n=>json(join(root,'runs',n))));
  const done = new Set(results.map(r=>r.operationId));
  return {schema:SCHEMA,id:job.id,title:job.title,revision:results.length,selectionSha256:job.selectionSha256,
    release:job.release,providers:job.providers,service:job.service,requests:job.requests,
    results,runs,pending:commands.filter(c=>!done.has(c.operationId))};
}
function latestReceiving(results) {
  const all = results.filter(r=>r.action === 'receive').map(r=>r.result);
  const superseded = new Set(all.map(r=>r.supersedesOperationId).filter(Boolean));
  const current = all.filter(r=>!superseded.has(r.operationId));
  need(new Set(current.map(r=>r.intentId)).size === current.length, 'RECEIVING_HISTORY_CONFLICT',
    'One latest observation must remain for each original buyer attempt.');
  return current;
}
function projectReport(job,results) {
  const outcomes = latestReceiving(results);
  const report = aggregateOutcomes(outcomes.map(r=>r.evidence.observation));
  const providers = job.providers.map(p=>{
    const requests = job.requests.map(request=>{
      const rows = outcomes.filter(r=>r.provider === p.alias && r.requestId === request.id);
      const usable = rows.filter(r=>r.payment.independentlyVerifiedTransfer && r.payment.sellerReportedSuccess && r.requestBound && r.outputMatches &&
        r.receiving.decision === 'ACCEPTED');
      return {id:request.id,complete:usable.length > 0,acceptedIntents:usable.map(r=>r.intentId),
        attempts:rows.map(r=>({intentId:r.intentId,payment:r.payment.status,output:r.outputState,
          receiving:r.receiving.decision}))};
    });
    return {alias:p.alias,operatorId:p.operatorId,operatorName:p.operatorName,authorityReference:p.authorityReference,
      authority:p.authority,requests,complete:requests.every(r=>r.complete)};
  });
  return {schema:'stellar-forge.facilitator-commissioning-report.v1',jobId:job.id,
    selectionSha256:job.selectionSha256,sourceEdition:job.service.sourceEdition,
    service:job.service,providers,requests:job.requests,payment:report,
    state:providers.every(p=>p.complete)?'PAIRED_SERVICE_RECEIVED':'COMMISSIONING_IN_PROGRESS',
    usefulTasks:providers.filter(p=>p.complete).length,originalAttempts:outcomes.length,
    scope:'One complete selected service on two declared independent operators. Cohort totals retain their original customer and time-window rules.'};
}

/** One private owner, original command identities and native release operations. */
export async function openCommissioningJob({directory, store} = {}) {
  const root = absolute(directory), releaseLock = await lock(root);
  let closed = false, active = null, queue = Promise.resolve();
  try {
    const job = await json(join(root,'job.json'));
    need(job?.schema === SCHEMA,'JOB_REQUIRED','Open a prepared original commissioning job.');
    const selectedStore = store ? await realpath(absolute(store)) : job.store;
    await foundation(job,selectedStore);
    const run = action => {
      need(!closed,'JOB_CLOSED','Reopen the original commissioning job.');
      const result = queue.then(action);queue=result.catch(()=>{});return result;
    };
    const execute = (command, action) => run(async()=>{
      exact(command,['operationId','expectedRevision','action','payload'],['operationId','expectedRevision','action','payload']);
      uuid(command.operationId);need(command.action === action && obj(command.payload),'COMMAND_INVALID','Select the documented action and payload.');
      const file=join(root,'commands',command.operationId+'.json'), saved=await json(file,true);
      const commandHash=digest(stable(command));
      if(saved) need(saved.commandSha256 === commandHash,'COMMAND_CONFLICT','Reuse the exact original command, including its original revision.');
      const complete=await json(join(root,'results',command.operationId+'.json'),true);
      if(complete) {
        need(complete.commandSha256 === commandHash,'COMMAND_CONFLICT','The original command differs.');
        return {...complete,replayed:true};
      }
      if(!saved) {
        const current=await records(root,'results');
        need(command.expectedRevision === current.length,'REVISION_CONFLICT','Refresh the job revision before preparing a new command.');
        await publish(file,encode({...command,commandSha256:commandHash,createdAt:new Date().toISOString()}));
      }
      await foundation(job,selectedStore);
      let value;
      if(action === 'review') {
        exact(command.payload,['provider','reviewFile'],['provider']);
        const p=providerOf(job,command.payload.provider), path=join(root,'reviews',command.operationId+'.json');
        value=await json(path,true);
        if(!value) {
          if(command.payload.reviewFile) {
            const ref=await attach(root,command.payload.reviewFile,process.cwd());
            value=await readFacilitatorReview(join(root,'blobs',ref.sha256));
            need(value.source.releaseId===job.release.id && value.source.releaseDigest===job.release.digest &&
              value.proposed.id===p.releaseId && stable(value.source.source)===stable(job.release.source) &&
              stable(value.proposed.provider)===stable({alias:p.alias,...p.config}),
              'RETAINED_REVIEW_MISMATCH','Receive this original service’s exact retained review and configured provider.');
          } else value=await reviewReleaseFacilitator(selectedStore,{profiles:job.profiles,provider:p.alias,
            releaseId:job.release.id,id:p.releaseId,label:(job.title+' / '+p.alias).slice(0,240),
            ...(p.supportedResponse?{response:JSON.parse(utf8(await blobValue(root,p.supportedResponse)))}:{})});
          await publish(path,encode(value));
        }
      } else if(action === 'stage') {
        exact(command.payload,['reviewOperationId'],['reviewOperationId']);
        const selected=await json(join(root,'results',uuid(command.payload.reviewOperationId)+'.json'));
        need(selected?.action==='review','REVIEW_REQUIRED','Select a completed original review command.');
        const p=providerOf(job,selected.result.proposed.provider.alias);
        need(selected.result.source.releaseDigest===job.release.digest &&
          selected.result.proposed.id===p.releaseId,'REVIEW_SELECTION_CHANGED','Use this job’s retained provider review.');
        value=await stageReleaseFacilitator(selectedStore,{profiles:job.profiles,review:selected.result});
      } else if(action === 'select') {
        exact(command.payload,['provider','expectedGeneration','reason'],['provider','expectedGeneration','reason']);
        need(!active,'SELLER_RUNNING','Close this owner’s current seller before switching the selection.');
        const p=providerOf(job,command.payload.provider), current=await inspectRelease(selectedStore,p.releaseId);
        need(current.derivedFrom?.releaseDigest===job.release.digest &&
          current.runtime.facilitator===p.config.url,'STAGED_PROVIDER_REQUIRED','Stage the selected provider from this original service.');
        const reason='Commissioning '+job.id+' '+command.operationId+': '+line(command.payload.reason,'Selection reason',240);
        const priorPath=join(root,'runs',command.operationId+'.selection.json');
        let before=await json(priorPath,true);
        if(!before) {
          before=await readReleaseState(selectedStore);
          need(before.generation===command.payload.expectedGeneration,'RELEASE_CONFLICT','Refresh the original selection generation.');
          await publish(priorPath,encode(before));
        }
        const state=await readReleaseState(selectedStore);
        const original=state.history.find(e=>e.reason===reason && e.to===p.releaseId &&
          e.generation===command.payload.expectedGeneration+1);
        if(original) value={changed:true,state,originalSelection:original,recovered:true};
        else if(before.active===p.releaseId) value={changed:false,state:before,recovered:true};
        else value=await activateRelease(selectedStore,p.releaseId,{expectedGeneration:command.payload.expectedGeneration,reason});
      } else if(action === 'receive-run') {
        exact(command.payload,['runOperationId','nativeInstanceId'],['runOperationId','nativeInstanceId']);
        const runId=uuid(command.payload.runOperationId), intent=await json(join(root,'runs',runId+'.json'));
        need(intent?.sourceDigest===job.release.digest,'ORIGINAL_RUN_REQUIRED','Select the retained original run intent.');
        const status=await releaseStatus(selectedStore), observation=status.runtime.observed;
        need(observation?.instanceId===command.payload.nativeInstanceId &&
          observation.releaseId===intent.releaseId && observation.releaseDigest===intent.releaseDigest &&
          observation.selectionGeneration===intent.generation && observation.listener &&
          observation.readyAt && Date.parse(observation.startedAt)>=Date.parse(intent.selectedAt),
          'NATIVE_RUN_MISMATCH','Select the original SF82 instance that actually reached readiness for this retained source and generation.');
        const path=join(root,'runs',runId+'.started.json'), prior=await json(path,true);
        if(prior) need(prior.nativeObservation.instanceId===observation.instanceId,'NATIVE_RUN_MISMATCH','The run already retains another original instance.');
        else await publish(path,encode({...intent,startedAt:observation.readyAt,nativeObservation:observation,
          url:observation.listener,mode:observation.mode,receivedByOperationId:command.operationId}));
        if(observation.endedAt) {
          const ended=join(root,'runs',runId+'.stopped.json'), retained=await json(ended,true);
          if(!retained)await publish(ended,encode({operationId:runId,endedAt:observation.endedAt,
            nativeResult:observation,receivedByOperationId:command.operationId}));
        }
        value={runOperationId:runId,nativeInstanceId:observation.instanceId,nativeState:status.runtime.state,
          startedAt:observation.readyAt,endedAt:observation.endedAt??null};
      } else if(action === 'buyer-plan') {
        value=await prepareBuyerPlan(root,job,selectedStore,command);
      } else if(action === 'receive') {
        value=await receiveResult(root,job,selectedStore,command,await records(root,'results'));
      } else throw fail('ACTION_UNSUPPORTED','Choose review, stage, select, receive-run, buyer-plan or receive.');
      const result={schema:'stellar-forge.facilitator-commissioning-command.v1',
        operationId:command.operationId,commandSha256:commandHash,action,
        completedAt:new Date().toISOString(),result:value};
      await publish(join(root,'results',command.operationId+'.json'),encode(result));
      return result;
    });
    return {
      directory:root,
      inspect:()=>run(async()=>({...await inspectJob(root,job),originalSelection:await readReleaseState(selectedStore)})),
      report:()=>run(async()=>projectReport(job,await records(root,'results'))),
      execute:command=>execute(command,command?.action),
      async start({operationId,provider,expectedGeneration}={}) {
        return run(async()=>{
          uuid(operationId); const p=providerOf(job,provider);
          need(!active,'SELLER_RUNNING','This owner already has an original seller.');
          const path=join(root,'runs',operationId+'.json'), old=await json(path,true);
          need(!old,'RUN_ALREADY_RECORDED','Inspect this original run and its native release status before selecting another run.');
          await foundation(job,selectedStore);
          const state=await readReleaseState(selectedStore), release=await inspectRelease(selectedStore,p.releaseId);
          need(state.active===p.releaseId && state.generation===expectedGeneration &&
            release.derivedFrom?.releaseDigest===job.release.digest,'SELECTION_CHANGED','Run the exact selected staged provider and generation.');
          const intent={schema:'stellar-forge.facilitator-commissioning-run.v1',operationId,provider,
            releaseId:p.releaseId,releaseDigest:release.digest,sourceDigest:job.release.digest,
            generation:state.generation,selectedAt:new Date().toISOString()};
          await publish(path,encode(intent));
          let session;
          try {
            session=await runActiveRelease(selectedStore,{expectedGeneration,handleSignals:true});
            need(session.observation?.readyAt && session.observation?.startedAt,
              'NATIVE_READINESS_REQUIRED','The original seller must retain its actual startup and readiness times.');
            const started={...intent,startedAt:session.observation.readyAt,nativeObservation:session.observation,url:session.url,mode:session.mode};
            await publish(join(root,'runs',operationId+'.started.json'),encode(started));
            active={operationId,session};
            const completion=session.completion.then(async result=>{
              await publish(join(root,'runs',operationId+'.stopped.json'),encode({operationId,
                endedAt:new Date().toISOString(),nativeResult:result??null}));
            }).catch(async error=>{
              await publish(join(root,'runs',operationId+'.stopped.json'),encode({operationId,
                endedAt:new Date().toISOString(),error:{code:error.code??'SELLER_STOP_FAILED',message:String(error.message)}}));
            }).finally(()=>{if(active?.operationId===operationId)active=null;});
            // Retain a handled lifetime while the caller owns the original session.
            completion.catch(()=>{});
            active.completion=completion;
            return {...started,completion,close:async()=>{await session.close();await completion;}};
          } catch(error) {
            if(session) await session.close();
            await publish(join(root,'runs',operationId+'.failed.json'),encode({operationId,at:new Date().toISOString(),
              code:error.code??'SELLER_START_FAILED',message:String(error.message)}));
            throw error;
          }
        });
      },
      export:out=>run(()=>exportJob(root,job,absolute(out))),
      async close() {
        if(closed)return;closed=true;
        await queue;
        try { if(active) {const owner=active;await owner.session.close();await owner.completion;} }
        finally { await releaseLock(); }
      },
    };
  } catch(error) { await releaseLock();throw error; }
}
async function prepareBuyerPlan(root,job,store,command) {
  const p=command.payload;
  exact(p,['provider','templateFile','outputDirectory','requests'],['provider','templateFile','outputDirectory','requests']);
  const provider=providerOf(job,p.provider), release=await inspectRelease(store,provider.releaseId);
  need(release.derivedFrom?.releaseDigest===job.release.digest,'STAGED_PROVIDER_REQUIRED','Stage this provider from the original service before preparing its buyer requests.');
  const templatePath=absolute(p.templateFile), template=await readBuyerConfig(templatePath);
  validateBuyerExecution(template);
  need(!template.operation.ticketFile && !template.operation.orderReference &&
    Object.keys(template.operation.headers??{}).length===0,'EXISTING_OPERATION_HANDOFF_REQUIRED',
    'An order, private ticket or custom-header operation keeps its original merchant handoff; select a plain complete-resource buyer template here.');
  const destination=await realpath(absolute(p.outputDirectory));await privateDir(destination);
  need(Array.isArray(p.requests) && p.requests.length===job.requests.length,
    'COMPLETE_REQUEST_SET_REQUIRED','Choose one original buyer intent and native payment option for every agreed request/page.');
  const seen=new Set(),intents=new Set(),selected=[];
  for(const choice of p.requests) {
    exact(choice,['requestId','intentId','paymentOption'],['requestId','intentId','paymentOption']);
    const request=job.requests.find(r=>r.id===choice.requestId);
    need(request && !seen.has(request.id),'REQUEST_SELECTION_INVALID','Select each agreed request once.');seen.add(request.id);
    need(typeof choice.intentId==='string' && /^[A-Za-z0-9._:-]{1,128}$/.test(choice.intentId) &&
      !intents.has(choice.intentId),'BUYER_INTENT_INVALID','Use a distinct stable original buyer intent for each request.');intents.add(choice.intentId);
    const alternatives=release.facilitatorReview.nativePayments.find(r=>r.routeId===request.routeId)?.nativePayment??[];
    const payment=alternatives[choice.paymentOption];
    need(Number.isSafeInteger(choice.paymentOption) && choice.paymentOption>=0 && payment,
      'NATIVE_PAYMENT_OPTION_REQUIRED','Select an exact displayed native payment alternative.');
    const allowed=template.operation.expect;
    need(['scheme','network','asset','payTo'].every(k=>allowed[k]===payment[k]) &&
      BigInt(allowed.maxAtomic)>=BigInt(payment.amount) &&
      (!allowed.maxTimeoutSeconds || payment.maxTimeoutSeconds<=allowed.maxTimeoutSeconds) &&
      (allowed.paymentFlow??'authorization')===(payment.extra?.paymentFlow??'authorization'),
      'BUYER_TEMPLATE_TERMS_MISMATCH','The selected native alternative must fit the original buyer template’s explicit terms and cap.');
    // SF31 defaults to authorization and requires one unique matching offered
    // requirement. Narrow the existing authority to this displayed native choice.
    const expect={scheme:payment.scheme,network:payment.network,asset:payment.asset,payTo:payment.payTo,
      maxAtomic:payment.amount,maxTimeoutSeconds:payment.maxTimeoutSeconds,
      paymentFlow:payment.extra?.paymentFlow??'authorization'};
    const matches=alternatives.filter(t=>t.scheme===expect.scheme && t.network===expect.network &&
      t.asset===expect.asset && t.payTo===expect.payTo && BigInt(t.amount)<=BigInt(expect.maxAtomic) &&
      t.maxTimeoutSeconds<=expect.maxTimeoutSeconds && (t.extra?.paymentFlow??'authorization')===expect.paymentFlow);
    need(matches.length===1 && stable(matches[0])===stable(payment),'NATIVE_PAYMENT_CHOICE_AMBIGUOUS',
      'The original buyer must select exactly this native alternative under its existing amount, timeout and timing predicates.');
    const ownName=command.operationId+'-'+request.id+'.json';
    for(const name of await readdir(join(root,'buyers'))) {
      if(!name.endsWith('.json') || name===ownName)continue;
      const previous=await json(join(root,'buyers',name));
      need(previous.operation?.intentId!==choice.intentId,'BUYER_INTENT_ALREADY_PREPARED',
        'A previous provider/request already owns that original buyer intent.');
    }
    selected.push({request,choice,payment,expect});
  }
  const bindingPath=join(root,'reviews',command.operationId+'.buyer.json');
  const binding={template:await attach(root,templatePath,process.cwd()),provider:provider.alias,
    releaseDigest:release.digest,outputDirectory:destination,requests:p.requests};
  await publish(bindingPath,encode(binding));
  const files=[], totals=new Map();
  for(const {request,choice,payment,expect} of selected) {
    const prefix=command.operationId+'-'+request.id;
    const bodyFile=request.body?join(root,'buyers',prefix+'.body'):null;
    if(bodyFile)await publish(bodyFile,await blobValue(root,request.body));
    const output=join(destination,prefix+'.response');
    const config={...template,operation:{intentId:choice.intentId,url:request.url,method:request.method,
      expect,
      ...(bodyFile?{bodyFile,bodyBytes:request.body.bytes,bodySha256:request.body.sha256}:{})},
      captureBody:false,responseFile:{destination:output,maxBytes:Math.max(1,request.output.bytes),
        expectedBytes:request.output.bytes,expectedSha256:request.output.sha256,expectedContentType:request.mediaType,
        timeoutMs:template.responseFile?.timeoutMs??30000}};
    delete config.preparedFrom;
    validateBuyerExecution(config);
    const configFile=join(root,'buyers',prefix+'.json'),raw=encode(config);
    await publish(configFile,raw);
    files.push({requestId:request.id,intentId:choice.intentId,paymentOption:choice.paymentOption,
      nativePayment:payment,configFile,configSha256:digest(raw),output,expectedOutput:request.output});
    const key=stable({network:payment.network,asset:payment.asset});
    totals.set(key,(totals.get(key)??0n)+BigInt(payment.amount));
  }
  return {provider:provider.alias,releaseDigest:release.digest,files,
    quotedTaskAtomicByAsset:[...totals].map(([key,amount])=>({...JSON.parse(key),atomicTotal:amount.toString()})),
    execution:'Use each exact config with the original SF88 review and execute commands in the selected provider run. Normal approval and spending limits remain with the original buyer.'};
}
async function receiveResult(root,job,store,command,results) {
  const p=command.payload;
  exact(p,['provider','requestId','runOperationId','summaryFile','evidenceFile','outputFile','receiving','supersedesOperationId'],
    ['provider','requestId','runOperationId','summaryFile','evidenceFile','receiving']);
  const provider=providerOf(job,p.provider), request=job.requests.find(r=>r.id===p.requestId);
  need(request,'REQUEST_NOT_SELECTED','Select an original complete-task request.');
  const run=await json(join(root,'runs',uuid(p.runOperationId)+'.started.json'));
  need(run?.provider===provider.alias && run.sourceDigest===job.release.digest &&
    run.releaseId===provider.releaseId,'RUN_SELECTION_MISMATCH','Select this job’s actual original provider run.');
  const [summaryRef,evidenceRef] = await Promise.all([p.summaryFile,p.evidenceFile].map(f=>attach(root,f,process.cwd())));
  const summary=JSON.parse(utf8(await blobValue(root,summaryRef))), evidence=JSON.parse(utf8(await blobValue(root,evidenceRef)));
  need(summary.mode==='ORIGINAL_OPERATOR_APPROVED_BUYER_ATTEMPT' &&
    evidence.schema==='scf82.checkout-evidence.v1' && summary.intentId===evidence.intentId &&
    evidence.observation?.intentId===evidence.intentId && evidence.observation.observedAt===evidence.observedAt,'ORIGINAL_BUYER_RESULT_REQUIRED','Receive the complete original SF88 summary and matching SF82 evidence.');
  const payment=analyzeOne(evidence.observation), terms=evidence.observation.buyer.requirement;
  const originalRequest=evidence.reconciliation?.status==='AVAILABLE'
    ? evidence.reconciliation.record?.operatorReservation?.approved_request : null;
  const requestBound=Boolean(originalRequest && originalRequest.request_id===evidence.intentId &&
    (!terms || originalRequest.scheme===terms.scheme && originalRequest.network===terms.network &&
      originalRequest.asset===terms.asset && originalRequest.pay_to===terms.payTo && originalRequest.max_amount===terms.amount) &&
    originalRequest.resource===request.url && originalRequest.method===request.method &&
    originalRequest.body_present===Boolean(request.body) &&
    originalRequest.body_bytes===(request.body?.bytes??0) &&
    originalRequest.body_sha256===(request.body?.sha256??digest(Buffer.alloc(0))));
  need(!payment.independentlyVerifiedTransfer || requestBound,'ORIGINAL_REQUEST_MISMATCH',
    'A qualifying transfer must retain the original SF81-approved URL, method and exact request body.');
  need(!summary.status || summary.status===evidence.observation.buyer.status,
    'BUYER_RESULT_MISMATCH','The original buyer summary and observation have different states.');
  need(!payment.sellerReportedSuccess || summary.httpStatus===evidence.observation.buyer.httpStatus &&
    summary.sellerReportedSettlement===evidence.observation.buyer.settlement,
    'BUYER_RESULT_MISMATCH','The original summary and observed HTTP/settlement boundary differ.');
  const stopped=await json(join(root,'runs',p.runOperationId+'.stopped.json'),true);
  need(Date.parse(evidence.observedAt)>=Date.parse(run.startedAt) &&
    (!stopped || Date.parse(evidence.observedAt)<=Date.parse(stopped.endedAt)),
    'BUYER_OUTSIDE_PROVIDER_RUN','Use the original buyer attempt observed during this actual selected provider run.');
  if(terms) {
    const release=await inspectRelease(store,provider.releaseId);
    const alternatives=release.facilitatorReview.nativePayments.find(r=>r.routeId===request.routeId)?.nativePayment??[];
    need(alternatives.some(t=>['scheme','network','asset','payTo','amount'].every(k=>t[k]===terms[k])),
      'PAYMENT_TERMS_MISMATCH','The observed transfer belongs to this provider release’s exact native payment alternative.');
  }
  const old=results.filter(x=>x.action==='receive').map(x=>x.result).filter(x=>x.intentId===evidence.intentId);
  if(old.length) {
    const latest=old.find(x=>!old.some(y=>y.supersedesOperationId===x.operationId));
    need(p.supersedesOperationId===latest.operationId && latest.provider===p.provider &&
      latest.requestId===p.requestId && latest.runOperationId===p.runOperationId &&
      (!latest.originalRequest || stable(latest.originalRequest)===stable(originalRequest)),'ORIGINAL_ATTEMPT_CONFLICT',
      'A later observation must explicitly continue the same latest original buyer attempt and request.');
  } else need(!p.supersedesOperationId,'ORIGINAL_ATTEMPT_NOT_FOUND','A first observation has no superseded receiving operation.');
  const output=p.outputFile?await attach(root,p.outputFile,process.cwd()):null;
  if(output) need(summary.responseFile?.status==='SAVED' &&
    summary.responseFile.sha256===output.sha256 && summary.responseFile.bytes===output.bytes,
    'BUYER_OUTPUT_MISMATCH','Receive the complete bytes identified by the original buyer’s saved response.');
  const outputMatches=Boolean(output && output.sha256===request.output.sha256 && output.bytes===request.output.bytes);
  exact(p.receiving,['operator','decision','note','receivedAt'],['operator','decision','note','receivedAt']);
  need(['ACCEPTED','CHANGES_REQUIRED','INCOMPLETE'].includes(p.receiving.decision) &&
    typeof p.receiving.receivedAt==='string' && new Date(p.receiving.receivedAt).toISOString()===p.receiving.receivedAt,
    'RECEIVING_DECISION_INVALID','Record the actual receiving time and decision.');
  need(p.receiving.decision!=='ACCEPTED' || outputMatches,'OUTPUT_NOT_COMPLETE','Accept only the complete original useful output.');
  const result={operationId:command.operationId,intentId:evidence.intentId,provider:p.provider,requestId:p.requestId,
    runOperationId:p.runOperationId,attemptObservedAt:evidence.observedAt,
    recoveredAt:evidence.recovery?.recoveredAt??null,summary:summaryRef,evidenceFile:evidenceRef,originalRequest,requestBound,
    evidence,payment,output,outputMatches,outputState:outputMatches?'EXACT_USEFUL_OUTPUT':output?'DIFFERENT_OUTPUT':'OUTPUT_INCOMPLETE',
    receiving:{operator:line(p.receiving.operator,'Receiving operator',240),decision:p.receiving.decision,
      note:line(p.receiving.note,'Receiving decision',4000),receivedAt:p.receiving.receivedAt},
    supersedesOperationId:p.supersedesOperationId??null};
  // Reuse the original aggregate's duplicate-intent/transfer checks across the latest observations.
  const latest=new Map(latestReceiving(results).map(x=>[x.intentId,x]));
  latest.set(result.intentId,result);
  aggregateOutcomes([...latest.values()].map(x=>x.evidence.observation));
  return result;
}
async function exportJob(root,job,out) {
  need(out!==root && !out.startsWith(root+'/'),'EXPORT_DESTINATION_INVALID','Choose a separate private receiving directory.');
  await privateDir(out,true);
  const rows=[];
  for(const folder of ['blobs','commands','results','reviews','runs','buyers']) {
    await privateDir(join(out,folder),true);
    for(const name of (await readdir(join(root,folder))).sort()) {
      if(name.startsWith('.'))continue;
      const raw=await readBytes(join(root,folder,name));await publish(join(out,folder,name),raw);
      rows.push({path:folder+'/'+name,bytes:raw.length,sha256:digest(raw)});
    }
  }
  for(const name of ['job.json','selection.json']) {
    const raw=await readBytes(join(root,name));await publish(join(out,name),raw);
    rows.push({path:name,bytes:raw.length,sha256:digest(raw)});
  }
  const manifest={schema:'stellar-forge.facilitator-commissioning-transfer.v1',jobId:job.id,
    selectionSha256:job.selectionSha256,files:rows};
  await publish(join(out,'TRANSFER.json'),encode(manifest));
  return {directory:out,manifestSha256:digest(encode(manifest)),files:rows.length,
    receiving:'Verify TRANSFER.json and reopen with the original received SF82 store selected explicitly.'};
}
export async function inspectCommissioningTransfer(directory) {
  const root=absolute(directory);await privateDir(root);
  const m=await json(join(root,'TRANSFER.json'));
  need(m?.schema==='stellar-forge.facilitator-commissioning-transfer.v1' && Array.isArray(m.files),
    'TRANSFER_INVALID','Select a complete commissioning transfer.');
  const seen=new Set();
  for(const f of m.files) {
    need(typeof f.path==='string' && /^(?:blobs\/[a-f0-9]{64}|(?:commands|results)\/[a-f0-9-]{36}\.json|reviews\/[a-f0-9-]{36}(?:\.buyer)?\.json|runs\/[a-f0-9-]{36}(?:\.(?:selection|started|stopped|failed))?\.json|buyers\/[a-f0-9-]{36}-[a-z0-9_-]{1,64}\.(?:json|body)|job\.json|selection\.json)$/.test(f.path) &&
      !seen.has(f.path),'TRANSFER_INVALID','The transfer file mapping differs.');seen.add(f.path);
    const raw=await readBytes(join(root,f.path));
    need(raw.length===f.bytes && digest(raw)===f.sha256,'TRANSFER_CHANGED','A retained transfer member changed: '+f.path);
  }
  need(seen.has('job.json') && seen.has('selection.json'),'TRANSFER_INVALID','Receive the original job and selection.');
  const job=await json(join(root,'job.json'));
  need(job.id===m.jobId && job.selectionSha256===m.selectionSha256,'TRANSFER_CHANGED','The retained job identity differs.');
  for(const folder of ['blobs','commands','results','reviews','runs','buyers']) {
    for(const name of await readdir(join(root,folder))) {
      if(name.startsWith('.'))continue;
      need(seen.has(folder+'/'+name),'TRANSFER_UNLISTED_FILE','An unlisted file is present in the received job.');
    }
  }
  await inspectJob(root,job);return m;
}
