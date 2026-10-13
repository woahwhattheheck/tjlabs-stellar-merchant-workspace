// MIT. Allocation worksheets over the original QuickBooks workspace and file reader.
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$' };
const sha256 = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revision = { type: 'integer', minimum: 1 };
const page = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 } };
const view = values => ({ type: 'string', enum: values });
const readOnly = { readOnly: true, idempotent: true };
const base = { workspace: alias };
const input = { ...base, source: alias, sourceSha256: sha256, companySource: alias, companySourceSha256: sha256 };
const returned = { ...input, returnedSource: alias, returnedSourceSha256: sha256 };
const create = { ...returned, workspaceId: sha256, sourcesSha256: sha256, planId: uuid, revision,
  requestSha256: sha256, previewSha256: sha256, worksheetSha256: sha256,
  worksheetPreviewSha256: sha256, worksheetResultSha256: sha256 };
export const qboWorksheetFileNames = Object.freeze([
  'worksheet.json', 'allocations.csv', 'account-reference.csv', 'worksheet-review.json',
  'plan-input.json', 'journal-preview.json',
]);
export const qboWorksheetFileProperties = Object.freeze({
  worksheetAction: view(['export', 'open', 'inspect', 'plan-input']),
  worksheetSource: alias, worksheetSourceSha256: sha256,
  worksheetReturnedSource: alias, worksheetReturnedSourceSha256: sha256,
  worksheetCompanySource: alias, worksheetCompanySourceSha256: sha256,
  worksheetResultSha256: sha256,
});
export const qboWorksheetFileSelectors = Object.freeze(Object.keys(qboWorksheetFileProperties));
export const qboWorksheetDefinitions = [
  ['merchant_accounting_qbo_worksheet_status',
    'Read the original workspace/source binding and worksheet limits. Source files use host-declared platformInputs aliases; the worksheet methods make no provider call or financial write.',
    base, ['workspace'], readOnly],
  ['merchant_accounting_qbo_worksheet_export',
    'Export an allocation worksheet from the original handoff, current accountant parent and retained company/chart. The declared JSON contains its original worksheet UUID/time, binding and current draft. Page every draft row or account and download all exact worksheet/CSV/reference bytes with the returned file selections.',
    { ...input, view: view(['summary', 'rows', 'accounts']), ...page }, ['workspace', 'source'], readOnly],
  ['merchant_accounting_qbo_worksheet_open',
    'Reopen the complete original worksheet JSON against its same workspace, source, accountant parent and company/chart. Returns its unchanged base CSV and account reference; it never treats an edited CSV as a new original base.',
    { ...input, view: view(['summary', 'rows', 'accounts']), ...page }, ['workspace', 'source'], readOnly],
  ['merchant_accounting_qbo_worksheet_inspect',
    'Inspect the exact returned UTF-8 CSV alias, retaining its BOM in the byte hash. The declared JSON contains the original worksheet, current draft, source binding and explicit per-field resolutions. Page conflicts, changes, candidate rows, source/draft issues and decisions; incomplete draft adoption is distinct from readiness for a native journal.',
    { ...returned, view: view(['summary', 'rows', 'conflicts', 'changes', 'source-issues', 'draft-issues', 'resolutions']), ...page },
    ['workspace', 'source', 'returnedSource'], readOnly],
  ['merchant_accounting_qbo_worksheet_plan_preview',
    'Prepare the original native journal input from a fully inspected worksheet return. The source JSON retains the inspected preview SHA and original plan UUID/operator/time/date. Rechecks every allocation, source cell, account, valuation and include/exclude decision through the native compiler; returns a small exact worksheet_create command and complete downloadable input.',
    { ...returned, view: view(['summary', 'rows', 'excluded', 'lines', 'accounts']), ...page },
    ['workspace', 'source', 'returnedSource'], readOnly],
  ['merchant_accounting_qbo_worksheet_create',
    'Create the reviewed original QuickBooks DRAFT through QboWorkspace.create. Retain the exact preview command. A saved matching plan is recovered by native request/plan hashes before source aliases are reopened; a new create requires all current source, worksheet, returned-file and revision pins. This performs no posting or provider call.',
    create, ['workspace', 'source', 'sourceSha256', 'returnedSource', 'returnedSourceSha256',
      'workspaceId', 'sourcesSha256', 'planId', 'revision', 'requestSha256', 'previewSha256',
      'worksheetSha256', 'worksheetPreviewSha256', 'worksheetResultSha256'], { idempotent: true }],
  ['merchant_accounting_qbo_worksheet_request',
    'Read the original journal UUID and native request digest to reconcile a worksheet create. FOUND means the original plan is retained; NOT_FOUND does not authorize a new request ID. Does not read former input aliases or submit a financial operation. An uncertain workspace save requires reopening before this lookup.',
    { ...base, planId: uuid, view: view(['summary', 'rows', 'excluded', 'lines', 'accounts', 'files', 'responses', 'native-attempts']), ...page },
    ['workspace', 'planId'], readOnly],
];
