// MIT. Purchased application access composes the original API gateway and job compiler.
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, link, unlink, readdir } from 'node:fs/promises';
import { resolve, join, isAbsolute, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { acquireStateLease } from '../../merchant-fleet-gateway/state-lease.mjs';
import { readJobMerchant, compileJobMerchant, canonical, digest, jobError } from '../../sf30-seller-sdk/jobs/config.mjs';

export const PROFILE_SCHEMA = 'stellar-forge.sf101.api-application.v1';
export const GATEWAY_SCHEMA = 'stellar-forge.sf101.api-gateway.v1';
export const MAX_RESULT = 4 * 1024 * 1024;
export const KEY_HEADER = 'X-SF101-Application-Key';
export const KEY_ENV = 'SF101_APPLICATION_KEY';
export const OPERATION = /^sf101-[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const fail = (code, status = 400) => { throw jobError(code, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const jsonBytes = value => Buffer.from(canonical(value) + '\n');
export async function readPrivateFile(path, max = 1048576) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > max) fail('APP_FILE_REQUIRED');
    const data = await handle.readFile();
    if (data.length > max) fail('APP_FILE_TOO_LARGE');
    return data;
  } finally { await handle.close(); }
}
function routesFor(source, gateway, pairs, origin) {
  if (!object(gateway) || gateway.schema !== GATEWAY_SCHEMA || !Array.isArray(gateway.routes) ||
      !isAbsolute(gateway.state || '') || !Array.isArray(pairs) || !pairs.length || pairs.length > 64)
    fail('APP_GATEWAY_CONFIG_REQUIRED');
  const ids = new Set(), functions = new Set(), result = [];
  for (const pair of pairs) {
    if (!object(pair) || !ID.test(pair.id || '') || typeof pair.functionId !== 'string' || ids.has(pair.id))
      fail('APP_ROUTE_MAPPING_REQUIRED');
    const original = gateway.routes.find(route => route.id === pair.id);
    const definition = source.compiled.functions[pair.functionId];
    if (!original || !definition || original.method !== 'POST' || original.path !== definition.path ||
        definition.path.startsWith('/_sf101-application'))
      fail('APP_ROUTE_MUST_MATCH_ORIGINAL_FUNCTION');
    if (functions.has(pair.functionId)) fail('APP_FUNCTION_MAPPING_DUPLICATE');
    if (definition.maxOutputBytes > MAX_RESULT) fail('APP_FUNCTION_OUTPUT_EXCEEDS_PASS_LIMIT');
    if (!Number.isSafeInteger(original.timeoutSeconds) || original.timeoutSeconds < 1 || original.timeoutSeconds > 120)
      fail('APP_GATEWAY_TIMEOUT_REQUIRED');
    const requestLimit = original.maxRequestBytes ?? 1048576;
    const responseLimit = original.maxResponseBytes ?? MAX_RESULT;
    if (!Number.isSafeInteger(requestLimit) || requestLimit < 1 || requestLimit > 1048576 ||
        !Number.isSafeInteger(responseLimit) || responseLimit < 1 || responseLimit > MAX_RESULT)
      fail('APP_GATEWAY_LIMIT_REQUIRED');
    if (definition.maxOutputBytes > responseLimit) fail('APP_FUNCTION_OUTPUT_EXCEEDS_ROUTE_LIMIT');
    ids.add(pair.id); functions.add(pair.functionId);
    result.push({ id: pair.id, functionId: pair.functionId, path: definition.path, origin,
      timeoutSeconds: original.timeoutSeconds, maxInputBytes: Math.min(requestLimit, definition.maxInputBytes),
      maxOutputBytes: definition.maxOutputBytes });
  }
  return result;
}
export const PREPARED_CONFIGURATION_SCHEMA = 'stellar-forge.sf101.api-application-preparation.v1';

/** Compile one exact private configuration before publishing any of its files. */
export async function prepareApplicationConfiguration({ merchant, gateway: gatewayPath, directory, port, mappings, bindRoutes = false }) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) fail('APP_PRIVATE_PORT_REQUIRED');
  merchant = resolve(merchant); gatewayPath = resolve(gatewayPath); directory = resolve(directory);
  if (directory === '/' || await realpath(dirname(directory)) !== dirname(directory))
    fail('APP_CANONICAL_PRIVATE_DIRECTORY_REQUIRED');
  const inputMerchant = merchant;
  let source = await readJobMerchant(merchant);
  const originalSource = source.identity;
  let derivedBytes = null;
  const inputGatewayBytes = await readPrivateFile(gatewayPath);
  const gateway = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inputGatewayBytes));
  if (bindRoutes) {
    if (!Array.isArray(mappings) || !mappings.length || mappings.length > 64 || !Array.isArray(gateway.routes))
      fail('APP_ROUTE_MAPPING_REQUIRED');
    const raw = structuredClone(source.raw);
    raw.application = source.identity.application;
    for (const pair of mappings) {
      const route = gateway.routes.find(item => item.id === pair.id);
      const definition = source.compiled.functions[pair.functionId];
      if (!route || route.method !== 'POST' || !definition) fail('APP_ROUTE_MAPPING_REQUIRED');
      raw.functions[pair.functionId].path = route.path;
      raw.functions[pair.functionId].maxOutputBytes = Math.min(definition.maxOutputBytes,
        route.maxResponseBytes ?? MAX_RESULT, MAX_RESULT);
    }
    derivedBytes = jsonBytes(raw);
    merchant = join(directory, 'merchant.json');
    const compiled = compileJobMerchant(raw, { baseDir: directory });
    source = { ...source, configPath: merchant, raw, compiled, configSource: derivedBytes.toString('utf8'),
      identity: { ...source.identity, configSha256: digest(derivedBytes) } };
  }
  const origin = 'http://127.0.0.1:' + port;
  const routes = routesFor(source, gateway, mappings, origin);
  const selected = new Map(routes.map(route => [route.id, route]));
  const nextGateway = { ...gateway, routes: gateway.routes.map(route => {
    const selectedRoute = selected.get(route.id);
    return selectedRoute ? { ...route, upstream: origin, query: [], headerEnv: { [KEY_HEADER]: KEY_ENV },
      maxRequestBytes: selectedRoute.maxInputBytes, maxResponseBytes: selectedRoute.maxOutputBytes } : route;
  }) };
  const profilePath = join(directory, 'application.json'), nextGatewayPath = join(directory, 'gateway.json');
  const keyPath = join(directory, 'application.key'), storePath = join(directory, 'executions');
  const gatewayBytes = jsonBytes(nextGateway), capability = randomBytes(32).toString('hex');
  const profile = { schema: PROFILE_SCHEMA, merchant, gateway: nextGatewayPath,
    gatewaySha256: digest(gatewayBytes), capabilitySha256: digest(capability), source: source.identity, store: storePath, key: keyPath,
    origin, port, originalSource, routes: mappings.map(value => ({ id: value.id, functionId: value.functionId })) };
  const member = (name, bytes) => ({ name, content: bytes.toString('utf8'), sha256: digest(bytes) });
  const files = [
    ...(derivedBytes ? [member('merchant.json', derivedBytes)] : []),
    member('application.key', Buffer.from(capability + '\n')),
    member('gateway.json', gatewayBytes), member('application.json', jsonBytes(profile)),
  ];
  return { schema: PREPARED_CONFIGURATION_SCHEMA, directory, inputMerchant, inputGateway: gatewayPath,
    inputGatewaySha256: digest(inputGatewayBytes), originalSource, files,
    result: { schema: PROFILE_SCHEMA, profile: profilePath, gateway: nextGatewayPath, store: storePath,
      merchantState: gateway.state, origin, routes, source: source.identity } };
}

async function preparedDirectory(directory, exclusive) {
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST' || exclusive) throw error; }
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077 ||
      await realpath(directory) !== directory || process.getuid && info.uid !== process.getuid())
    fail('APP_CANONICAL_PRIVATE_DIRECTORY_REQUIRED');
}

async function samePreparedFile(path, bytes) {
  let info;
  try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.mode & 0o077 ||
      process.getuid && info.uid !== process.getuid() || !(await readPrivateFile(path, 4194304)).equals(bytes))
    fail('APP_PREPARED_FILE_CHANGED', 409);
  return true;
}

async function retainPreparedFile(path, bytes) {
  if (await samePreparedFile(path, bytes)) return;
  const temporary = join(dirname(path), '.app-preparation-' + digest(bytes) + '-' + randomBytes(16).toString('hex') + '.tmp');
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, path); }
    catch (error) { if (error.code !== 'EEXIST' || !await samePreparedFile(path, bytes)) throw error; }
    await unlink(temporary);
    const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function recoverPreparedTemporaries(directory, files) {
  const expected = new Map([...files].map(([name, bytes]) => [digest(bytes), { name, bytes }]));
  let changed = false;
  for (const name of await readdir(directory)) {
    const match = /^\.app-preparation-([a-f0-9]{64})-[a-f0-9]{32}\.tmp$/.exec(name);
    if (!match || !expected.has(match[1])) continue;
    const item = expected.get(match[1]), path = join(directory, name);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || ![1, 2].includes(info.nlink) || info.mode & 0o077 ||
          info.size > item.bytes.length || process.getuid && info.uid !== process.getuid())
        fail('APP_PREPARATION_TEMP_CHANGED', 409);
      const body = await handle.readFile();
      if (!item.bytes.subarray(0, body.length).equals(body))
        fail('APP_PREPARATION_TEMP_CHANGED', 409);
      if (info.nlink === 2) {
        const target = await lstat(join(directory, item.name));
        if (body.length !== item.bytes.length || target.isSymbolicLink() || !target.isFile() ||
            target.dev !== info.dev || target.ino !== info.ino || target.nlink !== 2)
          fail('APP_PREPARATION_TEMP_CHANGED', 409);
      }
      const current = await lstat(path);
      if (current.isSymbolicLink() || current.dev !== info.dev || current.ino !== info.ino)
        fail('APP_PREPARATION_TEMP_CHANGED', 409);
      await unlink(path); changed = true;
    } finally { await handle.close(); }
  }
  if (changed) {
    const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
}

/** Resume these exact prepared bytes, including the original generated capability. */
export async function materializeApplicationConfiguration(prepared, { expectedSha256, exclusive = false } = {}) {
  if (!object(prepared) || prepared.schema !== PREPARED_CONFIGURATION_SCHEMA ||
      typeof prepared.directory !== 'string' || resolve(prepared.directory) !== prepared.directory ||
      prepared.directory === '/' || typeof expectedSha256 !== 'string' ||
      digest(jsonBytes(prepared)) !== expectedSha256 || typeof exclusive !== 'boolean')
    fail('APP_PREPARED_CONFIGURATION_CHANGED', 409);
  const names = prepared.files?.map(item => item.name);
  if (!Array.isArray(names) || !['["application.key","gateway.json","application.json"]',
      '["merchant.json","application.key","gateway.json","application.json"]'].includes(JSON.stringify(names)))
    fail('APP_PREPARED_CONFIGURATION_INVALID');
  const files = new Map();
  for (const item of prepared.files) {
    if (typeof item.content !== 'string' || Buffer.byteLength(item.content) > 4194304 ||
        digest(Buffer.from(item.content)) !== item.sha256) fail('APP_PREPARED_CONFIGURATION_CHANGED', 409);
    files.set(item.name, Buffer.from(item.content));
  }
  const original = await readJobMerchant(prepared.inputMerchant);
  if (canonical(original.identity) !== canonical(prepared.originalSource) ||
      digest(await readPrivateFile(prepared.inputGateway)) !== prepared.inputGatewaySha256)
    fail('APP_PREPARATION_SOURCE_CHANGED', 409);
  const profile = parseApplicationProfile(files.get('application.json'));
  const selected = prepared.directory;
  if (profile.gateway !== join(selected, 'gateway.json') || profile.key !== join(selected, 'application.key') ||
      profile.store !== join(selected, 'executions') ||
      profile.merchant !== (files.has('merchant.json') ? join(selected, 'merchant.json') : prepared.inputMerchant) ||
      canonical(profile.originalSource) !== canonical(original.identity) ||
      canonical(prepared.result?.source) !== canonical(profile.source))
    fail('APP_PREPARED_CONFIGURATION_INVALID');
  await preparedDirectory(selected, exclusive);
  const lease = await acquireStateLease(selected);
  try {
    await recoverPreparedTemporaries(selected, files);
    for (const [name, bytes] of files) await retainPreparedFile(join(selected, name), bytes);
    const runtime = await readApplication(join(selected, 'application.json'));
    if (canonical(runtime.source.identity) !== canonical(prepared.result.source) ||
        runtime.gateway.state !== prepared.result.merchantState ||
        runtime.profilePath !== prepared.result.profile || runtime.profile.gateway !== prepared.result.gateway ||
        runtime.profile.store !== prepared.result.store || runtime.profile.origin !== prepared.result.origin ||
        canonical(runtime.routes) !== canonical(prepared.result.routes))
      fail('APP_PREPARED_CONFIGURATION_CHANGED', 409);
    return structuredClone(prepared.result);
  } finally { await lease.close(); }
}

/** Original configure remains exclusive; merchant workspaces retain preparation before resume. */
export async function configureApplication(options) {
  const prepared = await prepareApplicationConfiguration(options);
  return materializeApplicationConfiguration(prepared, { expectedSha256: digest(jsonBytes(prepared)), exclusive: true });
}
export function parseApplicationProfile(profileBytes) {
  const profile = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(profileBytes));
  if (!object(profile) || profile.schema !== PROFILE_SCHEMA ||
      !['merchant', 'gateway', 'store', 'key'].every(key => typeof profile[key] === 'string' && isAbsolute(profile[key])) ||
      !Number.isSafeInteger(profile.port) || profile.port < 1 || profile.port > 65535 ||
      profile.origin !== 'http://127.0.0.1:' + profile.port) fail('APP_PROFILE_REQUIRED');
  return profile;
}
/** Shared logical validation. Recovery supplies byte-identical captured sources. */
export function applicationFromSources(profilePath, profileBytes, source, gatewayBytes, capability) {
  const profile = parseApplicationProfile(profileBytes);
  if (canonical(source.identity) !== canonical(profile.source) ||
      digest(source.configSource) !== profile.source.configSha256 ||
      digest(source.applicationSource) !== profile.source.applicationSha256)
    fail('APP_ORIGINAL_SOURCE_CHANGED', 409);
  if (digest(gatewayBytes) !== profile.gatewaySha256) fail('APP_GATEWAY_SOURCE_CHANGED', 409);
  const gateway = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(gatewayBytes));
  const routes = routesFor(source, gateway, profile.routes, profile.origin);
  for (const route of routes) {
    const actual = gateway.routes.find(value => value.id === route.id);
    if (actual.upstream !== profile.origin || canonical(actual.query || []) !== '[]' ||
        canonical(actual.headerEnv || {}) !== canonical({ [KEY_HEADER]: KEY_ENV }) ||
        actual.maxRequestBytes !== route.maxInputBytes || actual.maxResponseBytes !== route.maxOutputBytes)
      fail('APP_GATEWAY_ROUTE_CHANGED', 409);
  }
  if (!/^[a-f0-9]{64}$/.test(capability) || digest(capability) !== profile.capabilitySha256)
    fail('APP_CAPABILITY_FILE_INVALID');
  const upstreamHeadersSha256 = digest(canonical({ [KEY_HEADER]: capability }));
  return { profilePath, profileSha256: digest(profileBytes), profile, source, gateway, routes, capability, upstreamHeadersSha256 };
}
export async function readApplication(profilePath) {
  profilePath = resolve(profilePath);
  const profileBytes = await readPrivateFile(profilePath);
  const profile = parseApplicationProfile(profileBytes);
  const source = await readJobMerchant(profile.merchant);
  const gatewayBytes = await readPrivateFile(profile.gateway);
  const keyInfo = await lstat(profile.key);
  if (keyInfo.mode & 0o077) fail('APP_CAPABILITY_FILE_MUST_BE_PRIVATE', 403);
  const capability = (await readPrivateFile(profile.key, 256)).toString('ascii').trim();
  return applicationFromSources(profilePath, profileBytes, source, gatewayBytes, capability);
}
export function requestIdentity(runtime, route, body, contentType, accept) {
  return { route: route.id, method: 'POST', path: route.path, origin: runtime.profile.origin,
    query: [], contentType, accept, bodySha256: digest(body), upstreamHeadersSha256: runtime.upstreamHeadersSha256 };
}
