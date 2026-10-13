// SPDX-License-Identifier: MIT
// Customer commissioning records live in the original A2A project and its history.
import { readFileSync } from 'node:fs';
import {
  LIMITS, fail, sha, id, now, canonical, clone, object, text, identifier,
  integer, digest, decodeBase64, safeName, mediaType
} from './foundation.mjs';

export const COMMISSIONING_SCHEMA = 'stellar-forge.a2a-commissioning.v1';
export const PLAN_SCHEMA = 'stellar-forge.a2a-customer-commissioning-plan.v1';
const ANALYSIS_SCHEMA = 'stellar-forge.a2a-analysis-task.v1';
const TEMPLATE = new URL('../../../../stellar-forge/developer-site/a2a-customer-commissioning.json', import.meta.url);
const KINDS = new Set(['buyer', 'merchant', 'period']);
const SOURCE_ROLES = new Set(['customer-approval', 'source-period', 'source-contract', 'receiving-evidence']);
export const COMMISSIONING_ACTIONS = new Set([
  'commission_import_plan', 'commission_retain_source', 'commission_approve_binding',
  'commission_prepare_job', 'commission_review_delivery'
]);
const own = (value, key) => Object.hasOwn(value, key);
const equal = (a, b) => canonical(a) === canonical(b);
const last = (rows, test) => [...rows].reverse().find(test) ?? null;
function need(value, code, message = code, status = 409) { if (!value) fail(code, message, status); }
function pick(rows, key, label) {
  const found = rows.find(row => row.id === key);
  need(found, 'COMMISSION_RECORD_NOT_FOUND', 'The selected ' + label + ' is not retained.', 404);
  return found;
}
function keys(value, allowed, required = allowed) {
  object(value);
  need(Object.keys(value).every(key => allowed.includes(key)) && required.every(key => own(value, key)),
    'COMMISSION_FIELDS', 'Use the complete selected commissioning fields.', 400);
}
function rows(value, label, maximum = 500) {
  need(Array.isArray(value) && value.length > 0 && value.length <= maximum,
    'COMMISSION_LIST', label + ' must be a nonempty bounded list.', 400);
  const ids = new Set();
  for (const row of value) {
    object(row, label); identifier(row.id, label + ' ID');
    need(!ids.has(row.id), 'COMMISSION_DUPLICATE_ID', label + ' IDs must be unique.', 400);
    ids.add(row.id);
  }
  return value;
}
function uniqueIds(value, label, { empty = false } = {}) {
  need(Array.isArray(value) && value.length <= 500 && (empty || value.length > 0),
    'COMMISSION_IDS', label + ' must be a list of selected IDs.', 400);
  for (const key of value) identifier(key, label);
  need(new Set(value).size === value.length, 'COMMISSION_DUPLICATE_ID', label + ' contains a repeated ID.', 400);
  return [...value];
}
function date(value) {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) &&
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value,
    'COMMISSION_DATE', 'Select an actual calendar date.', 400);
  return value;
}
function instant(value) {
  const match = typeof value === 'string' &&
    /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|([+-])(\d\d):(\d\d))$/.exec(value);
  need(match, 'COMMISSION_TIME', 'Source boundaries need complete civil dates, times and explicit time zones.', 400);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  need(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    (match[7] === 'Z' || Number(match[9]) <= 23 && Number(match[10]) <= 59) &&
    Number.isFinite(Date.parse(value)), 'COMMISSION_TIME', 'A source boundary has an invalid civil date, time or offset.', 400);
  return value;
}
function serviceURL(value) {
  text(value, 'merchant service URL', 4000);
  let u; try { u = new URL(value); } catch { fail('COMMISSION_SERVICE_URL', 'Select a complete service URL.'); }
  need(!u.username && !u.password && !u.search && !u.hash &&
    (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)),
    'COMMISSION_SERVICE_URL', 'Use an HTTPS service URL or an explicit loopback reference.', 400);
  return u.href;
}
function jsonBytes(bytes, label, maximum = LIMITS.requestBytes) {
  const raw = Buffer.from(bytes);
  need(raw.length <= maximum, 'COMMISSION_SOURCE_LIMIT', label + ' exceeds its complete-source limit.', 413);
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { fail('COMMISSION_SOURCE_JSON', label + ' must be complete UTF-8 JSON.'); }
  canonical(value); return value;
}
export function validateCommissioningPlan(value) {
  object(value, 'commissioning plan');
  need(value.schema === PLAN_SCHEMA, 'COMMISSION_PLAN_SCHEMA', 'Select an original A2A commissioning plan.', 400);
  identifier(value.id, 'plan ID'); text(value.title, 'plan title', 1000);
  const buyers = new Set(rows(value.buyers, 'buyers').map(row => row.id));
  const merchants = new Set(rows(value.merchants, 'merchants').map(row => row.id));
  const periods = new Set(rows(value.source_periods, 'source periods').map(row => row.id));
  const contracts = new Map(rows(value.output_contracts, 'output contracts').map(row => [row.id, row]));
  for (const job of rows(value.jobs, 'jobs')) {
    text(job.title, 'job title', 1000); text(job.purpose, 'job purpose', 20000);
    text(job.required_selection, 'required source selection', 20000);
    need(buyers.has(job.buyer_id) && merchants.has(job.merchant_id) &&
      ['approved-query', 'approved-report'].includes(job.task_kind), 'COMMISSION_JOB_BINDING',
      'Every job needs a retained buyer, merchant and original query/report kind.', 400);
    uniqueIds(job.source_period_ids, 'job source periods');
    need(job.source_period_ids.every(key => periods.has(key)), 'COMMISSION_JOB_PERIOD', 'A job names an absent source period.', 400);
    const contract = contracts.get(job.output_contract_id);
    need(contract && contract.original_kind === (job.task_kind === 'approved-query' ? 'saved-query' : 'saved-report'),
      'COMMISSION_OUTPUT_CONTRACT', 'The complete output contract must match this job kind.', 400);
    identifier(job.population_id, 'planned population');
    integer(job.calendar_day, 'relative calendar day', 1, 366);
    need(job.planned_business_jobs === 1, 'COMMISSION_JOB_COUNT', 'Each register row represents one useful business job.', 400);
  }
  return value;
}
export function commissioningTemplate() {
  const bytes = readFileSync(TEMPLATE); validateCommissioningPlan(jsonBytes(bytes, 'original commissioning template'));
  return { bytes, sha256: sha(bytes), filename: 'a2a-customer-commissioning.json', mediaType: 'application/json' };
}
function state(project, create = false) {
  if (!project.commissioning && create) project.commissioning = {
    schema: COMMISSIONING_SCHEMA, plans: [], approvals: [], preparations: [], deliveries: []
  };
  const value = project.commissioning;
  if (!value) return null;
  need(value.schema === COMMISSIONING_SCHEMA &&
    ['plans', 'approvals', 'preparations', 'deliveries'].every(key => Array.isArray(value[key])),
    'COMMISSION_STATE', 'The commissioning history has an invalid shape.');
  return value;
}
function source(project, sourceId) {
  return pick(project.sources, sourceId, 'source');
}
function sourceRef(project, sourceId) {
  const s = source(project, sourceId);
  return { id: s.id, sha256: s.sha256, bytes: s.bytes, filename: s.filename, mediaType: s.mediaType, role: s.role };
}
function refs(project, ids, role = null) {
  return uniqueIds(ids, 'evidence sources').map(key => {
    const s = sourceRef(project, key);
    if (role) need(s.role === 'commission-' + role, 'COMMISSION_SOURCE_ROLE', 'Select the original ' + role + ' source.');
    return s;
  });
}
function readPlan(project, selected, read) {
  const s = source(project, selected.sourceId);
  need(s.role === 'commission-plan' && s.sha256 === selected.sha256 && s.bytes === selected.bytes,
    'COMMISSION_PLAN_SOURCE', 'The plan no longer matches its complete retained source.');
  const bytes = read(s.sha256);
  need(bytes.length === s.bytes && sha(bytes) === s.sha256, 'COMMISSION_PLAN_SOURCE');
  const plan = validateCommissioningPlan(jsonBytes(bytes, 'retained commissioning plan'));
  need(plan.id === selected.planId && plan.jobs.length === selected.jobCount, 'COMMISSION_PLAN_SOURCE');
  return plan;
}
function selectedPlan(project, planId, read) {
  const record = pick(state(project)?.plans ?? [], planId, 'commissioning plan');
  return { record, plan: readPlan(project, record, read) };
}
function approvalDetail(project, kind, value) {
  object(value, 'binding details');
  if (kind === 'buyer') {
    keys(value, ['organization', 'accountableBuyer', 'receivingPerson', 'population', 'independenceBasis']);
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, text(value, key, 10000)]));
  }
  if (kind === 'merchant') {
    keys(value, ['organization', 'installationId', 'serviceUrl', 'accountableOperator']);
    return {
      organization: text(value.organization, 'merchant organization', 1000),
      installationId: text(value.installationId, 'original installation ID', 1000),
      serviceUrl: serviceURL(value.serviceUrl),
      accountableOperator: text(value.accountableOperator, 'accountable operator', 1000)
    };
  }
  keys(value, ['startsAt', 'endsAt', 'sourceEditionId', 'sourceIds', 'licenseBasis', 'population']);
  const startsAt = instant(value.startsAt), endsAt = instant(value.endsAt);
  need(Date.parse(startsAt) < Date.parse(endsAt), 'COMMISSION_PERIOD_ORDER', 'The source period must have a positive interval.', 400);
  const sources = refs(project, value.sourceIds, 'source-period');
  need(sources.every(s => s.bytes > 0), 'COMMISSION_PERIOD_SOURCE', 'Retain each complete nonempty source-period file.');
  return {
    startsAt, endsAt, sourceEditionId: text(value.sourceEditionId, 'original source edition', 1000),
    sourceIds: sources.map(s => s.id), licenseBasis: text(value.licenseBasis, 'source use basis', 10000),
    population: text(value.population, 'source population', 10000)
  };
}
function approvalDigest(record) {
  return sha(canonical({
    planId: record.planId, kind: record.kind, key: record.key, details: record.details,
    evidence: record.evidence, sourceFiles: record.sourceFiles, reason: record.reason
  }));
}
function latestApproval(project, planId, kind, key) {
  const found = last(state(project)?.approvals ?? [], row => row.planId === planId && row.kind === kind && row.key === key);
  need(found, 'COMMISSION_APPROVAL_REQUIRED', 'Retain and review the ' + kind + ' binding for ' + key + '.');
  return found;
}
function planKey(plan, kind, key) {
  const field = kind === 'buyer' ? 'buyers' : kind === 'merchant' ? 'merchants' : 'source_periods';
  pick(plan[field], key, kind);
}
function requireEvidence(project, ids, role = null) {
  const selected = refs(project, ids, role);
  need(selected.every(s => s.role.startsWith('commission-') && s.role !== 'commission-plan'),
    'COMMISSION_EVIDENCE_ROLE', 'Select retained commissioning evidence files.');
  return selected;
}
function parameters(value) {
  if (value === null || value === undefined) return null;
  text(value, 'unchanged parameters JSON text', 128 * 1024, { empty: true });
  let parsed; try { parsed = JSON.parse(value); } catch { fail('COMMISSION_PARAMETERS_JSON', 'Keep a complete JSON array or object as the original parameter text.'); }
  need(parsed !== null && typeof parsed === 'object', 'COMMISSION_PARAMETERS_JSON', 'Parameters must be a JSON array or object.', 400);
  return value;
}
function publicProcedure(value) {
  object(value, 'observed procedure'); identifier(value.id, 'procedure ID');
  need(['query', 'report'].includes(value.kind) && /^[a-f0-9]{32}$/.test(value.workspaceId ?? ''),
    'COMMISSION_PROCEDURE', 'Select an original analytical query or report procedure.');
  text(value.workspace, 'workspace name', 1000); text(value.name, 'procedure name', 1000);
  digest(value.procedureSha256); need(typeof value.parametersAllowed === 'boolean', 'COMMISSION_PROCEDURE');
  need(Array.isArray(value.views) && value.views.length <= 1000, 'COMMISSION_PROCEDURE_VIEWS');
  const names = new Set();
  for (const view of value.views) {
    object(view); identifier(view.name, 'view name'); digest(view.version_id);
    integer(view.revision, 'view revision', 1, Number.MAX_SAFE_INTEGER);
    need(!names.has(view.name), 'COMMISSION_PROCEDURE_VIEWS'); names.add(view.name);
  }
  const formats = value.kind === 'query' ? ['csv', 'jsonl', 'sqlite'] : ['csv', 'html', 'json'];
  need(Array.isArray(value.formats) && value.formats.length > 0 && value.formats.length <= 3 &&
    new Set(value.formats).size === value.formats.length && value.formats.every(format => formats.includes(format)),
    'COMMISSION_PROCEDURE_FORMATS', 'The original catalogue declares unsupported output formats.');
  const definition = value.kind === 'query' ? value.query : value.report;
  object(definition); identifier(definition.name, 'saved definition name');
  integer(definition.revision, 'saved definition revision', 1, Number.MAX_SAFE_INTEGER);
  if (value.kind === 'report') digest(definition.sha256);
  return clone(value);
}
function nativeInput(message) {
  const m = message.native?.message;
  need(m?.role === 'ROLE_USER' && Array.isArray(m.parts) && m.parts.length === 1,
    'COMMISSION_MESSAGE', 'Use the original one-part analytical request.');
  const part = m.parts[0];
  let value = part.data;
  if (typeof part.text === 'string') {
    try { value = JSON.parse(part.text); } catch { fail('COMMISSION_MESSAGE'); }
  }
  object(value, 'original analytical request'); return value;
}
function fileJSON(packet, filename, read) {
  const matches = packet.capture.files.filter(file => file.filename === filename);
  need(matches.length === 1, 'COMMISSION_NATIVE_FILE', 'The complete original result must contain exactly one ' + filename + '.');
  const file = matches[0];
  const bytes = read(file.sha256);
  need(bytes.length === file.bytes && sha(bytes) === file.sha256, 'COMMISSION_NATIVE_FILE_IDENTITY');
  return { file, value: jsonBytes(bytes, filename, LIMITS.artifactBytes) };
}
function catalogue(project, editionId, context) {
  const packet = context.result(project, editionId);
  need(packet.observation.kind === 'task' &&
    packet.messages.some(message => {
      let value; try { value = nativeInput(message); } catch { return false; }
      return value.action === 'catalog' && Object.keys(value).length === 1;
    }), 'COMMISSION_CATALOGUE_REQUEST', 'Freeze the complete result of an original catalogue request first.');
  const selected = fileJSON(packet, 'catalog.json', context.read);
  need(selected.value.schema === ANALYSIS_SCHEMA && Array.isArray(selected.value.procedures) &&
    selected.value.procedures.length > 0 && selected.value.procedures.length <= 256,
    'COMMISSION_CATALOGUE_SCHEMA', 'This edition is not an original analytical procedure catalogue.');
  const procedures = selected.value.procedures.map(publicProcedure);
  need(new Set(procedures.map(p => p.id)).size === procedures.length, 'COMMISSION_CATALOGUE_DUPLICATE');
  return { packet, file: selected.file, procedures };
}
function selectedBindings(project, planId, job) {
  return [
    latestApproval(project, planId, 'buyer', job.buyer_id),
    latestApproval(project, planId, 'merchant', job.merchant_id),
    ...job.source_period_ids.map(key => latestApproval(project, planId, 'period', key))
  ];
}
function viewBindings(procedure, job, value) {
  need(Array.isArray(value) && value.length === procedure.views.length,
    'COMMISSION_VIEW_PERIODS', 'Review every original view against the selected source periods.');
  const names = new Set(), covered = new Set();
  const mapped = value.map(item => {
    keys(item, ['name', 'periodIds']); identifier(item.name, 'view name');
    const view = procedure.views.find(v => v.name === item.name);
    need(view && !names.has(item.name), 'COMMISSION_VIEW_PERIODS', 'Map each original view once.');
    names.add(item.name);
    const periodIds = uniqueIds(item.periodIds, 'view source periods');
    need(periodIds.every(key => job.source_period_ids.includes(key)), 'COMMISSION_VIEW_PERIODS');
    periodIds.forEach(key => covered.add(key));
    return { name: item.name, versionId: view.version_id, revision: view.revision, periodIds };
  });
  need(job.source_period_ids.every(key => covered.has(key)), 'COMMISSION_VIEW_PERIODS',
    'Every required source period must be covered by the reviewed view mapping.');
  return mapped;
}
function prepareSelection(project, input, context) {
  const { record, plan } = selectedPlan(project, input.planId, context.read);
  const job = pick(plan.jobs, input.jobId, 'planned job');
  const selected = catalogue(project, input.catalogueEditionId, context);
  const procedure = pick(selected.procedures, input.procedureId, 'observed procedure');
  need(procedure.kind === (job.task_kind === 'approved-query' ? 'query' : 'report'),
    'COMMISSION_JOB_PROCEDURE_KIND', 'The observed procedure must produce this job’s required complete output.');
  const requiredFormats = procedure.kind === 'query' ? ['csv', 'jsonl', 'sqlite'] : ['csv', 'html', 'json'];
  need(equal([...procedure.formats].sort(), requiredFormats), 'COMMISSION_COMPLETE_FORMATS',
    'Select the complete three-format procedure required by this job.');
  const bindings = selectedBindings(project, record.id, job);
  const parameterText = parameters(input.parametersText);
  need(parameterText === null || procedure.parametersAllowed && procedure.kind === 'query',
    'COMMISSION_FIXED_PARAMETERS', 'This original procedure uses its saved parameters.');
  const existingMessage = input.messageId ? pick(project.messages, input.messageId, 'reviewed message') : null;
  const selection = existingMessage?.selection ?? project.selection;
  need(selection && equal(selection, selected.packet.edition.selection), 'COMMISSION_AGENT_SELECTION',
    'Use the exact agent selection captured by this catalogue edition.');
  const request = { action: 'run', procedureId: procedure.id, ...(parameterText === null ? {} : { parametersText: parameterText }) };
  if (existingMessage) {
    need(!existingMessage.native.message.taskId && equal(nativeInput(existingMessage), request),
      'COMMISSION_MESSAGE_SELECTION', 'The existing reviewed message must contain this exact original run request.');
  }
  return {
    id: id(), createdAt: now(), requestId: input.requestId,
    planId: record.id, planSha256: record.sha256, jobId: job.id,
    mode: existingMessage ? 'adopted' : 'prepared',
    scheduledDate: date(input.scheduledDate), catalogueEditionId: selected.packet.edition.id,
    catalogueSourceId: selected.file.sourceId, catalogueSha256: selected.file.sha256,
    procedure, parametersText: parameterText, selection: clone(selection),
    approvals: bindings.map(row => ({ id: row.id, sha256: row.sha256 })),
    viewPeriods: viewBindings(procedure, job, input.viewPeriods),
    evidence: requireEvidence(project, input.evidenceSourceIds),
    reason: text(input.reason, 'job source and customer review', 30000),
    receivingPerson: bindings[0].details.receivingPerson,
    messageId: existingMessage?.id ?? null,
    originalMessageCreatedAt: existingMessage?.createdAt ?? null
  };
}
export function commissioningMessageInput(project, input, context) {
  const selected = prepareSelection(project, input, context);
  if (selected.mode === 'adopted') return null;
  return {
    message: { messageId: 'commission-' + sha(input.requestId).slice(0, 40), role: 'ROLE_USER',
      parts: [{ data: { action: 'run', procedureId: selected.procedure.id,
        ...(selected.parametersText === null ? {} : { parametersText: selected.parametersText }) } }] },
    configuration: { returnImmediately: true },
    metadata: { commissioning: { planId: selected.planId, planSha256: selected.planSha256, jobId: selected.jobId } }
  };
}
function preparationDigest(record) {
  const value = clone(record); delete value.sha256; return sha(canonical(value));
}
export function assertCommissioningSend(project, messageId) {
  const c = state(project); if (!c) return;
  const preparation = c.preparations.find(row => row.messageId === messageId); if (!preparation) return;
  const latest = last(c.preparations, row => row.planId === preparation.planId && row.jobId === preparation.jobId);
  need(latest?.id === preparation.id, 'COMMISSION_SUPERSEDED_MESSAGE', 'Prepare or select the current reviewed job message.');
  for (const ref of preparation.approvals) {
    const approval = pick(c.approvals, ref.id, 'saved approval');
    const current = latestApproval(project, approval.planId, approval.kind, approval.key);
    need(current.id === approval.id && current.sha256 === ref.sha256, 'COMMISSION_APPROVAL_CHANGED',
      'The customer or source binding changed. Review and replace this unsent job preparation.');
  }
}
function analysisResult(project, preparation, editionId, context) {
  const packet = context.result(project, editionId);
  need(packet.observation.kind === 'task', 'COMMISSION_TASK_REQUIRED', 'Bind the original complete analytical Task.');
  const task = packet.observation.value, message = pick(project.messages, preparation.messageId, 'job message');
  need(packet.messages.some(m => m.id === message.id && equal(m.native, message.native)) &&
    ((task.history ?? []).some(m => m.messageId === message.native.message.messageId) ||
      message.adoptedTaskId === task.id || packet.observation.operationId === message.sendRequestId),
    'COMMISSION_TASK_MESSAGE', 'This task is not the retained result of the selected original job message.');
  need(equal(packet.edition.selection, preparation.selection), 'COMMISSION_TASK_SELECTION',
    'The task result came from another original agent selection.');
  const selected = fileJSON(packet, 'analysis-record.json', context.read);
  const record = selected.value, p = record.procedure, nativePlan = task.metadata?.analysis?.plan;
  need(nativePlan?.schema === ANALYSIS_SCHEMA && equal(nativePlan.procedure, p) &&
    nativePlan.procedureSha256 === record.procedureSha256 &&
    equal(task.metadata.analysis.nativeJobs, record.nativeJobs) &&
    equal(task.metadata.analysis.result, record.result), 'COMMISSION_NATIVE_TASK_RECORD',
    'The complete analysis file must match the same Task’s retained native plan, jobs and result.');
  need(record.schema === ANALYSIS_SCHEMA && record.taskId === task.id && record.contextId === task.contextId &&
    record.procedureSha256 === preparation.procedure.procedureSha256 &&
    sha(canonical(p)) === record.procedureSha256, 'COMMISSION_ANALYSIS_IDENTITY',
    'The original analysis record does not match the commissioned task and procedure.');
  need(p.id === preparation.procedure.id && p.kind === preparation.procedure.kind &&
    p.workspaceId === preparation.procedure.workspaceId && equal(p.views, preparation.procedure.views),
    'COMMISSION_ANALYSIS_VIEWS');
  const expectedParameters = preparation.parametersText ?? p.query?.parameters_text;
  if (p.kind === 'query') need(record.parametersText === expectedParameters, 'COMMISSION_ANALYSIS_PARAMETERS',
    'The completed query used different original parameter text.');
  else need(!own(record, 'parametersText'), 'COMMISSION_ANALYSIS_PARAMETERS');
  const result = record.result;
  need(result?.kind === p.kind && result.originalWorkspaceId === p.workspaceId && Array.isArray(result.outputs),
    'COMMISSION_ANALYSIS_RESULT');
  const outputFiles = packet.capture.files.filter(file => file.sourceId !== selected.file.sourceId);
  need(outputFiles.length === result.outputs.length, 'COMMISSION_ANALYSIS_OUTPUTS',
    'The native analysis output list must cover every complete original file.');
  const seen = new Set();
  for (const output of result.outputs) {
    const file = outputFiles.find(f => f.artifactId === output.artifactId && f.index === 0);
    need(file && !seen.has(file.sourceId) && file.filename === output.filename &&
      file.bytes === output.bytes && file.sha256 === output.sha256 && file.mediaType === output.mediaType,
      'COMMISSION_ANALYSIS_OUTPUTS', 'A complete native output identity differs from the retained task.');
    const artifact = task.artifacts?.find(a => a.artifactId === file.artifactId);
    need(artifact?.metadata?.originalJobId === output.originalJobId &&
      artifact?.metadata?.originalWorkspaceId === p.workspaceId, 'COMMISSION_NATIVE_JOB');
    seen.add(file.sourceId);
  }
  need(Array.isArray(record.nativeJobs) && record.nativeJobs.length > 0 &&
    record.nativeJobs.every(job => job.status === 'COMPLETE'), 'COMMISSION_NATIVE_JOBS',
    'Retain completed original native job receipts.');
  if (p.kind === 'query') {
    need(result.queryComplete === true && equal(outputFiles.map(f => f.filename).sort(),
      ['manifest.json', 'rows.csv', 'rows.jsonl', 'rows.sqlite3']), 'COMMISSION_QUERY_COMPLETENESS');
    need(record.nativeJobs.some(j => j.id === result.queryId && j.kind === 'query') &&
      record.nativeJobs.some(j => j.id === result.exportId && j.kind === 'query-export'), 'COMMISSION_NATIVE_JOBS');
    const manifestFile = outputFiles.find(f => f.filename === 'manifest.json');
    const exportCall = nativePlan.calls?.queryExport;
    need(exportCall?.operation === 'query-export' && exportCall.request.id === result.exportId &&
      exportCall.request.query_id === result.queryId && equal([...exportCall.request.formats].sort(), ['csv', 'jsonl', 'sqlite']),
      'COMMISSION_QUERY_EXPORT');
    need(manifestFile.sha256 === result.manifestSha256, 'COMMISSION_QUERY_MANIFEST');
    const manifest = jsonBytes(context.read(manifestFile.sha256), 'original query manifest', LIMITS.artifactBytes);
    need(manifest.queryComplete === true && manifest.rowCount === result.rowCount, 'COMMISSION_QUERY_MANIFEST');
  } else {
    need(result.publication?.job_id === result.reportId &&
      record.nativeJobs.some(j => j.id === result.reportId && j.kind === 'report') &&
      /^[a-f0-9]{64}$/.test(result.publicationSha256 ?? ''), 'COMMISSION_REPORT_PUBLICATION');
    const exportIds = new Set();
    for (const format of ['csv', 'html', 'json']) {
      const call = nativePlan.calls?.['reportExport_' + format];
      need(call?.operation === 'report-export' && call.request.format === format &&
        call.request.publication_id === result.publication.id &&
        call.request.publication_sha256 === result.publicationSha256 &&
        record.nativeJobs.some(j => j.id === call.request.id && j.kind === 'report-export') &&
        result.outputs.filter(output => output.originalJobId === call.request.id).length === 1,
        'COMMISSION_REPORT_EXPORT');
      need(!exportIds.has(call.request.id), 'COMMISSION_REPORT_EXPORT'); exportIds.add(call.request.id);
    }
  }
  return {
    packet, record, source: selected.file,
    identity: {
      taskId: task.id, contextId: task.contextId, observationId: packet.observation.id,
      observationSha256: packet.observation.sha256, editionId: packet.edition.id,
      editionRevision: packet.edition.projectRevision, captureId: packet.capture.id,
      analysisSourceId: selected.file.sourceId, analysisSha256: selected.file.sha256,
      originalWorkspaceId: p.workspaceId, procedureSha256: record.procedureSha256,
      nativeJobs: clone(record.nativeJobs), files: packet.capture.files.map(file => ({
        artifactId: file.artifactId, index: file.index, sourceId: file.sourceId,
        filename: file.filename, mediaType: file.mediaType, sha256: file.sha256, bytes: file.bytes
      }))
    }
  };
}
function publicationRef(project, publicationId, editionId, preparation) {
  if (!publicationId) return null;
  const p = pick(project.publications, publicationId, 'original merchant publication');
  need(p.editionId === editionId && p.paymentAuthority === 'original-sf30-x402',
    'COMMISSION_PUBLICATION_EDITION', 'Select the original seller publication of this exact result edition.');
  const merchant = preparation.approvals.map(ref => pick(state(project).approvals, ref.id, 'merchant approval')).find(row => row.kind === 'merchant');
  need(merchant && p.service.routes.some(route => new URL(route.path, p.service.publicOrigin).href === merchant.details.serviceUrl),
    'COMMISSION_MERCHANT_SERVICE', 'The original publication must match the exact merchant service URL reviewed for this job.');
  return { id: p.id, editionId, assetSha256: p.asset.sha256, assetBytes: p.asset.bytes,
    service: clone(p.service), paymentAuthority: p.paymentAuthority };
}
function deliveryDigest(record) { const value = clone(record); delete value.sha256; return sha(canonical(value)); }
export function applyCommissioning(workspace, project, action, input, context) {
  const c = state(project, true);
  if (action === 'commission_retain_source') {
    need(SOURCE_ROLES.has(input.role), 'COMMISSION_SOURCE_ROLE');
    const bytes = decodeBase64(input.contentBase64, LIMITS.artifactBytes);
    const note = text(input.note, 'source provenance and purpose', 30000);
    const record = workspace.addSource(project, workspace.put(bytes, {
      role: 'commission-' + input.role, filename: safeName(input.filename, 'commissioning-source.bin'),
      mediaType: mediaType(input.mediaType), operationId: input.requestId, note
    }));
    return { sourceId: record.id, sha256: record.sha256, bytes: record.bytes };
  }
  if (action === 'commission_import_plan') {
    const bytes = decodeBase64(input.contentBase64, LIMITS.requestBytes);
    const plan = validateCommissioningPlan(jsonBytes(bytes, 'commissioning plan'));
    need(['customer', 'reference'].includes(input.context), 'COMMISSION_CONTEXT',
      'Declare whether this is customer work or an explicitly attributed reference.', 400);
    const attribution = text(input.attribution, 'source and customer attribution', 30000);
    const same = c.plans.find(row => row.sha256 === sha(bytes));
    if (same) {
      need(same.context === input.context && same.attribution === attribution, 'COMMISSION_PLAN_ATTRIBUTION',
        'The original plan is already retained with another attribution.');
      return { planId: same.id, sourceId: same.sourceId, reused: true };
    }
    const s = workspace.addSource(project, workspace.put(bytes, {
      role: 'commission-plan', filename: safeName(input.filename, 'commissioning-plan.json'),
      mediaType: 'application/json', operationId: input.requestId
    }));
    const record = { id: id(), createdAt: now(), requestId: input.requestId, planId: plan.id,
      title: text(input.title ?? plan.title, 'commissioning title', 1000), sourceId: s.id,
      sha256: s.sha256, bytes: s.bytes, jobCount: plan.jobs.length, context: input.context, attribution };
    c.plans.push(record); return { planId: record.id, sourceId: s.id, sha256: s.sha256 };
  }
  if (action === 'commission_approve_binding') {
    need(KINDS.has(input.kind), 'COMMISSION_BINDING_KIND');
    const { record, plan } = selectedPlan(project, input.planId, context.read);
    planKey(plan, input.kind, input.key);
    const details = approvalDetail(project, input.kind, input.details);
    const selected = { id: id(), createdAt: now(), requestId: input.requestId, planId: record.id,
      kind: input.kind, key: input.key, details,
      evidence: requireEvidence(project, input.evidenceSourceIds),
      sourceFiles: input.kind === 'period' ? refs(project, details.sourceIds, 'source-period') : [],
      reason: text(input.reason, 'binding review', 30000) };
    selected.sha256 = approvalDigest(selected); c.approvals.push(selected);
    return { approvalId: selected.id, sha256: selected.sha256 };
  }
  if (action === 'commission_prepare_job') {
    const selected = prepareSelection(project, input, context);
    const prior = last(c.preparations, row => row.planId === selected.planId && row.jobId === selected.jobId);
    if (prior) {
      const message = pick(project.messages, prior.messageId, 'prior job message');
      need(!message.sendRequestId && !message.adoptedTaskId &&
        !c.deliveries.some(row => row.preparationId === prior.id), 'COMMISSION_JOB_ALREADY_ATTEMPTED',
        'Continue the original task of this job. A new preparation cannot replace an attempted request.');
    }
    if (selected.messageId) {
      need(!c.preparations.some(row => row.messageId === selected.messageId),
        'COMMISSION_MESSAGE_ALREADY_BOUND', 'This original message already belongs to a retained customer job.');
    } else {
      const expected = commissioningMessageInput(project, input, context);
      need(input.normalized && equal(nativeInput({ native: input.normalized }), expected.message.parts[0].data) &&
        input.normalized.message.messageId === expected.message.messageId && !input.normalized.message.taskId,
        'COMMISSION_NORMALIZED_MESSAGE');
      const prepared = workspace.local(project, 'prepare_message', {
        requestId: input.requestId, normalized: input.normalized,
        note: 'Commissioning job ' + selected.jobId + ': ' + selected.reason
      });
      selected.messageId = prepared.messageId;
      selected.originalMessageCreatedAt = pick(project.messages, prepared.messageId, 'prepared message').createdAt;
    }
    selected.supersedes = prior?.id ?? null; selected.sha256 = preparationDigest(selected);
    c.preparations.push(selected);
    return { preparationId: selected.id, messageId: selected.messageId, mode: selected.mode, sha256: selected.sha256 };
  }
  if (action === 'commission_review_delivery') {
    const preparation = pick(c.preparations, input.preparationId, 'job preparation');
    const latest = last(c.preparations, row => row.planId === preparation.planId && row.jobId === preparation.jobId);
    need(latest.id === preparation.id, 'COMMISSION_SUPERSEDED_MESSAGE');
    const native = analysisResult(project, preparation, input.editionId, context);
    const taskKey = canonical([preparation.selection.interface.url, native.identity.taskId]);
    need(!c.deliveries.some(row => row.taskKey === taskKey &&
      (row.planId !== preparation.planId || row.jobId !== preparation.jobId)), 'COMMISSION_TASK_ALREADY_COUNTED',
      'The same native task cannot be recorded as a second useful customer job.');
    need(['accepted', 'changes_requested', 'rejected'].includes(input.decision), 'COMMISSION_RECEIVING_DECISION');
    const selected = {
      id: id(), createdAt: now(), requestId: input.requestId, planId: preparation.planId,
      jobId: preparation.jobId, preparationId: preparation.id, taskKey,
      native: native.identity, publication: publicationRef(project, input.publicationId, input.editionId, preparation),
      receivingPerson: preparation.receivingPerson, recordedBy: workspace.operator,
      decision: input.decision, note: text(input.note, 'complete receiving review', 30000),
      evidence: requireEvidence(project, input.evidenceSourceIds, 'receiving-evidence'),
      settlementStatus: 'not_evaluated',
      paymentAuthority: 'Original SF30/SF82 settlement records; this review does not assert a purchase.'
    };
    selected.sha256 = deliveryDigest(selected); c.deliveries.push(selected);
    return { deliveryId: selected.id, taskId: native.identity.taskId, decision: selected.decision, sha256: selected.sha256 };
  }
  fail('COMMISSION_ACTION', 'Unknown commissioning action.', 404);
}
function validateRef(project, ref) {
  need(equal(sourceRef(project, ref.id), ref), 'COMMISSION_RETAINED_SOURCE_CHANGED');
}
export function validateCommissioning(project, context) {
  const c = state(project); if (!c) return;
  const used = new Set(), plans = new Map();
  for (const field of ['plans', 'approvals', 'preparations', 'deliveries']) {
    need(c[field].length <= 10000, 'COMMISSION_HISTORY_LIMIT');
    for (const row of c[field]) {
      identifier(row.id); identifier(row.requestId);
      need(!used.has(row.id), 'COMMISSION_DUPLICATE_ID'); used.add(row.id);
    }
  }
  for (const row of c.plans) {
    need(['customer', 'reference'].includes(row.context), 'COMMISSION_CONTEXT');
    text(row.attribution, 'attribution', 30000);
    plans.set(row.id, readPlan(project, row, context.read));
  }
  for (const row of c.approvals) {
    need(KINDS.has(row.kind) && plans.has(row.planId), 'COMMISSION_APPROVAL_BINDING');
    planKey(plans.get(row.planId), row.kind, row.key);
    need(equal(approvalDetail(project, row.kind, row.details), row.details) &&
      row.sha256 === approvalDigest(row), 'COMMISSION_APPROVAL_IDENTITY');
    need(Array.isArray(row.evidence) && equal(requireEvidence(project, row.evidence.map(ref => ref.id)), row.evidence),
      'COMMISSION_APPROVAL_EVIDENCE');
    row.evidence.forEach(ref => validateRef(project, ref));
    row.sourceFiles.forEach(ref => validateRef(project, ref));
    need(equal(row.sourceFiles, row.kind === 'period' ? refs(project, row.details.sourceIds, 'source-period') : []),
      'COMMISSION_APPROVAL_SOURCE_FILES');
  }
  const taskOwners = new Map(), messageOwners = new Set();
  for (const row of c.preparations) {
    const plan = plans.get(row.planId), planRecord = pick(c.plans, row.planId, 'plan');
    need(plan && row.planSha256 === planRecord.sha256 && row.sha256 === preparationDigest(row),
      'COMMISSION_PREPARATION_IDENTITY');
    const job = pick(plan.jobs, row.jobId, 'job');
    need(['prepared', 'adopted'].includes(row.mode), 'COMMISSION_PREPARATION_MODE'); date(row.scheduledDate);
    const selected = catalogue(project, row.catalogueEditionId, context);
    const procedure = pick(selected.procedures, row.procedure.id, 'catalogued procedure');
    need(equal(procedure, row.procedure) && selected.file.sourceId === row.catalogueSourceId &&
      selected.file.sha256 === row.catalogueSha256 && equal(selected.packet.edition.selection, row.selection),
      'COMMISSION_CATALOGUE_BINDING');
    need(procedure.kind === (job.task_kind === 'approved-query' ? 'query' : 'report') &&
      equal([...procedure.formats].sort(), procedure.kind === 'query' ? ['csv', 'jsonl', 'sqlite'] : ['csv', 'html', 'json']) &&
      (row.parametersText === null || procedure.parametersAllowed && procedure.kind === 'query') &&
      equal(viewBindings(procedure, job, row.viewPeriods.map(v => ({ name: v.name, periodIds: v.periodIds }))), row.viewPeriods),
      'COMMISSION_JOB_SOURCE_BINDING');
    const bindings = row.approvals.map(ref => {
      const approval = pick(c.approvals, ref.id, 'preparation approval');
      need(approval.planId === row.planId && approval.sha256 === ref.sha256, 'COMMISSION_PREPARATION_APPROVAL');
      return approval;
    });
    need(equal(bindings.map(v => [v.kind, v.key]), [
      ['buyer', job.buyer_id], ['merchant', job.merchant_id], ...job.source_period_ids.map(key => ['period', key])
    ]) && row.receivingPerson === bindings[0].details.receivingPerson, 'COMMISSION_PREPARATION_APPROVAL');
    const message = pick(project.messages, row.messageId, 'job message');
    need(!messageOwners.has(message.id), 'COMMISSION_MESSAGE_ALREADY_BOUND'); messageOwners.add(message.id);
    const request = { action: 'run', procedureId: procedure.id,
      ...(row.parametersText === null ? {} : { parametersText: parameters(row.parametersText) }) };
    need(equal(nativeInput(message), request) && equal(message.selection, row.selection) &&
      !message.native.message.taskId && message.createdAt === row.originalMessageCreatedAt, 'COMMISSION_MESSAGE_SELECTION');
    if (row.mode === 'prepared') need(message.native.message.messageId === 'commission-' + sha(row.requestId).slice(0, 40),
      'COMMISSION_MESSAGE_IDENTITY');
    if (row.supersedes) {
      const old = pick(c.preparations, row.supersedes, 'previous job preparation');
      const oldMessage = pick(project.messages, old.messageId, 'previous job message');
      need(old.planId === row.planId && old.jobId === row.jobId && !oldMessage.sendRequestId &&
        !oldMessage.adoptedTaskId && c.preparations.indexOf(old) < c.preparations.indexOf(row), 'COMMISSION_SUPERSESSION');
    }
    need(Array.isArray(row.evidence) && equal(requireEvidence(project, row.evidence.map(ref => ref.id)), row.evidence),
      'COMMISSION_JOB_APPROVAL_EVIDENCE'); row.evidence.forEach(ref => validateRef(project, ref));
  }
  for (const row of c.deliveries) {
    const preparation = pick(c.preparations, row.preparationId, 'delivery preparation');
    const native = analysisResult(project, preparation, row.native.editionId, context);
    need(row.planId === preparation.planId && row.jobId === preparation.jobId &&
      equal(native.identity, row.native) && row.receivingPerson === preparation.receivingPerson &&
      row.sha256 === deliveryDigest(row) && ['accepted', 'changes_requested', 'rejected'].includes(row.decision) &&
      row.settlementStatus === 'not_evaluated', 'COMMISSION_DELIVERY_IDENTITY');
    const taskKey = canonical([preparation.selection.interface.url, row.native.taskId]);
    need(row.taskKey === taskKey, 'COMMISSION_TASK_IDENTITY');
    const owner = taskOwners.get(taskKey), key = canonical([row.planId, row.jobId]);
    need(!owner || owner === key, 'COMMISSION_TASK_ALREADY_COUNTED'); taskOwners.set(taskKey, key);
    need(equal(row.publication, publicationRef(project, row.publication?.id, row.native.editionId, preparation)),
      'COMMISSION_PUBLICATION_EDITION');
    need(row.evidence.length > 0, 'COMMISSION_RECEIVING_EVIDENCE');
    row.evidence.forEach(ref => { validateRef(project, ref); need(ref.role === 'commission-receiving-evidence', 'COMMISSION_EVIDENCE_ROLE'); });
  }
}
export function commissioningView(project, context) {
  const c = state(project);
  if (!c) return { schema: COMMISSIONING_SCHEMA, plans: [], catalogues: [], counts: { plans: 0, jobs: 0, prepared: 0, observedTasks: 0, accepted: 0 } };
  const catalogues = [];
  for (const edition of project.editions) {
    const capture = project.artifactCaptures.find(row => row.id === edition.captureId);
    if (!capture?.files.some(file => file.filename === 'catalog.json')) continue;
    try {
      const selected = catalogue(project, edition.id, context);
      catalogues.push({ editionId: edition.id, title: edition.title, sourceId: selected.file.sourceId,
        sha256: selected.file.sha256, selection: clone(edition.selection), procedures: selected.procedures });
    } catch (error) {
      catalogues.push({ editionId: edition.id, title: edition.title, error: error.code ?? 'COMMISSION_CATALOGUE_UNAVAILABLE', procedures: [] });
    }
  }
  const plans = c.plans.map(record => {
    const plan = readPlan(project, record, context.read);
    const approvals = c.approvals.filter(row => row.planId === record.id);
    const jobs = plan.jobs.map(job => {
      const preparation = last(c.preparations, row => row.planId === record.id && row.jobId === job.id);
      const delivery = last(c.deliveries, row => row.planId === record.id && row.jobId === job.id);
      const message = preparation ? pick(project.messages, preparation.messageId, 'job message') : null;
      const operation = message?.sendRequestId ? project.operations.find(row => row.requestId === message.sendRequestId) : null;
      const taskIds = message ? [...new Set(project.observations.filter(row => row.kind === 'task' && equal(row.selection, preparation.selection) &&
        (row.operationId === message.sendRequestId || row.value.id === message.adoptedTaskId ||
          (row.value.history ?? []).some(m => m.messageId === message.native.message.messageId))).map(row => row.value.id))] : [];
      let changed = false;
      if (preparation) for (const ref of preparation.approvals) {
        const saved = pick(c.approvals, ref.id, 'approval');
        changed ||= last(approvals, row => row.kind === saved.kind && row.key === saved.key)?.id !== saved.id;
      }
      return { ...clone(job), preparation: clone(preparation), delivery: clone(delivery),
        messageState: message ? { id: message.id, nativeMessageId: message.native.message.messageId,
          attempted: !!message.sendRequestId || !!message.adoptedTaskId, operationState: operation?.state ?? null,
          taskIds, approvalChanged: changed } : null,
        state: delivery ? delivery.decision : taskIds.length ? 'observed' :
          message?.sendRequestId ? operation?.state ?? 'attempted' : preparation ? changed ? 'review_changed' : 'prepared' : 'uncommissioned' };
    });
    const accepted = jobs.filter(job => job.delivery?.decision === 'accepted');
    return { ...clone(record), plan: clone(plan), approvals: clone(approvals), jobs,
      counts: { jobs: jobs.length, prepared: jobs.filter(job => job.preparation).length,
        observedTasks: new Set(jobs.flatMap(job => (job.messageState?.taskIds ?? []).map(id => canonical([job.preparation.selection.interface.url, id])))).size,
        accepted: accepted.length, acceptedPrepared: accepted.filter(job => job.preparation.mode === 'prepared').length,
        acceptedAdopted: accepted.filter(job => job.preparation.mode === 'adopted').length,
        verifiedSettlements: null } };
  });
  return { schema: COMMISSIONING_SCHEMA, plans, catalogues,
    counts: { plans: plans.length, jobs: plans.reduce((n, p) => n + p.counts.jobs, 0),
      prepared: plans.reduce((n, p) => n + p.counts.prepared, 0),
      observedTasks: new Set(plans.flatMap(p => p.jobs.flatMap(j => (j.messageState?.taskIds ?? []).map(id => canonical([j.preparation.selection.interface.url, id]))))).size,
      accepted: plans.reduce((n, p) => n + p.counts.accepted, 0),
      verifiedSettlements: null },
    authority: 'Customer decisions are attributed operator records. Native task and file identities are verified against retained originals. Only the original seller records can establish settlement.' };
}
