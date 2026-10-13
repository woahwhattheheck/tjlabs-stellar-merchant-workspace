// MIT. Complete following-edition receiving through the installed DCAT application's original model.
import { mkdir, readFile, writeFile, open, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const hash = raw => createHash('sha256').update(raw).digest('hex');
const stamp = () => new Date().toISOString();
const need = (value, code, message = code) => { if (!value) throw Object.assign(new Error(message), { code }); };
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await stat(path);
  need(info.isDirectory() && !(info.mode & 0o077), 'RECEIVING_PRIVATE_DIRECTORY_REQUIRED');
}
async function file(path, raw) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  return { file: path, bytes: raw.length, sha256: hash(raw) };
}
async function json(path, value) { return file(path, Buffer.from(JSON.stringify(value, null, 2) + '\n')); }
function errorRecord(error) { return { code: error.code ?? 'DCAT_RECURRING_RECEIVING_FAILED', message: error.message }; }
function stateHash(value) { return hash(Buffer.from(JSON.stringify(value))); }

/**
 * Run on an owned saved customer project after its preceding owner closes the lease.
 * sourceRoot is the complete installed source, not a replacement module graph.
 * The caller preserves this output directory with the surrounding receiving programme.
 */
export async function runDcatRecurringCatalog({
  sourceRoot, projectDirectory, outputDirectory, python, runtimeProfile = 'portable-python312',
  publicSourceUrl = 'https://gsa.gov/data.json', label = 'GSA public catalog',
  sourceId: suppliedSourceId, baselineReleaseId: requestedBaseline,
  reuseMappingIndexes = [], normalizeV3 = false, rehearseRelease = true,
  environment = process.env,
} = {}) {
  sourceRoot = resolve(sourceRoot); projectDirectory = resolve(projectDirectory); outputDirectory = resolve(outputDirectory);
  need(typeof python === 'string' && python.startsWith('/'), 'RECEIVING_PYTHON_REQUIRED');
  need(Array.isArray(reuseMappingIndexes) && reuseMappingIndexes.every(value => Number.isSafeInteger(value) && value >= 0) &&
    new Set(reuseMappingIndexes).size === reuseMappingIndexes.length, 'RECEIVING_MAPPING_SELECTION_INVALID');
  const endpoint = new URL(publicSourceUrl);
  need(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.hash,
    'RECEIVING_PUBLIC_SOURCE_REQUIRED');
  await directory(outputDirectory); await directory(join(outputDirectory, 'downloads'));
  const sdk = join(sourceRoot, 'stellar/scf-starforge-20261009/sf30-seller-sdk/ckan');
  const { openCkanWorkbench } = await import(pathToFileURL(join(sdk, 'model.mjs')).href);
  const { inspectCkanWorkspaceArchive, receiveCkanWorkspaceArchive } =
    await import(pathToFileURL(join(sdk, 'archive.mjs')).href);
  const executionEnvironment = { ...environment, SCF_DCAT_PYTHON: python, SCF_DCAT_RUNTIME_PROFILE: runtimeProfile };
  const result = {
    schema: 'commons.dcat-recurring-catalog-receiving.v1',
    operation: 'DCAT-RECURRING-CATALOG-20261013-390E',
    startedAt: stamp(), publicSourceUrl: endpoint.href, sourceRoot, projectDirectory,
    runtime: { python, runtimeProfile }, phases: [], downloads: [], complete: false,
  };
  let model, received, primaryFailure, receivingFailure, chosenSourceId, originalState, baseline;
  async function settle(name, operation) {
    need(operation && UUID.test(operation.id ?? '') && operation.completion, 'RECEIVING_ORIGINAL_OPERATION_REQUIRED');
    const completed = await operation.completion;
    result.phases.push({ name, ...completed });
    await json(join(outputDirectory, String(result.phases.length).padStart(2, '0') + '-' + name + '.json'), completed);
    return completed;
  }
  async function download(name, descriptor) {
    need(descriptor && HASH.test(descriptor.sha256 ?? '') && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes >= 0,
      'RECEIVING_DOWNLOAD_BINDING_INVALID');
    const handle = await open(descriptor.file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw;
    try {
      const before = await handle.stat();
      need(before.isFile() && before.nlink === 1 && before.size === descriptor.bytes && !(before.mode & 0o077),
        'RECEIVING_RETAINED_FILE_CHANGED');
      raw = await handle.readFile();
      const after = await handle.stat();
      need(after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs &&
        raw.length === descriptor.bytes && hash(raw) === descriptor.sha256, 'RECEIVING_RETAINED_FILE_CHANGED');
    } finally { await handle.close(); }
    const saved = await file(join(outputDirectory, 'downloads', name), raw);
    const identity = { ...saved, kind: name, id: descriptor.id, releaseId: descriptor.releaseId ?? null };
    result.downloads.push(identity); return { identity, raw };
  }
  async function acquisition(name, input) {
    const operation = model.acquireDcatSource(input), completed = await settle(name, operation);
    const current = await model.dcatSource(chosenSourceId);
    const selected = current.acquisitions.find(row => row.id === operation.acquisitionId);
    need(selected, 'RECEIVING_ACQUISITION_NOT_RETAINED');
    await json(join(outputDirectory, name + '-source.json'), current);
    // Receipt and the actually received body are independent retained files.
    for (const kind of ['receipt', 'response']) {
      try { await download(name + '-' + kind + (kind === 'receipt' ? '.json' : '.bin'),
        await model.dcatAcquisitionDownload(selected.id, kind)); }
      catch (error) {
        result.downloads.push({ kind: name + '-' + kind, acquisitionId: selected.id, available: false, error: errorRecord(error) });
        if (kind === 'receipt') throw error;
      }
    }
    return { completed, selected, current };
  }
  try {
    model = await openCkanWorkbench({ directory: projectDirectory, environment: executionEnvironment });
    originalState = model.status().dcat;
    need(originalState && Array.isArray(originalState.releases), 'RECEIVING_ORIGINAL_DCAT_PROJECT_REQUIRED');
    result.original = { activeReleaseId: originalState.activeReleaseId, dcatSha256: stateHash(originalState),
      catalogs: originalState.catalogs.length, reviews: originalState.reviews.length, releases: originalState.releases.length };
    const baselineId = requestedBaseline === undefined ? originalState.activeReleaseId : requestedBaseline;
    need(baselineId === null || UUID.test(baselineId ?? ''), 'RECEIVING_BASELINE_INVALID');
    baseline = baselineId === null ? null : originalState.releases.find(row => row.id === baselineId);
    need(baselineId === null || baseline, 'RECEIVING_BASELINE_NOT_RETAINED');
    if (baseline) {
      const baselineFile = await model.dcatReviewDownload(baseline.reviewId, 'candidate');
      need(baselineFile.sha256 === baseline.sha256 && baselineFile.bytes === baseline.bytes, 'RECEIVING_BASELINE_CHANGED');
      await download('accepted-baseline.json', baselineFile);
      const baselineReport = await model.dcatReview(baseline.reviewId);
      need(baselineReport.review_sha256 === baseline.reviewSha256, 'RECEIVING_BASELINE_CHANGED');
      need(reuseMappingIndexes.every(index => index < (baselineReport.identity_mappings ?? []).length),
        'RECEIVING_BASELINE_MAPPING_NOT_FOUND');
    } else need(reuseMappingIndexes.length === 0, 'RECEIVING_BASELINE_REQUIRED');
    result.baseline = baseline ? { releaseId: baseline.id, reviewId: baseline.reviewId,
      sha256: baseline.sha256, reviewSha256: baseline.reviewSha256, selectedMappingIndexes: [...reuseMappingIndexes] } : null;

    if (suppliedSourceId) {
      need(UUID.test(suppliedSourceId), 'RECEIVING_SOURCE_ID_INVALID');
      chosenSourceId = suppliedSourceId;
      const existing = await model.dcatSource(chosenSourceId);
      need(existing.source.url === endpoint.href, 'RECEIVING_SOURCE_URL_CHANGED');
    } else {
      const operation = model.saveDcatSource({ label, url: endpoint.href, profile: 'auto', intervalMinutes: 60,
        enabled: true, timeoutMs: 300000, maxResponseBytes: 134217728 });
      chosenSourceId = operation.sourceId;
      const saved = await settle('save-source', operation);
      need(saved.state === 'COMPLETE' && UUID.test(chosenSourceId ?? ''), 'RECEIVING_SOURCE_SAVE_FAILED');
    }
    result.sourceId = chosenSourceId;
    let current = await model.dcatSource(chosenSourceId);
    const first = await acquisition('acquire-live-edition', {
      sourceId: chosenSourceId, expectedSourceSha256: current.source.sourceSha256,
      expectedLatestCatalogId: current.source.latestCatalogId ?? null,
    });
    current = first.current;
    need(['ACQUIRED', 'UNCHANGED', 'NOT_MODIFIED'].includes(first.selected.status),
      'RECEIVING_LIVE_ACQUISITION_FAILED', 'Inspect the retained current attempt before reviewing this source as a newly checked edition.');
    need(current.source.latestCatalogId, 'RECEIVING_SOURCE_HAS_NO_COMPLETE_EDITION');
    // A publisher can retain Retry-After even on a successful response.
    // Respect that deadline; the first edition is still a useful complete review input.
    if (current.source.retryNotBefore && Date.parse(current.source.retryNotBefore) > Date.now()) {
      result.conditionalRefresh = { state: 'DEFERRED', retryNotBefore: current.source.retryNotBefore };
    } else {
      const following = await acquisition('conditional-refresh', {
        sourceId: chosenSourceId, expectedSourceSha256: current.source.sourceSha256,
        expectedLatestCatalogId: current.source.latestCatalogId, unconditional: false,
      });
      current = following.current;
      result.conditionalRefresh = { state: following.selected.status, acquisitionId: following.selected.id,
        operationState: following.completed.state };
    }
    result.source = current.source;
    const catalog = model.status().dcat.catalogs.find(row => row.id === current.source.latestCatalogId);
    need(catalog && HASH.test(catalog.sha256), 'RECEIVING_LATEST_EDITION_MISSING');
    await download('live-source-original.bin', await model.dcatCatalogDownload(catalog.id));
    result.catalog = { id: catalog.id, sha256: catalog.sha256, bytes: catalog.bytes, profile: catalog.profile };

    const reviewing = model.prepareDcatSourceReview({
      sourceId: chosenSourceId, expectedSourceSha256: current.source.sourceSha256,
      expectedLatestCatalogId: current.source.latestCatalogId,
      baselineReleaseId: baseline?.id ?? null,
      ...(baseline ? { expectedBaselineSha256: baseline.sha256, expectedBaselineReviewSha256: baseline.reviewSha256 } : {}),
      reuseMappingIndexes: [...reuseMappingIndexes], normalizeV3,
      label: label + ' following edition',
    });
    const reviewed = await settle('review-following-edition', reviewing);
    need(reviewed.state === 'COMPLETE', 'RECEIVING_FOLLOWING_REVIEW_FAILED');
    const review = await model.dcatReview(reviewing.reviewId);
    const metadata = model.status().dcat.reviews.find(row => row.id === reviewing.reviewId);
    need(metadata && ['READY', 'NEEDS_CORRECTION'].includes(metadata.status) &&
      review.source.sha256 === catalog.sha256 && review.source.bytes === catalog.bytes,
      'RECEIVING_FOLLOWING_REVIEW_BINDING_CHANGED');
    need(baseline ? review.comparison?.sha256 === baseline.sha256 && review.comparison?.bytes === baseline.bytes :
      review.comparison === null, 'RECEIVING_ACCEPTED_BASELINE_BINDING_CHANGED');
    await download('following-edition-report.json', await model.dcatReviewDownload(metadata.id, 'report'));
    if (metadata.candidateSha256)
      await download('following-edition-candidate.json', await model.dcatReviewDownload(metadata.id, 'candidate'));
    result.review = { id: metadata.id, status: metadata.status, reviewSha256: metadata.reviewSha256,
      reportSha256: metadata.reportSha256, candidateSha256: metadata.candidateSha256, summary: metadata.summary,
      canReceive: review.can_receive };

    if (rehearseRelease && metadata.status === 'READY' && originalState.activeReleaseId) {
      const beforeRelease = model.status().dcat.activeReleaseId;
      need(beforeRelease === originalState.activeReleaseId, 'RECEIVING_ACTIVE_RELEASE_CHANGED');
      const cutover = await settle('rehearse-cutover', model.cutoverDcat({
        reviewId: metadata.id, expectedActiveReleaseId: beforeRelease,
        expectedReviewSha256: metadata.reviewSha256, expectedCandidateSha256: metadata.candidateSha256,
        note: 'Receive and rehearse the captured following edition in the owned customer workspace.',
      }));
      need(cutover.state === 'COMPLETE', 'RECEIVING_CUTOVER_FAILED');
      await download('rehearsed-data.json', await model.dcatCurrentDownload());
      const originalRelease = originalState.releases.find(row => row.id === originalState.activeReleaseId);
      const rollback = await settle('restore-accepted-release', model.rollbackDcat({
        releaseId: originalRelease.id, expectedActiveReleaseId: cutover.result.id,
        expectedReviewSha256: originalRelease.reviewSha256, expectedCandidateSha256: originalRelease.sha256,
        note: 'Restore the preceding accepted customer edition after the following-edition rehearsal.',
      }));
      need(rollback.state === 'COMPLETE' && rollback.result.restoredFromReleaseId === originalRelease.id &&
        rollback.result.sha256 === originalRelease.sha256, 'RECEIVING_ROLLBACK_CHANGED');
      await download('restored-data.json', await model.dcatCurrentDownload());
      result.releaseRehearsal = { selectedReleaseId: cutover.result.id, restoredReleaseId: rollback.result.id,
        restoredFromReleaseId: originalRelease.id, restoredSha256: originalRelease.sha256 };
    }
  } catch (error) { primaryFailure = error; result.error = errorRecord(error); }
  // Receive the complete history even when the publisher or catalog review needs correction.
  // This gives the next operator the real attempts, bytes and saved decision state.
  try {
    if (model) {
      const retainedState = model.status().dcat;
      result.retainedStateSha256 = stateHash(retainedState);
      const archived = await settle('export-complete-workspace',
        model.archiveWorkspace({ out: join(outputDirectory, 'following-edition-workspace.ckanw') }));
      need(archived.state === 'COMPLETE', 'RECEIVING_ARCHIVE_FAILED');
      const archive = archived.result;
      need(HASH.test(archive.sha256 ?? '') && typeof archive.file === 'string', 'RECEIVING_ARCHIVE_DESCRIPTOR_INVALID');
      const inspection = await inspectCkanWorkspaceArchive({ file: archive.file, expectedSha256: archive.sha256 });
      await json(join(outputDirectory, 'archive-inspection.json'), inspection);
      const destination = join(outputDirectory, 'received-workspace');
      await model.close(); model = null;
      const receivedRecord = await receiveCkanWorkspaceArchive({ file: archive.file, directory: destination,
        expectedSha256: archive.sha256 });
      await json(join(outputDirectory, 'archive-receiving.json'), receivedRecord);
      received = await openCkanWorkbench({ directory: destination, environment: executionEnvironment });
      need(stateHash(received.status().dcat) === result.retainedStateSha256, 'RECEIVING_COMPLETE_HISTORY_CHANGED');
      if (chosenSourceId) {
        const reopened = await received.dcatSource(chosenSourceId);
        await json(join(outputDirectory, 'reopened-source-history.json'), reopened);
        for (const original of result.downloads.filter(row => row.available !== false && row.id &&
            /-(receipt\.json|response\.bin)$/.test(row.kind))) {
          const kind = original.kind.endsWith('receipt.json') ? 'receipt' : 'response';
          const descriptor = await received.dcatAcquisitionDownload(original.id, kind);
          need(descriptor.bytes === original.bytes && descriptor.sha256 === original.sha256,
            'RECEIVING_REOPENED_RESPONSE_CHANGED');
        }
      }
      result.archive = { id: archive.id, file: archive.file, bytes: archive.bytes, sha256: archive.sha256,
        receivedDirectory: destination, completeHistoryEqual: true };
    }
  } catch (error) { receivingFailure = error; result.receivingError = errorRecord(error); }
  finally {
    try { await received?.close(); } catch (error) { receivingFailure ??= error; result.closeError = errorRecord(error); }
    try { await model?.close(); } catch (error) { receivingFailure ??= error; result.closeError = errorRecord(error); }
    result.complete = !primaryFailure && !receivingFailure && result.archive?.completeHistoryEqual === true;
    result.completedAt = stamp();
    await writeFile(join(outputDirectory, 'result.json'), Buffer.from(JSON.stringify(result, null, 2) + '\n'),
      { mode: 0o600, flag: 'wx' });
  }
  return result;
}
