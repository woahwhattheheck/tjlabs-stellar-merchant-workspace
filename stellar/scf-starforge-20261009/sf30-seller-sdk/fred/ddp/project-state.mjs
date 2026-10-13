import { captureFredAlfred } from '../alfred/source.mjs';
import { readFredAlfredMetadata } from '../alfred/model.mjs';
// MIT. DDP project persistence uses the existing economic-project transaction.
import { join, resolve } from 'node:path';
import { open, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { privateDirectory, atomicJson, readPrivateJson } from '../../routescan/quota.mjs';
import { canonical, clone, need, plain, operationId, normalizeSelection, MAX_CAPTURE_BYTES } from '../model.mjs';
import { hash, digest, jsonBytes, optionalJson, validateCapture, captureFred } from '../source.mjs';
import { captureFredDdpCrosswalk,
  readFredDdpCrosswalkCapture, storeFredDdpCrosswalkCapture,
  readFredDdpPackageCapture, storeFredDdpPackageCapture } from './source.mjs';
import { DDP_CROSSWALK_URL, ddpBoardUrl, MAX_DDP_CAPTURE_BYTES } from './files.mjs';
import { inspectFredDdpCrosswalk } from './crosswalk.mjs';
import { inspectFredDdpPackage } from './package.mjs';
import { buildFredDdpMigrationPlan, validateFredDdpMigrationPlan, pageFredDdpMigrationPlan } from './migration.mjs';
import { buildFredDdpReceiving, validateFredDdpReceiving, pageFredDdpReceiving } from './receiving.mjs';
import { generateFredDdpReceivingFiles, validateFredDdpReceivingFileManifest,
  FRED_DDP_RECEIVING_RENDERER, FRED_DDP_RECEIVING_FILE_LIMIT } from './receiving-report.mjs';
import { validateFredDdpProjectBundle, fredDdpSourceSummary, fredDdpMigrationSummary,
  fredDdpReceivingSummary, fredDdpReceivingCoreSummary, fredDdpMigrationPreviewIdentity, fredDdpMigrationSavePayload,
  FRED_DDP_PROJECT_KEYS } from './project-validation.mjs';

const DDP_FILE_LIMIT = MAX_DDP_CAPTURE_BYTES;
const PROGRESS_LIMIT = 4 * 1024 * 1024;
const SOURCE_KINDS = {
  crosswalk: {
    key: 'ddpCrosswalks', field: 'crosswalkId', prefix: 'fred-ddp-crosswalk-',
    folder: 'ddp-crosswalks', kind: 'ddp-crosswalk-import',
    inspect: inspectFredDdpCrosswalk, read: readFredDdpCrosswalkCapture,
    store: storeFredDdpCrosswalkCapture
  },
  package: {
    key: 'ddpPackages', field: 'packageId', prefix: 'fred-ddp-package-',
    folder: 'ddp-packages', kind: 'ddp-package-import',
    inspect: inspectFredDdpPackage, read: readFredDdpPackageCapture,
    store: storeFredDdpPackageCapture
  }
};
const sourceIdentity = (value, kind) => {
  const spec = SOURCE_KINDS[kind];
  need(spec && typeof value === 'string' && value.startsWith(spec.prefix) &&
    /^[a-f0-9]{64}$/.test(value.slice(spec.prefix.length)), 'Select an original DDP ' + kind + ' identity.');
  return value;
};
export const fredDdpSourceDirectory = (directory, kind, sourceId) =>
  join(resolve(directory), SOURCE_KINDS[kind]?.folder ?? 'invalid', sourceIdentity(sourceId, kind));

function adoptSource(state, kind, capture, model) {
  const spec = SOURCE_KINDS[kind], summary = fredDdpSourceSummary(kind, capture, model);
  state[spec.key] ??= [];
  const previous = state[spec.key].find(item => item.id === summary.id);
  need(!previous || canonical(previous) === canonical(summary), 'The retained DDP source index changed.');
  if (!previous) state[spec.key].push(summary);
  return { [spec.field]: summary.id, source: clone(summary) };
}
function crosswalkUrl(value = DDP_CROSSWALK_URL) { return ddpBoardUrl(value); }


function namedId(value, prefix, label) {
  need(typeof value === 'string' && value.startsWith(prefix) &&
    /^[a-f0-9]{64}$/.test(value.slice(prefix.length)), 'Select an original DDP ' + label + ' identity.');
  return value;
}
const migrationId = value => namedId(value, 'fred-ddp-migration-plan-', 'migration');
const receivingId = value => namedId(value, 'fred-ddp-receiving-', 'receiving');
export const fredDdpMigrationDirectory = directory => join(resolve(directory), 'ddp-migrations');
export const fredDdpReceivingDirectory = (directory, id) =>
  join(resolve(directory), 'ddp-receivings', receivingId(id));
const migrationFile = (directory, id) => join(fredDdpMigrationDirectory(directory), migrationId(id) + '.json');
const batchDirectory = (directory, operation, batchId) => {
  operationId(operation);
  return join(resolve(directory), 'ddp-migration-acquisitions', operation, digest({ batchId }));
};

async function immutableJson(directory, name, value) {
  directory = await privateDirectory(directory);
  const existing = await optionalJson(join(directory, name), DDP_FILE_LIMIT);
  if (existing) need(canonical(existing) === canonical(value),
    'This original DDP file already retains another immutable value.', 'FRED_DDP_FILE_CONFLICT', 409);
  else await atomicJson(directory, name, value, { exclusive: true });
}
async function verifyFileBytes(path, { bytes, sha256 = null }, expected = null) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    need(stat.isFile() && stat.size === bytes && bytes <= FRED_DDP_RECEIVING_FILE_LIMIT,
      'The retained DDP receiving file changed.', 'FRED_DDP_FILE_CHANGED');
    const checksum = sha256 === null ? null : createHash('sha256'), buffer = Buffer.allocUnsafe(65536);
    let offset = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      need(offset + bytesRead <= bytes &&
        (!expected || expected.subarray(offset, offset + bytesRead).equals(chunk)),
        'The original DDP receiving file differs.', 'FRED_DDP_FILE_CONFLICT', 409);
      checksum?.update(chunk); offset += bytesRead;
    }
    need(offset === bytes && (checksum === null || checksum.digest('hex') === sha256),
      'The retained DDP receiving file changed.', 'FRED_DDP_FILE_CHANGED');
  } finally { await handle.close(); }
}
async function exactBytes(directory, name, bytes) {
  const temporary = join(directory, '.' + name + '.' + randomUUID() + '.part'), destination = join(directory, name);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, destination); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await verifyFileBytes(destination, { bytes: bytes.length }, bytes);
    }
    await unlink(temporary);
    const folder = await open(directory, 'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function storeMigration(directory, plan) {
  validateFredDdpMigrationPlan(plan, { copy: false });
  await immutableJson(fredDdpMigrationDirectory(directory), migrationId(plan.id) + '.json', plan);
}
function matchingReceivingSummary(model, summary) {
  validateFredDdpReceivingFileManifest(summary);
  const { rendererVersion, files, ...core } = summary;
  need(canonical(core) === canonical(fredDdpReceivingCoreSummary(model)),
    'The complete DDP receiving differs from its retained project index.');
}
async function readReceivingMember(directory, summary, definition) {
  const body = await readBytes(join(fredDdpReceivingDirectory(directory, summary.id), definition.path),
    FRED_DDP_RECEIVING_FILE_LIMIT);
  need(body.length === definition.bytes && hash(body) === definition.sha256,
    'The retained DDP receiving file changed.', 'FRED_DDP_FILE_CHANGED');
  return { ...clone(definition), body };
}
async function storeReceiving(directory, receiving, expected = null) {
  validateFredDdpReceiving(receiving, { copy: false });
  const root = await privateDirectory(fredDdpReceivingDirectory(directory, receiving.id));
  const retained = await optionalJson(join(root, 'files.json'), 65536);
  const preparation = await optionalJson(join(root, 'preparation.json'), 65536);
  if (retained) matchingReceivingSummary(receiving, retained);
  if (expected) matchingReceivingSummary(receiving, expected);
  const rendererVersion = expected?.rendererVersion ?? retained?.rendererVersion ??
    preparation?.rendererVersion ?? FRED_DDP_RECEIVING_RENDERER;
  const prepared = { schema: 'stellar-forge.fred-ddp-receiving-preparation.v1',
    receivingId: receiving.id, rendererVersion };
  if (preparation) need(canonical(preparation) === canonical(prepared),
    'The original DDP receiving preparation changed.');
  else await atomicJson(root, 'preparation.json', prepared, { exclusive: true });
  // Retain the original renderer before any member, and write one full member at a time.
  // Existing files.json preparations keep their exact original descriptors and bytes.
  const files = [];
  for (const { body, ...descriptor } of generateFredDdpReceivingFiles(receiving, { rendererVersion })) {
    for (const original of [retained, expected]) if (original)
      need(canonical(original.files[files.length]) === canonical(descriptor),
        'The original DDP receiving renderer or file bytes changed.');
    await exactBytes(root, descriptor.path, body);
    files.push(descriptor);
  }
  const summary = fredDdpReceivingSummary(receiving, { rendererVersion, files });
  for (const original of [retained, expected]) if (original)
    need(canonical(original) === canonical(summary), 'The original DDP receiving renderer or file bytes changed.');
  // Project adoption occurs after all three files and their complete inventory commit.
  if (!retained) await atomicJson(root, 'files.json', summary, { exclusive: true });
  return summary;
}

export function createFredDdpProjectExtension({ readProject, transact, readCapture, adoptCapture }) {
  async function retainedSource(directory, state, kind, sourceId) {
    const spec = SOURCE_KINDS[kind];
    sourceIdentity(sourceId, kind);
    const summary = (state[spec.key] ?? []).find(item => item.id === sourceId);
    need(summary, 'Select a DDP source retained by this project.', 'FRED_DDP_SOURCE_NOT_FOUND', 404);
    const retained = await spec.read(join(fredDdpSourceDirectory(directory, kind, sourceId), 'capture.json'));
    need(retained.capture.id === sourceId &&
      canonical(summary) === canonical(fredDdpSourceSummary(kind, retained.capture, retained.model)),
      'The DDP source differs from its retained project index.');
    return retained;
  }

  async function importSource({ directory, id, expectedRevision, capture, sourceId }, kind) {
    const spec = SOURCE_KINDS[kind];
    operationId(id);
    const original = await readProject(directory);
    let staged;
    if (capture !== undefined && capture !== null) {
      capture = clone(capture);
      spec.inspect(capture);
      sourceIdentity(capture.id, kind);
      if (sourceId !== undefined && sourceId !== null)
        need(sourceIdentity(sourceId, kind) === capture.id, 'The DDP source body and selected identity differ.');
      sourceId = capture.id;
      // Stage the complete immutable source before the compact project mutation.
      staged = await spec.store(fredDdpSourceDirectory(directory, kind, sourceId), capture);
      need(staged.capture.id === sourceId && staged.capture.captureSha256 === capture.captureSha256,
        'The staged DDP source identity changed.');
    } else {
      sourceIdentity(sourceId, kind);
      const previous = original.operations.find(item => item.id === id), pending = original.pending;
      need((previous?.kind === spec.kind && previous.result[spec.field] === sourceId) ||
        (pending?.id === id && pending.kind === spec.kind && pending.payload[spec.field] === sourceId),
        'Continue the original DDP import operation or supply the complete original source.',
        'FRED_DDP_IMPORT_CONTINUATION_REQUIRED', 409);
      staged = await spec.read(join(fredDdpSourceDirectory(directory, kind, sourceId), 'capture.json'));
      need(staged.capture.id === sourceId, 'The staged original DDP source identity changed.');
    }
    return transact(directory, { id, expectedRevision, kind: spec.kind, payload: { [spec.field]: sourceId } },
      state => adoptSource(state, kind, staged.capture, staged.model));
  }

  async function listFredDdpSources({ directory } = {}) {
    const state = await readProject(directory);
    return { projectId: state.id, revision: state.revision,
      crosswalks: clone(state.ddpCrosswalks ?? []), packages: clone(state.ddpPackages ?? []),
      migrations: clone(state.ddpMigrations ?? []), receivings: clone(state.ddpReceivings ?? []) };
  }
  async function getFredDdpCrosswalk({ directory, crosswalkId } = {}) {
    return (await retainedSource(directory, await readProject(directory), 'crosswalk', crosswalkId)).capture;
  }
  async function importFredDdpCrosswalk({ directory, id, expectedRevision, capture, crosswalkId } = {}) {
    return importSource({ directory, id, expectedRevision, capture, sourceId: crosswalkId }, 'crosswalk');
  }
  async function acquireFredDdpCrosswalk({ directory, id, expectedRevision, url, signal, fetchImpl } = {}) {
    const original = await readProject(directory);
    if (url === undefined) {
      if (original.pending?.id === id && original.pending.kind === 'ddp-crosswalk-capture')
        url = original.pending.payload.url;
      else url = original.operations.find(item => item.id === id && item.kind === 'ddp-crosswalk-capture')?.result.url;
    }
    url = crosswalkUrl(url);
    return transact(directory, { id, expectedRevision, kind: 'ddp-crosswalk-capture', payload: { url } },
      async (state, root) => {
        const acquired = await captureFredDdpCrosswalk({
          directory: join(root, 'ddp-crosswalk-acquisitions', id), url, signal, fetchImpl });
        const saved = await storeFredDdpCrosswalkCapture(
          fredDdpSourceDirectory(root, 'crosswalk', acquired.capture.id), acquired.capture);
        return { ...adoptSource(state, 'crosswalk', saved.capture, saved.model), acquisitionId: id, url };
      });
  }
  async function getFredDdpPackage({ directory, packageId } = {}) {
    return (await retainedSource(directory, await readProject(directory), 'package', packageId)).capture;
  }
  async function importFredDdpPackage({ directory, id, expectedRevision, capture, packageId } = {}) {
    return importSource({ directory, id, expectedRevision, capture, sourceId: packageId }, 'package');
  }


  async function originalPlanInputs(directory, state, { packageId, crosswalkId, ...input }) {
    const packageSource = await retainedSource(directory, state, 'package', packageId);
    const mappingSource = await retainedSource(directory, state, 'crosswalk', crosswalkId);
    return { packageCapture: packageSource.capture, crosswalk: mappingSource.capture, ...input };
  }
  async function retainedMigration(directory, state, id, { sourceContext = false } = {}) {
    migrationId(id);
    const summary = (state.ddpMigrations ?? []).find(item => item.id === id);
    need(summary, 'Select a migration retained by this project.', 'FRED_DDP_MIGRATION_NOT_FOUND', 404);
    const plan = await readPrivateJson(migrationFile(directory, id), DDP_FILE_LIMIT);
    need(plan.id === id && canonical(fredDdpMigrationSummary(plan)) === canonical(summary),
      'The retained migration plan index changed.');
    if (sourceContext) {
      const context = await originalPlanInputs(directory, state,
        { packageId: plan.packageId, crosswalkId: plan.crosswalkId });
      validateFredDdpMigrationPlan(plan, { ...context, copy: false });
    } else validateFredDdpMigrationPlan(plan, { copy: false });
    return plan;
  }
  async function retainedReceivingSummary(directory, state, id) {
    receivingId(id);
    const summary = (state.ddpReceivings ?? []).find(item => item.id === id);
    need(summary, 'Select a complete migration receiving retained by this project.',
      'FRED_DDP_RECEIVING_NOT_FOUND', 404);
    validateFredDdpReceivingFileManifest(summary);
    const retained = await readPrivateJson(join(fredDdpReceivingDirectory(directory, id), 'files.json'), 65536);
    need(canonical(retained) === canonical(summary), 'The original DDP receiving file inventory changed.');
    return summary;
  }
  async function retainedReceiving(directory, state, id, { includeFiles = false, verifyFiles = false } = {}) {
    const summary = await retainedReceivingSummary(directory, state, id);
    let jsonFile = await readReceivingMember(directory, summary, summary.files[0]), receiving;
    try { receiving = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonFile.body)); }
    catch { need(false, 'Retain the complete original UTF-8 DDP receiving JSON.'); }
    const files = includeFiles ? [jsonFile] : [];
    if (!includeFiles) jsonFile = null;
    validateFredDdpReceiving(receiving, { copy: false }); matchingReceivingSummary(receiving, summary);
    if (includeFiles || verifyFiles) for (const definition of summary.files.slice(1)) {
      if (includeFiles) files.push(await readReceivingMember(directory, summary, definition));
      else await verifyFileBytes(join(fredDdpReceivingDirectory(directory, id), definition.path), definition);
    }
    return { receiving, summary: clone(summary), ...(includeFiles ? { files } : {}) };
  }

  function migrationRequest({
    packageId, crosswalkId, name, asOf, window = { kind: 'source' }, decisions = [], bindings = [],
    pageSize = 1000, maxRows = 1000000, bookmark = null, note = ''
  }) {
    return { packageId, crosswalkId, name, asOf, window, decisions, bindings, pageSize, maxRows, bookmark, note };
  }
  async function previewFredDdpMigration(options = {}) {
    const { directory, section = 'series', offset = 0, limit = 100 } = options;
    const state = await readProject(directory);
    const plan = buildFredDdpMigrationPlan(await originalPlanInputs(directory, state, migrationRequest(options)));
    return { projectId: state.id, revision: state.revision, migrationId: plan.id,
      previewId: fredDdpMigrationPreviewIdentity(state.id, plan.id),
      migration: pageFredDdpMigrationPlan(plan, { section, offset, limit }) };
  }
  async function saveFredDdpMigration(options = {}) {
    const { directory, id, expectedRevision, previewId } = options;
    const original = await readProject(directory);
    const plan = buildFredDdpMigrationPlan(await originalPlanInputs(directory, original, migrationRequest(options)));
    const payload = fredDdpMigrationSavePayload(original.id, plan);
    need(previewId === payload.previewId, 'Preview these exact original package, crosswalk and migration inputs before saving.',
      'FRED_DDP_PREVIEW_CHANGED', 409);
    return transact(directory, { id, expectedRevision, kind: 'ddp-migration-save', payload }, async (state, root) => {
      // Sources are immutable, and the original transaction checks the reviewed revision.
      const summary = fredDdpMigrationSummary(plan);
      await storeMigration(root, plan);
      state.ddpMigrations ??= [];
      const retained = state.ddpMigrations.find(item => item.id === plan.id);
      need(!retained || canonical(retained) === canonical(summary), 'The saved migration index changed.');
      if (!retained) state.ddpMigrations.push(summary);
      return { migrationId: plan.id, migration: clone(summary) };
    });
  }
  async function getFredDdpMigration({ directory, migrationId: id, section = 'series', offset = 0, limit = 100 } = {}) {
    const state = await readProject(directory), plan = await retainedMigration(directory, state, id);
    return { projectId: state.id, revision: state.revision,
      migration: pageFredDdpMigrationPlan(plan, { section, offset, limit }),
      receivings: clone((state.ddpReceivings ?? []).filter(item => item.planId === plan.id)) };
  }
  async function downloadFredDdpMigration({ directory, migrationId: id } = {}) {
    const state = await readProject(directory), plan = await retainedMigration(directory, state, id);
    const body = Buffer.from(canonical(plan) + '\n');
    need(body.length <= DDP_FILE_LIMIT, 'The complete migration plan exceeds the 384 MiB reader capacity.');
    return { migrationId: plan.id, path: 'fred-ddp-migration-plan.json', contentType: 'application/json',
      bytes: body.length, sha256: hash(body), body };
  }
  async function acquireFredDdpMigration({
    directory, id, expectedRevision, migrationId: selectedId, sourceMode, metadata, metadataSha256,
    signal, environment, fetchImpl
  } = {}) {
    migrationId(selectedId); operationId(id);
    const original = await readProject(directory), pending = original.pending?.id === id ? original.pending : null;
    const completedOperation = original.operations.find(item => item.id === id);
    const retainedOperation = pending ?? completedOperation;
    if (retainedOperation) need(retainedOperation.kind === 'ddp-migration-acquire',
      'Continue the original project operation kind.', 'FRED_OPERATION_CONFLICT', 409);
    const retainedContext = pending?.payload ?? completedOperation?.result;
    sourceMode ??= retainedContext?.sourceMode ?? 'API_VINTAGE';
    need(['API_VINTAGE', 'ALFRED_VINTAGE'].includes(sourceMode), 'Choose the original API or ALFRED historical source mode.');
    if (retainedContext) need(retainedContext.migrationId === selectedId &&
      (retainedContext.sourceMode ?? 'API_VINTAGE') === sourceMode,
      'Continue the original migration and source mode.', 'FRED_OPERATION_CONFLICT', 409);
    let editions = [], metadataDigest = null;
    if (sourceMode === 'ALFRED_VINTAGE') {
      const plan = await retainedMigration(directory, original, selectedId);
      const ids = new Set(plan.acquisitions.flatMap(item => item.series));
      const operationRoot = await privateDirectory(join(resolve(directory), 'ddp-migration-acquisitions', id));
      const staged = await optionalJson(join(operationRoot, 'alfred-metadata.json'), MAX_CAPTURE_BYTES * 2);
      let receivedEditions;
      if (metadata === undefined && !staged && completedOperation) {
        need(Array.isArray(completedOperation.result.captureIds) && completedOperation.result.captureIds.length > 0,
          'The completed historical acquisition must retain its original source captures.');
        receivedEditions = [];
        for (const captureId of completedOperation.result.captureIds) {
          const capture = await readCapture(directory, captureId);
          need(capture.schema === 'stellar-forge.alfred-vintage-capture.v1',
            'The completed historical acquisition must retain the same ALFRED source mode.');
          for (const record of capture.source.series) if (record.metadata) receivedEditions.push(record.metadata);
        }
      }
      editions = metadata ?? staged ?? receivedEditions ?? [];
      need(Array.isArray(editions) && new Set(editions.map(item => item?.series?.value)).size === editions.length,
        'Retain one original historical metadata edition for each selected series.');
      for (const edition of editions) {
        const series = edition?.series?.value; need(ids.has(series), 'Historical metadata names an unplanned target.');
        readFredAlfredMetadata(edition, { series, vintage: plan.input.asOf });
        need(hash(Buffer.from(edition.source.body, 'utf8')) === edition.source.sha256, 'Historical metadata source bytes changed.');
      }
      editions = clone(editions).sort((a,b) => a.series.value < b.series.value ? -1 : a.series.value > b.series.value ? 1 : 0);
      metadataDigest = digest(editions);
      need(metadataSha256 === undefined || metadataSha256 === metadataDigest, 'Resume the exact retained historical metadata edition.');
      if (retainedContext) need(retainedContext.metadataSha256 === metadataDigest,
        'Continue the original retained historical metadata identity.', 'FRED_OPERATION_CONFLICT', 409);
      if (staged) need(digest(staged) === metadataDigest, 'This original acquisition retains another metadata edition.');
      else await atomicJson(operationRoot, 'alfred-metadata.json', editions, { exclusive: true });
    } else need(metadata === undefined && metadataSha256 === undefined, 'API metadata comes from the original API series response.');
    const context = sourceMode === 'ALFRED_VINTAGE' ? { sourceMode, metadataSha256: metadataDigest } : {};
    return transact(directory, { id, expectedRevision, kind: 'ddp-migration-acquire', payload: { migrationId: selectedId, ...context } },
      async (state, root) => {
        const plan = await retainedMigration(root, state, selectedId);
        need(plan.summary.ready && plan.acquisitions.length > 0,
          'Review all original mappings and selected periods before acquiring the complete migration.');
        const matching = state.operations.find(operation => operation.kind === 'ddp-migration-acquire' &&
          operation.result?.migrationId === plan.id && (operation.result.sourceMode ?? 'API_VINTAGE') === sourceMode &&
          (sourceMode === 'API_VINTAGE' || operation.result.metadataSha256 === metadataDigest));
        const existing = (state.ddpReceivings ?? []).find(item => item.planId === plan.id && item.id === matching?.result.receivingId);
        if (existing) {
          const retained = await retainedReceiving(root, state, existing.id, { verifyFiles: true });
          return { migrationId: plan.id, receivingId: existing.id, receiving: retained.summary,
            captureIds: [...existing.captureIds], acquisitionId: id, reusedReceiving: true, ...context };
        }
        const source = await originalPlanInputs(root, state, { packageId: plan.packageId, crosswalkId: plan.crosswalkId });
        validateFredDdpMigrationPlan(plan, { ...source, copy: false });
        const operationRoot = await privateDirectory(join(root, 'ddp-migration-acquisitions', id));
        let progress = await optionalJson(join(operationRoot, 'progress.json'), PROGRESS_LIMIT);
        if (progress) {
          need(progress.schema === 'stellar-forge.fred-ddp-migration-acquisition.v1' &&
            progress.migrationId === plan.id && (progress.sourceMode ?? 'API_VINTAGE') === sourceMode &&
            (sourceMode === 'API_VINTAGE' || progress.metadataSha256 === metadataDigest) && Array.isArray(progress.completed) &&
            progress.completed.length <= plan.acquisitions.length &&
            progress.completed.every((item, index) => item.id === plan.acquisitions[index].id &&
              /^[a-f0-9]{64}$/.test(item.captureId) &&
              canonical(item.selection) === canonical(plan.acquisitions[index].selection)),
            'The retained whole-package acquisition belongs to another migration.');
        } else progress = { schema: 'stellar-forge.fred-ddp-migration-acquisition.v1', migrationId: plan.id,
          startedAt: new Date().toISOString(), completed: [], activeBatchId: null, ...context };
        const captures = [];
        for (const [index, acquisition] of plan.acquisitions.entries()) {
          progress.activeBatchId = acquisition.id;
          await atomicJson(operationRoot, 'progress.json', progress);
          const acquired = sourceMode === 'ALFRED_VINTAGE'
            ? await captureFredAlfred({ directory: batchDirectory(root, id, acquisition.id), selection: acquisition.selection,
                metadata: editions.filter(item => acquisition.series.includes(item.series.value)), signal, fetchImpl })
            : await captureFred({ directory: batchDirectory(root, id, acquisition.id),
                selection: acquisition.selection, apiKeyEnv: state.apiKeyEnv, signal, environment, fetchImpl });
          const model = validateCapture(acquired.capture);
          need(canonical(model.selection) === canonical(normalizeSelection(acquisition.selection)),
            'A native batch differs from the reviewed whole-package migration selection.');
          const completed = { id: acquisition.id, captureId: acquired.capture.captureSha256, selection: clone(model.selection) };
          if (progress.completed[index]) need(canonical(progress.completed[index]) === canonical(completed),
            'The retained completed migration batch changed.');
          else progress.completed.push(completed);
          captures.push(acquired.capture);
          progress.activeBatchId = null;
          await atomicJson(operationRoot, 'progress.json', progress);
        }
        const receiving = buildFredDdpReceiving({ ...source, plan, captures });
        const summary = await storeReceiving(root, receiving);
        const captureIds = [];
        for (const capture of captures) {
          const adopted = await adoptCapture(state, root, capture);
          captureIds.push(adopted.captureId);
        }
        need(canonical(captureIds) === canonical(summary.captureIds),
          'The receiving must retain every planned native capture in original batch order.');
        state.ddpReceivings ??= [];
        state.ddpReceivings.push(summary);
        return { migrationId: plan.id, receivingId: receiving.id, receiving: clone(summary),
          captureIds, acquisitionId: id, reusedReceiving: false, ...context };
      });
  }
  async function getFredDdpReceiving({
    directory, receivingId: id, offset = 0, limit = 100, changesOnly = true, seriesId = null
  } = {}) {
    const state = await readProject(directory), retained = await retainedReceiving(directory, state, id);
    return { projectId: state.id, revision: state.revision,
      receiving: pageFredDdpReceiving(retained.receiving, { offset, limit, changesOnly, seriesId }) };
  }
  async function downloadFredDdpReceiving({ directory, receivingId: id, format = 'html' } = {}) {
    need(['json', 'csv', 'html'].includes(format), 'Choose the complete original JSON, CSV or HTML receiving file.');
    const state = await readProject(directory), summary = await retainedReceivingSummary(directory, state, id);
    const definition = summary.files.find(item => item.path === 'ddp-receiving.' + format);
    return { receivingId: id, ...(await readReceivingMember(directory, summary, definition)) };
  }

  async function exportDdp(directory, state, captures) {
    const values = Object.fromEntries(FRED_DDP_PROJECT_KEYS.map(key => [key, []]));
    for (const item of state.ddpCrosswalks ?? [])
      values.ddpCrosswalks.push((await retainedSource(directory, state, 'crosswalk', item.id)).capture);
    for (const item of state.ddpPackages ?? [])
      values.ddpPackages.push((await retainedSource(directory, state, 'package', item.id)).capture);
    for (const item of state.ddpMigrations ?? [])
      values.ddpMigrations.push(await retainedMigration(directory, state, item.id));
    for (const item of state.ddpReceivings ?? [])
      values.ddpReceivings.push((await retainedReceiving(directory, state, item.id, { verifyFiles: true })).receiving);
    validateFredDdpProjectBundle({ state, captures, ...values });
    return values;
  }
  async function receiveDdp(directory, state, values) {
    // The complete graph is validated before the original receiver takes its project lock.
    for (const capture of values.ddpCrosswalks)
      await storeFredDdpCrosswalkCapture(fredDdpSourceDirectory(directory, 'crosswalk', capture.id), capture);
    for (const capture of values.ddpPackages)
      await storeFredDdpPackageCapture(fredDdpSourceDirectory(directory, 'package', capture.id), capture);
    for (const plan of values.ddpMigrations) await storeMigration(directory, plan);
    for (const receiving of values.ddpReceivings) {
      const expected = state.ddpReceivings.find(item => item.id === receiving.id);
      await storeReceiving(directory, receiving, expected);
    }
  }
  async function acquisitionView(directory, state) {
    if (state.pending?.kind !== 'ddp-migration-acquire') return null;
    const pending = state.pending, plan = await retainedMigration(directory, state, pending.payload.migrationId);
    const progress = await optionalJson(join(resolve(directory), 'ddp-migration-acquisitions', pending.id, 'progress.json'), PROGRESS_LIMIT);
    let active = null;
    if (progress?.activeBatchId) {
      const batch = plan.acquisitions.find(item => item.id === progress.activeBatchId);
      need(batch, 'The active acquisition is outside the retained migration plan.');
      const value = await optionalJson(join(batchDirectory(directory, pending.id, batch.id), 'progress.json'), MAX_CAPTURE_BYTES * 2);
      active = { id: batch.id, series: [...batch.series], selection: clone(batch.selection),
        ...(value ? { state: value.state ?? value.status, responses: value.records?.length ?? 0,
          lastError: value.lastError ?? null, startedAt: value.startedAt } : {}) };
    }
    return { kind: pending.kind, migrationId: plan.id, sourceMode: pending.payload.sourceMode ?? 'API_VINTAGE', plannedBatches: plan.acquisitions.length,
      completedBatches: progress?.completed?.length ?? 0, startedAt: progress?.startedAt ?? pending.startedAt, active };
  }
  return { listFredDdpSources, getFredDdpCrosswalk, importFredDdpCrosswalk, acquireFredDdpCrosswalk,
    getFredDdpPackage, importFredDdpPackage, previewFredDdpMigration, saveFredDdpMigration,
    getFredDdpMigration, downloadFredDdpMigration, acquireFredDdpMigration, getFredDdpReceiving,
    downloadFredDdpReceiving, exportDdp, receiveDdp, acquisitionView };
}

