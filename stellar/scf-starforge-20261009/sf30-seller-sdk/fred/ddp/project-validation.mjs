// MIT. Pure DDP project graph validation shared by receiving and installed clients.
import { canonical, clone, need, plain, date, normalizeSelection } from '../model.mjs';
import { digest, validateCapture } from '../source.mjs';
import { inspectFredDdpCrosswalk } from './crosswalk.mjs';
import { inspectFredDdpPackage } from './package.mjs';
import { validateFredDdpMigrationPlan } from './migration.mjs';
import { validateFredDdpReceiving } from './receiving.mjs';
import { verifyFredDdpReceivingManifest, validateFredDdpReceivingFileManifest } from './receiving-report.mjs';

export const FRED_DDP_PROJECT_BUNDLE = 'stellar-forge.fred-project-bundle.v5';
export const FRED_DDP_PROJECT_BUNDLE_MAX_BYTES = 480 * 1024 * 1024;
export const FRED_DDP_PROJECT_KEYS = Object.freeze(['ddpCrosswalks', 'ddpPackages', 'ddpMigrations', 'ddpReceivings']);

function id(value, prefix, label) {
  need(typeof value === 'string' && value.startsWith(prefix) &&
    /^[a-f0-9]{64}$/.test(value.slice(prefix.length)), 'Retain an original DDP ' + label + ' identity.');
  return value;
}
const crosswalkId = value => id(value, 'fred-ddp-crosswalk-', 'crosswalk');
const packageId = value => id(value, 'fred-ddp-package-', 'package');
const planId = value => id(value, 'fred-ddp-migration-plan-', 'migration plan');
const receivingId = value => id(value, 'fred-ddp-receiving-', 'receiving');
const hashId = value => {
  need(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Retain an original source digest.');
  return value;
};

export function fredDdpStatePresent(state) {
  return FRED_DDP_PROJECT_KEYS.some(key => (state[key]?.length ?? 0) > 0);
}
export function fredDdpSourceSummary(kind, capture, model) {
  model ??= kind === 'crosswalk' ? inspectFredDdpCrosswalk(capture) : inspectFredDdpPackage(capture);
  const common = { id: capture.id, captureSha256: capture.captureSha256,
    source: clone(model.source), summary: clone(model.summary) };
  return kind === 'package' ? { ...common, release: model.release, format: model.format } : common;
}
export function fredDdpMigrationSummary(plan) {
  return { id: plan.id, packageId: plan.packageId, packageSha256: plan.packageSha256,
    crosswalkId: plan.crosswalkId, crosswalkSha256: plan.crosswalkSha256,
    name: plan.input.name, asOf: plan.input.asOf, window: clone(plan.input.window),
    acquisitionCount: plan.acquisitions.length, summary: clone(plan.summary) };
}
export function fredDdpReceivingCoreSummary(receiving) {
  return { id: receiving.id, planId: receiving.planId, packageId: receiving.packageId,
    packageSha256: receiving.packageSha256, crosswalkId: receiving.crosswalkId,
    crosswalkSha256: receiving.crosswalkSha256,
    captureIds: receiving.captures.map(item => item.captureSha256), summary: clone(receiving.summary) };
}
export function fredDdpReceivingSummary(receiving, manifest) {
  validateFredDdpReceivingFileManifest(manifest);
  return { ...fredDdpReceivingCoreSummary(receiving), rendererVersion: manifest.rendererVersion,
    files: clone(manifest.files) };
}
export function fredDdpMigrationPreviewIdentity(projectId, migrationId) {
  return digest({ schema: 'stellar-forge.fred-ddp-migration-preview.v1', projectId, migrationId });
}
export function fredDdpMigrationSavePayload(projectId, plan) {
  return { packageId: plan.packageId, crosswalkId: plan.crosswalkId, ...clone(plan.input),
    previewId: fredDdpMigrationPreviewIdentity(projectId, plan.id) };
}

export function validateFredDdpProjectState(state) {
  need(plain(state) && Array.isArray(state.captures) && Array.isArray(state.operations),
    'Retain the original economic project state.');
  for (const key of FRED_DDP_PROJECT_KEYS) {
    if (state[key] !== undefined) need(Array.isArray(state[key]), 'Retain the complete ' + key + ' inventory.');
    const entries = state[key] ?? [];
    need(entries.every(plain) && new Set(entries.map(item => item.id)).size === entries.length,
      'DDP inventory identities must be distinct.');
  }
  const crosswalks = new Map((state.ddpCrosswalks ?? []).map(item => [item.id, item]));
  const packages = new Map((state.ddpPackages ?? []).map(item => [item.id, item]));
  const plans = new Map((state.ddpMigrations ?? []).map(item => [item.id, item]));
  const sourceIds = new Set(state.captures.map(item => item.id));
  for (const [kind, entries] of [['crosswalk', crosswalks], ['package', packages]]) {
    for (const source of entries.values()) {
      (kind === 'crosswalk' ? crosswalkId : packageId)(source.id);
      hashId(source.captureSha256);
      need(source.id === 'fred-ddp-' + kind + '-' + source.captureSha256 &&
        plain(source.source) && !Object.hasOwn(source.source, 'base64') && plain(source.summary),
        'Retain the original DDP source summary.');
      if (kind === 'package')
        need(typeof source.release === 'string' && typeof source.format === 'string',
          'Retain the package release and original format.');
    }
  }
  for (const plan of plans.values()) {
    planId(plan.id); packageId(plan.packageId); crosswalkId(plan.crosswalkId);
    const source = packages.get(plan.packageId), mapping = crosswalks.get(plan.crosswalkId);
    need(source && mapping && source.captureSha256 === plan.packageSha256 &&
      mapping.captureSha256 === plan.crosswalkSha256, 'The DDP migration lost its original source or crosswalk.');
    date(plan.asOf, 'DDP migration as-of date');
    need(typeof plan.name === 'string' && plain(plan.window) && plain(plan.summary) &&
      Number.isSafeInteger(plan.acquisitionCount) && plan.acquisitionCount >= 0,
      'Retain the reviewed migration selection and summary.');
  }
  const completedPlans = new Set();
  for (const receiving of state.ddpReceivings ?? []) {
    receivingId(receiving.id); planId(receiving.planId);
    validateFredDdpReceivingFileManifest(receiving);
    const plan = plans.get(receiving.planId);
    need(plan && !completedPlans.has(receiving.planId) &&
      receiving.packageId === plan.packageId && receiving.packageSha256 === plan.packageSha256 &&
      receiving.crosswalkId === plan.crosswalkId && receiving.crosswalkSha256 === plan.crosswalkSha256,
      'The DDP receiving lost its unique original migration plan or source.');
    completedPlans.add(receiving.planId);
    need(Array.isArray(receiving.captureIds) && receiving.captureIds.length === plan.acquisitionCount &&
      new Set(receiving.captureIds).size === receiving.captureIds.length &&
      receiving.captureIds.every(value => sourceIds.has(hashId(value))) && plain(receiving.summary),
      'The complete migration receiving must retain every original observation acquisition.');
  }
  return state;
}

function completeInventory(state, key, values) {
  need(Array.isArray(values) && values.every(plain) &&
    values.length === (state[key]?.length ?? 0) &&
    new Set(values.map(item => item.id)).size === values.length,
    'The complete DDP bundle must retain every ' + key + ' record.');
  const expected = new Map((state[key] ?? []).map(item => [item.id, item]));
  for (const value of values) need(expected.has(value.id), 'Unexpected DDP record in the project bundle.');
  return expected;
}
function operationBefore(state, kind, predicate, before = state.operations.length) {
  return state.operations.findIndex((operation, index) =>
    index < before && operation.kind === kind && predicate(operation));
}
function matchingFingerprint(operation, kind, payload) {
  return operation.fingerprint === digest({ kind, payload });
}

/** Validate original sources, immutable plans/results and their retained operation chronology. */
export function validateFredDdpProjectBundle({
  state, captures, ddpCrosswalks, ddpPackages, ddpMigrations, ddpReceivings
} = {}) {
  validateFredDdpProjectState(state);
  need(Array.isArray(captures) && captures.every(plain), 'Retain the original economic capture array.');
  const originalCaptures = new Map(), captureModels = new Map();
  for (const capture of captures) {
    const model = validateCapture(capture);
    need(!originalCaptures.has(capture.captureSha256), 'Economic capture identities must be distinct.');
    originalCaptures.set(capture.captureSha256, capture);
    captureModels.set(capture.captureSha256, model);
  }
  const crosswalkIndex = completeInventory(state, 'ddpCrosswalks', ddpCrosswalks);
  const packageIndex = completeInventory(state, 'ddpPackages', ddpPackages);
  const migrationIndex = completeInventory(state, 'ddpMigrations', ddpMigrations);
  const receivingIndex = completeInventory(state, 'ddpReceivings', ddpReceivings);
  const crosswalks = new Map(), packages = new Map(), plans = new Map();
  const sourceOperations = new Map(), planOperations = new Map();
  for (const capture of ddpCrosswalks) {
    const model = inspectFredDdpCrosswalk(capture), summary = fredDdpSourceSummary('crosswalk', capture, model);
    need(canonical(summary) === canonical(crosswalkIndex.get(capture.id)), 'The original crosswalk index changed.');
    crosswalks.set(capture.id, capture);
    const index = state.operations.findIndex(operation =>
      ((operation.kind === 'ddp-crosswalk-import' &&
          matchingFingerprint(operation, operation.kind, { crosswalkId: capture.id })) ||
        (operation.kind === 'ddp-crosswalk-capture' &&
          typeof operation.result?.url === 'string' &&
          matchingFingerprint(operation, operation.kind, { url: operation.result.url }))) &&
      operation.result?.crosswalkId === capture.id &&
      canonical(operation.result.source) === canonical(summary));
    need(index >= 0, 'The crosswalk has no original completed source operation.');
    sourceOperations.set(capture.id, index);
  }
  for (const capture of ddpPackages) {
    const model = inspectFredDdpPackage(capture), summary = fredDdpSourceSummary('package', capture, model);
    need(canonical(summary) === canonical(packageIndex.get(capture.id)), 'The original package index changed.');
    packages.set(capture.id, capture);
    const index = operationBefore(state, 'ddp-package-import', operation =>
      operation.result?.packageId === capture.id &&
      canonical(operation.result.source) === canonical(summary) &&
      matchingFingerprint(operation, operation.kind, { packageId: capture.id }));
    need(index >= 0, 'The package has no original completed source import.');
    sourceOperations.set(capture.id, index);
  }
  for (const plan of ddpMigrations) {
    const packageCapture = packages.get(plan.packageId), crosswalk = crosswalks.get(plan.crosswalkId);
    need(packageCapture && crosswalk, 'The complete migration lost its original sources.');
    validateFredDdpMigrationPlan(plan, { packageCapture, crosswalk, copy: false });
    const summary = fredDdpMigrationSummary(plan);
    need(canonical(summary) === canonical(migrationIndex.get(plan.id)), 'The migration plan index changed.');
    const index = operationBefore(state, 'ddp-migration-save', operation =>
      operation.result?.migrationId === plan.id &&
      canonical(operation.result.migration) === canonical(summary) &&
      matchingFingerprint(operation, operation.kind, fredDdpMigrationSavePayload(state.id, plan)));
    need(index >= 0 && sourceOperations.get(plan.packageId) < index &&
      sourceOperations.get(plan.crosswalkId) < index, 'The migration plan lost its original source/save chronology.');
    plans.set(plan.id, plan); planOperations.set(plan.id, index);
  }
  for (const receiving of ddpReceivings) {
    const plan = plans.get(receiving.planId), summary = receivingIndex.get(receiving.id);
    need(plan && Array.isArray(summary.captureIds), 'The migration result lost its retained source plan.');
    const selected = summary.captureIds.map(value => originalCaptures.get(value));
    need(selected.every(Boolean) && selected.length === plan.acquisitions.length,
      'The migration result must retain all original native acquisition batches.');
    const selections = new Set(plan.acquisitions.map(item => canonical(normalizeSelection(item.selection))));
    need(selected.every(capture => selections.has(canonical(captureModels.get(capture.captureSha256).selection))) &&
      new Set(selected.map(capture => canonical(captureModels.get(capture.captureSha256).selection))).size === selected.length,
      'The migration result contains an unplanned or repeated native acquisition.');
    validateFredDdpReceiving(receiving, { packageCapture: packages.get(plan.packageId),
      crosswalk: crosswalks.get(plan.crosswalkId), plan, captures: selected, copy: false });
    for (const capture of selected) {
      const model = captureModels.get(capture.captureSha256);
      const adopted = state.captures.find(item => item.id === capture.captureSha256);
      need(adopted && canonical(adopted.selection) === canonical(model.selection) &&
        adopted.sourceMode === model.sourceMode && adopted.rowCount === model.rowCount &&
        canonical(adopted.missing) === canonical(model.missing) && canonical(adopted.series) === canonical(model.series),
        'The adopted migration observation index differs from its original native capture.');
    }
    const manifest = verifyFredDdpReceivingManifest(receiving, summary);
    need(canonical(fredDdpReceivingSummary(receiving, manifest)) === canonical(summary),
      'The retained migration receiving index changed.');
    const index = operationBefore(state, 'ddp-migration-acquire', operation =>
      operation.result?.migrationId === plan.id && operation.result?.receivingId === receiving.id &&
      canonical(operation.result.receiving) === canonical(summary) &&
      canonical(operation.result.captureIds) === canonical(summary.captureIds) &&
      operation.result.acquisitionId === operation.id && typeof operation.result.reusedReceiving === 'boolean' &&
      matchingFingerprint(operation, operation.kind, { migrationId: plan.id }));
    need(index > planOperations.get(plan.id), 'The complete receiving lost its original acquisition chronology.');
  }
  return true;
}
