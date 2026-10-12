// MIT. Whole-file publication and native-file identities for captured merchant handovers.
import { constants as C } from 'node:fs';
import { lstat, mkdir, open, link, unlink, realpath, readdir } from 'node:fs/promises';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readSf61HostFile } from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { acquireDatasetLease } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';

export const METADATA_LIMIT = 64 * 1024 * 1024;
export const NATIVE_FILE_LIMIT = 128 * 1024 * 1024;
export const HASH = /^[a-f0-9]{64}$/;
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
export const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export function exact(value, allowed, required = []) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(value, key)))
    fail('CAPTURED_HANDOVER_INPUT', 'Use the original handover fields.');
}
export function title(value, fallback = 'Captured merchant handover') {
  value ??= fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\x00-\x1f\x7f]/.test(value))
    fail('CAPTURED_HANDOVER_INPUT', 'Use a printable handover label of 1–160 characters.');
  return value.trim();
}
export function absolute(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0'))
    fail('CAPTURED_HANDOVER_INPUT', 'Choose an absolute private directory.');
  return resolve(value);
}
export function childName(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || isAbsolute(value) ||
      value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..' || part.length > 255))
    fail('CAPTURED_HANDOVER_FILE', 'Use a declared relative native file path.');
  return value;
}
export const inside = (parent, child) => {
  const value = relative(parent, child);
  return value === '' || value !== '..' && !value.startsWith('../') && !isAbsolute(value);
};
export async function present(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function directory(path, create = false) {
  path = absolute(path);
  if (create) {
    await directory(dirname(path));
    try { await mkdir(path, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o077) ||
      await realpath(path) !== path)
    fail('CAPTURED_HANDOVER_DIRECTORY', 'Use the original canonical private directory: ' + path);
  return path;
}
export async function parents(root, name) {
  root = await directory(root); childName(name);
  for (const part of name.split('/').slice(0, -1)) root = await directory(join(root, part), true);
  return root;
}
export async function bytes(root, name, maximum = NATIVE_FILE_LIMIT) {
  childName(name);
  let parent = await directory(root);
  for (const part of name.split('/').slice(0, -1)) parent = await directory(join(parent, part));
  return readSf61HostFile(join(root, name), Math.max(1, maximum), { privateFile: true });
}
export async function readJSON(root, name, optional = false) {
  try { return decode(await bytes(root, name, METADATA_LIMIT)); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
export async function syncDirectory(path) {
  const handle = await open(path, C.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function publishBytes(root, name, content) {
  if (!Buffer.isBuffer(content)) content = Buffer.from(content);
  await parents(root, name);
  const path = join(root, name);
  if (await present(path)) {
    const old = await bytes(root, name, Math.max(content.length, METADATA_LIMIT));
    if (!old.equals(content)) fail('CAPTURED_HANDOVER_CONFLICT', 'This retained file has different original bytes: ' + name);
    return;
  }
  const temporary = path + '.' + randomUUID() + '.partial';
  const handle = await open(temporary, C.O_CREAT | C.O_EXCL | C.O_WRONLY | C.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(content); await handle.sync(); await handle.close();
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST' ||
          !(await bytes(root, name, Math.max(content.length, METADATA_LIMIT))).equals(content)) throw error;
    }
    await unlink(temporary); await syncDirectory(dirname(path));
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
export function publishJSON(root, name, value) {
  const content = encode(value);
  if (content.length > METADATA_LIMIT)
    fail('CAPTURED_HANDOVER_LIMIT', 'This complete handover record exceeds 64 MiB; select a smaller collection.');
  return publishBytes(root, name, content);
}
export async function fileRow(root, name, maximum = NATIVE_FILE_LIMIT) {
  const content = await bytes(root, name, maximum);
  return { name, bytes: content.length, sha256: digest(content) };
}
export function fileRows(value) {
  if (!Array.isArray(value) || value.length > 200000)
    fail('CAPTURED_HANDOVER_FILE', 'Use the complete bounded native file roster.');
  const seen = new Set();
  for (const row of value) {
    exact(row, ['name', 'bytes', 'sha256'], ['name', 'bytes', 'sha256']);
    childName(row.name);
    if (seen.has(row.name) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 ||
        row.bytes > NATIVE_FILE_LIMIT || !HASH.test(row.sha256))
      fail('CAPTURED_HANDOVER_FILE', 'A native file identity is repeated or invalid.');
    seen.add(row.name);
  }
  return value;
}
export function includesFiles(actual, expected) {
  fileRows(actual); fileRows(expected);
  const rows = new Map(actual.map(row => [row.name, row]));
  for (const row of expected) if (canonical(rows.get(row.name)) !== canonical(row))
    fail('CAPTURED_HANDOVER_CHANGED', 'The original native file differs or is absent: ' + row.name);
}
export async function verifyFiles(root, files) {
  for (const row of fileRows(files)) {
    const actual = await fileRow(root, row.name, Math.max(1, row.bytes));
    if (canonical(actual) !== canonical(row))
      fail('CAPTURED_HANDOVER_CHANGED', 'The original native file changed: ' + row.name);
  }
}
/** Finish only a whole file's own published hard link after an interrupted unlink.
 * Native source/package files and unrelated staging paths remain with their owners. */
async function finishPublishedLinks(root, names) {
  for (const name of names) {
    const match = /^(.*)\.([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.partial$/.exec(name);
    if (!match) continue;
    const temporary = join(root,name), target = join(root,match[1]);
    if (!await present(target)) continue;
    const staged = await lstat(temporary), published = await lstat(target);
    if (staged.isFile() && published.isFile() && !staged.isSymbolicLink() && !published.isSymbolicLink() &&
        !(staged.mode & 0o077) && staged.dev === published.dev && staged.ino === published.ino) {
      await unlink(temporary); await syncDirectory(root);
    }
  }
}
async function finishPublications(root) {
  const top = await readdir(root);
  await finishPublishedLinks(root,top.filter(name => /^(operation|received|original-handover|handover-review|handover)\.json\.|^READ-ME\.md\./.test(name)));
  for (const name of ['native-inputs','records']) if (top.includes(name)) {
    const selected = await directory(join(root,name));
    await finishPublishedLinks(selected,await readdir(selected));
  }
  if (top.includes('packages')) {
    const parent = await directory(join(root,'packages'));
    for (const name of await readdir(parent)) if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
      const selected = await directory(join(parent,name));
      await finishPublishedLinks(selected,(await readdir(selected)).filter(file => file.startsWith('package-export.json.')));
    }
  }
}
export async function operation(root, work, { create = false } = {}) {
  root = await directory(root, create);
  const lease = acquireDatasetLease(root);
  try {
    lease.assertHeld(); await finishPublications(root);
    const result = await work(root,lease); lease.assertHeld(); return result;
  } finally { await lease.close(); }
}
export async function requireEmptyOperation(root, recordName) {
  if (await present(join(root, recordName))) return;
  // A stopped first-record publication has made no native mutation yet.
  // Preserve its unused private stage and publish the selected original record.
  const pending = new RegExp('^' + recordName.replaceAll('.', '\\.') +
    '\\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\.partial$');
  if ((await readdir(root)).some(name => name !== 'writer.lease' && !pending.test(name)))
    fail('CAPTURED_HANDOVER_CONFLICT', 'Use an empty output directory or its retained original handover operation.');
}
