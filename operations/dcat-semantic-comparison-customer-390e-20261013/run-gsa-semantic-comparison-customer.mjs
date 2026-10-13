// MIT. Continue the original completed GSA semantic workspace with saved graph comparisons.
import { readFile, writeFile, mkdir, stat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const PREFIX = 'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan';
const OPERATION = 'DCAT-SEMANTIC-COMPARISON-390E-20261013';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const TERMINAL = new Set(['COMPLETE', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
const sha = value => createHash('sha256').update(value).digest('hex');
const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const same = (a, b) => sha(encoded(a)) === sha(encoded(b));
const need = (ok, code, message = code) => { if (!ok) throw Object.assign(new Error(message), { code }); };
const safeError = error => ({ code: error?.code ?? error?.name ?? 'COMPARISON_CUSTOMER_FAILED',
  message: String(error?.message ?? error).slice(0, 4000) });
async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function once(path, raw) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { await writeFile(path, raw, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    need((await readFile(path)).equals(raw), 'COMPARISON_CUSTOMER_OUTPUT_CHANGED', path);
  }
}
function normalizedDcat(value) {
  const result = structuredClone(value);
  if (result.semantic) {
    result.semantic.comparisons ??= [];
    result.semantic.comparisonReviews ??= [];
  }
  return result;
}
function originalValidation(value) {
  const result = normalizedDcat(value);
  if (result.semantic) { delete result.semantic.comparisons; delete result.semantic.comparisonReviews; }
  return result;
}
function reviewNote(name) {
  return OPERATION + ' / ' + name + ': Received the exact saved graph pair, complete graph-difference artifacts, ' +
    'and bounded relationship-impact evidence. This acknowledgement records inspection; it does not approve a catalogue ' +
    'release, modify the source validation runs, or turn a limited impact traversal into a complete impact claim.';
}
const RECIPIENT_NOTE = OPERATION + ' / recipient: Independently received and cold-reopened the complete comparison ' +
  'workspace, original snapshots, typed changes, impact files and review chain. This local acknowledgement extends ' +
  'receiving history without changing the sender, validation results or catalogue release.';
/**
 * Reuses semanticOutputDirectory/result.json and its original producer workspace.
 * No migration, profile import, snapshot or SHACL operation is repeated.
 * outputDirectory must be a separate private directory for this continuation.
 */
export async function runDcatSemanticComparisonCustomer({
  sourceRoot, semanticOutputDirectory, outputDirectory, python,
  expectedValidationResultSha256, sourceCommit = null,
  limits = { timeout_seconds: 600, memory_mib: 2048 },
} = {}) {
  for (const path of [sourceRoot, semanticOutputDirectory, outputDirectory, python])
    need(typeof path === 'string' && isAbsolute(path), 'COMPARISON_CUSTOMER_ABSOLUTE_PATH_REQUIRED');
  need(HASH.test(expectedValidationResultSha256 ?? ''), 'COMPARISON_CUSTOMER_VALIDATION_HASH_REQUIRED');
  need(Number.isSafeInteger(limits.timeout_seconds) && limits.timeout_seconds >= 5 && limits.timeout_seconds <= 600 &&
    Number.isSafeInteger(limits.memory_mib) && limits.memory_mib >= 256 && limits.memory_mib <= 4096,
    'COMPARISON_CUSTOMER_LIMITS_INVALID');
  limits = { timeout_seconds: limits.timeout_seconds, memory_mib: limits.memory_mib };
  sourceRoot = resolve(sourceRoot); semanticOutputDirectory = resolve(semanticOutputDirectory);
  outputDirectory = resolve(outputDirectory);
  const producerDirectory = join(semanticOutputDirectory, 'producer'), recipientDirectory = join(outputDirectory, 'recipient');
  need(outputDirectory !== semanticOutputDirectory && outputDirectory !== producerDirectory &&
    !outputDirectory.startsWith(producerDirectory + '/'), 'COMPARISON_CUSTOMER_SEPARATE_OUTPUT_REQUIRED');
  const ckan = join(sourceRoot, PREFIX);
  const files = await import(pathToFileURL(join(ckan, '../postgres/publisher/files.mjs')).href);
  const { openCkanWorkbench } = await import(pathToFileURL(join(ckan, 'model.mjs')).href);
  const { receiveCkanWorkspaceArchive } = await import(pathToFileURL(join(ckan, 'archive.mjs')).href);
  const { validateDcatSemanticFiles } = await import(pathToFileURL(join(ckan, 'dcat-semantic.mjs')).href);
  await files.privateDirectory(outputDirectory, true);
  const out = outputDirectory, environment = { ...process.env, SCF_DCAT_SEMANTIC_PYTHON: python };
  const validationRaw = await files.readPrivate(join(semanticOutputDirectory, 'result.json'), 33554432);
  need(sha(validationRaw) === expectedValidationResultSha256, 'COMPARISON_CUSTOMER_VALIDATION_RESULT_CHANGED');
  const validation = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(validationRaw));
  need(validation.schema === 'commons.dcat-semantic-customer-result.v1' && validation.complete === true &&
    validation.operation === 'DCAT-SEMANTIC-VALIDATION-390E-20261013' && validation.cases?.length === 2 &&
    validation.cleanup?.length && validation.cleanup.every(row => row.closed === true),
    'COMPARISON_CUSTOMER_COMPLETE_VALIDATION_REQUIRED');
  const originals = {};
  for (const row of validation.cases) {
    need(['legacy', 'current'].includes(row.name) && !originals[row.name] && row.status === 'COMPLETE' &&
      row.originalRecords === 344 && UUID.test(row.runId) && HASH.test(row.runSha256) &&
      UUID.test(row.profileId) && HASH.test(row.profileSha256), 'COMPARISON_CUSTOMER_ORIGINAL_CASE_CHANGED');
    originals[row.name] = row;
  }
  need(originals.legacy && originals.current, 'COMPARISON_CUSTOMER_ORIGINAL_PAIR_REQUIRED');
  const originalSelection = await files.readJson(join(semanticOutputDirectory, 'selection.json'), 33554432);
  need(originalSelection.schema === 'commons.dcat-semantic-customer-selection.v1' &&
    resolve(originalSelection.producerDirectory) === producerDirectory &&
    originalSelection.binding && originalSelection.baseIRI,
    'COMPARISON_CUSTOMER_ORIGINAL_PROJECT_CHANGED');
  const declared = { schema: 'commons.dcat-semantic-comparison-customer-selection.v1', operation: OPERATION,
    sourceRoot, declaredSourceCommit: sourceCommit, semanticOutputDirectory, producerDirectory,
    recipientDirectory, outputDirectory, python, limits, expectedValidationResultSha256,
    originalBinding: originalSelection.binding, originalBaseIRI: originalSelection.baseIRI,
    before: { runId: originals.legacy.runId, runSha256: originals.legacy.runSha256 },
    after: { runId: originals.current.runId, runSha256: originals.current.runSha256 } };
  await once(join(out, 'selection.json'), encoded(declared));
  await once(join(out, 'original-validation-result.json'), validationRaw);
  let ledger = { schema: 'commons.dcat-semantic-comparison-customer-progress.v1', operation: OPERATION, phases: {} };
  if (await exists(join(out, 'progress.json'))) ledger = await files.readJson(join(out, 'progress.json'), 67108864);
  else need(!(await exists(join(out, 'producer-before-comparisons.json'))),
    'COMPARISON_CUSTOMER_PROGRESS_MISSING', 'This continuation already has a saved project baseline. Restore its original progress journal before dispatching another operation.');
  need(ledger.schema === 'commons.dcat-semantic-comparison-customer-progress.v1' && ledger.operation === OPERATION,
    'COMPARISON_CUSTOMER_PROGRESS_CHANGED');
  const persist = () => files.atomicJson(out, 'progress.json', ledger);
  const save = (name, value) => files.atomicJson(out, name, value);
  await persist();
  const result = { schema: 'commons.dcat-semantic-comparison-customer-result.v1', operation: OPERATION,
    startedAt: new Date().toISOString(), complete: false, validationResultSha256: expectedValidationResultSha256,
    originalBinding: declared.originalBinding, originalBaseIRI: declared.originalBaseIRI,
    source: [], scenarios: [], downloads: [], assertions: [], archive: null, receiving: null,
    coldReopen: null, recipientReview: null, followingArchive: null, errors: [], cleanup: [] };
  let producer = null, recipient = null;
  async function closeOwner(name) {
    const model = name === 'producer' ? producer : recipient;
    if (!model) return;
    try {
      await model.close(); result.cleanup.push({ owner: name, closed: true, at: new Date().toISOString() });
      if (name === 'producer') producer = null; else recipient = null;
    } catch (error) {
      result.cleanup.push({ owner: name, closed: false, error: safeError(error) }); throw error;
    }
  }
  const inventory = async (model, collection) => collection === 'archives'
    ? await model.workspaceArchives() : model.status().dcat.semantic[collection] ?? [];
  // A durable intent precedes dispatch. A lost launch reply is recovered only through
  // the original operation's exact returned ID, never by guessing that a request was absent.
  async function phase({ name, model, kind, collection, selectionKey, request, start, get, matches }) {
    let entry = ledger.phases[name];
    if (!entry) {
      need(!model.status().active, 'COMPARISON_CUSTOMER_OWNER_BUSY');
      const rows = await inventory(model, collection);
      entry = { request, requestSha256: sha(encoded(request)), kind, collection, selectionKey,
        priorIds: rows.map(row => row.id), beforeOperationId: model.status().operation?.id ?? null,
        preparedAt: new Date().toISOString(), complete: false };
      ledger.phases[name] = entry; await persist();
      const started = start(entry.request);
      need(started && UUID.test(started.id) && started.completion, 'COMPARISON_CUSTOMER_LAUNCH_REQUIRED');
      entry.selection = Object.fromEntries(Object.entries(started).filter(([key]) => key !== 'completion'));
      await persist();
      const operation = await started.completion;
      await save('operation-' + operation.id + '.json', operation);
      need(operation.id === entry.selection.id && operation.kind === kind, 'COMPARISON_CUSTOMER_OPERATION_CHANGED');
      entry.operation = operation; await persist();
    } else {
      need(entry.kind === kind && entry.collection === collection && entry.selectionKey === selectionKey &&
        sha(encoded(entry.request)) === entry.requestSha256, 'COMPARISON_CUSTOMER_PHASE_CHANGED');
    }
    let id = entry.result?.id ?? (selectionKey ? entry.selection?.[selectionKey] : undefined);
    if (!id) {
      const operation = entry.operation ?? model.status().operation;
      const candidate = operation?.result?.id;
      need(operation && operation.id !== entry.beforeOperationId &&
        (!entry.selection || operation.id === entry.selection.id) && operation.kind === kind &&
        operation.state === 'COMPLETE' && UUID.test(candidate) && !entry.priorIds.includes(candidate),
        'COMPARISON_CUSTOMER_ADMISSION_UNCERTAIN',
        'An earlier phase has no authoritative returned item ID. Preserve its intent and original operation; do not create a replacement.');
      id = candidate;
      entry.selection = { ...(entry.selection ?? {}), id: operation.id,
        ...(selectionKey ? { [selectionKey]: id } : {}) };
      entry.operation = operation; await persist();
    }
    need(UUID.test(id) && !entry.priorIds.includes(id), 'COMPARISON_CUSTOMER_PHASE_ID_CHANGED');
    const actual = await get(id);
    need(actual && actual.id === id && matches(actual, entry.request), 'COMPARISON_CUSTOMER_PHASE_RESULT_CHANGED');
    if (entry.result) need(same(entry.result, actual), 'COMPARISON_CUSTOMER_PHASE_RESULT_CHANGED');
    entry.result = actual; entry.complete = true; entry.reconciledAt = new Date().toISOString();
    await persist(); return actual;
  }
  async function retainDownload(model, selection, scope, destination) {
    const descriptor = await model.dcatSemanticComparisonDownload(selection);
    const originalIdentity = await files.hashPrivate(descriptor.file, 2147483648);
    need(originalIdentity.hash === descriptor.sha256 && originalIdentity.bytes === descriptor.bytes,
      'COMPARISON_CUSTOMER_DOWNLOAD_CHANGED');
    const target = join(out, 'downloads', scope, destination);
    // Streaming copy retains complete potentially large failed native artifacts.
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const source = await open(descriptor.file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const handle = await open(target, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      const existing = await handle.stat();
      need(existing.isFile() && existing.nlink === 1 && !(existing.mode & 0o077) &&
        existing.size <= descriptor.bytes, 'COMPARISON_CUSTOMER_DOWNLOAD_DESTINATION_CHANGED');
      const buffer = Buffer.alloc(1048576), prior = Buffer.alloc(1048576);
      let offset = 0;
      // Resume only this exact already-retained source prefix, without discarding partial bytes.
      while (offset < existing.size) {
        const length = Math.min(buffer.length, existing.size - offset);
        const left = await source.read(buffer, 0, length, offset);
        const right = await handle.read(prior, 0, length, offset);
        need(left.bytesRead === length && right.bytesRead === length &&
          buffer.subarray(0, length).equals(prior.subarray(0, length)), 'COMPARISON_CUSTOMER_DOWNLOAD_PREFIX_CHANGED');
        offset += length;
      }
      for (;;) {
        const read = await source.read(buffer, 0, buffer.length, offset); if (!read.bytesRead) break;
        let written = 0;
        while (written < read.bytesRead) {
          const part = await handle.write(buffer, written, read.bytesRead - written, offset + written);
          need(part.bytesWritten > 0, 'COMPARISON_CUSTOMER_DOWNLOAD_WRITE_FAILED'); written += part.bytesWritten;
        }
        offset += read.bytesRead;
      }
      await handle.sync();
    } finally { await source.close(); await handle.close(); }
    const copied = await files.hashPrivate(target, 2147483648);
    need(copied.hash === descriptor.sha256 && copied.bytes === descriptor.bytes, 'COMPARISON_CUSTOMER_DOWNLOAD_COPY_CHANGED');
    const receipt = { scope, selection, name: descriptor.downloadName, bytes: copied.bytes,
      sha256: copied.hash, file: target };
    result.downloads.push(receipt); return receipt;
  }

  const coreComparison = value => {
    const result = structuredClone(value); delete result.reviews; delete result.currentReview; return result;
  };
  async function collectRows(model, comparison, scope) {
    const sections = {};
    for (const section of ['changes', 'nodes', 'relationships']) {
      const pages = []; let offset = 0, total, count = 0, availability = null, artifact = null;
      for (;;) {
        const page = await model.dcatSemanticComparisonRows({ comparisonId: comparison.id, section, offset, limit: 100 });
        need(page.comparisonId === comparison.id && page.comparisonSha256 === comparison.comparisonSha256 &&
          page.section === section && page.page.offset === offset, 'COMPARISON_CUSTOMER_ROWS_BINDING_CHANGED');
        if (total === undefined) total = page.page.total;
        need(page.page.total === total, 'COMPARISON_CUSTOMER_ROWS_TOTAL_CHANGED');
        availability = page.availability; artifact = page.artifact;
        const raw = encoded(page), file = join(out, 'rows', scope, section, String(offset).padStart(10, '0') + '.json');
        await once(file, raw);
        pages.push({ file, offset, count: page.rows.length, bytes: raw.length, sha256: sha(raw) });
        count += page.rows.length;
        if (page.page.nextOffset === null) break;
        need(Number.isSafeInteger(page.page.nextOffset) && page.page.nextOffset > offset,
          'COMPARISON_CUSTOMER_ROWS_CURSOR_INVALID');
        offset = page.page.nextOffset;
      }
      if (availability === 'AVAILABLE') need(count === total, 'COMPARISON_CUSTOMER_ROWS_INCOMPLETE');
      else need(total === null && count === 0, 'COMPARISON_CUSTOMER_ROWS_AVAILABILITY_CHANGED');
      if (comparison.status === 'COMPLETE')
        need(['AVAILABLE', 'DOWNLOAD_REQUIRED'].includes(availability) && artifact,
          'COMPARISON_CUSTOMER_COMPLETED_ROWS_MISSING');
      sections[section] = { availability, total, count, artifact, pages,
        qualification: availability === 'DOWNLOAD_REQUIRED'
          ? 'The presentation limit prevents pagination; the complete exact original artifact is retained in downloads.'
          : availability === 'AVAILABLE' ? 'Every original row in this selected section was paged.' : 'No original comparison section is available.' };
    }
    if (comparison.status === 'COMPLETE') {
      const native = comparison.result.comparison.summary;
      const expected = { changes: native.added_triples + native.removed_triples,
        nodes: native.impact_nodes, relationships: native.traversed_relationships };
      for (const [section, count] of Object.entries(expected))
        if (sections[section].availability === 'AVAILABLE')
          need(sections[section].total === count, 'COMPARISON_CUSTOMER_NATIVE_ROW_COUNT_CHANGED');
      // Exercise the original filters on actual typed rows, retaining the returned
      // page and its full filtered total without inventing additional observations.
      for (const [name, filters, expectedCount] of [
        ['added', { section: 'changes', change: 'added', snapshot: 'after' }, native.added_triples],
        ['removed', { section: 'changes', change: 'removed', snapshot: 'before' }, native.removed_triples],
      ]) {
        const page = await model.dcatSemanticComparisonRows({ comparisonId: comparison.id, offset: 0, limit: 100, ...filters });
        need(page.comparisonSha256 === comparison.comparisonSha256, 'COMPARISON_CUSTOMER_FILTER_BINDING_CHANGED');
        if (page.availability === 'AVAILABLE') {
          need(page.page.total === expectedCount && page.rows.every(row =>
            row.change === filters.change && row.snapshot === filters.snapshot),
            'COMPARISON_CUSTOMER_FILTER_CHANGED');
        }
        await once(join(out, 'rows', scope, 'filter-' + name + '.json'), encoded(page));
      }
    }
    return sections;
  }
  async function comparisonDownloads(model, comparison, scope) {
    await retainDownload(model, { kind: 'comparison', id: comparison.id }, scope, 'comparison.json');
    for (const artifact of comparison.artifacts)
      await retainDownload(model, { kind: 'artifact', id: comparison.id, key: artifact.key }, scope,
        'artifacts/' + artifact.key + '-' + basename(artifact.path));
    for (const review of comparison.reviews ?? [])
      await retainDownload(model, { kind: 'review', id: review.id }, scope, 'review-' + review.id + '.json');
  }
  async function retainedArchive(model, name, target) {
    const value = await phase({ name, model, kind: 'export complete workspace', collection: 'archives',
      selectionKey: null, request: { out: target }, start: request => model.archiveWorkspace(request),
      get: async id => (await model.workspaceArchives()).find(row => row.id === id),
      matches: (row, request) => row.file === request.out && HASH.test(row.sha256) && Number.isSafeInteger(row.bytes) });
    const actual = await files.hashPrivate(value.file, 8589934592);
    need(actual.hash === value.sha256 && actual.bytes === value.bytes, 'COMPARISON_CUSTOMER_ARCHIVE_CHANGED');
    return value;
  }
  function comparisonMatches(row, request) {
    return TERMINAL.has(row.status) && HASH.test(row.comparisonSha256) &&
      row.before.runId === request.beforeRunId && row.before.runSha256 === request.expectedBeforeRunSha256 &&
      row.after.runId === request.afterRunId && row.after.runSha256 === request.expectedAfterRunSha256 &&
      same(row.parameters, request.parameters) && same(row.limits, request.limits) && row.retryOf === null;
  }
  function reviewMatches(row, request) {
    return row.comparisonId === request.comparisonId && row.comparisonSha256 === request.expectedComparisonSha256 &&
      row.decision === request.decision && row.note === request.note &&
      row.previousReviewSha256 === request.expectedReviewSha256 && HASH.test(row.reviewSha256);
  }
  async function acknowledge(model, name, comparison, note) {
    return phase({ name, model, kind: 'record semantic comparison review', collection: 'comparisonReviews',
      selectionKey: 'semanticComparisonReviewId',
      request: { comparisonId: comparison.id, expectedComparisonSha256: comparison.comparisonSha256,
        decision: 'ACKNOWLEDGE', note, expectedReviewSha256: comparison.reviews.at(-1)?.reviewSha256 ?? null },
      start: request => model.reviewDcatSemanticComparison(request),
      get: async id => {
        const row = model.status().dcat.semantic.comparisonReviews.find(row => row.id === id);
        if (row) await model.dcatSemanticComparisonDownload({ kind: 'review', id });
        return row;
      }, matches: reviewMatches });
  }
  async function verifyOriginalRuns(model) {
    for (const original of Object.values(originals)) {
      const run = await model.dcatSemanticRun(original.runId);
      const profile = await model.dcatSemanticProfile(original.profileId);
      need(run.runSha256 === original.runSha256 && run.status === original.status &&
        run.profileId === original.profileId && run.profileSha256 === original.profileSha256 &&
        profile.profileSha256 === original.profileSha256 && run.selection.id === original.catalogId &&
        run.selection.sha256 === original.original.sha256 && profile.baseIRI === original.baseIRI &&
        profile.contextMode === original.contextMode && run.result.snapshot?.summary?.provenance_complete === true,
        'COMPARISON_CUSTOMER_ORIGINAL_RUN_CHANGED');
    }
  }
  try {
    for (const name of ['model.mjs', 'archive.mjs', 'capture.mjs', 'dcat-semantic.mjs',
      'dcat-semantic-comparison.mjs', 'dcat-semantic-native.mjs', 'vendor/semantic-operator/selected-runtime.json',
      'vendor/semantic-operator/source-manifest.json']) {
      const raw = await readFile(join(ckan, name));
      result.source.push({ path: PREFIX + '/' + name, bytes: raw.length, sha256: sha(raw) });
    }
    await once(join(out, 'actual-source.json'), encoded(result.source));
    producer = await openCkanWorkbench({ directory: producerDirectory, sourceKind: 'dcat-us', environment });
    need(!producer.status().active, 'COMPARISON_CUSTOMER_OWNER_BUSY');
    await verifyOriginalRuns(producer);
    const baselinePath = join(out, 'producer-before-comparisons.json');
    let baseline;
    if (await exists(baselinePath)) baseline = await files.readJson(baselinePath, 67108864);
    else {
      baseline = { projectCreatedAt: producer.status().createdAt, dcat: normalizedDcat(producer.status().dcat) };
      await once(baselinePath, encoded(baseline));
    }
    need(baseline.projectCreatedAt === producer.status().createdAt &&
      same(originalValidation(baseline.dcat), originalValidation(producer.status().dcat)),
      'COMPARISON_CUSTOMER_VALIDATION_HISTORY_CHANGED');
    const scenarios = [
      { name: 'ordered-editions', before: originals.legacy, after: originals.current, nodeLimit: 100000 },
      { name: 'same-current-snapshot', before: originals.current, after: originals.current, nodeLimit: 100000 },
      { name: 'bounded-impact', before: originals.legacy, after: originals.current, nodeLimit: 2 },
    ];
    for (const scenario of scenarios) {
      const input = { beforeRunId: scenario.before.runId, expectedBeforeRunSha256: scenario.before.runSha256,
        afterRunId: scenario.after.runId, expectedAfterRunSha256: scenario.after.runSha256,
        parameters: { edge_predicates: [], depth: 2, node_limit: scenario.nodeLimit }, limits };
      const created = await phase({ name: 'compare-' + scenario.name, model: producer,
        kind: 'compare retained semantic snapshots', collection: 'comparisons', selectionKey: 'comparisonId',
        request: input, start: request => producer.startDcatSemanticComparison(request),
        get: async id => coreComparison(await producer.dcatSemanticComparison(id)), matches: comparisonMatches });
      let comparison = await producer.dcatSemanticComparison(created.id);
      const rows = await collectRows(producer, comparison, 'producer-' + scenario.name);
      const review = await acknowledge(producer, 'review-' + scenario.name, comparison, reviewNote(scenario.name));
      comparison = await producer.dcatSemanticComparison(comparison.id);
      await comparisonDownloads(producer, comparison, 'producer-' + scenario.name);
      result.scenarios.push({ name: scenario.name, comparisonId: comparison.id,
        comparisonSha256: comparison.comparisonSha256, status: comparison.status,
        before: comparison.before, after: comparison.after, parameters: comparison.parameters,
        native: comparison.result.comparison?.summary ?? null, summary: comparison.summary,
        rows, review, artifacts: comparison.artifacts });
      await save('customer-progress-result.json', result);
    }
    const [ordered, identical, bounded] = result.scenarios;
    if (identical.status === 'COMPLETE') {
      need(identical.native.equivalent === true && identical.native.added_triples === 0 &&
        identical.native.removed_triples === 0 && identical.native.impact_nodes === 0 &&
        identical.native.traversed_relationships === 0 && identical.native.impact_truncated === false,
        'COMPARISON_CUSTOMER_SAME_SNAPSHOT_CHANGED');
      result.assertions.push({ name: 'same-current-snapshot', passed: true,
        qualification: 'The original graph engine reported semantic equivalence for the exact same retained snapshot.' });
    }
    if (ordered.status === 'COMPLETE' && bounded.status === 'COMPLETE') {
      for (const field of ['before_sha256', 'after_sha256', 'before_triples', 'after_triples',
        'common_triples', 'added_triples', 'removed_triples', 'equivalent', 'graph_difference_complete'])
        need(same(ordered.native[field], bounded.native[field]), 'COMPARISON_CUSTOMER_LIMIT_CHANGED_GRAPH_DIFFERENCE');
      need(bounded.native.graph_difference_complete === true && bounded.native.impact_nodes <= 2 &&
        bounded.native.impact_node_limit === 2, 'COMPARISON_CUSTOMER_IMPACT_BOUND_CHANGED');
      if (bounded.native.impact_truncated)
        need(bounded.native.impact_total_within_depth === null, 'COMPARISON_CUSTOMER_TRUNCATED_TOTAL_INVENTED');
      result.assertions.push({ name: 'bounded-impact-preserves-full-graph-difference', passed: true,
        actualImpactTruncated: bounded.native.impact_truncated,
        observedCandidateNodesAtLeast: bounded.native.observed_candidate_nodes_at_least,
        qualification: 'The actual node_limit=2 traversal is retained. Truncation is reported only when the original engine observed it.' });
    }
    const producerState = normalizedDcat(producer.status().dcat);
    need(same(originalValidation(producerState), originalValidation(baseline.dcat)),
      'COMPARISON_CUSTOMER_MUTATED_VALIDATION_OR_RELEASE');
    const originalComparisons = baseline.dcat.semantic.comparisons, originalReviews = baseline.dcat.semantic.comparisonReviews;
    const newComparisonIds = new Set(result.scenarios.map(row => row.comparisonId));
    const newReviewIds = new Set(result.scenarios.map(row => row.review.id));
    need(same(producerState.semantic.comparisons.filter(row => !newComparisonIds.has(row.id)), originalComparisons) &&
      same(producerState.semantic.comparisonReviews.filter(row => !newReviewIds.has(row.id)), originalReviews),
      'COMPARISON_CUSTOMER_UNOWNED_HISTORY_CHANGED');
    await validateDcatSemanticFiles(producerDirectory, producerState);
    await once(join(out, 'producer-before-transfer.json'), encoded(producerState));
    result.archive = await retainedArchive(producer, 'archive-producer', join(out, 'complete-gsa-comparisons.ckanw'));
    await save('archive-selection.json', result.archive);
    await closeOwner('producer');
    result.receiving = await receiveCkanWorkspaceArchive({ file: result.archive.file, directory: recipientDirectory,
      expectedSha256: result.archive.sha256 });
    recipient = await openCkanWorkbench({ directory: recipientDirectory, sourceKind: 'dcat-us', environment });
    await verifyOriginalRuns(recipient);
    // Reconcile the receiving decision before comparing histories, including a lost
    // launch reply. Its durable phase can resolve only the original returned ID.
    if (ledger.phases['recipient-review']) {
      const selected = await recipient.dcatSemanticComparison(ordered.comparisonId);
      result.recipientReview = await acknowledge(recipient, 'recipient-review', selected, RECIPIENT_NOTE);
    }
    const received = normalizedDcat(recipient.status().dcat);
    const comparable = structuredClone(received);
    if (result.recipientReview) {
      need(reviewMatches(result.recipientReview, ledger.phases['recipient-review'].request),
        'COMPARISON_CUSTOMER_RECIPIENT_DECISION_CHANGED');
      comparable.semantic.comparisonReviews = comparable.semantic.comparisonReviews.filter(row => row.id !== result.recipientReview.id);
    }
    need(same(comparable, producerState), 'COMPARISON_CUSTOMER_RECEIVED_HISTORY_CHANGED');
    await validateDcatSemanticFiles(recipientDirectory, received);
    for (const scenario of result.scenarios) {
      const comparison = await recipient.dcatSemanticComparison(scenario.comparisonId);
      need(comparison.comparisonSha256 === scenario.comparisonSha256, 'COMPARISON_CUSTOMER_RECEIVED_COMPARISON_CHANGED');
      const rows = await collectRows(recipient, comparison, 'recipient-' + scenario.name);
      for (const section of ['changes', 'nodes', 'relationships'])
        need(rows[section].availability === scenario.rows[section].availability &&
          rows[section].total === scenario.rows[section].total &&
          same(rows[section].artifact, scenario.rows[section].artifact), 'COMPARISON_CUSTOMER_RECEIVED_ROWS_CHANGED');
      await comparisonDownloads(recipient, comparison, 'recipient-' + scenario.name);
    }
    const beforeCold = normalizedDcat(recipient.status().dcat);
    await save('recipient-before-cold-reopen.json', beforeCold);
    await closeOwner('recipient');
    recipient = await openCkanWorkbench({ directory: recipientDirectory, sourceKind: 'dcat-us', environment });
    need(same(normalizedDcat(recipient.status().dcat), beforeCold), 'COMPARISON_CUSTOMER_COLD_REOPEN_CHANGED');
    await validateDcatSemanticFiles(recipientDirectory, recipient.status().dcat);
    result.coldReopen = { projectCreatedAt: recipient.status().createdAt, stateSha256: sha(encoded(beforeCold)),
      comparisons: beforeCold.semantic.comparisons.length, comparisonReviews: beforeCold.semantic.comparisonReviews.length };
    const selected = await recipient.dcatSemanticComparison(ordered.comparisonId);
    result.recipientReview = await acknowledge(recipient, 'recipient-review', selected, RECIPIENT_NOTE);
    await retainDownload(recipient, { kind: 'review', id: result.recipientReview.id },
      'recipient-following', 'receiving-review.json');
    result.followingArchive = await retainedArchive(recipient, 'archive-recipient',
      join(out, 'received-gsa-comparisons-following.ckanw'));
    await validateDcatSemanticFiles(recipientDirectory, recipient.status().dcat);
    await closeOwner('recipient');
    producer = await openCkanWorkbench({ directory: producerDirectory, sourceKind: 'dcat-us', environment });
    need(same(normalizedDcat(producer.status().dcat), producerState), 'COMPARISON_CUSTOMER_SENDER_CHANGED');
    await closeOwner('producer');
    result.complete = result.scenarios.length === 3 && result.scenarios.every(row => row.status === 'COMPLETE') &&
      result.cleanup.every(row => row.closed) && Boolean(result.coldReopen && result.followingArchive);
    if (!result.complete) result.errors.push({ code: 'COMPARISON_CUSTOMER_NATIVE_ATTEMPT_INCOMPLETE',
      message: 'The original failed/interrupted comparison evidence and acknowledgements are retained. Inspect them before selecting an explicit retry.' });
  } catch (error) {
    result.errors.push(safeError(error)); result.complete = false;
  } finally {
    for (const name of ['recipient', 'producer']) {
      try { await closeOwner(name); } catch (error) { result.errors.push(safeError(error)); result.complete = false; }
    }
    result.completedAt = new Date().toISOString();
    await save('result.json', result);
  }
  return result;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  need(args.length === 2 && args[0] === '--input', 'COMPARISON_CUSTOMER_INPUT_REQUIRED',
    'Use node run-gsa-semantic-comparison-customer.mjs --input /absolute/private/config.json');
  const inputPath = resolve(args[1]), info = await stat(inputPath);
  need(info.isFile() && !(info.mode & 0o077), 'COMPARISON_CUSTOMER_PRIVATE_INPUT_REQUIRED');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = await runDcatSemanticComparisonCustomer(input);
  console.log(JSON.stringify({ schema: result.schema, operation: result.operation, complete: result.complete,
    scenarios: result.scenarios.map(row => ({ name: row.name, comparisonId: row.comparisonId, status: row.status })),
    resultFile: join(resolve(input.outputDirectory), 'result.json'), errors: result.errors }));
  process.exitCode = result.complete ? 0 : 2;
}
