// MIT. Complete private receiving, using original native leases and whole-file publication.
import { constants as C } from 'node:fs';
import { lstat, readdir, realpath, open, mkdir, link, unlink, rename } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { operation, publishJSON, requireEmptyOperation, directory, bytes as originalBytes,
  syncDirectory } from '../handover-files.mjs';
import { atomicJson } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { acquireDatasetLease } from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs';
import { absolute, relativeName, inside, identity, digest, bytes, copy, parse, need, failure,
  OPERATION_SCHEMA, MAX_ENTRIES, MAX_FILE, MAX_TOTAL, treeIdentity, entryOrder, stamp } from './model.mjs';

export { directory, syncDirectory, publishJSON };
export async function present(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export function currentOwner() {
  need(process.platform === 'linux' && typeof process.getuid === 'function', 'CAPTURED_RECOVERY_LINUX',
    'Use the original Linux product environment with Node.js and util-linux flock.');
  return { uid: process.getuid(), gid: process.getgid() };
}
export function requireOwner(owner) {
  const current = currentOwner();
  need(current.uid === owner.uid && current.gid === owner.gid, 'CAPTURED_RECOVERY_OWNER',
    'Receive as the original numeric operator UID ' + owner.uid + ' and GID ' + owner.gid + '.');
}
export const inode = stat => ({ device: String(stat.dev), inode: String(stat.ino) });
const sameInode = (a, b) => a?.device === b?.device && a?.inode === b?.inode;
export async function ownedDirectory(path, owner) {
  await directory(path);
  const info = await lstat(path, { bigint: true });
  need(info.uid === BigInt(owner.uid) && info.gid === BigInt(owner.gid), 'CAPTURED_RECOVERY_OWNER',
    'The receiving directory must belong to the original operator.');
  return inode(info);
}
export async function readFile(path, maximum = 64 * 1024 * 1024) {
  absolute(path);
  need(await realpath(path) === path, 'CAPTURED_RECOVERY_PATH');
  const handle = await open(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum), 'CAPTURED_RECOVERY_FILE');
    const content = await handle.readFile(), after = await handle.stat({ bigint: true });
    need(content.length === Number(before.size) && content.length <= maximum &&
      after.size === before.size && after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs &&
      sameInode(inode(before), inode(await lstat(path, { bigint: true }))),
    'CAPTURED_RECOVERY_SOURCE_CHANGED', 'The selected original file changed during its read.');
    return content;
  } finally { await handle.close(); }
}

/** Finish only this selected file's original publishBytes hard link before reopening it. */
export async function withPublishedFile(path, work) {
  absolute(path); const parent = dirname(path), name = path.slice(parent.length + 1);
  relativeName(name);
  return operation(parent, async () => {
    if (await present(path)) {
      const target = await lstat(path, { bigint: true });
      if (target.isFile() && target.nlink === 2n && !(target.mode & 0o077n)) {
        const prefix = name + '.';
        const candidates = (await readdir(parent)).filter(value => value.startsWith(prefix) &&
          /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.partial$/.test(value.slice(prefix.length)));
        for (const candidate of candidates) {
          const temporary = join(parent, candidate), stat = await lstat(temporary, { bigint: true });
          if (stat.isFile() && !stat.isSymbolicLink() && sameInode(inode(stat), inode(target))) {
            await unlink(temporary); await syncDirectory(parent); break;
          }
        }
      }
    }
    return work();
  });
}

export async function hashFile(path, maximum = MAX_FILE) {
  const handle = await open(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.nlink === 1n && before.size <= BigInt(maximum), 'CAPTURED_RECOVERY_FILE');
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length; need(size <= maximum, 'CAPTURED_RECOVERY_SIZE'); hash.update(chunk);
    }
    const after = await handle.stat({ bigint: true });
    need(size === Number(before.size) && after.size === before.size &&
      after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs &&
      sameInode(inode(before), inode(await lstat(path, { bigint: true }))),
    'CAPTURED_RECOVERY_SOURCE_CHANGED', 'The complete selected file changed while it was read.');
    return { size, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}
export async function scanRoot(path, kind, budget = { entries: 0, bytes: 0 }) {
  absolute(path);
  need(await realpath(path) === path, 'CAPTURED_RECOVERY_PATH', 'Use the original root without symlink components.');
  const entries = [];
  async function visit(current, name, depth) {
    need(depth <= 16 && budget.entries < MAX_ENTRIES, 'CAPTURED_RECOVERY_ENTRY_LIMIT');
    const before = await lstat(current, { bigint: true });
    need(!before.isSymbolicLink() && (before.isFile() || before.isDirectory()),
      'CAPTURED_RECOVERY_ENTRY', 'SF101 captures regular files and directories.');
    budget.entries++;
    if (before.isFile()) {
      const file = await hashFile(current);
      budget.bytes += file.size; need(budget.bytes <= MAX_TOTAL, 'CAPTURED_RECOVERY_SIZE');
      entries.push({ relative: name, kind: 'file', ...file });
    } else {
      entries.push({ relative: name, kind: 'directory' });
      for (const child of (await readdir(current)).sort()) {
        relativeName(child);
        await visit(join(current, child), name ? name + '/' + child : child, depth + 1);
      }
      const after = await lstat(current, { bigint: true });
      need(sameInode(inode(before), inode(after)) && before.mtimeNs === after.mtimeNs &&
        before.ctimeNs === after.ctimeNs, 'CAPTURED_RECOVERY_SOURCE_CHANGED');
    }
  }
  await visit(path, '', 0);
  const source = treeIdentity(entries);
  need(kind === undefined || source.kind === kind, 'CAPTURED_RECOVERY_ROOT_CHANGED');
  return { source, entries };
}
export async function verifyRoot(path, entries, additions = []) {
  const wanted = [...entries];
  for (const extra of additions) {
    relativeName(extra.relative);
    need(!wanted.some(entry => entry.relative === extra.relative), 'CAPTURED_RECOVERY_ADDITION_CONFLICT');
    wanted.push(extra);
  }
  wanted.sort(entryOrder);
  const expected = treeIdentity(wanted), actual = await scanRoot(path, expected.kind);
  need(identity(actual.source) === identity(expected), 'CAPTURED_RECOVERY_RESTORED_SOURCE_CHANGED',
    'The complete receiving root differs from its authenticated source and retained recovery additions.');
  return actual.source;
}
function recordValid(record, kind, input) {
  need(record?.schema === OPERATION_SCHEMA && record.kind === kind &&
    record.inputSha256 === identity(input) && identity(record.input) === record.inputSha256,
  'CAPTURED_RECOVERY_OPERATION_CHANGED', 'Continue this original operation with its retained complete request.');
}
export async function readRecord(root) {
  root = await directory(absolute(root));
  const record = parse(await originalBytes(root, 'operation.json', 64 * 1024 * 1024));
  need(record?.schema === OPERATION_SCHEMA && record.inputSha256 === identity(record.input),
    'CAPTURED_RECOVERY_OPERATION_CHANGED');
  const state = await present(join(root, 'state.json'))
    ? parse(await originalBytes(root, 'state.json', 64 * 1024 * 1024)) : null;
  need(state === null || state.inputSha256 === record.inputSha256, 'CAPTURED_RECOVERY_OPERATION_CHANGED');
  return { record, state };
}
/** One immutable request, the original kernel lease, and atomic mutable progress.
 * Initial native whole-file publication is recovered before any receipt is read. */
export async function withRecord(root, kind, input, initialize, work) {
  absolute(root);
  return operation(root, async selected => {
    let record;
    if (await present(join(selected, 'operation.json'))) {
      record = (await readRecord(selected)).record; recordValid(record, kind, input);
    } else {
      await requireEmptyOperation(selected, 'operation.json');
      const retained = await initialize();
      record = { schema: OPERATION_SCHEMA, kind, input: copy(input), inputSha256: identity(input),
        createdAt: stamp(), retained };
      await publishJSON(selected, 'operation.json', record);
    }
    let state = await present(join(selected, 'state.json'))
      ? parse(await originalBytes(selected, 'state.json', 64 * 1024 * 1024))
      : { inputSha256: record.inputSha256, phase: 'PREPARING' };
    need(state.inputSha256 === record.inputSha256, 'CAPTURED_RECOVERY_OPERATION_CHANGED');
    const save = async () => {
      state.updatedAt = stamp();
      await atomicJson(selected, 'state.json', state);
    };
    try { return await work({ root: selected, record, state, save }); }
    catch (error) {
      state.error = { code: error.code ?? 'CAPTURED_RECOVERY_FAILED', message: error.message, at: stamp() };
      try { await save(); } catch (saved) { error.journalError = { code: saved.code, message: saved.message }; }
      throw error;
    }
  }, { create: true });
}
export async function withParentLeases(parents, owner, work) {
  const leases = []; let value, failed;
  try {
    for (const parent of [...parents].sort()) {
      await ownedDirectory(parent, owner);
      leases.push(acquireDatasetLease(parent));
    }
    for (const lease of leases) lease.assertHeld();
    value = await work();
    for (const lease of leases) lease.assertHeld();
  } catch (error) { failed = error; }
  const errors = [];
  for (const lease of leases.reverse()) try { await lease.close(); } catch (error) { errors.push(error); }
  if (failed) { if (errors.length) failed.cleanup = errors.map(error => ({ code: error.code, message: error.message })); throw failed; }
  if (errors.length) throw Object.assign(failure('CAPTURED_RECOVERY_CLOSE_PENDING',
    'Retry the same receiving operation after its original lease close completes.'), { cause: new AggregateError(errors) });
  return value;
}
async function ensureParents(path, parents, owner) {
  const anchor = parents.find(parent => path !== parent && inside(parent, path));
  need(anchor, 'CAPTURED_RECOVERY_TARGET_OUTSIDE_SELECTION');
  await ownedDirectory(anchor, owner);
  let current = anchor;
  for (const piece of relative(anchor, dirname(path)).split('/').filter(Boolean)) {
    current = join(current, piece);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await ownedDirectory(current, owner); await syncDirectory(dirname(current));
  }
}
const temporaryName = (destination, operationId) =>
  join(dirname(destination), '.captured-receive-' + operationId.slice(0, 20) + '-' + digest(destination).slice(0, 24));
async function transferFile(source, destination, entry, operationId, owner) {
  const temporary = temporaryName(destination, operationId);
  const input = await open(source, C.O_RDONLY | C.O_NOFOLLOW);
  let output, failed;
  try {
    const before = await input.stat({ bigint: true });
    need(before.isFile() && before.nlink === 1n && before.size === BigInt(entry.size),
      'CAPTURED_RECOVERY_RESTORED_SOURCE_CHANGED');
    if (await present(destination)) {
      const target = await lstat(destination, { bigint: true });
      if (await present(temporary)) {
        const pending = await lstat(temporary, { bigint: true });
        need(target.isFile() && pending.isFile() && sameInode(inode(target), inode(pending)) &&
          target.nlink === 2n && !(target.mode & 0o077n) &&
          target.uid === BigInt(owner.uid) && target.gid === BigInt(owner.gid),
        'CAPTURED_RECOVERY_FILE_CONFLICT');
        const check = await open(temporary, C.O_RDONLY | C.O_NOFOLLOW);
        try {
          const h = createHash('sha256'); let size = 0;
          for await (const chunk of check.createReadStream({ autoClose: false })) { h.update(chunk); size += chunk.length; }
          need(size === entry.size && h.digest('hex') === entry.sha256 &&
            sameInode(inode(await check.stat({ bigint: true })), inode(await lstat(temporary, { bigint: true }))),
          'CAPTURED_RECOVERY_FILE_CONFLICT');
        } finally { await check.close(); }
        await unlink(temporary); await syncDirectory(dirname(temporary));
      }
      const found = await hashFile(destination), now = await lstat(destination);
      need(found.size === entry.size && found.sha256 === entry.sha256 && !(now.mode & 0o077) &&
        now.uid === owner.uid && now.gid === owner.gid, 'CAPTURED_RECOVERY_FILE_CONFLICT',
      'Preserve the existing receiving file; it differs from this original snapshot.');
      await syncDirectory(dirname(destination));
    } else {
      output = await open(temporary, C.O_RDWR | C.O_CREAT | C.O_NOFOLLOW, 0o600);
      const retained = await output.stat({ bigint: true });
      need(retained.isFile() && retained.nlink === 1n && retained.size <= BigInt(entry.size) &&
        !(retained.mode & 0o077n) && retained.uid === BigInt(owner.uid) && retained.gid === BigInt(owner.gid),
      'CAPTURED_RECOVERY_TRANSFER_CHANGED');
      const prefix = Number(retained.size), buffer = Buffer.alloc(128 * 1024), compare = Buffer.alloc(128 * 1024);
      const hash = createHash('sha256'); let offset = 0;
      while (offset < entry.size) {
        const part = await input.read(buffer, 0, Math.min(buffer.length, entry.size - offset), offset);
        need(part.bytesRead > 0, 'CAPTURED_RECOVERY_RESTORED_SOURCE_CHANGED');
        const chunk = buffer.subarray(0, part.bytesRead); hash.update(chunk);
        const shared = Math.max(0, Math.min(part.bytesRead, prefix - offset));
        let compared = 0;
        while (compared < shared) {
          const read = await output.read(compare, compared, shared - compared, offset + compared);
          need(read.bytesRead > 0, 'CAPTURED_RECOVERY_TRANSFER_CHANGED'); compared += read.bytesRead;
        }
        need(chunk.subarray(0, shared).equals(compare.subarray(0, shared)), 'CAPTURED_RECOVERY_TRANSFER_CHANGED',
          'The retained private partial file differs from the original source prefix.');
        let written = shared;
        while (written < part.bytesRead) {
          const next = await output.write(chunk, written, part.bytesRead - written, offset + written);
          need(next.bytesWritten > 0, 'CAPTURED_RECOVERY_TRANSFER_FAILED'); written += next.bytesWritten;
        }
        offset += part.bytesRead;
      }
      const after = await input.stat({ bigint: true });
      need(hash.digest('hex') === entry.sha256 && after.size === before.size &&
        after.mtimeNs === before.mtimeNs && after.ctimeNs === before.ctimeNs &&
        sameInode(inode(before), inode(await lstat(source, { bigint: true }))),
      'CAPTURED_RECOVERY_RESTORED_SOURCE_CHANGED');
      await output.sync();
      const complete = await output.stat({ bigint: true });
      need(complete.nlink === 1n && complete.size === BigInt(entry.size) &&
        sameInode(inode(complete), inode(await lstat(temporary, { bigint: true }))),
      'CAPTURED_RECOVERY_TRANSFER_CHANGED');
      await link(temporary, destination); await syncDirectory(dirname(destination));
      need(sameInode(inode(complete), inode(await lstat(destination, { bigint: true }))) &&
        sameInode(inode(complete), inode(await lstat(temporary, { bigint: true }))),
      'CAPTURED_RECOVERY_TARGET_REPLACED');
      await unlink(temporary); await syncDirectory(dirname(temporary));
    }
  } catch (error) { failed = error; }
  const closes = await Promise.allSettled([output?.close(), input.close()]);
  const errors = closes.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failed) { if (errors.length) failed.cleanup = errors.map(error => ({ code: error.code, message: error.message })); throw failed; }
  if (errors.length) throw Object.assign(failure('CAPTURED_RECOVERY_CLOSE_PENDING',
    'The original transfer handles did not finish closing; repeat this retained receiving operation.'), { cause: new AggregateError(errors) });
}
/** Create-only placement with a retained per-root owner and resumable complete-file prefixes. */
export async function placeRoot({ root, entries, operationId, owner, parents, progress, save }) {
  await ensureParents(root.destination, parents, owner);
  if (root.kind === 'directory') {
    if (!progress.owner) {
      try { await mkdir(root.destination, { mode: 0o700 }); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await ownedDirectory(root.destination, owner);
        need((await readdir(root.destination)).length === 0, 'CAPTURED_RECOVERY_ROOT_OWNER',
          'This populated root has no retained receiving owner. Keep it with its original operation.');
      }
      await syncDirectory(dirname(root.destination));
      progress.owner = await ownedDirectory(root.destination, owner); progress.phase = 'COPYING'; await save();
    }
    need(sameInode(await ownedDirectory(root.destination, owner), progress.owner), 'CAPTURED_RECOVERY_TARGET_REPLACED');
  }
  const names = new Set(entries.map(entry => join(root.destination, entry.relative)));
  for (const entry of entries) {
    const destination = join(root.destination, entry.relative);
    need(!names.has(temporaryName(destination, operationId)), 'CAPTURED_RECOVERY_TRANSFER_NAME_COLLISION');
    if (entry.kind === 'directory') {
      if (entry.relative) {
        try { await mkdir(destination, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        await syncDirectory(dirname(destination));
      }
      await ownedDirectory(destination, owner);
    } else await transferFile(join(root.restored, entry.relative), destination, entry, operationId, owner);
  }
  if (root.kind === 'directory')
    need(sameInode(await ownedDirectory(root.destination, owner), progress.owner), 'CAPTURED_RECOVERY_TARGET_REPLACED');
  await verifyRoot(root.destination, entries);
  progress.phase = 'PLACED'; progress.placedAt ??= stamp(); await save();
}
/** Preserve only this operation's interrupted original native restore before restarting it. */
export async function retireRestore({ root, path, state, save }) {
  const expected = join(root, 'restored');
  need(path === expected && state.restoreIntent === true, 'CAPTURED_RECOVERY_RESTORE_OWNER');
  if (!state.pendingRetirement) {
    const source = await lstat(path, { bigint: true });
    need(source.isDirectory() && !source.isSymbolicLink() && !(source.mode & 0o077n),
      'CAPTURED_RECOVERY_RESTORE_OWNER');
    state.retirementCount = (state.retirementCount ?? 0) + 1;
    state.pendingRetirement = { from: path, to: join(root, 'retained-restore-' + state.retirementCount),
      identity: inode(source) };
    await save();
  }
  const pending = state.pendingRetirement;
  need(pending.from === expected && pending.to === join(root, 'retained-restore-' + state.retirementCount),
    'CAPTURED_RECOVERY_RESTORE_OWNER');
  const from = await present(pending.from), to = await present(pending.to);
  need(from !== to, 'CAPTURED_RECOVERY_RESTORE_OWNER', 'Retain the original pending restore relocation.');
  if (from) {
    need(sameInode(inode(await lstat(pending.from, { bigint: true })), pending.identity), 'CAPTURED_RECOVERY_RESTORE_OWNER');
    await rename(pending.from, pending.to);
  } else need(sameInode(inode(await lstat(pending.to, { bigint: true })), pending.identity), 'CAPTURED_RECOVERY_RESTORE_OWNER');
  await syncDirectory(root);
  state.retainedRestores ??= [];
  if (!state.retainedRestores.some(row => row.path === pending.to))
    state.retainedRestores.push({ path: pending.to, retainedAt: stamp() });
  delete state.pendingRetirement; await save();
}
