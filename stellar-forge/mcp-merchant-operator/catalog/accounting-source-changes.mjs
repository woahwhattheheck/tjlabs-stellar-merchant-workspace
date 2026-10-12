// MIT. Chart-change operations share the original accounting owner and native engine.
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const uuid = { type: 'string', pattern: '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$' };
const sha256 = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revision = { type: 'integer', minimum: 1 };
const confirmed = { type: 'boolean', enum: [true] };
const base = { workspace: alias };
const binding = { workspaceId: sha256, sourcesSha256: sha256 };
const source = { source: alias, sourceSha256: sha256 };
const page = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 } };
const view = values => ({ type: 'string', enum: values });
const readOnly = { readOnly: true, idempotent: true };
const mutation = { idempotent: true };
const selected = { ...base, changeId: uuid };
const prepare = { ...base, ...source, ...binding, changeId: uuid, planId: uuid, successorId: uuid,
  inputSha256: sha256, previewSha256: sha256 };
const approval = { ...selected, ...binding, id: uuid, previewSha256: sha256, revision,
  actor: { type: 'string', minLength: 1, maxLength: 1000 },
  note: { type: 'string', minLength: 1, maxLength: 1500 },
  unusedConfirmed: confirmed, noExternalImport: confirmed, mappingConfirmed: confirmed };
const inspectionViews = ['summary', 'comparison', 'company-changes', 'accounts', 'rows', 'entries'];
const detailViews = ['summary', 'comparison', 'company-changes', 'rows', 'entries', 'excluded', 'journals', 'lines', 'baseline'];
const actions = [
  ['status', 'List retained chart-change reviews, eligible original plans and available Xero contexts. Page each inventory before selecting its exact native identity. No chart is fetched or plan changed.',
    { ...base, view: view(['summary', 'plans', 'contexts', 'changes']), ...page }, ['workspace'], readOnly],
  ['inspect', 'Compare the predecessor and target chart from a host-declared native SourceChangeInspectInput. Returns the original workspace binding, comparison digest, eligibility and paged defaults for every economic source. The existing plan remains retained.',
    { ...base, ...source, view: view(inspectionViews), ...page }, ['workspace', 'source'], readOnly],
  ['preview', 'Compile a complete host-declared native SourceChangePrepareInput through the same engine used by the browser. Review exact mappings, inclusion decisions and home-currency valuations. Returns native successor and original-input digests plus the exact prepare command; nothing is saved.',
    { ...base, ...source, view: view(detailViews), ...page }, ['workspace', 'source'], readOnly],
  ['prepare', 'Save the exact reviewed source change and successor preview, retaining the original review UUID, source bytes and workspace binding. This saves a review only. Reconcile that review ID and original input digest before reading a changed source alias after a lost reply.',
    prepare, Object.keys(prepare), mutation],
  ['detail', 'Read one retained source change, its native phase, original input identity, application/rejection history and paged comparison or successor. Its handoff selection downloads complete retained source through merchant_accounting_file. Reading never applies the change.',
    { ...selected, view: view(detailViews), ...page }, ['workspace', 'changeId'], readOnly],
  ['apply_preview', 'Review the exact retained successor and an explicit application UUID, current revision, operator note and all three confirmations. Returns the original native application digest and command. The native engine repeats eligibility and source checks before cancellation.',
    approval, Object.keys(approval), readOnly],
  ['apply', 'Apply this reviewed original chart change: retain its exact application intent, cancel the unused predecessor and create its preserved successor through the original native controllers. Supply every reviewed confirmation and request digest. No provider request is sent.',
    { ...approval, requestSha256: sha256 }, [...Object.keys(approval), 'requestSha256'], mutation],
  ['resume', 'Finish an already-retained chart-change application using the same review, application UUID, request digest and successor preview. This may complete its original cancellation/successor save, with no new approval, provider request or journal identity.',
    { ...selected, ...binding, id: uuid, requestSha256: sha256, previewSha256: sha256 },
    ['workspace', 'changeId', 'workspaceId', 'sourcesSha256', 'id', 'requestSha256', 'previewSha256'], mutation],
];
export const sourceChangeDefinitions = ['qbo', 'xero'].flatMap(platform => actions.map(
  ([action, description, properties, required, annotations]) =>
    ['merchant_accounting_' + platform + '_source_change_' + action, description, properties, required, annotations]
));
