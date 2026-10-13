// MIT. One retained original CanadaBuys customer request and its actual outcome.
import { constants } from 'node:fs';
import { open, mkdir, realpath, readdir, link, unlink, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { privateSupportDirectory, writePrivate } from './host-files.mjs';
import { acquireStateLease } from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import { CanadaBuysMerchantClient, openCanadaBuysMerchantClient, canadaBuysClientError,
  canadaBuysRequest, canadaBuysReplayPolicy, CANADABUYS_TOOL_PREFIX } from './canadabuys-client.mjs';

export const CANADABUYS_CUSTOMER_CONNECTION_SCHEMA = 'stellar-forge.canadabuys-customer-connection.v1';
export const CANADABUYS_CUSTOMER_OPERATION_SCHEMA = 'stellar-forge.canadabuys-customer-operation.v1';
const MAXIMUM = 128 * 1024 * 1024, SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (value, message, code = 'OPERATION') => { if (!value) throw canadaBuysClientError(code, message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const sorted = value => Array.isArray(value) ? value.map(sorted) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const canadaBuysOperationBytes = value => Buffer.from(JSON.stringify(sorted(value)) + '\n');
const equal = (a, b) => canadaBuysOperationBytes(a).equals(canadaBuysOperationBytes(b));
export function canadaBuysCustomerConnectionTemplate() {
  return { schema: CANADABUYS_CUSTOMER_CONNECTION_SCHEMA, url: 'http://127.0.0.1:9000/mcp',
    tokenEnv: 'MCP_ACCESS_TOKEN', workspace: 'procurement', workspaceId: null, maximumResponseBytes: 4 * 1024 * 1024 };
}
export function normalizeCanadaBuysCustomerConnection(value, { requireWorkspaceId = true } = {}) {
  need(plain(value) && value.schema === CANADABUYS_CUSTOMER_CONNECTION_SCHEMA
    && Object.keys(value).every(key => ['schema', 'url', 'tokenEnv', 'workspace', 'workspaceId', 'maximumResponseBytes'].includes(key)),
    'Use the original customer connection schema and declared fields.', 'CONNECTION');
  let endpoint;
  try { endpoint = new URL(value.url); } catch { throw canadaBuysClientError('CONNECTION', 'Supply the original MCP endpoint.'); }
  need(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
    && (endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname))
    && typeof value.tokenEnv === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.tokenEnv)
    && typeof value.workspace === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.workspace),
    'Retain the original HTTPS or loopback endpoint, credential environment reference and workspace alias.', 'CONNECTION');
  need((!requireWorkspaceId && (value.workspaceId === undefined || value.workspaceId === null))
    || typeof value.workspaceId === 'string' && UUID.test(value.workspaceId),
    'Bind this connection to the original observed native workspace UUID before preparing an operation.', 'CONNECTION');
  const maximumResponseBytes = value.maximumResponseBytes ?? 4 * 1024 * 1024;
  need(Number.isSafeInteger(maximumResponseBytes) && maximumResponseBytes >= 1024 && maximumResponseBytes <= MAXIMUM,
    'Choose a complete reply byte bound from 1024 bytes to 128 MiB.', 'CONNECTION');
  return { schema: value.schema, url: endpoint.href, tokenEnv: value.tokenEnv, workspace: value.workspace,
    workspaceId: value.workspaceId ?? null, maximumResponseBytes };
}
export async function readCanadaBuysCustomerJson(path, maximum = MAXIMUM) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await file.stat({ bigint: true });
    need(before.isFile() && before.size <= BigInt(maximum) && (process.platform === 'win32' || !(before.mode & 0o077n)),
      'Use an original private regular JSON file within the declared byte limit.');
    const bytes = await file.readFile(), after = await file.stat({ bigint: true });
    need(bytes.length <= maximum && BigInt(bytes.length) === before.size
      && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key]),
      'The selected original JSON file changed while it was read.');
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw canadaBuysClientError('OPERATION', 'The selected original file is not complete UTF-8 JSON.'); }
    return { value, bytes, identity: { bytes: bytes.length, sha256: sha(bytes) } };
  } finally { await file.close(); }
}
async function optional(path, maximum = MAXIMUM) {
  try { return await readCanadaBuysCustomerJson(path, maximum); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function privateDirectory(path, create = false) {
  const root = resolve(path);
  need(root !== '/', 'Select a task directory for this original operation.');
  if (create) { try { await mkdir(root, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
  await privateSupportDirectory(root);
  need(await realpath(root) === root, 'Use the original canonical private directory without symlink components.');
  return root;
}
async function immutable(path, value, lease) {
  const bytes = canadaBuysOperationBytes(value);
  need(bytes.length <= MAXIMUM, 'The complete operation record exceeds its declared byte bound.');
  lease?.assertHeld();
  const existing = await optional(path);
  if (existing) { need(existing.bytes.equals(bytes), 'An original immutable operation record differs: ' + path); return existing.identity; }
  const temporary = join(dirname(path), '.original-' + randomUUID() + '.pending');
  try {
    await writePrivate(temporary, bytes); lease?.assertHeld();
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      need((await readCanadaBuysCustomerJson(path)).bytes.equals(bytes), 'An original immutable record changed during publication.');
    }
    await syncDirectory(dirname(path));
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return { bytes: bytes.length, sha256: sha(bytes) };
}
async function replace(path, value, lease) {
  const temporary = join(dirname(path), '.state-' + randomUUID() + '.pending');
  try {
    await writePrivate(temporary, canadaBuysOperationBytes(value)); lease.assertHeld();
    await rename(temporary, path); await syncDirectory(dirname(path));
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
async function locked(directory, operation, create = false) {
  const root = await privateDirectory(directory, create), lease = await acquireStateLease(root);
  let failure;
  try { return await operation({ root, lease }); }
  catch (error) { failure = error; throw error; }
  finally {
    try { await lease.close(); }
    catch (error) { if (failure) failure.closeError = error; else throw error; }
  }
}
function validateRequest(value) {
  need(plain(value) && value.schema === CANADABUYS_CUSTOMER_OPERATION_SCHEMA
    && typeof value.operationId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.operationId),
    'Retain the original operation identifier and schema.');
  const connection = normalizeCanadaBuysCustomerConnection(value.connection);
  const request = canadaBuysRequest(value.request?.name, value.request?.arguments, connection.workspace);
  need(equal(value.connection, connection) && equal(value.request, request)
    && equal(value.replay, canadaBuysReplayPolicy(request.name, request.arguments)),
    'The retained operation differs from its original connection, arguments or replay policy.');
  return value;
}
async function context(root, lease) {
  const record = await readCanadaBuysCustomerJson(join(root, 'request.json'));
  validateRequest(record.value);
  return { root, lease, request: record.value, requestSha256: record.identity.sha256 };
}
const recordPath = path => typeof path === 'string'
  && (/^attempts\/[0-9]{6}\/result\.json$/.test(path) || /^reconciliations\/[a-f0-9]{64}\.json$/.test(path));
async function savedCompletion(c) {
  const saved = await optional(join(c.root, 'complete.json'));
  if (!saved) return undefined;
  const value = saved.value;
  need(value.schema === CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.complete'
    && value.operationId === c.request.operationId && value.requestSha256 === c.requestSha256
    && plain(value.result) && recordPath(value.result.path) && SHA.test(value.result.sha256 ?? ''),
    'The saved completion belongs to another original request.');
  const result = await readCanadaBuysCustomerJson(join(c.root, value.result.path));
  need(result.identity.bytes === value.result.bytes && result.identity.sha256 === value.result.sha256
    && result.value.requestSha256 === c.requestSha256 && result.value.operationId === c.request.operationId
    && plain(result.value.value) && ['RETURNED', 'ADOPTED_ORIGINAL_PUBLICATION'].includes(result.value.outcome),
    'The complete original response no longer matches its saved receipt.');
  return { complete: value, result: result.value };
}
async function attempts(c) {
  const root = join(c.root, 'attempts');
  try { await privateDirectory(root); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const names = (await readdir(root)).filter(name => /^[0-9]{6}$/.test(name)).sort(), values = [];
  for (const name of names) {
    await privateDirectory(join(root, name));
    const started = await optional(join(root, name, 'entered.json'));
    const result = await optional(join(root, name, 'result.json'));
    const error = await optional(join(root, name, 'error.json'));
    for (const record of [started, result, error].filter(Boolean))
      need(record.value.requestSha256 === c.requestSha256 && record.value.operationId === c.request.operationId,
        'An original attempt belongs to a different operation request.');
    need(!result || started, 'A response has no original entered request.');
    values.push({ name, started, result, error });
  }
  return values;
}
async function state(c, value) {
  await replace(join(c.root, 'state.json'), { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.state',
    operationId: c.request.operationId, requestSha256: c.requestSha256, updatedAt: now(), ...value }, c.lease);
}
async function finish(c, relative, record) {
  need(recordPath(relative) && plain(record.value) && record.schema === CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.result'
    && ['RETURNED', 'ADOPTED_ORIGINAL_PUBLICATION'].includes(record.outcome) && record.requestSha256 === c.requestSha256
    && record.operationId === c.request.operationId, 'The selected original result is not bound to this operation.');
  const result = await readCanadaBuysCustomerJson(join(c.root, relative));
  need(equal(result.value, record), 'The retained response changed before completion.');
  const value = { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.complete',
    operationId: c.request.operationId, requestSha256: c.requestSha256, outcome: record.outcome,
    completedAt: record.observedAt, result: { path: relative, ...result.identity } };
  await immutable(join(c.root, 'complete.json'), value, c.lease);
  await state(c, { state: 'COMPLETE', outcome: record.outcome, completion: value });
  return { ...value, state: 'COMPLETE', value: structuredClone(record.value) };
}
function errorRecord(error) {
  const value = { code: typeof error?.code === 'string' ? error.code : 'CLIENT_ERROR',
    message: typeof error?.message === 'string' ? error.message : 'The original request did not return.' };
  for (const key of ['applied', 'outcomeUnknown', 'reopenRequired', 'status', 'details', 'recovery', 'commitUncertainty'])
    if (error[key] !== undefined) value[key] = structuredClone(error[key]);
  return value;
}
/** Entirely offline: the supplied connection already names the observed native workspace. */
export async function prepareCanadaBuysOperation({ directory, operationId, connection, tool, arguments: args = {} } = {}) {
  connection = normalizeCanadaBuysCustomerConnection(connection);
  const request = canadaBuysRequest(tool, args, connection.workspace);
  const selected = { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA, operationId, connection, request,
    replay: canadaBuysReplayPolicy(request.name, request.arguments) };
  validateRequest(selected);
  return locked(directory, async c => {
    const files = await readdir(c.root);
    need(files.every(name => name === 'lease.lock' || name === 'request.json' || name === 'state.json'
      || name === 'attempts' || name === 'reconciliations' || name === 'complete.json' || /^\.(original|state)-/.test(name)),
      'Choose an empty original operation directory or this operation’s retained directory.');
    const existed = await optional(join(c.root, 'request.json'));
    await immutable(join(c.root, 'request.json'), selected, c.lease);
    const original = await context(c.root, c.lease);
    if (!await optional(join(c.root, 'state.json')))
      await state(original, { state: 'PREPARED', networkRequests: 0, mutation: false });
    return { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.prepared', operationId,
      directory: c.root, requestSha256: original.requestSha256, reused: Boolean(existed),
      request: selected, networkRequests: 0, mutation: false };
  }, true);
}
/** Pure saved progress: no credential lookup, provider construction, lock wait or network. */
export async function showCanadaBuysOperation(directory) {
  const root = await privateDirectory(directory), c = await context(root);
  const complete = await savedCompletion(c), saved = await optional(join(root, 'state.json'));
  if (saved) need(saved.value.requestSha256 === c.requestSha256 && saved.value.operationId === c.request.operationId,
    'The saved progress belongs to another original request.');
  return { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.observation', directory: root,
    request: c.request, requestSha256: c.requestSha256, state: complete ? 'COMPLETE' : saved?.value.state ?? 'PREPARED',
    progress: saved?.value ?? null, ...(complete ? { completion: complete.complete, value: complete.result.value } : {}),
    networkRequests: 0, mutation: false };
}
async function selectedClient(c, supplied, environment, signal) {
  const connection = c.request.connection;
  const client = supplied ?? await openCanadaBuysMerchantClient({ ...connection,
    workspaceId: connection.workspaceId, environment, signal });
  need(client instanceof CanadaBuysMerchantClient && client.workspace === connection.workspace
    && new URL(client.endpoint).href === connection.url, 'Use this operation’s original customer connection.');
  try {
    const observed = await client.open({ signal });
    need(observed.native.id === connection.workspaceId, 'The original endpoint alias now identifies another workspace.', 'WORKSPACE_CONFLICT');
    return client;
  } catch (error) {
    if (!supplied) {
      try { await client.disconnect(); } catch (closeError) { error.closeError = closeError; }
    }
    throw error;
  }
}
/** Resume only the same request; unknown effects remain retained unless the original API can deduplicate them. */
export async function executeCanadaBuysOperation({ directory, client: supplied, environment, signal, timeoutMs = 120000 } = {}) {
  return locked(directory, async initial => {
    const c = await context(initial.root, initial.lease), complete = await savedCompletion(c);
    if (complete) return { ...complete.complete, state: 'COMPLETE', reused: true, value: complete.result.value, networkRequests: 0 };
    const history = await attempts(c);
    for (const old of history) {
      if (old.result) return finish(c, 'attempts/' + old.name + '/result.json', old.result.value);
      if (old.started && !c.request.replay.replayable && old.error?.value.error?.applied !== false) {
        await state(c, { state: 'RECONCILIATION_REQUIRED', attempt: old.name,
          reason: 'The original entered request has no retained response and is not automatically replayable.' });
        throw canadaBuysClientError('RECONCILIATION_REQUIRED',
          'Retain the original entered request. Inspect its native workspace result before another mutation.',
          { operationId: c.request.operationId, directory: c.root, tool: c.request.request.name, requestSha256: c.requestSha256 });
      }
    }
    let client, failure;
    try {
      client = await selectedClient(c, supplied, environment, signal);
      signal?.throwIfAborted(); c.lease.assertHeld();
      await privateDirectory(join(c.root, 'attempts'), true);
      const number = String(history.length ? Number(history.at(-1).name) + 1 : 1).padStart(6, '0');
      need(number.length === 6, 'The original operation reached its retained attempt limit.');
      const attempt = await privateDirectory(join(c.root, 'attempts', number), true);
      const entered = { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.entered',
        operationId: c.request.operationId, requestSha256: c.requestSha256, attempt: number,
        endpoint: client.endpoint, workspaceId: client.workspaceId, tool: c.request.request.name, enteredAt: now() };
      await immutable(join(attempt, 'entered.json'), entered, c.lease);
      await state(c, { state: 'ENTERED', attempt: number, entered });
      let value;
      try { value = await client.call(c.request.request.name, c.request.request.arguments, { signal, timeoutMs }); }
      catch (error) {
        const record = { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.error', operationId: c.request.operationId,
          requestSha256: c.requestSha256, observedAt: now(), error: errorRecord(error) };
        await immutable(join(attempt, 'error.json'), record, c.lease);
        await state(c, { state: !c.request.replay.replayable && error.applied !== false ? 'RECONCILIATION_REQUIRED' : 'RETRY_ORIGINAL',
          attempt: number, error: record.error });
        throw error;
      }
      const record = { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.result',
        operationId: c.request.operationId, requestSha256: c.requestSha256, observedAt: now(), outcome: 'RETURNED', value };
      await immutable(join(attempt, 'result.json'), record, c.lease);
      return await finish(c, 'attempts/' + number + '/result.json', record);
    } catch (error) { failure = error; throw error; }
    finally {
      if (client && !supplied) {
        try { await client.disconnect(); }
        catch (error) { if (failure) failure.closeError = error; else throw error; }
      }
    }
  });
}
/**
 * An operator explicitly selects an already-retained publication after a lost export
 * response. This reads that original file inventory; it never invokes export again.
 * Matching fields establish compatibility, not uniqueness among concurrent exports.
 */
export async function adoptCanadaBuysPublication({ directory, publicationId, note, client: supplied, environment, signal } = {}) {
  need(typeof publicationId === 'string' && UUID.test(publicationId)
    && typeof note === 'string' && note.trim() && note.length <= 32768,
    'Select the observed original publication and retain the operator’s evidence note.');
  return locked(directory, async initial => {
    const c = await context(initial.root, initial.lease), complete = await savedCompletion(c);
    if (complete) return { ...complete.complete, state: 'COMPLETE', reused: true, value: complete.result.value, networkRequests: 0 };
    need(c.request.request.name === CANADABUYS_TOOL_PREFIX + 'export'
      && (await attempts(c)).some(value => value.started && !value.result),
      'Publication adoption is for the original export whose entered request has no retained response.');
    let client, failure;
    try {
      client = await selectedClient(c, supplied, environment, signal);
      const value = await client.files({ publicationId }, { signal }), publication = value.publication;
      const args = c.request.request.arguments;
      const selection = { scope: args.scope ?? 'all' };
      for (const key of ['noticeIds', 'sourceId', 'entryId', 'decisionId', 'evidenceId', 'recordRevision', 'beforeId', 'afterId'])
        if (args[key] !== undefined) selection[key] = args[key];
      need(publication?.id === publicationId && publication.kind === 'canadabuys-export'
        && publication.format === args.format && publication.sourceRevision === args.expectedRevision
        && equal(publication.selection, selection) && Array.isArray(value.files) && value.files.length === 1
        && value.files[0].bytes === publication.bytes && value.files[0].sha256 === publication.sha256,
        'The selected original publication contradicts the entered export request.');
      const evidence = { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.publication-evidence',
        operationId: c.request.operationId, requestSha256: c.requestSha256,
        publicationId, note: note.trim(), value };
      await privateDirectory(join(c.root, 'reconciliations'), true);
      const relative = 'reconciliations/' + sha(canadaBuysOperationBytes(evidence)) + '.json';
      const previous = await optional(join(c.root, relative));
      const record = previous?.value ?? { schema: CANADABUYS_CUSTOMER_OPERATION_SCHEMA + '.result',
        operationId: c.request.operationId, requestSha256: c.requestSha256, observedAt: now(),
        outcome: 'ADOPTED_ORIGINAL_PUBLICATION', evidence, value };
      if (previous) need(equal(previous.value.evidence, evidence), 'The original publication evidence changed.');
      await immutable(join(c.root, relative), record, c.lease);
      return await finish(c, relative, record);
    } catch (error) { failure = error; throw error; }
    finally {
      if (client && !supplied) {
        try { await client.disconnect(); }
        catch (error) { if (failure) failure.closeError = error; else throw error; }
      }
    }
  });
}
/** Bind one explicit existing alias to its observed native UUID, returning a credential-free connection. */
export async function bindCanadaBuysCustomerConnection({ connection, client: supplied, environment, signal } = {}) {
  const selected = normalizeCanadaBuysCustomerConnection(connection, { requireWorkspaceId: false });
  const client = supplied ?? await openCanadaBuysMerchantClient({ ...selected,
    workspaceId: selected.workspaceId ?? undefined, environment, signal });
  let failure;
  try {
    need(client instanceof CanadaBuysMerchantClient && client.workspace === selected.workspace
      && new URL(client.endpoint).href === selected.url, 'Use the selected original customer connection.');
    const result = await client.open({ signal });
    if (selected.workspaceId) need(result.native.id === selected.workspaceId, 'The original alias identifies another workspace.');
    return { connection: { ...selected, workspaceId: result.native.id }, observation: result };
  } catch (error) { failure = error; throw error; }
  finally {
    if (!supplied) {
      try { await client.disconnect(); }
      catch (error) { if (failure) failure.closeError = error; else throw error; }
    }
  }
}
