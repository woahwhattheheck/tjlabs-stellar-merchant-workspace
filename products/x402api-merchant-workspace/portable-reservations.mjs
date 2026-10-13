// MIT. Relocate only retained SF31 reservations owned by this merchant's original paid returns.
import { constants } from 'node:fs';
import { open, lstat, realpath, readdir, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, basename, join, resolve, isAbsolute } from 'node:path';

const SCHEMA = 'stellar-forge.x402api-merchant-file-reservation.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PARTIAL = /^\.x402-response-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.partial$/;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (condition, code) => { if (!condition) fail(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalDirectory = value => {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'MERCHANT_RESERVATION_DIRECTORY_INVALID');
  return value;
};
const privateOwner = info => !(info.mode & 0o077) &&
  (process.getuid === undefined || info.uid === process.getuid());
const sameFile = (a, b) => ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeMs', 'ctimeMs']
  .every(key => a[key] === b[key]);
const identity = file => file === null ? null : { bytes: file.bytes, sha256: file.sha256 };

async function privateDirectory(path) {
  canonicalDirectory(path);
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && privateOwner(info) &&
    await realpath(path) === path, 'MERCHANT_RESERVATION_PRIVATE_DIRECTORY_REQUIRED');
}

/**
 * Read a stable private file. Multiple hard links are accepted for reading:
 * SF31 can stop between publishing its final hard link and removing its partial.
 * The handover copier creates independent files in the receiving directory.
 */
async function readRetained(path, { expectedBytes = null, prefix = false, maximum = Number.MAX_SAFE_INTEGER,
  includeBytes = false, optional = false } = {}) {
  let handle;
  try {
    need(await realpath(dirname(path)) === dirname(path), 'MERCHANT_RESERVATION_PARENT_CHANGED');
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await handle.stat();
    need(before.isFile() && before.nlink >= 1 && privateOwner(before) &&
      Number.isSafeInteger(before.size) && before.size <= maximum, 'MERCHANT_RESERVATION_FILE_INVALID');
    if (expectedBytes !== null)
      need(before.size <= expectedBytes.length && (prefix || before.size === expectedBytes.length),
        'MERCHANT_RESERVATION_RETURN_CHANGED');
    const hash = createHash('sha256'), parts = [];
    const block = Buffer.allocUnsafe(Math.min(65536, Math.max(1, before.size)));
    let position = 0;
    while (position < before.size) {
      const part = await handle.read(block, 0, Math.min(block.length, before.size - position), position);
      need(part.bytesRead > 0, 'MERCHANT_RESERVATION_FILE_CHANGED');
      const bytes = block.subarray(0, part.bytesRead);
      if (expectedBytes !== null)
        need(bytes.equals(expectedBytes.subarray(position, position + bytes.length)), 'MERCHANT_RESERVATION_RETURN_CHANGED');
      hash.update(bytes);
      if (includeBytes) parts.push(Buffer.from(bytes));
      position += bytes.length;
    }
    const extra = await handle.read(block, 0, 1, position);
    const after = await handle.stat(), named = await lstat(path);
    need(extra.bytesRead === 0 && sameFile(before, after) && sameFile(before, named) &&
      named.isFile() && !named.isSymbolicLink(), 'MERCHANT_RESERVATION_FILE_CHANGED');
    return { bytes: position, sha256: hash.digest('hex'), ...(includeBytes ? { raw: Buffer.concat(parts) } : {}) };
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw error;
  } finally { if (handle) await handle.close(); }
}

function reservationRecord(raw, { destination, folder, paymentId }) {
  let record;
  try { record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { fail('MERCHANT_RESERVATION_RECORD_INVALID'); }
  need(plain(record) && Object.keys(record).length === 4 &&
    ['destination', 'partialPath', 'pid', 'reservationTag'].every(key => Object.hasOwn(record, key)) &&
    record.destination === destination && record.reservationTag === paymentId &&
    Number.isSafeInteger(record.pid) && record.pid > 0 &&
    typeof record.partialPath === 'string' && dirname(record.partialPath) === folder &&
    record.partialPath === join(folder, basename(record.partialPath)) && PARTIAL.test(basename(record.partialPath)) &&
    raw.equals(Buffer.from(JSON.stringify(record) + '\n')), 'MERCHANT_RESERVATION_RECORD_INVALID');
  return record;
}

async function findLocks(directory, prefix = 'workspace/results/') {
  let entries;
  try { await privateDirectory(directory); entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    need(entry.name && entry.name !== '.' && entry.name !== '..' && !/[\u0000-\u001f\\]/.test(entry.name),
      'MERCHANT_RESERVATION_MEMBER_INVALID');
    if (entry.isDirectory()) result.push(...await findLocks(join(directory, entry.name), prefix + entry.name + '/'));
    else {
      need(entry.isFile() && !entry.isSymbolicLink(), 'MERCHANT_RESERVATION_MEMBER_INVALID');
      if (entry.name.startsWith('.') && entry.name.endsWith('.x402-download.lock')) result.push(prefix + entry.name);
    }
  }
  return result;
}

/**
 * The directory is the current readable workspace; recordedDirectory is the
 * original absolute workspace used by its retained database and lock records.
 * Returns one serializable mapping per recognized lock, without changing files.
 */
export async function inspectMerchantReservations({ database, directory, recordedDirectory = directory }) {
  await privateDirectory(directory); canonicalDirectory(recordedDirectory);
  need(database && typeof database.prepare === 'function', 'MERCHANT_RESERVATION_DATABASE_REQUIRED');
  const reservations = [], recognized = new Set();
  const rows = database.prepare("SELECT payment_id,order_id,state,returned,returned_bytes,returned_sha256,file_name FROM merchant_fulfillments WHERE state IN ('RETURNED','COMPLETE') ORDER BY payment_id").iterate();
  for (const row of rows) {
    need(typeof row.payment_id === 'string' && UUID.test(row.payment_id) && typeof row.order_id === 'string' && UUID.test(row.order_id) &&
      typeof row.file_name === 'string' && FILE_NAME.test(row.file_name) &&
      row.returned instanceof Uint8Array && Number.isSafeInteger(row.returned_bytes) &&
      row.returned_bytes === row.returned.byteLength && HASH.test(row.returned_sha256),
      'MERCHANT_RESERVATION_RETURN_IDENTITY_INVALID');
    const returned = Buffer.from(row.returned);
    need(digest(returned) === row.returned_sha256, 'MERCHANT_RESERVATION_RETURN_CHANGED');
    const folderRelative = 'workspace/results/' + row.payment_id;
    const destinationRelativePath = folderRelative + '/' + row.file_name;
    const relativePath = folderRelative + '/.' + row.file_name + '.x402-download.lock';
    const recordedFolder = join(recordedDirectory, 'results', row.payment_id);
    const destination = join(recordedFolder, row.file_name);
    const currentFolder = join(directory, 'results', row.payment_id);
    const final = await readRetained(join(currentFolder, row.file_name), { expectedBytes: returned, optional: true });
    if (row.state === 'COMPLETE') need(final !== null, 'MERCHANT_RESERVATION_COMPLETED_FILE_MISSING');
    const lock = await readRetained(join(currentFolder, '.' + row.file_name + '.x402-download.lock'),
      { maximum: 8192, includeBytes: true, optional: true });
    if (!lock) continue;
    recognized.add(relativePath);
    let record = null, partial = null, partialRelativePath = null;
    if (lock.bytes !== 0) {
      record = reservationRecord(lock.raw, { destination, folder: recordedFolder, paymentId: row.payment_id });
      partialRelativePath = folderRelative + '/' + basename(record.partialPath);
      partial = await readRetained(join(currentFolder, basename(record.partialPath)),
        { expectedBytes: returned, prefix: true, optional: true });
    }
    reservations.push({ schema: SCHEMA, orderId: row.order_id, paymentId: row.payment_id, state: row.state,
      fileName: row.file_name, recordedDirectory, relativePath, destinationRelativePath, partialRelativePath,
      returned: { bytes: row.returned_bytes, sha256: row.returned_sha256 }, lock: identity(lock),
      empty: lock.bytes === 0, reservation: record, partial: identity(partial), final: identity(final) });
  }
  const observed = await findLocks(join(directory, 'results'));
  need(observed.length === recognized.size && observed.every(path => recognized.has(path)),
    'MERCHANT_RESERVATION_ORIGINAL_OWNER_REQUIRED');
  return reservations;
}

function fileIdentityRecord(record, maximum = Number.MAX_SAFE_INTEGER) {
  need(plain(record) && Number.isSafeInteger(record.bytes) && record.bytes >= 0 && record.bytes <= maximum &&
    typeof record.sha256 === 'string' && HASH.test(record.sha256), 'MERCHANT_RESERVATION_IDENTITY_INVALID');
}
async function verifyOptional(path, expected) {
  if (expected !== null) fileIdentityRecord(expected);
  const observed = await readRetained(path, { maximum: expected?.bytes ?? Number.MAX_SAFE_INTEGER, optional: true });
  need(expected === null ? observed === null :
    observed && observed.bytes === expected.bytes && observed.sha256 === expected.sha256,
    'MERCHANT_RESERVATION_COPIED_FILE_CHANGED');
}
async function syncDirectory(path) {
  const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await directory.sync(); } finally { await directory.close(); }
}
async function replaceCopiedLock(path, bytes, original) {
  const pending = join(dirname(path), '.' + basename(path) + '.relocating-' + randomUUID());
  let handle;
  try {
    handle = await open(pending, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    const current = await readRetained(path, { maximum: 8192 });
    need(current.bytes === original.bytes && current.sha256 === original.sha256, 'MERCHANT_RESERVATION_COPIED_LOCK_CHANGED');
    await rename(pending, path); await syncDirectory(dirname(path));
  } finally {
    if (handle) await handle.close();
    try { await unlink(pending); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

/**
 * Stage is the private archive copy. Directory is its final restoration root;
 * the restored live workspace will be directory/workspace after publication.
 * Original archive bytes and all business rows remain unchanged by this helper.
 */
export async function restoreMerchantReservations({ stage, directory, reservations }) {
  await privateDirectory(stage); canonicalDirectory(directory);
  need(Array.isArray(reservations), 'MERCHANT_RESERVATION_MAPPINGS_REQUIRED');
  const seen = new Set(), relocations = [];
  for (const mapping of reservations) {
    need(plain(mapping) && mapping.schema === SCHEMA && typeof mapping.paymentId === 'string' && UUID.test(mapping.paymentId) &&
      typeof mapping.orderId === 'string' && UUID.test(mapping.orderId) && ['RETURNED', 'COMPLETE'].includes(mapping.state) &&
      typeof mapping.fileName === 'string' && FILE_NAME.test(mapping.fileName),
      'MERCHANT_RESERVATION_MAPPING_INVALID');
    canonicalDirectory(mapping.recordedDirectory);
    const folderRelative = 'workspace/results/' + mapping.paymentId;
    const destinationRelativePath = folderRelative + '/' + mapping.fileName;
    const relativePath = folderRelative + '/.' + mapping.fileName + '.x402-download.lock';
    need(mapping.relativePath === relativePath && mapping.destinationRelativePath === destinationRelativePath &&
      !seen.has(relativePath), 'MERCHANT_RESERVATION_MAPPING_INVALID');
    seen.add(relativePath); fileIdentityRecord(mapping.lock, 8192); fileIdentityRecord(mapping.returned);
    const lockPath = join(stage, relativePath);
    const original = await readRetained(lockPath, { maximum: 8192, includeBytes: true });
    need(original.bytes === mapping.lock.bytes && original.sha256 === mapping.lock.sha256 &&
      mapping.empty === (original.bytes === 0), 'MERCHANT_RESERVATION_COPIED_LOCK_CHANGED');
    const oldFolder = join(mapping.recordedDirectory, 'results', mapping.paymentId);
    const originalDestination = join(oldFolder, mapping.fileName);
    const newDestination = join(directory, destinationRelativePath);
    let oldPartial = null, newPartial = null, rewritten = original.raw;
    if (mapping.empty) {
      need(mapping.reservation === null && mapping.partialRelativePath === null && mapping.partial === null,
        'MERCHANT_RESERVATION_MAPPING_INVALID');
    } else {
      const record = reservationRecord(original.raw, { destination: originalDestination,
        folder: oldFolder, paymentId: mapping.paymentId });
      need(JSON.stringify(record) === JSON.stringify(mapping.reservation),
        'MERCHANT_RESERVATION_MAPPING_INVALID');
      const partialRelativePath = folderRelative + '/' + basename(record.partialPath);
      need(mapping.partialRelativePath === partialRelativePath, 'MERCHANT_RESERVATION_MAPPING_INVALID');
      oldPartial = record.partialPath; newPartial = join(directory, partialRelativePath);
      await verifyOptional(join(stage, partialRelativePath), mapping.partial);
      rewritten = Buffer.from(JSON.stringify({ ...record, destination: newDestination, partialPath: newPartial }) + '\n');
      need(rewritten.length <= 8192, 'MERCHANT_RESTORED_RESERVATION_TOO_LARGE');
    }
    await verifyOptional(join(stage, destinationRelativePath), mapping.final);
    if (mapping.final !== null)
      need(mapping.final.bytes === mapping.returned.bytes && mapping.final.sha256 === mapping.returned.sha256,
        'MERCHANT_RESERVATION_RETURN_CHANGED');
    if (mapping.state === 'COMPLETE') need(mapping.final !== null, 'MERCHANT_RESERVATION_COMPLETED_FILE_MISSING');
    if (mapping.partial !== null)
      need(mapping.partial.bytes <= mapping.returned.bytes, 'MERCHANT_RESERVATION_RETURN_CHANGED');
    const changed = !rewritten.equals(original.raw);
    if (changed) await replaceCopiedLock(lockPath, rewritten, original);
    relocations.push({ orderId: mapping.orderId, paymentId: mapping.paymentId, state: mapping.state,
      relativePath, empty: mapping.empty, changed,
      destination: { from: originalDestination, to: newDestination },
      partialPath: oldPartial === null ? null : { from: oldPartial, to: newPartial },
      originalLock: { bytes: original.bytes, sha256: original.sha256 },
      restoredLock: { bytes: rewritten.length, sha256: digest(rewritten) } });
  }
  const observed = await findLocks(join(stage, 'workspace/results'));
  need(observed.length === seen.size && observed.every(path => seen.has(path)),
    'MERCHANT_RESERVATION_ORIGINAL_OWNER_REQUIRED');
  return relocations;
}

