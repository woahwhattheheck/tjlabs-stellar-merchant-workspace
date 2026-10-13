#!/usr/bin/env node
// MIT. Complete receiving of product source, installed Collections and original recovery.
import { constants, createReadStream } from 'node:fs';
import { open, readFile, writeFile, mkdir, lstat, realpath, readdir, rename, chmod, link, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startRuntimeWorkspace } from '../runtime-workspace/server.mjs';
import { runtimeCommand, inspectRuntimeInstall } from '../runtime-install.mjs';
import { saveJSON, operationLease, processIdentity } from '../runtime-workspace/storage.mjs';
import { validateCollectionPlan, resolveCollectionEdition, stableJson } from '../../sf88-operator-buyer-cli/collection-composer/plan.mjs';
import { openProductCollectionsBrowser } from './product-collections-browser.mjs';

import { readCustomerUseSource, customerUseDocument, canonical, customerUseReview, customerUseCsv } from '../../sf88-operator-buyer-cli/collection-composer/customer-use-definition.mjs';
import { inspectCustomerUseReturn } from '../../sf88-operator-buyer-cli/collection-composer/customer-use-return.mjs';

export const RECEIVING_SCHEMA = 'stellar-forge.product-collections-receiving.v1';
const JOURNAL_SCHEMA = 'stellar-forge.product-collections-receiving-state.v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const HASH = /^[a-f0-9]{64}$/;
const OID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (value, code, detail) => {
  if (!value) throw Object.assign(new Error(detail || code), { code });
};
const sha = value => createHash('sha256').update(value).digest('hex');
const encoded = value => Buffer.from(stableJson(value) + '\n');
const within = (root, path) => root === path || path.startsWith(root + sep);
const runFile = promisify(execFile);
function fields(value, names) {
  need(plain(value) && Object.keys(value).every(name => names.includes(name)), 'RECEIVING_INPUT_FIELDS_INVALID');
}
function absolute(path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path
    && path !== sep && !path.includes('\0'), 'RECEIVING_CANONICAL_PATH_REQUIRED');
  return path;
}
function bool(value) { need(typeof value === 'boolean', 'RECEIVING_EXPLICIT_BOOLEAN_REQUIRED'); }
function disjoint(left, right) {
  need(!within(left, right) && !within(right, left), 'RECEIVING_PATHS_MUST_BE_SEPARATE');
}
/** Select actual existing files, two real plan revisions and two explicit periods. */
export function validateReceivingInput(value) {
  fields(value, ['schema', 'operationId', 'outputDirectory', 'source', 'runtime',
    'collections', 'recovery', 'browser', 'operationTimeoutSeconds', 'customerUse']);
  need(value.schema === RECEIVING_SCHEMA && typeof value.operationId === 'string'
    && value.operationId.length > 0 && value.operationId.length <= 200, 'RECEIVING_OPERATION_REQUIRED');
  absolute(value.outputDirectory);
  fields(value.source, ['repository', 'commit', 'python', 'offline', 'compareSelections', 'searchQuery']);
  absolute(value.source.repository); absolute(value.source.python); bool(value.source.offline);
  need(OID.test(value.source.commit ?? ''), 'RECEIVING_IMMUTABLE_SOURCE_REQUIRED');
  need(Array.isArray(value.source.compareSelections) && value.source.compareSelections.length >= 2
    && value.source.compareSelections.length <= 4
    && value.source.compareSelections.every(id => typeof id === 'string' && id.length > 0 && id.length <= 120)
    && new Set(value.source.compareSelections).size === value.source.compareSelections.length
    && value.source.compareSelections.includes('all'), 'RECEIVING_FULL_TOOLKIT_COMPARISON_REQUIRED');
  if (value.source.searchQuery !== undefined)
    need(typeof value.source.searchQuery === 'string' && value.source.searchQuery.trim().length > 0,
      'RECEIVING_SEARCH_QUERY_REQUIRED');
  fields(value.runtime, ['workspaceDirectory', 'installedDirectory', 'name', 'profile', 'install']);
  absolute(value.runtime.workspaceDirectory);
  need(Boolean(value.runtime.installedDirectory) !== Boolean(value.runtime.name), 'RECEIVING_ONE_RUNTIME_TARGET_REQUIRED');
  if (value.runtime.installedDirectory) absolute(value.runtime.installedDirectory);
  if (value.runtime.name) need(ID.test(value.runtime.name), 'RECEIVING_RUNTIME_NAME_REQUIRED');
  fields(value.runtime.profile, ['native', 'operator', 'features', 'pins']);
  need(value.runtime.profile.native === true && value.runtime.profile.operator === true
    && Array.isArray(value.runtime.profile.features)
    && value.runtime.profile.features.every(name => typeof name === 'string')
    && new Set(value.runtime.profile.features).size === value.runtime.profile.features.length
    && plain(value.runtime.profile.pins), 'RECEIVING_NATIVE_OPERATOR_PROFILE_REQUIRED');
  fields(value.runtime.install, ['offline', 'cache', 'nodeHeaders']);
  bool(value.runtime.install.offline); absolute(value.runtime.install.cache);
  if (value.runtime.install.nodeHeaders) absolute(value.runtime.install.nodeHeaders);
  fields(value.collections, ['directory', 'planFiles', 'periods', 'enqueueFirstPeriod']);
  absolute(value.collections.directory); bool(value.collections.enqueueFirstPeriod);
  need(Array.isArray(value.collections.planFiles) && value.collections.planFiles.length === 2,
    'RECEIVING_TWO_ORIGINAL_PLAN_REVISIONS_REQUIRED');
  value.collections.planFiles.forEach(absolute);
  need(Array.isArray(value.collections.periods) && value.collections.periods.length === 2,
    'RECEIVING_TWO_EXPLICIT_PERIODS_REQUIRED');
  value.collections.periods.forEach((period, index) => {
    fields(period, ['collectionId', 'name', 'revision', 'values']);
    need(ID.test(period.collectionId ?? '') && typeof period.name === 'string'
      && period.name.trim().length > 0 && period.name.length <= 160
      && period.revision === index && plain(period.values)
      && Object.values(period.values).every(selected => typeof selected === 'string'),
    'RECEIVING_PERIOD_SELECTION_REQUIRED');
  });
  need(value.collections.periods[0].collectionId !== value.collections.periods[1].collectionId,
    'RECEIVING_DISTINCT_PERIODS_REQUIRED');
  fields(value.recovery, ['stateRoot', 'retainedStateRoot', 'passphraseEnv', 'python', 'quiesced']);
  absolute(value.recovery.stateRoot); absolute(value.recovery.retainedStateRoot); absolute(value.recovery.python);
  need(value.recovery.quiesced === true
    && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.recovery.passphraseEnv ?? ''),
  'RECEIVING_ORIGINAL_RECOVERY_SELECTION_REQUIRED');
  need(within(value.recovery.stateRoot, value.collections.directory),
    'RECEIVING_COLLECTIONS_WITHIN_ORIGINAL_STATE_REQUIRED');
  for (const outside of [value.outputDirectory, value.source.repository, value.runtime.workspaceDirectory,
    value.runtime.installedDirectory, value.recovery.retainedStateRoot].filter(Boolean))
    disjoint(value.recovery.stateRoot, outside);
  for (const path of [value.source.repository, value.runtime.workspaceDirectory,
    value.runtime.installedDirectory, value.recovery.retainedStateRoot].filter(Boolean))
    disjoint(value.outputDirectory, path);
  disjoint(value.source.repository, value.recovery.retainedStateRoot);
  disjoint(value.runtime.workspaceDirectory, value.recovery.retainedStateRoot);
  fields(value.browser, ['playwrightModule', 'executablePath']);
  absolute(value.browser.playwrightModule); absolute(value.browser.executablePath);
  if (value.operationTimeoutSeconds !== undefined)
    need(Number.isSafeInteger(value.operationTimeoutSeconds) && value.operationTimeoutSeconds >= 60
      && value.operationTimeoutSeconds <= 86400, 'RECEIVING_OPERATION_TIMEOUT_INVALID');

  if (value.customerUse !== undefined) {
    const selected = value.customerUse;
    fields(selected, ['calendar', 'commissionFiles', 'actor', 'expectedHeadSha256', 'requestIds', 'buyerReturn']);
    const pin = value => {
      fields(value, ['path', 'bytes', 'sha256']); absolute(value.path);
      need(Number.isSafeInteger(value.bytes) && value.bytes > 0 && HASH.test(value.sha256 ?? ''),
        'RECEIVING_COMPLETE_CUSTOMER_USE_FILE_REQUIRED');
    };
    pin(selected.calendar);
    need(selected.calendar.bytes <= 32 * 1024 * 1024
      && Array.isArray(selected.commissionFiles) && selected.commissionFiles.length === 2,
    'RECEIVING_ORIGINAL_CALENDAR_AND_TWO_COMMISSION_REVISIONS_REQUIRED');
    selected.commissionFiles.forEach(value => {
      pin(value); need(value.bytes <= 2 * 1024 * 1024, 'RECEIVING_COMMISSION_FILE_TOO_LARGE');
    });
    need(typeof selected.actor === 'string' && selected.actor.trim().length > 0
      && selected.actor.length <= 200 && !selected.actor.includes('\0')
      && (selected.expectedHeadSha256 === null || HASH.test(selected.expectedHeadSha256 ?? '')),
    'RECEIVING_ORIGINAL_COMMISSION_HEAD_AND_ACTOR_REQUIRED');
    fields(selected.requestIds, ['save', 'prepare', 'create', 'capture']);
    const uuids = [];
    for (const key of ['save', 'prepare', 'create']) {
      need(Array.isArray(selected.requestIds[key]) && selected.requestIds[key].length === 2,
        'RECEIVING_ORIGINAL_CUSTOMER_USE_REQUESTS_REQUIRED');
      uuids.push(...selected.requestIds[key]);
    }
    uuids.push(selected.requestIds.capture);
    need(uuids.every(value => typeof value === 'string'
      && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))
      && new Set(uuids).size === uuids.length, 'RECEIVING_DISTINCT_RETAINED_CUSTOMER_USE_REQUESTS_REQUIRED');
    fields(selected.buyerReturn, ['bindingIds', 'maxVerifyBytes', 'requireSavedResponses']);
    need(Array.isArray(selected.buyerReturn.bindingIds) && selected.buyerReturn.bindingIds.length > 0
      && selected.buyerReturn.bindingIds.length <= 2000 && selected.buyerReturn.bindingIds.every(value => ID.test(value))
      && new Set(selected.buyerReturn.bindingIds).size === selected.buyerReturn.bindingIds.length
      && Number.isSafeInteger(selected.buyerReturn.maxVerifyBytes) && selected.buyerReturn.maxVerifyBytes > 0
      && selected.buyerReturn.maxVerifyBytes <= 1073741824
      && selected.buyerReturn.requireSavedResponses === true,
    'RECEIVING_EXPLICIT_ORIGINAL_BUYER_RETURN_REQUIRED');
  }
  return JSON.parse(JSON.stringify(value));
}
async function present(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function regular(path, maximum = 2 * 1024 * 1024) {
  absolute(path); need(await realpath(path) === path, 'RECEIVING_SOURCE_PATH_CHANGED');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.size <= BigInt(maximum), 'RECEIVING_REGULAR_INPUT_REQUIRED');
    const bytes = await handle.readFile(), after = await handle.stat({ bigint: true });
    need(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key]),
      'RECEIVING_INPUT_CHANGED_DURING_READ');
    return bytes;
  } finally { await handle.close(); }
}
async function fileIdentity(path) {
  absolute(path); need(await realpath(path) === path, 'RECEIVING_FILE_PATH_CHANGED');
  const before = await lstat(path, { bigint: true });
  need(before.isFile(), 'RECEIVING_REGULAR_FILE_REQUIRED');
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(path, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) {
    bytes += chunk.length; hash.update(chunk);
  }
  const after = await lstat(path, { bigint: true });
  need(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key]),
    'RECEIVING_FILE_CHANGED_DURING_READ');
  return { path, bytes, sha256: hash.digest('hex') };
}
async function directory(path, { create = false, privateMode = false } = {}) {
  absolute(path);
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const st = await lstat(path);
  need(st.isDirectory() && !st.isSymbolicLink() && await realpath(path) === path,
    'RECEIVING_ORIGINAL_DIRECTORY_REQUIRED');
  if (privateMode) need(st.uid === process.getuid() && (st.mode & 0o077) === 0,
    'RECEIVING_PRIVATE_DIRECTORY_REQUIRED');
  return st;
}
async function optionalJSON(path) {
  if (!await present(path)) return null;
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regular(path, 64 * 1024 * 1024)));
}
function endpoint(url, kind) {
  const selected = new URL(url), token = selected.hash.slice(1);
  need(selected.protocol === 'http:' && selected.hostname === '127.0.0.1'
    && /^[a-f0-9]{64}$/.test(token), 'RECEIVING_ORIGINAL_PRIVATE_LISTENER_REQUIRED');
  return { origin: selected.origin, token, kind };
}
function headers(host, json = false) {
  return { Origin: host.origin,
    ...(host.kind === 'runtime' ? { 'x-runtime-workspace-token': host.token }
      : { Authorization: 'Bearer ' + host.token }),
    ...(json ? { 'content-type': 'application/json' } : {}) };
}
async function request(host, path, value, { optional = false, signal } = {}) {
  const target = new URL(path, host.origin);
  need(target.origin === host.origin, 'RECEIVING_DOWNLOAD_ORIGIN_CHANGED');
  const response = await fetch(target, { method: value === undefined ? 'GET' : 'POST',
    headers: headers(host, value !== undefined), signal,
    ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  if (optional && response.status === 404) return null;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || result.error || 'RECEIVING_NATIVE_REQUEST_FAILED'),
    { code: result.error || 'RECEIVING_NATIVE_REQUEST_FAILED', status: response.status, result });
  return result;
}
async function receiveFile(host, item, path, signal) {
  need(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && HASH.test(item.sha256 ?? ''),
    'RECEIVING_ORIGINAL_FILE_IDENTITY_REQUIRED');
  const previous = await present(path);
  if (previous) {
    const actual = await fileIdentity(path);
    need(actual.bytes === item.bytes && actual.sha256 === item.sha256, 'RECEIVING_RETAINED_FILE_CHANGED');
    return actual;
  }
  await directory(dirname(path), { create: true, privateMode: true });
  const target = new URL(item.downloadUrl || item.url, host.origin);
  need(target.origin === host.origin, 'RECEIVING_DOWNLOAD_ORIGIN_CHANGED');
  const response = await fetch(target, { headers: headers(host), signal });
  need(response.ok && response.body, 'RECEIVING_ORIGINAL_DOWNLOAD_FAILED');
  const temporary = path + '.partial', output = await open(temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  const hash = createHash('sha256'); let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      need(bytes <= item.bytes, 'RECEIVING_DOWNLOAD_SIZE_CHANGED');
      hash.update(chunk); await output.writeFile(chunk);
    }
    await output.sync();
    need(bytes === item.bytes && hash.digest('hex') === item.sha256, 'RECEIVING_DOWNLOAD_HASH_CHANGED');
  } finally { await output.close(); }
  await rename(temporary, path);
  const parent = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
  try { await parent.sync(); } finally { await parent.close(); }
  return { path, bytes, sha256: item.sha256 };
}
async function retainBytes(path, bytes) {
  await directory(dirname(path), { create: true, privateMode: true });
  if (await present(path)) {
    const actual = await fileIdentity(path);
    need(actual.bytes === bytes.length && actual.sha256 === sha(bytes), 'RECEIVING_FROZEN_FILE_CHANGED');
    return;
  }
  const temporary = path + '.partial-' + randomUUID(), handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await link(temporary, path); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const actual = await fileIdentity(path);
    need(actual.bytes === bytes.length && actual.sha256 === sha(bytes), 'RECEIVING_FROZEN_FILE_CHANGED');
  }
  await unlink(temporary);
  const parent = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
  try { await parent.sync(); } finally { await parent.close(); }
}

function memberPath(root, name) {
  need(typeof name === 'string' && name.length > 0 && !isAbsolute(name)
    && !name.includes('\\') && name.split('/').every(part => part && part !== '.' && part !== '..'),
  'RECEIVING_ORIGINAL_MEMBER_PATH_INVALID');
  const path = join(root, name); need(within(root, path), 'RECEIVING_ORIGINAL_MEMBER_PATH_INVALID');
  return path;
}

/**
 * One original operation from committed product selection through saved-period recovery.
 * Every native mutation uses its existing controller. The journal records selections,
 * original request IDs and receiving stages; original collection and attempt state
 * remain authoritative in the installed product.
 */
export async function receiveProductCollections(input, { onProgress = () => {}, signal } = {}) {
  const config = validateReceivingInput(input);
  need(process.platform === 'linux' && Number(process.versions.node.split('.')[0]) >= 22,
    'RECEIVING_EXISTING_LINUX_NODE_REQUIRED');
  need(typeof process.env[config.recovery.passphraseEnv] === 'string'
    && process.env[config.recovery.passphraseEnv].length > 0, 'RECEIVING_EXISTING_PASSPHRASE_ENV_REQUIRED');
  await directory(config.outputDirectory, { create: true, privateMode: true });
  const lease = await operationLease(join(config.outputDirectory, 'receiving.lock'));
  const journalFile = join(config.outputDirectory, 'receiving.json');
  const inputHash = sha(encoded(config)), startedAt = new Date().toISOString();
  let journal, runtimeServer, runtimeHost, collection, browser, runtimePage, collectionsPage, failure, journalBound = false;
  const timeout = (config.operationTimeoutSeconds ?? 3600) * 1000;
  const aborted = () => { need(!signal?.aborted, 'RECEIVING_INTERRUPTED'); };
  const progress = (stage, detail = {}) => onProgress({ operationId: config.operationId, stage, ...detail });
  const persist = async () => {
    journal.updatedAt = new Date().toISOString();
    await saveJSON(journalFile, journal, true);
  };
  const artifact = async (name, value) => {
    const path = join(config.outputDirectory, name);
    await directory(dirname(path), { create: true, privateMode: true });
    await saveJSON(path, value, true);
    return path;
  };
  const original = (host, path, value, options = {}) => request(host, path, value, { ...options, signal });
  async function id(name) {
    if (!journal.ids[name]) { journal.ids[name] = randomUUID(); await persist(); }
    return journal.ids[name];
  }
  async function step(name, action) {
    aborted();
    if (Object.hasOwn(journal.completed, name)) return journal.completed[name];
    journal.stage = name; await persist(); progress(name);
    const result = await action();
    journal.completed[name] = result; await persist();
    return result;
  }
  async function waitRuntime(operationId, { sourceBuild = false, resumeExisting = false } = {}) {
    const deadline = Date.now() + timeout; let resumed = false, signature;
    while (true) {
      aborted();
      const state = await original(runtimeHost, '/api/state');
      const operation = state.operations.find(value => value.id === operationId);
      need(operation, 'RECEIVING_ORIGINAL_RUNTIME_OPERATION_MISSING');
      const current = JSON.stringify([operation.phase, operation.displayPhase, operation.sourceBuildStage]);
      if (current !== signature) { signature = current; progress(journal.stage, {
        requestId: operationId, phase: operation.displayPhase, nativeStage: operation.sourceBuildStage }); }
      if (operation.phase === 'SUCCEEDED') return operation;
      if (sourceBuild && resumeExisting && !resumed && !operation.workerActive
        && ['FAILED', 'INTERRUPTED', 'QUEUED'].includes(operation.displayPhase)) {
        resumed = true;
        await original(runtimeHost, '/api/source-builds/recover', { operationId });
        continue;
      }
      if (resumeExisting && !resumed && operation.phase === 'QUEUED') {
        resumed = true; await original(runtimeHost, '/api/resume-queued', { operationId }); continue;
      }
      if (operation.phase === 'FAILED' || operation.displayPhase === 'INTERRUPTED') {
        await artifact('runtime/original-operation-' + operationId + '.json', operation);
        throw Object.assign(new Error(operation.error?.message || operation.error?.code || operation.displayPhase),
          { code: operation.error?.code || 'RECEIVING_ORIGINAL_RUNTIME_OPERATION_INCOMPLETE', operationId });
      }
      if (Date.now() >= deadline) {
        await artifact('runtime/original-operation-' + operationId + '.json', operation);
        throw Object.assign(new Error('The original operation is retained and still active: ' + operationId),
          { code: 'RECEIVING_ORIGINAL_RUNTIME_OPERATION_PENDING', operationId });
      }
      await delay(1500, undefined, { signal });
    }
  }
  async function runRuntime(name, body, options) {
    const requestId = body.requestId ?? await id(name);
    const before = await original(runtimeHost, '/api/state');
    const prior = before.operations.find(value => value.id === requestId);
    const resumeExisting = prior?.phase === 'QUEUED' || prior?.displayPhase === 'INTERRUPTED'
      || options?.sourceBuild === true && prior?.phase === 'FAILED';
    await original(runtimeHost, '/api/operation', { ...body, requestId });
    return waitRuntime(requestId, { ...options, resumeExisting });
  }
  async function closeCollection() {
    if (!collection) return;
    const current = collection; collection = null;
    if (await processIdentity(current.pid) === current.processStart) {
      process.kill(current.pid, 'SIGTERM');
      const deadline = Date.now() + timeout;
      while (await processIdentity(current.pid) === current.processStart) {
        need(Date.now() < deadline, 'RECEIVING_ORIGINAL_LISTENER_STILL_CLOSING');
        await delay(200);
      }
    }
    if (journal?.listener?.pid === current.pid) { journal.listener = null; await persist(); }
  }
  async function startCollection(mode) {
    const receivingDirectory = join(config.outputDirectory, 'receiving-workspace');
    const selected = mode === 'receiving' ? receivingDirectory : config.collections.directory;
    const command = await runtimeCommand({ directory: journal.runtime.directory,
      args: ['buyer-collections-workspace', mode === 'receiving' ? '--receiving-directory' : '--directory',
        selected, '--port', '0', '--startup-format', 'json'] });
    need(command.sourceCommit === config.source.commit, 'RECEIVING_INSTALLED_SOURCE_CHANGED');
    const saved = journal.listener;
    if (saved && await processIdentity(saved.pid) === saved.processStart) {
      need(saved.mode === mode && saved.selected === selected && saved.sourceCommit === config.source.commit,
        'RECEIVING_EXISTING_LISTENER_SELECTION_CHANGED');
      collection = { ...saved };
    } else {
      await directory(join(config.outputDirectory, 'logs'), { create: true, privateMode: true });
      const launchId = randomUUID(), logPath = join(config.outputDirectory, 'logs', launchId + '.stdout'),
        errorPath = join(config.outputDirectory, 'logs', launchId + '.stderr');
      const out = await open(logPath, 'wx', 0o600), err = await open(errorPath, 'wx', 0o600);
      let child;
      try {
        child = spawn(command.executable, command.args, { cwd: command.cwd, env: process.env,
          shell: false, stdio: ['ignore', out.fd, err.fd] });
        await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
      } finally { await out.close(); await err.close(); }
      const processStart = await processIdentity(child.pid);
      need(processStart, 'RECEIVING_INSTALLED_LISTENER_EXITED');
      journal.listener = { mode, selected, sourceCommit: command.sourceCommit, pid: child.pid,
        processStart, launchId, logPath, errorPath, url: null };
      collection = { ...journal.listener, child }; await persist();
    }
    if (!collection.url) {
      const deadline = Date.now() + 120000;
      while (!collection.url) {
        aborted();
        const info = await lstat(collection.logPath);
        need(info.isFile() && info.size <= 1024 * 1024, 'RECEIVING_ORIGINAL_STARTUP_LOG_INVALID');
        const transcript = await readFile(collection.logPath, 'utf8');
        for (const line of transcript.split(/\r?\n/)) {
          let launch; try { launch = JSON.parse(line); } catch { continue; }
          const schema = mode === 'receiving' ? 'stellar-forge.sf88.collection-recovery-workspace-launch.v1'
            : 'stellar-forge.sf88.collections-workspace-launch.v1';
          if (launch.schema === schema && launch.state === 'LISTENING' && launch.pid === collection.pid
            && (mode === 'receiving' ? launch.receivingDirectory === selected
              : launch.directory === selected && launch.approvalMode === 'BROWSER')) {
            collection.url = launch.url; journal.listener.url = launch.url; await persist();
            await artifact('runtime/' + collection.launchId + '-launch.json', { ...launch, url: undefined,
              command, processStart: collection.processStart });
            break;
          }
        }
        if (collection.url) break;
        need(await processIdentity(collection.pid) === collection.processStart,
          'RECEIVING_INSTALLED_LISTENER_EXITED', 'Read the original startup logs: ' + collection.errorPath);
        need(Date.now() < deadline, 'RECEIVING_ORIGINAL_LISTENER_START_PENDING');
        await delay(200, undefined, { signal });
      }
    }
    collection.host = endpoint(collection.url, 'collections');
    const status = await original(collection.host, '/api/status');
    need(mode === 'receiving' || status.directory === config.collections.directory,
      'RECEIVING_ORIGINAL_COLLECTION_STORE_CHANGED');
    return collection;
  }
  async function recovery(name, kind, options) {
    const requestId = await id(name);
    await original(collection.host, '/api/recovery/start', { requestId, kind, options });
    const deadline = Date.now() + timeout; let resumed = false, prior;
    while (true) {
      aborted();
      const result = await original(collection.host, '/api/recovery/' + requestId);
      if (result.state !== prior) { prior = result.state; progress(journal.stage, { requestId, phase: result.state }); }
      if (result.state === 'COMPLETED') {
        await artifact('recovery/' + name + '.json', result); return result;
      }
      if (result.state === 'UNFINISHED' && !resumed) {
        resumed = true; await original(collection.host, '/api/recovery/' + requestId + '/resume', {}); continue;
      }
      if (['FAILED', 'CANCELLED', 'UNFINISHED'].includes(result.state)) {
        await artifact('recovery/' + name + '.json', result);
        throw Object.assign(new Error(result.error?.code || result.error || result.state),
          { code: 'RECEIVING_ORIGINAL_RECOVERY_INCOMPLETE', requestId });
      }
      if (Date.now() >= deadline) {
        await artifact('recovery/' + name + '.json', result);
        throw Object.assign(new Error('The original recovery operation is still active: ' + requestId),
          { code: 'RECEIVING_ORIGINAL_RECOVERY_PENDING', requestId });
      }
      await delay(1500, undefined, { signal });
    }
  }

  async function customerUseInputs() {
    const selected = config.customerUse;
    if (!selected) return null;
    const retained = journal.customerUseInputs;
    if (retained) {
      for (const pin of [retained.calendar, ...retained.commissions]) {
        const actual = await fileIdentity(pin.path);
        need(actual.bytes === pin.bytes && actual.sha256 === pin.sha256, 'RECEIVING_RETAINED_CUSTOMER_USE_INPUT_CHANGED');
      }
      return retained;
    }
    const sources = [selected.calendar, ...selected.commissionFiles], copies = [];
    for (let index = 0; index < sources.length; index++) {
      const pin = sources[index], raw = await regular(pin.path, index === 0 ? 32 * 1024 * 1024 : 2 * 1024 * 1024);
      need(raw.length === pin.bytes && sha(raw) === pin.sha256, 'RECEIVING_CUSTOMER_USE_ORIGINAL_INPUT_CHANGED');
      const path = join(config.outputDirectory, 'inputs', index === 0 ? 'original-customer-use-calendar.json'
        : 'original-customer-use-commission-' + (index - 1) + '.json');
      await retainBytes(path, raw);
      copies.push({ path, bytes: raw.length, sha256: sha(raw), originalPath: pin.path });
    }
    const calendar = readCustomerUseSource(await regular(copies[0].path, 32 * 1024 * 1024));
    const documents = [];
    const nativePlans = journal.planInputs.map(pin => pin.definitionSha256);
    for (let index = 0; index < 2; index++) {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regular(copies[index + 1].path)));
      const document = customerUseDocument(value, calendar.value, calendar.sha256);
      need(document.periods.length === 2, 'RECEIVING_COMMISSION_TWO_ORIGINAL_PERIODS_REQUIRED');
      for (let periodIndex = 0; periodIndex < 2; periodIndex++) {
        const period = config.collections.periods[periodIndex], bound = document.periods.find(row => row.collectionId === period.collectionId);
        need(bound && bound.planId === journal.planInputs[periodIndex].planId
          && bound.planSha256 === nativePlans[periodIndex] && bound.name === period.name
          && canonical(bound.values) === canonical(period.values), 'RECEIVING_COMMISSION_PLAN_PERIOD_SELECTION_CHANGED');
      }
      need(selected.buyerReturn.bindingIds.every(id => document.bindings.some(binding => binding.id === id)),
        'RECEIVING_ORIGINAL_RETURN_BINDING_MISSING');
      documents.push(document);
    }
    need(documents[0].id === documents[1].id && canonical(documents[0]) !== canonical(documents[1]),
      'RECEIVING_TWO_EXPLICIT_COMMISSION_REVISIONS_REQUIRED');
    journal.customerUseInputs = { calendar: copies[0], commissions: copies.slice(1),
      commissionId: documents[0].id, source: calendar.value.source, selections: calendar.value.selection };
    await persist();
    return journal.customerUseInputs;
  }
  async function retainedCustomerUseDocument(index) {
    const inputs = journal.customerUseInputs;
    const calendar = readCustomerUseSource(await regular(inputs.calendar.path, 32 * 1024 * 1024));
    const raw = await regular(inputs.commissions[index].path, 2 * 1024 * 1024);
    need(raw.length === inputs.commissions[index].bytes && sha(raw) === inputs.commissions[index].sha256,
      'RECEIVING_RETAINED_CUSTOMER_USE_INPUT_CHANGED');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    const document = customerUseDocument(value, calendar.value, calendar.sha256);
    for (let periodIndex = 0; periodIndex < document.periods.length; periodIndex++) {
      const period = document.periods[periodIndex];
      const pin = journal.planInputs.find(row => row.planId === period.planId && row.definitionSha256 === period.planSha256);
      need(pin, 'RECEIVING_ORIGINAL_COMMISSION_PLAN_CHANGED');
      const plan = validateCollectionPlan(JSON.parse(await regular(pin.retained)));
      need(sha(encoded(plan)) === pin.definitionSha256, 'RECEIVING_RETAINED_PLAN_INPUT_CHANGED');
      document.periods[periodIndex] = { ...period, values: resolveCollectionEdition(plan, period).values };
    }
    return document;
  }
  async function customerUseAction(key, operation, input) {
    const selected = journal.customerUseInputs, prefix = '/api/customer-use/commissions';
    const path = operation === 'save' ? prefix : prefix + '/' + selected.commissionId + '/' + operation;
    // Freeze the full original native action before dispatch. Reentry uses the
    // same request UUID and native controller's own request/result recovery.
    await retainBytes(join(config.outputDirectory, 'customer-use', 'requests', key + '.json'),
      encoded({ operationId: config.operationId, path, input }));
    const result = await original(collection.host, path, input);
    await artifact('customer-use/actions/' + key + '.json', result);
    return result;
  }
  async function saveCustomerUse() {
    const inputs = await customerUseInputs(), selected = config.customerUse;
    const raw = await regular(inputs.calendar.path, 32 * 1024 * 1024);
    let imported = await original(collection.host, '/api/customer-use/sources/' + inputs.calendar.sha256,
      undefined, { optional: true });
    if (!imported) {
      const response = await fetch(new URL('/api/customer-use/sources/' + inputs.calendar.sha256, collection.host.origin), {
        method: 'POST', headers: { ...headers(collection.host), 'content-type': 'application/octet-stream',
          'x-customer-use-name': encodeURIComponent(basename(inputs.calendar.originalPath)) }, body: raw, signal });
      imported = await response.json();
      need(response.ok, imported.error || 'RECEIVING_CALENDAR_IMPORT_FAILED');
    }
    need(imported.metadata?.sha256 === inputs.calendar.sha256 && imported.metadata.bytes === inputs.calendar.bytes
      && canonical(imported.source.source) === canonical(inputs.source), 'RECEIVING_IMPORTED_CALENDAR_CHANGED');
    await artifact('customer-use/original-calendar-import.json', imported);
    const revisions = journal.customerUseRevisions ??= [];
    for (let index = 0; index < 2; index++) {
      const document = await retainedCustomerUseDocument(index);
      if (!revisions[index]) {
        const result = await customerUseAction('save-' + index, 'save', { document,
          expectedHeadSha256: index === 0 ? selected.expectedHeadSha256 : revisions[index - 1].sha256,
          actor: selected.actor, requestId: selected.requestIds.save[index] });
        need(result.id === inputs.commissionId && HASH.test(result.sha256 ?? '')
          && result.requestId === selected.requestIds.save[index], 'RECEIVING_ORIGINAL_COMMISSION_SAVE_CHANGED');
        revisions[index] = result; await persist();
      }
      const reopened = await original(collection.host, '/api/customer-use/commissions/' + inputs.commissionId
        + '/revisions/' + revisions[index].sha256);
      need(reopened.selected.sha256 === revisions[index].sha256
        && canonical(reopened.document) === canonical(document)
        && reopened.calendar.metadata.sha256 === inputs.calendar.sha256,
      'RECEIVING_SAVED_COMMISSION_REVISION_CHANGED');
      await artifact('customer-use/revision-' + index + '.json', reopened);
    }
    need(revisions[1].parentSha256 === revisions[0].sha256
      && revisions[1].revision === revisions[0].revision + 1,
    'RECEIVING_COMMISSION_REVISIONS_NOT_CONSECUTIVE');
    await browser.showCustomerUse(collectionsPage, revisions[1], 'saved-customer-use-commission');
    return { source: inputs.calendar, sourceCase: inputs.source, commissionId: inputs.commissionId,
      revisions: revisions.map(row => ({ id: row.id, revision: row.revision, sha256: row.sha256,
        parentSha256: row.parentSha256, documentSha256: row.documentSha256, requestId: row.requestId })) };
  }
  async function customerUsePeriod(index, operation, edition) {
    const selected = config.customerUse, revision = journal.customerUseRevisions[1];
    const input = { sha256: revision.sha256, collectionId: config.collections.periods[index].collectionId,
      actor: selected.actor, requestId: selected.requestIds[operation][index] };
    if (operation === 'create') {
      need(edition?.editionSha256 && edition.preview?.previewSha256, 'RECEIVING_ORIGINAL_PERIOD_REVIEW_REQUIRED');
      input.expectedEditionSha256 = edition.editionSha256;
      input.expectedPreviewSha256 = edition.preview.previewSha256;
    }
    const result = await customerUseAction(operation + '-' + index, operation, input);
    const native = result.current ?? result.native;
    need(result.requestId === input.requestId && result.commission?.id === revision.id
      && result.commission.sha256 === revision.sha256 && native?.collectionId === input.collectionId,
    'RECEIVING_COMMISSION_PERIOD_RESULT_CHANGED');
    await browser.openEdition(collectionsPage, input.collectionId);
    return native;
  }
  async function verifyCustomerUse(name) {
    const selected = journal.completed.SAVE_ORIGINAL_CUSTOMER_USE, inputs = journal.customerUseInputs;
    const result = await original(collection.host, '/api/customer-use/receiving');
    const current = result.commissions.find(row => row.id === selected.commissionId);
    need(current && current.currentHead.sha256 === selected.revisions[1].sha256
      && current.source.sha256 === inputs.calendar.sha256 && current.source.bytes === inputs.calendar.bytes
      && current.periods.length === 2 && current.periods.every(row => !row.error)
      && current.responses.every(row => !row.error), 'RECEIVING_ORIGINAL_COMMISSION_RECEIVING_CHANGED');
    for (let index = 0; index < 2; index++) {
      const revision = selected.revisions[index], view = await original(collection.host, '/api/customer-use/commissions/'
        + selected.commissionId + '/revisions/' + revision.sha256);
      const document = await retainedCustomerUseDocument(index);
      need(view.selected.sha256 === revision.sha256 && view.selected.documentSha256 === revision.documentSha256
        && canonical(view.document) === canonical(document)
        && canonical(view.calendar.source.source) === canonical(inputs.source),
      'RECEIVING_ORIGINAL_COMMISSION_HISTORY_CHANGED');
    }
    await artifact('customer-use/' + name + '.json', result);
    return current;
  }
  async function receiveCustomerUseReturn() {
    const selected = config.customerUse, revision = journal.customerUseRevisions[1], commissionId = revision.id;
    const prior = await original(collection.host, '/api/customer-use/commissions/' + commissionId
      + '/actions/' + selected.requestIds.capture, undefined, { optional: true });
    const view = await original(collection.host, '/api/customer-use/commissions/' + commissionId + '/revisions/' + revision.sha256);
    const failures = [];
    if (!prior?.result) {
    for (const bindingId of selected.buyerReturn.bindingIds) {
      const row = view.observations.rows.find(row => row.bindingId === bindingId);
      need(row, 'RECEIVING_ORIGINAL_BUYER_BINDING_CHANGED');
      for (const request of row.requests) {
        const item = request.item;
        if (request.error || !item?.job || item.error || item.job.outcome?.responseFile?.status !== 'SAVED')
          failures.push({ bindingId, collectionId: request.selection.collectionId,
            requestKey: request.selection.requestKey, intentId: request.request?.intentId ?? null,
            state: item?.state ?? null, responseStatus: item?.job?.outcome?.responseFile?.status ?? null,
            error: request.error ?? item?.error ?? null });
      }
      for (const response of row.responses) if (response.error || response.nativeFile?.status !== 'SAVED')
        failures.push({ bindingId, selection: response.selection, error: response.error ?? null });
    }
    await artifact('customer-use/original-buyer-observations-before-return.json', { view, unavailable: failures });
    need(failures.length === 0, 'RECEIVING_ORIGINAL_BUYER_RESULTS_REQUIRED',
      'Use the original Collections approval/run/recovery controls for the selected requests, then continue this exact receiving input; no buyer was called by this receiver.');
    }
    const captured = await customerUseAction('capture', 'capture', { sha256: revision.sha256,
      bindingIds: selected.buyerReturn.bindingIds, maxVerifyBytes: selected.buyerReturn.maxVerifyBytes,
      actor: selected.actor, requestId: selected.requestIds.capture });
    need(captured.requestId === selected.requestIds.capture && captured.commission?.id === commissionId
      && captured.commission.sha256 === revision.sha256, 'RECEIVING_ORIGINAL_BUYER_CAPTURE_CHANGED');
    const returnPath = '/api/customer-use/commissions/' + commissionId + '/returns/' + selected.requestIds.capture;
    const returned = await receiveFile(collection.host, { ...captured.file, url: returnPath },
      join(config.outputDirectory, 'customer-use', 'original-buyer-return.json'), signal);
    const raw = await regular(returned.path, 16 * 1024 * 1024), report = inspectCustomerUseReturn(raw);
    need(report.customerUse.commission.revisionSha256 === revision.sha256
      && report.customerUse.source.calendarSha256 === journal.customerUseInputs.calendar.sha256
      && canonical(report.customerUse.bindings.map(row => row.id).sort()) === canonical([...selected.buyerReturn.bindingIds].sort()),
    'RECEIVING_RETURN_COMMISSION_BINDING_CHANGED');
    need(report.rows.length > 0 && report.rows.every(row => row.output?.state === 'VERIFIED'),
      'RECEIVING_ORIGINAL_RETURN_OUTPUT_NOT_VERIFIED',
      'Retain the original capture and its actual output verification; do not label a limited or unavailable output complete.');
    await artifact('customer-use/original-buyer-return-review.json', report);
    const exported = [];
    for (const format of ['json', 'csv']) {
      const path = join(config.outputDirectory, 'customer-use', 'complete-commission.' + format);
      let bytes;
      if (await present(path)) bytes = await regular(path, 64 * 1024 * 1024);
      else {
        const target = new URL('/api/customer-use/commissions/' + commissionId + '/revisions/'
          + revision.sha256 + '/export/' + format, collection.host.origin);
        const response = await fetch(target, { headers: headers(collection.host), signal });
        need(response.ok && response.headers.get('x-customer-use-revision') === revision.sha256,
          'RECEIVING_COMMISSION_EXPORT_FAILED');
        bytes = Buffer.from(await response.arrayBuffer());
        need(bytes.length <= 64 * 1024 * 1024 && sha(bytes) === response.headers.get('x-content-sha256'),
          'RECEIVING_COMMISSION_EXPORT_CHANGED');
      }
      if (format === 'csv') need(sha(bytes) === sha(customerUseCsv(customerUseReview(view.document, view.calendar.source))),
        'RECEIVING_FROZEN_COMMISSION_CSV_CHANGED');
      else {
        const packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        need(packet.schema === 'stellar-forge.sf88.customer-use-commissioning.v1.export'
          && packet.selectedSha256 === revision.sha256 && packet.currentHead.sha256 === revision.sha256
          && packet.current.selected.sha256 === revision.sha256
          && canonical(packet.current.document) === canonical(view.document)
          && packet.revisions.length === view.history.length
          && packet.revisions.every((row, index) => row.sha256 === view.history[index].sha256
            && sha(Buffer.from(JSON.stringify(row.record, null, 2) + '\n')) === row.sha256)
          && packet.sources.some(row => row.metadata.sha256 === journal.customerUseInputs.calendar.sha256
            && row.encoding === 'base64'
            && sha(Buffer.from(row.content, 'base64')) === journal.customerUseInputs.calendar.sha256),
        'RECEIVING_FROZEN_COMMISSION_EXPORT_CHANGED');
      }
      await retainBytes(path, bytes); exported.push(await fileIdentity(path));
    }
    await browser.showCustomerUse(collectionsPage, revision, 'original-buyer-return', {
      requestId: selected.requestIds.capture, returnSha256: returned.sha256 });
    return { commissionId, revisionSha256: revision.sha256, calendarSha256: journal.customerUseInputs.calendar.sha256,
      captureRequestId: selected.requestIds.capture, originalIntents: report.rows.map(row => row.intentId),
      file: returned, exports: exported, sourceCase: journal.customerUseInputs.source,
      originalBuyerSource: report.buyerSource, counts: report.counts };
  }

  async function ensureEdition(index) {
    if (config.customerUse) return customerUsePeriod(index, 'prepare');
    const saved = journal.plans[index], period = config.collections.periods[index];
    const payload = { planId: saved.id, planSha256: saved.planSha256,
      collectionId: period.collectionId, name: period.name, values: period.values };
    let result = await original(collection.host, '/api/composer/editions/' + period.collectionId,
      undefined, { optional: true });
    if (!result) result = await browser.preparePeriod(collectionsPage, saved, period);
    else if (result.phase === 'PREPARING') {
      result = await original(collection.host, '/api/composer/editions/prepare', payload);
      await browser.openEdition(collectionsPage, period.collectionId);
    } else await browser.openEdition(collectionsPage, period.collectionId);
    need(result.planId === saved.id && result.planSha256 === saved.planSha256
      && stableJson(result.values) === stableJson(period.values)
      && ['PREPARED', 'CREATED'].includes(result.phase), 'RECEIVING_PERIOD_SELECTION_CHANGED_OR_REVIEW_REQUIRED');
    return result;
  }
  async function retainCollection(edition, name) {
    const snapshot = await original(collection.host, '/api/collections/' + edition.collectionId);
    need(snapshot.manifestSha256 === edition.collection.manifestSha256, 'RECEIVING_COLLECTION_MANIFEST_CHANGED');
    const key = 'export-' + edition.collectionId;
    if (!journal.exports[key]) { journal.exports[key] = randomBytes(16).toString('hex'); await persist(); }
    const exported = await original(collection.host, '/api/collections/' + edition.collectionId + '/export',
      { expectedManifestSha256: snapshot.manifestSha256, exportId: journal.exports[key] });
    const root = join(config.outputDirectory, 'collection-exports', name), files = [];
    for (const item of exported.files)
      files.push(await receiveFile(collection.host, item, memberPath(root, item.name), signal));
    await artifact('collection-exports/' + name + '/native-export.json', { ...exported,
      files: exported.files.map(({ downloadUrl, ...file }) => file), received: files });
    await artifact('collections/' + name + '.json', snapshot);
    return { collectionId: edition.collectionId, manifestSha256: snapshot.manifestSha256, files,
      snapshotPath: join(config.outputDirectory, 'collections', name + '.json') };
  }
  async function packageDelivery(result) {
    aborted(); journal.stage = 'PACKAGE_DELIVERY'; await persist(); progress(journal.stage);
    const archivePath = config.outputDirectory + '.tar.gz', temporary = archivePath + '.partial';
    await runFile('tar', ['--create', '--gzip', '--file', temporary, '--directory', config.outputDirectory, '.'],
      { signal, maxBuffer: 1024 * 1024 });
    await chmod(temporary, 0o600); await rename(temporary, archivePath);
    const delivery = { ...result, archive: await fileIdentity(archivePath) };
    await saveJSON(config.outputDirectory + '.delivery.json', delivery, true);
    journal.completed.FINISHED = { resultPath: join(config.outputDirectory, 'RESULT.json'),
      archive: delivery.archive };
    journal.stage = 'FINISHED'; await persist();
    progress('FINISHED', { archive: delivery.archive }); return delivery;
  }
  async function checkReceivingSource() {
    await directory(config.source.repository);
    const head = (await runFile('git', ['-C', config.source.repository, 'rev-parse', 'HEAD'])).stdout.trim();
    need(head === config.source.commit, 'RECEIVING_CHECKOUT_COMMIT_CHANGED');
    const sourceRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
    need(within(config.source.repository, sourceRoot), 'RECEIVING_ORIGINAL_CHECKOUT_REQUIRED');
    const receiverPaths = [fileURLToPath(import.meta.url),
      fileURLToPath(new URL('./product-collections-browser.mjs', import.meta.url))]
      .map(path => relative(config.source.repository, path));
    await runFile('git', ['-C', config.source.repository, 'ls-files', '--error-unmatch', '--', ...receiverPaths]);
    const dirty = (await runFile('git', ['-C', config.source.repository, 'status', '--porcelain',
      '--untracked-files=no', '--', relative(config.source.repository, sourceRoot)])).stdout;
    need(dirty.trim() === '', 'RECEIVING_ORIGINAL_SOURCE_HAS_UNCOMMITTED_CHANGES');
    return head;
  }
  try {
    journal = await optionalJSON(journalFile);
    if (journal) need(journal.schema === JOURNAL_SCHEMA && journal.inputSha256 === inputHash,
      'RECEIVING_ORIGINAL_INPUT_CHANGED');
    else {
      journal = { schema: JOURNAL_SCHEMA, operationId: config.operationId, inputSha256: inputHash,
        sourceCommit: config.source.commit, createdAt: startedAt, stage: 'RETAIN_INPUTS',
        completed: {}, ids: {}, exports: {}, plans: [], selectedInputs: [] };
      const selectedInput = join(config.outputDirectory, 'input.json');
      const previousInput = await optionalJSON(selectedInput);
      if (previousInput) need(sha(encoded(previousInput)) === inputHash, 'RECEIVING_ORIGINAL_INPUT_CHANGED');
      else await saveJSON(selectedInput, config);
      journalBound = true; await persist();
    }
    journalBound = true;
    if (journal.completed.FINISHED) {
      const delivery = await optionalJSON(config.outputDirectory + '.delivery.json');
      if (delivery && await present(delivery.archive.path)) {
        const observed = await fileIdentity(delivery.archive.path);
        need(observed.sha256 === delivery.archive.sha256 && observed.bytes === delivery.archive.bytes,
          'RECEIVING_RETAINED_DELIVERY_CHANGED');
        return delivery;
      }
    }
    if (journal.completed.PRODUCT_JOURNEY)
      return await packageDelivery(journal.completed.PRODUCT_JOURNEY);
    const currentSource = await checkReceivingSource();
    await step('ORIGINAL_HOST_AND_INPUTS', async () => {
      await directory(config.source.repository);
      await directory(config.runtime.workspaceDirectory, { privateMode: true });
      await directory(config.runtime.install.cache);
      const originalState = await directory(config.recovery.stateRoot, { privateMode: true });
      const retainedParent = await directory(dirname(config.recovery.retainedStateRoot));
      need(originalState.dev === retainedParent.dev, 'RECEIVING_RETAINED_ROOT_SAME_FILESYSTEM_REQUIRED');
      need(!await present(config.recovery.retainedStateRoot), 'RECEIVING_RETAINED_ROOT_ALREADY_EXISTS');
      for (const path of [config.source.python, config.recovery.python,
        config.browser.playwrightModule, config.browser.executablePath]) {
        need((await lstat(await realpath(path))).isFile(), 'RECEIVING_EXISTING_RUNTIME_FILE_REQUIRED');
      }
      const head = currentSource;
      await runFile('flock', ['--version']);
      const browserVersion = (await runFile(config.browser.executablePath, ['--version'])).stdout.trim();
      await directory(join(config.outputDirectory, 'inputs'), { create: true, privateMode: true });
      const plans = [];
      for (let index = 0; index < config.collections.planFiles.length; index++) {
        const path = config.collections.planFiles[index], raw = await regular(path);
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), plan = validateCollectionPlan(value.plan ?? value);
        need(plan.requests.length >= 2, 'RECEIVING_MULTI_REQUEST_PLAN_REQUIRED');
        const period = config.collections.periods[index];
        need(plan.parameters.every(parameter => Object.hasOwn(period.values, parameter.name)),
          'RECEIVING_EXPLICIT_PERIOD_VALUES_REQUIRED');
        const resolved = resolveCollectionEdition(plan, { planId: plan.id, planSha256: sha(encoded(plan)),
          collectionId: period.collectionId, name: period.name, values: period.values });
        const retained = join(config.outputDirectory, 'inputs', 'plan-' + index + '.json');
        // Retain the complete original definition before its source state is moved.
        const before = await optionalJSON(retained);
        if (before) need(stableJson(before) === stableJson(plan), 'RECEIVING_RETAINED_PLAN_INPUT_CHANGED');
        else await saveJSON(retained, plan);
        plans.push({ originalPath: path, originalBytes: raw.length, originalSha256: sha(raw),
          retained, planId: plan.id, definitionSha256: sha(encoded(plan)) });
        for (const selected of resolved.requests) {
          for (const key of ['discoveryFile', 'bodyFile', 'ticketFile', 'operatorConfigFile']) {
            if (!selected[key]) continue;
            const identity = await fileIdentity(absolute(selected[key]));
            journal.selectedInputs.push({ period: period.collectionId, request: selected.key, kind: key, ...identity });
          }
          if (selected.operatorWorkspace) await directory(selected.operatorWorkspace, { privateMode: true });
        }
      }
      need(plans[0].planId === plans[1].planId && plans[0].definitionSha256 !== plans[1].definitionSha256,
        'RECEIVING_DISTINCT_REVISIONS_OF_SAME_PLAN_REQUIRED');
      journal.planInputs = plans; await persist();
      await artifact('inputs/original-source-identities.json', journal.selectedInputs);
      return { node: process.version, platform: process.platform, arch: process.arch, browserVersion,
        sourceCommit: head, receiver: await fileIdentity(fileURLToPath(import.meta.url)),
        browserDriver: await fileIdentity(fileURLToPath(new URL('./product-collections-browser.mjs', import.meta.url))),
        plans };
    });
    if (config.customerUse) await step('RETAIN_CUSTOMER_USE_INPUTS', customerUseInputs);
    browser = await openProductCollectionsBrowser({ ...config.browser, outputDirectory: config.outputDirectory });
    runtimeServer = await startRuntimeWorkspace({ directory: config.runtime.workspaceDirectory, port: 0 });
    runtimeHost = endpoint(runtimeServer.url, 'runtime');
    const source = await step('SOURCE_PRODUCT_SELECTION', async () => {
      runtimePage = await browser.runtimePage(runtimeServer.url);
      const selection = await browser.sourceDiscovery(runtimePage, config.source);
      const originalProduct = await original(runtimeHost, '/api/source-builds/product',
        { repository: config.source.repository, ref: config.source.commit, selection: 'all',
          offline: config.source.offline, python: config.source.python });
      const full = selection.details.find(value => value.id === 'all');
      const peers = originalProduct.runtimeRequirements?.featurePeers ?? {};
      const manifestOnly = full.runtime.features.filter(group => group.manifestPath
        && !Object.hasOwn(peers, group.name));
      need(manifestOnly.length > 0, 'RECEIVING_MANIFEST_ADAPTER_GROUPS_REQUIRED');
      for (const group of manifestOnly) need(selection.comparison.rows.some(row => row.name === group.name
        && row.values.some(value => value?.manifestPath === group.manifestPath)),
      'RECEIVING_MANIFEST_ADAPTER_COMPARISON_MISSING');
      await artifact('source/product-selection.json', { ...selection, manifestOnly });
      await artifact('source/full-toolkit-original-description.json', originalProduct);
      return { review: selection.review, manifestOnly, productIds: selection.comparison.selections };
    });
    const build = await step('BUILD_ORIGINAL_FULL_TOOLKIT', async () => {
      const review = await original(runtimeHost, '/api/source-builds/review?reviewId=' + source.review.reviewId);
      need(review.selectionSha256 === source.review.selectionSha256, 'RECEIVING_SAVED_BUILD_REVIEW_CHANGED');
      const operation = await runRuntime('source-build', { operation: 'source-build',
        requestId: review.requestId, reviewId: review.reviewId, selectionSha256: review.selectionSha256 },
      { sourceBuild: true });
      const result = operation.result;
      need(result.status === 'SOURCE_READY' && result.build?.sourceCommit === config.source.commit
        && result.archive?.id, 'RECEIVING_ORIGINAL_SOURCE_BUILD_INCOMPLETE');
      await artifact('source/original-build-operation.json', operation);
      const download = await original(runtimeHost, '/api/source-builds/download', { reviewId: review.reviewId });
      const file = await receiveFile(runtimeHost, download,
        join(config.outputDirectory, 'source', basename(download.file)), signal);
      return { archiveId: result.archive.id, archive: file, operationId: operation.id, reviewId: review.reviewId };
    });
    await step('INSTALL_OR_OPEN_EXACT_RUNTIME', async () => {
      const profile = await original(runtimeHost, '/api/review',
        { archiveId: build.archiveId, selection: config.runtime.profile });
      let directoryName, runtimeId;
      if (config.runtime.installedDirectory) {
        const inspection = await inspectRuntimeInstall({ directory: config.runtime.installedDirectory, load: false, source: true,
          python: config.source.python });
        need(inspection.sourceCommit === config.source.commit && inspection.profileId === profile.profileId
          && inspection.ready === true && inspection.status === 'READY', 'RECEIVING_EXISTING_INSTALLED_SELECTION_CHANGED');
        const attached = await original(runtimeHost, '/api/attach', { directory: config.runtime.installedDirectory });
        directoryName = config.runtime.installedDirectory; runtimeId = attached.runtimeId;
      } else {
        const prepared = await runRuntime('prepare-runtime', { operation: 'prepare', archiveId: build.archiveId,
          name: config.runtime.name, selection: profile.selection, profileId: profile.profileId });
        runtimeId = prepared.runtimeId;
        const state = await original(runtimeHost, '/api/state');
        directoryName = state.runtimes.find(value => value.id === runtimeId)?.directory;
        need(directoryName, 'RECEIVING_PREPARED_RUNTIME_MISSING');
        disjoint(config.recovery.stateRoot, directoryName);
        const inspection = await inspectRuntimeInstall({ directory: directoryName, load: false });
        if (!inspection.ready || inspection.status !== 'READY') {
          // Each invocation continues the same installer directory once. A prior
          // terminal install attempt remains retained under its original request.
          const oldId = journal.ids['install-runtime'];
          const old = oldId && state.operations.find(value => value.id === oldId);
          if (old?.phase === 'FAILED') {
            (journal.previousInstallRequests ??= []).push(oldId);
            delete journal.ids['install-runtime']; await persist();
          }
          await runRuntime('install-runtime', { operation: 'install', runtimeId, ...config.runtime.install });
        }
      }
      const inspection = await inspectRuntimeInstall({ directory: directoryName, load: true, source: true,
        python: config.source.python });
      need(inspection.ready === true && inspection.status === 'READY' && inspection.sourceCommit === config.source.commit
        && inspection.profileId === profile.profileId, 'RECEIVING_INSTALLED_PRODUCT_NOT_READY');
      journal.runtime = { directory: directoryName, runtimeId, profileId: profile.profileId,
        sourceCommit: inspection.sourceCommit, sourceRoot: inspection.sourceRoot };
      await persist(); await artifact('runtime/installed-product.json', inspection);
      return journal.runtime;
    });
    await step('REOPEN_INSTALLED_SOURCE_CONTROLS', async () => {
      await runtimePage?.close();
      await runtimeServer.close();
      runtimeServer = await startRuntimeWorkspace({ directory: config.runtime.workspaceDirectory, port: 0 });
      runtimeHost = endpoint(runtimeServer.url, 'runtime');
      runtimePage = await browser.runtimePage(runtimeServer.url);
      await browser.reopenSource(runtimePage, source.review);
      const profile = await browser.runtimeReady(runtimePage, journal.runtime.runtimeId, build.archiveId, config.runtime.profile);
      need(profile.profileId === journal.runtime.profileId, 'RECEIVING_VISIBLE_RUNTIME_PROFILE_CHANGED');
      const command = await runtimeCommand({ directory: journal.runtime.directory,
        args: ['product-catalog', 'compare', '--repo', config.source.repository, '--ref', config.source.commit,
          '--python', config.source.python, ...config.source.compareSelections.flatMap(id => ['--selection', id])] });
      const executed = await runFile(command.executable, command.args, { cwd: command.cwd,
        maxBuffer: 16 * 1024 * 1024, signal });
      const value = JSON.parse(executed.stdout);
      need(value.sourceCommit === config.source.commit, 'RECEIVING_INSTALLED_CATALOG_SOURCE_CHANGED');
      await artifact('source/installed-cli-comparison.json', value);
      return { sourceCommit: command.sourceCommit, runtimeId: journal.runtime.runtimeId,
        reviewId: source.review.reviewId };
    });
    if (!journal.move) {
      await startCollection('collections');
      collectionsPage = await browser.collectionsPage(collection.url);
      await step('SAVE_TWO_PLAN_REVISIONS', async () => {
        for (let index = 0; index < 2; index++) {
          if (!journal.plans[index]) {
            journal.plans[index] = await browser.savePlan(collectionsPage, journal.planInputs[index].retained);
            await persist();
          }
        }
        need(journal.plans[0].id === journal.plans[1].id
          && journal.plans[0].planSha256 !== journal.plans[1].planSha256, 'RECEIVING_SAVED_REVISIONS_CHANGED');
        await browser.openPlan(collectionsPage, journal.plans[0]);
        const period = config.collections.periods[0], saved = journal.plans[0];
        const resolved = resolveCollectionEdition(saved.plan, { planId: saved.id, planSha256: saved.planSha256,
          collectionId: period.collectionId, name: period.name, values: period.values });
        const sourceCatalog = await browser.inspectSavedCatalog(collectionsPage, resolved.requests[0].discoveryFile);
        await artifact('collections/original-catalog-inspection.json', sourceCatalog);
        await artifact('collections/saved-plan-revisions.json', journal.plans);
        return journal.plans.map(value => ({ id: value.id, planSha256: value.planSha256 }));
      });
      if (config.customerUse) await step('SAVE_ORIGINAL_CUSTOMER_USE', saveCustomerUse);
      const first = await step('CREATE_FIRST_PERIOD', async () => {
        let edition = await ensureEdition(0);
        edition = config.customerUse ? await customerUsePeriod(0, 'create', edition)
          : await browser.createPeriod(collectionsPage, edition);
        need(edition.phase === 'CREATED', 'RECEIVING_FIRST_PERIOD_NOT_CREATED');
        if (config.collections.enqueueFirstPeriod) {
          const queued = await original(collection.host, '/api/collections/' + edition.collectionId + '/enqueue',
            { expectedManifestSha256: edition.collection.manifestSha256 });
          await artifact('collections/first-period-original-enqueue.json', queued);
          need(queued.action.results.length === queued.itemCount
            && queued.items.every(item => item.state === 'QUEUED'), 'RECEIVING_ORIGINAL_QUEUE_REVIEW_REQUIRED');
          edition = await original(collection.host, '/api/composer/editions/' + edition.collectionId);
        }
        const shown = await browser.showCollection(collectionsPage, edition, 'first-period-original-collection');
        const exported = await retainCollection(shown.edition, 'first-period');
        return { ...exported, editionSha256: shown.edition.editionSha256,
          planSha256: shown.edition.planSha256, workspaceByIntent: shown.workspaceByIntent };
      });
      await step('PREPARE_LATER_PERIOD_FOR_RECOVERY', async () => {
        const edition = await ensureEdition(1);
        need(edition.phase === 'PREPARED' && !edition.collection,
          'RECEIVING_LATER_PERIOD_MUST_BE_PREPARED_BEFORE_BACKUP');
        await browser.showPrepared(collectionsPage, edition.collectionId, 'later-period-before-recovery');
        await artifact('collections/later-period-before-recovery.json', edition);
        return { collectionId: edition.collectionId, editionSha256: edition.editionSha256,
          planSha256: edition.planSha256, previewSha256: edition.preview.previewSha256 };
      });
      const backup = await step('SNAPSHOT_ORIGINAL_STATE', async () => {
        const review = await original(collection.host, '/api/recovery/review',
          { stateRoot: config.recovery.stateRoot });
        await artifact('recovery/original-review.json', review);
        const saved = await recovery('snapshot', 'SNAPSHOT', {
          stateRoot: config.recovery.stateRoot, output: join(config.outputDirectory, 'original-encrypted-backup'),
          expectedReviewSha256: review.profile.reviewSha256, passEnv: config.recovery.passphraseEnv, quiesced: true });
        need(HASH.test(saved.result?.recordSha256 ?? ''), 'RECEIVING_SNAPSHOT_RECORD_REQUIRED');
        const download = await original(collection.host, '/api/recovery/' + saved.requestId + '/files', {});
        need(download.recordSha256 === saved.result.recordSha256, 'RECEIVING_ENCRYPTED_BACKUP_CHANGED');
        const root = join(config.outputDirectory, 'received-encrypted-backup'), files = [];
        for (const item of download.files)
          files.push(await receiveFile(collection.host, item, memberPath(root, item.relativePath), signal));
        await artifact('recovery/received-members.json', { recordSha256: download.recordSha256, files });
        await browser.showRecovery(collectionsPage, saved.requestId, 'original-encrypted-backup');
        return { bundle: root, recordSha256: saved.result.recordSha256, requestId: saved.requestId, files };
      });
      await collectionsPage.close(); collectionsPage = null;
      await closeCollection();
      await runtimePage?.close(); runtimePage = null;
      await runtimeServer.close(); runtimeServer = null;
      const originalRoot = await directory(config.recovery.stateRoot, { privateMode: true });
      need(!await present(config.recovery.retainedStateRoot), 'RECEIVING_RETAINED_ROOT_ALREADY_EXISTS');
      journal.move = { phase: 'INTENT', original: config.recovery.stateRoot,
        retained: config.recovery.retainedStateRoot, dev: String(originalRoot.dev), ino: String(originalRoot.ino),
        backupRecordSha256: backup.recordSha256, firstManifestSha256: first.manifestSha256 };
      await persist();
    }
    await step('RETAIN_ORIGINAL_STATE_ROOT', async () => {
      let retained = await present(config.recovery.retainedStateRoot);
      if (!retained) {
        const sourceRoot = await directory(config.recovery.stateRoot, { privateMode: true });
        need(String(sourceRoot.dev) === journal.move.dev && String(sourceRoot.ino) === journal.move.ino,
          'RECEIVING_ORIGINAL_STATE_ROOT_CHANGED');
        await rename(config.recovery.stateRoot, config.recovery.retainedStateRoot);
        for (const parent of new Set([dirname(config.recovery.stateRoot), dirname(config.recovery.retainedStateRoot)])) {
          const handle = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY);
          try { await handle.sync(); } finally { await handle.close(); }
        }
        retained = await directory(config.recovery.retainedStateRoot, { privateMode: true });
      }
      need(String(retained.dev) === journal.move.dev && String(retained.ino) === journal.move.ino,
        'RECEIVING_RETAINED_ORIGINAL_STATE_CHANGED');
      journal.move.phase = 'RETAINED'; await persist();
      return { path: config.recovery.retainedStateRoot, originalPath: config.recovery.stateRoot };
    });
    await startCollection('receiving');
    collectionsPage = await browser.collectionsPage(collection.url);
    const backup = journal.completed.SNAPSHOT_ORIGINAL_STATE;
    const verified = await step('VERIFY_RECEIVED_ENCRYPTED_BACKUP', async () => {
      const value = await recovery('verify-received', 'VERIFY', { bundle: backup.bundle,
        passEnv: config.recovery.passphraseEnv, python: config.recovery.python, expected: backup.recordSha256,
        expectedStateRoot: config.recovery.stateRoot });
      need(value.result.recordSha256 === backup.recordSha256
        && value.result.application?.profile?.stateRoot === config.recovery.stateRoot,
      'RECEIVING_ORIGINAL_BACKUP_SELECTION_CHANGED');
      await browser.showRecovery(collectionsPage, value.requestId, 'received-backup-verified');
      return value;
    });
    const restored = await step('RESTORE_ORIGINAL_STATE', async () => {
      const value = await recovery('restore-original', 'RESTORE', { bundle: backup.bundle,
        passEnv: config.recovery.passphraseEnv, python: config.recovery.python,
        expected: verified.result.recordSha256, expectedStateRoot: config.recovery.stateRoot });
      need(value.result.recordSha256 === backup.recordSha256, 'RECEIVING_RESTORED_RECORD_CHANGED');
      journal.move.phase = 'RESTORED'; await persist();
      return value;
    });
    const status = await original(collection.host, '/api/status');
    if (status.directory === null) {
      await original(collection.host, '/api/recovery/' + restored.requestId + '/open', {});
      // Reconnect the same browser to the adopted native store and original composer.
      await collectionsPage.goto(collection.url);
      await collectionsPage.locator('#open-composer').waitFor({ state: 'visible' });
    } else need(status.directory === config.collections.directory, 'RECEIVING_RESTORED_COLLECTION_STORE_CHANGED');
    if (config.customerUse) await step('RECEIVE_ORIGINAL_CUSTOMER_USE_HISTORY',
      () => verifyCustomerUse('after-native-restore'));
    await step('REOPEN_SAVED_PLANS_AND_CREATE_LATER_PERIOD', async () => {
      for (const plan of journal.plans) {
        const reopened = await browser.openPlan(collectionsPage, plan);
        need(stableJson(reopened.plan) === stableJson(plan.plan), 'RECEIVING_RESTORED_PLAN_CHANGED');
      }
      let edition = await browser.showPrepared(collectionsPage,
        config.collections.periods[1].collectionId, 'later-period-after-recovery');
      const previous = journal.completed.PREPARE_LATER_PERIOD_FOR_RECOVERY;
      need(edition.editionSha256 === previous.editionSha256 && edition.planSha256 === previous.planSha256
        && edition.preview?.previewSha256 === previous.previewSha256
        && ['PREPARED', 'CREATED'].includes(edition.phase), 'RECEIVING_RESTORED_PERIOD_CHANGED');
      edition = config.customerUse ? await customerUsePeriod(1, 'create', edition)
        : await browser.createPeriod(collectionsPage, edition);
      const shown = await browser.showCollection(collectionsPage, edition, 'later-period-restored-collection');
      const exported = await retainCollection(shown.edition, 'later-period');
      return { ...exported, editionSha256: shown.edition.editionSha256,
        planSha256: shown.edition.planSha256, workspaceByIntent: shown.workspaceByIntent };
    });
    await collectionsPage.close(); collectionsPage = null; await closeCollection();
    await startCollection('collections');
    collectionsPage = await browser.collectionsPage(collection.url);
    await step('REOPEN_FINAL_INSTALLED_WORKSPACE', async () => {
      const periods = [];
      for (let index = 0; index < 2; index++) {
        const saved = index === 0 ? journal.completed.CREATE_FIRST_PERIOD
          : journal.completed.REOPEN_SAVED_PLANS_AND_CREATE_LATER_PERIOD;
        const edition = await original(collection.host, '/api/composer/editions/' + saved.collectionId);
        need(edition.phase === 'CREATED' && edition.collection.manifestSha256 === saved.manifestSha256
          && edition.editionSha256 === saved.editionSha256, 'RECEIVING_FINAL_COLLECTION_IDENTITY_CHANGED');
        const shown = await browser.showCollection(collectionsPage, edition, 'final-period-' + (index + 1));
        periods.push({ collectionId: edition.collectionId, manifestSha256: edition.collection.manifestSha256,
          editionSha256: edition.editionSha256, workspaceByIntent: shown.workspaceByIntent });
      }
      await browser.openPlan(collectionsPage, journal.plans[0]);
      await browser.capture(collectionsPage, 'final-original-plan-revision',
        collectionsPage.locator('#composer-panel'));
      return { periods, installedSourceCommit: journal.runtime.sourceCommit,
        restoredStateRoot: config.recovery.stateRoot, retainedOriginalStateRoot: config.recovery.retainedStateRoot };
    });

    if (config.customerUse) {
      const buyerReturn = await step('CAPTURE_ORIGINAL_CUSTOMER_USE_RETURN', receiveCustomerUseReturn);
      await collectionsPage.close(); collectionsPage = null; await closeCollection();
      await startCollection('collections');
      collectionsPage = await browser.collectionsPage(collection.url);
      await step('REOPEN_EXACT_CUSTOMER_USE_RETURN', async () => {
        const original = await verifyCustomerUse('final-native-reopen');
        const returned = await receiveFile(collection.host, { bytes: buyerReturn.file.bytes, sha256: buyerReturn.file.sha256,
          url: '/api/customer-use/commissions/' + buyerReturn.commissionId + '/returns/' + buyerReturn.captureRequestId },
        join(config.outputDirectory, 'customer-use', 'reopened-original-buyer-return.json'), signal);
        need(returned.sha256 === buyerReturn.file.sha256, 'RECEIVING_REOPENED_BUYER_RETURN_CHANGED');
        await browser.showCustomerUse(collectionsPage, journal.customerUseRevisions[1], 'reopened-customer-use-return', {
          requestId: buyerReturn.captureRequestId, returnSha256: buyerReturn.file.sha256 });
        return { original, returned, commissionId: buyerReturn.commissionId, captureRequestId: buyerReturn.captureRequestId };
      });
      const finalReview = await step('REVIEW_FINAL_CUSTOMER_USE_NATIVE_BACKUP', async () => {
        const review = await original(collection.host, '/api/recovery/review', { stateRoot: config.recovery.stateRoot });
        need(HASH.test(review.profile?.reviewSha256 ?? ''), 'RECEIVING_FINAL_BACKUP_REVIEW_REQUIRED');
        await artifact('customer-use/final-native-recovery-review.json', review);
        return review;
      });
      await step('FINAL_CUSTOMER_USE_NATIVE_BACKUP', async () => {
        const review = finalReview;
        const saved = await recovery('customer-use-final-snapshot', 'SNAPSHOT', {
          stateRoot: config.recovery.stateRoot, output: join(config.outputDirectory, 'customer-use-final-encrypted-backup'),
          expectedReviewSha256: review.profile.reviewSha256, passEnv: config.recovery.passphraseEnv, quiesced: true });
        need(HASH.test(saved.result?.recordSha256 ?? ''), 'RECEIVING_FINAL_CUSTOMER_USE_BACKUP_REQUIRED');
        const selected = await original(collection.host, '/api/recovery/' + saved.requestId + '/files', {});
        need(selected.recordSha256 === saved.result.recordSha256, 'RECEIVING_FINAL_CUSTOMER_USE_BACKUP_CHANGED');
        const root = join(config.outputDirectory, 'received-customer-use-final-backup'), files = [];
        for (const item of selected.files)
          files.push(await receiveFile(collection.host, item, memberPath(root, item.relativePath), signal));
        const verified = await recovery('verify-customer-use-final-snapshot', 'VERIFY', {
          bundle: root, passEnv: config.recovery.passphraseEnv, python: config.recovery.python,
          expected: saved.result.recordSha256, expectedStateRoot: config.recovery.stateRoot });
        need(verified.result.recordSha256 === saved.result.recordSha256,
          'RECEIVING_FINAL_CUSTOMER_USE_BACKUP_VERIFICATION_CHANGED');
        await browser.showRecovery(collectionsPage, saved.requestId, 'complete-customer-use-backup');
        return { requestId: saved.requestId, verifyRequestId: verified.requestId,
          recordSha256: saved.result.recordSha256, bundle: root, files };
      });
    }

    await collectionsPage.close(); collectionsPage = null; await closeCollection();
    if (runtimePage) { await runtimePage.close(); runtimePage = null; }
    if (runtimeServer) { await runtimeServer.close(); runtimeServer = null; }
    const views = await browser.finish(); await browser.close(); browser = null;
    need(views.failures.length === 0, 'RECEIVING_BROWSER_APPLICATION_ERROR');
    const result = { schema: 'stellar-forge.product-collections-receiving-result.v1',
      operationId: config.operationId, sourceCommit: config.source.commit, completedAt: new Date().toISOString(),
      runtime: journal.runtime, source: { ...build, manifestOnly: source.manifestOnly },
      plans: journal.plans.map(value => ({ id: value.id, planSha256: value.planSha256 })),
      periods: journal.completed.REOPEN_FINAL_INSTALLED_WORKSPACE.periods,
      backup: { requestId: backup.requestId, recordSha256: backup.recordSha256, bundle: backup.bundle },
      restoreRequestId: restored.requestId, originalStateRoot: config.recovery.stateRoot,
      retainedOriginalStateRoot: config.recovery.retainedStateRoot, views: views.artifacts,
      originalRequestIds: journal.ids,
      ...(config.customerUse ? { customerUse: {
        source: journal.completed.SAVE_ORIGINAL_CUSTOMER_USE,
        restored: journal.completed.RECEIVE_ORIGINAL_CUSTOMER_USE_HISTORY,
        buyerReturn: journal.completed.CAPTURE_ORIGINAL_CUSTOMER_USE_RETURN,
        reopened: journal.completed.REOPEN_EXACT_CUSTOMER_USE_RETURN,
        finalBackup: journal.completed.FINAL_CUSTOMER_USE_NATIVE_BACKUP,
        originalRequestIds: config.customerUse.requestIds,
        execution: 'Existing Collections operator owns approvals and native buyer execution; this receiver captures actual retained results.'
      } } : {}) };
    await artifact('RESULT.json', result);
    journal.completed.PRODUCT_JOURNEY = result; await persist();
    return await packageDelivery(result);
  } catch (error) {
    failure = error;
    if (journalBound) {
      journal.lastFailure = { at: new Date().toISOString(), stage: journal.stage,
        code: error.code || error.name, message: String(error.message).slice(0, 4000),
        ...(error.operationId ? { operationId: error.operationId } : {}),
        ...(error.requestId ? { requestId: error.requestId } : {}) };
      await persist();
    }
    if (browser) await browser.finish();
    throw error;
  } finally {
    await collectionsPage?.close().catch(() => {});
    await runtimePage?.close().catch(() => {});
    await closeCollection().catch(error => { if (!failure) throw error; });
    await runtimeServer?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await lease.close();
  }
}
const HELP = 'Receive product source, installed Collections and original recovery:\n'
  + '  node distribution/receiving/product-collections-receiving.mjs --input /absolute/existing-case.json\n'
  + 'See PRODUCT_COLLECTIONS_RECEIVING.md for the complete original-input contract and resume behavior.\n';
export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(HELP); return;
  }
  need(args.length === 2 && args[0] === '--input', 'RECEIVING_INPUT_ARGUMENT_REQUIRED');
  const path = absolute(args[1]), input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await regular(path)));
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await receiveProductCollections(input, { signal: controller.signal,
      onProgress: value => process.stdout.write(JSON.stringify(value) + '\n') });
    process.stdout.write(JSON.stringify({ status: 'RECEIVED', operationId: result.operationId,
      sourceCommit: result.sourceCommit, archive: result.archive,
      delivery: result.archive.path.replace(/\.tar\.gz$/, '.delivery.json') }) + '\n');
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => { process.stderr.write((error.code || error.name) + ': ' + error.message + '\n'); process.exitCode = 1; });
