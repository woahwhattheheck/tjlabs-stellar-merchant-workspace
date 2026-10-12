// MIT. Private product metadata around the original gRPC workspace and transports.
import { constants as C } from 'node:fs';
import { mkdir, lstat, realpath, open, rename, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acquireDatasetLease } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import { readSf61HostFile } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';

export const PRODUCT_SCHEMA = 'stellar-forge.grpc-product.v1';
export const SESSION_SCHEMA = 'stellar-forge.grpc-product-session.v1';
export const LAUNCH_SCHEMA = 'stellar-forge.grpc-product-launch.v1';
export const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const HASH = /^[a-f0-9]{64}$/;
export const ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const failure = (code, message) => Object.assign(new Error(message), { code: 'GRPC_PRODUCT_' + code });
export function need(value, message, code = 'INPUT') { if (!value) throw failure(code, message); }
export const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
export function absolute(value) {
  need(typeof value === 'string' && value.length && !value.includes('\0'), 'Select an original private path.');
  return resolve(value);
}
export async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function privateDirectory(path, create = false) {
  path = absolute(path);
  if (create) await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
    (process.getuid === undefined || info.uid === process.getuid()) && await realpath(path) === path,
  'Use an original canonical private directory with mode 0700: ' + path, 'PRIVATE_DIRECTORY');
  return path;
}
export async function privateBytes(path, optional = false, maximum = 1024 * 1024) {
  try { return await readSf61HostFile(path, maximum, { privateFile: true }); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
export async function syncDirectory(path) {
  const handle = await open(path, C.O_RDONLY); try { await handle.sync(); } finally { await handle.close(); }
}
export async function publish(path, value, replace = false) {
  const bytes = Buffer.isBuffer(value) ? value : typeof value === 'string'
    ? Buffer.from(value) : Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const old = await privateBytes(path, true, Math.max(bytes.length, 2 * 1024 * 1024));
  if (old?.equals(bytes)) return;
  if (old && !replace) throw failure('CONFLICT', 'The retained product file has different original bytes: ' + path);
  const temporary = path + '.' + randomUUID() + '.partial';
  const handle = await open(temporary, C.O_CREAT | C.O_EXCL | C.O_WRONLY | C.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(bytes); await handle.sync(); await handle.close();
    if (replace) await rename(temporary, path);
    else {
      try { await link(temporary, path); }
      catch (error) { if (error.code !== 'EEXIST' || !(await privateBytes(path)).equals(bytes)) throw error; }
    }
    await syncDirectory(dirname(path));
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
export function leaseProduct(directory) {
  try { return acquireDatasetLease(directory); }
  catch (error) {
    if (error.code === 'DATASET_WRITER_RUNNING')
      throw failure('ALREADY_OPEN', 'Use this product’s existing browser and agent; its original owner is still open.');
    throw error;
  }
}
export function originalPaths(directory) {
  return { directory, configuration: join(directory, 'operator', 'merchant-mcp.json'),
    connection: join(directory, 'grpc-connections.json'), consoleUrlFile: join(directory, 'console-url.txt'),
    connectionFile: join(directory, 'connection.json'), receivingDirectory: join(directory, 'receiving') };
}
export function launchOptions(input = {}) {
  const options = { directory: absolute(input.directory), port: input.port ?? 0,
    workspacePort: input.workspacePort ?? 0, sellerPort: input.sellerPort ?? 0, operationsPort: input.operationsPort ?? 0,
    tokenEnv: input.tokenEnv ?? 'MCP_ACCESS_TOKEN', browserOnly: input.browserOnly ?? false,
    facilitator: input.facilitator ?? null, allowLocalFacilitator: input.allowLocalFacilitator ?? false };
  for (const key of ['port', 'workspacePort', 'sellerPort', 'operationsPort'])
    need(Number.isInteger(options[key]) && options[key] >= 0 && options[key] <= 65535, 'Use local ports from 0 through 65535.');
  need(ENV.test(options.tokenEnv) && typeof options.browserOnly === 'boolean' &&
    typeof options.allowLocalFacilitator === 'boolean', 'Select a token environment name and explicit boolean options.');
  need(!options.browserOnly || options.port === 0, 'Browser-only mode does not select an agent port.');
  if (options.facilitator !== null) {
    let value; try { value = new URL(options.facilitator); } catch {}
    need(typeof options.facilitator === 'string' && value &&
      (value.protocol === 'https:' || options.allowLocalFacilitator && value.protocol === 'http:' && value.hostname === '127.0.0.1') &&
      !value.username && !value.password && !value.search && !value.hash,
    'Select an HTTPS facilitator or explicitly permitted original local facilitator.');
  } else need(!options.allowLocalFacilitator, 'Select the local facilitator URL before permitting it.');
  return options;
}
