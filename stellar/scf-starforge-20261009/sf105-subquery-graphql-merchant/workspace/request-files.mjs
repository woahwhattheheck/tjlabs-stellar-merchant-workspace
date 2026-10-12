// MIT. Complete saved request/run files through the original workspace transport.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, validateVersion, projectName } from './store.mjs';
import { requestJson, requestFailure as fail, requestSetFile, requestRunFile,
  readRequestFile, writeRequestBytes, validateRequestSetRecord, requestSetReference, verifyRequestSetSourcesFrom,
  validateRequestRunRecord, requestRunReference, verifyRunPreviewRecord, verifyRunPendingRecord } from './request-sets.mjs';
import { runAuxiliaryFiles, validateRunAuxiliaryRecord } from './request-runs.mjs';

export const REQUEST_FILES_SCHEMA = 'stellar-forge.graphql-request-files.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const equal = (a, b) => requestJson(a).equals(requestJson(b));
const info = (name, raw) => ({ name, bytes: raw.length, sha256: digest(raw) });
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function missing(operation) { try { return await operation(); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }

/**
 * One source-closure reader serves native export and the existing handover
 * receiver. load/maybe return exact original bytes; no provider is contacted.
 */
export async function collectRequestClosure(versions, { load, maybe, generations, auxiliary, includeUnattached = false, scope = null }) {
  if (!Array.isArray(versions) || !versions.length) fail('Retain the original project history.');
  const last = versions.at(-1), project = projectName(last.id), revision = last.revision;
  const byRevision = new Map(), declaredSets = new Map(), declaredRuns = new Map(), references = [];
  for (const value of versions) {
    const saved = validateVersion(value, project);
    if (saved.revision !== byRevision.size + 1) fail('The request source history is not consecutive.', 409);
    byRevision.set(saved.revision, saved);
    for (const reference of saved.requestSets ?? []) {
      const old = declaredSets.get(reference.id);
      if (old && !equal(old, reference)) fail('Committed revisions disagree about an original request set.', 409);
      declaredSets.set(reference.id, reference);
    }
    for (const reference of saved.requestRuns ?? []) {
      const key = reference.id + ':' + reference.generation, old = declaredRuns.get(key);
      if (old && !equal(old, reference)) fail('Committed revisions disagree about an original run checkpoint.', 409);
      if (!old) references.push(reference);
      declaredRuns.set(key, reference);
    }
  }
  const files = new Map(), sets = new Map(), runs = new Map(), native = new Map(), pending = new Map(), actions = new Map();
  const add = (name, raw) => {
    if (!Buffer.isBuffer(raw)) fail('Retain the original request file bytes.');
    const file = info(name, raw), old = files.get(name);
    if (old && (old.file.sha256 !== file.sha256 || old.file.bytes !== file.bytes))
      fail('The selected request closure contains divergent file bytes.', 409);
    files.set(name, { file, raw });
    return { raw, record: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), sha256: file.sha256 };
  };
  const take = async (name, expectedSha256) => {
    const raw = await load(name, expectedSha256);
    if (expectedSha256 && digest(raw) !== expectedSha256) fail('An original request source file changed.', 409);
    return add(name, raw);
  };
  const draft = async number => {
    const value = byRevision.get(number);
    if (!value) fail('The selected request omits its original source/admission revision.', 409);
    return value;
  };
  const takeSet = async id => {
    if (sets.has(id)) return sets.get(id);
    const reference = declaredSets.get(id);
    if (!reference || reference.project !== project) fail('The saved request set is absent from this original project history.', 409);
    const selected = await take(requestSetFile(id), reference.recordSha256);
    validateRequestSetRecord(selected.record, id);
    if (!equal(requestSetReference(selected.record, selected.sha256), reference))
      fail('The committed request-set summary differs from its original bytes.', 409);
    // Register before following basedOn; the original source revision must still
    // prove the earlier reference, so cycles cannot establish a valid lineage.
    sets.set(id, selected);
    await verifyRequestSetSourcesFrom(selected.record, {
      loadDraft: draft,
      loadSet: async ref => {
        const prior = await takeSet(ref.id);
        if (prior.sha256 !== ref.recordSha256) fail('The copied set changed its original source identity.', 409);
        return prior;
      },
    });
    return selected;
  };
  const selectedRunIds = scope?.runId ? new Set([scope.runId]) : scope?.requestSetId ? new Set()
    : new Set(references.map(item => item.id));
  if (scope?.requestSetId) await takeSet(scope.requestSetId);
  if (!scope) for (const id of declaredSets.keys()) await takeSet(id);
  let generationCount = 0;
  for (const id of selectedRunIds) {
    if (!UUID.test(id)) fail('Choose an original run UUID.');
    const selectedRefs = references.filter(item => item.id === id);
    if (!selectedRefs.length) fail('Choose a run retained in this project revision.', 404);
    const latest = selectedRefs.reduce((a, b) => a.generation > b.generation ? a : b);
    const chosen = scope?.generation ?? latest.generation;
    if (!Number.isSafeInteger(chosen) || chosen < 1 || chosen > latest.generation)
      fail('Choose a run generation retained in this project revision.', 404);
    const available = includeUnattached && !scope ? await generations(id) : [];
    const numbers = new Set(available);
    let maximum = chosen;
    while (maximum < 256 && numbers.has(maximum + 1)) maximum++;
    const records = [];
    let selectedSet;
    for (let number = 1; number <= maximum; number++) {
      const reference = declaredRuns.get(id + ':' + number);
      if (number <= chosen && !reference) fail('The project omits an original earlier run checkpoint.', 409);
      const entry = await take(requestRunFile(id, number), reference?.recordSha256);
      validateRequestRunRecord(entry.record, id, records.at(-1) ?? null);
      if (entry.record.project !== project || reference && !equal(requestRunReference(entry.record, entry.sha256), reference))
        fail('The committed run summary differs from its original checkpoint.', 409);
      if (number === 1) {
        selectedSet = await takeSet(entry.record.requestSetId);
        const admission = await draft(entry.record.startRequest.expectedRevision);
        if (selectedSet.sha256 !== entry.record.requestSetSha256 ||
            selectedSet.record.draftRevision !== entry.record.draftRevision || selectedSet.record.inputDigest !== entry.record.inputDigest ||
            admission.inputDigest !== entry.record.inputDigest || !(admission.requestSets ?? []).some(item =>
              item.id === selectedSet.record.id && item.recordSha256 === selectedSet.sha256))
          fail('The run changed its original saved-set admission.', 409);
      }
      for (const item of entry.record.cases) {
        const sourceCase = selectedSet.record.cases.find(value => value.id === item.id);
        if (!sourceCase) fail('A run case is absent from its original request set.', 409);
        if (item.state !== 'COMPLETED') continue;
        const filename = 'previews/' + item.previewId + '.json', complete = await take(filename, item.reference.recordSha256);
        verifyRunPreviewRecord(entry.record, sourceCase, complete.record, complete.sha256, item.reference);
        if (complete.record.id !== item.previewId) fail('The original run preview UUID changed.', 409);
        native.set(item.previewId, complete);
      }
      records.push(entry); generationCount++;
    }
    const latestRecord = records.at(-1).record;
    // Include the original request/response files that survived before a run
    // checkpoint could attach. They keep receiving from repeating that request.
    for (const item of latestRecord.cases) {
      const sourceCase = selectedSet.record.cases.find(value => value.id === item.id);
      const completeName = 'previews/' + item.previewId + '.json';
      if (!native.has(item.previewId)) {
        const bytes = await maybe(completeName);
        if (bytes) {
          const complete = add(completeName, bytes);
          verifyRunPreviewRecord(latestRecord, sourceCase, complete.record, complete.sha256);
          if (complete.record.id !== item.previewId) fail('The original run preview UUID changed.', 409);
          native.set(item.previewId, complete);
        }
      }
      const pendingName = 'previews/' + item.previewId + '.pending.json', bytes = await maybe(pendingName);
      if (bytes) {
        const original = add(pendingName, bytes);
        verifyRunPendingRecord(latestRecord, sourceCase, item.previewId, original.record);
        pending.set(item.previewId, original);
      }
      if (item.state !== 'PENDING' && !native.has(item.previewId) && !pending.has(item.previewId))
        fail('The request closure lost an already-started original case.', 409);
    }
    const entries = await auxiliary(latestRecord), originals = new Map();
    for (const entry of entries) {
      const value = validateRunAuxiliaryRecord(entry.record, latestRecord, entry.name), request = value.request;
      if (value.schema.endsWith('attempt.v1') &&
          (request.expectedRevision > revision || value.kind === 'continue' && request.expectedGeneration > maximum))
        continue;
      if (value.schema.endsWith('attempt.v1') && !entry.name.endsWith('.done.json')) originals.set(value.id, entry);
    }
    for (const entry of entries) {
      const value = entry.record;
      if (value.schema.endsWith('attempt.v1')) {
        const original = originals.get(value.id);
        if (!original) continue;
        if (!equal(original.record.request, value.request) || original.record.requestSha256 !== value.requestSha256)
          fail('A run attempt completion changed its original request.', 409);
        if (entry.name.endsWith('.done.json') && value.result?.generation > maximum) continue;
      } else if (!originals.has(value.request.attemptId)) continue;
      add(entry.name, entry.raw); actions.set(entry.name, entry);
    }
    runs.set(id, { records, record: latestRecord, sha256: records.at(-1).sha256,
      selectedGeneration: chosen, selectedSet: selectedSet.record });
  }
  return { project, revision, files, sets, runs, native, pending, actions,
    counts: { requestSets: sets.size, requestRuns: runs.size, requestRunGenerations: generationCount,
      requestNativePreviews: native.size, requestPendingPreviews: pending.size, requestActions: actions.size } };
}

export async function collectNativeRequestClosure(store, versions, options = {}) {
  const ids = options.scope?.runId ? new Set([options.scope.runId]) : options.scope?.requestSetId ? new Set()
    : new Set(versions.flatMap(saved => (saved.requestRuns ?? []).map(item => item.id)));
  if (store.requestRunsActive?.([...ids])) fail('Pause the selected connected run and wait for its original response to finish before exporting its files.', 409);
  const version = store.requestRunsVersion?.([...ids]);
  const selected = versions.at(-1), current = await store.read(selected.id);
  const result = await collectRequestClosure(versions, {
    ...options,
    includeUnattached: !options.scope && current.revision === selected.revision,
    load: async (name, sha256) => (await readRequestFile(store, name, sha256, 8 * 1024 * 1024)).raw,
    maybe: name => missing(async () => (await readRequestFile(store, name, undefined, 3 * 1024 * 1024)).raw),
    generations: async id => {
      const items = await missing(() => readdir(join(store.root, 'request-runs', id), { withFileTypes: true })) ?? [];
      return items.filter(item => item.isFile() && /^[1-9]\d*\.json$/.test(item.name))
        .map(item => Number(item.name.slice(0, -5))).filter(number => number <= 256);
    },
    auxiliary: run => runAuxiliaryFiles(store, run),
  });
  if (store.requestRunsActive?.([...ids]) || store.requestRunsVersion?.([...ids]) !== version)
    fail('The selected original run advanced while its file snapshot was being prepared. Pause it, then prepare the complete selection again.', 409);
  return result;
}

function page(closure, selection, index) {
  const groups = [...closure.sets.values()].map(item => '<section><h2>' + escape(item.record.title) + '</h2><p>' +
    escape(item.record.notes) + '</p><p>Original source revision ' + item.record.draftRevision + ' · ' +
    item.record.cases.length + ' saved cases</p><table><thead><tr><th>Case</th><th>Operation</th><th>Variables</th></tr></thead><tbody>' +
    item.record.cases.map(row => '<tr><td>' + escape(row.title) + '<br><small>' + escape(row.id) + '</small></td><td>' +
      escape(row.operation) + '</td><td><pre>' + escape(JSON.stringify(row.variables, null, 2)) + '</pre></td></tr>').join('') +
    '</tbody></table></section>').join('');
  const runs = [...closure.runs.values()].map(item => '<section><h2>' + escape(item.record.title) + '</h2><p>' +
    escape(item.record.state) + ' · generation ' + item.record.generation + ' · original run ' + escape(item.record.id) + '</p>' +
    item.record.cases.map(row => {
      const complete = closure.native.get(row.previewId)?.record, pending = closure.pending.has(row.previewId);
      const actual = complete ? 'Original response retained' : pending ? 'Original request retained; complete response unavailable' : 'Not started';
      const interval = complete ? Date.parse(complete.completedAt) - Date.parse(complete.createdAt) : null;
      return '<article><h3>' + escape(row.id) + '</h3><p>' + escape(actual) + '</p><p>Preview ' + escape(row.previewId) + '</p>' +
        (complete ? '<p>HTTP ' + complete.status + ' · ' + complete.responseBytes + ' bytes · ' + escape(complete.responseType) + '</p>' +
          '<p>Observed record interval: ' + (Number.isFinite(interval) && interval >= 0 ? interval + ' ms' : 'unavailable') +
          '. Includes admission, transport and retention; this is not a causal performance comparison.</p>' +
          '<p><a href="responses/' + row.previewId + '.bin">Exact returned body</a> · <a href="previews/' +
          row.previewId + '.json">Original response record</a></p>' : '') +
        (pending ? '<p><a href="previews/' + row.previewId + '.pending.json">Original admitted request</a></p>' : '') + '</article>';
    }).join('') + '</section>').join('');
  return Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>Saved GraphQL requests</title><style>body{font:15px system-ui,sans-serif;max-width:1150px;margin:32px auto;padding:0 20px;color:#202326;background:#fff}' +
    'table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #ccc;text-align:left;vertical-align:top;padding:10px;overflow-wrap:anywhere}' +
    'pre{white-space:pre-wrap;overflow-wrap:anywhere}section{margin:28px 0}article{border-top:1px solid #ccc;padding:14px 0}a{color:inherit}small{color:#555}</style>' +
    '<h1>Saved GraphQL requests and original runs</h1><p>Project ' + escape(selection.project) + ' · saved revision ' + selection.revision +
    '</p><p><a href="request-files.json">Complete original file index</a></p><p>This packet contains selected source and response files. ' +
    'Use the full project handover to reopen the project for editing. No provider request runs when this document opens.</p>' +
    groups + runs + '<h2>Retained files</h2><ul>' + index.files.map(file => '<li><a href="' + escape(file.name) + '">' +
      escape(file.name) + '</a> · ' + file.bytes + ' bytes</li>').join('') + '</ul></html>');
}

export async function describeRequestFiles(store, selection) {
  const saved = await store.read(selection.project, selection.revision), versions = [];
  for (let revision = 1; revision <= saved.revision; revision++) versions.push(await store.read(saved.id, revision));
  const scope = selection.runId ? { runId: selection.runId, ...(selection.generation ? { generation: selection.generation } : {}) }
    : { requestSetId: selection.requestSetId };
  const closure = await collectNativeRequestClosure(store, versions, { scope });
  const loaders = new Map();
  const add = (name, raw, contentType) => loaders.set(name, { file: { ...info(name, raw), ...(contentType ? { contentType } : {}) }, load: async () => raw });
  for (const [name, item] of closure.files) add(name, item.raw);
  const draftNumbers = new Set([...closure.sets.values()].map(item => item.record.draftRevision));
  for (const value of closure.runs.values()) draftNumbers.add(value.record.startRequest.expectedRevision);
  for (const item of closure.actions.values()) if (Number.isSafeInteger(item.record.request.expectedRevision))
    draftNumbers.add(item.record.request.expectedRevision);
  for (const revision of [...draftNumbers].sort((a, b) => a - b)) {
    const name = 'projects/' + saved.id + '/' + revision + '.json';
    add(name, (await readRequestFile(store, name, undefined, 8 * 1024 * 1024)).raw);
  }
  for (const [id, item] of closure.native) add('responses/' + id + '.bin',
    Buffer.from(item.record.responseBase64, 'base64'), item.record.responseType);
  const source = { requestSetId: selection.requestSetId ?? closure.runs.get(selection.runId)?.record.requestSetId,
    ...(selection.runId ? { runId: selection.runId, generation: closure.runs.get(selection.runId).record.generation } : {}),
    counts: closure.counts, providerRequests: 0 };
  const index = { schema: REQUEST_FILES_SCHEMA, selection, source,
    files: [...loaders.values()].map(item => item.file).sort((a, b) => a.name.localeCompare(b.name)) };
  add('request-files.json', requestJson(index)); add('index.html', page(closure, selection, index), 'text/html; charset=utf-8');
  return { loaders, source, index };
}

/** Create a complete local packet with original no-replace file publication. */
export async function prepareRequestPacket(store, selection) {
  const value = await describeRequestFiles(store, selection);
  const files = [...value.loaders.values()].map(item => item.file).sort((a, b) => a.name.localeCompare(b.name));
  if (files.length > 512 || files.reduce((sum, file) => sum + file.bytes, 0) > 256_000_000)
    fail('The complete selected request packet exceeds the original file transport bounds.');
  const packetSha256 = digest(requestJson({ selection, files }));
  const relativeDirectory = 'request-packets/' + packetSha256;
  for (const [name, item] of value.loaders) await writeRequestBytes(store, relativeDirectory + '/' + name, await item.load());
  return { state: 'PREPARED', selection, packetSha256, directory: join(store.root, relativeDirectory),
    source: value.source, files };
}
