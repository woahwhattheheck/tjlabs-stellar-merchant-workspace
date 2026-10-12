// MIT. Private source bytes and native JSON values for the CouchDB operator.
import { constants } from 'node:fs';
import { open, lstat, readdir, rename, unlink, mkdir, realpath } from 'node:fs/promises';
import { join, dirname, basename, isAbsolute, resolve, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseExactJSON, originalJSONFragment, decimalCompare } from '../../partners/coingecko-stellar-market/exact-json.mjs';
import { object, bytes, identity, digest, fault, privateDirectory, readPrivate, readJson, syncDirectory, atomicJson, acquireWorkspace, stamp } from '../postgres/publisher/files.mjs';
export { object, bytes, identity, digest, fault, privateDirectory, readPrivate, readJson, syncDirectory, atomicJson, acquireWorkspace, stamp, decimalCompare };
export const HASH = /^[a-f0-9]{64}$/;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const SCHEMA = 'stellar-forge.couchdb-capture.v1';
export const MAX_BODY = 268435456;
export function need(ok, code, message = code, status = 400) { if (!ok) throw fault(code, message, status); }
export function only(value, keys, code) { need(object(value) && Object.keys(value).every(k => keys.includes(k)), code); }
export function integer(value, min, max, code = 'COUCHDB_LIMIT_INVALID') { need(Number.isSafeInteger(value) && value >= min && value <= max, code); return value; }
export function text(value, max = 2000, code = 'COUCHDB_TEXT_REQUIRED') { need(typeof value === 'string' && value.trim().length && value.length <= max && !value.includes('\0'), code); return value; }
export function safeName(value) { need(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(value) && !['constructor','prototype','__proto__'].includes(value), 'COUCHDB_FIELD_NAME_INVALID'); return value; }
export function pointer(base, key) { return base + '/' + String(key).replaceAll('~','~0').replaceAll('/','~1'); }
export function parseOriginal(raw) {
  const original = typeof raw === 'string' ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const parsed = parseExactJSON(original, { maximumNodes: 4000000 });
  need(!parsed.duplicates.length, 'COUCHDB_DUPLICATE_JSON_KEY', 'The original response contains duplicate object keys.');
  return parsed;
}
export function sourceValue(parsed, path = '') {
  const span = parsed.spans[path];
  if (!span) return { present: false };
  let value = parsed.value;
  if (path) for (const part of path.slice(1).split('/')) value = value[part.replaceAll('~1','/').replaceAll('~0','~')];
  return { present: true, kind: span.type, value, text: parsed.source.slice(span.start, span.end) };
}
export function originalBytes(parsed, path = '') {
  need(parsed.spans[path], 'COUCHDB_SOURCE_FIELD_ABSENT');
  return originalJSONFragment(parsed, path);
}
export function originalCounter(parsed, path, max = Number.MAX_SAFE_INTEGER) {
  const result = sourceValue(parsed, path);
  need(result.kind === 'number' && /^(?:0|[1-9][0-9]*)$/.test(result.text), 'COUCHDB_NATIVE_COUNTER_INVALID');
  return integer(Number(result.text), 0, max, 'COUCHDB_NATIVE_COUNTER_INVALID');
}
export function sequence(parsed, path) {
  const v = sourceValue(parsed, path);
  need(v.present && ['number','string','array','object'].includes(v.kind), 'COUCHDB_SEQUENCE_MISSING');
  return { kind: v.kind, json: v.text, query: v.kind === 'string' ? v.value : v.text };
}
export function checkSequence(value) {
  only(value, ['kind','json','query'], 'COUCHDB_SEQUENCE_INVALID');
  const p = parseOriginal(text(value.json, 1048576, 'COUCHDB_SEQUENCE_INVALID')), actual = sequence(p, '');
  need(actual.kind === value.kind && actual.query === value.query, 'COUCHDB_SEQUENCE_INVALID');
  return actual;
}
export function sameSequence(a, b) { return a?.kind === b?.kind && a?.query === b?.query; }
export function sourcePath(value) {
  need(typeof value === 'string' && value.length && value.length <= 1024 && !value.includes('\\') && !value.includes('\0') && !isAbsolute(value), 'COUCHDB_SOURCE_PATH_INVALID');
  const parts = value.split('/');
  need(parts.every(x => x && x !== '.' && x !== '..' && !x.startsWith('.')), 'COUCHDB_SOURCE_PATH_INVALID');
  return parts;
}
export async function containedFile(root, name, maximum = MAX_BODY) {
  const parts = sourcePath(name);
  let parent = root;
  await privateDirectory(parent);
  for (const part of parts.slice(0,-1)) { parent = join(parent, part); await privateDirectory(parent); }
  const path = join(parent, parts.at(-1));
  return { path, raw: await readPrivate(path, maximum) };
}
export async function exists(path) { try { await lstat(path); return true; } catch(e) { if (e.code === 'ENOENT') return false; throw e; } }
async function ordinary(path) {
  const s = await lstat(path);
  need(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && !(s.mode & 0o077) && (process.getuid === undefined || s.uid === process.getuid()), 'COUCHDB_PRIVATE_FILE_REQUIRED');
  return s;
}
/** The caller holds the original capture/workspace lease. Commit is one rename;
 * a killed first write can reuse only the exact expected private source prefix. */
export async function retain(path, supplied) {
  const raw = Buffer.isBuffer(supplied) ? supplied : Buffer.from(supplied);
  if (await exists(path)) { const prior = await readPrivate(path, Math.max(raw.length, 1)); need(prior.equals(raw), 'COUCHDB_RETAINED_BYTES_CHANGED', 'This original operation already owns different bytes.', 409); return { bytes: raw.length, sha256: digest(raw) }; }
  const temporary = join(dirname(path), '.' + basename(path) + '.couchdb-pending');
  if (await exists(temporary)) {
    await ordinary(temporary);
    const partial = await readPrivate(temporary, Math.max(raw.length, 1));
    need(partial.length <= raw.length && raw.subarray(0,partial.length).equals(partial), 'COUCHDB_STAGED_BYTES_CHANGED');
  }
  const h = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { await h.writeFile(raw); await h.sync(); } finally { await h.close(); }
  await rename(temporary, path); await syncDirectory(dirname(path));
  return { bytes: raw.length, sha256: digest(raw) };
}
export async function retainJSON(path, value) { return retain(path, bytes(value)); }
export async function objectFile(root, raw) {
  const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw), sha256 = digest(data), path = 'objects/' + sha256;
  await privateDirectory(join(root,'objects'), true);
  const result = await retain(join(root,path),data);
  return { path, ...result };
}
export async function verifyFile(root, record, maximum = MAX_BODY) {
  need(object(record) && HASH.test(record.sha256 ?? '') && Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes <= maximum, 'COUCHDB_SOURCE_DESCRIPTOR_INVALID');
  const read = await containedFile(root, record.path, Math.max(record.bytes, 1));
  need(read.raw.length === record.bytes && digest(read.raw) === record.sha256, 'COUCHDB_SOURCE_BYTES_CHANGED');
  return read.raw;
}
export async function copyFileRecord(from, to, record) {
  const raw = await verifyFile(from, record, MAX_BODY + 131072);
  const parts = sourcePath(record.path);
  let parent = to;
  for (const part of parts.slice(0,-1)) { parent = join(parent,part); await privateDirectory(parent,true); }
  await retain(join(to,...parts), raw);
  return record;
}
export async function listFiles(root, { exclude = [] } = {}) {
  const result = [];
  async function walk(folder, prefix) {
    await privateDirectory(folder);
    for (const name of (await readdir(folder)).sort()) {
      if (name.startsWith('.') || name.endsWith('.lock') || exclude.includes(prefix + name)) continue;
      const path = join(folder,name), s = await lstat(path);
      need(!s.isSymbolicLink(), 'COUCHDB_SOURCE_SYMLINK');
      if (s.isDirectory()) await walk(path,prefix + name + '/');
      else { await ordinary(path); const raw = await readPrivate(path,MAX_BODY + 131072); result.push({ path: prefix + name, bytes:raw.length,sha256:digest(raw) }); }
    }
  }
  await walk(root,''); return result;
}
export function safeIssue(issue) {
  return { code: typeof issue?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(issue.code) ? issue.code : 'COUCHDB_OPERATION_FAILED',
    message: typeof issue?.code === 'string' && issue.code.startsWith('COUCHDB_') ? String(issue.message).slice(0,2000) : 'The original operation could not complete. Reopen its saved request and source.',
    status: [400,401,403,404,409,413,415,416,422,429,503].includes(issue?.status) ? issue.status : 500 };
}
export function ensureActive(signal) { if (signal?.aborted) throw fault('COUCHDB_OPERATION_CANCELLED','The original operation was interrupted; resume its retained request.',409); }
