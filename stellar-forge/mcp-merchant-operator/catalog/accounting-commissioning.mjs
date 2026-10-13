// MIT. Original source, customer cash and retained commissioning collections.
const PREFIX = 'merchant_accounting_commissioning_';
const text = (max, min = 0) => ({type: 'string', minLength: min, maxLength: max});
const uuid = {type: 'string', pattern: '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'};
const stable = {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'};
const alias = {type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash = {type: 'string', pattern: '^[a-f0-9]{64}$'};
const date = {type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'};
const money = {type: 'string', pattern: '^(0|[1-9][0-9]*)(?:[.][0-9]+)?$', maxLength: 256};
const nullable = schema => ({anyOf: [schema, {type: 'null'}]});
const object = (properties, required = [], additionalProperties = false) =>
  ({type: 'object', properties, required, additionalProperties});
const array = (items, maxItems, extra = {}) => ({type: 'array', items, maxItems, ...extra});
const base = {workspace: alias};
const change = {...base, revision: {type: 'integer', minimum: 1}, actor: text(1000, 1), requestId: stable};
const page = {offset: {type: 'integer', minimum: 0}, limit: {type: 'integer', minimum: 1, maximum: 200}};
const readOnly = {readOnly: true, idempotent: true};
const fileFields = {name: text(240, 1), dataBase64: {
  type: 'string', minLength: 4, maxLength: 11184812, pattern: '^[A-Za-z0-9+/]*={0,2}$'}};
const sourceFields = {
  file: object(fileFields, ['name']),
  currencyScales: object({}, [], {type: 'integer', minimum: 0, maximum: 6}),
  expectedSha256: hash, label: text(300, 1), receivedAt: text(40, 1), replacesSourceId: nullable(uuid),
};
const invoiceLine = object({invoiceId: uuid, invoiceSha256: hash, invoiceLineId: stable,
  netAmount: money, taxAmount: money}, ['invoiceId', 'invoiceSha256', 'invoiceLineId', 'netAmount', 'taxAmount']);
const allocation = object({allocationId: uuid, amount: money}, ['allocationId', 'amount']);
const credit = object({creditId: uuid, invoiceLineId: stable, netAmount: money, taxAmount: money},
  ['creditId', 'invoiceLineId', 'netAmount', 'taxAmount']);
const milestone = object({
  index: {type: 'integer', minimum: 0, maximum: 39},
  acceptedDate: nullable(date), plannedAcceptedDate: nullable(date),
  invoiceDays: nullable({type: 'integer', minimum: 0, maximum: 36500}),
  delayDays: {type: 'integer', minimum: 0, maximum: 36500},
  invoiceTermSource: {type: 'string', enum: ['UNSPECIFIED', 'ORIGINAL_SOURCE', 'OPERATOR_SCENARIO']},
  invoiceLines: array(invoiceLine, 20000), allocations: array(allocation, 20000), credits: array(credit, 20000),
}, ['index']);
const project = object({
  projectId: stable, customerId: nullable(uuid), milestones: array(milestone, 40),
  receipts: array(object({receiptId: uuid, amount: money}, ['receiptId', 'amount']), 20000),
  refunds: array(object({refundId: uuid, amount: money}, ['refundId', 'amount']), 20000),
  xeroCycleIds: array(uuid, 200, {uniqueItems: true}),
}, ['projectId']);
const selection = {
  label: text(300, 1), asOf: date,
  projectIds: array(stable, 200, {minItems: 1, uniqueItems: true}),
  projects: array(project, 200), baselineCaptureId: nullable(uuid),
};
const read = (suffix, description, properties, required = []) =>
  [PREFIX + suffix, description, {...base, ...properties}, ['workspace', ...required], readOnly];

export const commissioningFileSelectors = Object.freeze(['sourceId', 'captureId']);
export const commissioningFileNames = Object.freeze([
  'original-workshares.json', 'commissioning-source.json', 'commissioning-source-receipt.json',
  'commissioning-review.json', 'commissioning-projects.csv', 'commissioning-milestones.csv',
  'commissioning-cash.csv', 'commissioning-findings.csv', 'commissioning-handover.html',
  'commissioning-account-snapshot.json', 'commissioning-baseline.json', 'commissioning-original-files.json',
  'commissioning-capture.json', 'commissioning-manifest.json', 'handover.tar',
]);

export const commissioningDefinitions = [
  read('source_inspect',
    'Inspect exact original workshares JSON within 8 MiB. Supply file bytes or a declared receivablesInputs sourceAlias with file.name. The reply includes sourceInput with resolved bytes: retain it for source_import, so retries do not reread changed aliases.',
    {...sourceFields, sourceAlias: alias}, ['file']),
  [PREFIX + 'source_import',
    'Retain the complete inspected source edition under the original accounting lease. Prepare from the inspection sourceInput and expectedSha256, preserve actor/requestId/revision, then reconcile that same request after an uncertain reply.',
    {...change, ...sourceFields, file: object(fileFields, ['name', 'dataBase64'])},
    ['workspace', 'revision', 'actor', 'requestId', 'file', 'expectedSha256'], {}],
  read('source_list', 'Page original retained source editions, source hashes and project inventories.',
    {search: text(300), projectId: stable, ...page}),
  read('source_detail', 'Read an original source summary, or page its complete normalized projects and retained source history. Original source downloads use commissioning-source with sourceId.',
    {sourceId: uuid, view: {type: 'string', enum: ['summary', 'projects', 'history']}, search: text(300), ...page}, ['sourceId']),
  read('candidates', 'Page real native customer, invoice-line, allocation, credit, receipt, refund or saved Xero cash-cycle candidates. Source/project and customer bindings remain explicit; invoice SHA and original source references are returned.',
    {view: {type: 'string', enum: ['customers', 'invoices', 'allocations', 'credits', 'receipts', 'refunds', 'xeroCycles']},
      sourceId: uuid, projectId: stable, customerId: uuid, asOf: date, search: text(300), ...page}),
  read('preview', 'Review the complete original source selection against current native cash, credits, refunds and saved Xero cycles. Preserve the exact normalized selection, revision and previewSha256; READY and REVIEW findings can both be retained. Physical customer receipts stay separate from milestone settlement.',
    {sourceId: uuid, ...selection}, ['sourceId', 'asOf', 'projectIds']),
  [PREFIX + 'capture',
    'Retain one immutable commissioning handover from the complete reviewed selection and exact previewSha256 at its original revision. Uses the original receivables request journal. Keep the same request after a lost response; request_lookup returns the native operation and saved capture.',
    {...change, sourceId: uuid, ...selection, previewSha256: hash},
    ['workspace', 'revision', 'actor', 'requestId', 'sourceId', 'asOf', 'projectIds', 'previewSha256'], {}],
  read('capture_list', 'Page original saved commissioning handovers and their source, cohort, account date, baseline and original review identity.',
    {sourceId: uuid, projectId: stable, customerId: uuid, status: {type: 'string', enum: ['READY', 'REVIEW']}, search: text(300), ...page}),
  read('capture_detail', 'Read the complete saved selection, source-bound review and exact original file identities. Selected reports and the complete private snapshot remain separate named files.',
    {captureId: uuid}, ['captureId']),
  read('capture_export', 'Read the saved export manifest and file selectors. Retrieve handover.tar through commissioning-capture for the complete PRIVATE original account snapshot and source/customer files; selected project HTML/CSV reports have their own original filenames.',
    {captureId: uuid}, ['captureId']),
  read('request_lookup', 'Reconcile one original commissioning source or capture request by stable requestId, including exact native action/intent hash and saved result. Reopen the original session first when the native owner returns reopenRequired.',
    {requestId: stable}, ['requestId']),
];
