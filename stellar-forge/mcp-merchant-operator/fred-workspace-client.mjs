// MIT. Complete client for the original FRED economic-edition workspace.
import { constants } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJSONDigest } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/canonical-stream.mjs';
import { inspectFredReleaseCapture, normalizeFredReleaseSelection } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/model.mjs';
import { validateFredReleaseWatch } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/watch.mjs';
import { validateFredReleasePlan } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/planner.mjs';
export { inspectFredReleaseCapture } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/model.mjs';
import { inspectFredDdpCrosswalk } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/crosswalk.mjs';
import { inspectFredDdpPackage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/package.mjs';
import { ddpBoardUrl } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/files.mjs';
import { normalizeFredDdpMigrationInput, validateFredDdpMigrationPlan } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/migration.mjs';
import { validateFredDdpReceiving, FRED_DDP_RECEIVING_STATUSES } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/receiving.mjs';
import { validateFredDdpProjectBundle, validateFredDdpProjectState } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/project-validation.mjs';
export { inspectFredDdpCrosswalk, inspectFredDdpPackage };
import { validateQcewState, qcewStatePresent } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/state.mjs';
import { validateQcewExtension } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/bundle.mjs';

export const FRED_WORKSPACE_CONNECTION_SCHEMA = 'stellar-forge.fred-workspace-connection.v1';
export const FRED_CLIENT_MAX_BYTES = 256 * 1024 * 1024;
export const FRED_CLIENT_MAX_REQUEST_BYTES = 128 * 1024 * 1024;
export const FRED_DDP_MAX_SOURCE_BYTES = 384 * 1024 * 1024;
export const FRED_DDP_MAX_PROJECT_BYTES = 480 * 1024 * 1024;
export const fredDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const SHA = /^[a-f0-9]{64}$/;
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const UUID = /^[a-f0-9-]{36}$/;
export class FredWorkspaceError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'FredWorkspaceError'; this.code = code; Object.assign(this, details);
  }
}
const fail = (code, message, details) => { throw new FredWorkspaceError(code, message, details); };
function object(value, label = 'Input') {
  if (!plain(value)) fail('FRED_CLIENT_INPUT_INVALID', label + ' must be a JSON object.');
  return value;
}
function text(value, label, maximum = 2048) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\x00-\x1f\x7f]/.test(value))
    fail('FRED_CLIENT_INPUT_INVALID', 'Supply the original ' + label + '.');
  return value;
}
function digest(value, label = 'SHA256') {
  if (typeof value !== 'string' || !SHA.test(value)) fail('FRED_CLIENT_INPUT_INVALID', 'Supply the exact ' + label + '.');
  return value;
}
function operation(value) {
  if (typeof value !== 'string' || !ID.test(value)) fail('FRED_CLIENT_OPERATION_REQUIRED', 'Supply the same original operation or intent ID.');
  return value;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('FRED_CLIENT_REVISION_REQUIRED', 'Supply the current original project revision.');
  return value;
}
function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    fail('FRED_CLIENT_INPUT_INVALID', 'Supply a supported integer ' + label + '.');
  return value;
}

function recurringId(value, kind) {
  const pattern = kind === 'template' ? /^fred-template-[a-f0-9]{64}$/ : /^fred-successor-[a-f0-9]{64}$/;
  if (typeof value !== 'string' || !pattern.test(value))
    fail('FRED_CLIENT_INPUT_INVALID', 'Select the retained briefing ' + kind + ' ID.');
  return value;
}
function successorSelection(input, saved = false) {
  fields(input, ['templateId', 'captureId', 'anchorDate', 'baselineReviewId', 'previousSuccessorId', 'note',
    ...(saved ? ['id', 'expectedRevision', 'previewId'] : ['offset', 'limit', 'changesOnly'])], 'Successor selection');
  const value = JSON.parse(canonicalFredJSON(input));
  recurringId(value.templateId, 'template'); digest(value.captureId, 'target capture ID');
  for (const key of ['baselineReviewId', 'previousSuccessorId']) if (value[key] !== undefined && value[key] !== null) {
    if (key === 'baselineReviewId') digest(value[key], 'preceding saved review ID');
    else recurringId(value[key], 'successor');
  }
  if (value.anchorDate !== undefined && value.anchorDate !== null &&
      (typeof value.anchorDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.anchorDate)))
    fail('FRED_CLIENT_INPUT_INVALID', 'Use an explicit calendar anchor in YYYY-MM-DD form.');
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 8000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value.note)))
    fail('FRED_CLIENT_INPUT_INVALID', 'Supply the complete readable successor review note.');
  if (saved) {
    operation(value.id); revision(value.expectedRevision); digest(value.previewId, 'reviewed successor preview ID');
  } else {
    value.offset = integer(value.offset ?? 0, 0, 60000, 'change offset');
    value.limit = integer(value.limit ?? 100, 1, 500, 'change page size');
    if (value.changesOnly !== undefined && typeof value.changesOnly !== 'boolean')
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose a boolean changesOnly value.');
    value.changesOnly ??= true;
  }
  return value;
}
function successorChangePage(value, { captureId, comparisonId, offset, limit, changesOnly } = {}) {
  if (value?.schema !== 'stellar-forge.fred-briefing-changes.v1' || !SHA.test(value.comparisonId ?? '') ||
      !Array.isArray(value.rows) || !Number.isSafeInteger(value.rowCount) || value.rowCount < 0 || value.rowCount > 60000 ||
      !Number.isSafeInteger(value.filteredCount) || value.filteredCount < 0 || value.filteredCount > value.rowCount ||
      !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > value.filteredCount ||
      !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 500 || typeof value.changesOnly !== 'boolean' ||
      value.rows.length !== Math.min(value.limit, value.filteredCount - value.offset) ||
      value.nextOffset !== (value.offset + value.limit < value.filteredCount ? value.offset + value.limit : null) ||
      captureId !== undefined && value.after?.captureId !== captureId ||
      comparisonId !== undefined && value.comparisonId !== comparisonId ||
      offset !== undefined && value.offset !== offset || limit !== undefined && value.limit !== limit ||
      changesOnly !== undefined && value.changesOnly !== changesOnly)
    fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The saved report change page or original source binding changed.');
  return value;
}
function successorIdentity(value, successorId) {
  const record = value?.successor;
  if (record?.schema !== 'stellar-forge.fred-briefing-successor.v1' || record.id !== successorId ||
      value.template?.id !== record.templateId || value.materialization?.templateId !== record.templateId ||
      value.materialization?.captureId !== record.captureId || value.materialization?.originReviewId !== record.originReviewId ||
      value.comparison?.before?.reviewId !== record.beforeReviewId ||
      value.comparison?.before?.captureId !== record.beforeCaptureId ||
      value.briefing?.reviewId !== record.reviewId || value.briefing?.reportId !== record.reportId ||
      value.briefing?.manifest?.reviewId !== record.reviewId || value.briefing?.manifest?.captureId !== record.captureId ||
      value.briefing?.manifest?.reportId !== record.reportId)
    fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The received successor belongs to a different template, source or preceding report.');
  return value;
}
function successorView(value, successorId, paging) {
  successorIdentity(value, successorId);
  successorChangePage(value.comparison, { ...paging, captureId: value.successor.captureId, comparisonId: value.successor.comparison?.id });
  return value;
}
function successorFile(value, successorId) {
  successorIdentity(value, successorId);
  const comparison = value.comparison;
  if (comparison?.schema !== 'stellar-forge.fred-briefing-changes.v1' ||
      comparison.comparisonId !== value.successor.comparison?.id || comparison.after?.captureId !== value.successor.captureId ||
      !Array.isArray(comparison.rows) || comparison.rowCount !== comparison.rows.length)
    fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The full successor file lost its complete original comparison.');
  const { comparisonId, ...identity } = comparison;
  if (!SHA.test(comparisonId ?? '') || canonicalJSONDigest(identity, { primitive: canonicalFredJSON }) !== comparisonId)
    fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The complete successor comparison differs from its retained identity.');
  return value;
}

const RELEASE_CAPTURE_SECTIONS = ['series', 'releases', 'calendar', 'vintages'];
const RELEASE_PLAN_SECTIONS = ['acquisitions', 'calendarChanges', 'vintageChanges', 'events', 'schedule'];
function releaseId(value, kind) {
  const prefix = kind === 'watch' ? 'fred-release-watch-' : 'fred-release-plan-';
  if (typeof value !== 'string' || !value.startsWith(prefix) || !SHA.test(value.slice(prefix.length)))
    fail('FRED_CLIENT_INPUT_INVALID', 'Select the retained release ' + kind + ' ID.');
  return value;
}
function releaseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)
    fail('FRED_CLIENT_INPUT_INVALID', 'Supply a complete YYYY-MM-DD ' + label + '.');
  return value;
}
function releasePaging(input, sections, defaultSection) {
  const section = input.section ?? defaultSection;
  if (!sections.includes(section)) fail('FRED_CLIENT_INPUT_INVALID', 'Choose a declared release source or plan section.');
  return { section, offset: integer(input.offset ?? 0, 0, 1000000, 'release row offset'),
    limit: integer(input.limit ?? 100, 1, 500, 'release page size') };
}
function releaseRows(value, paging, rowKey, countKey) {
  const count = value?.[countKey], rows = value?.[rowKey];
  if (!Number.isSafeInteger(count) || count < 0 || !Array.isArray(rows) ||
      value.section !== paging.section || value.offset !== paging.offset || value.limit !== paging.limit ||
      rows.length !== Math.min(paging.limit, Math.max(0, count - paging.offset)) ||
      value.nextOffset !== (paging.offset + rows.length < count ? paging.offset + rows.length : null))
    fail('FRED_CLIENT_RELEASE_CHANGED', 'The original release page is incomplete or belongs to another selected section.');
  return value;
}
function releaseEnvelope(value, projectId) {
  if (value?.projectId !== projectId || !Number.isSafeInteger(value.revision) || value.revision < 1)
    fail('FRED_CLIENT_PROJECT_CHANGED', 'The release response belongs to another original project or revision.');
  return value;
}
function releaseCaptureSummary(capture, model = inspectFredReleaseCapture(capture)) {
  return { id: model.captureSha256, selection: model.selection, rowCount: model.rowCount,
    series: model.series.map(({ vintageDates, originalMetadata, ...item }) => ({ ...item,
      vintageCount: vintageDates.length, latestVintageDate: vintageDates.at(-1) ?? null })),
    releaseCount: model.releases.length, calendarRows: model.calendar.length, vintageRows: model.vintages.length,
    recordCount: capture.records.length };
}
function releasePlanSummary(plan) {
  const { id, watchId, beforeCaptureSha256, afterCaptureSha256, metadataAsOf, completedAsOf, summary, coverage } = plan;
  return { id, watchId, beforeCaptureSha256, afterCaptureSha256, metadataAsOf, completedAsOf, summary, coverage };
}
function releasePlanSelection(input, saved = false) {
  fields(input, ['watchId', 'beforeCaptureId', 'afterCaptureId',
    ...(saved ? ['id', 'expectedRevision', 'previewId'] : ['section', 'offset', 'limit'])], 'Release plan selection');
  releaseId(input.watchId, 'watch'); digest(input.afterCaptureId, 'selected release capture ID');
  if (input.beforeCaptureId != null) digest(input.beforeCaptureId, 'preceding release capture ID');
  const value = { ...input, beforeCaptureId: input.beforeCaptureId ?? null };
  if (saved) { operation(value.id); revision(value.expectedRevision); digest(value.previewId, 'reviewed release preview ID'); }
  else Object.assign(value, releasePaging(value, RELEASE_PLAN_SECTIONS, 'acquisitions'));
  return value;
}
function releasePlanPage(value, { planId, watchId, beforeCaptureId, afterCaptureId, ...paging }) {
  releaseId(value?.id, 'plan'); releaseId(value?.watchId, 'watch');
  digest(value.afterCaptureSha256, 'selected release capture ID');
  if (value.beforeCaptureSha256 !== null) digest(value.beforeCaptureSha256, 'preceding release capture ID');
  if (planId !== undefined && value.id !== planId || watchId !== undefined && value.watchId !== watchId ||
      beforeCaptureId !== undefined && value.beforeCaptureSha256 !== beforeCaptureId ||
      afterCaptureId !== undefined && value.afterCaptureSha256 !== afterCaptureId ||
      !plain(value.summary) || !plain(value.coverage))
    fail('FRED_CLIENT_RELEASE_CHANGED', 'The release plan page differs from the selected watch or complete source pair.');
  return releaseRows(value, paging, 'rows', 'count');
}
function releaseSavedResponse(value, input, valid) {
  if (!valid || !Number.isSafeInteger(value?.revision) || value.revision < 1)
    fail('FRED_CLIENT_RELEASE_CHANGED', 'The saved release response differs from the original operation selection.',
      { operationId: input.id, ambiguous: true, inspectOriginalOperation: true });
  return value;
}

const DDP_KINDS = ['crosswalks', 'packages', 'migrations', 'receivings'];
const DDP_PREFIXES = { crosswalk: 'fred-ddp-crosswalk-', package: 'fred-ddp-package-',
  migration: 'fred-ddp-migration-plan-', receiving: 'fred-ddp-receiving-' };
const DDP_STATUSES = FRED_DDP_RECEIVING_STATUSES;
function ddpId(value, kind) {
  const prefix = DDP_PREFIXES[kind];
  if (!prefix || typeof value !== 'string' || !value.startsWith(prefix) || !SHA.test(value.slice(prefix.length)))
    fail('FRED_CLIENT_INPUT_INVALID', 'Select the complete retained DDP ' + kind + ' ID.');
  return value;
}
function ddpPaging(input) {
  return { offset: integer(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER, 'DDP row offset'),
    limit: integer(input.limit ?? 100, 1, 500, 'DDP page size') };
}
function ddpRows(value, paging) {
  if (!Number.isSafeInteger(value?.total) || value.total < 0 || !Array.isArray(value.rows) ||
      value.offset !== paging.offset || value.limit !== paging.limit ||
      value.rows.length !== Math.min(paging.limit, Math.max(0, value.total - paging.offset)) ||
      value.nextOffset !== (paging.offset + value.rows.length < value.total ? paging.offset + value.rows.length : null))
    fail('FRED_CLIENT_DDP_CHANGED', 'The selected original DDP page is incomplete or its continuation changed.');
  return value;
}
function ddpEnvelope(value, projectId) {
  if (value?.projectId !== projectId || !Number.isSafeInteger(value.revision) || value.revision < 1)
    fail('FRED_CLIENT_PROJECT_CHANGED', 'The DDP response belongs to another original project or revision.');
  return value;
}
function ddpSeriesId(value, label = 'package series ID') {
  if (value !== null && value !== undefined) text(value, label, 1000);
  return value ?? null;
}
function ddpCounts(summary) {
  return plain(summary) && Object.entries(summary).every(([key, value]) => key === 'ready'
    ? typeof value === 'boolean' : key === 'counts'
      ? plain(value) && Object.entries(value).every(([status, count]) => DDP_STATUSES.includes(status) && Number.isSafeInteger(count) && count >= 0)
      : Number.isSafeInteger(value) && value >= 0);
}
function ddpIdentity(value, kind) {
  ddpId(value?.id, kind);
  if (kind === 'migration') return validateFredDdpMigrationPlan(value, { copy: false });
  if (kind === 'receiving') return validateFredDdpReceiving(value, { copy: false });
  return { crosswalk: inspectFredDdpCrosswalk, package: inspectFredDdpPackage }[kind](value);
}
function ddpMigrationInput(input, saved = false) {
  const sourceFields = ['name', 'asOf', 'window', 'decisions', 'bindings', 'pageSize', 'maxRows', 'bookmark', 'note'];
  fields(input, ['packageId', 'crosswalkId', ...sourceFields,
    ...(saved ? ['id', 'expectedRevision', 'previewId'] : ['section', 'offset', 'limit'])], 'DDP migration selection');
  ddpId(input.packageId, 'package'); ddpId(input.crosswalkId, 'crosswalk');
  const original = normalizeFredDdpMigrationInput(Object.fromEntries(
    sourceFields.filter(key => input[key] !== undefined).map(key => [key, input[key]])));
  const result = { packageId: input.packageId, crosswalkId: input.crosswalkId, ...original };
  if (saved) {
    result.id = operation(input.id); result.expectedRevision = revision(input.expectedRevision);
    result.previewId = digest(input.previewId, 'reviewed migration preview ID');
  } else {
    result.section = input.section ?? 'series';
    if (!['series', 'acquisitions', 'mappings'].includes(result.section))
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose series, acquisitions or mappings in the complete migration plan.');
    Object.assign(result, ddpPaging(input));
  }
  return result;
}
function ddpMigrationPage(value, input) {
  ddpId(value?.id, 'migration');
  if (input.migrationId !== undefined && value.id !== input.migrationId ||
      input.packageId !== undefined && value.packageId !== input.packageId ||
      input.crosswalkId !== undefined && value.crosswalkId !== input.crosswalkId ||
      value.section !== input.section || !ddpCounts(value.summary) || !plain(value.input))
    fail('FRED_CLIENT_DDP_CHANGED', 'The migration page differs from the selected original package, crosswalk or section.');
  ddpId(value.packageId, 'package'); ddpId(value.crosswalkId, 'crosswalk');
  digest(value.packageSha256, 'original package digest'); digest(value.crosswalkSha256, 'original crosswalk digest');
  return ddpRows(value, input);
}
function ddpSaved(value, input, valid) {
  if (!valid || !Number.isSafeInteger(value?.revision) || value.revision < 1)
    fail('FRED_CLIENT_DDP_CHANGED', 'The saved DDP result differs from its original operation selection.',
      { operationId: input.id, ambiguous: true, inspectOriginalOperation: true });
  return value;
}

function fields(value, allowed, label) {
  object(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key)))
    fail('FRED_CLIENT_INPUT_INVALID', label + ' contains an undeclared field.');
}
export function canonicalFredJSON(value) {
  if (value === null || typeof value !== 'object') {
    if (value === undefined || typeof value === 'number' && !Number.isFinite(value))
      fail('FRED_CLIENT_JSON_INVALID', 'Use complete, finite JSON values.');
    const result = JSON.stringify(value);
    if (result === undefined) fail('FRED_CLIENT_JSON_INVALID', 'Use JSON values.');
    return result;
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalFredJSON).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalFredJSON(value[key])).join(',') + '}';
}

/** Reads the complete original regular file through one stable descriptor. */
export async function readFredHostFile(path, maximum = FRED_CLIENT_MAX_BYTES, { privateFile = false, expectedSha256 } = {}) {
  integer(maximum, 1, FRED_DDP_MAX_PROJECT_BYTES, 'file capacity');
  if (expectedSha256 !== undefined) digest(expectedSha256);
  const handle = await open(resolve(text(path, 'file path', 8192)),
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maximum || privateFile && (before.nlink !== 1 ||
        process.platform !== 'win32' && (before.mode & 0o077 || typeof process.getuid === 'function' && before.uid !== process.getuid())))
      fail('FRED_CLIENT_FILE_INVALID', 'Select a regular file within its capacity; the original connection record must be private and owned by this user.');
    const bytes = await handle.readFile(), after = await handle.stat();
    if (bytes.length !== before.size || ['size', 'mtimeMs', 'ctimeMs', 'ino', 'dev'].some(key => before[key] !== after[key]))
      fail('FRED_CLIENT_FILE_CHANGED', 'The selected original file changed during its read.');
    if (expectedSha256 && fredDigest(bytes) !== expectedSha256)
      fail('FRED_CLIENT_FILE_CHANGED', 'The selected original file differs from its reviewed SHA256.');
    return bytes;
  } finally { await handle.close(); }
}

export async function readFredWorkspaceConfiguration(path) {
  path = resolve(text(path, 'connection configuration path', 8192));
  let raw;
  try { raw = JSON.parse((await readFredHostFile(path, 1024 * 1024, { privateFile: true })).toString('utf8')); }
  catch (error) { if (error instanceof FredWorkspaceError) throw error; fail('FRED_CONNECTION_INVALID', 'Read a complete private FRED connection JSON file.'); }
  fields(raw, ['schema', 'workspaces'], 'Connection');
  if (raw.schema !== FRED_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces) ||
      Object.keys(raw.workspaces).length < 1 || Object.keys(raw.workspaces).length > 32)
    fail('FRED_CONNECTION_INVALID', 'Declare 1–32 original workspace aliases under the FRED connection schema.');
  const workspaces = Object.create(null), base = dirname(path);
  for (const [alias, value] of Object.entries(raw.workspaces)) {
    if (!ALIAS.test(alias)) fail('FRED_CONNECTION_INVALID', 'Use a lowercase workspace alias.');
    fields(value, ['label', 'consoleUrlFile', 'consoleUrlEnv', 'projectId', 'expectedBindingSha256',
      'timeoutMs', 'maxResponseBytes', 'maxDdpResponseBytes', 'inputs', 'merchantProfiles'], 'Workspace');
    if (Boolean(value.consoleUrlFile) === Boolean(value.consoleUrlEnv))
      fail('FRED_CONNECTION_INVALID', 'Select exactly one original consoleUrlFile or consoleUrlEnv.');
    const entry = { label: text(value.label ?? alias, 'workspace label', 240),
      inputs: Object.create(null), merchantProfiles: Object.create(null) };
    if (value.consoleUrlFile) entry.consoleUrlFile = resolve(base, text(value.consoleUrlFile, 'native connection record path', 8192));
    if (value.consoleUrlEnv) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.consoleUrlEnv))
        fail('FRED_CONNECTION_INVALID', 'Name the host environment variable retaining the original workspace connection.');
      entry.consoleUrlEnv = value.consoleUrlEnv;
    }
    if (value.projectId !== undefined) {
      if (!UUID.test(value.projectId)) fail('FRED_CONNECTION_INVALID', 'Use the exact original project ID.');
      entry.projectId = value.projectId;
    }
    if (value.expectedBindingSha256 !== undefined) entry.expectedBindingSha256 = digest(value.expectedBindingSha256, 'launch binding SHA256');
    for (const [key, maximum] of [['timeoutMs', 30 * 60 * 1000], ['maxResponseBytes', FRED_CLIENT_MAX_BYTES], ['maxDdpResponseBytes', FRED_DDP_MAX_PROJECT_BYTES]])
      if (value[key] !== undefined) entry[key] = integer(value[key], 1, maximum, key);
    if (value.inputs !== undefined) {
      object(value.inputs, 'Host inputs');
      if (Object.keys(value.inputs).length > 128) fail('FRED_CONNECTION_INVALID', 'Declare at most 128 original input aliases.');
      for (const [name, input] of Object.entries(value.inputs)) {
        if (!ALIAS.test(name)) fail('FRED_CONNECTION_INVALID', 'Use a lowercase input alias.');
        fields(input, ['path', 'kind', 'label', 'sha256'], 'Host input');
        if (!['public-table', 'capture', 'release-capture', 'ddp-crosswalk', 'ddp-package', 'alfred-metadata'].includes(input.kind))
          fail('FRED_CONNECTION_INVALID', 'Select a complete original observation, release, DDP source or historical ALFRED metadata input.');
        entry.inputs[name] = { path: resolve(base, text(input.path, 'original source path', 8192)),
          kind: input.kind, label: text(input.label ?? name, 'input label', 240),
          ...(input.sha256 === undefined ? {} : { sha256: digest(input.sha256, 'complete input file SHA256') }) };
      }
    }
    if (value.merchantProfiles !== undefined) {
      object(value.merchantProfiles, 'Merchant profiles');
      if (Object.keys(value.merchantProfiles).length > 32) fail('FRED_CONNECTION_INVALID', 'Declare at most 32 original merchant profiles.');
      for (const [name, profile] of Object.entries(value.merchantProfiles)) {
        if (!ALIAS.test(name)) fail('FRED_CONNECTION_INVALID', 'Use a lowercase merchant profile alias.');
        fields(profile, ['label', 'origin', 'path', 'payment'], 'Merchant profile');
        let origin;
        try { origin = new URL(profile.origin); } catch { fail('FRED_CONNECTION_INVALID', 'Select the original merchant HTTPS origin.'); }
        if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/')
          fail('FRED_CONNECTION_INVALID', 'Select an HTTPS merchant origin without credentials or an added path.');
        object(profile.payment, 'Original public payment terms');
        const route = profile.path ?? '/economic-data';
        if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || /[?#\s]/.test(route))
          fail('FRED_CONNECTION_INVALID', 'Select the original publication route.');
        entry.merchantProfiles[name] = { label: text(profile.label ?? name, 'merchant label', 240),
          origin: origin.origin, path: route, payment: JSON.parse(canonicalFredJSON(profile.payment)) };
      }
    }
    workspaces[alias] = entry;
  }
  return Object.freeze({ schema: raw.schema, path, workspaces });
}

function connection(raw, definition, boundId) {
  let value = raw;
  if (typeof value === 'string') {
    value = value.trim();
    if (value.startsWith('{')) {
      try { value = JSON.parse(value); } catch { fail('FRED_CONNECTION_INVALID', 'Use the complete original startup JSON record or private session URL.'); }
    }
  }
  let rawUrl = value, projectId = definition.projectId ?? boundId, bindingSha256 = definition.expectedBindingSha256;
  if (plain(value)) {
    if (value.schema !== undefined && value.schema !== 'stellar-forge.fred-workspace-startup.v1')
      fail('FRED_CONNECTION_INVALID', 'Use the original FRED workspace startup record.');
    rawUrl = value.url;
    const recordedId = value.binding?.projectId ?? value.projectId;
    if (recordedId !== undefined) {
      if (projectId !== undefined && projectId !== recordedId) fail('FRED_CLIENT_PROJECT_CHANGED', 'This connection record belongs to a different original project.');
      projectId = recordedId;
    }
    const recordedBinding = value.binding?.sha256 ?? value.bindingSha256;
    if (recordedBinding !== undefined) {
      digest(recordedBinding, 'recorded native binding SHA256');
      if (bindingSha256 !== undefined && bindingSha256 !== recordedBinding)
        fail('FRED_CLIENT_BINDING_CHANGED', 'The original configured launch binding changed.');
      bindingSha256 = recordedBinding;
    }
  }
  if (!UUID.test(projectId ?? '')) fail('FRED_CONNECTION_INVALID', 'Retain the original projectId in the startup record or connection definition.');
  if (boundId !== undefined && projectId !== boundId) fail('FRED_CLIENT_PROJECT_CHANGED', 'This client remains bound to its original project.');
  let url;
  try { url = new URL(rawUrl); } catch { fail('FRED_CONNECTION_INVALID', 'Read the original private URL printed by fred serve.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password ||
      url.pathname !== '/' || url.search || !/^#[a-f0-9]{64}$/.test(url.hash))
    fail('FRED_CONNECTION_INVALID', 'Use the unchanged original loopback FRED URL and session fragment.');
  return { origin: url.origin, token: url.hash.slice(1), projectId, bindingSha256,
    fingerprint: fredDigest(Buffer.from(url.href + '\n' + projectId + '\n' + (bindingSha256 ?? ''))) };
}
async function responseBytes(response, maximum) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maximum)) {
    await response.body?.cancel().catch(() => {});
    fail('FRED_CLIENT_RESPONSE_TOO_LARGE', 'The complete original response exceeds the selected byte capacity.');
  }
  const reader = response.body?.getReader(), chunks = []; let size = 0;
  if (!reader) {
    if (declared !== null && Number(declared) !== 0) fail('FRED_CLIENT_RESPONSE_INCOMPLETE', 'The original response body was not received.');
    return Buffer.alloc(0);
  }
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { await reader.cancel(); fail('FRED_CLIENT_RESPONSE_TOO_LARGE', 'The complete original response exceeds the selected byte capacity.'); }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  if (declared !== null && size !== Number(declared)) fail('FRED_CLIENT_RESPONSE_INCOMPLETE', 'The original response ended before its declared byte count.');
  return Buffer.concat(chunks, size);
}
function page(result, key) {
  if (!plain(result) || !Array.isArray(result[key]) || !Number.isSafeInteger(result.total) ||
      !Number.isSafeInteger(result.offset) || result.offset < 0 || result.total < result.offset ||
      result.offset + result[key].length > result.total)
    fail('FRED_CLIENT_RESPONSE_INVALID', 'The original page response is incomplete.');
  if (result.offset < result.total && result[key].length === 0)
    fail('FRED_CLIENT_RESPONSE_INVALID', 'The original page did not advance within its declared rows.');
  return { ...result, nextOffset: result.offset + result[key].length < result.total ? result.offset + result[key].length : null };
}

/** Attaches to the existing server; every mutation has one native HTTP attempt. */
export class FredWorkspaceClient {
  #definition; #environment; #fetch; #lifetime = new AbortController(); #boundId; #bound; #binding; #closed = false;
  constructor(definition, { environment = process.env, fetchImpl = globalThis.fetch } = {}) {
    object(definition, 'Host connection');
    if ([definition.url, definition.consoleUrlFile, definition.consoleUrlEnv].filter(value => value !== undefined).length !== 1 ||
        typeof fetchImpl !== 'function')
      fail('FRED_CONNECTION_INVALID', 'Select one original URL, native startup file or host variable.');
    this.#definition = { ...definition }; this.#environment = environment; this.#fetch = fetchImpl;
    this.timeoutMs = integer(definition.timeoutMs ?? 120000, 1, 30 * 60 * 1000, 'request timeout');
    this.maxResponseBytes = integer(definition.maxResponseBytes ?? FRED_CLIENT_MAX_BYTES, 1, FRED_CLIENT_MAX_BYTES, 'response capacity');
    this.maxDdpResponseBytes = integer(definition.maxDdpResponseBytes ?? FRED_DDP_MAX_PROJECT_BYTES, 1, FRED_DDP_MAX_PROJECT_BYTES, 'DDP file response capacity');
    if (definition.projectId !== undefined && !UUID.test(definition.projectId))
      fail('FRED_CONNECTION_INVALID', 'Use the exact original project ID.');
    if (definition.expectedBindingSha256 !== undefined) digest(definition.expectedBindingSha256);
    this.#boundId = definition.projectId;
  }
  get metadata() {
    return { projectId: this.#boundId ?? null, connected: Boolean(this.#bound), closed: this.#closed,
      bindingSha256: this.#bound?.launch.binding.sha256 ?? null, instanceId: this.#bound?.launch.instanceId ?? null,
      timeoutMs: this.timeoutMs, maxResponseBytes: this.maxResponseBytes, maxDdpResponseBytes: this.maxDdpResponseBytes, hostOwnership: 'ORIGINAL_FRED_WORKSPACE' };
  }
  async #connection() {
    if (this.#closed) fail('FRED_CLIENT_CLOSED', 'The FRED workspace client is closed.');
    const definition = this.#definition;
    const raw = definition.consoleUrlFile
      ? (await readFredHostFile(definition.consoleUrlFile, 65536, { privateFile: true })).toString('utf8')
      : definition.consoleUrlEnv ? this.#environment[definition.consoleUrlEnv] : definition.url;
    return connection(raw, definition, this.#boundId);
  }
  async #fetchResponse(selected, path, { method = 'GET', body, signal, operationId, maximum, readOnly = false } = {}) {
    const headers = { accept: 'application/json', authorization: 'Bearer ' + selected.token, origin: selected.origin };
    let encoded;
    if (body !== undefined) {
      encoded = JSON.stringify(body);
      const requestCapacity = path === '/api/action' && ['ddp-crosswalk-import', 'ddp-package-import'].includes(body?.action)
        ? FRED_DDP_MAX_SOURCE_BYTES : FRED_CLIENT_MAX_REQUEST_BYTES;
      if (Buffer.byteLength(encoded) > requestCapacity)
        fail('FRED_CLIENT_REQUEST_TOO_LARGE', 'The complete original request exceeds the native workspace capacity.');
      headers['content-type'] = 'application/json';
    }
    const requestSignal = AbortSignal.any([this.#lifetime.signal, AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]);
    const details = { method, path, projectId: selected.projectId, ...(operationId ? { operationId } : {}) };
    let response, bytes;
    try { response = await this.#fetch(selected.origin + path, { method, headers, ...(encoded === undefined ? {} : { body: encoded }),
      redirect: 'error', signal: requestSignal }); }
    catch { fail('FRED_CLIENT_TRANSPORT_ERROR', 'The original response was not received. Inspect the same project operation or recover the same customer intent.',
      { ...details, ambiguous: method !== 'GET' && !readOnly, responseReceived: false }); }
    try { bytes = await responseBytes(response, maximum ?? this.maxResponseBytes); }
    catch (error) {
      throw new FredWorkspaceError(error.code ?? 'FRED_CLIENT_RESPONSE_INCOMPLETE',
        error instanceof FredWorkspaceError ? error.message : 'The original response body did not complete.',
        { ...details, status: response.status, ambiguous: method !== 'GET' && !readOnly, responseReceived: true });
    }
    if (!response.ok) {
      let original; try { original = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch {}
      const error = original?.error ?? original;
      const code = typeof error?.code === 'string' ? error.code : 'FRED_CLIENT_HTTP_ERROR';
      const message = (typeof error?.message === 'string' ? error.message : 'The original workspace rejected the request.')
        .split(selected.token).join('[private]').slice(0, 6000);
      fail(code, message, { ...details, status: response.status, ambiguous: method !== 'GET' && !readOnly && response.status >= 500,
        responseReceived: true, inspectOriginalOperation: method !== 'GET' && !readOnly, responseBytes: bytes.length, responseSha256: fredDigest(bytes),
        ...(typeof error?.retryAt === 'string' ? { retryAt: error.retryAt } : {}) });
    }
    return { response, bytes };
  }
  async #connect(signal) {
    signal?.throwIfAborted();
    const selected = await this.#connection();
    if (this.#bound?.fingerprint === selected.fingerprint) return selected;
    if (this.#binding) { await this.#binding; signal?.throwIfAborted(); return this.#connect(signal); }
    this.#binding = (async () => {
      const result = await this.#fetchResponse(selected, '/api/launch', { signal, maximum: 65536 });
      let launch; try { launch = JSON.parse(result.bytes.toString('utf8')); } catch { fail('FRED_CLIENT_RESPONSE_INVALID', 'The original launch response was not JSON.'); }
      if (launch?.schema !== 'stellar-forge.fred-workspace-startup.v1' || launch.state !== 'LISTENING' ||
          launch.binding?.schema !== 'stellar-forge.fred-workspace-binding.v1' || launch.binding.projectId !== selected.projectId)
        fail('FRED_CLIENT_PROJECT_CHANGED', 'The selected native server does not belong to the original project.');
      const { sha256, ...core } = launch.binding;
      if (!SHA.test(sha256 ?? '') || canonicalJSONDigest(core, { primitive: canonicalFredJSON }) !== sha256 ||
          selected.bindingSha256 !== undefined && selected.bindingSha256 !== sha256)
        fail('FRED_CLIENT_BINDING_CHANGED', 'The native launch differs from its exact original project and operator binding.');
      if (this.#closed) fail('FRED_CLIENT_CLOSED', 'The client closed during its original launch read.');
      this.#boundId = selected.projectId; this.#bound = { fingerprint: selected.fingerprint, launch };
    })();
    try { await this.#binding; } finally { this.#binding = null; }
    return selected;
  }
  async #request(path, options = {}) {
    const selected = await this.#connect(options.signal);
    return this.#fetchResponse(selected, path, options);
  }
  async #json(path, options = {}) {
    const result = await this.#request(path, options);
    try { return JSON.parse(result.bytes.toString('utf8')); }
    catch { fail('FRED_CLIENT_RESPONSE_INVALID', 'The original response was not complete JSON.',
      { ambiguous: options.method === 'POST' && !options.readOnly, ...(options.operationId ? { operationId: options.operationId } : {}) }); }
  }
  async launch(options = {}) {
    await this.#connect(options.signal);
    return JSON.parse(JSON.stringify(this.#bound.launch));
  }
  async state(options = {}) {
    const value = await this.#json('/api/state', options);
    if (value?.project?.schema !== 'stellar-forge.fred-project.v1' || value.project.id !== this.#boundId)
      fail('FRED_CLIENT_PROJECT_CHANGED', 'The selected workspace no longer exposes its original project.');
    validateFredDdpProjectState(value.project);
    validateQcewState(value.project);
    return value;
  }
  async operation(id, options = {}) {
    operation(id); const state = await this.state(options);
    return { projectId: state.project.id, revision: state.project.revision, busy: state.busy,
      operation: state.project.operations.find(item => item.id === id) ?? null,
      pending: state.project.pending?.id === id ? state.project.pending : null, acquisition: state.project.acquisition ?? null };
  }
  async observations({ captureId, series, offset = 0 }, options) {
    const query = new URLSearchParams({ capture: digest(captureId, 'capture ID'), offset: String(integer(offset, 0, 1000000, 'observation offset')) });
    if (series !== undefined) query.set('series', text(series, 'native series ID', 120));
    const result = page(await this.#json('/api/observations?' + query, options), 'rows');
    if (result.captureId !== captureId) fail('FRED_CLIENT_CAPTURE_CHANGED', 'The response belongs to a different original capture.');
    return result;
  }
  async compare({ before, after, offset = 0 }, options) {
    const query = new URLSearchParams({ before: digest(before, 'earlier capture ID'), after: digest(after, 'later capture ID'),
      offset: String(integer(offset, 0, 1000000, 'comparison offset')) });
    return page(await this.#json('/api/compare?' + query, options), 'changes');
  }
  async previewBriefing({ captureId, briefing, offset = 0 }, options) {
    digest(captureId, 'capture ID'); object(briefing, 'Original analyst selection');
    const value = await this.#json('/api/briefing-preview', { ...options, method: 'POST', readOnly: true,
      body: { captureId, briefing, offset: integer(offset, 0, 30000, 'measure offset') } });
    return briefingPage(value, { captureId, reviewId: null });
  }
  async briefing({ reviewId, offset = 0 }, options) {
    digest(reviewId, 'saved analyst review ID');
    return briefingPage(await this.#json('/api/briefing?' + new URLSearchParams({ review: reviewId,
      offset: String(integer(offset, 0, 30000, 'measure offset')) }), options), { reviewId });
  }
  async briefingTemplates(options = {}) {
    const value = await this.#json('/api/briefing-templates', options);
    if (value?.projectId !== this.#boundId || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
        !Array.isArray(value.templates) || !Array.isArray(value.successors))
      fail('FRED_CLIENT_PROJECT_CHANGED', 'The briefing inventory does not belong to the original project revision.');
    const templates = new Set(), successors = new Set();
    for (const item of value.templates) {
      recurringId(item?.id, 'template');
      if (templates.has(item.id)) fail('FRED_CLIENT_RESPONSE_INVALID', 'The original template inventory repeats a saved ID.');
      templates.add(item.id);
    }
    for (const item of value.successors) {
      recurringId(item?.id, 'successor');
      if (successors.has(item.id) || !templates.has(item.templateId))
        fail('FRED_CLIENT_RESPONSE_INVALID', 'The original successor inventory has a repeated or unbound saved ID.');
      successors.add(item.id);
    }
    return value;
  }
  async saveBriefingTemplate(input, options) {
    fields(input, ['id', 'expectedRevision', 'reviewId', 'name', 'window', 'previousTemplateId'], 'Briefing template');
    const body = JSON.parse(canonicalFredJSON(input));
    digest(body.reviewId, 'original saved analyst review ID');
    if (body.name !== undefined) text(body.name, 'briefing template name', 160);
    if (body.window !== undefined) {
      fields(body.window, ['months', 'anchor', 'lagMonths'], 'Calendar window');
      if (body.window.months !== undefined) integer(body.window.months, 1, 1200, 'calendar months');
      if (body.window.lagMonths !== undefined) integer(body.window.lagMonths, 0, 1200, 'calendar lag months');
      if (body.window.anchor !== undefined && !['latest_all', 'latest_any'].includes(body.window.anchor))
        fail('FRED_CLIENT_INPUT_INVALID', 'Choose latest_all or latest_any for the original observation-date anchor.');
    }
    if (body.previousTemplateId !== undefined && body.previousTemplateId !== null) recurringId(body.previousTemplateId, 'template');
    const value = await this.#action('template-save', body, options);
    if (!/^fred-template-[a-f0-9]{64}$/.test(value?.templateId ?? '') ||
        value.template?.id !== value.templateId || value.template?.origin?.reviewId !== body.reviewId)
      fail('FRED_CLIENT_TEMPLATE_CHANGED', 'The saved template response differs from the original reviewed selection.',
        { operationId: body.id, ambiguous: true, inspectOriginalOperation: true });
    return value;
  }
  async previewBriefingSuccessor(input, options) {
    const body = successorSelection(input);
    const value = await this.#json('/api/briefing-successor-preview', {
      ...options, method: 'POST', readOnly: true, body
    });
    if (!SHA.test(value?.previewId ?? '') || !SHA.test(value?.reviewId ?? '') ||
        value.template?.id !== body.templateId || value.materialization?.templateId !== body.templateId ||
        value.materialization?.captureId !== body.captureId ||
        value.briefing?.captureId !== body.captureId || value.briefing?.reviewId !== value.reviewId ||
        body.baselineReviewId != null && value.baselineReviewId !== body.baselineReviewId ||
        body.previousSuccessorId != null && value.previousSuccessorId !== body.previousSuccessorId)
      fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The successor preview differs from the selected template, source or report lineage.');
    successorChangePage(value.comparison, { captureId: body.captureId, offset: body.offset, limit: body.limit, changesOnly: body.changesOnly });
    return value;
  }
  async saveBriefingSuccessor(input, options) {
    const body = successorSelection(input, true);
    const value = await this.#action('successor-save', body, options);
    if (!/^fred-successor-[a-f0-9]{64}$/.test(value?.successorId ?? '') || value.templateId !== body.templateId ||
        value.captureId !== body.captureId || !SHA.test(value.reviewId ?? ''))
      fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The saved successor response differs from its original reviewed preview.',
        { operationId: body.id, ambiguous: true, inspectOriginalOperation: true });
    return value;
  }
  async briefingSuccessor({ successorId, offset = 0, limit = 100, changesOnly = true }, options) {
    recurringId(successorId, 'successor');
    integer(offset, 0, 60000, 'change offset'); integer(limit, 1, 500, 'change page size');
    if (typeof changesOnly !== 'boolean') fail('FRED_CLIENT_INPUT_INVALID', 'Choose a boolean changesOnly value.');
    const query = new URLSearchParams({ successor: successorId, offset: String(offset), limit: String(limit), changesOnly: changesOnly ? '1' : '0' });
    return successorView(await this.#json('/api/briefing-successor?' + query, options), successorId, { offset, limit, changesOnly });
  }

  async releaseCaptures(options = {}) {
    const value = releaseEnvelope(await this.#json('/api/release-captures', options), this.#boundId);
    if (!Array.isArray(value.captures)) fail('FRED_CLIENT_RELEASE_CHANGED', 'The complete release capture inventory is missing.');
    const seen = new Set();
    for (const item of value.captures) {
      digest(item?.id, 'release capture ID');
      if (seen.has(item.id) || !plain(item.selection) || !Array.isArray(item.series) ||
          ['rowCount', 'releaseCount', 'calendarRows', 'vintageRows', 'recordCount'].some(key =>
            !Number.isSafeInteger(item[key]) || item[key] < 0))
        fail('FRED_CLIENT_RELEASE_CHANGED', 'The release source inventory repeats or loses an original source descriptor.');
      seen.add(item.id);
    }
    return value;
  }
  async releaseWatches(options = {}) {
    const value = releaseEnvelope(await this.#json('/api/release-watches', options), this.#boundId);
    if (!Array.isArray(value.watches) || !Array.isArray(value.plans) || !Array.isArray(value.catchUps))
      fail('FRED_CLIENT_RELEASE_CHANGED', 'The complete release watch, plan or catch-up inventory is missing.');
    const watches = new Set(), plans = new Set(), completed = new Set();
    for (const item of value.watches) {
      validateFredReleaseWatch(item);
      if (watches.has(item.id)) fail('FRED_CLIENT_RELEASE_CHANGED', 'The original release inventory repeats a watch.');
      watches.add(item.id);
    }
    for (const item of value.plans) {
      releaseId(item?.id, 'plan');
      if (plans.has(item.id) || !watches.has(item.watchId))
        fail('FRED_CLIENT_RELEASE_CHANGED', 'The original release plan lost its watch binding.');
      plans.add(item.id);
    }
    for (const item of value.catchUps) {
      const key = item?.planId + '|' + item?.asOf;
      if (!plans.has(item?.planId) || !watches.has(item.watchId) || completed.has(key) ||
          item.selection?.asOf !== item.asOf || !SHA.test(item.captureId ?? ''))
        fail('FRED_CLIENT_RELEASE_CHANGED', 'The saved catch-up inventory lost its plan, source or date binding.');
      completed.add(key);
    }
    return value;
  }
  async releaseCapture({ releaseCaptureId, section = 'series', offset = 0, limit = 100 }, options) {
    digest(releaseCaptureId, 'release capture ID');
    const paging = releasePaging({ section, offset, limit }, RELEASE_CAPTURE_SECTIONS, 'series');
    const query = new URLSearchParams({ capture: releaseCaptureId, section: paging.section,
      offset: String(paging.offset), limit: String(paging.limit) });
    const value = releaseEnvelope(await this.#json('/api/release-capture?' + query, options), this.#boundId);
    if (value.releaseCaptureId !== releaseCaptureId || !plain(value.selection) || !plain(value.source) || !plain(value.counts) ||
        RELEASE_CAPTURE_SECTIONS.some(key => !Number.isSafeInteger(value.counts[key]) || value.counts[key] < 0) ||
        value.total !== value.counts[paging.section])
      fail('FRED_CLIENT_RELEASE_CHANGED', 'The release source page differs from its selected complete capture.');
    return releaseRows(value, paging, 'items', 'total');
  }
  async importReleaseCapture(input, options) {
    fields(input, ['id', 'expectedRevision', 'capture', 'releaseCaptureId'], 'Release source import');
    const body = JSON.parse(canonicalFredJSON(input));
    if (input.capture !== undefined && input.capture !== null) {
      const model = inspectFredReleaseCapture(input.capture);
      if (input.releaseCaptureId !== undefined && input.releaseCaptureId !== model.captureSha256)
        fail('FRED_CLIENT_INPUT_INVALID', 'The complete release input and selected capture ID must agree.');
      body.releaseCaptureId = model.captureSha256;
    } else digest(input.releaseCaptureId, 'staged original release capture ID');
    const value = await this.#action('release-import', body, options);
    return releaseSavedResponse(value, body, value?.releaseCaptureId === body.releaseCaptureId &&
      value.capture?.id === body.releaseCaptureId);
  }
  async acquireReleaseCapture(input, options) {
    fields(input, ['id', 'expectedRevision', 'selection'], 'Release source acquisition');
    const body = input.selection === undefined ? { ...input } : { ...input, selection: normalizeFredReleaseSelection(input.selection) };
    const value = await this.#action('release-capture', body, options);
    return releaseSavedResponse(value, body, SHA.test(value?.releaseCaptureId ?? '') &&
      value.capture?.id === value.releaseCaptureId &&
      (body.selection === undefined || canonicalFredJSON(value.capture?.selection ?? null) === canonicalFredJSON(body.selection)));
  }
  async saveReleaseWatch(input, options) {
    fields(input, ['id', 'expectedRevision', 'name', 'series', 'templateId', 'observationStart',
      'observationEnd', 'baselineAsOf', 'catchUp', 'pageSize', 'maxRows'], 'Release watch');
    input = JSON.parse(canonicalFredJSON(input));
    text(input.name, 'release watch name', 200);
    if (input.series !== undefined && (!Array.isArray(input.series) || input.series.length < 1 || input.series.length > 50 ||
        new Set(input.series).size !== input.series.length || input.series.some(id => typeof id !== 'string' || id.length < 1 || id.length > 120)))
      fail('FRED_CLIENT_INPUT_INVALID', 'Watch every original series in a distinct complete series list.');
    if (input.templateId != null) recurringId(input.templateId, 'template');
    if (input.series === undefined && input.templateId == null)
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose an original series list or a retained briefing template.');
    releaseDate(input.observationStart, 'observation start'); releaseDate(input.baselineAsOf, 'baseline as-of date');
    if (input.observationEnd !== undefined && input.observationEnd !== 'as_of') releaseDate(input.observationEnd, 'observation end');
    if (input.catchUp !== undefined && !['all_vintages', 'latest_vintage'].includes(input.catchUp))
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose all_vintages or latest_vintage for catch-up.');
    if (input.pageSize !== undefined) integer(input.pageSize, 1, 100000, 'observation page size');
    if (input.maxRows !== undefined) integer(input.maxRows, 1, 1000000, 'observation row capacity');
    const value = await this.#action('release-watch-save', input, options);
    let valid = false;
    try {
      const watch = validateFredReleaseWatch(value?.watch);
      valid = value.watchId === watch.id && watch.name === input.name.trim() &&
        watch.observationStart === input.observationStart && watch.baselineAsOf === input.baselineAsOf &&
        watch.observationEnd === (input.observationEnd ?? 'as_of') && watch.catchUp === (input.catchUp ?? 'all_vintages') &&
        watch.pageSize === (input.pageSize ?? 1000) && watch.maxRows === (input.maxRows ?? 1000000) &&
        (watch.template?.id ?? null) === (input.templateId ?? null) &&
        (input.series === undefined || canonicalFredJSON(watch.series) === canonicalFredJSON([...input.series].sort()));
    } catch { /* The original operation still owns any uncertain saved response. */ }
    return releaseSavedResponse(value, input, valid);
  }
  async previewReleasePlan(input, options) {
    const body = releasePlanSelection(input);
    const value = releaseEnvelope(await this.#json('/api/release-plan-preview',
      { ...options, method: 'POST', readOnly: true, body }), this.#boundId);
    digest(value.previewId, 'release preview ID');
    releasePlanPage(value.plan, body);
    return value;
  }
  async saveReleasePlan(input, options) {
    const body = releasePlanSelection(input, true), value = await this.#action('release-plan-save', body, options);
    return releaseSavedResponse(value, body, /^fred-release-plan-[a-f0-9]{64}$/.test(value?.planId ?? '') &&
      value.plan?.id === value.planId && value.plan.watchId === body.watchId &&
      value.plan.beforeCaptureSha256 === body.beforeCaptureId && value.plan.afterCaptureSha256 === body.afterCaptureId);
  }
  async releasePlan({ planId, section = 'acquisitions', offset = 0, limit = 100 }, options) {
    releaseId(planId, 'plan');
    const paging = releasePaging({ section, offset, limit }, RELEASE_PLAN_SECTIONS, 'acquisitions');
    const query = new URLSearchParams({ plan: planId, section: paging.section, offset: String(paging.offset), limit: String(paging.limit) });
    const value = releaseEnvelope(await this.#json('/api/release-plan?' + query, options), this.#boundId);
    releasePlanPage(value.plan, { planId, ...paging });
    if (!Array.isArray(value.catchUps) || value.catchUps.some(item => item.planId !== planId ||
        item.watchId !== value.plan.watchId || item.selection?.asOf !== item.asOf || !SHA.test(item.captureId ?? '')) ||
        new Set(value.catchUps.map(item => item.asOf)).size !== value.catchUps.length)
      fail('FRED_CLIENT_RELEASE_CHANGED', 'The saved release plan lost its original completed capture bindings.');
    return value;
  }
  async acquirePlannedVintage(input, options) {
    fields(input, ['id', 'expectedRevision', 'planId', 'asOf'], 'Planned vintage acquisition');
    releaseId(input.planId, 'plan'); releaseDate(input.asOf, 'planned vintage as-of date');
    const value = await this.#action('release-vintage-capture', input, options);
    return releaseSavedResponse(value, input, value?.planId === input.planId && value.asOf === input.asOf &&
      value.selection?.asOf === input.asOf && SHA.test(value.captureId ?? '') &&
      /^fred-release-watch-[a-f0-9]{64}$/.test(value.watchId ?? ''));
  }

  async publishedOperations({ offset = 0, limit = 100 } = {}, options) {
    integer(offset,0,Number.MAX_SAFE_INTEGER,'publication offset'); integer(limit,1,500,'publication page size');
    const value = await this.#json('/api/ddp-publications?' + new URLSearchParams({offset:String(offset),limit:String(limit)}),options);
    if(value?.projectId !== this.#boundId || value.offset !== offset || value.limit !== limit || !Array.isArray(value.items))
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The original publication inventory changed.');
    return value;
  }
  async publishedOperation({ id }, options) {
    operation(id);
    const value = await this.#json('/api/ddp-publication?' + new URLSearchParams({operation:id}),options);
    if(value?.projectId !== this.#boundId || value.id !== id || value.schema !== 'stellar-forge.fred-ddp-publication-operation.v1' ||
      !['RUNNING','INTERRUPTED','FAILED','COMPLETE'].includes(value.state) || !Array.isArray(value.files))
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The original publication operation changed.');
    return value;
  }
  async startPublishedOperation(input, options) {
    fields(input,['id','expectedRevision','migrationId'],'complete current-publication operation');
    operation(input.id); revision(input.expectedRevision); ddpId(input.migrationId,'migration');
    const value = await this.#json('/api/action',{...options,method:'POST',operationId:input.id,body:{action:'ddp-published-run',...input}});
    if(value?.projectId !== this.#boundId || value.id !== input.id || value.migrationId !== input.migrationId ||
      value.expectedRevision !== input.expectedRevision || !SHA.test(value.requestSha256))
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The retained publication acknowledgement differs from its original request.',
        {operationId:input.id,ambiguous:true});
    return value;
  }
  async publishedReport({ id, offset = 0, limit = 100, query = '' }, options) {
    operation(id); integer(offset,0,Number.MAX_SAFE_INTEGER,'series offset'); integer(limit,1,500,'series page size');
    if(typeof query !== 'string' || query.length > 500) fail('FRED_CLIENT_INPUT_INVALID','Choose a source series query of at most 500 characters.');
    const value = await this.#json('/api/ddp-publication-report?' + new URLSearchParams({operation:id,offset:String(offset),limit:String(limit),query}),options);
    if(value?.projectId !== this.#boundId || value.operationId !== id || value.basis !== 'CURRENT_PUBLICATION_RETRIEVAL' ||
      value.offset !== offset || value.limit !== limit || value.query !== query || !Array.isArray(value.rows))
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The complete original publication report changed.');
    return value;
  }
  async publishedRows({ id, comparisonId, offset = 0, limit = 100, seriesId = null, status = null }, options) {
    operation(id); text(comparisonId,'original comparison identity',120);
    integer(offset,0,Number.MAX_SAFE_INTEGER,'original row offset'); integer(limit,1,500,'original row page size');
    if(seriesId !== null) text(seriesId,'original source series ID',500);
    if(status !== null && !['EQUAL','DIFFERENT','BOTH_MISSING','MISSING_CHANGED','SOURCE_ONLY','TARGET_ONLY'].includes(status))
      fail('FRED_CLIENT_INPUT_INVALID','Choose an original publication comparison status.');
    const value = await this.#json('/api/ddp-publication-rows?' + new URLSearchParams({operation:id,comparison:comparisonId,
      offset:String(offset),limit:String(limit),...(seriesId === null ? {} : {series:seriesId}),...(status === null ? {} : {status})}),options);
    if(value?.projectId !== this.#boundId || value.operationId !== id || value.comparisonId !== comparisonId ||
      value.offset !== offset || value.limit !== limit || value.seriesId !== seriesId || value.status !== status || !Array.isArray(value.rows))
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The original observation cursor or comparison selection changed.');
    return value;
  }
  async publishedFileChunk({ id, name, expectedSha256, offset = 0, limit = 192 * 1024 }, options) {
    operation(id); text(name,'listed edition file',240); digest(expectedSha256);
    integer(offset,0,Number.MAX_SAFE_INTEGER,'original file offset'); integer(limit,1,192 * 1024,'file chunk size');
    const value = await this.#json('/api/ddp-publication-file-chunk?' + new URLSearchParams({operation:id,name,sha256:expectedSha256,
      offset:String(offset),limit:String(limit)}),options);
    if(value?.projectId !== this.#boundId || value.operationId !== id || value.file?.name !== name || value.file.sha256 !== expectedSha256 ||
      value.offset !== offset || value.encoding !== 'base64' || typeof value.base64 !== 'string')
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The original publication file selection changed.');
    const bytes = Buffer.from(value.base64,'base64');
    if(bytes.length !== value.bytes || bytes.toString('base64') !== value.base64 || fredDigest(bytes) !== value.chunkSha256 ||
      value.bytes > limit || offset + value.bytes > value.file.bytes ||
      value.nextOffset !== (offset + value.bytes < value.file.bytes ? offset + value.bytes : null))
      fail('FRED_CLIENT_PUBLISHED_CHANGED','The complete original file chunk changed.');
    return value;
  }
  async downloadPublishedFile({ id, name, expectedSha256 }, destination, options = {}) {
    operation(id); text(name,'listed edition file',240); digest(expectedSha256); text(destination,'new download destination',4096);
    const original = await this.publishedOperation({id},options), descriptor = original.files.find(file => file.name === name);
    if(original.state !== 'COMPLETE' || !descriptor || descriptor.sha256 !== expectedSha256)
      fail('FRED_CLIENT_PUBLISHED_CHANGED','Select the exact complete file listed in the original publication.');
    const selected = await this.#connect(options.signal), path = '/api/ddp-publication-file?' + new URLSearchParams({operation:id,name,sha256:expectedSha256});
    const signal = AbortSignal.any([this.#lifetime.signal,AbortSignal.timeout(30 * 60 * 1000),...(options.signal ? [options.signal] : [])]);
    const response = await this.#fetch(selected.origin + path,{headers:{authorization:'Bearer ' + selected.token,origin:selected.origin},
      redirect:'error',signal});
    if(!response.ok) {
      let error; try { error = JSON.parse((await responseBytes(response,65536)).toString('utf8')); } catch { error = {}; }
      fail(error.code ?? 'FRED_CLIENT_DOWNLOAD_FAILED',error.message ?? 'The original publication download did not open.',{status:response.status});
    }
    if(response.headers.get('x-content-sha256') !== expectedSha256 ||
      Number(response.headers.get('content-length')) !== descriptor.bytes) {
      await response.body?.cancel(); fail('FRED_CLIENT_PUBLISHED_CHANGED','The complete original file response changed.');
    }
    const output = resolve(destination), temporary = output + '.' + randomUUID() + '.part';
    let handle, bytes = 0; const hash = createHash('sha256');
    try {
      handle = await open(temporary,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,0o600);
      for await(const chunk of response.body) {
        const part = Buffer.from(chunk); bytes += part.length;
        if(bytes > descriptor.bytes) fail('FRED_CLIENT_PUBLISHED_CHANGED','The original download exceeds its listed length.');
        hash.update(part); let cursor = 0;
        while(cursor < part.length) { const result = await handle.write(part,cursor,part.length - cursor);
          if(result.bytesWritten < 1) fail('FRED_CLIENT_DOWNLOAD_FAILED','The original destination stopped accepting bytes.');
          cursor += result.bytesWritten; }
      }
      const actual = hash.digest('hex');
      if(bytes !== descriptor.bytes || actual !== expectedSha256) fail('FRED_CLIENT_PUBLISHED_CHANGED','The complete original download identity changed.');
      await handle.sync(); await handle.close(); handle = null; await link(temporary,output);
      const parent = await open(dirname(output),constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); }
      return {projectId:original.projectId,operationId:id,destination:output,name,bytes,sha256:actual,contentType:descriptor.contentType};
    } finally { await response.body?.cancel().catch(() => {}); await handle?.close();
      await unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error; }); }
  }
  async ddpSources(options = {}) {
    const value = ddpEnvelope(await this.#json('/api/ddp-sources', options), this.#boundId);
    for (const [index, kind] of DDP_KINDS.entries()) {
      if (!Array.isArray(value[kind])) fail('FRED_CLIENT_DDP_CHANGED', 'The complete DDP source and receiving inventory is missing.');
      const seen = new Set(), idKind = ['crosswalk', 'package', 'migration', 'receiving'][index];
      for (const item of value[kind]) {
        ddpId(item?.id, idKind);
        if (seen.has(item.id) || !plain(item.summary))
          fail('FRED_CLIENT_DDP_CHANGED', 'The DDP inventory repeats or loses an original source or saved result.');
        seen.add(item.id);
      }
    }
    return value;
  }
  async ddpCrosswalk({ crosswalkId, release = null, query = '', offset = 0, limit = 100 }, options) {
    ddpId(crosswalkId, 'crosswalk'); ddpSeriesId(release, 'release');
    if (typeof query !== 'string' || query.length > 500)
      fail('FRED_CLIENT_INPUT_INVALID', 'Use a crosswalk query of at most 500 characters.');
    const paging = ddpPaging({ offset, limit });
    const params = new URLSearchParams({ crosswalk: crosswalkId, query, offset: String(paging.offset), limit: String(paging.limit),
      ...(release === null ? {} : { release }) });
    const result = ddpEnvelope(await this.#json('/api/ddp-crosswalk?' + params, options), this.#boundId);
    if (result.crosswalk?.id !== crosswalkId || result.crosswalk.filter?.release !== release ||
        result.crosswalk.filter?.query !== query || !plain(result.crosswalk.source) || !plain(result.crosswalk.summary))
      fail('FRED_CLIENT_DDP_CHANGED', 'The original crosswalk page differs from the selected source or filter.');
    ddpRows(result.crosswalk, paging);
    return result;
  }
  async importDdpCrosswalk(input, options) {
    fields(input, ['id', 'expectedRevision', 'capture', 'crosswalkId'], 'DDP crosswalk source import');
    const body = { ...input };
    if (input.capture != null) {
      const model = inspectFredDdpCrosswalk(input.capture);
      if (input.crosswalkId !== undefined && input.crosswalkId !== model.id)
        fail('FRED_CLIENT_INPUT_INVALID', 'The complete crosswalk source and selected ID must agree.');
      body.crosswalkId = model.id;
    } else ddpId(body.crosswalkId, 'crosswalk');
    const value = await this.#action('ddp-crosswalk-import', body, options);
    return ddpSaved(value, input, value?.crosswalkId === body.crosswalkId && value.source?.id === body.crosswalkId);
  }
  async acquireDdpCrosswalk(input, options) {
    fields(input, ['id', 'expectedRevision', 'url'], 'Official DDP crosswalk acquisition');
    if (input.url !== undefined) ddpBoardUrl(input.url);
    const value = await this.#action('ddp-crosswalk-capture', input, options);
    return ddpSaved(value, input, typeof value?.crosswalkId === 'string' &&
      value.crosswalkId.startsWith(DDP_PREFIXES.crosswalk) && SHA.test(value.crosswalkId.slice(DDP_PREFIXES.crosswalk.length)) &&
      value.source?.id === value.crosswalkId && typeof value.acquisitionId === 'string' && typeof value.url === 'string');
  }
  async ddpPackage({ packageId, section = 'series', seriesId = null, frequency = null, query = '', offset = 0, limit = 100 }, options) {
    ddpId(packageId, 'package'); ddpSeriesId(seriesId); ddpSeriesId(frequency, 'original package frequency');
    if (typeof query !== 'string' || query.length > 500) fail('FRED_CLIENT_INPUT_INVALID', 'Use a package query of at most 500 characters.');
    if (!['series', 'observations'].includes(section))
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose original DDP package series or observations.');
    const paging = ddpPaging({ offset, limit }), params = new URLSearchParams({ package: packageId, section,
      offset: String(paging.offset), limit: String(paging.limit), query,
      ...(frequency === null ? {} : { frequency }), ...(seriesId === null ? {} : { seriesId }) });
    const value = ddpEnvelope(await this.#json('/api/ddp-package?' + params, options), this.#boundId);
    if (value.package?.id !== packageId || value.package.section !== section || value.package.seriesId !== seriesId ||
        value.package.filter?.frequency !== (section === 'series' ? frequency : null) ||
        value.package.filter?.query !== (section === 'series' ? query : '') || !Array.isArray(value.package.frequencies) ||
        !plain(value.package.source) || !plain(value.package.summary))
      fail('FRED_CLIENT_DDP_CHANGED', 'The package page differs from the selected complete original source, series or section.');
    ddpRows(value.package, paging); return value;
  }
  async importDdpPackage(input, options) {
    fields(input, ['id', 'expectedRevision', 'capture', 'packageId'], 'DDP package source import');
    const body = { ...input };
    if (input.capture != null) {
      const model = inspectFredDdpPackage(input.capture);
      if (input.packageId !== undefined && input.packageId !== model.id)
        fail('FRED_CLIENT_INPUT_INVALID', 'The complete original package source and selected ID must agree.');
      body.packageId = model.id;
    } else ddpId(body.packageId, 'package');
    const value = await this.#action('ddp-package-import', body, options);
    return ddpSaved(value, input, value?.packageId === body.packageId && value.source?.id === body.packageId);
  }
  async previewDdpMigration(input, options) {
    const body = ddpMigrationInput(input);
    const value = ddpEnvelope(await this.#json('/api/ddp-migration-preview',
      { ...options, method: 'POST', readOnly: true, body }), this.#boundId);
    digest(value.previewId, 'reviewed migration preview ID');
    if (value.migrationId !== value.migration?.id)
      fail('FRED_CLIENT_DDP_CHANGED', 'The preview lost its complete immutable migration identity.');
    ddpMigrationPage(value.migration, body); return value;
  }
  async saveDdpMigration(input, options) {
    const body = ddpMigrationInput(input, true), value = await this.#action('ddp-migration-save', body, options);
    return ddpSaved(value, input, typeof value?.migrationId === 'string' &&
      value.migrationId.startsWith(DDP_PREFIXES.migration) && SHA.test(value.migrationId.slice(DDP_PREFIXES.migration.length)) &&
      value.migration?.id === value.migrationId && value.migration.packageId === body.packageId &&
      value.migration.crosswalkId === body.crosswalkId);
  }
  async ddpMigration({ migrationId, section = 'series', offset = 0, limit = 100 }, options) {
    ddpId(migrationId, 'migration');
    if (!['series', 'acquisitions', 'mappings'].includes(section))
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose original migration series, acquisitions or mappings.');
    const paging = ddpPaging({ offset, limit }), params = new URLSearchParams({ migration: migrationId, section,
      offset: String(paging.offset), limit: String(paging.limit) });
    const value = ddpEnvelope(await this.#json('/api/ddp-migration?' + params, options), this.#boundId);
    ddpMigrationPage(value.migration, { migrationId, section, ...paging });
    if (!Array.isArray(value.receivings) || value.receivings.some(item => item.planId !== migrationId))
      fail('FRED_CLIENT_DDP_CHANGED', 'The saved migration lost its original completed receiving records.');
    return value;
  }
  async acquireDdpMigration(input, options) {
    fields(input, ['id', 'expectedRevision', 'migrationId', 'sourceMode', 'metadata', 'metadataSha256'], 'DDP migration acquisition');
    ddpId(input.migrationId, 'migration');
    if (input.sourceMode !== undefined && !['API_VINTAGE', 'ALFRED_VINTAGE'].includes(input.sourceMode))
      fail('FRED_CLIENT_INPUT_INVALID', 'Choose API_VINTAGE or ALFRED_VINTAGE.');
    if (input.sourceMode === 'API_VINTAGE' && (input.metadata !== undefined || input.metadataSha256 !== undefined))
      fail('FRED_CLIENT_INPUT_INVALID', 'API metadata comes from its original API response.');
    if (input.metadata !== undefined && (!Array.isArray(input.metadata) ||
        input.metadata.some(item => item?.schema !== 'stellar-forge.alfred-metadata-edition.v1' || typeof item?.series?.value !== 'string') ||
        new Set(input.metadata.map(item => item.series.value)).size !== input.metadata.length))
      fail('FRED_CLIENT_INPUT_INVALID', 'Retain one complete historical metadata edition for each selected series.');
    const metadataSha256 = input.metadata === undefined ? input.metadataSha256
      : canonicalJSONDigest([...input.metadata].sort((a, b) => a.series.value < b.series.value ? -1 : a.series.value > b.series.value ? 1 : 0));
    if (input.metadataSha256 !== undefined) {
      digest(input.metadataSha256, 'historical metadata identity');
      if (metadataSha256 !== input.metadataSha256)
        fail('FRED_CLIENT_INPUT_INVALID', 'The historical metadata differs from its retained identity.');
    }
    const value = await this.#action('ddp-migration-acquire', input, options);
    if (value?.sourceMode !== undefined && value.sourceMode !== 'ALFRED_VINTAGE' ||
        input.sourceMode === 'ALFRED_VINTAGE' && value?.sourceMode !== 'ALFRED_VINTAGE' ||
        input.sourceMode === 'API_VINTAGE' && value?.sourceMode !== undefined ||
        value?.sourceMode === 'ALFRED_VINTAGE' && (!SHA.test(value.metadataSha256) ||
          metadataSha256 !== undefined && value.metadataSha256 !== metadataSha256))
      fail('FRED_CLIENT_DDP_CHANGED', 'The completed migration changed its original source mode or metadata edition.');
    return ddpSaved(value, input, value?.migrationId === input.migrationId &&
      typeof value.receivingId === 'string' && value.receivingId.startsWith(DDP_PREFIXES.receiving) &&
      SHA.test(value.receivingId.slice(DDP_PREFIXES.receiving.length)) && value.receiving?.id === value.receivingId &&
      Array.isArray(value.captureIds) && value.captureIds.every(id => SHA.test(id)) &&
      new Set(value.captureIds).size === value.captureIds.length && typeof value.acquisitionId === 'string' &&
      typeof value.reusedReceiving === 'boolean');
  }
  async ddpReceiving({ receivingId, changesOnly = true, seriesId = null, offset = 0, limit = 100 }, options) {
    ddpId(receivingId, 'receiving'); ddpSeriesId(seriesId);
    if (typeof changesOnly !== 'boolean') fail('FRED_CLIENT_INPUT_INVALID', 'Choose a boolean changesOnly receiving filter.');
    const paging = ddpPaging({ offset, limit }), params = new URLSearchParams({ receiving: receivingId,
      changesOnly: changesOnly ? '1' : '0', offset: String(paging.offset), limit: String(paging.limit),
      ...(seriesId === null ? {} : { seriesId }) });
    const value = ddpEnvelope(await this.#json('/api/ddp-receiving?' + params, options), this.#boundId);
    if (value.receiving?.id !== receivingId || value.receiving.filter?.changesOnly !== changesOnly ||
        value.receiving.filter?.seriesId !== seriesId || !ddpCounts(value.receiving.summary) ||
        !Array.isArray(value.receiving.meanings) || !Array.isArray(value.receiving.captures))
      fail('FRED_CLIENT_DDP_CHANGED', 'The receiving page lost its original result, meaning or source selection.');
    ddpRows(value.receiving, paging); return value;
  }

  publication(publicationId, options) {
    return this.#json('/api/publication?' + new URLSearchParams({ publication: digest(publicationId, 'publication ID') }), options);
  }
  preview({ publicationId, query = '' }, options) {
    if (typeof query !== 'string' || query.length > 32768) fail('FRED_CLIENT_INPUT_INVALID', 'Use the original dataset query string.');
    return this.#json('/api/preview?' + new URLSearchParams({ publication: digest(publicationId, 'publication ID'), query }), options);
  }
  #action(action, input, options = {}, journaled = true) {
    object(input);
    if (journaled) { operation(input.id); revision(input.expectedRevision); }
    return this.#json('/api/action', { ...options, method: 'POST',
      operationId: journaled ? input.id : input.intentId, body: { ...input, action } });
  }
  configure(input, options) { object(input?.selection, 'Original FRED selection'); return this.#action('configure', input, options); }
  capture(input, options) { return this.#action('capture', input, options); }
  importCapture(input, options) { object(input?.capture, 'Complete original source'); return this.#action('import', input, options); }
  combine(input, options) {
    if (!Array.isArray(input?.captureIds) || input.captureIds.length < 1 || input.captureIds.length > 50 ||
        new Set(input.captureIds).size !== input.captureIds.length) fail('FRED_CLIENT_INPUT_INVALID', 'Choose the distinct retained public-table capture IDs.');
    input.captureIds.forEach(value => digest(value, 'capture ID')); return this.#action('combine', input, options);
  }
  select(input, options) { digest(input?.captureId, 'capture ID'); return this.#action('select', input, options); }
  review(input, options) { digest(input?.captureId, 'capture ID'); return this.#action('review', input, options); }
  publish(input, options) { digest(input?.reviewId, 'saved review ID'); object(input?.payment, 'Original payment terms'); return this.#action('publish', input, options); }
  abandon(input, options) { operation(input?.pendingId); return this.#action('abandon', input, options); }
  startMerchant({ publicationId }, options) { return this.#action('merchant-start', { publicationId: digest(publicationId, 'publication ID') }, options, false); }
  stopMerchant({ publicationId }, options) { return this.#action('merchant-stop', { publicationId: digest(publicationId, 'original running publication ID') }, options, false); }
  prepare(input, options) {
    object(input); digest(input.publicationId, 'publication ID'); operation(input.intentId);
    if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 32768))
      fail('FRED_CLIENT_INPUT_INVALID', 'Use the original dataset query string.');
    return this.#action('prepare', input, options, false);
  }
  buy({ publicationId, intentId }, options) {
    return this.#action('buy', { publicationId: digest(publicationId, 'publication ID'), intentId: operation(intentId) }, options, false);
  }
  recover({ publicationId, intentId }, options) {
    return this.#action('recover', { publicationId: digest(publicationId, 'publication ID'), intentId: operation(intentId) }, options, false);
  }
  async wait(id, { signal, timeoutMs = 60000, intervalMs = 1000 } = {}) {
    operation(id); integer(timeoutMs, 1, 30 * 60 * 1000, 'observation timeout'); integer(intervalMs, 100, 30000, 'read interval');
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      signal?.throwIfAborted();
      const current = await this.operation(id, { signal });
      if (current.operation || !current.pending) return current;
      if (Date.now() >= deadline) return { ...current, observationTimedOut: true };
      await new Promise((done, reject) => {
        const joined = AbortSignal.any([this.#lifetime.signal, ...(signal ? [signal] : [])]);
        const timer = setTimeout(finish, Math.min(intervalMs, deadline - Date.now()));
        function finish() { joined.removeEventListener('abort', stopped); done(); }
        function stopped() { clearTimeout(timer); joined.removeEventListener('abort', stopped); reject(joined.reason); }
        joined.addEventListener('abort', stopped, { once: true }); if (joined.aborted) stopped();
      });
    }
  }
  async file(selection, options = {}) {
    object(selection, 'Original file selection');
    let path, fallback, expectedMember = null;
    if (selection.kind === 'source') {
      path = '/api/source?' + new URLSearchParams({ capture: digest(selection.captureId, 'capture ID') }); fallback = 'fred-original-capture.json';
    } else if (selection.kind === 'comparison') {
      path = '/api/compare?' + new URLSearchParams({ before: digest(selection.before, 'earlier capture ID'), after: digest(selection.after, 'later capture ID'), download: '1' });
      fallback = 'fred-vintage-comparison.json';
    } else if (selection.kind === 'project') { path = '/api/bundle'; fallback = 'fred-economic-project.json'; }
    else if (selection.kind === 'customer') {
      path = '/api/customer-download?' + new URLSearchParams({ publication: digest(selection.publicationId, 'publication ID'), intent: operation(selection.intentId) });
      fallback = 'fred-customer-response.bin';
    } else if (selection.kind === 'briefing') {
      const memberNames = { html: 'briefing.html', csv: 'briefing-measures.csv', json: 'briefing.json', manifest: 'briefing-manifest.json' };
      fallback = memberNames[selection.format];
      if (!fallback) fail('FRED_CLIENT_INPUT_INVALID', 'Choose the original HTML, CSV, JSON or manifest briefing file.');
      const saved = await this.briefing({ reviewId: selection.reviewId }, options);
      expectedMember = saved.files?.find(file => file.path === fallback);
      if (!expectedMember || !SHA.test(expectedMember.sha256) || !Number.isSafeInteger(expectedMember.bytes) || expectedMember.bytes < 1)
        fail('FRED_CLIENT_BRIEFING_CHANGED', 'The original saved briefing file descriptor is missing.');
      path = '/api/briefing?' + new URLSearchParams({ review: selection.reviewId, format: selection.format });
    } else if (selection.kind === 'briefing-successor') {
      recurringId(selection.successorId, 'successor');
      if (!['json', 'csv', 'html'].includes(selection.format))
        fail('FRED_CLIENT_INPUT_INVALID', 'Choose the complete successor JSON, CSV or HTML comparison.');
      path = '/api/briefing-successor?' + new URLSearchParams({ successor: selection.successorId, format: selection.format });
      fallback = selection.successorId + '.' + selection.format;
    } else if (selection.kind === 'release-source') {
      fields(selection, ['kind', 'releaseCaptureId'], 'Complete release source file');
      path = '/api/release-capture?' + new URLSearchParams({ capture: digest(selection.releaseCaptureId, 'release capture ID'), download: '1' });
      fallback = 'fred-release-' + selection.releaseCaptureId + '.json';
    } else if (selection.kind === 'release-plan') {
      fields(selection, ['kind', 'planId'], 'Complete release plan file');
      path = '/api/release-plan?' + new URLSearchParams({ plan: releaseId(selection.planId, 'plan'), download: '1' });
      fallback = selection.planId + '.json';
    } else if (selection.kind === 'ddp-crosswalk' || selection.kind === 'ddp-package') {
      const isCrosswalk = selection.kind === 'ddp-crosswalk', key = isCrosswalk ? 'crosswalkId' : 'packageId';
      fields(selection, ['kind', key], 'Complete original DDP source file');
      const id = ddpId(selection[key], isCrosswalk ? 'crosswalk' : 'package');
      path = '/api/' + selection.kind + '?' + new URLSearchParams({ [isCrosswalk ? 'crosswalk' : 'package']: id, download: '1' });
      fallback = id + '.json';
    } else if (selection.kind === 'ddp-migration') {
      fields(selection, ['kind', 'migrationId'], 'Complete DDP migration plan file');
      path = '/api/ddp-migration?' + new URLSearchParams({ migration: ddpId(selection.migrationId, 'migration'), download: '1' });
      fallback = selection.migrationId + '.json';
    } else if (selection.kind === 'ddp-receiving') {
      fields(selection, ['kind', 'receivingId', 'format'], 'Complete DDP receiving file');
      ddpId(selection.receivingId, 'receiving');
      if (!['json', 'csv', 'html'].includes(selection.format))
        fail('FRED_CLIENT_INPUT_INVALID', 'Choose the complete receiving JSON, CSV or HTML report.');
      const inventory = await this.ddpSources(options), saved = inventory.receivings.find(item => item.id === selection.receivingId);
      expectedMember = saved?.files?.find(file => file.path?.endsWith('.' + selection.format));
      if (!expectedMember || !SHA.test(expectedMember.sha256 ?? '') || !Number.isSafeInteger(expectedMember.bytes) || expectedMember.bytes < 1)
        fail('FRED_CLIENT_DDP_CHANGED', 'The saved DDP receiving file descriptor is missing from its original result.');
      path = '/api/ddp-receiving?' + new URLSearchParams({ receiving: selection.receivingId, format: selection.format });
      fallback = selection.receivingId + '.' + selection.format;
    } else fail('FRED_CLIENT_INPUT_INVALID', 'Choose a complete original source, plan, DDP receiving, comparison, briefing, project or customer file.');
    const maximum = selection.kind === 'project' ? this.maxDdpResponseBytes :
      selection.kind.startsWith('ddp-') ? Math.min(this.maxDdpResponseBytes, FRED_DDP_MAX_SOURCE_BYTES) : undefined;
    const { response, bytes } = await this.#request(path, { ...options, ...(maximum === undefined ? {} : { maximum }) });
    const sha256 = fredDigest(bytes);
    if (expectedMember && (sha256 !== expectedMember.sha256 || bytes.length !== expectedMember.bytes))
      fail(selection.kind === 'ddp-receiving' ? 'FRED_CLIENT_DDP_CHANGED' : 'FRED_CLIENT_BRIEFING_CHANGED',
        'The complete original report differs from its saved source review.', { sha256, bytes: bytes.length });
    if (options.expectedSha256 !== undefined && digest(options.expectedSha256) !== sha256)
      fail('FRED_CLIENT_FILE_CHANGED', 'The complete original download differs from its reviewed SHA256.', { sha256, bytes: bytes.length });
    if (selection.kind === 'briefing-successor' && selection.format === 'json') {
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { fail('FRED_CLIENT_SUCCESSOR_CHANGED', 'The original successor file is not complete JSON.'); }
      successorFile(value, selection.successorId);
    }
    if (selection.kind === 'release-source' || selection.kind === 'release-plan') {
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { fail('FRED_CLIENT_RELEASE_CHANGED', 'The complete release source or saved plan file is not original JSON.'); }
      if (selection.kind === 'release-source') {
        if (inspectFredReleaseCapture(value).captureSha256 !== selection.releaseCaptureId)
          fail('FRED_CLIENT_RELEASE_CHANGED', 'The complete release source differs from the selected capture.');
      } else if (validateFredReleasePlan(value).id !== selection.planId)
        fail('FRED_CLIENT_RELEASE_CHANGED', 'The complete release plan differs from the selected saved descriptor.');
    }
    if (selection.kind.startsWith('ddp-') && (selection.kind !== 'ddp-receiving' || selection.format === 'json')) {
      let value;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { fail('FRED_CLIENT_DDP_CHANGED', 'The complete original DDP source, migration or receiving file is not JSON.'); }
      const kind = selection.kind.slice(4), key = kind + 'Id';
      if (ddpIdentity(value, kind).id !== selection[key])
        fail('FRED_CLIENT_DDP_CHANGED', 'The full DDP file differs from its original selected identity.');
    }
    const proposed = (response.headers.get('content-disposition') ?? '').match(/filename="([^"]*)"/)?.[1] ?? fallback;
    const name = basename(proposed).replace(/[\x00-\x1f\x7f"\\/]/g, '_').slice(0, 180) || fallback;
    const result = { name, type: response.headers.get('content-type') ?? 'application/octet-stream', bytes, sha256,
      status: response.status, projectId: this.#boundId,
      ...(selection.kind === 'release-source' ? { releaseCaptureId: selection.releaseCaptureId } : {}),
      ...(selection.kind === 'release-plan' ? { planId: selection.planId } : {}),
      ...Object.fromEntries(['crosswalkId', 'packageId', 'migrationId', 'receivingId'].filter(key => selection[key] !== undefined).map(key => [key, selection[key]])) };
    if (selection.kind === 'project') {
      let bundle;
      try { bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('FRED_CLIENT_BUNDLE_INVALID', 'The complete project export is not JSON.'); }
      if (!['stellar-forge.fred-project-bundle.v5', 'stellar-forge.fred-project-bundle.v6'].includes(bundle.schema) && bytes.length > FRED_CLIENT_MAX_BYTES)
        fail('FRED_CLIENT_BUNDLE_INVALID', 'The original version 1–4 project retains its 256 MiB file capacity.');
      result.bundle = inspectFredProjectBundle(bundle);
      if (result.bundle.projectId !== this.#boundId) fail('FRED_CLIENT_PROJECT_CHANGED', 'The export belongs to another original project.');
    }
    return result;
  }
  close() { this.#closed = true; this.#bound = null; this.#lifetime.abort(new Error('FRED workspace client closed')); }
}

function briefingPage(value, binding) {
  if (value?.schema !== 'stellar-forge.fred-briefing-model.v1' || !Array.isArray(value.measures) || !Array.isArray(value.series) ||
      !Number.isSafeInteger(value.measureCount) || value.measureCount < 0 || value.measureCount > 30000 ||
      !Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > value.measureCount ||
      value.limit !== 100 || value.measures.length !== Math.min(100, value.measureCount - value.offset) ||
      value.nextOffset !== (value.offset + 100 < value.measureCount ? value.offset + 100 : null) ||
      Object.entries(binding).some(([key, expected]) => value[key] !== expected))
    fail('FRED_CLIENT_BRIEFING_CHANGED', 'The original analyst page or its source/review binding changed.');
  if (binding.reviewId !== null && (!value.manifest || value.manifest.reviewId !== binding.reviewId ||
      value.manifest.captureId !== value.captureId || value.manifest.reportId !== value.reportId ||
      !Array.isArray(value.files) || value.files.length !== 4))
    fail('FRED_CLIENT_BRIEFING_CHANGED', 'The saved analyst page lost its complete original file inventory.');
  return value;
}

function inspectFredReleaseBundle(bundle) {
  const state = bundle.state, summaries = state.releaseCaptures ?? [], watches = state.releaseWatches ?? [],
    plans = state.releasePlans ?? [], catchUps = state.releaseCatchUps ?? [];
  if (![summaries, watches, plans, catchUps].every(Array.isArray) ||
      bundle.schema === 'stellar-forge.fred-project-bundle.v4' && summaries.length + watches.length + plans.length + catchUps.length === 0 ||
      summaries.length !== bundle.releaseCaptures.length || plans.length !== bundle.releasePlans.length ||
      !Array.isArray(state.operations) || !Array.isArray(state.captures))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The release project export lost its complete source and plan inventories.');
  const captures = new Map(), watchMap = new Map(), planMap = new Map(), planOperations = new Map();
  for (const capture of bundle.releaseCaptures) {
    const model = inspectFredReleaseCapture(capture);
    if (captures.has(model.captureSha256) || !summaries.some(item =>
        item.id === model.captureSha256 && canonicalFredJSON(item) === canonicalFredJSON(releaseCaptureSummary(capture, model))))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The release source index differs from its complete original responses.');
    captures.set(model.captureSha256, capture);
  }
  if (new Set(summaries.map(item => item.id)).size !== summaries.length)
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The release source index repeats a saved capture.');
  for (const watch of watches) {
    validateFredReleaseWatch(watch);
    if (watchMap.has(watch.id) || watch.template !== null &&
        !(state.briefingTemplates ?? []).some(template => canonicalFredJSON(template) === canonicalFredJSON(watch.template)))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The release watch lost its complete original recurring template.');
    watchMap.set(watch.id, watch);
  }
  for (const plan of bundle.releasePlans) {
    if (!plain(plan) || planMap.has(plan.id) || !watchMap.has(plan.watchId) ||
        canonicalFredJSON(plan.watch) !== canonicalFredJSON(watchMap.get(plan.watchId)) ||
        !captures.has(plan.afterCaptureSha256) || plan.beforeCaptureSha256 !== null && !captures.has(plan.beforeCaptureSha256))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The release plan lost its original watch or complete before/after source.');
    validateFredReleasePlan(plan, { before: plan.beforeCaptureSha256 === null ? null : captures.get(plan.beforeCaptureSha256),
      after: captures.get(plan.afterCaptureSha256) });
    if (!plans.some(item => item.id === plan.id && canonicalFredJSON(item) === canonicalFredJSON(releasePlanSummary(plan))))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The saved release plan summary differs from its complete descriptor.');
    const position = state.operations.findIndex(item => item.kind === 'release-plan-save' && item.result?.planId === plan.id);
    if (position < 0 || canonicalFredJSON(state.operations[position].result?.plan ?? null) !== canonicalFredJSON(releasePlanSummary(plan)))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The saved release plan lost its original project operation.');
    planMap.set(plan.id, plan); planOperations.set(plan.id, position);
  }
  if (new Set(plans.map(item => item.id)).size !== plans.length)
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The release plan index repeats a saved plan.');
  const completed = new Set();
  for (const item of catchUps) {
    const plan = planMap.get(item?.planId), key = item?.planId + '|' + item?.asOf;
    if (!plan || completed.has(key) || item.watchId !== plan.watchId ||
        Object.keys(item).sort().join('|') !== 'asOf|captureId|planId|selection|watchId' ||
        !plan.acquisitions.some(row => row.asOf === item.asOf && canonicalFredJSON(row.selection) === canonicalFredJSON(item.selection)) ||
        !state.captures.some(row => row.id === item.captureId) ||
        !bundle.captures.some(capture => capture.captureSha256 === item.captureId &&
          canonicalFredJSON(capture.selection) === canonicalFredJSON(item.selection)) ||
        !state.operations.some((operation, index) => index > planOperations.get(plan.id) &&
          operation.kind === 'release-vintage-capture' && operation.result?.catchUp &&
          canonicalFredJSON(operation.result.catchUp) === canonicalFredJSON(item)))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The completed release acquisition lost its exact plan, operation or original observation capture.');
    completed.add(key);
  }
  for (const plan of planMap.values()) {
    const dates = new Set();
    for (const item of catchUps) {
      const sourcePlan = planMap.get(item.planId);
      const position = state.operations.findIndex(operation => operation.kind === 'release-vintage-capture' &&
        operation.result?.catchUp?.planId === item.planId && operation.result.catchUp.asOf === item.asOf);
      if (item.watchId === plan.watchId && sourcePlan?.afterCaptureSha256 === plan.afterCaptureSha256 &&
          position >= 0 && position < planOperations.get(plan.id)) dates.add(item.asOf);
    }
    if (canonicalFredJSON([...dates].sort()) !== canonicalFredJSON(plan.completedAsOf))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The saved release plan completion snapshot differs from its original operation history.');
  }
  return { releaseCaptures: captures.size, releaseWatches: watchMap.size, releasePlans: planMap.size, releaseCatchUps: catchUps.length };
}

export function inspectFredProjectBundle(bundle) {
  const qcewVersion = bundle?.schema === 'stellar-forge.fred-project-bundle.v6';
  const extended = qcewVersion || bundle?.schema === 'stellar-forge.fred-project-bundle.v5';
  const releases = extended || bundle?.schema === 'stellar-forge.fred-project-bundle.v4';
  const recurring = releases || bundle?.schema === 'stellar-forge.fred-project-bundle.v3';
  const briefing = recurring || bundle?.schema === 'stellar-forge.fred-project-bundle.v2';
  if ((!briefing && bundle?.schema !== 'stellar-forge.fred-project-bundle.v1') || !plain(bundle.state) ||
      !Array.isArray(bundle.captures) || !Array.isArray(bundle.publicationPlans) || !SHA.test(bundle.bundleSha256 ?? '') ||
      (briefing ? !Array.isArray(bundle.briefings) || !releases && bundle.briefings.length < 1 : bundle.briefings !== undefined) ||
      (releases ? !Array.isArray(bundle.releaseCaptures) || !Array.isArray(bundle.releasePlans) :
        bundle.releaseCaptures !== undefined || bundle.releasePlans !== undefined ||
        ['releaseCaptures', 'releaseWatches', 'releasePlans', 'releaseCatchUps'].some(key => (bundle.state[key]?.length ?? 0) > 0)))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'Use the complete original versioned FRED project bundle.');
  const ddpKeys = ['ddpCrosswalks', 'ddpPackages', 'ddpMigrations', 'ddpReceivings'];
  validateFredDdpProjectState(bundle.state);
  validateQcewState(bundle.state);
  const ddp = ddpKeys.some(key => (bundle.state[key]?.length ?? 0) > 0), qcew = qcewStatePresent(bundle.state);
  if (qcewVersion && !qcew)
    fail('FRED_CLIENT_BUNDLE_INVALID', 'A version 6 project retains its complete original QCEW family.');
  if (extended ? !ddp && !qcew : ddp || qcew)
    fail('FRED_CLIENT_BUNDLE_INVALID', 'Use the original version 5 or 6 identity for a complete DDP or QCEW project family.');
  const ddpSlots = qcewVersion || ddp;
  if (ddpSlots ? ddpKeys.some(key => !Array.isArray(bundle[key])) : ddpKeys.some(key => bundle[key] !== undefined))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'Retain all four DDP arrays in version 6 and exactly when DDP work is present in earlier project versions.');
  if (qcewVersion && !ddp && ddpKeys.some(key => bundle[key].length > 0))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The version 6 DDP slots must be empty when its original project has no DDP activity.');
  if (qcew ? !plain(bundle.qcew) : bundle.qcew !== undefined)
    fail('FRED_CLIENT_BUNDLE_INVALID', 'Retain the complete QCEW original-source and report extension exactly when its project family is present.');
  const identity = { schema: bundle.schema, state: bundle.state, captures: bundle.captures, publicationPlans: bundle.publicationPlans,
    ...(briefing ? { briefings: bundle.briefings } : {}),
    ...(releases ? { releaseCaptures: bundle.releaseCaptures, releasePlans: bundle.releasePlans } : {}),
    ...(ddpSlots ? Object.fromEntries(ddpKeys.map(key => [key, bundle[key]])) : {}),
    ...(qcew ? { qcew: bundle.qcew } : {}) };
  if (canonicalJSONDigest(identity, { primitive: canonicalFredJSON }) !== bundle.bundleSha256 ||
      bundle.state.schema !== 'stellar-forge.fred-project.v1' || !UUID.test(bundle.state.id ?? '') || bundle.state.pending ||
      !Array.isArray(bundle.state.reviews))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The original completed project bundle identity changed.');
  if (qcew) validateQcewExtension(bundle.qcew, bundle.state, bundle.captures);
  if (ddp) validateFredDdpProjectBundle({ state: bundle.state, captures: bundle.captures,
    ...Object.fromEntries(ddpKeys.map(key => [key, bundle[key]])) });
  const templates = bundle.state.briefingTemplates ?? [], successors = bundle.state.briefingSuccessors ?? [];
  if (!Array.isArray(templates) || !Array.isArray(successors) || recurring && !releases && templates.length === 0 ||
      !recurring && (templates.length > 0 || successors.length > 0))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'Use the project bundle version retaining its complete recurring briefing records.');
  if (recurring) {
    const templateIds = new Set(), successorIds = new Set();
    for (const item of templates) {
      if (!plain(item) || !/^fred-template-[a-f0-9]{64}$/.test(item.id ?? '') || templateIds.has(item.id) ||
          !bundle.state.reviews.some(review => review.id === item.origin?.reviewId && review.captureId === item.origin?.captureId && review.briefing))
        fail('FRED_CLIENT_BUNDLE_INVALID', 'A recurring template lost its original saved analyst source review.');
      templateIds.add(item.id);
    }
    for (const item of successors) {
      if (!plain(item) || !/^fred-successor-[a-f0-9]{64}$/.test(item.id ?? '') || successorIds.has(item.id) ||
          !templateIds.has(item.templateId) ||
          !bundle.state.reviews.some(review => review.id === item.reviewId && review.captureId === item.captureId && review.briefing))
        fail('FRED_CLIENT_BUNDLE_INVALID', 'A recurring successor lost its original template or saved report.');
      successorIds.add(item.id);
    }
    if (templates.some(item => item.previousTemplateId !== null && !templateIds.has(item.previousTemplateId)) ||
        successors.some(item => item.previousSuccessorId !== null && !successorIds.has(item.previousSuccessorId)))
      fail('FRED_CLIENT_BUNDLE_INVALID', 'The project export lost a preceding recurring briefing record.');
  }
  const analystReviews = bundle.state.reviews.filter(review => review.briefing);
  if ((bundle.briefings ?? []).length !== analystReviews.length ||
      new Set((bundle.briefings ?? []).map(item => item.manifest?.reviewId)).size !== analystReviews.length ||
      (bundle.briefings ?? []).some(item => !analystReviews.some(review => review.id === item.manifest?.reviewId)))
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The complete project export lost an original analyst briefing.');
  if (releases) inspectFredReleaseBundle(bundle);
  return fredBundleIdentity(bundle);
}

/** Describe a graph only after its complete inspector or native receiver succeeds. */
function fredBundleIdentity(bundle) {
  const version = Number(bundle.schema.slice(bundle.schema.lastIndexOf('v') + 1)), state = bundle.state;
  const ddpKeys = ['ddpCrosswalks', 'ddpPackages', 'ddpMigrations', 'ddpReceivings'];
  const ddp = ddpKeys.some(key => (state[key]?.length ?? 0) > 0), qcew = qcewStatePresent(state);
  return { schema: bundle.schema, projectId: state.id, revision: state.revision,
    bundleSha256: bundle.bundleSha256, captures: bundle.captures.length, publications: bundle.publicationPlans.length,
    ...(version >= 2 ? { briefings: bundle.briefings.length } : {}),
    ...(version >= 3 ? { templates: (state.briefingTemplates ?? []).length, successors: (state.briefingSuccessors ?? []).length } : {}),
    ...(version >= 4 ? { releaseCaptures: bundle.releaseCaptures.length, releaseWatches: (state.releaseWatches ?? []).length,
      releasePlans: bundle.releasePlans.length, releaseCatchUps: (state.releaseCatchUps ?? []).length } : {}),
    ...(ddp ? Object.fromEntries(ddpKeys.map(key => [key, bundle[key].length])) : {}),
    ...(qcew ? { qcew: { captures: bundle.qcew.captures.length, profiles: state.qcew.profiles.length,
      editions: bundle.qcew.editions.length } } : {}) };
}

/** Publishes the complete original bytes without replacing an existing file. */
export async function saveFredFile(client, selection, destination, options = {}) {
  const result = await client.file(selection, options);
  destination = resolve(text(destination, 'download destination', 8192));
  const temporary = join(dirname(destination), '.' + basename(destination) + '.fred-' + randomUUID());
  let handle;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    await handle.writeFile(result.bytes); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, destination); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFredHostFile(destination, Math.max(FRED_CLIENT_MAX_BYTES, result.bytes.length), { expectedSha256: result.sha256 });
      if (existing.length !== result.bytes.length) fail('FRED_CLIENT_FILE_CHANGED', 'The existing download has a different original byte count.');
      return { path: destination, name: result.name, type: result.type, bytes: result.bytes.length, sha256: result.sha256,
        projectId: result.projectId, reused: true, ...(result.bundle ? { bundle: result.bundle } : {}),
        ...(result.releaseCaptureId ? { releaseCaptureId: result.releaseCaptureId } : {}), ...(result.planId ? { planId: result.planId } : {}),
        ...Object.fromEntries(['crosswalkId', 'packageId', 'migrationId', 'receivingId'].filter(key => result[key] !== undefined).map(key => [key, result[key]])) };
    }
    return { path: destination, name: result.name, type: result.type, bytes: result.bytes.length, sha256: result.sha256,
      projectId: result.projectId, reused: false, ...(result.bundle ? { bundle: result.bundle } : {}),
        ...(result.releaseCaptureId ? { releaseCaptureId: result.releaseCaptureId } : {}), ...(result.planId ? { planId: result.planId } : {}),
        ...Object.fromEntries(['crosswalkId', 'packageId', 'migrationId', 'receivingId'].filter(key => result[key] !== undefined).map(key => [key, result[key]])) };
  } finally { await handle?.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

/** Read one complete original project file and preserve its selected version capacity. */
async function readFredWorkspaceBundleFile(source, { expectedSha256 } = {}) {
  let bytes = await readFredHostFile(source, FRED_DDP_MAX_PROJECT_BYTES, { expectedSha256 });
  const sourceBytes = bytes.length, sourceSha256 = fredDigest(bytes);
  let bundle;
  try { bundle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('FRED_CLIENT_BUNDLE_INVALID', 'The original project file is not complete JSON.'); }
  bytes = null;
  if (!['stellar-forge.fred-project-bundle.v5', 'stellar-forge.fred-project-bundle.v6'].includes(bundle?.schema) && sourceBytes > FRED_CLIENT_MAX_BYTES)
    fail('FRED_CLIENT_BUNDLE_INVALID', 'The original version 1–4 project retains its 256 MiB file capacity.');
  return { bundle, sourceBytes, sourceSha256 };
}

/** Inspect the complete original graph without creating a receiving directory. */
export async function inspectFredWorkspaceFile(source, options = {}) {
  const { bundle, sourceBytes, sourceSha256 } = await readFredWorkspaceBundleFile(source, options);
  return { ...inspectFredProjectBundle(bundle), sourceBytes, sourceSha256 };
}

/** Reopens a retained source bundle through the maintained local project receiver. */
export async function receiveFredWorkspaceFile(source, directory, options = {}) {
  const { bundle, sourceBytes, sourceSha256 } = await readFredWorkspaceBundleFile(source, options);
  const { receiveFredProject } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/project.mjs');
  const result = await receiveFredProject({ directory: resolve(directory), bundle });
  return { ...fredBundleIdentity(bundle), sourceBytes, sourceSha256, received: result };
}
