// MIT. Offline, host-declared access to the original complete-host handoff.
import { constants } from 'node:fs';
import { open, lstat, realpath, readdir } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { hostSetupControlDirectory } from './host-handoff-setup-state.mjs';

export const HOST_HANDOFF_CONNECTION_SCHEMA = 'stellar-forge.recovery-host-handoff-connection.v1';
const PLAN_SCHEMA = 'stellar-forge.merchant-recovery-plan.v1';
const HANDOFF_SCHEMA = 'stellar-forge.recovery-workspace-handoff.v1';
const SELECTION_SCHEMA = 'stellar-forge.recovery-workspace-handoff-selection.v1';
const TARGET_SCHEMA = 'stellar-forge.recovery-workspace-handoff-target.v1';
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/, HASH = /^[a-f0-9]{64}$/;
const PASS = /^[A-Z][A-Z0-9_]{4,63}$/, ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const MAX_PLAN = 256 * 1024, MAX_CONNECTION = 1024 * 1024, MAX_CAPTURE = 2 * 1024 * 1024;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const fault = (code, message) => Object.assign(new Error(message), { code });
const need = (ok, code, message = code) => { if (!ok) throw fault(code, message); };
const exact = (value, allowed, required = []) => need(plain(value) &&
  Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)),
'HOST_HANDOFF_AGENT_ARGUMENTS', 'Use only the declared host alias and original review fields.');
const inside = (a, b) => a === b || b.startsWith(a + sep);
const overlaps = (a, b) => inside(a, b) || inside(b, a);
function path(value, label) {
  need(typeof value === 'string' && value.length > 1 && value.length <= 4096 &&
    !/[\x00-\x1f\x7f]/.test(value) && isAbsolute(value) && resolve(value) === value && value !== sep,
  'HOST_HANDOFF_AGENT_PATH', 'Use a normalized absolute host path for ' + label + '.');
  return value;
}
function hash(value, label) {
  need(typeof value === 'string' && HASH.test(value), 'HOST_HANDOFF_AGENT_HASH',
    'Use the complete original SHA-256 for ' + label + '.');
  return value;
}
async function canonical(pathname) {
  let selected = pathname;
  for (;;) {
    try {
      const stat = await lstat(selected);
      need(!stat.isSymbolicLink() && await realpath(selected) === selected,
        'HOST_HANDOFF_AGENT_PATH_CHANGED', 'Use canonical original path components: ' + pathname);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(selected);
      need(parent !== selected, 'HOST_HANDOFF_AGENT_PATH_CHANGED');
      selected = parent;
    }
  }
}
async function privateBytes(filename, maximum, optional = false) {
  await canonical(filename);
  let fd;
  try { fd = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  try {
    const before = await fd.stat({ bigint: true });
    need(before.isFile() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(maximum) &&
      typeof process.getuid === 'function' && before.uid === BigInt(process.getuid()) && (before.mode & 0o077n) === 0n,
    'HOST_HANDOFF_AGENT_PRIVATE_FILE', 'Use a complete bounded private file owned by this operator: ' + filename);
    const result = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    while (count < result.length) {
      const { bytesRead } = await fd.read(result, count, result.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    const after = await fd.stat({ bigint: true }), named = await lstat(filename, { bigint: true });
    need(count === Number(before.size) && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink', 'uid', 'mode']
      .every(key => before[key] === after[key] && after[key] === named[key]),
    'HOST_HANDOFF_AGENT_FILE_CHANGED', 'The original private file changed while being read.');
    await canonical(filename);
    return result.subarray(0, count);
  } finally { await fd.close(); }
}
function json(raw, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw fault('HOST_HANDOFF_AGENT_JSON', 'Use complete UTF-8 JSON for ' + label + '.'); }
}
function normalize(value) {
  exact(value, ['schema', 'hosts'], ['schema', 'hosts']);
  need(value.schema === HOST_HANDOFF_CONNECTION_SCHEMA && plain(value.hosts) &&
    Object.keys(value.hosts).length > 0 && Object.keys(value.hosts).length <= 100,
  'HOST_HANDOFF_AGENT_CONFIGURATION', 'Declare 1–100 original host aliases.');
  const hosts = Object.create(null);
  for (const [name, input] of Object.entries(value.hosts)) {
    need(ALIAS.test(name), 'HOST_HANDOFF_AGENT_ALIAS');
    exact(input, ['label', 'bundleDirectory', 'passphraseEnv', 'selectionFile', 'planFile',
      'captureOperationDirectory', 'restoreDirectory', 'targetFile', 'adoptionOperationDirectory', 'python'],
    ['label', 'bundleDirectory', 'passphraseEnv']);
    need(typeof input.label === 'string' && input.label.trim() && input.label.length <= 160 &&
      !/[\x00-\x1f\x7f]/.test(input.label), 'HOST_HANDOFF_AGENT_CONFIGURATION', 'Use a readable one-line host label.');
    need(PASS.test(input.passphraseEnv ?? ''), 'HOST_HANDOFF_AGENT_CONFIGURATION',
      'Declare only the original passphrase environment name, never its value.');
    const entry = { label: input.label, bundleDirectory: path(input.bundleDirectory, 'bundleDirectory'),
      passphraseEnv: input.passphraseEnv };
    const source = ['selectionFile', 'planFile', 'captureOperationDirectory'];
    const receiving = ['restoreDirectory', 'targetFile', 'adoptionOperationDirectory'];
    const hasSource = source.some(key => input[key] !== undefined);
    const hasReceiving = receiving.some(key => input[key] !== undefined);
    need(hasSource || hasReceiving, 'HOST_HANDOFF_AGENT_CONFIGURATION', 'Declare a complete source or receiving group.');
    for (const [enabled, keys] of [[hasSource, source], [hasReceiving, receiving]]) if (enabled)
      for (const key of keys) entry[key] = path(input[key], key);
    if (input.python !== undefined) {
      need(hasReceiving, 'HOST_HANDOFF_AGENT_CONFIGURATION', 'Python belongs to the original receiving operation.');
      entry.python = path(input.python, 'python');
    }
    const directories = ['bundleDirectory', 'captureOperationDirectory', 'restoreDirectory', 'adoptionOperationDirectory']
      .filter(key => entry[key]).map(key => entry[key]);
    need(directories.every((a, i) => directories.slice(i + 1).every(b => !overlaps(a, b))),
      'HOST_HANDOFF_AGENT_CONTROL_OVERLAP', 'Keep bundle, capture, restored tree and adoption controls disjoint.');
    const files = ['selectionFile', 'planFile', 'targetFile'].filter(key => entry[key]).map(key => entry[key]);
    need(new Set(files).size === files.length &&
      files.every(a => directories.every(b => !overlaps(a, b))),
    'HOST_HANDOFF_AGENT_CONTROL_OVERLAP', 'Keep original selection, plan and target files outside mutable control trees.');
    hosts[name] = entry;
  }
  return hosts;
}
function selectedRoots(value) {
  need(plain(value) && value.schema === SELECTION_SCHEMA && ID.test(value.operationId ?? '') &&
    Array.isArray(value.roots) && value.roots.length > 0 && value.roots.length <= 19,
  'HOST_HANDOFF_AGENT_SELECTION', 'Read the complete original host-handoff selection.');
  for (const row of value.roots) {
    need(plain(row), 'HOST_HANDOFF_AGENT_SELECTION');
    path(row.path, 'original root');
  }
  return value.roots.map(row => row.path);
}
function targetRoots(value) {
  need(plain(value) && value.schema === TARGET_SCHEMA && Array.isArray(value.mappings) &&
    value.mappings.length > 0 && value.mappings.length <= 19,
  'HOST_HANDOFF_AGENT_TARGET', 'Use the complete original explicit receiving target.');
  return value.mappings.map(row => path(row?.path, 'receiving root'));
}
function custodyPaths(configuration) {
  return [...new Set([configuration.connectionFile, ...Object.values(configuration.custody),
    ...Object.values(configuration.hosts).flatMap(entry =>
      ['selectionFile', 'planFile', 'bundleDirectory', 'captureOperationDirectory', 'restoreDirectory',
        'targetFile', 'adoptionOperationDirectory'].map(key => entry[key]).filter(Boolean))])];
}
export function assertHostHandoffOperatorCustody(roots, protectedPaths) {
  need(Array.isArray(roots) && Array.isArray(protectedPaths), 'HOST_HANDOFF_AGENT_CUSTODY');
  for (const root of roots) for (const protectedPath of protectedPaths)
    need(!overlaps(path(root, 'captured or receiving root'), path(protectedPath, 'operator custody')),
      'HOST_HANDOFF_AGENT_SELF_CAPTURE',
      'Keep the running Merchant operator, its configuration and all handoff controls outside captured or receiving roots.');
}
export async function readHostHandoffMerchantConfiguration(filename,
  { operatorDirectory, releaseStore, exportsDirectory, setupDirectory } = {}) {
  filename = path(filename, 'host connection');
  const raw = await privateBytes(filename, MAX_CONNECTION), value = json(raw, 'host connection');
  const custody = { operatorDirectory: path(operatorDirectory, 'operatorDirectory'),
    releaseStore: path(releaseStore, 'releaseStore'), exportsDirectory: path(exportsDirectory, 'exportsDirectory'),
    setupDirectory:path(setupDirectory??hostSetupControlDirectory(operatorDirectory),'setupDirectory') };
  const result = { schema: HOST_HANDOFF_CONNECTION_SCHEMA, connectionFile: filename,
    connectionSha256: sha(raw), custody, hosts: normalize(value) };
  for (const selected of custodyPaths(result)) await canonical(selected);
  for (const host of Object.values(result.hosts)) {
    if (host.selectionFile) {
      const input = json(await privateBytes(host.selectionFile, MAX_PLAN), 'original source selection');
      assertHostHandoffOperatorCustody(selectedRoots(input), custodyPaths(result));
    }
    // A receiving map may be created after the original authenticated restore.
    if (host.targetFile) {
      const raw = await privateBytes(host.targetFile, MAX_PLAN, true);
      if (raw) assertHostHandoffOperatorCustody(targetRoots(json(raw, 'receiving target')), custodyPaths(result));
    }
  }
  return result;
}
function recorded(raw, filename, value, extra = {}) {
  return { schema: 'stellar-forge.recovery-host-handoff-recorded.v1', ...extra, path: filename,
    bytes: raw.length, sha256: sha(raw), json: raw.toString('utf8'), value,
    validation: 'RECORDED_ONLY_NOT_FRESH_SOURCE_OR_NATIVE_VALIDATION' };
}
function savedPlan(raw, selected) {
  const value = json(raw, 'saved original plan'), profile = value?.hostHandoff;
  need(value?.schema === PLAN_SCHEMA && profile?.schema === HANDOFF_SCHEMA &&
    profile.planFile === selected.planFile && ID.test(profile.operationId ?? '') &&
    profile.selection?.operationId === profile.operationId && Array.isArray(profile.roots),
  'HOST_HANDOFF_AGENT_PLAN_BINDING', 'The saved plan does not belong to this host-declared original plan path.');
  const roots = selectedRoots(profile.selection);
  need(JSON.stringify(profile.roots.map(({ name, path: root }) => ({ name, path: path(root, 'saved original root') }))) ===
    JSON.stringify(profile.selection.roots.map(({ name, path }) => ({ name, path }))),
  'HOST_HANDOFF_AGENT_PLAN_BINDING', 'The saved plan no longer retains its exact original selected roots.');
  need(JSON.stringify(value.roots) === JSON.stringify([
    ...profile.roots.map(({ name, path }) => ({ name, path })),
    { name: 'handoffPlan', path: selected.planFile }]),
  'HOST_HANDOFF_AGENT_PLAN_BINDING', 'The saved plan root inventory changed.');
  return { value, profile, roots };
}
const PREFIX = 'merchant_host_handoff_';
const READS = new Set(['hosts', 'selection', 'saved_plan', 'capture', 'operation']);
const FIELDS = {
  hosts: [], selection: ['host'], plan: ['host', 'expectedSelectionSha256', 'quiesced'],
  saved_plan: ['host', 'expectedPlanSha256'], export: ['host', 'expectedPlanSha256', 'quiesced'],
  capture: ['host', 'expectedPlanSha256'], restore: ['host', 'expectedManifestSha256'],
  review: ['host', 'expectedManifestSha256'],
  adopt: ['host', 'expectedManifestSha256', 'expectedReviewSha256', 'quiesced'],
  operation: ['host', 'expectedReviewSha256']
};
export class MerchantHostHandoffs {
  #configuration; #pending = new Set(); #active = null; #closing = false; #closePromise = null; #engine = null;
  constructor(config, { consoleDirectory } = {}) {
    need(plain(config) && plain(config.hostHandoffs), 'HOST_HANDOFF_AGENT_CONFIGURATION');
    // Run after the generic reader has populated EVERY configured provider.
    const common = new Set(['schema', 'name', 'releaseStore', 'exportsDirectory', 'sources', 'hostHandoffs']);
    need(plain(config.sources) && Object.keys(config.sources).length === 0 &&
      Object.entries(config).every(([key, value]) => common.has(key) || value === null || value === undefined),
    'HOST_HANDOFF_AGENT_DEDICATED_OPERATOR',
    'Use a dedicated offline Merchant configuration without sources or other provider families.');
    const selected = config.hostHandoffs;
    need(selected.schema === HOST_HANDOFF_CONNECTION_SCHEMA && HASH.test(selected.connectionSha256 ?? '') &&
      selected.custody?.releaseStore === config.releaseStore &&
      selected.custody?.exportsDirectory === config.exportsDirectory,
    'HOST_HANDOFF_AGENT_CUSTODY', 'Keep the original complete host-selected operator custody.');
    normalize({ schema: selected.schema, hosts: selected.hosts });
    path(selected.connectionFile, 'connectionFile');
    for (const name of ['operatorDirectory', 'releaseStore', 'exportsDirectory'])
      path(selected.custody[name], name);
    this.#configuration = clone(selected);
    if (consoleDirectory !== undefined)
      this.#configuration.custody.consoleDirectory = path(consoleDirectory, 'operator console directory');
  }
  get summary() {
    return { ownership: 'ORIGINAL_OFFLINE_HOST_HANDOFF', closing: this.#closing,
      active: this.#active ? { host: this.#active.host, operation: this.#active.operation,
        startedAt: this.#active.startedAt, cancellation: this.#active.controller ?
          'ORIGINAL_ADOPTION_ABORT_AND_DRAIN' : 'DRAIN_ONLY' } : null,
      hosts: Object.entries(this.#configuration.hosts).map(([host, value]) => ({
        host, label: value.label, source: Boolean(value.selectionFile), receiving: Boolean(value.targetFile)
      })) };
  }
  async #native() { return this.#engine ??= await import('./host-handoff.mjs'); }
  async #custody(roots) {
    const paths = custodyPaths(this.#configuration);
    for (const value of [...roots, ...paths]) await canonical(value);
    assertHostHandoffOperatorCustody(roots, paths);
  }
  async #idleReleaseStore() {
    // The shared host still advertises its original seller tools. This dedicated
    // profile has no source from which to stage, and may not reuse old releases.
    // Read only the original state and names: never start/probe a retained seller.
    const root = this.#configuration.custody.releaseStore;
    await canonical(root);
    const { readReleaseState } = await import('../../sf82-seller-pilot/releases.mjs');
    const state = await readReleaseState(root);
    const members = await readdir(root), releases = await readdir(root + sep + 'releases');
    // Original atomic release initialization can retain an interrupted private
    // temporary. It is inert source history, not an active/staged release.
    for (const name of members.filter(name => /^state\.json\.[0-9a-f-]{36}\.tmp$/.test(name))) {
      const item = await lstat(root + sep + name);
      need(item.isFile() && !item.isSymbolicLink() && item.nlink >= 1 && item.nlink <= 2 &&
        item.uid === process.getuid() && !(item.mode & 0o077),
      'HOST_HANDOFF_AGENT_RELEASE_STORE_NOT_EMPTY', 'Preserve an unexpected release initialization temporary.');
    }
    need(state.generation === 0 && state.active === null && state.previous === null &&
      Array.isArray(state.history) && state.history.length === 0 && releases.length === 0 &&
      members.every(name => ['state.json', 'releases', '.sf82-state.lock.lifetime', '.sf82-run.lock.lifetime'].includes(name) ||
        /^state\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/.test(name)),
    'HOST_HANDOFF_AGENT_RELEASE_STORE_NOT_EMPTY',
    'Keep this dedicated operator release store empty, without a retained seller, selection, staging or runtime record.');
  }
  async #admit() {
    // openMerchantOperator invokes inventory before returning this dedicated
    // host, including before the optional persistent console can create files.
    const custody = Object.values(this.#configuration.custody);
    for (const selected of custodyPaths(this.#configuration)) await canonical(selected);
    for (const host of Object.values(this.#configuration.hosts)) {
      for (const key of ['bundleDirectory', 'captureOperationDirectory', 'restoreDirectory', 'adoptionOperationDirectory'])
        if (host[key]) for (const own of custody)
          need(!overlaps(host[key], own), 'HOST_HANDOFF_AGENT_SELF_CAPTURE',
            'Keep native handoff controls outside the running operator and its persistent console.');
      if (host.selectionFile) await this.#selection(host);
      if (host.targetFile) {
        const raw = await privateBytes(host.targetFile, MAX_PLAN, true);
        if (raw) await this.#custody(targetRoots(json(raw, 'receiving target')));
      }
    }
    await this.#idleReleaseStore();
  }
  async #selection(selected) {
    const raw = await privateBytes(selected.selectionFile, MAX_PLAN), value = json(raw, 'source selection');
    await this.#custody(selectedRoots(value));
    return { raw, value };
  }
  async #plan(selected) {
    const raw = await privateBytes(selected.planFile, MAX_PLAN, true);
    if (!raw) return null;
    const parsed = savedPlan(raw, selected);
    await this.#custody(parsed.roots);
    return { raw, ...parsed };
  }
  async #target(selected) {
    const raw = await privateBytes(selected.targetFile, MAX_PLAN);
    await this.#custody(targetRoots(json(raw, 'receiving target')));
  }
  call(name, args = {}) {
    need(!this.#closing, 'HOST_HANDOFF_AGENT_CLOSED', 'The original operator is closing; await its complete drain.');
    const operation = typeof name === 'string' && name.startsWith(PREFIX) ? name.slice(PREFIX.length) : '';
    need(Object.hasOwn(FIELDS, operation), 'TOOL_NOT_FOUND', 'Choose an advertised host-handoff operation.');
    exact(args, FIELDS[operation], operation === 'hosts' ? [] :
      FIELDS[operation].filter(key => !(operation === 'saved_plan' && key === 'expectedPlanSha256')));
    let selected;
    if (operation !== 'hosts') {
      need(ALIAS.test(args.host ?? '') && Object.hasOwn(this.#configuration.hosts, args.host),
        'HOST_HANDOFF_AGENT_ALIAS', 'Choose an original host-declared alias.');
      selected = this.#configuration.hosts[args.host];
      const source = ['selection', 'plan', 'saved_plan', 'export', 'capture'].includes(operation);
      need(source ? Boolean(selected.selectionFile) : Boolean(selected.targetFile),
        'HOST_HANDOFF_AGENT_CAPABILITY', 'This alias does not declare that original source or receiving group.');
    }
    for (const key of ['expectedSelectionSha256', 'expectedPlanSha256', 'expectedManifestSha256', 'expectedReviewSha256'])
      if (Object.hasOwn(args, key)) hash(args[key], key);
    if (['plan', 'export', 'adopt'].includes(operation))
      need(args.quiesced === true, 'HOST_HANDOFF_QUIESCENCE_REQUIRED',
        'Explicitly confirm the original and receiving writers remain stopped through this operation.');
    const mutation = !READS.has(operation);
    need(!mutation || !this.#active, 'HOST_HANDOFF_AGENT_BUSY',
      'The original offline engine still owns a call. Read its retained state and wait for that call to drain.');
    const active = mutation ? { host: args.host, operation, startedAt: new Date().toISOString(),
      controller: operation === 'adopt' ? new AbortController() : null } : null;
    if (active) this.#active = active;
    const work = Promise.resolve().then(() => this.#dispatch(operation, clone(args), selected, active))
      .catch(error => {
        if (error && typeof error === 'object') {
          const recovery = {
            host: args.host ?? null, operation, retry: 'EXPLICIT_ONLY_SAME_ORIGINAL_SELECTION',
            readback: operation === 'plan' ? PREFIX + 'saved_plan' : operation === 'export' ?
              PREFIX + 'capture' : operation === 'adopt' ? PREFIX + 'operation' : null };
          error.hostHandoff = recovery;
          // The existing HTTP tool transport retains details, not custom Error properties.
          error.details = plain(error.details) ? { ...error.details, hostHandoff: recovery } :
            { ...(error.details === undefined ? {} : { originalDetails: error.details }), hostHandoff: recovery };
        }
        throw error;
      }).finally(() => {
        this.#pending.delete(work);
        if (active && this.#active === active) this.#active = null;
      });
    this.#pending.add(work);
    return work;
  }
  async #dispatch(operation, args, selected, active) {
    if (active) await this.#idleReleaseStore();
    if (operation === 'hosts') {
      await this.#admit();
      return { schema: HOST_HANDOFF_CONNECTION_SCHEMA,
        connectionSha256: this.#configuration.connectionSha256, ...this.summary };
    }
    if (operation === 'selection') {
      const { raw, value } = await this.#selection(selected);
      return recorded(raw, selected.selectionFile, value, { status: 'SOURCE_SELECTION', host: args.host });
    }
    if (operation === 'saved_plan') {
      const found = await this.#plan(selected);
      if (!found) return { status: 'ABSENT', host: args.host, path: selected.planFile,
        validation: 'RECORDED_ONLY_NOT_FRESH_SOURCE_OR_NATIVE_VALIDATION' };
      if (args.expectedPlanSha256) need(sha(found.raw) === args.expectedPlanSha256, 'HOST_HANDOFF_PLAN_CHANGED');
      return recorded(found.raw, selected.planFile, found.value, { status: 'RECORDED_PLAN', host: args.host,
        planSha256: sha(found.raw), operationId: found.profile.operationId });
    }
    if (operation === 'plan') {
      const { raw, value } = await this.#selection(selected);
      need(sha(raw) === args.expectedSelectionSha256, 'HOST_HANDOFF_AGENT_SELECTION_CHANGED');
      need(!await privateBytes(selected.planFile, MAX_PLAN, true), 'HOST_HANDOFF_AGENT_PLAN_EXISTS',
        'The original plan path is already retained. Read saved_plan; do not create another plan after a missing reply.');
      return (await this.#native()).prepareHostHandoffPlan({
        selection: value, planFile: selected.planFile, quiesced: true });
    }
    if (operation === 'capture') {
      const filename = selected.captureOperationDirectory + sep + 'capture.json';
      const raw = await privateBytes(filename, MAX_CAPTURE, true);
      if (!raw) return { status: 'ABSENT', host: args.host, path: filename,
        validation: 'RECORDED_ONLY_NOT_FRESH_SOURCE_OR_NATIVE_VALIDATION' };
      const value = json(raw, 'original capture state');
      need(value.schema === HANDOFF_SCHEMA && value.options?.command === 'snapshot' &&
        value.options?.plan === selected.planFile && value.options?.out === selected.bundleDirectory &&
        value.options?.passEnv === selected.passphraseEnv &&
        value.options?.expectedPlanSha256 === args.expectedPlanSha256 && typeof value.planBase64 === 'string',
      'HOST_HANDOFF_AGENT_CAPTURE_BINDING', 'The original capture differs from the declared host and reviewed plan.');
      const plan = Buffer.from(value.planBase64, 'base64');
      need(plan.length <= MAX_PLAN && plan.toString('base64') === value.planBase64 &&
        sha(plan) === args.expectedPlanSha256, 'HOST_HANDOFF_AGENT_CAPTURE_BINDING');
      const parsed = savedPlan(plan, selected);
      await this.#custody(parsed.roots);
      return recorded(raw, filename, value, { status: 'RECORDED_CAPTURE', host: args.host });
    }
    if (operation === 'export') {
      const found = await this.#plan(selected);
      if (found) need(sha(found.raw) === args.expectedPlanSha256, 'HOST_HANDOFF_PLAN_CHANGED');
      else {
        // The original engine may reopen its completed capture using its exact embedded plan.
        const recorded = await this.#dispatch('capture', args, selected, null);
        need(recorded.status === 'RECORDED_CAPTURE', 'HOST_HANDOFF_PLAN_CHANGED');
      }
      return (await this.#native()).exportHostHandoff({ planFile: selected.planFile,
        bundleDirectory: selected.bundleDirectory, operationDirectory: selected.captureOperationDirectory,
        passphraseEnv: selected.passphraseEnv, expectedPlanSha256: args.expectedPlanSha256, quiesced: true });
    }
    if (operation === 'operation') return (await this.#native()).inspectHostHandoffAdoption({
      operationDirectory: selected.adoptionOperationDirectory,
      expectedReviewSha256: args.expectedReviewSha256, ...(selected.python ? { python: selected.python } : {}) });
    // Receiving controls themselves cannot alias the running operator.
    for (const candidate of [selected.bundleDirectory, selected.restoreDirectory, selected.adoptionOperationDirectory])
      for (const own of Object.values(this.#configuration.custody))
        need(!overlaps(candidate, own), 'HOST_HANDOFF_AGENT_SELF_CAPTURE',
          'Keep original receiving controls outside the running Merchant operator.');
    const input = { bundleDirectory: selected.bundleDirectory, restoreDirectory: selected.restoreDirectory,
      passphraseEnv: selected.passphraseEnv, expectedManifestSha256: args.expectedManifestSha256 };
    if (operation === 'restore') return (await this.#native()).restoreHostHandoff(input);
    await this.#target(selected);
    const receiving = { ...input, targetFile: selected.targetFile,
      operationDirectory: selected.adoptionOperationDirectory, ...(selected.python ? { python: selected.python } : {}) };
    if (operation === 'review') return (await this.#native()).inspectRestoredHostHandoff(receiving);
    active.controller.signal.throwIfAborted();
    const native = await this.#native();
    active.controller.signal.throwIfAborted();
    return native.adoptRestoredHostHandoff({ ...receiving,
      expectedReviewSha256: args.expectedReviewSha256, quiesced: true, signal: active.controller.signal });
  }
  close() {
    if (!this.#closePromise) {
      this.#closing = true;
      this.#active?.controller?.abort(fault('HOST_HANDOFF_AGENT_CLOSED',
        'The original adoption was interrupted; read its retained operation before explicit continuation.'));
      this.#closePromise = (async () => { await Promise.allSettled([...this.#pending]); })();
    }
    return this.#closePromise;
  }
}
