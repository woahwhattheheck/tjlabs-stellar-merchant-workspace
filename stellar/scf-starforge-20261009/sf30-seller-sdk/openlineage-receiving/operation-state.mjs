/** Durable state for one original receiving programme; no business mutations. */
import { promises as fs } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = async path => JSON.parse(await fs.readFile(path, 'utf8'));
export async function exists(path) {
  try { await fs.lstat(path); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
export async function atomic(path, bytes) {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(12).toString('hex')}.tmp`);
  let file;
  try {
    file = await fs.open(temp, 'wx', 0o600);
    await file.writeFile(bytes); await file.sync(); await file.close(); file = null;
    await fs.rename(temp, path);
    const dir = await fs.open(dirname(path), 'r');
    try { await dir.sync(); } finally { await dir.close(); }
  } finally { if (file) await file.close(); await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
export const atomicJson = (path, value) => atomic(path, JSON.stringify(value, null, 2) + '\n');

/** Creation and publication are separate: a killed creator cannot leave an empty token. */
export async function stableToken(path) {
  if (!await exists(path)) {
    const temp = `${path}.${randomBytes(12).toString('hex')}.new`;
    try {
      const f = await fs.open(temp, 'wx', 0o600);
      try { await f.writeFile(randomBytes(32).toString('hex')); await f.sync(); }
      finally { await f.close(); }
      try { await fs.link(temp, path); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
      const d = await fs.open(dirname(path), 'r');
      try { await d.sync(); } finally { await d.close(); }
    } finally { await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
  const st = await fs.lstat(path);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077)) throw new Error(`Private regular token file required: ${basename(path)}`);
  const value = await fs.readFile(path, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid retained token: ${basename(path)}`);
  return value;
}

export class OperationState {
  constructor(root, state) { this.root = root; this.state = state; this.path = join(root, 'continuation.json'); }
  static async open(root, identity) {
    root = resolve(root); await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const path = join(root, 'continuation.json');
    let state;
    if (await exists(path)) {
      state = await readJson(path);
      if (state.schema !== 'commons.openlineage.receiving-continuation.v1' ||
          JSON.stringify(state.identity) !== JSON.stringify(identity))
        throw new Error('The retained operation selects different source or original inputs. Keep its original selection.');
    } else {
      const entries = (await fs.readdir(root)).filter(name => !/^\.continuation\.json\.[a-f0-9]{24}\.tmp$/.test(name));
      if (entries.length) throw new Error('This directory already contains an operation without its continuation record. Recover that original operation first.');
      state = { schema: 'commons.openlineage.receiving-continuation.v1', identity,
        createdAt: new Date().toISOString(), values: {}, phases: {}, commands: [] };
      await atomicJson(path, state);
    }
    return new OperationState(root, state);
  }
  async save() { this.state.savedAt = new Date().toISOString(); await atomicJson(this.path, this.state); }
  async value(name, factory) {
    if (Object.hasOwn(this.state.values, name)) return this.state.values[name];
    const value = await factory(); this.state.values[name] = value; await this.save(); return value;
  }
  async phase(name, execute) {
    let row = this.state.phases[name];
    if (row?.state === 'complete') return row.value;
    row ??= { attempts: [], preparedAt: new Date().toISOString() };
    row.state = 'running'; row.attempts.push({ startedAt: new Date().toISOString() });
    this.state.phases[name] = row; await this.save();
    try {
      const value = await execute(row);
      row.value = value ?? null; row.state = 'complete'; row.completedAt = new Date().toISOString();
      await this.save(); return row.value;
    } catch (e) {
      row.state = 'interrupted'; row.attempts.at(-1).endedAt = new Date().toISOString();
      // Error details stay in private logs. The public journal retains only the failure class.
      row.attempts.at(-1).error = e.code || e.name || 'Error';
      await this.save(); throw e;
    }
  }
  async command(label, executable, args, { cwd, env = process.env, expected = 0 } = {}) {
    if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid command label');
    const logDirectory = join(this.root, 'logs');
    await fs.mkdir(logDirectory, { recursive: true, mode: 0o700 });
    const retainedAttempts = (await fs.readdir(logDirectory))
      .map(name => new RegExp(`^${label}-([0-9]+)\\.(?:stdout|stderr)$`).exec(name))
      .filter(Boolean).map(match => Number(match[1]));
    const attempt = Math.max(0, ...retainedAttempts,
      ...this.state.commands.filter(x => x.label === label).map(x => x.attempt)) + 1;
    const stem = `${label}-${String(attempt).padStart(4, '0')}`;
    const output = join(this.root, 'logs', stem + '.stdout');
    const errors = join(this.root, 'logs', stem + '.stderr');
    await fs.mkdir(dirname(output), { recursive: true, mode: 0o700 });
    const out = await fs.open(output, 'wx', 0o600), err = await fs.open(errors, 'wx', 0o600);
    const row = { label, attempt, output, errors, startedAt: new Date().toISOString(), state: 'starting' };
    this.state.commands.push(row); await this.save();
    let child;
    try {
      const status = await new Promise((accept, reject) => {
        const stdio = ['ignore', out.fd, err.fd];
        const selectedEnv = { ...env };
        if (process.env.OPENLINEAGE_RECEIVING_LOCK_FD) {
          const leaseFd = Number(process.env.OPENLINEAGE_RECEIVING_LOCK_FD);
          if (!Number.isSafeInteger(leaseFd) || leaseFd < 3) throw new Error('Invalid inherited lease descriptor');
          stdio.push(leaseFd);
          selectedEnv.OPENLINEAGE_RECEIVING_LOCK_FD = '3';
        }
        child = spawn(executable, args, { cwd, env: selectedEnv, shell: false, stdio });
        row.pid = child.pid;
        child.once('error', reject);
        child.once('close', (code, signal) => accept({ code, signal }));
      });
      Object.assign(row, status, { state: 'exited', endedAt: new Date().toISOString() });
      await out.sync(); await err.sync(); await this.save();
      if (status.code !== expected) {
        const e = new Error(`Original command ${label} exited ${status.code}; private logs: ${stem}`);
        e.code = 'ORIGINAL_COMMAND_FAILED'; throw e;
      }
      const text = await fs.readFile(output, 'utf8');
      let value = null; try { value = JSON.parse(text); } catch {}
      return { ...status, value, output, errors };
    } finally { await out.close(); await err.close(); }
  }
}
