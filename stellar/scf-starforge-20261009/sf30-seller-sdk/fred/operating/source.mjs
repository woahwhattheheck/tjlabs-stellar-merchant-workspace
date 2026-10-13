// MIT. Portable original FRED sources for ordinary editable Operating Plans.
import { constants } from 'node:fs';
import { open, lstat, realpath, readdir, mkdir, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { withPrivateLock } from '../../routescan/quota.mjs';
import { exportFredProject, readFredProject, receiveFredProject } from '../project.mjs';
import { canonicalJSONChunks, canonicalJSONDigest, canonicalJSONInfo } from '../canonical-stream.mjs';
import { listFredDdpPublicationOperations, readFredDdpPublicationOperation,
  openFredDdpPublicationFile, attachFredDdpPublishedProgramme } from '../ddp/published-workspace.mjs';
import { inspectFredOperatingSource, inspectFredOperatingPlanSource } from '../../../distribution/discovery/fred-operating-plan.mjs';
import { inspectOperatingPlan, receiveOperatingPlan } from '../../../distribution/discovery/operating-plan.mjs';

export const FRED_OPERATING_PACKAGE_SCHEMA = 'stellar-forge.fred-operating-package.v1';
export const FRED_OPERATING_SOURCE_FILE = 'source.json';
export const FRED_OPERATING_MANIFEST_FILE = 'MANIFEST.json';
export const MAX_FRED_OPERATING_DESCRIPTOR_BYTES = 32 * 1024 * 1024;
export const MAX_FRED_OPERATING_PACKAGE_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_FRED_OPERATING_BUNDLE_BYTES = 480 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const INVENTORY = ['captures','reviews','publications','briefingTemplates','briefingSuccessors',
  'releaseCaptures','releaseWatches','releasePlans','releaseCatchUps','ddpCrosswalks','ddpPackages','ddpMigrations','ddpReceivings'];
const utf8 = new TextDecoder('utf-8', { fatal:true });
const clone = value => JSON.parse(JSON.stringify(value));
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
function ref(value) {
  need(value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'bytes,path,sha256',
    'Select the exact original file descriptor.');
  pathName(value.path);
  need(Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= MAX_FRED_OPERATING_PACKAGE_BYTES &&
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
async function opened(root, name, maximum = MAX_FRED_OPERATING_PACKAGE_BYTES) {
  await parent(root, name);
  const path = join(root, name), file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    need(info.isFile() && info.nlink === 1 && !(info.mode & 0o077) && info.size > 0 && info.size <= maximum,
      'Read a complete private original file: ' + name);
    return { file, info, path };
  } catch(error) { await file.close(); throw error; }
}
async function unchanged(value) {
  const after = await value.file.stat(), named = await lstat(value.path);
  need(stamp(after) === stamp(value.info) && named.isFile() && !named.isSymbolicLink() &&
    named.dev === after.dev && named.ino === after.ino, 'The original file changed during its read.');
}
async function describe(root, name, signal) {
  stop(signal); const item = await opened(root, name), digest = createHash('sha256'); let bytes = 0;
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
async function writeStream(root, name, chunks, expected = null, signal) {
  pathName(name); await parent(root, name, true); stop(signal);
  const temporary = name + '.' + randomUUID() + '.part', file = await open(join(root, temporary),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const digest = createHash('sha256'); let bytes = 0;
  try {
    for await (const piece of chunks) {
      stop(signal); const chunk = typeof piece === 'string' ? Buffer.from(piece) : piece;
      bytes += chunk.length; need(bytes <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete original file exceeds package capacity.');
      digest.update(chunk); let offset = 0;
      while (offset < chunk.length) { const result = await file.write(chunk, offset, chunk.length - offset); need(result.bytesWritten > 0, 'The original output could not be completed.'); offset += result.bytesWritten; }
    }
    const value = { path:name, bytes, sha256:digest.digest('hex') }; ref(value);
    if (expected) same(value, expected, 'Complete original output');
    await file.sync(); await file.close();
    try { await link(join(root, temporary), join(root, name)); }
    catch(error) { if (error.code !== 'EEXIST') throw error; same(await describe(root, name, signal), value, 'Previously retained original file'); }
    await unlink(join(root, temporary));
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
/** Complete original operation bodies define every prefix; no result or abandoned action is omitted. */
export function fredOperatingHistory(state) {
  need(state && typeof state.id === 'string' && typeof state.createdAt === 'string' &&
    Array.isArray(state.operations) && state.revision === state.operations.length + 1, 'The complete project operation chronology differs.');
  const history = [{ revision:1, sha256:canonicalJSONDigest({ projectId:state.id, createdAt:state.createdAt }) }], ids = new Set();
  for (const operation of state.operations) {
    need(operation && typeof operation.id === 'string' && !ids.has(operation.id) && operation.result?.revision === history.length + 1,
      'The original operation revisions must remain complete and consecutive.');
    ids.add(operation.id);
    history.push({ revision:operation.result.revision, sha256:canonicalJSONDigest({ previous:history.at(-1).sha256, operation }) });
  }
  return history;
}
function bundleIdentity(bundle) {
  need(bundle && /^stellar-forge\.fred-project-bundle\.v[1-6]$/.test(bundle.schema ?? '') && HASH.test(bundle.bundleSha256 ?? ''),
    'Select the original complete versioned project bundle.');
  const { bundleSha256, ...core } = bundle;
  need(canonicalJSONDigest(core) === bundleSha256, 'The complete project bundle identity changed.');
  need(!bundle.state?.pending, 'Complete the original project action before freezing its handover.');
  fredOperatingHistory(bundle.state);
  return bundle;
}
function inventoryFor(state) {
  return { ...Object.fromEntries(INVENTORY.map(key => [key, clone(state[key] ?? [])])), qcew:clone(state.qcew ?? null) };
}
function descriptorFor(bundle, artifact, capturedAt, published) {
  bundleIdentity(bundle); const state = bundle.state, history = fredOperatingHistory(state);
  const inventory = inventoryFor(state);
  const evidence = [
    { id:'project/' + state.id, kind:'project', reference:'/state', artifact },
    ...INVENTORY.flatMap(key => inventory[key].map((item, index) => ({
      id:key + '/' + index + '/' + (item.id ?? item.captureId ?? ''), kind:key, reference:'/state/' + key + '/' + index, artifact
    }))),
    ...state.operations.map((operation, index) => ({ id:'operation/' + operation.id, kind:operation.kind,
      reference:'/state/operations/' + index, artifact })),
    ...(state.qcew ? [{ id:'qcew/' + state.id, kind:'qcew', reference:'/state/qcew', artifact }] : []),
    ...published.filter(item => item.artifact).map(item => ({
      id:'published/' + item.id, kind:'published', reference:item.id, artifact:item.artifact
    }))
  ];
  const core = { schema:'stellar-forge.fred-operating-source.v1', capturedAt,
    project:{ id:state.id, title:state.title, revision:state.revision, createdAt:state.createdAt,
      selection:clone(state.selection), bundleSha256:bundle.bundleSha256 },
    artifact, history, inventory, published:clone(published), evidence };
  return inspectFredOperatingSource({ ...core, id:'fred-operating-source-' + canonicalJSONDigest(core) });
}
async function publicationSelection(directoryPath, publicationIds, projectId) {
  const entries = [], seen = new Set(); let offset = 0;
  do {
    const page = await listFredDdpPublicationOperations({ directory:directoryPath, offset, limit:500 });
    need(page.projectId === projectId, 'The publication index belongs to another project.');
    for (const row of page.items) { need(!seen.has(row.id), 'The publication listing changed while it was captured.'); seen.add(row.id); entries.push(row); }
    need(page.nextOffset === null || page.nextOffset > offset, 'The publication listing cannot advance.');
    offset = page.nextOffset;
  } while (offset !== null);
  if (publicationIds !== null) need(publicationIds.every(id => seen.has(id)), 'Choose publication IDs from this project.');
  const selected = publicationIds === null ? entries : publicationIds.map(id => entries.find(row => row.id === id));
  const views = [];
  for (const row of selected) {
    const view = await readFredDdpPublicationOperation({ directory:directoryPath, id:row.id });
    need(view.projectId === projectId, 'The publication view belongs to another project.');
    if (view.state === 'COMPLETE') {
      const archive = view.files.find(file => file.name === 'edition-package.tar.gz');
      need(archive && HASH.test(archive.sha256) && Number.isSafeInteger(archive.bytes), 'The completed edition must retain its complete original archive.');
    }
    views.push(view);
  }
  return views;
}
function result(source, sourceFile, manifestFile, root, reused) {
  return { source, sourceFile, manifestFile, directory:root, projectDirectory:null, reused };
}
async function owner(root, work, signal) {
  stop(signal); absolute(root, 'Output directory'); await directory(root, true);
  return withPrivateLock(root, 'operating-source.lock', () => work());
}
/** Capture already retained originals, complete chronology and selected complete edition archives. */
export async function captureFredOperatingSource({ directory:originalDirectory, outputDirectory, capturedAt,
  publicationIds = null, qcewSourceContexts = null, signal } = {}) {
  absolute(originalDirectory, 'Original project directory'); absolute(outputDirectory, 'Output directory');
  need(originalDirectory !== outputDirectory && !outputDirectory.startsWith(originalDirectory + '/') &&
    !originalDirectory.startsWith(outputDirectory + '/'), 'Choose a separate source package directory.');
  need(typeof capturedAt === 'string' && new Date(capturedAt).toISOString() === capturedAt, 'Supply the exact UTC ISO capture time.');
  need(publicationIds === null || Array.isArray(publicationIds) && publicationIds.every(id => ID.test(id)) &&
    new Set(publicationIds).size === publicationIds.length, 'Choose distinct original publication operation IDs, or all operations.');
  const request = { directory:originalDirectory, capturedAt, publicationIds };
  return owner(outputDirectory, async () => {
    let selection = await optional(outputDirectory, 'SELECTION.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (selection) same(selection.request, request, 'Original source selection');
    const completed = await optional(outputDirectory, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (completed) {
      need(selection, 'The completed package lost its original capture selection.');
      return { ...(await inspectFredOperatingSourcePackage({ directory:outputDirectory, expectedSource:completed.source, signal })), reused:true };
    }
    let bundle;
    if (!selection) {
      const names = await readdir(outputDirectory);
      need(names.every(name => name === 'operating-source.lock'), 'Choose a fresh directory or resume its original captured source.');
      bundle = bundleIdentity(await exportFredProject({ directory:originalDirectory, qcewSourceContexts }));
      const views = await publicationSelection(originalDirectory, publicationIds, bundle.state.id);
      const current = await readFredProject(originalDirectory);
      need(current.id === bundle.state.id && current.revision === bundle.state.revision && !current.pending,
        'The original project changed while selecting the source; capture its current complete revision.');
      selection = { schema:'stellar-forge.fred-operating-selection.v1', request, bundleSha256:bundle.bundleSha256, projectId:bundle.state.id, views };
      await writeJson(outputDirectory, 'SELECTION.json', selection, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    }
    if (!bundle) {
      bundle = await optional(outputDirectory, 'project/project-bundle.json', MAX_FRED_OPERATING_BUNDLE_BYTES, signal);
      if (!bundle) bundle = await exportFredProject({ directory:originalDirectory, qcewSourceContexts });
      bundleIdentity(bundle);
      need(bundle.bundleSha256 === selection.bundleSha256 && bundle.state.id === selection.projectId,
        'Resume with the exact selected project bundle; the original project has advanced.');
    }
    const artifact = await writeJson(outputDirectory, 'project/project-bundle.json', bundle, MAX_FRED_OPERATING_BUNDLE_BYTES, signal);
    const files = [artifact], published = []; let total = artifact.bytes;
    for (const view of selection.views) {
      stop(signal); let archive = null;
      if (view.state === 'COMPLETE') {
        const descriptor = view.files.find(file => file.name === 'edition-package.tar.gz');
        archive = { path:'published/' + view.id + '/edition-package.tar.gz', bytes:descriptor.bytes, sha256:descriptor.sha256 };
        total += archive.bytes; need(total <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete handover exceeds 4 GiB; explicitly select the original editions to hand over.');
        let retained = null;
        try { retained = await describe(outputDirectory, archive.path, signal); } catch(error) { if (error.code !== 'ENOENT') throw error; }
        if (retained) same(retained, archive, 'Retained original edition archive');
        else {
          const openedFile = await openFredDdpPublicationFile({ directory:originalDirectory, id:view.id,
            name:descriptor.name, expectedSha256:descriptor.sha256 });
          try {
            need(openedFile.projectId === selection.projectId && openedFile.operationId === view.id, 'The original archive belongs to another publication.');
            const before = await openedFile.file.stat();
            await writeStream(outputDirectory, archive.path, openedFile.file.createReadStream({ autoClose:false }), archive, signal);
            need(stamp(await openedFile.file.stat()) === stamp(before), 'The publication archive changed while being copied.');
          } finally { await openedFile.file.close(); }
        }
        files.push(archive);
      }
      published.push({ id:view.id, view, artifact:archive });
    }
    const source = descriptorFor(bundle, artifact, capturedAt, published);
    const sourceFile = await writeJson(outputDirectory, FRED_OPERATING_SOURCE_FILE, source, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    files.push(sourceFile); total += sourceFile.bytes;
    need(total <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete package exceeds 4 GiB.');
    const manifest = { schema:FRED_OPERATING_PACKAGE_SCHEMA, source:sourceFile, projectId:source.project.id,
      bundleSha256:source.project.bundleSha256, files:files.sort((a,b) => a.path.localeCompare(b.path)), bytes:total };
    await writeJson(outputDirectory, FRED_OPERATING_MANIFEST_FILE, manifest, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    return { ...(await inspectFredOperatingSourcePackage({ directory:outputDirectory, expectedSource:sourceFile, signal })), reused:false };
  }, signal);
}
async function inspectPackage(root, expectedSource, signal) {
  absolute(root, 'Package directory'); await directory(root);
  ref(expectedSource); need(expectedSource.path === FRED_OPERATING_SOURCE_FILE && expectedSource.bytes <= MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
    'Select the complete original source.json descriptor.');
  const source = inspectFredOperatingSource(await readJson(root, expectedSource.path, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, expectedSource, signal));
  const manifest = await readJson(root, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, null, signal);
  need(manifest.schema === FRED_OPERATING_PACKAGE_SCHEMA && Array.isArray(manifest.files), 'Read the complete original package manifest.');
  same(manifest.source, expectedSource, 'Manifest source'); need(manifest.projectId === source.project.id &&
    manifest.bundleSha256 === source.project.bundleSha256, 'The package manifest changed its original project.');
  const expected = new Map();
  for (const value of [expectedSource, source.artifact, ...source.published.filter(item => item.artifact).map(item => item.artifact)]) {
    ref(value); need(!expected.has(value.path), 'The package repeats an original file path.'); expected.set(value.path, value);
  }
  need(manifest.files.length === expected.size, 'Keep the complete selected source file inventory.');
  let total = 0;
  for (const value of manifest.files) {
    ref(value); same(expected.get(value.path), value, 'Manifest member');
    same(await describe(root, value.path, signal), value, 'Complete original artifact');
    total += value.bytes; expected.delete(value.path);
  }
  need(expected.size === 0 && total === manifest.bytes && total <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete package total differs.');
  const bundle = bundleIdentity(await readJson(root, source.artifact.path, MAX_FRED_OPERATING_BUNDLE_BYTES, source.artifact, signal));
  const recomputed = descriptorFor(bundle, source.artifact, source.capturedAt, source.published);
  same(recomputed, source, 'Original source inventories, evidence and complete history');
  for (const item of source.published) {
    need(item.id === item.view.id && item.view.projectId === source.project.id, 'A retained publication belongs to another original project.');
    if (item.artifact) {
      need(item.view.state === 'COMPLETE', 'Only a complete original publication has a completed archive.');
      const entry = item.view.files.find(file => file.name === 'edition-package.tar.gz');
      need(entry && entry.bytes === item.artifact.bytes && entry.sha256 === item.artifact.sha256, 'The publication archive differs from its original view.');
    } else need(item.view.state !== 'COMPLETE', 'The complete original publication lost its archive.');
  }
  const manifestFile = await describe(root, FRED_OPERATING_MANIFEST_FILE, signal);
  return { source, manifest, bundle, sourceFile:expectedSource, manifestFile };
}
/** Read every selected original byte and recompute the source descriptor from the full project. */
export async function inspectFredOperatingSourcePackage({ directory:root, expectedSource, signal } = {}) {
  const value = await inspectPackage(root, expectedSource, signal);
  return result(value.source, value.sourceFile, value.manifestFile, root, true);
}

// The original publication writer emits USTAR regular files only. Receive that exact format,
// rejecting links, devices, duplicate paths, redirects and extra members.
async function extractEdition(root, artifact, output, view, signal) {
  await directory(output, true);
  const input = await opened(root, artifact.path), gunzip = createGunzip(), stream = input.file.createReadStream({ autoClose:false });
  const pumped = pipeline(stream, gunzip); pumped.catch(() => {});
  const iterator = gunzip[Symbol.asyncIterator](); let pending = Buffer.alloc(0), ended = false, count = 0;
  async function take(length, allowEnd = false) {
    const parts = []; let bytes = 0;
    while (bytes < length) {
      stop(signal);
      if (pending.length) { const n = Math.min(length - bytes, pending.length); parts.push(pending.subarray(0,n)); pending = pending.subarray(n); bytes += n; }
      else {
        const next = await iterator.next();
        if (next.done) { ended = true; if (allowEnd && bytes === 0) return null; need(false, 'The complete original edition archive ended early.'); }
        pending = next.value;
      }
    }
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, bytes);
  }
  const expected = new Map(view.files.filter(file => file.name !== 'edition-package.tar.gz').map(file => [file.name, file]));
  need(expected.size === view.files.length - 1, 'The original edition repeats a member.');
  const textField = (header, at, size) => utf8.decode(header.subarray(at, at + size)).split('\0')[0];
  const numberField = (header, at, size) => {
    const text = textField(header, at, size).trim(); need(/^[0-7]+$/.test(text), 'Use the original USTAR numeric field.');
    const number = Number.parseInt(text, 8); need(Number.isSafeInteger(number) && number >= 0, 'The original archive member exceeds capacity.'); return number;
  };
  try {
    for (;;) {
      const header = await take(512);
      if (header.every(byte => byte === 0)) {
        const second = await take(512); need(second.every(byte => byte === 0), 'The original archive terminator changed.');
        while (!ended) { const tail = await take(512, true); if (tail) need(tail.every(byte => byte === 0), 'The archive contains data after its terminator.'); }
        break;
      }
      const savedChecksum = numberField(header,148,8); let checksum = 0;
      for (let i = 0; i < header.length; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
      need(checksum === savedChecksum && textField(header,257,6) === 'ustar' && [0,48].includes(header[156]),
        'Receive the original regular-file USTAR archive.');
      const prefix = textField(header,345,155), name = pathName((prefix ? prefix + '/' : '') + textField(header,0,100));
      const size = numberField(header,124,12), entry = expected.get(name);
      need(entry && size === entry.bytes && size <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The edition member differs from its original file inventory.');
      count += size; need(count <= MAX_FRED_OPERATING_PACKAGE_BYTES, 'The complete expanded edition exceeds 4 GiB.');
      async function* content() { let left = size; while (left) { const part = await take(Math.min(left,65536)); left -= part.length; yield part; } }
      await writeStream(output, name, content(), { path:name, bytes:size, sha256:entry.sha256 }, signal);
      expected.delete(name);
      if (size % 512) { const padding = await take(512 - size % 512); need(padding.every(byte => byte === 0), 'The original archive padding changed.'); }
    }
    await pumped; await unchanged(input); need(expected.size === 0, 'The archive omitted an original edition file.');
    const edition = await readJson(output, 'edition.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, null, signal);
    need(edition.schema === 'stellar-forge.fred-ddp-publication-edition.v1' && edition.operationId === view.id &&
      edition.projectId === view.projectId && edition.migrationId === view.migrationId, 'The extracted edition lost its original project and operation.');
    same(edition.result, view.result, 'Original edition result');
    return edition;
  } finally {
    if (!ended) gunzip.destroy();
    stream.destroy(); await pumped.catch(() => {}); await input.file.close();
  }
}
async function receivePlan(root, incoming, source, signal) {
  const old = await optional(root, 'OPERATING-PLAN.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
  if (old) inspectFredOperatingPlanSource(old, source);
  if (incoming === null) return old;
  inspectFredOperatingPlanSource(incoming, source);
  const value = old ? receiveOperatingPlan(incoming, old) : receiveOperatingPlan(incoming);
  // The generic receiver returns the retained plan (same prefix conflict rules as the browser).
  const plan = value?.plan ?? value;
  inspectOperatingPlan(plan);
  if (old) {
    if (canonicalJSONDigest(old) === canonicalJSONDigest(plan)) return old;
    const temporary = 'OPERATING-PLAN-' + canonicalJSONDigest(plan) + '.json';
    await writeJson(root, temporary, plan, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    const { rename } = await import('node:fs/promises');
    await rename(join(root, temporary), join(root, 'OPERATING-PLAN.json'));
  } else await writeJson(root, 'OPERATING-PLAN.json', plan, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
  return plan;
}
/** Restore the complete original project and reopen retained publication editions without acquisition. */
export async function receiveFredOperatingSource({ sourceDirectory, destination, expectedSource,
  qcewSourceContexts = null, plan = null, signal } = {}) {
  absolute(sourceDirectory, 'Source directory'); absolute(destination, 'Receiving directory'); ref(expectedSource);
  need(sourceDirectory !== destination && !destination.startsWith(sourceDirectory + '/') && !sourceDirectory.startsWith(destination + '/'),
    'Use a separate receiving directory.');
  return owner(destination, async () => {
    const request = { schema:'stellar-forge.fred-operating-receive-request.v1', source:expectedSource };
    const prior = await optional(destination, 'RECEIVE.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (prior) same(prior, request, 'Original receiving selection');
    else {
      need((await readdir(destination)).every(name => name === 'operating-source.lock'), 'Choose an empty receiving directory or its original continuation.');
      await writeJson(destination, 'RECEIVE.json', request, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    }
    let checked;
    const retained = await optional(destination, FRED_OPERATING_MANIFEST_FILE, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (retained) checked = await inspectPackage(destination, expectedSource, signal);
    else {
      checked = await inspectPackage(sourceDirectory, expectedSource, signal);
      for (const file of checked.manifest.files) { stop(signal); await copy(sourceDirectory, file, destination, signal); }
      await copy(sourceDirectory, checked.manifestFile, destination, signal);
    }
    const projectDirectory = join(destination, 'project-workspace');
    const received = await receiveFredProject({ directory:projectDirectory, bundle:checked.bundle, qcewSourceContexts });
    const state = await readFredProject(projectDirectory), currentHistory = fredOperatingHistory(state);
    need(state.id === checked.source.project.id && currentHistory.some(item => item.revision === checked.source.project.revision &&
      item.sha256 === checked.source.history.at(-1).sha256), 'The receiving project diverged from its original operation history.');
    const publications = [];
    for (const item of checked.source.published) {
      stop(signal); if (!item.artifact) continue;
      const workspace = join(destination, 'published-workspaces', item.id);
      const edition = await extractEdition(destination, item.artifact, workspace, item.view, signal);
      let existing = null;
      try { existing = await readFredDdpPublicationOperation({ directory:projectDirectory, id:item.id }); }
      catch(error) { if (error.code !== 'ENOENT') throw error; }
      if (existing?.state === 'COMPLETE') {
        same(existing.result, item.view.result, 'Received publication result');
        need(existing.migrationId === item.view.migrationId, 'The local publication belongs to another migration.');
      } else {
        const expectedRevision = existing?.expectedRevision ?? (await readFredProject(projectDirectory)).revision;
        existing = await attachFredDdpPublishedProgramme({ directory:projectDirectory, id:item.id, expectedRevision,
          migrationId:item.view.migrationId, workspace, output:edition.programme.output,
          manifest:edition.programme.manifestPath, signal });
      }
      need(existing.state === 'COMPLETE', 'The original retained publication did not complete receiving.');
      const archive = existing.files.find(file => file.name === 'edition-package.tar.gz');
      need(archive?.sha256 === item.artifact.sha256 && archive.bytes === item.artifact.bytes,
        'The reopened publication archive differs from the original exact edition.');
      publications.push({ id:item.id, projectId:existing.projectId, comparisonId:existing.comparisonId,
        requestSha256:existing.requestSha256, archive:{ name:archive.name, bytes:archive.bytes, sha256:archive.sha256 } });
    }
    const receipt = { schema:'stellar-forge.fred-operating-received.v1', sourceFile:checked.sourceFile,
      manifestFile:checked.manifestFile, projectId:checked.source.project.id, bundleSha256:checked.source.project.bundleSha256,
      sourceRevision:checked.source.project.revision, publications };
    const previous = await optional(destination, 'RECEIVED.json', MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    if (previous) same(previous, receipt, 'Original complete receiving receipt');
    const receiptFile = await writeJson(destination, 'RECEIVED.json', receipt, MAX_FRED_OPERATING_DESCRIPTOR_BYTES, signal);
    const receivedPlan = await receivePlan(destination, plan, checked.source, signal);
    return { ...result(checked.source, checked.sourceFile, checked.manifestFile, destination, Boolean(previous)),
      projectDirectory, publications, plan:receivedPlan, receiptFile, projectReceipt:received };
  }, signal);
}
