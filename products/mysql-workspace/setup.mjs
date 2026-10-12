// MIT. Portable MySQL product setup around the original SF30 workspace.
import { mkdir, lstat, realpath, readdir, rename, open } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readMysqlSourceFile } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/config.mjs';
import { createMysqlWorkspace } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/mysql/workspace/model.mjs';
import { acquireDatasetLease } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import { absolute, privateDirectory, readPrivate, readJson, bytes, digest, identity,
  createFile, atomicJson, syncDirectory, fault, stamp, object } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';

export { absolute, privateDirectory, readPrivate, readJson, bytes, digest, identity,
  createFile, atomicJson, syncDirectory, fault, stamp, object, acquireDatasetLease };
export const PRODUCT_SCHEMA = 'stellar-forge.mysql-product.v1';
export const SESSION_SCHEMA = 'stellar-forge.mysql-product-session.v1';
export const CONNECTION_SCHEMA = 'stellar-forge.mysql-product-connection.v1';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const SHA = /^[a-f0-9]{64}$/;
export const ALIAS = /^[a-z][a-z0-9_-]{0,63}$/;
export function need(value, code, message = code) { if (!value) throw fault(code, message, 409); }
export async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function once(path, value) {
  const raw = Buffer.isBuffer(value) ? value : bytes(value);
  try { await createFile(path, raw); await syncDirectory(dirname(path)); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need((await readPrivate(path, Math.max(raw.length, 1048576))).equals(raw),
      'MYSQL_PRODUCT_SETUP_CONFLICT', 'Continue the original setup with its selected source and settings.');
  }
}
export function paths(directory) {
  directory = absolute(resolve(directory));
  return { directory, sourceDirectory: join(directory, 'source'), sourceFile: join(directory, 'source', 'source.json'),
    workspaceDirectory: join(directory, 'workspace'), publicationDirectory: join(directory, 'publications'),
    database: join(directory, 'product.sqlite'), receivingDirectory: join(directory, 'receiving'),
    configuration: join(directory, 'operator', 'merchant-mcp.json'), connection: join(directory, 'mysql-connections.json'),
    sessionFile: join(directory, 'connection.json') };
}
function label(value) {
  need(typeof value === 'string' && value.trim() && value.length <= 160 && !/[\x00-\x1f\x7f]/.test(value),
    'MYSQL_PRODUCT_NAME_REQUIRED', 'Give the product a printable name up to 160 characters.');
  return value.trim();
}
export function runtimeSettings(value = {}) {
  need(object(value) && Object.keys(value).every(key => ['sellerPort','operationsPort','facilitator','allowLocalFacilitator'].includes(key)),
    'MYSQL_PRODUCT_RUNTIME_INVALID');
  const result = { sellerPort: value.sellerPort ?? 0, operationsPort: value.operationsPort ?? 0,
    allowLocalFacilitator: value.allowLocalFacilitator ?? false };
  need([result.sellerPort, result.operationsPort].every(port => Number.isInteger(port) && port >= 0 && port <= 65535) &&
    typeof result.allowLocalFacilitator === 'boolean', 'MYSQL_PRODUCT_RUNTIME_INVALID');
  if (value.facilitator !== undefined) {
    let url; try { url = new URL(value.facilitator); } catch {}
    need(url && !url.username && !url.password && !url.hash && !url.search &&
      (url.protocol === 'https:' || result.allowLocalFacilitator && url.protocol === 'http:' &&
        url.hostname === '127.0.0.1'),
      'MYSQL_PRODUCT_FACILITATOR_INVALID', 'Select the original HTTPS facilitator or explicitly allow a local facilitator.');
    result.facilitator = url.href;
  }
  return result;
}
/** Credential values remain environment references. Only the configured CA is copied. */
export async function initializeMysqlProduct(input = {}) {
  const p = paths(input.directory);
  await privateDirectory(dirname(p.directory));
  const existed = await exists(p.directory);
  await privateDirectory(p.directory, true);
  const lease = acquireDatasetLease(p.directory);
  try {
    const retained = await exists(join(p.directory, 'product.setup.json'))
      ? await readJson(join(p.directory, 'product.setup.json'), 65536) : null;
    if (!retained && existed)
      need((await readdir(p.directory)).every(name => name === 'writer.lease'), 'MYSQL_PRODUCT_DIRECTORY_NOT_EMPTY');
    const sourceFile = absolute(resolve(input.sourceFile ?? retained?.originalSourceFile ?? ''));
    const original = await readPrivate(sourceFile);
    const opened = await readMysqlSourceFile(sourceFile);
    need(digest(await readPrivate(sourceFile)) === digest(original), 'MYSQL_PRODUCT_SOURCE_CHANGED');
    const runtimeSource = structuredClone(opened.config);
    let ca = null;
    if (runtimeSource.connection.caFile) {
      ca = await readPrivate(resolve(dirname(sourceFile), runtimeSource.connection.caFile), 1048576);
      runtimeSource.connection.caFile = 'database-ca.pem';
    }
    const setup = { schema: PRODUCT_SCHEMA, productId: retained?.productId ?? randomUUID(),
      createdAt: retained?.createdAt ?? stamp(), name: label(input.name ?? retained?.name ?? 'MySQL merchant'),
      workspace: input.workspace ?? retained?.workspace ?? 'mysql',
      originalSourceFile: sourceFile, originalSourceSha256: digest(original), originalSourceBytes: original.length,
      sourceSha256: digest(bytes(runtimeSource)), caSha256: ca ? digest(ca) : null,
      runtime: runtimeSettings(input.runtime ?? retained?.runtime) };
    need(ALIAS.test(setup.workspace), 'MYSQL_PRODUCT_ALIAS_INVALID');
    if (retained) need(identity(setup) === identity(retained), 'MYSQL_PRODUCT_SETUP_CONFLICT');
    await once(join(p.directory, 'product.setup.json'), setup);
    for (const directory of [p.sourceDirectory,p.publicationDirectory,p.receivingDirectory])
      await privateDirectory(directory, true);
    await once(join(p.sourceDirectory, 'original-source.json'), original);
    if (ca) await once(join(p.sourceDirectory, 'database-ca.pem'), ca);
    await once(p.sourceFile, bytes(runtimeSource));
    const originalWorkspace = await createMysqlWorkspace({ sourceFile: p.sourceFile, stateDirectory: p.workspaceDirectory });
    await originalWorkspace.close();
    const profile = { ...setup, sourceFile: 'source/source.json', workspaceDirectory: 'workspace',
      publicationDirectory: 'publications', receivingDirectory: 'receiving',
      configuration: 'operator/merchant-mcp.json', connection: 'mysql-connections.json' };
    await once(join(p.directory, 'product.json'), profile);
    await once(p.connection, { schema: CONNECTION_SCHEMA, workspaces: {
      [profile.workspace]: { label: profile.name, directory: '.' } } });
    const operatorRoot = join(p.directory, 'operator');
    await privateDirectory(operatorRoot, true);
    const releaseStore = join(operatorRoot, 'releases');
    if (!await exists(releaseStore)) {
      const { initReleaseStore } = await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs');
      await initReleaseStore(releaseStore);
    }
    await privateDirectory(join(operatorRoot, 'customer-exports'), true);
    await once(p.configuration, { schema: 'stellar-forge.merchant-mcp.v1', name: profile.name,
      releaseStore: './releases', exportsDirectory: './customer-exports', sources: {},
      mysqlProductConnection: '../mysql-connections.json' });
    lease.assertHeld();
    return { schema: PRODUCT_SCHEMA, state: 'INITIALIZED', productId: profile.productId, name: profile.name,
      workspace: profile.workspace, directory: p.directory, configuration: p.configuration,
      sourceSha256: profile.sourceSha256, requiredEnvironment: [runtimeSource.connection.passwordEnv],
      runtime: profile.runtime };
  } finally { await lease.close(); }
}
export async function readMysqlProduct(directory) {
  const p = paths(directory); await privateDirectory(p.directory);
  const profile = await readJson(join(p.directory, 'product.json'), 65536);
  need(profile.schema === PRODUCT_SCHEMA && UUID.test(profile.productId) && ALIAS.test(profile.workspace) &&
    profile.sourceFile === 'source/source.json' && profile.workspaceDirectory === 'workspace' &&
    profile.publicationDirectory === 'publications' && profile.receivingDirectory === 'receiving' &&
    profile.configuration === 'operator/merchant-mcp.json' && profile.connection === 'mysql-connections.json' &&
    SHA.test(profile.sourceSha256), 'MYSQL_PRODUCT_PROFILE_INVALID');
  const source = await readPrivate(p.sourceFile);
  need(digest(source) === profile.sourceSha256, 'MYSQL_PRODUCT_SOURCE_CHANGED',
    'The retained source differs from this product. Initialize the explicitly revised source in a new product.');
  if (profile.caSha256) need(digest(await readPrivate(join(p.sourceDirectory, 'database-ca.pem'), 1048576)) === profile.caSha256,
    'MYSQL_PRODUCT_CA_CHANGED');
  runtimeSettings(profile.runtime);
  const declaration = await readMysqlSourceFile(p.sourceFile);
  return { profile, paths: p, declaration };
}
export async function inspectMysqlProduct(directory) {
  const value = await readMysqlProduct(directory);
  const lastSession = await exists(value.paths.sessionFile) ? await readJson(value.paths.sessionFile, 65536) : null;
  const c = value.declaration.config.connection;
  return { schema: PRODUCT_SCHEMA, state: 'INITIALIZED', productId: value.profile.productId, name: value.profile.name,
    workspace: value.profile.workspace, directory: value.paths.directory, configuration: value.paths.configuration,
    sourceSha256: value.profile.sourceSha256, source: { host: c.host, port: c.port, database: c.database, user: c.user,
      tls: c.tls, passwordEnv: c.passwordEnv }, runtime: value.profile.runtime, lastSession };
}
export async function readMysqlProductConfiguration(path) {
  path = absolute(resolve(path));
  const raw = await readJson(path, 1048576);
  need(raw.schema === CONNECTION_SCHEMA && object(raw.workspaces) &&
    Object.keys(raw).every(key => ['schema','workspaces'].includes(key)) &&
    Object.keys(raw.workspaces).length >= 1 && Object.keys(raw.workspaces).length <= 32, 'MYSQL_PRODUCT_CONNECTION_INVALID');
  const workspaces = Object.create(null);
  for (const [alias, item] of Object.entries(raw.workspaces)) {
    need(ALIAS.test(alias) && object(item) && Object.keys(item).every(key => ['label','directory'].includes(key)) &&
      typeof item.directory === 'string' && !item.directory.includes('\0'), 'MYSQL_PRODUCT_CONNECTION_INVALID');
    const directory = resolve(dirname(path), item.directory), selected = await readMysqlProduct(directory);
    workspaces[alias] = { label: label(item.label ?? selected.profile.name), directory, productId: selected.profile.productId };
  }
  return { schema: CONNECTION_SCHEMA, workspaces };
}
