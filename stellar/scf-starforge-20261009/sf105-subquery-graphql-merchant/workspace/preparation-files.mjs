// MIT. Complete native preparation history and bytes for original receiving.
import { readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { digest, plain } from './store.mjs';
import { readRequestBytes, writeRequestBytes, requestJson, requestUuid } from './request-sets.mjs';
import { preparationFile, preparationReference, validatePreparationRecord, verifyPreparationSource,
  preparationGenerations, preparationsActive, preparationsVersion } from './preparation.mjs';
import { snapshotPreparationFiles, readExport, verifyExport } from './merchant.mjs';
import { attachPathContext, readProjectPaths, referenceDirectory } from './paths.mjs';

export const PREPARATION_FILES_SCHEMA = 'stellar-forge.graphql-merchant-preparation-files.v1';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const same = (a, b) => requestJson(a).equals(requestJson(b));
const info = (name, raw) => ({ name, bytes: raw.length, sha256: digest(raw) });
const decode = raw => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));

/** The same complete closure validator is used by producer and receiver. */
export async function collectPreparationClosure(versions, io, scope = null) {
  const project = versions[0]?.id, revision = versions.at(-1)?.revision;
  if (!project || versions.some(item => item.id !== project)) fail('Select one original project history.');
  const files = new Map(), references = new Map(), ids = new Set(), records = new Map();
  const add = async (name, sha256, bytes) => {
    if (files.has(name)) {
      const old = files.get(name);
      if (sha256 && old.file.sha256 !== sha256 || bytes !== undefined && old.file.bytes !== bytes)
        fail('Preparation history names divergent original bytes.', 409);
      return old.raw;
    }
    const raw = await io.load(name, sha256);
    if (!Buffer.isBuffer(raw) || sha256 && digest(raw) !== sha256 || bytes !== undefined && raw.length !== bytes)
      fail('The preparation file changed from its original identity.', 409);
    files.set(name, { file: info(name, raw), raw }); return raw;
  };
  for (const saved of versions) for (const ref of saved.merchantPreparations ?? []) {
    requestUuid(ref.id);
    if (scope && ref.id !== scope) continue;
    const key = ref.id + ':' + ref.generation;
    if (references.has(key) && !same(references.get(key), ref))
      fail('Committed revisions disagree about the original preparation generation.', 409);
    references.set(key, ref); ids.add(ref.id);
  }
  for (const id of await io.ids()) {
    if (scope && id !== scope) continue;
    requestUuid(id);
    const raw = await io.load(preparationFile(id, 1)), first = decode(raw);
    if (first.project === project && first.draftRevision <= revision) ids.add(id);
  }
  if (scope && !ids.has(scope)) fail('The selected preparation does not belong to this project revision.', 404);
  let generations = 0, attempts = 0, completed = 0;
  for (const id of [...ids].sort()) {
    const available = await io.generations(id), maximum = available.at(-1);
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 256 ||
        available.length !== maximum || available.some((value, index) => value !== index + 1))
      fail('The original preparation generation chain is incomplete.', 409);
    let previous = null; const history = [];
    for (let number = 1; number <= maximum; number++) {
      const raw = await add(preparationFile(id, number)), sha256 = digest(raw);
      const record = validatePreparationRecord(decode(raw), id, previous);
      if (record.project !== project || record.draftRevision > revision) fail('A preparation is outside this selected source history.', 409);
      const selected = references.get(id + ':' + number);
      if (selected && !same(selected, preparationReference(record, sha256)))
        fail('The project preparation reference differs from its original record.', 409);
      await verifyPreparationSource(record, { loadDraft: async (draftRevision, draftSha256) =>
        add('projects/' + project + '/' + draftRevision + '.json', draftSha256) });
      for (const attempt of record.attempts) {
        for (const file of attempt.files) await add(file.name, file.sha256, file.bytes);
        if (attempt.state === 'STARTED') {
          for (const file of await io.attemptFiles(attempt)) {
            if (!file.name.startsWith(attempt.task + '/')) fail('A partial native file belongs to another attempt.');
            await add(file.name, file.sha256, file.bytes);
          }
        }
        if (attempt.output) {
          const filename = attempt.task + (record.kind === 'revision' ? '/revised' : '') + '/workspace-export.json';
          const output = decode(await add(filename, attempt.output.recordSha256));
          if (output.id !== attempt.id || output.directory !== attempt.output.directory ||
              output.draftRevision !== record.draftRevision || output.inputDigest !== record.inputDigest)
            fail('The native preparation output differs from its original reference.', 409);
          const group = async (directory, groupFiles) => {
            if (!Array.isArray(groupFiles)) fail('The native export lost its original manifest.');
            const prefix = relative(attempt.workspaceRoot, directory).split('\\').join('/');
            if (prefix !== attempt.task && !prefix.startsWith(attempt.task + '/'))
              fail('The native output points outside its original attempt.', 409);
            for (const file of groupFiles) {
              if (typeof file.name !== 'string' || /[\\:\u0000-\u001f\u007f]/.test(file.name) ||
                  file.name.split('/').some(part => !part || part === '.' || part === '..'))
                fail('The native output contains an invalid relative file.');
              await add(prefix + '/' + file.name, file.sha256, file.bytes);
            }
          };
          await group(output.directory, output.files);
          if (output.evolution) await group(output.evolution.directory, output.evolution.files);
        }
      }
      previous = { record, raw, sha256 }; history.push(previous); generations++;
    }
    records.set(id, { ...previous, history }); attempts += previous.record.attempts.length;
    if (previous.record.state === 'COMPLETED') completed++;
  }
  for (const ref of references.values()) if (!records.get(ref.id)?.history[ref.generation - 1])
    fail('The handover omits a committed native preparation generation.');
  return { files, records, counts: { merchantPreparations: records.size,
    merchantPreparationGenerations: generations, merchantPreparationAttempts: attempts,
    merchantPreparationCompleted: completed } };
}
export async function nativePreparationIds(store) {
  let entries;
  try { entries = await readdir(join(store.root, 'merchant-preparations'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const item of entries.filter(item => item.isDirectory() &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item.name))) {
    try { await readRequestBytes(store, preparationFile(item.name, 1)); result.push(item.name); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result.sort();
}
export async function collectNativePreparationClosure(store, versions, scope = null) {
  const version = preparationsVersion(store), ids = await nativePreparationIds(store);
  const selectedIds = scope ? [scope] : ids;
  if (preparationsActive(store, selectedIds)) fail('The native preparation is still writing. Retain its file packet after that same action settles.', 409);
  const value = await collectPreparationClosure(versions, {
    ids: async () => ids,
    generations: id => preparationGenerations(store, id),
    load: async (name, sha256) => (await readRequestBytes(store, name, sha256)).raw,
    attemptFiles: attempt => snapshotPreparationFiles(store, attempt.task),
  }, scope);
  if (preparationsActive(store, selectedIds) || preparationsVersion(store) !== version)
    fail('The native preparation changed during its file selection.', 409);
  return value;
}
const escape = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(closure, selection, index) {
  const records = [...closure.records.values()];
  return Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'">' +
    '<title>Saved merchant preparation</title><style>body{font:16px/1.5 system-ui;max-width:1050px;margin:32px auto;padding:0 20px;color:#202326}' +
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f5;padding:16px}article{border-top:1px solid #aaa;padding:20px 0}' +
    'a{color:inherit}li{overflow-wrap:anywhere}</style><h1>Saved merchant preparation</h1><p>Project ' + escape(selection.project) +
    ' · selected revision ' + selection.revision + '</p><p>These files retain the original source, attempts and native packages. ' +
    'Open the complete project handover through the original GraphQL workspace for continued editing and recovery. Opening this report performs no provider request.</p>' +
    records.map(({ record }) => '<section><h2>' + escape(record.kind) + ' · ' + escape(record.state) + '</h2><p>' +
      escape(record.id) + ' · original draft ' + record.draftRevision + ' · generation ' + record.generation +
      '</p><details><summary>Original saved request</summary><pre>' + escape(requestJson(record.request)) + '</pre></details>' +
      record.attempts.map(attempt => '<article><h3>Attempt ' + attempt.ordinal + ' · ' + escape(attempt.state) +
        '</h3><p>' + escape(attempt.id) + '</p><p>Started ' + escape(attempt.startedAt) +
        (attempt.finishedAt ? ' · retained ' + escape(attempt.finishedAt) : '') + '</p>' +
        (attempt.error ? '<pre>' + escape(requestJson(attempt.error)) + '</pre>' : '') +
        (attempt.output ? '<p>Complete native merchant: <a href="' + escape(attempt.task +
          (record.kind === 'revision' ? '/revised' : '') + '/merchant/review.html') + '">open native review</a></p>' :
          '<p>The retained partial files remain available. A new attempt requires explicit continuation in the original workspace.</p>') +
        '</article>').join('') + '</section>').join('') +
    '<h2>Complete files</h2><p><a href="preparation-files.json">Original packet index</a></p><ul>' +
    index.files.map(file => '<li><a href="' + escape(file.name) + '">' + escape(file.name) + '</a> · ' +
      file.bytes + ' bytes</li>').join('') + '</ul></html>');
}
export async function preparePreparationPacket(store, selection) {
  const saved = await store.read(selection.project, selection.revision), versions = [];
  for (let revision = 1; revision <= saved.revision; revision++) versions.push(await store.read(saved.id, revision));
  requestUuid(selection.preparationId);
  const closure = await collectNativePreparationClosure(store, versions, selection.preparationId);
  const loaders = new Map(closure.files), context = await readProjectPaths(store.root, saved.id);
  for (const { record } of closure.records.values()) if (record.baseline) {
    const reference = attachPathContext({ ...record.baseline }, context), original = await readExport(reference);
    await verifyExport(original);
    const add = async (path, expected) => {
      const name = relative(store.root, path).split('\\').join('/');
      const value = await readRequestBytes(store, name, expected?.sha256);
      if (expected?.bytes !== undefined && value.raw.length !== expected.bytes) fail('The original baseline file changed.', 409);
      loaders.set(name, { file: info(name, value.raw), raw: value.raw });
    };
    await add(join(dirname(referenceDirectory(reference)), 'workspace-export.json'), { sha256: reference.recordSha256 });
    for (const file of original.files) await add(join(original.directory, file.name), file);
    if (original.evolution) for (const file of original.evolution.files) await add(join(original.evolution.directory, file.name), file);
  }
  const source = { preparationId: selection.preparationId,
    generation: closure.records.get(selection.preparationId).record.generation, counts: closure.counts };
  const index = { schema: PREPARATION_FILES_SCHEMA, selection, source,
    files: [...loaders.values()].map(item => item.file).sort((a, b) => a.name.localeCompare(b.name)) };
  for (const [name, raw] of [['preparation-files.json', requestJson(index)], ['index.html', page(closure, selection, index)]])
    loaders.set(name, { file: info(name, raw), raw });
  const files = [...loaders.values()].map(item => item.file).sort((a, b) => a.name.localeCompare(b.name));
  if (files.length > 512 || files.reduce((sum, file) => sum + file.bytes, 0) > 256_000_000)
    fail('The complete preparation packet exceeds the original transfer bounds.');
  const packetSha256 = digest(requestJson({ selection, files })), directory = 'preparation-packets/' + packetSha256;
  for (const [name, value] of loaders) await writeRequestBytes(store, directory + '/' + name, value.raw);
  return { state: 'PREPARED', selection, source, files, packetSha256, directory: join(store.root, directory) };
}
