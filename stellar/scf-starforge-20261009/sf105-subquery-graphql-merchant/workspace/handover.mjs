// MIT. Complete selected-project handover through the original revisioned store.
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath, link, rm, rename, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, relative, resolve, isAbsolute, sep } from 'node:path';
import { digest, projectName, validateVersion, plain } from './store.mjs';
import { readExport, verifyExport, verifyFiles } from './merchant.mjs';
import { readDeployment } from './deployment.mjs';
import { readPreview } from './authoring.mjs';
import { WORKSPACE_PATHS_SCHEMA, pathContext, readProjectPaths, referenceDirectory, usedPathRoots, workspaceOrigin } from './paths.mjs';

export const PROJECT_HANDOVER_SCHEMA = 'stellar-forge.graphql-project-handover.v1';
export const PROJECT_HANDOVER_FILE = 'project-handover.json';
const JOB = 'stellar-forge.graphql-project-receiving.v1';
const PREPARED = 'stellar-forge.graphql-project-handover-prepared.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const MAX_FILE = 8 * 1024 * 1024, MAX_FILES = 510, MAX_BYTES = 255_000_000;
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const canonicalRoot = value => typeof value === 'string' && value.length < 4096 && isAbsolute(value)
  && value !== sep && resolve(value) === value && !/[\u0000-\u001f\u007f]/.test(value);
function name(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\u0000-\u001f\u007f]/.test(value)
      || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..'))
    fail('Handover paths must be canonical relative file names.');
  return value;
}
function logical(root, path) {
  const result = relative(root, path);
  if (!result || isAbsolute(result) || result === '..' || result.startsWith('..' + sep))
    fail('A selected artifact is outside the original workspace.');
  return name(result.split(sep).join('/'));
}
async function directory(path, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.mode & 0o077 || await realpath(path) !== resolve(path))
    fail('Use a canonical private regular directory with mode 0700.');
  return resolve(path);
}
async function bytesAt(root, filename, expected) {
  name(filename);
  const path = join(root, filename), actual = await realpath(path);
  if (actual !== resolve(root, filename) || logical(root, actual) !== filename)
    fail('A retained handover file left its original directory.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_FILE || stat.mode & 0o077)
      fail('Handover files must be bounded private regular files.');
    const bytes = await file.readFile();
    if (bytes.length !== stat.size || bytes.length > MAX_FILE
        || expected && (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256))
      fail('A handover file changed from its selected identity.', 409);
    return bytes;
  } finally { await file.close(); }
}
async function sync(path) {
  const file = await open(path, 'r');
  try { await file.sync(); } finally { await file.close(); }
}
async function parents(root, filename) {
  let current = root;
  for (const part of name(filename).split('/').slice(0, -1)) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await directory(current);
  }
  return current;
}
async function put(root, filename, bytes, replace = false) {
  const parent = await parents(root, filename), path = join(root, filename);
  const temporary = join(parent, '.' + randomUUID() + '.next');
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    if (replace) await rename(temporary, path);
    else {
      try { await link(temporary, path); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await bytesAt(root, filename, { bytes: bytes.length, sha256: digest(bytes) });
      }
    }
    await sync(parent);
  } finally { await rm(temporary, { force: true }); }
}
function entry(filename, bytes) { return { name: filename, bytes: bytes.length, sha256: digest(bytes) }; }
function originalPath(index, path) {
  if (!canonicalRoot(path)) fail('A retained reference has a noncanonical path.');
  const root = workspaceOrigin(index.roots, path);
  if (root) {
    const rel = relative(root, path);
    if (rel) return name(rel.split(sep).join('/'));
  }
  fail('A retained reference is outside this handover lineage.');
}
function allowedFile(filename, project, revision) {
  name(filename);
  const parts = filename.split('/');
  if (parts[0] === 'projects') return parts.length === 3 && parts[1] === project
    && (parts[2] === 'head.json' || /^[1-9]\d*\.json$/.test(parts[2]) && Number(parts[2].slice(0, -5)) <= revision);
  if (parts[0] === 'packages' || parts[0] === 'deployments')
    return parts.length >= 3 && parts[1].startsWith(project + '-');
  return parts[0] === 'previews' && parts.length === 2 && UUID.test(parts[1].slice(0, -5)) && parts[1].endsWith('.json');
}
function indexOf(bytes, expectedSha256) {
  if (!SHA.test(expectedSha256 ?? '') || digest(bytes) !== expectedSha256 || bytes.length > 65000)
    fail('Select the exact inspected project handover hash.', 409);
  const value = decode(bytes);
  if (!plain(value) || value.schema !== PROJECT_HANDOVER_SCHEMA || !plain(value.project)
      || !Number.isSafeInteger(value.project.revision) || value.project.revision < 1
      || !SHA.test(value.project.inputDigest ?? '') || !Array.isArray(value.roots)
      || !value.roots.length || value.roots.length > 64 || value.roots.some(root => !canonicalRoot(root))
      || !Array.isArray(value.files) || !value.files.length || value.files.length > MAX_FILES)
    fail('The project handover index is inconsistent.');
  projectName(value.project.id);
  const names = new Set(); let total = 0;
  for (const item of value.files) {
    if (!plain(item) || !allowedFile(item.name, value.project.id, value.project.revision) || names.has(item.name)
        || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || item.bytes > MAX_FILE || !SHA.test(item.sha256 ?? ''))
      fail('The project handover contains an invalid or duplicate file identity.');
    names.add(item.name); total += item.bytes;
  }
  for (const filename of names) {
    const parts = filename.split('/');
    for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/')))
      fail('A handover file conflicts with another file directory.');
  }
  if (total > MAX_BYTES) fail('This project exceeds the original retained transfer capacity.');
  return value;
}

/** Select every committed revision and only its referenced immutable artifacts. */
export async function describeProjectHandover(store, { project, revision } = {}) {
  projectName(project);
  if (!Number.isSafeInteger(revision) || revision < 1) fail('Select a committed project revision.');
  const selected = await store.read(project, revision), context = pathContext(selected) ?? await readProjectPaths(store.root, project);
  const selectedName = 'projects/' + project + '/' + revision + '.json';
  const selectedSha256 = digest(await bytesAt(store.root, selectedName));
  const cache = await directory(join(store.root, 'handover-indexes'), true);
  const cacheName = digest(json({ project, revision, selectedSha256, root: store.root })) + '.json';
  try {
    const bytes = await bytesAt(cache, cacheName), sha256 = digest(bytes), index = indexOf(bytes, sha256);
    if (index.project.id !== project || index.project.revision !== revision || index.project.inputDigest !== selected.inputDigest
        || index.files.find(file => file.name === selectedName)?.sha256 !== selectedSha256 || !index.roots.includes(store.root))
      fail('The retained selected-project index no longer matches its original revision.', 409);
    const headName = 'projects/' + project + '/head.json';
    const head = json({ id: project, revision, inputDigest: selected.inputDigest });
    const loaders = new Map(index.files.map(file => [file.name, { file, load: async () => {
      if (file.name !== headName) return bytesAt(store.root, file.name, file);
      if (head.length !== file.bytes || digest(head) !== file.sha256) fail('The selected handover head changed.');
      return head;
    } }]));
    return { index, bytes, sha256, loaders };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const loaders = new Map(), roots = new Set([store.root]);
  const add = async (path, expected) => {
    const filename = logical(store.root, path), bytes = await bytesAt(store.root, filename, expected), info = entry(filename, bytes);
    const old = loaders.get(filename);
    if (old && (old.file.sha256 !== info.sha256 || old.file.bytes !== info.bytes)) fail('Selected history has divergent artifact identities.');
    loaders.set(filename, { file: info, load: () => bytesAt(store.root, filename, info) });
  };
  const addGroup = async (root, files) => { for (const file of files) await add(join(root, name(file.name)), file); };
  const exports = new Set(), deployments = new Set(), previews = new Set();
  for (let number = 1; number <= revision; number++) {
    const saved = await store.read(project, number);
    usedPathRoots(saved, context, roots);
    await add(join(store.root, 'projects', project, number + '.json'));
    for (const reference of saved.exports) {
      const key = reference.id + ':' + reference.recordSha256;
      if (exports.has(key)) continue;
      const record = await readExport(reference); await verifyExport(record);
      const path = join(dirname(referenceDirectory(reference)), 'workspace-export.json');
      const raw = decode(await bytesAt(store.root, logical(store.root, path)));
      usedPathRoots(raw, context, roots);
      await add(path, { bytes: (await bytesAt(store.root, logical(store.root, path))).length, sha256: reference.recordSha256 });
      await addGroup(record.directory, record.files);
      if (record.evolution) await addGroup(record.evolution.directory, record.evolution.files);
      exports.add(key);
    }
    for (const reference of saved.deployments ?? []) {
      const key = reference.id + ':' + reference.generation;
      if (deployments.has(key)) continue;
      const record = await readDeployment(reference);
      const path = join(dirname(referenceDirectory(reference)), 'workspace-deployment-' + reference.generation + '.json');
      const raw = await bytesAt(store.root, logical(store.root, path));
      usedPathRoots(decode(raw), context, roots);
      await add(path, { bytes: raw.length, sha256: reference.recordSha256 });
      await verifyFiles(record.directory, record.files); await addGroup(record.directory, record.files);
      for (const host of record.hosts) { await verifyFiles(host.directory, host.files); await addGroup(host.directory, host.files); }
      deployments.add(key);
    }
    for (const reference of saved.previews ?? []) {
      if (previews.has(reference.id)) continue;
      await readPreview(store, reference);
      const path = join(store.previews, reference.id + '.json'), raw = await bytesAt(store.root, logical(store.root, path));
      await add(path, { bytes: raw.length, sha256: reference.recordSha256 });
      previews.add(reference.id);
    }
  }
  const head = json({ id: project, revision, inputDigest: selected.inputDigest }), headName = 'projects/' + project + '/head.json';
  loaders.set(headName, { file: entry(headName, head), load: async () => head });
  const index = { schema: PROJECT_HANDOVER_SCHEMA,
    project: { id: project, revision, inputDigest: selected.inputDigest, title: selected.input.title, updatedAt: selected.updatedAt },
    roots: [...roots].sort(), files: [...loaders.values()].map(item => item.file).sort((a, b) => a.name.localeCompare(b.name)),
    counts: { revisions: revision, merchantRecords: exports.size, deploymentGenerations: deployments.size, completedPreviews: previews.size },
    deploymentBinding: 'Retained packets preserve their original installed adapter and host. Prepare a new local packet through the original deployment compiler.' };
  const bytes = json(index), sha256 = digest(bytes);
  indexOf(bytes, sha256);
  // One create-only index pins the complete selection. Each later file read
  // checks that file's exact bytes instead of hashing the whole project again.
  await put(cache, cacheName, bytes);
  return { index, bytes, sha256, loaders };
}
function view(index, sha256) {
  return { schema: PROJECT_HANDOVER_SCHEMA, project: index.project, handoverSha256: sha256,
    counts: index.counts, files: index.files.length, bytes: index.files.reduce((sum, file) => sum + file.bytes, 0),
    deploymentBinding: index.deploymentBinding };
}

/** Validate original record closure, beyond the outer file transfer manifest. */
async function verifyClosure(index, load) {
  const required = new Map(), files = new Map(index.files.map(file => [file.name, file]));
  const requireFile = (filename, expected) => {
    const item = files.get(name(filename));
    if (!item || expected && (item.sha256 !== expected.sha256 || expected.bytes !== undefined && item.bytes !== expected.bytes))
      fail('The handover omits or changes an artifact referenced by the saved project.');
    required.set(filename, item); return item;
  };
  const recordJson = async (filename, expectedSha256) => {
    const info = requireFile(filename, { sha256: expectedSha256 });
    return decode(await load(info));
  };
  const group = (root, entries) => {
    if (!Array.isArray(entries)) fail('A retained artifact has no original file manifest.');
    for (const item of entries) requireFile(originalPath(index, join(root, name(item.name))), item);
  };
  const exported = new Map(), deployed = new Map(), previewed = new Set();
  let last;
  for (let number = 1; number <= index.project.revision; number++) {
    const file = requireFile('projects/' + index.project.id + '/' + number + '.json');
    const saved = validateVersion(decode(await load(file)), index.project.id);
    if (saved.revision !== number) fail('The handover revision order changed.');
    last = saved;
    for (const reference of saved.exports) {
      const key = reference.id + ':' + reference.recordSha256;
      if (exported.has(key)) continue;
      const record = await recordJson(originalPath(index, join(dirname(reference.directory), 'workspace-export.json')), reference.recordSha256);
      if (record.id !== reference.id || record.directory !== reference.directory || record.inputDigest !== reference.inputDigest)
        fail('A merchant record does not match its original project reference.');
      group(record.directory, record.files);
      if (record.evolution) group(record.evolution.directory, record.evolution.files);
      exported.set(key, record);
    }
    for (const reference of saved.deployments ?? []) {
      const key = reference.id + ':' + reference.generation;
      if (deployed.has(key)) continue;
      const record = await recordJson(originalPath(index, join(dirname(reference.directory),
        'workspace-deployment-' + reference.generation + '.json')), reference.recordSha256);
      if (record.schema !== 'stellar-forge.graphql-workspace-deployment.v1' || record.id !== reference.id
          || record.exportId !== reference.exportId || record.directory !== reference.directory
          || record.generation !== reference.generation || !Array.isArray(record.hosts))
        fail('A deployment record does not match its original project reference.');
      group(record.directory, record.files);
      for (const host of record.hosts) group(host.directory, host.files);
      deployed.set(key, record);
    }
    for (const reference of saved.previews ?? []) {
      if (previewed.has(reference.id)) continue;
      if (!UUID.test(reference.id ?? '') || reference.project !== index.project.id) fail('A preview belongs to another project.');
      const record = await recordJson('previews/' + reference.id + '.json', reference.recordSha256);
      if (record.schema !== 'stellar-forge.graphql-workspace-preview.v1' || record.id !== reference.id
          || record.project !== index.project.id || record.state !== 'COMPLETED' || record.inputDigest !== reference.inputDigest
          || typeof record.responseBase64 !== 'string' || record.responseBase64.length > 3 * 1024 * 1024)
        fail('A completed preview does not match its retained reference.');
      const response = Buffer.from(record.responseBase64, 'base64');
      if (response.length !== record.responseBytes || digest(response) !== record.responseSha256
          || digest(Buffer.from(JSON.stringify(record.request))) !== record.requestSha256)
        fail('The retained preview request or response identity changed.');
      previewed.add(reference.id);
    }
  }
  const head = decode(await load(requireFile('projects/' + index.project.id + '/head.json')));
  if (head.id !== index.project.id || head.revision !== index.project.revision || head.inputDigest !== last.inputDigest
      || last.inputDigest !== index.project.inputDigest || last.input.title !== index.project.title
      || last.updatedAt !== index.project.updatedAt)
    fail('The handover head does not match its selected original revision.');
  if (required.size !== files.size) fail('The handover includes files outside the selected committed project closure.');
  const counts = { revisions: index.project.revision, merchantRecords: exported.size,
    deploymentGenerations: deployed.size, completedPreviews: previewed.size };
  if (!plain(index.counts) || Object.entries(counts).some(([key, count]) => index.counts[key] !== count))
    fail('The handover totals do not match its original committed history.');
  return last;
}
async function inspect(directoryPath, expectedSha256) {
  const root = await directory(resolve(directoryPath)), bytes = await bytesAt(root, PROJECT_HANDOVER_FILE);
  const index = indexOf(bytes, expectedSha256 ?? digest(bytes));
  const load = file => bytesAt(root, file.name, file);
  for (const file of index.files) await load(file);
  await verifyClosure(index, load);
  return { root, index, bytes, sha256: digest(bytes), load };
}
async function currentRevision(store, id) {
  try { return (await store.read(id)).revision; }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}
async function compatibleHistory(store, index, load) {
  const current = await currentRevision(store, index.project.id);
  for (let number = 1; number <= Math.min(current, index.project.revision); number++) {
    const file = index.files.find(item => item.name === 'projects/' + index.project.id + '/' + number + '.json');
    await bytesAt(store.root, file.name, file);
  }
  return current;
}
export async function inspectProjectHandover(store, { directory: source, handoverSha256 } = {}) {
  if (typeof source !== 'string' || !source) fail('Choose the downloaded original handover directory.');
  const value = await inspect(source, handoverSha256);
  const current = await compatibleHistory(store, value.index, value.load);
  return { ...view(value.index, value.sha256), directory: value.root, expectedRevision: current,
    resultRevision: Math.max(current, value.index.project.revision),
    action: current >= value.index.project.revision ? 'REUSE_ORIGINAL_HISTORY' : current ? 'CONTINUE_ORIGINAL_HISTORY' : 'REOPEN_ORIGINAL_PROJECT' };
}

/** Retain a local portable folder through the same native writer. */
export async function prepareProjectHandover(store, { id, project, revision } = {}) {
  if (!UUID.test(id ?? '')) fail('Use a caller-chosen handover UUID.');
  return store.exclusive(async () => {
    const value = await describeProjectHandover(store, { project, revision });
    const root = await directory(join(store.root, 'handovers'), true), target = await directory(join(root, id), true);
    const intent = { schema: PREPARED, id, project, revision, handoverSha256: value.sha256 };
    await put(target, 'intent.json', json(intent));
    for (const item of value.loaders.values()) await put(target, item.file.name, await item.load());
    await put(target, PROJECT_HANDOVER_FILE, value.bytes);
    const result = { ...view(value.index, value.sha256), id, directory: target, state: 'PREPARED' };
    await put(target, 'prepared.json', json(result));
    return result;
  });
}

/** Exact receiving UUID replay preserves any later local authoring revisions. */
export async function receiveProjectHandover(store, { id, directory: source, handoverSha256, expectedRevision } = {}) {
  if (!UUID.test(id ?? '') || !SHA.test(handoverSha256 ?? '') || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    fail('Choose a receiving UUID, inspected handover hash and original target revision.');
  return store.exclusive(async () => {
    const jobs = await directory(join(store.root, 'receivings'), true), job = await directory(join(jobs, id), true);
    const request = { schema: JOB, id, handoverSha256, expectedRevision }, requestSha256 = digest(json(request));
    let retained;
    try { retained = decode(await bytesAt(job, 'request.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (retained && (retained.requestSha256 !== requestSha256 || digest(json(retained.request)) !== requestSha256))
      fail('This receiving UUID already belongs to a different original request.', 409);
    if (retained) {
      try {
        const completed = decode(await bytesAt(job, 'result.json'));
        if (completed.schema !== JOB || completed.id !== id || completed.state !== 'RECEIVED'
            || completed.project?.id !== retained.project.id || completed.project?.revision !== retained.project.revision
            || completed.requestSha256 !== requestSha256 || completed.handoverSha256 !== handoverSha256)
          fail('The original receiving result changed.', 409);
        return { ...completed, currentRevision: await currentRevision(store, completed.project.id), reused: true };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    let value;
    if (retained) {
      const bytes = await bytesAt(job, PROJECT_HANDOVER_FILE), index = indexOf(bytes, handoverSha256);
      let origin = null;
      if (typeof source === 'string' && source) {
        try { origin = await directory(resolve(source)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const headName = 'projects/' + index.project.id + '/head.json';
      const load = async file => {
        if (file.name === headName) {
          const bytes = json({ id: index.project.id, revision: index.project.revision, inputDigest: index.project.inputDigest });
          if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) fail('The retained handover head encoding changed.');
          return bytes;
        }
        try { return await bytesAt(store.root, file.name, file); }
        catch (error) { if (error.code !== 'ENOENT' && error.status !== 409) throw error; }
        if (!origin) fail('Continue this same receiving operation with its original remaining file directory.', 409);
        return bytesAt(origin, file.name, file);
      };
      value = { index, bytes, sha256: handoverSha256, load };
      await verifyClosure(index, load);
    } else {
      if (typeof source !== 'string' || !source) fail('Choose the downloaded original handover directory.');
      value = await inspect(source, handoverSha256);
      const current = await compatibleHistory(store, value.index, value.load);
      if (current !== expectedRevision) fail('The target project changed after handover inspection.', 409);
      await put(job, PROJECT_HANDOVER_FILE, value.bytes);
      await put(job, 'request.json', json({ request, requestSha256, project: value.index.project, createdAt: new Date().toISOString() }));
    }
    const current = await compatibleHistory(store, value.index, value.load), project = value.index.project.id;
    const headName = 'projects/' + project + '/head.json';
    for (const file of value.index.files) {
      if (file.name === headName) continue;
      await put(store.root, file.name, await value.load(file));
    }
    const context = await readProjectPaths(store.root, project);
    const roots = [...new Set([...context.roots, ...value.index.roots, store.root])].sort();
    if (roots.length > 64) fail('This project exceeds the retained path-lineage capacity.');
    await put(store.root, 'projects/' + project + '/workspace-paths.json',
      json({ schema: WORKSPACE_PATHS_SCHEMA, project, roots }), true);
    if (current < value.index.project.revision) {
      const head = value.index.files.find(file => file.name === headName);
      await put(store.root, headName, await value.load(head), true);
    }
    const reopened = await store.read(project);
    if (reopened.revision < value.index.project.revision) fail('The received project did not publish its selected head.', 409);
    const result = { ...view(value.index, value.sha256), schema: JOB, id, requestSha256,
      state: 'RECEIVED', workspace: store.root, receivedRevision: value.index.project.revision,
      currentRevision: reopened.revision, completedAt: new Date().toISOString(), reused: false };
    await put(job, 'result.json', json(result));
    return result;
  });
}

/** Original request/result discovery survives browser URL and process changes. */
export async function listProjectReceivings(store, { offset = 0, limit = 20, expectedSnapshotSha256 } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    fail('Select a receiving-history page of at most 50 original operations.');
  let names;
  try { names = (await readdir(join(store.root, 'receivings'), { withFileTypes: true }))
    .filter(item => item.isDirectory() && UUID.test(item.name)).map(item => item.name).sort(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; names = []; }
  const snapshotSha256 = digest(json(names));
  if (expectedSnapshotSha256 !== undefined && expectedSnapshotSha256 !== snapshotSha256)
    fail('Receiving history changed. Refresh its original first page.', 409);
  const items = [];
  for (const id of names.slice(offset, offset + limit)) {
    const root = join(store.root, 'receivings', id);
    try {
      const retained = decode(await bytesAt(root, 'request.json'));
      if (retained.request?.id !== id || digest(json(retained.request)) !== retained.requestSha256)
        fail('The retained receiving request changed.');
      let result = null;
      try { result = decode(await bytesAt(root, 'result.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (result && (result.id !== id || result.requestSha256 !== retained.requestSha256 || result.state !== 'RECEIVED'))
        fail('The retained receiving completion changed.');
      items.push({ id, project: retained.project, createdAt: retained.createdAt, request: retained.request,
        state: result ? 'RECEIVED' : 'RETAINED_REQUEST',
        ...(result ? { completedAt: result.completedAt, receivedRevision: result.receivedRevision } : {}) });
    } catch (error) {
      if (error.code !== 'ENOENT') items.push({ id, state: 'UNAVAILABLE', error: error.message });
    }
  }
  return { items, offset, limit, total: names.length, nextOffset: offset + limit < names.length ? offset + limit : null,
    snapshotSha256 };
}
