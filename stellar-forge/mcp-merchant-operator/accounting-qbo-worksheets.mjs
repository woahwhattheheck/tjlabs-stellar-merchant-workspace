// MIT. Complete worksheet transport over the original native QuickBooks owner.
import { qboCanonical, qboHash } from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/qbo.mjs';
import { normalizeQboCompany } from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/qbo-company.mjs';
import { QBO_WORKSHEET_CSV_BYTES } from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/accountant/qbo-worksheet.mjs';
import { qboWorksheetFileNames } from './catalog/accounting-qbo-worksheets.mjs';

const SCHEMA = 'stellar-forge.accounting-qbo-worksheet-client.v1';
const LIMIT = 32 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => qboHash(qboCanonical(value));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const copy = value => structuredClone(value);
function need(ok, message, code = 'ARGUMENTS') {
  if (!ok) throw Object.assign(new Error(message), { code: 'ACCOUNTING_QBO_WORKSHEET_' + code });
}
function exact(value, fields) {
  need(plain(value) && Object.keys(value).every(key => fields.includes(key)),
    'Use the complete original worksheet input and only its documented fields.');
}
function page(items, args, selected) {
  const offset = args.offset ?? 0, limit = args.limit ?? 25;
  need(Array.isArray(items) && Number.isSafeInteger(offset) && offset >= 0 &&
    Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, 'Choose a complete declared view and a page of 1–200 rows.');
  return { view: selected, total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
}
function selection(args, pins, mode, resultSha256, file) {
  return { kind: 'qbo-worksheet', worksheetAction: mode,
    worksheetSource: pins.source, worksheetSourceSha256: pins.sourceSha256,
    ...(pins.returnedSource ? { worksheetReturnedSource: pins.returnedSource,
      worksheetReturnedSourceSha256: pins.returnedSourceSha256 } : {}),
    ...(pins.companySource ? { worksheetCompanySource: pins.companySource,
      worksheetCompanySourceSha256: pins.companySourceSha256 } : {}),
    worksheetResultSha256: resultSha256, file };
}
function requestHash(result) {
  const { revision, previewSha256, ...request } = result.request;
  return digest(request);
}
function resultHash(mode, result) {
  if (mode === 'inspect') return result.preview.integrity.sha256;
  // Workspace revision alone is not part of an immutable exported worksheet.
  // The native plan-input still includes its own admission revision.
  const { schema, revision, ...payload } = result;
  return digest(payload);
}
function completeFiles(mode, result) {
  if (mode === 'export' || mode === 'open') return [
    { fileName: 'worksheet.json', contentType: 'application/json', bytes: jsonBytes(result.worksheet) },
    { fileName: 'allocations.csv', contentType: 'text/csv; charset=utf-8', bytes: Buffer.from(result.csvText, 'utf8') },
    { fileName: 'account-reference.csv', contentType: 'text/csv; charset=utf-8', bytes: Buffer.from(result.accountReference.csvText, 'utf8') },
  ];
  if (mode === 'inspect') return [
    { fileName: 'worksheet-review.json', contentType: 'application/json', bytes: jsonBytes(result.preview) },
  ];
  return [
    { fileName: 'plan-input.json', contentType: 'application/json', bytes: jsonBytes(result.request) },
    { fileName: 'journal-preview.json', contentType: 'application/json', bytes: jsonBytes(result.plan) },
  ];
}

/** Borrows one existing QboWorkspace, its host alias reader and existing view formatters.
 * There is no new workspace, request ledger, file store, provider or lifecycle owner.
 */
export class MerchantQboWorksheets {
  constructor({ qbo, readInput, formatPlan, formatResult }) {
    need(qbo && typeof readInput === 'function' && typeof formatPlan === 'function' &&
      typeof formatResult === 'function', 'Supply the original QuickBooks owner and its existing transport helpers.');
    this.qbo = qbo; this.readInput = readInput; this.formatPlan = formatPlan; this.formatResult = formatResult;
  }
  current({ allowUncertain = false } = {}) {
    const view = this.qbo.view();
    need(plain(view.binding) && SHA.test(view.binding.workspaceId) && SHA.test(view.binding.sourcesSha256),
      'The original accounting workspace binding is unavailable.', 'BINDING');
    need(allowUncertain || !view.reopenRequired,
      'Reopen the original accounting workspace after its uncertain durable save, then read the same request.', 'REOPEN_REQUIRED');
    return { binding: copy(view.binding), revision: view.revision, reopenRequired: view.reopenRequired === true };
  }
  match(args) {
    const value = this.current();
    need(args.workspaceId === value.binding.workspaceId && args.sourcesSha256 === value.binding.sourcesSha256,
      'The command belongs to another original accounting workspace or source. Keep its original request.', 'BINDING');
    return value;
  }
  async input(args, mode) {
    const returned = mode === 'inspect' || mode === 'plan-input';
    need(returned ? typeof args.returnedSource === 'string' : args.returnedSource === undefined && args.returnedSourceSha256 === undefined,
      returned ? 'Choose the exact returned CSV through its host-declared alias.' : 'An original export or reopen does not accept a returned CSV.');
    need(args.companySource !== undefined || args.companySourceSha256 === undefined,
      'A company digest requires its original companySource alias.');
    const original = await this.readInput(args), value = copy(original.value), pins = { ...original.pin };
    const common = ['binding', 'companySnapshot', 'environment'];
    exact(value, [...common, ...(mode === 'export' ? ['id', 'createdAt', 'handoffId', 'expectedParentId', 'draft'] :
      ['worksheet', ...(returned ? ['currentDraft', 'resolutions'] : []),
        ...(mode === 'plan-input' ? ['previewSha256', 'plan'] : [])])]);
    if (args.companySource !== undefined) {
      need(value.companySnapshot === undefined || value.companySnapshot === null,
        'Choose the retained companySnapshot or the declared companySource, once.');
      const company = await this.readInput(args, 'companySource', 'companySourceSha256');
      value.companySnapshot = normalizeQboCompany(company.value); Object.assign(pins, company.pin);
    }
    if (returned) {
      const csv = await this.readInput(args, 'returnedSource', 'returnedSourceSha256',
        { maximum: QBO_WORKSHEET_CSV_BYTES, json: false });
      // The original fatal UTF-8 decoder retains the BOM. Only the native CSV parser removes it.
      need(Buffer.from(csv.text, 'utf8').equals(csv.bytes), 'The returned CSV text differs from its exact original bytes.', 'RETURNED_BYTES');
      value.csvText = csv.text; Object.assign(pins, csv.pin);
    }
    need(Buffer.byteLength(JSON.stringify(value), 'utf8') <= LIMIT,
      'The complete worksheet, current draft, company and returned CSV exceed the native 32 MiB request limit.', 'SIZE');
    return { value, pins };
  }
  async run(args, mode) {
    const { value, pins } = await this.input(args, mode);
    const method = { export: 'exportWorksheet', open: 'openWorksheet', inspect: 'inspectWorksheet', 'plan-input': 'worksheetPlanInput' }[mode];
    need(method && typeof this.qbo[method] === 'function', 'Install the complete native allocation worksheet source before using this client.', 'NATIVE_SOURCE_REQUIRED');
    const result = await this.qbo[method](value);
    need(result?.schema === 'stellar-forge.qbo-worksheet-response.v1' &&
      digest(result.binding) === digest(value.binding), 'The native worksheet response belongs to another original workspace.', 'BINDING');
    if (mode === 'inspect') need(result.preview.csv.sha256 === pins.returnedSourceSha256,
      'The native inspection differs from the exact returned CSV bytes.', 'RETURNED_BYTES');
    return { value, pins, result, resultSha256: resultHash(mode, result) };
  }
  inventory(args, mode, run) {
    return completeFiles(mode, run.result).map(file => ({ name: file.fileName, contentType: file.contentType,
      bytes: file.bytes.length, sha256: qboHash(file.bytes),
      selection: selection(args, run.pins, mode, run.resultSha256, file.fileName) }));
  }
  exported(args, mode, run) {
    const { result, value, pins, resultSha256 } = run, { base, ...worksheet } = result.worksheet;
    const selected = args.view ?? 'summary', accounts = normalizeQboCompany(value.companySnapshot).accounts;
    need(['summary', 'rows', 'accounts'].includes(selected), 'Choose summary, rows or accounts for this worksheet.');
    return { schema: SCHEMA, workspace: args.workspace, action: mode, binding: copy(result.binding),
      revision: result.revision, ...pins, resultSha256,
      worksheet: { ...worksheet, base: { valuationBasis: base.valuationBasis, rowCount: base.rows.length } },
      counts: { rows: base.rows.length, accounts: accounts.length },
      files: this.inventory(args, mode, run),
      ...(selected === 'summary' ? {} : { page: page(selected === 'rows' ? base.rows : accounts, args, selected) }) };
  }
  inspected(args, run) {
    const { result, pins, resultSha256 } = run;
    const { candidate, changes, conflicts, sourceIssues, draftIssues, resolutions, ...preview } = result.preview;
    const selected = args.view ?? 'summary';
    const views = { rows: candidate?.rows ?? [], conflicts, changes, 'source-issues': sourceIssues,
      'draft-issues': draftIssues, resolutions };
    need(selected === 'summary' || Object.hasOwn(views, selected), 'Choose an original worksheet inspection view.');
    return { schema: SCHEMA, workspace: args.workspace, action: 'inspect', binding: copy(result.binding),
      revision: result.revision, ...pins, resultSha256, preview: { ...preview,
        candidate: candidate ? { valuationBasis: candidate.valuationBasis, rowCount: candidate.rows.length } : null },
      counts: Object.fromEntries(Object.entries(views).map(([key, rows]) => [key, rows.length])),
      files: this.inventory(args, 'inspect', run),
      ...(selected === 'summary' ? {} : { page: page(views[selected], args, selected) }) };
  }
  planned(args, run) {
    const { result, value, pins, resultSha256 } = run;
    need(['summary', 'rows', 'excluded', 'lines', 'accounts'].includes(args.view ?? 'summary'),
      'Choose the original native journal summary, rows, exclusions, lines or accounts.');
    const requestSha256 = requestHash(result), plan = result.plan;
    const binding = { ...copy(result.binding), planId: result.request.id, inputSha256: pins.sourceSha256,
      returnedSha256: pins.returnedSourceSha256, worksheetSha256: value.worksheet.integrity.sha256,
      worksheetPreviewSha256: result.worksheetPreviewSha256, worksheetResultSha256: resultSha256,
      requestSha256, previewSha256: result.previewSha256 };
    const command = { tool: 'merchant_accounting_qbo_worksheet_create', arguments: {
      workspace: args.workspace, ...pins, ...copy(result.binding), planId: result.request.id,
      revision: result.request.revision, requestSha256, previewSha256: result.previewSha256,
      worksheetSha256: binding.worksheetSha256, worksheetPreviewSha256: binding.worksheetPreviewSha256,
      worksheetResultSha256: resultSha256 } };
    const { record, page: nativePage, ...native } = this.formatPlan({ revision: result.revision, expectedParentId: result.request.expectedParentId,
      plan, record: { id: plan.id, name: result.request.name, actor: result.request.actor, createdAt: result.request.createdAt,
        sourceKind: plan.sourceKind, integrity: plan.integrity, files: [], responses: [] } }, args);
    return { schema: SCHEMA, workspace: args.workspace, action: 'plan-input', nativeBinding: copy(result.binding),
      ...pins, revision: result.revision, resultSha256, worksheetPreviewSha256: result.worksheetPreviewSha256,
      requestSha256, previewSha256: result.previewSha256, native,
      ...(nativePage ? { page: nativePage } : {}),
      files: this.inventory(args, 'plan-input', run), binding, command };
  }
  async request(args) {
    const current = this.current();
    let record;
    try { record = this.qbo.row(args.planId); }
    catch (error) { if (error.code !== 'QBO_PLAN_NOT_FOUND') throw error; }
    if (!record) return { schema: SCHEMA, workspace: args.workspace, ...current,
      status: 'NOT_FOUND', planId: args.planId, requestSha256: null };
    const detail = await this.qbo.detail(args.planId);
    return { schema: SCHEMA, workspace: args.workspace, ...this.current(), status: 'FOUND',
      planId: record.id, requestSha256: record.requestSha256, ...this.formatPlan(detail, args) };
  }
  async create(args) {
    this.match(args);
    need(args.companySource === undefined || SHA.test(args.companySourceSha256),
      'Keep the reviewed company source digest with its declared alias.');
    // Recover the admitted original journal before reopening any former source alias.
    let prior;
    try { prior = this.qbo.row(args.planId); }
    catch (error) { if (error.code !== 'QBO_PLAN_NOT_FOUND') throw error; }
    if (prior) {
      need(prior.requestSha256 === args.requestSha256 && prior.integrity?.sha256 === args.previewSha256,
        'The original journal UUID is already retained with another complete native request.', 'REQUEST_CONFLICT');
      const found = await this.request({ workspace: args.workspace, planId: args.planId });
      need(found.status === 'FOUND' && found.requestSha256 === args.requestSha256 &&
        found.record.integrity.sha256 === args.previewSha256, 'The retained journal changed during recovery.', 'REQUEST_CONFLICT');
      return { ...found, duplicate: true, creation: 'ORIGINAL_NATIVE_REQUEST' };
    }
    const run = await this.run(args, 'plan-input'), { result, value, pins, resultSha256 } = run;
    this.match(args);
    need(result.request.id === args.planId && result.request.revision === args.revision &&
      requestHash(result) === args.requestSha256 && result.previewSha256 === args.previewSha256 &&
      value.worksheet.integrity.sha256 === args.worksheetSha256 &&
      result.worksheetPreviewSha256 === args.worksheetPreviewSha256 &&
      resultSha256 === args.worksheetResultSha256 && pins.returnedSourceSha256 === args.returnedSourceSha256,
      'The original source, draft, returned CSV, inspected choices or native admission revision changed. Review that complete input again.', 'PREVIEW_CHANGED');
    const created = await this.qbo.create(result.request);
    return { schema: SCHEMA, workspace: args.workspace, ...this.current(), ...this.formatResult(created),
      creation: 'ORIGINAL_NATIVE_REQUEST', planId: args.planId, requestSha256: args.requestSha256,
      previewSha256: args.previewSha256 };
  }
  async file(args) {
    need(args.kind === 'qbo-worksheet' && qboWorksheetFileNames.includes(args.file),
      'Choose one complete original worksheet file from its returned inventory.');
    const mode = args.worksheetAction;
    need(['export', 'open', 'inspect', 'plan-input'].includes(mode) && SHA.test(args.worksheetSourceSha256) &&
      SHA.test(args.worksheetResultSha256), 'Keep the original worksheet action, source and result digests for this file.');
    const selected = { workspace: args.workspace, source: args.worksheetSource, sourceSha256: args.worksheetSourceSha256,
      ...(args.worksheetReturnedSource !== undefined ? { returnedSource: args.worksheetReturnedSource,
        returnedSourceSha256: args.worksheetReturnedSourceSha256 } : {}),
      ...(args.worksheetCompanySource !== undefined ? { companySource: args.worksheetCompanySource,
        companySourceSha256: args.worksheetCompanySourceSha256 } : {}) };
    need(args.worksheetReturnedSource !== undefined || args.worksheetReturnedSourceSha256 === undefined,
      'A returned-file digest requires its original declared alias.');
    need(args.worksheetCompanySource !== undefined || args.worksheetCompanySourceSha256 === undefined,
      'A company digest requires its original declared alias.');
    if (mode === 'inspect' || mode === 'plan-input') need(SHA.test(selected.returnedSourceSha256),
      'Keep the inspected returned CSV digest on every file read.');
    if (selected.companySource !== undefined) need(SHA.test(selected.companySourceSha256),
      'Keep the original company digest on every file read.');
    const run = await this.run(selected, mode);
    need(run.resultSha256 === args.worksheetResultSha256,
      'The worksheet file no longer matches its original reviewed result. Preserve the prior file and read the current source.', 'FILE_CHANGED');
    const file = completeFiles(mode, run.result).find(value => value.fileName === args.file);
    need(file, 'This filename belongs to another worksheet action.');
    return { name: file.fileName, type: file.contentType, bytes: file.bytes };
  }
  async call(operation, args) {
    const action = operation.replace(/^merchant_accounting_qbo_worksheet_/, '');
    if (action === 'status') return { schema: SCHEMA, workspace: args.workspace, ...this.current({ allowUncertain: true }),
      limits: { inputBytes: LIMIT, returnedCsvBytes: QBO_WORKSHEET_CSV_BYTES, pageSize: 200 },
      sourceKind: 'platformInputs', planOwner: 'QboWorkspace.create', providerCalls: false };
    if (action === 'request') return this.request(args);
    if (action === 'create') return this.create(args);
    const mode = { export: 'export', open: 'open', inspect: 'inspect', plan_preview: 'plan-input' }[action];
    need(mode, 'Choose an original worksheet operation.');
    const run = await this.run(args, mode);
    if (mode === 'inspect') return this.inspected(args, run);
    if (mode === 'plan-input') return this.planned(args, run);
    return this.exported(args, mode, run);
  }
}
