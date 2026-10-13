// MIT. Shared original private-file identities and durable writes for FRED operating sources.
import { constants } from 'node:fs';
import { open, lstat, realpath, readdir, mkdir, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, basename, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJSONChunks, canonicalJSONDigest, canonicalJSONInfo } from '../canonical-stream.mjs';

export const FRED_OPERATING_PACKAGE_SCHEMA = 'stellar-forge.fred-operating-package.v1';
export const FRED_OPERATING_SOURCE_FILE = 'source.json';
export const FRED_OPERATING_MANIFEST_FILE = 'MANIFEST.json';
export const MAX_FRED_OPERATING_DESCRIPTOR_BYTES = 32 * 1024 * 1024;
export const MAX_FRED_OPERATING_PACKAGE_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_FRED_OPERATING_BUNDLE_BYTES = 480 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const utf8 = new TextDecoder('utf-8', { fatal:true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stop = signal => signal?.throwIfAborted();
function need(ok, message, code = 'FRED_OPERATING_SOURCE_INVALID') {
  if (!ok) throw Object.assign(new Error(message), { code });
}
function same(a, b, label) { need(canonicalJSONDigest(a) === canonicalJSONDigest(b), label + ' changed.'); }
function pathName(name) {
  need(typeof name === 'string' && name.length > 0 && name.length <= 2000 &&
    !/[\u0000-\u001f\u007f\\]/.test(name) && !isAbsolute(name) && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..'), 'Keep each original file at a relative package path.');
  return name;
}
function ref(value, maximum = MAX_FRED_OPERATING_PACKAGE_BYTES) {
  need(value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'bytes,path,sha256',
    'Select the exact original file descriptor.');
  pathName(value.path);
  need(Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= maximum &&
    HASH.test(value.sha256 ?? ''), 'The original file length or hash is invalid.');
  return value;
}
function stamp(info) { return [info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs].join(':'); }
function absolute(value, label) {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && value !== '/', label + ' must be an absolute private directory.');
  return value;
}
async function directory(path, create = false) {
  if (create) {
    let ancestor = path;
    for (;;) {
      try { await lstat(ancestor); break; }
      catch(error) { if (error.code !== 'ENOENT') throw error; const next = dirname(ancestor); need(next !== ancestor, 'Choose an existing output ancestor.'); ancestor = next; }
    }
    need(await realpath(ancestor) === ancestor, 'Output ancestors must not redirect through a symlink.');
    await mkdir(path, { recursive:true, mode:0o700 });
  }
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077) && await realpath(path) === path,
    'Keep the original source in a real private directory: ' + path);
  return path;
}
async function parent(root, name, create = false) {
  pathName(name); await directory(root);
  let current = root;
  for (const part of name.split('/').slice(0, -1)) { current = join(current, part); await directory(current, create); }
}
async function recoverCommittedLink(path, file, info) {
  if (info.nlink === 1) return info;
  need(info.isFile() && info.nlink > 1 && !(info.mode & 0o077), 'Read a private original regular file.');
  // writeStream fsyncs the complete file, links it create-only, then removes its
  // UUID temporary name. A process can stop between those final two operations.
  // Admit only links accounted for by that exact writer namespace and inode.
  const root = dirname(path), prefix = basename(path) + '.', candidates = [];
  for (const name of await readdir(root)) {
    if (!name.startsWith(prefix) || !name.endsWith('.part')) continue;
    const nonce = name.slice(prefix.length,-5);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(nonce)) continue;
    const candidate = join(root,name);
    let item;
    try { item = await lstat(candidate); } catch(error) { if (error.code === 'ENOENT') continue; throw error; }
    if (item.isFile() && !item.isSymbolicLink() && !(item.mode & 0o077) &&
        item.dev === info.dev && item.ino === info.ino) candidates.push(candidate);
  }
  info = await file.stat();
  if (info.nlink === 1) return info; // The original writer completed its unlink.
  need(info.nlink === candidates.length + 1, 'The original file has an unaccounted hard link.');
  for (const candidate of candidates) {
    // Recheck immediately before unlinking; never remove a replacement file.
    let item;
    try { item = await lstat(candidate); } catch(error) { if (error.code === 'ENOENT') continue; throw error; }
    need(item.isFile() && !item.isSymbolicLink() && item.dev === info.dev && item.ino === info.ino,
      'The original writer temporary link changed during recovery.');
    await unlink(candidate).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const owner = await open(root,constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await owner.sync(); } finally { await owner.close(); }
  info = await file.stat();
  need(info.nlink === 1, 'The original file still has an unaccounted hard link.');
  return info;
}
async function opened(root, name, maximum = MAX_FRED_OPERATING_PACKAGE_BYTES) {
  await parent(root, name);
  const path = join(root, name), file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    let info = await file.stat();
    need(info.isFile() && !(info.mode & 0o077) && info.size >= 0 && info.size <= maximum,
      'Read a complete private original file: ' + name);
    info = await recoverCommittedLink(path,file,info);
    need(info.nlink === 1,'Read an independent original file: ' + name);
    return { file, info, path };
  } catch(error) { await file.close(); throw error; }
}
async function unchanged(value) {
  const after = await value.file.stat(), named = await lstat(value.path);
  need(stamp(after) === stamp(value.info) && named.isFile() && !named.isSymbolicLink() &&
    named.dev === after.dev && named.ino === after.ino, 'The original file changed during its read.');
}
async function describe(root, name, signal, maximum = MAX_FRED_OPERATING_PACKAGE_BYTES) {
  stop(signal); const item = await opened(root, name, maximum), digest = createHash('sha256'); let bytes = 0;
  try {
    for await (const chunk of item.file.createReadStream({ autoClose:false })) { stop(signal); bytes += chunk.length; digest.update(chunk); }
    await unchanged(item); need(bytes === item.info.size, 'The original file ended early.');
    return { path:name, bytes, sha256:digest.digest('hex') };
  } finally { await item.file.close(); }
}
async function readJson(root, name, maximum, expected = null, signal) {
  stop(signal); const item = await opened(root, name, maximum);
  try {
    const bytes = await item.file.readFile(); await unchanged(item); stop(signal);
    need(bytes.length === item.info.size, 'The original JSON file ended early.');
    if (expected) same({ path:name, bytes:bytes.length, sha256:hash(bytes) }, ref(expected), 'Original JSON identity');
    return JSON.parse(utf8.decode(bytes));
  } finally { await item.file.close(); }
}
async function optional(root, name, maximum, signal) {
  try { return await readJson(root, name, maximum, null, signal); }
  catch(error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writeStream(root, name, chunks, expected = null, signal, maximum = MAX_FRED_OPERATING_PACKAGE_BYTES) {
  pathName(name); await parent(root, name, true); stop(signal);
  const temporary = name + '.' + randomUUID() + '.part', file = await open(join(root, temporary),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const digest = createHash('sha256'); let bytes = 0;
  try {
    for await (const piece of chunks) {
      stop(signal); const chunk = typeof piece === 'string' ? Buffer.from(piece) : piece;
      bytes += chunk.length; need(bytes <= maximum, 'The complete original file exceeds package capacity.');
      digest.update(chunk); let offset = 0;
      while (offset < chunk.length) { const result = await file.write(chunk, offset, chunk.length - offset); need(result.bytesWritten > 0, 'The original output could not be completed.'); offset += result.bytesWritten; }
    }
    const value = { path:name, bytes, sha256:digest.digest('hex') }; ref(value, maximum);
    if (expected) same(value, expected, 'Complete original output');
    await file.sync(); await file.close();
    try { await link(join(root, temporary), join(root, name)); }
    catch(error) { if (error.code !== 'EEXIST') throw error; same(await describe(root, name, signal, maximum), value, 'Previously retained original file'); }
    await unlink(join(root, temporary)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const dir = await open(dirname(join(root, name)), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await dir.sync(); } finally { await dir.close(); }
    return value;
  } finally { await file.close().catch(() => {}); await unlink(join(root, temporary)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
function jsonChunks(value) { return canonicalJSONChunks(value); }
async function writeJson(root, name, value, maximum, signal) {
  need(canonicalJSONInfo(value).bytes <= maximum, 'The complete JSON descriptor exceeds its capacity.');
  const valueRef = await writeStream(root, name, jsonChunks(value), null, signal);
  need(valueRef.bytes <= maximum, 'The complete JSON descriptor exceeds its capacity.'); return valueRef;
}
async function copy(root, value, destination, signal) {
  ref(value); const item = await opened(root, value.path);
  try {
    const saved = await writeStream(destination, value.path, item.file.createReadStream({ autoClose:false }), value, signal);
    await unchanged(item); return saved;
  } finally { await item.file.close(); }
}

export { HASH, ID, utf8, hash, stop, need, same, pathName, ref, stamp, absolute, directory, parent, opened, unchanged, describe, readJson, optional, writeStream, writeJson, copy };
