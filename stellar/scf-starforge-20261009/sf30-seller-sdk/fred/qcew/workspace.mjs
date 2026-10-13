// MIT. County-report operations in the original private economic workspace.
import { isAbsolute, resolve, join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { operationId } from '../model.mjs';
import { digest } from '../source.mjs';
import { need, clone, period, periodKey } from './model.mjs';
import { defaultSanFranciscoProfile } from './profile.mjs';
import { qcewProjectSummary } from './state.mjs';
import { MAX_QCEW_CAPTURE_BYTES, readQcewCapture, readQcewOriginalMember } from './source.mjs';
import { importQcewSource, saveQcewProfile, produceQcewEdition, getQcewEdition, downloadQcewMember, publishQcewEdition } from './project.mjs';
import { readFredProject, importFredCapture, receiveFredProject, transactFredProject } from '../project.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from '../ddp/project-validation.mjs';

export const QCEW_WORKSPACE_REQUEST_BYTES = FRED_DDP_PROJECT_BUNDLE_MAX_BYTES + 65536;
export const QCEW_WORKSPACE_ACTIONS = Object.freeze([
  'qcew.import', 'qcew.cpi', 'qcew.profile', 'qcew.produce', 'qcew.publish', 'qcew.receive', 'qcew.continue', 'qcew.clear'
]);
const domainActions = QCEW_WORKSPACE_ACTIONS.filter(action => !['qcew.continue', 'qcew.clear'].includes(action));
const WORKSPACE_OPERATION = 'stellar-forge.qcew-workspace-operation.v1';
const sha = /^[a-f0-9]{64}$/;
function sourceId(value, label) {
  need(sha.test(value ?? ''), 'Choose a retained ' + label + '.');
  return value;
}
function absoluteDirectory(value) {
  need(typeof value === 'string' && value.length <= 4096 && isAbsolute(value) && !/[\x00-\x1f]/.test(value),
    'Choose an absolute directory on this workspace host.');
  return resolve(value);
}
function pageValue(value, fallback, maximum) {
  need(value === null || /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum,
    'Choose a valid report page.');
  return value === null ? fallback : Number(value);
}
function configuredBrowser(environment) {
  const value = environment?.FRED_QCEW_CHROMIUM;
  if (value === undefined || value === '') return null;
  need(typeof value === 'string' && isAbsolute(value) && !/[\x00-\x1f]/.test(value),
    'Configure FRED_QCEW_CHROMIUM with the installed Chromium executable.');
  return resolve(value);
}
async function originalProject(directory, projectId) {
  const state = await readFredProject(directory);
  need(!projectId || state.id === projectId, 'The selected economic project changed.', 'QCEW_WORKSPACE_CHANGED', 409);
  return state;
}
function reportPage(value, url) {
  const { report, entry, manifest, files } = value;
  const section = url.searchParams.get('section') ?? 'overview';
  const offset = pageValue(url.searchParams.get('offset'), 0, 10000000);
  const limit = pageValue(url.searchParams.get('limit'), 100, 500);
  need(limit >= 1, 'Choose a report page size from 1 to 500.');
  need(['overview', 'matrix', 'sources', 'files', 'changes'].includes(section), 'Choose a report table.');
  const region = url.searchParams.get('region') ?? '';
  const industry = url.searchParams.get('industry') ?? '';
  const selectedPeriod = url.searchParams.get('period') ?? '';
  const definition = report.profile.definition;
  need(!region || definition.regions.some(item => item.id === region), 'Choose a report region.');
  need(!industry || definition.industries.some(item => item.code === industry), 'Choose a report industry.');
  const periods = [...new Set(report.matrix.map(item => item.period))].sort();
  need(!selectedPeriod || periods.includes(selectedPeriod), 'Choose a period retained in this report.');
  let all, changes = null;
  if (section === 'overview') all = report.tables.overview;
  if (section === 'matrix') all = report.matrix.filter(item =>
    (!region || item.region === region) && (!industry || item.industry === industry) &&
    (!selectedPeriod || item.period === selectedPeriod));
  if (section === 'sources') {
    const areas = region ? new Set(definition.regions.find(item => item.id === region).areas) : null;
    all = report.sourceRows.filter(item => (!areas || areas.has(item.area_fips)) &&
      (!industry || item.industry_code === industry) &&
      (!selectedPeriod || item.year + '-Q' + item.qtr === selectedPeriod));
  }
  if (section === 'files') all = report.source.files;
  if (section === 'changes') {
    const file = files.find(item => item.name === 'changes.json');
    changes = file ? JSON.parse(file.body) : null;
    all = changes?.rows ?? [];
  }
  if (section === 'overview' && industry) all = all.filter(item => item.industry === industry);
  if (section === 'changes' && industry) all = all.filter(item => item.industry === industry);
  need(offset <= all.length, 'Choose a page inside this report selection.');
  const items = all.slice(offset, offset + limit);
  const { files: originalFiles, ...source } = report.source;
  return {
    edition: clone(entry), manifest: clone(manifest), title: definition.title,
    period: report.periodLabel, baseline: periodKey(report.baseline), priceBase: periodKey(report.priceBase),
    profile: clone(report.profile), source: clone(source),
    cpi: { captureSha256: report.cpi.captureSha256, metadata: clone(report.cpi.series) },
    availability: clone(report.availability), methodology: clone(report.methodology),
    regions: clone(definition.regions), industries: clone(definition.industries), periods,
    section, filters: { region, industry, period: selectedPeriod }, total: all.length, offset, limit,
    nextOffset: offset + items.length < all.length ? offset + items.length : null,
    items: clone(items),
    ...(section === 'overview' && offset === 0 ? { figures: clone(report.figures.overview) } : {}),
    ...(changes ? { previousReportId: changes.previousReport, currentReportId: changes.currentReport } : {})
  };
}
export async function readQcewWorkspace({ directory, projectId, url, environment = process.env } = {}) {
  const state = await originalProject(directory, projectId);
  const qcew = qcewProjectSummary(state);
  if (url.pathname === '/api/qcew/state') return {
    value: { projectId: state.id, title: state.title, revision: state.revision, pending: clone(state.pending),
      qcew, priceCaptures: state.captures.map(item => ({ id: item.id, selection: clone(item.selection),
        sourceMode: item.sourceMode, rowCount: item.rowCount })),
      retainedAction: await retainedActionView(directory, state),
      capabilities: { pdf: Boolean(configuredBrowser(environment)), captureLimitBytes: MAX_QCEW_CAPTURE_BYTES,
        projectLimitBytes: FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } }
  };
  if (url.pathname === '/api/qcew/profile') {
    const id = url.searchParams.get('profile');
    const profile = id ? qcew.profiles.find(item => item.id === sourceId(id, 'report profile')) : defaultSanFranciscoProfile();
    need(profile, 'The report profile is not in this project.', 'QCEW_PROFILE_NOT_FOUND', 404);
    return { value: clone(profile), ...(url.searchParams.get('download') === '1'
      ? { filename: 'county-report-profile.json', contentType: 'application/json; charset=utf-8' } : {}) };
  }
  if (url.pathname === '/api/qcew/edition') {
    const editionId = url.searchParams.get('edition') ?? qcew.selectedEdition;
    sourceId(editionId, 'county report edition');
    return { value: reportPage(await getQcewEdition(directory, editionId), url) };
  }
  if (url.pathname === '/api/qcew/file') {
    const editionId = sourceId(url.searchParams.get('edition'), 'county report edition');
    const file = await downloadQcewMember({ directory, editionId, name: url.searchParams.get('name') });
    return { value: file.bytes, filename: file.name, contentType: file.contentType };
  }
  if (url.pathname === '/api/qcew/source') {
    const id = sourceId(url.searchParams.get('capture'), 'BLS source');
    need(qcew.captures.some(item => item.id === id), 'The original BLS source is not in this project.', 'QCEW_SOURCE_NOT_FOUND', 404);
    const { capture } = await readQcewCapture(directory, id, { select: () => false });
    return { value: capture, filename: 'bls-qcew-original-capture.json', contentType: 'application/json; charset=utf-8' };
  }
  if (url.pathname === '/api/qcew/original') {
    const captureSha256 = sourceId(url.searchParams.get('capture'), 'BLS source');
    need(qcew.captures.some(item => item.id === captureSha256), 'The original BLS source is not in this project.', 'QCEW_SOURCE_NOT_FOUND', 404);
    const file = await readQcewOriginalMember(directory, captureSha256, url.searchParams.get('name'));
    const filename = file.name.replace(/\.gz$/, '');
    need(/^[A-Za-z0-9._-]+$/.test(filename), 'The original CSV filename is invalid.');
    return { value: file.bytes, filename, contentType: 'text/csv; charset=utf-8' };
  }
  need(false, 'County report route not found.', 'QCEW_ROUTE_NOT_FOUND', 404);
}
async function runOriginalQcewWorkspaceAction({ directory, projectId, request, environment = process.env } = {}) {
  need(QCEW_WORKSPACE_ACTIONS.includes(request?.action), 'Choose a county report action.');
  await originalProject(directory, projectId);
  const common = { directory, id: request.id, expectedRevision: request.expectedRevision };
  if (request.action === 'qcew.import') {
    need(Boolean(request.capture) !== Boolean(request.inputDirectory), 'Choose the original intake directory or a complete sealed source file.');
    return importQcewSource({ ...common, ...(request.capture ? { capture: request.capture }
      : { inputDirectory: absoluteDirectory(request.inputDirectory) }) });
  }
  if (request.action === 'qcew.cpi') return importFredCapture({ ...common, capture: request.capture });
  if (request.action === 'qcew.profile') return saveQcewProfile({ ...common, profile: request.profile });
  if (request.action === 'qcew.publish') return publishQcewEdition({ ...common, editionId: request.editionId,
    origin: request.origin, path: request.path, payment: request.payment });
  if (request.action === 'qcew.produce') {
    need(typeof request.pdf === 'boolean', 'Choose whether to create the PDF edition.');
    const browserPath = request.pdf ? configuredBrowser(environment) : null;
    need(!request.pdf || browserPath, 'Configure this workspace’s installed Chromium to create a PDF edition.', 'QCEW_PDF_UNAVAILABLE');
    return produceQcewEdition({ ...common, captureSha256: request.captureSha256,
      cpiCaptureSha256: request.cpiCaptureSha256, profileId: request.profileId, period: request.period,
      previousEditionId: request.previousEditionId ?? null, browserPath });
  }
  const target = absoluteDirectory(request.targetDirectory);
  need(target !== resolve(directory), 'Choose the receiving project’s own empty directory.');
  sourceId(request.bundle?.bundleSha256, 'complete project handover');
  return transactFredProject(directory, { id: request.id, expectedRevision: request.expectedRevision, kind: 'qcew.receive',
    payload: { targetDirectory: target, bundleSha256: request.bundle.bundleSha256 } }, async () => {
    const receiving = await receiveFredProject({ directory: target, bundle: request.bundle });
    const received = await readFredProject(target), summary = qcewProjectSummary(received);
    return { receiving, directory: target, title: received.title, projectId: received.id,
      receivedRevision: received.revision, sourceCaptures: summary.captures.length,
      reportProfiles: summary.profiles.length, reportEditions: summary.editions.length };
  });
}


const operationDirectory = directory => join(resolve(directory), 'qcew-workspace');
async function retainedOperation(directory, state) {
  let value;
  try { value = await readPrivateJson(join(operationDirectory(directory), 'operation.json'), 65536); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  need(value?.schema === WORKSPACE_OPERATION && value.projectId === state.id && domainActions.includes(value.action) &&
    typeof value.id === 'string' && sha.test(value.requestSha256) &&
    Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 1 &&
    ['retained', 'running', 'failed', 'completed', 'cleared'].includes(value.phase),
    'The saved county report operation belongs to another original project.', 'QCEW_WORKSPACE_REQUEST_CHANGED', 409);
  operationId(value.id);
  return value;
}
function completedOperation(state, operation) {
  const result = state.operations.find(item => item.id === operation.id);
  if (!result) return null;
  need(result.kind === (operation.action === 'qcew.cpi' ? 'import' : operation.action),
    'The original county report action differs from the completed project operation.', 'QCEW_WORKSPACE_REQUEST_CHANGED', 409);
  return result;
}
async function retainedActionView(directory, state) {
  const operation = await retainedOperation(directory, state);
  if (!operation || operation.phase === 'cleared') return null;
  const completed = completedOperation(state, operation);
  return { ...clone(operation), phase: completed ? 'completed' : operation.phase,
    ...(completed ? { result: clone(completed.result) } : {}) };
}
async function removeOriginalInput(root) {
  try { await unlink(join(root, 'input.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function requestSelection(request) {
  return {
    ...(request.inputDirectory ? { inputDirectory: absoluteDirectory(request.inputDirectory) } : {}),
    ...(request.captureSha256 ? { captureSha256: sourceId(request.captureSha256, 'BLS source') } : {}),
    ...(request.cpiCaptureSha256 ? { cpiCaptureSha256: sourceId(request.cpiCaptureSha256, 'price source') } : {}),
    ...(request.profileId ? { profileId: sourceId(request.profileId, 'report profile') } : {}),
    ...(request.editionId ? { editionId: sourceId(request.editionId, 'county report edition') } : {}),
    ...(request.action === 'qcew.publish' ? { origin: request.origin, path: request.path ?? '/county-reports' } : {}),
    ...(request.period ? { period: period(request.period) } : {}),
    ...(request.targetDirectory ? { targetDirectory: absoluteDirectory(request.targetDirectory) } : {}),
    ...(request.bundle?.bundleSha256 ? { bundleSha256: sourceId(request.bundle.bundleSha256, 'complete project handover') } : {})
  };
}
async function completeWorkspaceOperation(root, operation, state) {
  const completed = completedOperation(state, operation);
  need(completed, 'Read the completed original county report operation.', 'QCEW_WORKSPACE_RESULT_MISSING', 409);
  await atomicJson(root, 'operation.json', { ...operation, phase: 'completed',
    completedAt: completed.completedAt, lastError: null });
  await removeOriginalInput(root);
  return { ...clone(completed.result), revision: state.revision, replayed: true };
}

/** One complete input remains on the private project host until its original
 * transaction settles. This survives a changed local port or browser profile. */
export async function runQcewWorkspaceAction({ directory, projectId, request, environment = process.env } = {}) {
  need(QCEW_WORKSPACE_ACTIONS.includes(request?.action), 'Choose a county report action.');
  const state = await originalProject(directory, projectId);
  operationId(request.id);
  const root = await privateDirectory(operationDirectory(directory));
  return withPrivateLock(root, 'operation.lock', async () => {
    let current = await originalProject(directory, projectId);
    let operation = await retainedOperation(directory, current);
    if (['qcew.continue', 'qcew.clear'].includes(request.action)) {
      need(operation && operation.id === request.id && operation.requestSha256 === request.requestSha256,
        'Continue the original saved county report action.', 'QCEW_WORKSPACE_REQUEST_CHANGED', 409);
      if (request.action === 'qcew.clear') {
        need(current.pending?.id !== operation.id, 'Finish or abandon the original project operation before clearing its input.',
          'QCEW_WORKSPACE_REQUEST_PENDING', 409);
        const completed = completedOperation(current, operation);
        need(completed || ['retained', 'failed', 'cleared'].includes(operation.phase) ||
          current.operations.some(item => item.kind === 'abandon' && item.result.pendingId === operation.id),
          'Continue the saved request to receive its original outcome before clearing it.', 'QCEW_WORKSPACE_OUTCOME_REQUIRED', 409);
        await atomicJson(root, 'operation.json', { ...operation, phase: 'cleared', clearedAt: new Date().toISOString() });
        await removeOriginalInput(root);
        return { requestId: operation.id, state: 'CLEARED', revision: current.revision };
      }
      if (completedOperation(current, operation)) return completeWorkspaceOperation(root, operation, current);
      need(operation.phase !== 'cleared', 'This browser input was cleared after its original operation ended.', 'QCEW_WORKSPACE_REQUEST_CLEARED', 409);
      request = await readPrivateJson(join(root, 'input.json'), QCEW_WORKSPACE_REQUEST_BYTES);
      need(digest(request) === operation.requestSha256 && request.id === operation.id && request.action === operation.action,
        'The saved county report input changed.', 'QCEW_WORKSPACE_REQUEST_CHANGED', 409);
    } else {
      need(Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 1,
        'Use the original economic project revision.');
      const requestSha256 = digest(request);
      if (operation && operation.id === request.id) {
        need(operation.requestSha256 === requestSha256 && operation.action === request.action,
          'This saved operation ID retains another county report selection.', 'QCEW_WORKSPACE_REQUEST_CHANGED', 409);
        if (completedOperation(current, operation)) return completeWorkspaceOperation(root, operation, current);
        need(operation.phase !== 'cleared', 'Choose a new action after clearing its ended input.', 'QCEW_WORKSPACE_REQUEST_CLEARED', 409);
      } else {
        const previous = current.operations.find(item => item.id === request.id);
        if (previous) return runOriginalQcewWorkspaceAction({ directory, projectId, request, environment });
        need(!operation || operation.phase === 'cleared' || completedOperation(current, operation),
          'Continue or clear the saved county report action before selecting another.', 'QCEW_WORKSPACE_REQUEST_PENDING', 409);
        operation = { schema: WORKSPACE_OPERATION, projectId: state.id, id: request.id, action: request.action,
          expectedRevision: request.expectedRevision, requestSha256, selection: requestSelection(request),
          phase: 'retained', retainedAt: new Date().toISOString(), lastError: null };
      }
      // The entire original request is durable before any project mutation.
      // A same-ID resend also repairs an interrupted input write.
      await atomicJson(root, 'input.json', request);
      await atomicJson(root, 'operation.json', operation);
    }
    operation = { ...operation, phase: 'running', lastError: null };
    await atomicJson(root, 'operation.json', operation);
    try {
      const result = await runOriginalQcewWorkspaceAction({ directory, projectId, request, environment });
      current = await readFredProject(directory);
      await completeWorkspaceOperation(root, operation, current);
      return result;
    } catch (error) {
      current = await readFredProject(directory);
      if (completedOperation(current, operation)) return completeWorkspaceOperation(root, operation, current);
      await atomicJson(root, 'operation.json', { ...operation, phase: 'failed',
        lastError: { code: error.code ?? 'QCEW_WORKSPACE_INTERRUPTED', message: error.message, at: new Date().toISOString() } });
      throw error;
    }
  });
}
