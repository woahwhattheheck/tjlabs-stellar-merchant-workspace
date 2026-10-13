import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, lstat, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { WorkbenchError, clone, digest, normalizeConfiguration, providerDocument } from './contract.mjs';
import { createConsumerStore } from './consumer.mjs';

export const WORKSPACE_SCHEMA = 'tjlabs.prices-workbench.workspace.v1';
const json = value => JSON.stringify(value, null, 2) + '\n';
const timestamp = () => new Date().toISOString();
const safeId = value => { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{1,100}$/u.test(value)) throw new WorkbenchError('IDENTIFIER_INVALID', 'A saved plan, run, or task identifier is required.'); return value; };

async function atomicWrite(path, bytes) {
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`; const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); await handle.close(); await rename(temporary, path); }
  catch (error) { await handle.close().catch(() => {}); await rm(temporary, { force: true }).catch(() => {}); throw error; }
}
async function keep(path, bytes) {
  let handle;
  try { handle = await open(path, 'wx', 0o600); await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { if (error.code !== 'EEXIST') throw error; if (!(await readFile(path)).equals(Buffer.from(bytes))) throw new WorkbenchError('RETAINED_CONTENT_CHANGED', 'A retained immutable file no longer matches its original bytes.', 409); }
  finally { await handle?.close(); }
}
async function fileBytes(path) { if (!(await lstat(path)).isFile()) throw new WorkbenchError('WORKSPACE_INVALID', 'Workspace content must be a regular file.', 409); return readFile(path); }
async function readJson(path) { try { return JSON.parse(await fileBytes(path)); } catch (error) { if (error instanceof WorkbenchError) throw error; if (error.code === 'ENOENT') throw new WorkbenchError('SAVED_ITEM_MISSING', 'The selected saved item does not exist.', 404); throw new WorkbenchError('WORKSPACE_INVALID', 'A saved workspace record could not be read.', 409); } }

export async function openStore({ directory, create = false, configuration = {} }) {
  if (typeof directory !== 'string' || !directory) throw new WorkbenchError('DIRECTORY_REQUIRED', 'Choose a workspace directory.');
  const root = resolve(directory); if (create) await mkdir(root, { recursive: true, mode: 0o700 });
  const lockPath = join(root, '.owner'); const token = randomBytes(24).toString('hex'); let owner;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { owner = await open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing; try { existing = JSON.parse(await readFile(lockPath, 'utf8')); } catch {}
      if (existing && Number.isSafeInteger(existing.pid) && existing.pid > 0) { try { process.kill(existing.pid, 0); } catch (probe) { if (probe.code === 'ESRCH') { await rm(lockPath, { force: true }); continue; } } }
      throw new WorkbenchError('WORKSPACE_OWNED', 'This workspace is already open in another owning process.', 409);
    }
  }
  if (!owner) throw new WorkbenchError('WORKSPACE_OWNED', 'This workspace could not acquire its local writer.', 409);
  try { await owner.writeFile(json({ pid: process.pid, token, openedAt: timestamp() })); await owner.sync(); }
  catch (error) {
    const held = await owner.stat().catch(() => null); await owner.close().catch(() => {});
    const current = await lstat(lockPath).catch(() => null);
    if (held && current && held.dev === current.dev && held.ino === current.ino) await rm(lockPath, { force: true }).catch(() => {});
    throw error;
  }
  let tail = Promise.resolve(), closed = false;
  const queue = action => { if (closed) return Promise.reject(new WorkbenchError('WORKSPACE_CLOSED', 'This workspace is closed.', 409)); const result = tail.then(action); tail = result.catch(() => {}); return result; };
  const statePath = join(root, 'workspace.json');

  async function read() {
    const current = await readJson(statePath);
    if (current.schema !== WORKSPACE_SCHEMA || !Number.isSafeInteger(current.revision) || current.revision < 1 || !/^[a-f0-9]{64}$/u.test(current.revisionSha256 ?? '')) throw new WorkbenchError('WORKSPACE_INVALID', 'This is not a Prices workbench workspace.', 409);
    const revisionBytes = await fileBytes(join(root, 'revisions', `${String(current.revision).padStart(8, '0')}.json`));
    if (digest(revisionBytes) !== current.revisionSha256) throw new WorkbenchError('RETAINED_CONTENT_CHANGED', 'The saved configuration revision changed.', 409);
    const revision = JSON.parse(revisionBytes); const contractBytes = await fileBytes(join(root, 'contract.json'));
    if (digest(contractBytes) !== current.contractSha256) throw new WorkbenchError('RETAINED_CONTENT_CHANGED', 'The retained provider contract changed.', 409);
    return { id: current.id, revision: current.revision, name: revision.configuration.name, configuration: normalizeConfiguration(revision.configuration), createdAt: current.createdAt, updatedAt: revision.savedAt, contractSha256: current.contractSha256 };
  }
  async function commitConfiguration(previous, value) {
    const normalized = normalizeConfiguration(value); const revision = (previous?.revision ?? 0) + 1; const savedAt = timestamp();
    const record = { revision, savedAt, configuration: normalized }; const bytes = Buffer.from(json(record));
    await keep(join(root, 'revisions', `${String(revision).padStart(8, '0')}.json`), bytes);
    const contract = await providerDocument();
    await atomicWrite(statePath, json({ schema: WORKSPACE_SCHEMA, id: previous?.id ?? `workspace-${randomBytes(12).toString('hex')}`, revision, revisionSha256: digest(bytes), contractSha256: previous?.contractSha256 ?? contract.sha256, createdAt: previous?.createdAt ?? savedAt }));
    return read();
  }
  try {
    if (create) {
      try { await lstat(statePath); throw new WorkbenchError('WORKSPACE_EXISTS', 'This workspace already exists. Open it using the same directory.', 409); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      for (const child of ['revisions', 'plans', 'runs', 'responses']) await mkdir(join(root, child), { recursive: true, mode: 0o700 });
      await keep(join(root, 'contract.json'), await readFile(new URL('./sources/provider.openapi.json', import.meta.url)));
      await commitConfiguration(null, configuration);
    } else await read();
  } catch (error) { await owner.close(); const record = await readFile(lockPath, 'utf8').catch(() => ''); if (record.includes(token)) await rm(lockPath, { force: true }); throw error; }

  const all = async (folder) => {
    const entries = (await readdir(join(root, folder))).filter(name => /^[a-z][a-z0-9-]+\.json$/u.test(name));
    const values = []; for (const entry of entries) values.push(await readJson(join(root, folder, entry)));
    return values.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id));
  };
  const getPlan = async id => { const record = await readJson(join(root, 'plans', safeId(id) + '.json')); const { sha256, ...value } = record; if (sha256 !== digest(json(value))) throw new WorkbenchError('RETAINED_CONTENT_CHANGED', 'The immutable request plan changed.', 409); return record; };
  const getRun = async id => { const record = await readJson(join(root, 'runs', safeId(id) + '.json')); if (record.id !== id || record.schema !== 'tjlabs.prices-workbench.run.v1') throw new WorkbenchError('WORKSPACE_INVALID', 'The saved run identity is invalid.', 409); return record; };
  async function response(reference) {
    if (!reference || !/^[a-f0-9]{64}$/u.test(reference.sha256)) throw new WorkbenchError('RESPONSE_MISSING', 'No retained provider response is available for this task.', 404);
    const bytes = await fileBytes(join(root, 'responses', reference.sha256 + '.body'));
    if (digest(bytes) !== reference.sha256 || bytes.length !== reference.bytes) throw new WorkbenchError('RETAINED_CONTENT_CHANGED', 'The retained provider response changed.', 409);
    return bytes;
  }

  const consumers = createConsumerStore({ root, queue, readWorkspace: read, getRun, getPlan, readResponse: response });

  return {
    root, read, getPlan, getRun, response, consumers,
    save: input => queue(async () => { const current = await read(); if (input.expectedRevision !== current.revision) throw new WorkbenchError('REVISION_CONFLICT', 'The workspace changed. Load the current saved revision before saving.', 409); return commitConfiguration(current, input.configuration); }),
    plans: async () => { const records = await all('plans'); return Promise.all(records.map(record => getPlan(record.id))); },
    runs: () => all('runs'),
    putPlan: value => queue(async () => { const id = `plan-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`; const body = { ...clone(value), schema: 'tjlabs.prices-workbench.plan.v1', id, planId: id }; const record = { ...body, sha256: digest(json(body)) }; await keep(join(root, 'plans', id + '.json'), json(record)); return record; }),
    putRun: run => queue(async () => { safeId(run.id); await atomicWrite(join(root, 'runs', run.id + '.json'), json(run)); return clone(run); }),
    keepResponse: bytes => queue(async () => { const buffer = Buffer.from(bytes); const sha256 = digest(buffer); await keep(join(root, 'responses', sha256 + '.body'), buffer); return { sha256, bytes: buffer.length }; }),
    exportFiles: () => queue(async () => {
      const current = await read(); const files = [];
      await consumers.verifyAll();
      async function visit(directory, prefix = '') {
        for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
          if (entry.name === '.owner' || entry.name.endsWith('.tmp') || (prefix === '' && entry.name === 'rumble.connection.json')) continue;
          if (entry.name.startsWith('.') || entry.isSymbolicLink()) throw new WorkbenchError('WORKSPACE_INVALID', 'The workspace contains an unsupported file entry.', 409);
          const path = prefix + entry.name; const full = join(directory, entry.name);
          if (entry.isDirectory()) await visit(full, path + '/');
          else if (entry.isFile()) { const bytes = await fileBytes(full); files.push({ path, encoding: 'base64', bytes: bytes.length, sha256: digest(bytes), content: bytes.toString('base64') }); }
          else throw new WorkbenchError('WORKSPACE_INVALID', 'The workspace contains an unsupported file entry.', 409);
        }
      }
      for (const run of await all('runs')) for (const task of run.tasks) for (const attempt of task.attempts ?? []) if (attempt.response) await response(attempt.response);
      await visit(root);
      return { workspaceId: current.id, revision: current.revision, files };
    }),
    close: async () => { if (closed) return; await tail; closed = true; await owner.close(); const record = await readFile(lockPath, 'utf8').catch(() => ''); if (record.includes(token)) await rm(lockPath, { force: true }); },
  };
}
