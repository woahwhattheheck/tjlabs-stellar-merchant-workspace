#!/usr/bin/env node
// MIT. Operate the complete selected prepaid product through its original installer and workspaces.
import {mkdir, readFile, writeFile, open, lstat, realpath, symlink, readdir, rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const SOURCE = '6e4a2bebf22cf809587406087efbce9c11d4e449';
const BASE = 'stellar/scf-starforge-20261009/';
const SCHEMA = 'stellar-forge.prepaid-api-installed-operation.v1';
const JSON_LIMIT = 4 * 1024 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const canonical = value => JSON.stringify(Array.isArray(value) ? value.map(sorted) : sorted(value));
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
function need(value, code) {if (!value) throw Object.assign(new Error(code), {code});}
function code(error) {return /^[A-Z][A-Z0-9_]{1,140}$/.test(error?.code ?? '') ? error.code : 'PREPAID_INSTALLED_OPERATION_FAILED';}
function options(args) {
  const out = {};
  while (args.length) {
    const flag = args.shift();
    if (flag === '--resume' || flag === '--source-online') {
      const key = flag.slice(2); need(out[key] === undefined, 'REPEATED_OPTION'); out[key] = true; continue;
    }
    need(['--repo','--directory','--request','--dependencies','--python','--npm-cache'].includes(flag) &&
      out[flag.slice(2)] === undefined && args.length, 'INSTALLED_OPERATION_OPTIONS_REQUIRED');
    out[flag.slice(2)] = args.shift();
  }
  for (const key of ['repo','directory','request']) need(typeof out[key] === 'string' && resolve(out[key]) === out[key],
    'INSTALLED_OPERATION_ABSOLUTE_PATH_REQUIRED');
  for (const key of ['dependencies','npm-cache'])
    if (out[key] !== undefined) need(resolve(out[key]) === out[key], 'INSTALLED_OPERATION_ABSOLUTE_PATH_REQUIRED');
  return out;
}
async function exists(path) {try {await lstat(path); return true;} catch (error) {if (error.code === 'ENOENT') return false; throw error;}}
async function privateDir(path, create = false) {
  if (create) await mkdir(path, {recursive: true, mode: 0o700});
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
    (!process.getuid || info.uid === process.getuid()) && await realpath(path) === path,
    'INSTALLED_OPERATION_PRIVATE_DIRECTORY_REQUIRED');
  return path;
}
async function bytes(path, max = JSON_LIMIT) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    need(before.isFile() && before.size <= max, 'INSTALLED_OPERATION_FILE_REQUIRED');
    const body = await file.readFile(), after = await file.stat();
    need(body.length <= max && body.length === before.size && before.dev === after.dev &&
      before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs, 'INSTALLED_OPERATION_FILE_CHANGED');
    return body;
  } finally {await file.close();}
}
const json = async path => JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await bytes(path)));

async function child(command, args, {cwd, environment = process.env, signal, maximum = JSON_LIMIT} = {}) {
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    const task = spawn(command, args, {cwd, env: environment, shell: false, stdio: ['ignore','pipe','pipe']});
    const chunks = []; let count = 0, stderr = '', failure = null, killTimer = null;
    const stop = () => {
      if (task.exitCode !== null || task.signalCode !== null) return;
      task.kill('SIGTERM');
      killTimer ??= setTimeout(() => {
        if (task.exitCode === null && task.signalCode === null) task.kill('SIGKILL');
      }, 5000);
    };
    signal?.addEventListener('abort', stop, {once: true});
    if (signal?.aborted) stop();
    task.stdout.on('data', block => {
      count += block.length;
      if (count > maximum) {failure ??= Object.assign(new Error('CHILD_OUTPUT_TOO_LARGE'), {code:'CHILD_OUTPUT_TOO_LARGE'}); stop();}
      else chunks.push(block);
    });
    task.stderr.on('data', block => {if (stderr.length < 32768) stderr += block;});
    task.once('error', error => {failure = error;});
    task.once('close', (exitCode, exitSignal) => {
      signal?.removeEventListener('abort', stop);
      if (killTimer) clearTimeout(killTimer);
      if (failure) return reject(failure);
      if (signal?.aborted) return reject(signal.reason);
      if (exitCode !== 0) {
        let reported;
        try {reported = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {}
        const error = Object.assign(new Error('INSTALLED_CHILD_FAILED'), {code: 'INSTALLED_CHILD_FAILED',
          exitCode, exitSignal, childCode: reported?.error ?? null});
        return reject(error);
      }
      accept(Buffer.concat(chunks));
    });
  });
}
async function response(url, token, path, {jsonResult = false} = {}) {
  const incoming = await fetch(new URL(path, url), {headers: {Authorization:'Bearer ' + token},
    redirect: 'error', signal: AbortSignal.timeout(30000)});
  need(incoming.status === 200, 'INSTALLED_BROWSER_RESPONSE_REQUIRED');
  const result = Buffer.from(await incoming.arrayBuffer());
  need(result.length <= JSON_LIMIT, 'INSTALLED_BROWSER_RESPONSE_TOO_LARGE');
  return jsonResult ? JSON.parse(result) : result;
}

export async function operateInstalledPrepaidProduct(input) {
  const opts = options([...input]);
  const repository = await realpath(opts.repo);
  const ref = (await child('git', ['--no-replace-objects','rev-parse','--verify','--end-of-options', SOURCE + '^{commit}'],
    {cwd: repository, maximum: 4096})).toString().trim();
  need(ref === SOURCE, 'INSTALLED_ORIGINAL_SOURCE_COMMIT_REQUIRED');
  const head = (await child('git', ['--no-replace-objects','rev-parse','--verify','HEAD'],
    {cwd:repository,maximum:4096})).toString().trim();
  const changed = await child('git', ['--no-replace-objects','status','--porcelain','--untracked-files=no'],
    {cwd:repository,maximum:65536});
  need(head === SOURCE && changed.length === 0, 'INSTALLED_CLEAN_SELECTED_CHECKOUT_REQUIRED');
  need(opts.directory !== repository && !opts.directory.startsWith(repository + '/') &&
    !repository.startsWith(opts.directory + '/'), 'INSTALLED_SOURCE_AND_STATE_MUST_DIFFER');
  const imported = path => import(pathToFileURL(join(repository, path)).href);
  const originalStore = await imported(BASE + 'sf88-operator-buyer-cli/node/store.mjs');
  const {acquireStateLease} = await imported(BASE + 'merchant-fleet-gateway/state-lease.mjs');
  const {buildDistribution} = await imported(BASE + 'distribution/build.mjs');
  const installer = await imported(BASE + 'distribution/runtime-install.mjs');
  const directory = await privateDir(opts.directory, true);
  const requestBytes = await bytes(opts.request, 65536), starterRequest = JSON.parse(requestBytes);
  const requestSha256 = sha(requestBytes);
  const lease = await acquireStateLease(directory);
  const recordFile = join(directory, 'operation.json');
  const runtimePath = index => join(directory, index === 0 ? 'runtime' :
    'runtime-recovery-' + String(index).padStart(3, '0'));
  let record, merchant = null, customer = null, rawClose = null, rawClosed = false;
  const controller = new AbortController();
  let running = true, retryClose = null;
  const owners = [];
  const signal = () => {
    if (running) controller.abort(Object.assign(new Error('INSTALLED_OPERATION_INTERRUPTED'), {code:'INSTALLED_OPERATION_INTERRUPTED'}));
    else retryClose?.();
  };
  process.on('SIGINT', signal); process.on('SIGTERM', signal);
  const check = () => {controller.signal.throwIfAborted(); lease.assertHeld();};
  const retainOwner = owner => {if (owner && typeof owner.close === 'function' && !owners.some(item => item.owner === owner))
    owners.push({owner, closed:false}); return owner;};
  const adoptFailureOwner = error => retainOwner(error?.merchantWorkspaceRecovery ?? error?.customerWorkspaceRecovery ?? error?.recovery);
  const save = async value => {
    lease.assertHeld();
    await originalStore.writeJson(recordFile, value, {exclusive: !(await exists(recordFile))});
    record = value;
  };
  const validateRecord = actual => {
    need(actual?.schema === SCHEMA && actual.sourceCommit === SOURCE && actual.requestSha256 === requestSha256 &&
      actual.directory === directory && (!record || actual.id === record.id) &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(actual.id ?? '') &&
      ['RUNNING','ATTENTION','COMPLETE'].includes(actual.status) && Array.isArray(actual.phases) &&
      actual.phases.length <= 8 && new Set(actual.phases.map(item=>item.name)).size === actual.phases.length,
      'INSTALLED_OPERATION_CHANGED');
    if (actual.runtimeAttempts !== undefined) {
      need(Array.isArray(actual.runtimeAttempts) && actual.runtimeAttempts.length > 0 &&
        actual.runtimeAttempts.length <= 100 && actual.runtimeAttempts.every((attempt, index, all) =>
          attempt.index === index && attempt.directory === runtimePath(index) &&
          attempt.from === (index === 0 ? null : all[index - 1].directory) &&
          (index === 0 ? attempt.fromPreparationSha256 === null &&
            attempt.fromPreparationState === null && attempt.fromPreparationBytes === null :
            ['COMPLETE','ABSENT','EMPTY','INVALID_JSON'].includes(attempt.fromPreparationState) &&
            Number.isSafeInteger(attempt.fromPreparationBytes) && attempt.fromPreparationBytes >= 0 &&
            attempt.fromPreparationBytes <= JSON_LIMIT &&
            (attempt.fromPreparationState === 'ABSENT' ?
              attempt.fromPreparationSha256 === null && attempt.fromPreparationBytes === 0 :
              /^[a-f0-9]{64}$/.test(attempt.fromPreparationSha256 ?? '')) &&
            (attempt.fromPreparationState !== 'EMPTY' || attempt.fromPreparationBytes === 0)) &&
          /^[a-f0-9]{64}$/.test(attempt.archiveSha256 ?? '') &&
          attempt.archiveSha256 === all[0].archiveSha256 &&
          typeof attempt.selectedAt === 'string' && Number.isFinite(Date.parse(attempt.selectedAt))),
        'INSTALLED_RUNTIME_ATTEMPT_CHANGED');
    }
    return actual;
  };
  const reload = async () => {record = validateRecord(await json(recordFile)); return record;};
  const initialRecord = async () => {
    const temporary = /^\.write-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    const retained = /^\.interrupted-write-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    const names = await readdir(directory);
    need(names.every(name=>name==='lease.lock'||temporary.test(name)||retained.test(name)),
      'INSTALLED_NEW_PRIVATE_OPERATION_REQUIRED');
    const complete = [], incomplete = [];
    for (const name of names.filter(name=>temporary.test(name)).sort()) {
      const path=join(directory,name),info=await lstat(path);
      need(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&!(info.mode&0o077)&&
        (!process.getuid||info.uid===process.getuid()), 'INSTALLED_INITIAL_RECORD_CHANGED');
      const body=await bytes(path);
      let value;try{value=JSON.parse(body);}catch{incomplete.push(name);continue;}
      validateRecord(value);
      need(originalStore.jsonBytes(value).equals(body),'INSTALLED_INITIAL_RECORD_CHANGED');
      complete.push({name,value,body});
    }
    need(complete.every(item=>item.body.equals(complete[0].body)),
      'INSTALLED_INITIAL_RECORD_AMBIGUOUS');
    const value=complete[0]?.value??{schema:SCHEMA,id:randomUUID(),directory,sourceCommit:SOURCE,
      requestSha256,createdAt:now(),updatedAt:now(),status:'RUNNING',phases:[]};
    await save(value);
    for(const name of [...complete.map(item=>item.name),...incomplete]){
      check();const target=join(directory,name.replace('.write-','.interrupted-write-'));
      need(!(await exists(target)),'INSTALLED_INITIAL_RECORD_HISTORY_CHANGED');
      await rename(join(directory,name),target);
    }
    await originalStore.syncDirectory(directory);
    return reload();
  };
  const phase = async (name, result) => {
    const actual = await reload(), previous = actual.phases.find(item => item.name === name);
    if (previous) {
      need(canonical(previous.result) === canonical(result), 'INSTALLED_OPERATION_PHASE_CHANGED');
      return previous;
    }
    const item = {name, completedAt:now(), result};
    await save({...actual, phases:[...actual.phases,item], updatedAt:now()});
    process.stdout.write(JSON.stringify({phase:name,status:'COMPLETE',operationId:record.id}) + '\n');
    return item;
  };
  const closeOwners = async () => {
    for (const item of [...owners].reverse()) if (!item.closed) {
      await item.owner.close(); item.closed = true;
    }
  };
  const retire = async () => {
    await closeOwners();
    if (!rawClose) rawClose = lease.close();
    await rawClose; rawClosed = true;
  };
  try {
    if (await exists(recordFile)) {
      need(opts.resume === true, 'ORIGINAL_INSTALLED_OPERATION_RESUME_REQUIRED');
      await reload();
    } else await initialRecord();
    if (record.status === 'COMPLETE') {
      const body=await bytes(join(directory,'result.json')),result=JSON.parse(body);
      need(result.schema===SCHEMA&&result.status==='COMPLETE'&&result.operationId===record.id&&
        result.sourceCommit===SOURCE&&sha(body)===record.resultSha256&&
        canonical(result.phases)===canonical(record.phases),'INSTALLED_OPERATION_RESULT_CHANGED');
      return result;
    }
    check();
    const output = join(directory,'selected-release');
    const packaged = await buildDistribution({repository,ref:SOURCE,output,selection:'prepaid-api',
      offline:opts['source-online'] !== true,resume:await exists(output),python:opts.python ?? 'python3',
      onProgress:event => {if (['selected','packaged','reused'].includes(event.phase))
        process.stdout.write(JSON.stringify({build:event.phase,files:event.files ?? null}) + '\n');}});
    need(packaged.sourceCommit === SOURCE && packaged.sourceSelection?.id === 'prepaid-api',
      'INSTALLED_SELECTION_REQUIRED');
    await phase('SELECTED_PRODUCT_BUILT', {archive:packaged.archive,sha256:packaged.sha256,
      sourceCommit:packaged.sourceCommit,selection:packaged.sourceSelection.id,sourceFiles:packaged.sourceFiles});
    check();
    const preparation = async selectedDirectory => {
      await privateDir(selectedDirectory);
      const path = join(selectedDirectory, 'preparation.json');
      let info;
      try {info = await lstat(path);} catch (error) {
        if (error.code === 'ENOENT') return {state:'ABSENT',bytes:0,sha256:null};
        throw error;
      }
      need(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && !(info.mode & 0o077) &&
        (!process.getuid || info.uid === process.getuid()), 'ORIGINAL_RUNTIME_PREPARATION_CHANGED');
      const body = await bytes(path), observed = {bytes:body.length,sha256:sha(body)};
      if (body.length === 0) return {...observed,state:'EMPTY'};
      let value;
      try {value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
      catch {return {...observed,state:'INVALID_JSON'};}
      need(value?.schema === 'stellar-forge.runtime-preparation.v1' &&
        value.directory === selectedDirectory && value.archivePath === join(selectedDirectory, 'source.tgz') &&
        value.archiveSha256 === packaged.sha256 && value.selection?.native === true &&
        value.selection?.operator === true &&
        canonical(value.selection.features) === canonical(['schema','openapi','mcp']) &&
        canonical(value.selection.pins) === canonical({}),
        'ORIGINAL_RUNTIME_PREPARATION_CHANGED');
      return {...observed,state:'COMPLETE'};
    };
    let actual = await reload();
    if (actual.runtimeAttempts === undefined) {
      await save({...actual, runtimeAttempts:[{index:0,directory:runtimePath(0),from:null,
        fromPreparationSha256:null,fromPreparationState:null,fromPreparationBytes:null,
        archiveSha256:packaged.sha256,selectedAt:now()}],updatedAt:now()});
      actual = await reload();
    }
    let selectedRuntime = actual.runtimeAttempts.at(-1);
    need(selectedRuntime.archiveSha256 === packaged.sha256, 'INSTALLED_RUNTIME_ARCHIVE_CHANGED');
    if (await exists(selectedRuntime.directory) &&
        (!(await exists(join(selectedRuntime.directory,'runtime-install.json'))) ||
         !(await exists(join(selectedRuntime.directory,'install-state.json'))))) {
      need(opts.resume === true &&
        !actual.phases.some(item => item.name === 'ORIGINAL_RUNTIME_INSTALLED'),
        'ORIGINAL_RUNTIME_PREPARATION_RECOVERY_REQUIRED');
      // Keep every original partial runtime. Explicit resume records both the
      // observed preparation bytes and the next original installer destination.
      const previous = await preparation(selectedRuntime.directory);
      const index = actual.runtimeAttempts.length;
      need(index < 100, 'INSTALLED_RUNTIME_RECOVERY_LIMIT');
      const nextDirectory = runtimePath(index);
      need(!(await exists(nextDirectory)), 'INSTALLED_RUNTIME_RECOVERY_DESTINATION_EXISTS');
      const next = {index,directory:nextDirectory,from:selectedRuntime.directory,
        fromPreparationSha256:previous.sha256,fromPreparationState:previous.state,
        fromPreparationBytes:previous.bytes,archiveSha256:packaged.sha256,selectedAt:now()};
      check();
      await save({...actual,runtimeAttempts:[...actual.runtimeAttempts,next],updatedAt:now()});
      actual = await reload(); selectedRuntime = actual.runtimeAttempts.at(-1);
    }
    const runtime = selectedRuntime.directory;
    if (!(await exists(runtime))) {
      check();
      if (selectedRuntime.from !== null) {
        const previous = await preparation(selectedRuntime.from);
        need(previous.sha256 === selectedRuntime.fromPreparationSha256 &&
          previous.state === selectedRuntime.fromPreparationState &&
          previous.bytes === selectedRuntime.fromPreparationBytes,
          'ORIGINAL_RUNTIME_RECOVERY_SOURCE_CHANGED');
        if (previous.state === 'COMPLETE') {
          await installer.recoverRuntime({from:selectedRuntime.from,directory:runtime,
            install:false,python:opts.python ?? 'python3'});
        } else {
          // The original preparation write never yielded readable JSON. The
          // driver's already retained archive/selection is still authoritative;
          // prepare a new original runtime without altering the failed bytes.
          await installer.prepareRuntimeInstall({directory:runtime,archive:packaged.archive,
            sha256:packaged.sha256,native:true,operator:true,features:['schema','openapi','mcp'],
            python:opts.python ?? 'python3',from:selectedRuntime.from});
        }
      } else await installer.prepareRuntimeInstall({directory:runtime,
        archive:packaged.archive,sha256:packaged.sha256,native:true,operator:true,
        features:['schema','openapi','mcp'],python:opts.python ?? 'python3'});
    }
    const nodeModules = join(runtime,'node_modules'), lockFile = join(runtime,'package-lock.json');
    if (opts.dependencies) {
      const graph = await realpath(opts.dependencies);
      need(graph !== runtime && !graph.startsWith(runtime + '/'), 'ORIGINAL_DEPENDENCY_GRAPH_REQUIRED');
      const sourceModules = join(graph,'node_modules'), sourceLock = join(graph,'package-lock.json');
      need((await lstat(sourceModules)).isDirectory() && !(await lstat(sourceModules)).isSymbolicLink(),
        'ORIGINAL_COMPLETE_DEPENDENCY_GRAPH_REQUIRED');
      const lock = await bytes(sourceLock, 16 * 1024 * 1024);
      if (!(await exists(nodeModules))) await symlink(sourceModules,nodeModules,'dir');
      else need(await realpath(nodeModules) === await realpath(sourceModules), 'ORIGINAL_DEPENDENCY_GRAPH_CHANGED');
      if (!(await exists(lockFile))) await writeFile(lockFile,lock,{flag:'wx',mode:0o600});
      else need((await bytes(lockFile,16 * 1024 * 1024)).equals(lock), 'ORIGINAL_DEPENDENCY_LOCK_CHANGED');
      await installer.installRuntime({directory:runtime,adoptExisting:true});
    } else await installer.installRuntime({directory:runtime,...(opts['npm-cache']?{cache:opts['npm-cache']}:{})});
    const installation = await installer.inspectRuntimeInstall({directory:runtime,load:true,source:true});
    need(installation.ready && installation.sourceVerified && installation.sourceCommit === SOURCE,
      'INSTALLED_RUNTIME_NOT_READY');
    await phase('ORIGINAL_RUNTIME_INSTALLED', {installationId:installation.installationId,
      sourceCommit:installation.sourceCommit,profileId:installation.profileId,sourceRoot:installation.sourceRoot,
      dependencyRoot:installation.dependencyRoot});
    check();
    const installed = path => import(pathToFileURL(join(installation.sourceRoot,path)).href);
    const product = await installed('products/prepaid-api/index.mjs');
    const merchantCli = await installed(BASE + 'sf101-merchant-receiver/api-application/workspace/cli.mjs');
    const templatePath = join(directory,'starter-template.json');
    if (!(await exists(templatePath))) {
      const command = await installer.runtimeCommand({directory:runtime,args:['prepaid-api','template','--out',templatePath]});
      await child(command.executable,command.args,{cwd:command.cwd,signal:controller.signal});
    }
    const template = await json(templatePath);
    need(template.schema === 'stellar-forge.prepaid-api-starter.v1', 'INSTALLED_COMMAND_MISSING');
    const setup = await product.preparePrepaidApi({directory:join(directory,'merchant'),request:starterRequest});
    const inspected = await product.inspectPrepaidApi(setup.directory);
    need(inspected.setupId === setup.setupId && inspected.planSha256 === setup.planSha256,
      'INSTALLED_SETUP_CHANGED');
    await phase('RETAINED_MERCHANT_SETUP', {setupId:setup.setupId,planSha256:setup.planSha256,
      sourceSha256:setup.sourceSha256,configSha256:setup.configSha256,files:setup.files});
    try {merchant = retainOwner(await merchantCli.serveConfiguredMerchantWorkspace({configFile:setup.config,port:0,
      expectedConfigSha256:setup.configSha256,expectedSourceSha256:setup.sourceSha256}));}
    catch (error) {adoptFailureOwner(error); throw error;}
    check();
    const published = await product.publishPrepaidApi({directory:setup.directory,launchFile:merchant.launchFile,
      resume:opts.resume === true,maxWaitMs:120000,signal:controller.signal});
    need(published.status === 'READY', 'ORIGINAL_OFFER_NOT_READY');
    const planMember = published.files.find(file => file.name === 'api-pass.json');
    need(planMember?.sha256, 'ORIGINAL_PUBLISHED_PLAN_REQUIRED');
    await phase('ORIGINAL_OFFER_PUBLISHED', {workspaceId:published.workspaceId,offerId:published.offerId,
      workflowId:published.workflowId,operations:published.operations,planSha256:planMember.sha256});
    const orderReference = 'prepaid-installed-' + record.id;
    const handoff = await product.preparePrepaidCustomer({directory:setup.directory,launchFile:merchant.launchFile,
      orderReference,label:'Installed prepaid API customer',resume:opts.resume === true,
      maxWaitMs:120000,signal:controller.signal});
    need(handoff.status === 'READY', 'ORIGINAL_CUSTOMER_HANDOFF_NOT_READY');
    const received = await product.downloadPrepaidCustomer({directory:setup.directory,launchFile:merchant.launchFile,
      orderReference,out:join(directory,'customer-files'),signal:controller.signal});
    need(received.status === 'COMPLETE' && received.exportId === handoff.export.id,
      'ORIGINAL_CUSTOMER_FILES_INCOMPLETE');
    await phase('COMPLETE_CUSTOMER_HANDOFF_RECEIVED', {orderReference,offerId:handoff.offerId,
      operationId:handoff.operationId,exportId:received.exportId,files:received.files});
    check();
    const configured = await product.preparePrepaidCustomerWorkspace({handoffDirectory:received.directory,
      directory:join(directory,'customer'),mode:'access',title:'Installed prepaid API customer',
      python:opts.python ?? 'python3'});
    const selected = await product.inspectPrepaidCustomerWorkspace(configured.configurationFile);
    need(selected.id === configured.id, 'ORIGINAL_CUSTOMER_SETUP_CHANGED');
    try {customer = retainOwner(await product.servePrepaidCustomer({configurationFile:configured.configurationFile,
      port:0,approvalMode:'terminal',agentDirectory:join(directory,'customer-agent')}));}
    catch (error) {adoptFailureOwner(error); throw error;}
    const browserUrl = new URL(customer.url), token = browserUrl.hash.slice(1);
    const screen = await response(browserUrl.origin,token,'/api/state',{jsonResult:true});
    need(screen.profiles.some(profile => profile.id === customer.prepaid.profileId &&
      profile.orderReference === orderReference), 'ORIGINAL_CUSTOMER_PROFILE_MISSING');
    const assetManifest = await json(join(installation.sourceRoot,BASE,
      'sf101-merchant-receiver/api-access/workspace/browser-assets.json'));
    const assets = [];
    for (const path of ['/','/app.mjs','/style.css']) {
      const body = await response(browserUrl.origin,token,path);
      need(body.length > 0, 'ORIGINAL_CUSTOMER_ASSET_REQUIRED');
      assets.push({path,bytes:body.length,sha256:sha(body)});
    }
    need(assetManifest.schema === 'stellar-forge.browser-assets.v1' && customer.launch.agent?.workspaceId === customer.workspaceId,
      'ORIGINAL_CUSTOMER_AGENT_SETUP_REQUIRED');
    await phase('ORIGINAL_CUSTOMER_OPENED', {workspaceId:customer.workspaceId,profileId:customer.prepaid.profileId,
      bootstrapOperationId:customer.prepaid.operationId,configurationId:configured.id,
      orderReference,assets,agentSetupSha256:customer.launch.agent.setupSha256});
    await customer.close(); owners.find(item=>item.owner===customer).closed=true;
    const originalCustomer = customer.prepaid, originalWorkspaceId = customer.workspaceId;
    customer = null;
    await merchant.close(); owners.find(item=>item.owner===merchant).closed=true; merchant=null;
    check();
    try {merchant = retainOwner(await merchantCli.serveConfiguredMerchantWorkspace({configFile:setup.config,port:0,
      expectedConfigSha256:setup.configSha256,expectedSourceSha256:setup.sourceSha256}));}
    catch (error) {adoptFailureOwner(error); throw error;}
    const reopenedOffer = await product.publishPrepaidApi({directory:setup.directory,launchFile:merchant.launchFile,
      resume:true,maxWaitMs:120000,signal:controller.signal});
    const reopenedOrder = await product.preparePrepaidCustomer({directory:setup.directory,launchFile:merchant.launchFile,
      orderReference,label:'Installed prepaid API customer',resume:true,maxWaitMs:120000,signal:controller.signal});
    const reopenedFiles = await product.downloadPrepaidCustomer({directory:setup.directory,launchFile:merchant.launchFile,
      orderReference,out:received.directory,signal:controller.signal});
    need(reopenedOffer.offerId === published.offerId && canonical(reopenedOffer.operations) === canonical(published.operations) &&
      reopenedOrder.operationId === handoff.operationId && canonical(reopenedFiles.files) === canonical(received.files),
      'ORIGINAL_MERCHANT_REOPEN_CHANGED');
    try {customer = retainOwner(await product.servePrepaidCustomer({configurationFile:configured.configurationFile,
      port:0,approvalMode:'terminal',agentDirectory:join(directory,'customer-agent')}));}
    catch (error) {adoptFailureOwner(error); throw error;}
    need(customer.workspaceId === originalWorkspaceId && customer.prepaid.profileId === originalCustomer.profileId &&
      customer.prepaid.operationId === originalCustomer.operationId, 'ORIGINAL_CUSTOMER_REOPEN_CHANGED');
    await phase('SAME_WORKSPACES_AND_HANDOFF_REOPENED', {merchantWorkspaceId:merchant.launch.workspaceId,
      customerWorkspaceId:customer.workspaceId,profileId:customer.prepaid.profileId,
      bootstrapOperationId:customer.prepaid.operationId,offerId:published.offerId,
      orderReference,orderOperationId:handoff.operationId,exportId:received.exportId});
    await closeOwners();
    const launch = await json(join(configured.workspaceDirectory,'api-pass-workspace-launch.json'));
    const merchantLaunch = await json(setup.launchFile);
    need(launch.status === 'STOPPED' && merchantLaunch.state === 'STOPPED',
      'ORIGINAL_WORKSPACE_DRAIN_INCOMPLETE');
    await phase('ORIGINAL_WORKSPACES_DRAINED', {customer:launch.status,merchant:merchantLaunch.state});
    const finalRecord = await reload();
    let result = {schema:SCHEMA,status:'COMPLETE',operationId:record.id,completedAt:now(),sourceCommit:SOURCE,
      sourceSelection:'prepaid-api',archive:{path:packaged.archive,sha256:packaged.sha256},
      installation:{directory:runtime,installationId:installation.installationId,profileId:installation.profileId,
        attempts:finalRecord.runtimeAttempts},
      setupId:setup.setupId,merchantWorkspaceId:published.workspaceId,customerWorkspaceId:originalWorkspaceId,
      offerId:published.offerId,orderReference,customerProfileId:originalCustomer.profileId,
      handoff:{exportId:received.exportId,files:received.files},phases:finalRecord.phases};
    const resultFile=join(directory,'result.json');
    if(await exists(resultFile)){
      const existing=await json(resultFile);
      need(typeof existing.completedAt==='string'&&Number.isFinite(Date.parse(existing.completedAt))&&
        canonical(existing)===canonical({...result,completedAt:existing.completedAt}),
        'INSTALLED_OPERATION_RESULT_CHANGED');
      result=existing;
    }else await originalStore.writeJson(resultFile,result,{exclusive:true});
    await save({...finalRecord,status:'COMPLETE',updatedAt:now(),resultSha256:sha(await bytes(resultFile))});
    process.stdout.write(JSON.stringify({status:'COMPLETE',operationId:record.id,phases:result.phases.length,
      sourceCommit:SOURCE,result:join(directory,'result.json'),archive:packaged.archive}) + '\n');
    return result;
  } catch (error) {
    try {
      if (await exists(recordFile)) {
        const current = await reload();
        if (current.status !== 'COMPLETE') await save({...current,status:'ATTENTION',updatedAt:now(),
          error:{code:code(error),childCode:error.childCode??null}});
      }
    } catch {}
    throw error;
  } finally {
    running = false;
    try {await retire();}
    catch (error) {
      process.exitCode = 1;
      process.stderr.write(JSON.stringify({state:'CLOSE_FAILED',code:code(error),
        rawLeaseCloseAttempted:rawClose!==null,action:'Signal this same owner to resume retryable workspace drain'})+'\n');
      if (rawClose !== null) {
        // The original raw lease close is one-shot. Retain its failed outcome.
        process.off('SIGINT',signal); process.off('SIGTERM',signal);
        throw error;
      }
      await new Promise(resolveWait => {
        let closing = false;
        const keeper = setInterval(()=>{},1000);
        retryClose = () => {
          if (closing) return; closing = true;
          retire().then(()=>{clearInterval(keeper);retryClose=null;resolveWait();},failure=>{
            process.stderr.write(JSON.stringify({state:'CLOSE_FAILED',code:code(failure)})+'\n');
            if (rawClose !== null) {clearInterval(keeper);retryClose=null;resolveWait();}
            else closing=false;
          });
        };
      });
      need(rawClosed, 'ORIGINAL_LEASE_CLOSE_UNRESOLVED');
    } finally {process.off('SIGINT',signal);process.off('SIGTERM',signal);}
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  operateInstalledPrepaidProduct(process.argv.slice(2)).catch(error=>{
    process.stderr.write(JSON.stringify({error:code(error),childCode:error.childCode??null})+'\n');
    process.exitCode=1;
  });
