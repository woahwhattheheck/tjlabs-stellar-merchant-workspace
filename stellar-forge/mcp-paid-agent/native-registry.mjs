// SPDX-License-Identifier: MIT
// One trusted host joins existing native buyers; each original wallet and ledger remains owned by SF88.
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, link, unlink, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { openNativeWorkspace } from './native-workspace.mjs';
import { BAZAAR_CATALOGS_SCHEMA, normalizeCatalogConfiguration, normalizeCatalogDescription,
  normalizeCatalogUrl } from './catalogs.mjs';
import { lockPrivateDirectory } from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';
import { InputError } from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/config.mjs';
import { operatorApprovalEnvironment, checkOperatorChannel } from '../../stellar/scf-starforge-20261009/sf81-buyer-operator-bridge/bridge.mjs';

const REGISTRY = 'stellar-forge.mcp-native-registry.v1';
const INPUT = 'stellar-forge.mcp-native-registry-input.v1';
const WORKSPACES = 'stellar-forge.mcp-native-request-workspaces.v1';
const HISTORY = 'stellar-forge.mcp-native-request-history.v1';
const RESULT = 'stellar-forge.mcp-native-buyer.v1';
const OWNER = 'stellar-forge.mcp-native-intent-owner.v1';
const MAXIMUM_WORKSPACES = 16;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const requestActions = new Set(['request-workspace','request-prepare','request-review',
  'prepare','execute','status','history','recover','cancel','read']);
const ownershipActions = new Set(['request-prepare','prepare','execute','recover','cancel']);
function need(condition, code, details) {
  if (!condition) throw Object.assign(new InputError(code), details ? {details} : {});
}
function keys(value, allowed, code) {
  need(plain(value) && Object.keys(value).every(key => allowed.includes(key)), code);
}
function rootPath(value) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'MCP_NATIVE_REGISTRY_ABSOLUTE_PATH_REQUIRED');
  return value;
}
function privateOwned(info) {
  return (info.mode & 0o077) === 0 &&
    (typeof process.getuid !== 'function' || info.uid === process.getuid());
}
async function privateDirectory(path) {
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && privateOwned(info) && await realpath(path) === path,
    'MCP_NATIVE_REGISTRY_PRIVATE_DIRECTORY_REQUIRED');
}
async function privateBytes(path, maximum = 65536) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    need(info.isFile() && privateOwned(info) && info.size <= maximum,
      'MCP_NATIVE_REGISTRY_PRIVATE_FILE_REQUIRED');
    const bytes = await handle.readFile();
    need(bytes.length <= maximum, 'MCP_NATIVE_REGISTRY_FILE_TOO_LARGE');
    return bytes;
  } finally { await handle.close(); }
}
function json(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { throw new InputError('MCP_NATIVE_REGISTRY_JSON_INVALID'); }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function publish(path, bytes) {
  const temporary = join(dirname(path), '.registry-' + randomUUID());
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await link(temporary, path); await syncDirectory(dirname(path));
  } finally { await unlink(temporary).catch(() => {}); }
}
function description(value, pinned = false) {
  keys(value, pinned ? ['id','label','directory','nativeSha256'] : ['id','label','directory'],
    'MCP_NATIVE_REGISTRY_WORKSPACE_INVALID');
  need(typeof value.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id) &&
    typeof value.label === 'string' && value.label.length >= 1 && value.label.length <= 80 &&
    value.label.trim() === value.label && !/[\u0000-\u001f\u007f]/.test(value.label),
  'MCP_NATIVE_REGISTRY_WORKSPACE_INVALID');
  rootPath(value.directory);
  if (pinned) need(digest(value.nativeSha256), 'MCP_NATIVE_REGISTRY_WORKSPACE_INVALID');
  return structuredClone(value);
}
function membership(workspaces, defaultWorkspaceId, pinned = false) {
  need(Array.isArray(workspaces) && workspaces.length >= 1 && workspaces.length <= MAXIMUM_WORKSPACES,
    'MCP_NATIVE_REGISTRY_WORKSPACE_COUNT_INVALID');
  const result = workspaces.map(value => description(value, pinned));
  need(new Set(result.map(value => value.id)).size === result.length &&
    new Set(result.map(value => value.directory)).size === result.length &&
    result.some(value => value.id === defaultWorkspaceId), 'MCP_NATIVE_REGISTRY_MEMBERSHIP_INVALID');
  return result;
}
async function nativeManifest(entry) {
  await privateDirectory(entry.directory);
  const bytes = await privateBytes(join(entry.directory, 'native-workspace.json'));
  if (entry.nativeSha256 !== undefined)
    need(sha(bytes) === entry.nativeSha256, 'MCP_NATIVE_REGISTRY_WORKSPACE_CHANGED', {workspaceId:entry.id});
  const manifest = json(bytes);
  need(manifest?.schema === 'stellar-forge.mcp-native-workspace.v1' &&
    manifest.directory === entry.directory && plain(manifest.catalog),
  'MCP_NATIVE_REGISTRY_WORKSPACE_INVALID');
  return {bytes, manifest};
}
function catalogUrl(value) {
  let url;
  try { url = new URL(value); } catch {}
  need(url?.protocol === 'https:' && !url.username && !url.password && !url.hash,
    'MCP_NATIVE_REGISTRY_CATALOG_INVALID');
  return url.href;
}
function tag(value, entry) {
  return {...value, workspaceId:entry.id, workspaceLabel:entry.label,
    ...(value.schema === 'stellar-forge.mcp-native-request-workspace.v1' ?
      {catalogId:entry.catalog.id,catalogLabel:entry.catalog.label,catalogUrl:entry.catalog.url} : {})};
}
function configuredCatalogs(workspaces, defaultWorkspaceId, supplied) {
  const urls = [...new Set(workspaces.map(entry => entry.catalogUrl))].sort();
  const definitions = supplied === undefined ? urls.map(url => ({
    id:urls.length === 1 ? 'default' : 'catalog-' + sha(url).slice(0,24),
    label:urls.length === 1 ? 'Configured catalog' :
      (new URL(url).host + new URL(url).pathname).replace(/\/$/,'').slice(0,80), url,
  })) : supplied;
  need(Array.isArray(definitions),'MCP_NATIVE_REGISTRY_CATALOG_INVALID');
  const catalogs = definitions.map(normalizeCatalogDescription);
  const defaultUrl = workspaces.find(entry => entry.id === defaultWorkspaceId).catalogUrl;
  const defaultCatalogId = catalogs.find(entry => entry.url === defaultUrl)?.id;
  const configuration = normalizeCatalogConfiguration({discoveryUrl:defaultUrl,
    discoveryCatalogs:{schema:BAZAAR_CATALOGS_SCHEMA,defaultCatalogId,catalogs}});
  need(configuration.catalogs.length === urls.length &&
    urls.every(url => configuration.catalogs.some(entry => entry.url === url)),
  'MCP_NATIVE_REGISTRY_CATALOG_MISMATCH');
  return configuration;
}
function intentKey(intentId) {
  need(typeof intentId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(intentId),
    'STABLE_INTENT_ID_REQUIRED');
  return sha(intentId);
}

/** The input is an operator-owned local description, never a path from MCP or a catalog. */
export async function initializeNativeRegistry({directory, schema = INPUT, workspaces, defaultWorkspaceId, catalogs} = {}) {
  need(process.platform !== 'win32', 'MCP_NATIVE_POSIX_REQUIRED');
  need(schema === INPUT, 'MCP_NATIVE_REGISTRY_INPUT_INVALID');
  const root = rootPath(directory), entries = membership(workspaces, defaultWorkspaceId);
  await privateDirectory(dirname(root));
  const observedCatalogs = [], pinned = [];
  for (const entry of entries) {
    const source = await nativeManifest(entry);
    const selectedCatalog = normalizeCatalogUrl(catalogUrl(source.manifest.catalog.origin));
    observedCatalogs.push({id:entry.id,catalogUrl:selectedCatalog});
    const native = await openNativeWorkspace(entry.directory);
    try { await native.call({action:'request-workspace'}); } finally { await native.close(); }
    pinned.push({...entry, nativeSha256:sha(source.bytes)});
  }
  const discoveryCatalogs = configuredCatalogs(observedCatalogs,defaultWorkspaceId,catalogs);
  const catalog = discoveryCatalogs.catalogs.find(entry => entry.id === discoveryCatalogs.defaultCatalogId).url;
  const manifest = {schema:REGISTRY, directory:root, createdAt:new Date().toISOString(),
    defaultWorkspaceId, catalogUrl:catalog, discoveryCatalogs, workspaces:pinned};
  let created = false;
  try {
    await mkdir(root, {mode:0o700}); created = true; await privateDirectory(root);
    await mkdir(join(root, 'intent-owners'), {mode:0o700});
    await publish(join(root, 'native-registry.json'), encoded(manifest));
    const moduleUrl = new URL('./native-registry.mjs', import.meta.url).href;
    const adapter = [
      '// Private trusted registry adapter. Original SF88 workspaces own approval, signing and spending.',
      'import {openNativeRegistry} from ' + JSON.stringify(moduleUrl) + ';',
      'const registry = await openNativeRegistry(' + JSON.stringify(root) + ');',
      'export const agentCommerce = (args, context) => registry.call(args, context);',
      'export const discoveryCatalogs = registry.discoveryCatalogs;',
      'export const approve = async () => false;',
      'export async function signPayment() { throw Object.assign(new Error("Use the native sf43 tool"), {code:"MCP_NATIVE_TOOL_REQUIRED"}); }',
      'export const close = () => registry.close();', '',
    ].join('\n');
    await publish(join(root, 'operator.mjs'), Buffer.from(adapter));
    return {schema:REGISTRY, status:'NATIVE_MCP_REGISTRY_CREATED', directory:root,
      defaultWorkspaceId, discoveryCatalogs:structuredClone(discoveryCatalogs),
      workspaces:pinned.map(({id,label}) => ({workspaceId:id,workspaceLabel:label})),
      environment:{MCP_OPERATOR_MODULE:join(root,'operator.mjs'), MCP_STATE_DIR:join(root,'quotes'),
        BAZAAR_DISCOVERY_URL:catalog,
        PAID_RESOURCE_ORIGINS:[...new Set(await Promise.all(pinned.map(async entry =>
          (await nativeManifest(entry)).manifest.route.origin)))].join(',')},
      tool:'sf43_discover_review_and_pay'};
  } catch (error) {
    if (created) await rm(root, {recursive:true, force:true}).catch(() => {});
    throw error;
  }
}

/** Read only the installed host description; this can run while the original server owns its locks. */
export async function inspectNativeRegistry(directory) {
  const root = rootPath(directory); await privateDirectory(root);
  const bytes = await privateBytes(join(root, 'native-registry.json'));
  const manifest = json(bytes);
  keys(manifest, ['schema','directory','createdAt','defaultWorkspaceId','catalogUrl','discoveryCatalogs','workspaces'],
    'MCP_NATIVE_REGISTRY_MANIFEST_INVALID');
  need(manifest.schema === REGISTRY && manifest.directory === root &&
    typeof manifest.createdAt === 'string', 'MCP_NATIVE_REGISTRY_MANIFEST_INVALID');
  const entries = membership(manifest.workspaces, manifest.defaultWorkspaceId, true);
  catalogUrl(manifest.catalogUrl);
  const discoveryCatalogs = normalizeCatalogConfiguration({discoveryUrl:manifest.catalogUrl,
    discoveryCatalogs:manifest.discoveryCatalogs});
  const observed = new Set();
  for (const entry of entries) {
    const source = await nativeManifest(entry);
    const url = normalizeCatalogUrl(catalogUrl(source.manifest.catalog.origin));
    need(discoveryCatalogs.catalogs.some(catalog => catalog.url === url),
      'MCP_NATIVE_REGISTRY_CATALOG_MISMATCH');
    observed.add(url);
  }
  need(observed.size === discoveryCatalogs.catalogs.length,'MCP_NATIVE_REGISTRY_CATALOG_MISMATCH');
  const defaultEntry = entries.find(entry => entry.id === manifest.defaultWorkspaceId);
  need(normalizeCatalogUrl((await nativeManifest(defaultEntry)).manifest.catalog.origin) === manifest.catalogUrl,
    'MCP_NATIVE_REGISTRY_CATALOG_MISMATCH');
  await privateDirectory(join(root,'intent-owners'));
  return {manifest:structuredClone(manifest), sha256:sha(bytes)};
}

function decodeCursor(value, registrySha, entries) {
  const cursors = Object.fromEntries(entries.map(entry => [entry.id,null]));
  if (value === undefined) return cursors;
  need(typeof value === 'string' && value.length >= 1 && value.length <= 8192 &&
    /^[A-Za-z0-9_-]+$/.test(value), 'MCP_NATIVE_REGISTRY_HISTORY_CURSOR_INVALID');
  const bytes = Buffer.from(value, 'base64url');
  need(bytes.toString('base64url') === value, 'MCP_NATIVE_REGISTRY_HISTORY_CURSOR_INVALID');
  const cursor = json(bytes);
  keys(cursor, ['version','registrySha256','cursors'], 'MCP_NATIVE_REGISTRY_HISTORY_CURSOR_INVALID');
  need(cursor.version === 1 && cursor.registrySha256 === registrySha && plain(cursor.cursors) &&
    Object.keys(cursor.cursors).length === entries.length &&
    entries.every(entry => Object.hasOwn(cursor.cursors,entry.id) &&
      (cursor.cursors[entry.id] === null || digest(cursor.cursors[entry.id]))),
  'MCP_NATIVE_REGISTRY_HISTORY_CURSOR_INVALID');
  return cursor.cursors;
}
function newestFirst(a, b) {
  return b.createdAt.localeCompare(a.createdAt) ||
    sha(b.intentId).localeCompare(sha(a.intentId)) || b.workspaceId.localeCompare(a.workspaceId);
}

/** One complete page per original inbox is sufficient for the next k-way merged page. */
async function combinedHistory(entries, registrySha, args, context) {
  keys(args, ['action','limit','cursor'], 'MCP_NATIVE_REGISTRY_HISTORY_ARGUMENTS_INVALID');
  const limit = args.limit ?? 25;
  need(Number.isInteger(limit) && limit >= 1 && limit <= 100,
    'MCP_NATIVE_REGISTRY_HISTORY_ARGUMENTS_INVALID');
  const cursors = decodeCursor(args.cursor, registrySha, entries);
  const pages = await Promise.all(entries.map(async entry => {
    const page = await entry.native.call({action:'history',limit,
      ...(cursors[entry.id] === null ? {} : {cursor:cursors[entry.id]})}, context);
    need(page.schema === RESULT && Number.isSafeInteger(page.total) && page.total >= 0 &&
      Array.isArray(page.records) && page.records.length <= limit &&
      (page.nextCursor === null || digest(page.nextCursor)),
    'MCP_NATIVE_REGISTRY_HISTORY_CHANGED', {workspaceId:entry.id});
    const records = page.records.map(record => {
      intentKey(record.intentId);
      need(typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)),
        'MCP_NATIVE_REGISTRY_HISTORY_CHANGED', {workspaceId:entry.id});
      return tag(record,entry);
    });
    need(records.every((record,index) => !index || newestFirst(records[index-1],record) <= 0),
      'MCP_NATIVE_REGISTRY_HISTORY_CHANGED', {workspaceId:entry.id});
    return {entry,page,records};
  }));
  const candidates = pages.flatMap(value => value.records).sort(newestFirst);
  const records = candidates.slice(0,limit);
  for (const record of records) cursors[record.workspaceId] = intentKey(record.intentId);
  const total = pages.reduce((sum,value) => sum + value.page.total,0);
  need(Number.isSafeInteger(total), 'MCP_NATIVE_REGISTRY_HISTORY_CHANGED');
  const more = candidates.length > records.length || pages.some(value => value.page.nextCursor !== null);
  need(!more || records.length > 0, 'MCP_NATIVE_REGISTRY_HISTORY_CHANGED');
  const nextCursor = more ? Buffer.from(JSON.stringify({version:1,registrySha256:registrySha,cursors}))
    .toString('base64url') : null;
  need(nextCursor === null || nextCursor !== args.cursor, 'MCP_NATIVE_REGISTRY_HISTORY_CHANGED');
  return {schema:HISTORY,total,workspaceCount:entries.length,records,nextCursor};
}

/** Open one live host for the configured original native buyers. */
export async function openNativeRegistry(directory) {
  const original = await inspectNativeRegistry(directory), root = original.manifest.directory;
  const discoveryCatalogs = normalizeCatalogConfiguration({discoveryUrl:original.manifest.catalogUrl,
    discoveryCatalogs:original.manifest.discoveryCatalogs});
  const releases = [], entries = [], active = new Map(), pending = new Set();
  let closed = false, closing;
  const approval = operatorApprovalEnvironment(process.env);
  const browser = Object.keys(approval).length > 0;
  let parallelPayers = false;
  const requireCurrent = async () => {
    need(!closed, 'MCP_NATIVE_REGISTRY_CLOSING');
    need(sha(await privateBytes(join(root,'native-registry.json'))) === original.sha256,
      'MCP_NATIVE_REGISTRY_CHANGED');
    for (const entry of entries) await nativeManifest(entry);
  };
  const coordinate = entry => async ({key,kind,signal}, task) => {
    need(!closed && !signal.aborted, 'OPERATOR_ABORTED');
    need(JSON.stringify(operatorApprovalEnvironment(process.env)) === JSON.stringify(approval),
      'MCP_NATIVE_REGISTRY_APPROVAL_CHANNEL_CHANGED');
    const group = parallelPayers ? sha(JSON.stringify([
      entry.source.workspaceBinding.network,entry.source.workspaceBinding.payer])) : 'shared-approval';
    need(!active.has(group), 'MCP_NATIVE_OPERATOR_BUSY',
      {workspaceId:entry.id,activeWorkspaceId:active.get(group)?.workspaceId});
    const current = {workspaceId:entry.id,workspaceLabel:entry.label,key,kind};
    active.set(group,current);
    try {
      await requireCurrent();
      await checkOperatorChannel(key,{environment:approval});
      need(!closed && !signal.aborted, 'OPERATOR_ABORTED');
      return await task(signal);
    } finally { if (active.get(group) === current) active.delete(group); }
  };
  try {
    const roots = [root,...original.manifest.workspaces.map(entry => entry.directory)].sort();
    for (const owned of roots) releases.push(await lockPrivateDirectory({
      directory:owned,filename:'.native-registry-owner.lock',namespace:'sf-native-registry',
      busyCode:'MCP_NATIVE_REGISTRY_ALREADY_OPEN',unavailableCode:'MCP_NATIVE_REGISTRY_LOCK_UNAVAILABLE'}));
    for (const definition of original.manifest.workspaces) {
      const {manifest:source} = await nativeManifest(definition);
      const entry = {...definition,source,
        catalog:discoveryCatalogs.catalogs.find(catalog => catalog.url === normalizeCatalogUrl(source.catalog.origin))};
      entry.native = await openNativeWorkspace(entry.directory,{operationCoordinator:coordinate(entry)});
      entries.push(entry);
    }
    parallelPayers = browser && entries.every(entry =>
      typeof entry.source.workspaceBinding?.payer === 'string' &&
      /^[GC][A-Z2-7]{55}$/.test(entry.source.workspaceBinding.payer));
    await requireCurrent();
  } catch (error) {
    await Promise.allSettled(entries.map(entry => entry.native.close()));
    await Promise.allSettled(releases.map(release => release()));
    throw error;
  }
  const byId = new Map(entries.map(entry => [entry.id,entry]));
  function selection(workspaceId) {
    const id = workspaceId ?? original.manifest.defaultWorkspaceId;
    need(typeof id === 'string' && byId.has(id), 'MCP_NATIVE_REGISTRY_WORKSPACE_UNKNOWN');
    return byId.get(id);
  }
  async function ownIntent(entry,intentId) {
    const key = intentKey(intentId), path = join(root,'intent-owners',key + '.json');
    let previous;
    try { previous = json(await privateBytes(path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous) {
      need(previous.schema === OWNER && previous.intentId === intentId &&
        previous.workspaceId === entry.id && previous.nativeSha256 === entry.nativeSha256,
      'MCP_NATIVE_INTENT_OWNED_BY_ANOTHER_WORKSPACE',
      {intentId,workspaceId:entry.id,originalWorkspaceId:previous.workspaceId});
      return;
    }
    // Reused IDs in pre-existing native inboxes must not collide at the shared approval broker.
    for (const other of entries) {
      if (other.id === entry.id) continue;
      try {
        await privateBytes(join(other.directory,'requests',key,'request.json'));
        need(false,'MCP_NATIVE_INTENT_OWNED_BY_ANOTHER_WORKSPACE',
          {intentId,workspaceId:entry.id,originalWorkspaceId:other.id});
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const owner = {schema:OWNER,intentId,workspaceId:entry.id,nativeSha256:entry.nativeSha256,
      createdAt:new Date().toISOString()};
    try { await publish(path,encoded(owner)); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const retained = json(await privateBytes(path));
      need(retained.schema === OWNER && retained.intentId === intentId &&
        retained.workspaceId === entry.id && retained.nativeSha256 === entry.nativeSha256,
      'MCP_NATIVE_INTENT_OWNED_BY_ANOTHER_WORKSPACE',
      {intentId,workspaceId:entry.id,originalWorkspaceId:retained.workspaceId});
    }
  }
  async function dispatch(args = {}, context = {}) {
    need(plain(args) && plain(context) &&
      (context.signal === undefined || context.signal instanceof AbortSignal),
    'MCP_NATIVE_REGISTRY_ARGUMENTS_INVALID');
    await requireCurrent();
    if (context.signal) context.signal.throwIfAborted();
    const action = args.action ?? 'execute';
    if (action === 'request-workspaces') {
      keys(args,['action'],'MCP_NATIVE_REGISTRY_ARGUMENTS_INVALID');
      const workspaces = await Promise.all(entries.map(async entry =>
        tag(await entry.native.call({action:'request-workspace'},context),entry)));
      return {schema:WORKSPACES,defaultWorkspaceId:original.manifest.defaultWorkspaceId,
        total:workspaces.length,workspaces,
        execution:{mode:parallelPayers ? 'PER_PAYER' : 'ONE_OWNED_OPERATION',
          active:[...active.values()].map(value => ({...value}))}};
    }
    if (action === 'request-history') return combinedHistory(entries,original.sha256,args,context);
    const entry = selection(args.workspaceId);
    need(requestActions.has(action) || args.workspaceId === undefined,
      'MCP_NATIVE_REGISTRY_REQUEST_WORKSPACE_ONLY');
    const forwarded = {...args}; delete forwarded.workspaceId;
    if (ownershipActions.has(action)) await ownIntent(entry,args.intentId);
    const result = await entry.native.call(forwarded,context);
    if (!requestActions.has(action)) return result;
    const value = tag(result,entry);
    if (action === 'history') value.records = result.records.map(record => tag(record,entry));
    return value;
  }
  function call(args,context) {
    need(!closed,'MCP_NATIVE_REGISTRY_CLOSING');
    const task = dispatch(structuredClone(args ?? {}),context ?? {});
    pending.add(task);
    task.finally(() => pending.delete(task)).catch(() => {});
    return task;
  }
  return {
    manifest:structuredClone(original.manifest),
    discoveryCatalogs:structuredClone(discoveryCatalogs),
    environment:{BAZAAR_DISCOVERY_URL:original.manifest.catalogUrl,
      PAID_RESOURCE_ORIGINS:[...new Set(entries.map(entry => entry.source.route.origin))].join(','),
      MCP_STATE_DIR:join(root,'quotes')},
    call,
    close() {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        try {
          await Promise.allSettled(entries.map(entry => entry.native.close()));
          await Promise.allSettled([...pending]);
        } finally { await Promise.allSettled(releases.map(release => release())); }
      })();
      return closing;
    },
  };
}
