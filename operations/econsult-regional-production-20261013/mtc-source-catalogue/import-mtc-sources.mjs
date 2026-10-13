#!/usr/bin/env node
// MIT. Receive a complete published MTC source selection into the maintained catalogue.
import { readFile, lstat, realpath, open, link, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (ok, message) => { if (!ok) throw new Error(message); };
async function optional(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function original(file, expected) {
  const stat = await lstat(file);
  fail(stat.isFile() && !stat.isSymbolicLink(), 'Select an ordinary original source: ' + file);
  fail(stat.size === expected.bytes, 'Original source size changed: ' + expected.filename);
  const bytes = await readFile(file);
  fail(bytes.length === expected.bytes, 'Original source changed while reading: ' + expected.filename);
  if (expected.sha256) fail(sha(bytes) === expected.sha256, 'Original source hash changed: ' + expected.filename);
  if (expected.contentType === 'application/pdf')
    fail(bytes.subarray(0, 5).toString('ascii') === '%PDF-', 'The selected original is not a PDF: ' + expected.filename);
  return bytes;
}
async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function immutableBytes(file, bytes) {
  const parent = dirname(file), temporary = join(parent, '.' + randomUUID() + '.partial');
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, file); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await lstat(file);
      fail(stat.isFile() && !stat.isSymbolicLink() && (await readFile(file)).equals(bytes),
        'The retained delivery differs: ' + file);
    }
    await syncDirectory(parent);
  } finally {
    if (handle) await handle.close();
    try { await unlink(temporary); await syncDirectory(parent); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export async function importMtcSources({ fredRoot, project, directory, originals }) {
  const host = await realpath(resolve(fredRoot));
  project = await realpath(resolve(project));
  const { privateDirectory, atomicJson } = await import(pathToFileURL(join(host, '../routescan/quota.mjs')).href);
  const { readFredProject, exportFredProject, receiveFredProject } = await import(pathToFileURL(join(host, 'project.mjs')).href);
  const { runResearchAction, researchSourceDownload } =
    await import(pathToFileURL(join(host, 'research/project.mjs')).href);
  const { definition, normalizeProduct, canonical, digest, importDefinitions, catalogue, sourceStatus, exportDefinitions } =
    await import(pathToFileURL(join(host, 'research/model.mjs')).href);
  directory = await privateDirectory(resolve(directory));
  originals = await realpath(resolve(originals));
  const inputBytes = await readFile(join(here, 'catalogue-input.json'));
  const input = JSON.parse(inputBytes);
  fail(input.schema === 'commons.mtc-catalogue-import.v1', 'Use the complete maintained MTC input.');
  const definitions = input.definitions.map(definition);
  const product = normalizeProduct(input.product);
  fail(definitions.length === 3 && input.sources.length === 3, 'Retain all three original source roles.');
  fail(new Set(definitions.map(d => d.entryId)).size === 3, 'Source identities repeat.');
  const csv = await readFile(join(here, 'catalogue-definitions.csv'), 'utf8');
  fail(canonical(importDefinitions(csv)) === canonical(definitions), 'CSV and JSON catalogue definitions differ.');
  const initial = await readFredProject(project);
  // Read all original bytes before the first catalogue mutation.
  const sourceFiles = [];
  for (const source of input.sources) {
    fail(source.filename && !/[\\/\r\n]/.test(source.filename), 'Use a single original filename.');
    const file = source.contentType === 'application/json' ? join(here, source.filename) : join(originals, source.filename);
    const bytes = await original(file, source);
    const definitionValue = definitions.find(d => d.entryId === source.entryId);
    fail(definitionValue && definitionValue.url === source.sourceUrl, 'Original source URL/definition differs.');
    sourceFiles.push({ selection: source, bytes, sha256: sha(bytes) });
  }
  const identity = {
    schema: 'commons.mtc-catalogue-receiving-selection.v1',
    operation: input.operation, projectId: initial.id,
    inputSha256: sha(inputBytes), productDefinitionSha256: digest(product),
    sources: sourceFiles.map(({ selection, sha256 }) => ({
      entryId: selection.entryId, definitionId: digest(definitions.find(d => d.entryId === selection.entryId)),
      sourceUrl: selection.sourceUrl, stableReference: selection.stableReference,
      originalFileUploadId: selection.originalFileUploadId,
      filename: selection.filename, bytes: selection.bytes, sha256
    }))
  };
  const originalDirectory = await privateDirectory(join(directory, 'originals'));
  const originalFiles = [];
  for (const source of sourceFiles) {
    const originalPath = join(originalDirectory, source.selection.filename);
    await immutableBytes(originalPath, source.bytes);
    originalFiles.push({ filename: source.selection.filename, path: originalPath,
      bytes: source.bytes.length, sha256: source.sha256 });
  }
  const selectionPath = join(directory, 'source-selection.json');
  let retainedSelection = await optional(selectionPath);
  if (!retainedSelection) {
    const cat = catalogue(initial);
    const selected = { identity, receivedAt: new Date().toISOString(),
      originalSelections: {
        entries: Object.fromEntries(definitions.map(d => [d.entryId, cat.entries.find(e => e.id === d.entryId)?.currentId ?? null])),
        product: cat.products.find(p => p.id === product.productId)?.currentId ?? null
      } };
    try { await atomicJson(directory, 'source-selection.json', selected, { exclusive: true }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    retainedSelection = await optional(selectionPath);
  }
  fail(retainedSelection && canonical(retainedSelection.identity) === canonical(identity),
    'Continue the same original project and complete source selection.');
  // File upload timestamps describe this local receiving event, not a fabricated agency HTTP receipt.
  const receivedAt = retainedSelection.receivedAt;
  fail(retainedSelection.originalSelections?.entries &&
    Object.hasOwn(retainedSelection.originalSelections, 'product'), 'Retain the original selected definitions.');
  function assumptions(state, body) {
    fail(state.id === identity.projectId, 'The selected project identity changed.');
    const cat = catalogue(state);
    if (body.action === 'research-import') for (const d of definitions) {
      const selected = cat.entries.find(e => e.id === d.entryId)?.currentId ?? null;
      fail(selected === retainedSelection.originalSelections.entries[d.entryId] || selected === digest(d),
        'A selected source definition changed; preserve it and reconcile this original import.');
    }
    if (body.action === 'research-source-upload') {
      fail(cat.entries.find(e => e.id === body.entryId)?.currentId === body.definitionId,
        'The upload source definition changed; preserve that current edition.');
    }
    if (body.action === 'research-product-save') {
      const selected = cat.products.find(p => p.id === product.productId)?.currentId ?? null;
      fail(selected === retainedSelection.originalSelections.product || selected === digest(product),
        'The research product changed; preserve it and reconcile this original import.');
      for (const d of definitions) fail(cat.entries.find(e => e.id === d.entryId)?.currentId === digest(d),
        'A product source definition changed before this original product was saved.');
    }
  }
  const actions = await privateDirectory(join(directory, 'actions'));
  const actionId = name => 'mtc-' + digest({ operation: input.operation, name });
  async function repairLegacyRequest(path, name, request, body) {
    const legacyId = input.operation + ':' + name;
    if (request?.id === actionId(name)) return request;
    fail(request?.id === legacyId &&
      canonical(Object.fromEntries(Object.entries(request).filter(([key]) => !['id','expectedRevision'].includes(key)))) === canonical(body),
      'The retained original request differs: ' + name);
    const state = await readFredProject(project);
    fail(state.id === identity.projectId && !state.operations.some(op => op.id === legacyId) &&
      state.pending?.id !== legacyId, 'Preserve the committed or pending original request identity.');
    const predecessor = await readFile(path);
    fail(canonical(JSON.parse(predecessor)) === canonical(request), 'The original saved request changed during recovery.');
    await immutableBytes(join(actions, name + '.native-id-predecessor.json'), predecessor);
    const corrected = { ...request, id: actionId(name) };
    fail((await readFile(path)).equals(predecessor), 'The original request changed during recovery.');
    await atomicJson(actions, name + '.json', corrected);
    return corrected;
  }
  async function act(name, body) {
    const path = join(actions, name + '.json');
    let request = await optional(path);
    if (!request) {
      const state = await readFredProject(project);
      fail(state.id === identity.projectId, 'The selected project identity changed.');
      if (state.pending) fail(state.pending.id === actionId(name),
        'Finish the current original project action before this source import.');
      const proposed = { ...body, id: actionId(name), expectedRevision: state.revision };
      try { await atomicJson(actions, name + '.json', proposed, { exclusive: true }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      request = await optional(path);
    }
    if (request && request.id !== actionId(name)) request = await repairLegacyRequest(path, name, request, body);
    fail(request && request.id === actionId(name) &&
      canonical(Object.fromEntries(Object.entries(request).filter(([key]) => !['id','expectedRevision'].includes(key)))) === canonical(body),
      'The retained original request differs: ' + name);
    let dispatch = request;
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await readFredProject(project);
      const completed = current.operations.find(op => op.id === request.id);
      if (!completed && !current.pending) assumptions(current, body);
      if (!completed && current.pending) {
        fail(current.pending.id === request.id && current.pending.kind === body.action,
          'Finish the current original pending project action before this import.');
        dispatch = { ...request, expectedRevision: current.pending.expectedRevision };
      }
      try { return await runResearchAction({ directory: project, request: dispatch }); }
      catch (error) {
        if (error.code !== 'FRED_REVISION_CONFLICT') throw error;
        // The original transaction fingerprints kind/payload, not expectedRevision.
        // A known pre-commit conflict can receive a new dispatch revision under the same ID/body.
        const after = await readFredProject(project);
        fail(after.id === identity.projectId, 'The selected project identity changed.');
        if (after.operations.some(op => op.id === request.id)) {
          dispatch = request;
          continue;
        }
        if (after.pending) {
          fail(after.pending.id === request.id && after.pending.kind === body.action,
            'An unrelated original action is pending; continue it before this import.');
          dispatch = { ...request, expectedRevision: after.pending.expectedRevision };
          continue;
        }
        assumptions(after, body);
        dispatch = { ...request, expectedRevision: after.revision };
        const nameRevision = name + '.revision-' + after.revision + '.json';
        const record = { reason: 'established-precommit-revision-conflict', originalId: request.id,
          originalExpectedRevision: request.expectedRevision, request: dispatch };
        try { await atomicJson(actions, nameRevision, record, { exclusive: true }); }
        catch (saveError) { if (saveError.code !== 'EEXIST') throw saveError; }
        const revisionPath = join(actions, nameRevision);
        const savedRevision = await optional(revisionPath);
        if (savedRevision?.originalId === input.operation + ':' + name &&
            savedRevision.request?.id === input.operation + ':' + name) {
          const correctedRevision = { ...savedRevision, originalId: request.id,
            request: { ...savedRevision.request, id: request.id } };
          fail(canonical(correctedRevision) === canonical(record),
            'The complete original dispatch revision differs from this source import.');
          const priorRevisionBytes = await readFile(revisionPath);
          fail(canonical(JSON.parse(priorRevisionBytes)) === canonical(savedRevision),
            'The original dispatch revision changed during recovery.');
          await immutableBytes(join(actions, nameRevision + '.native-id-predecessor.json'), priorRevisionBytes);
          fail((await readFile(revisionPath)).equals(priorRevisionBytes),
            'The original dispatch revision changed during recovery.');
          await atomicJson(actions, nameRevision, correctedRevision);
        }
        fail(canonical(await optional(revisionPath)) === canonical(record),
          'The retained dispatch revision differs from this original request.');
      }
    }
    throw Object.assign(new Error('The project kept changing; resume the same retained source import.'),
      { code: 'FRED_REVISION_CONFLICT' });
  }
  const results = [];
  results.push({ step: 'catalogue-definitions', result: await act('definitions',
    { action: 'research-import', definitions }) });
  for (const source of sourceFiles) {
    const entryId = source.selection.entryId;
    results.push({ step: entryId, result: await act('source-' + entryId, {
      action: 'research-source-upload', entryId, definitionId: identity.sources.find(s => s.entryId === entryId).definitionId,
      filename: source.selection.filename, contentType: source.selection.contentType,
      bodyBase64: source.bytes.toString('base64'), retrievedAt: receivedAt
    }) });
  }
  results.push({ step: 'research-product', result: await act('product',
    { action: 'research-product-save', definition: product }) });
  const bundle = await exportFredProject({ directory: project });
  fail(bundle.state.id === identity.projectId, 'The full export changed project identity.');
  const cat = catalogue(bundle.state), receivedSources = [];
  for (const source of sourceFiles) {
    const entryId = source.selection.entryId;
    const operation = bundle.state.operations.find(op => op.id === actionId('source-' + entryId));
    const snapshotId = operation?.result?.source?.id;
    const retained = bundle.research?.sources.find(item => item.id === snapshotId);
    const selected = identity.sources.find(item => item.entryId === entryId);
    fail(operation?.kind === 'research-source-upload' && retained &&
      retained.entryId === entryId && retained.definitionId === selected.definitionId &&
      retained.sha256 === selected.sha256 && retained.bytes === selected.bytes &&
      retained.requestedUrl === selected.sourceUrl &&
      Buffer.from(retained.bodyBase64, 'base64').equals(source.bytes),
      'The full exported edition lost its original received source: ' + source.selection.filename);
    const downloaded = await researchSourceDownload(project, snapshotId);
    fail(downloaded.bytes.equals(source.bytes), 'Original retained download differs: ' + source.selection.filename);
    receivedSources.push({ entryId, snapshotId, definitionId: retained.definitionId,
      bytes: retained.bytes, sha256: retained.sha256 });
  }
  const view = { projectId: bundle.state.id, revision: bundle.state.revision, asOf: receivedAt,
    receivedSources, rows: definitions.map(d => sourceStatus(cat, d.entryId, receivedAt)),
    products: cat.products.filter(p => p.id === product.productId),
    counts: { entries: cat.entries.length, sources: cat.sources.length, reviews: cat.reviews.length,
      products: cat.products.length, bytes: cat.sources.reduce((total, item) => total + item.bytes, 0) } };
  const bundleBytes = Buffer.from(JSON.stringify(bundle, null, 2) + '\n');
  // Project exports are content-addressed: later unrelated project work gets its own full edition.
  const exportName = 'economic-project-' + bundle.bundleSha256 + '.json';
  await immutableBytes(join(directory, exportName), bundleBytes);
  const fullCsv = exportDefinitions(cat);
  await immutableBytes(join(directory, 'catalogue-' + sha(Buffer.from(fullCsv)) + '.csv'), Buffer.from(fullCsv));
  const receivingDirectory = await privateDirectory(join(directory, 'received-' + bundle.bundleSha256));
  const received = await receiveFredProject({ directory: receivingDirectory, bundle });
  const reopened = await exportFredProject({ directory: receivingDirectory });
  fail(reopened.bundleSha256 === bundle.bundleSha256 && canonical(reopened) === canonical(bundle),
    'Independent whole-project receiving changed the original economic project.');
  for (const source of sourceFiles) {
    const selected = receivedSources.find(item => item.entryId === source.selection.entryId);
    const reopenedSource = await researchSourceDownload(receivingDirectory, selected.snapshotId);
    fail(reopenedSource.bytes.equals(source.bytes),
      'The independently reopened project lost an original MTC source: ' + source.selection.filename);
  }
  const reopenedName = 'received-economic-project-' + bundle.bundleSha256 + '.json';
  const reopenedBytes = Buffer.from(JSON.stringify(reopened, null, 2) + '\n');
  await immutableBytes(join(directory, reopenedName), reopenedBytes);
  const independentReceiving = { directory: receivingDirectory, projectId: received.projectId,
    revision: reopened.state.revision, bundleSha256: reopened.bundleSha256,
    filename: reopenedName, bytes: reopenedBytes.length, sha256: sha(reopenedBytes) };
  const previousReceipt = await optional(join(directory, 'receiving-result.json'));
  if (previousReceipt?.fullProject?.sha256 === sha(bundleBytes) &&
      canonical(previousReceipt.identity) === canonical(identity) &&
      canonical(previousReceipt.independentReceiving) === canonical(independentReceiving) &&
      canonical(previousReceipt.originalFiles) === canonical(originalFiles)) {
    console.log(JSON.stringify({ event: 'mtc_sources_received', projectId: previousReceipt.projectId,
      revision: previousReceipt.revision, sourceCount: sourceFiles.length, fullProject: previousReceipt.fullProject }));
    return previousReceipt;
  }
  const receipt = {
    schema: 'commons.mtc-catalogue-receiving.v1', identity, independentReceiving, originalFiles,
    completedAt: new Date().toISOString(), projectId: bundle.state.id, revision: bundle.state.revision,
    catalogue: view, results, fullProject: { filename: exportName, bytes: bundleBytes.length,
      sha256: sha(bundleBytes), bundleSha256: bundle.bundleSha256 },
    reviewState: 'Sources retained in the existing catalogue; use its original source review and issue controls.'
  };
  await atomicJson(directory, 'receiving-result.json', receipt);
  console.log(JSON.stringify({ event: 'mtc_sources_received', projectId: receipt.projectId,
    revision: receipt.revision, sourceCount: sourceFiles.length, fullProject: receipt.fullProject }));
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = {};
  for (let i=2; i<process.argv.length; i+=2) {
    fail(['--fred-root','--project','--directory','--originals'].includes(process.argv[i]) && process.argv[i+1],
      'Use --fred-root FRED --project EXISTING_PROJECT --directory RECEIVING --originals ORIGINAL_PDFS');
    fail(!Object.hasOwn(args, process.argv[i]), 'Do not repeat a selected path.');
    args[process.argv[i]] = process.argv[i+1];
  }
  fail(Object.keys(args).length === 4, 'Select all four complete paths.');
  importMtcSources({ fredRoot: args['--fred-root'], project: args['--project'],
    directory: args['--directory'], originals: args['--originals'] }).catch(error => {
    console.error(JSON.stringify({ code: error.code ?? 'MTC_IMPORT_FAILED', message: error.message }));
    process.exitCode = 1;
  });
}
