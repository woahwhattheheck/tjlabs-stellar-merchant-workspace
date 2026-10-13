// MIT. Complete commissioning collection through the existing merchant MCP owner.
import {createHash} from 'node:crypto';
import {openMerchantFileClient} from './retained-download.mjs';
import {createAccountingMaintenanceClient} from './accounting-maintenance-client.mjs';
import {commissioningImportArguments, commissioningCaptureArguments}
  from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/commissioning-collections/client.mjs';

const PREFIX = 'merchant_accounting_commissioning_';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const json = value => JSON.stringify(value, null, 2) + '\n';
const digest = value => createHash('sha256').update(json(value)).digest('hex');
const fail = (code, message) => Object.assign(new Error(message), {code: 'ACCOUNTING_COMMISSIONING_CLIENT_' + code});
function need(ok, message, code = 'ARGUMENTS') { if (!ok) throw fail(code, message); }
function wire(value = {}) {
  need(plain(value) && !Object.hasOwn(value, 'workspace'), 'Use this client’s configured workspace and original JSON arguments.');
  let copy;
  try { copy = JSON.parse(JSON.stringify(value)); }
  catch { throw fail('ARGUMENTS', 'Use complete serializable original JSON arguments.'); }
  need(plain(copy), 'Use one original JSON argument object.');
  return copy;
}
function revision(value) {
  need(Number.isSafeInteger(value) && value >= 1, 'Keep the original accounting revision.');
  return value;
}
function identity(value) {
  need(plain(value) && typeof value.actor === 'string' && value.actor.trim() &&
    value.actor.trim().length <= 1000 && REQUEST_ID.test(value.requestId ?? ''),
    'Keep the responsible operator and a stable original request ID.');
}
export const ACCOUNTING_COMMISSIONING_METHODS = Object.freeze({
  inspectSource: 'source_inspect', importSource: 'source_import', sources: 'source_list',
  source: 'source_detail', candidates: 'candidates', preview: 'preview', capture: 'capture',
  captures: 'capture_list', detail: 'capture_detail', export: 'capture_export', request: 'request_lookup',
});
const ACTIONS = Object.freeze({
  source_import: 'commissioning_source_imported', capture: 'commissioning_collections_captured',
});
export const ACCOUNTING_COMMISSIONING_MUTATIONS = Object.freeze(Object.keys(ACTIONS));
const OPERATIONS = new Set(Object.values(ACCOUNTING_COMMISSIONING_METHODS));
const PAGED = new Set(['source_list', 'source_detail', 'candidates', 'capture_list']);

/** Preserve exact source bytes, field insertion order and optimistic revision. */
export function accountingCommissioningArguments(kind, value) {
  need(Object.hasOwn(ACTIONS, kind), 'Choose an original commissioning mutation.');
  const args = wire(value); identity(args); revision(args.revision);
  if (kind === 'source_import') {
    need(plain(args.file) && typeof args.file.name === 'string' && typeof args.file.dataBase64 === 'string' &&
      SHA.test(args.expectedSha256 ?? '') && args.sourceAlias === undefined,
      'Import the inspected original file bytes and SHA, with no live source alias.');
    const bytes = Buffer.from(args.file.dataBase64, 'base64');
    need(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024 &&
      bytes.toString('base64') === args.file.dataBase64 &&
      createHash('sha256').update(bytes).digest('hex') === args.expectedSha256,
      'The complete original source bytes differ from the inspected SHA or native size.', 'SOURCE');
  } else need(UUID.test(args.sourceId ?? '') && SHA.test(args.previewSha256 ?? ''),
    'Keep the original source UUID and complete reviewed capture SHA.');
  return args;
}
export function accountingCommissioningInspection(value) {
  need(plain(value) && plain(value.sourceInput) && plain(value.sourceInput.file) &&
    plain(value.file) && SHA.test(value.file.sha256 ?? '') &&
    value.file.name === value.sourceInput.file.name,
    'Keep the complete native inspection and resolved sourceInput.', 'SOURCE');
  revision(value.revision);
  const bytes = Buffer.from(value.sourceInput.file.dataBase64 ?? '', 'base64');
  need(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024 &&
    bytes.toString('base64') === value.sourceInput.file.dataBase64 &&
    bytes.length === value.file.bytes &&
    createHash('sha256').update(bytes).digest('hex') === value.file.sha256,
    'The retained sourceInput is not the exact inspected original file.', 'SOURCE');
  return value;
}
/** Optional import metadata does not replace the inspected bytes, scales or SHA. */
export function accountingCommissioningImportArguments(inspection, operation) {
  accountingCommissioningInspection(inspection); identity(operation);
  need(Object.keys(operation).every(key => ['actor', 'requestId', 'label', 'receivedAt', 'replacesSourceId'].includes(key)),
    'Use operator identity and original source edition metadata.');
  const input = wire(inspection.sourceInput);
  for (const key of ['label', 'receivedAt', 'replacesSourceId'])
    if (Object.hasOwn(operation, key)) input[key] = operation[key];
  return accountingCommissioningArguments('source_import', commissioningImportArguments(input, inspection, operation));
}
export function accountingCommissioningPreview(value) {
  need(plain(value) && plain(value.source) && UUID.test(value.source.id ?? '') &&
    plain(value.selection) && plain(value.review) &&
    value.review.schema === 'stellar-forge.commissioning-collections-review.v1' &&
    SHA.test(value.previewSha256 ?? '') && value.previewSha256 === value.review.previewSha256 &&
    value.review.revision === value.revision && value.review.source?.sha256 === value.source.sha256 &&
    JSON.stringify(value.selection) === JSON.stringify(value.review.selection),
    'Keep the complete native source, normalized selection and review.', 'PREVIEW');
  revision(value.revision);
  const reviewed = {...value.review}; delete reviewed.previewSha256;
  need(digest(reviewed) === value.previewSha256,
    'The complete native review differs from its original SHA-256.', 'PREVIEW');
  return value;
}
export function accountingCommissioningCaptureArguments(preview, operation) {
  accountingCommissioningPreview(preview); identity(operation);
  return accountingCommissioningArguments('capture', {
    ...commissioningCaptureArguments(preview, operation), sourceId: preview.source.id,
  });
}
function nativeIntent(kind, input) {
  const value = wire(input);
  if (kind === 'capture') {
    const id = value.sourceId; delete value.sourceId; value.commissioningSourceId = id;
  }
  delete value.revision;
  return digest({action: ACTIONS[kind], value});
}

/** Borrow one structured call; the caller retains original authentication and transport. */
export function createAccountingCommissioningClient({workspace, call} = {}) {
  need(typeof workspace === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(workspace),
    'Choose the configured original accounting workspace alias.');
  need(typeof call === 'function', 'Supply the original structured MCP call.');
  const maintenance = createAccountingMaintenanceClient({workspace, call}), pending = new Set();
  let closed = false, transitioning = false, closePromise;
  function accepting() { need(!closed && !transitioning, 'This caller is draining or closed.', 'CLOSED'); }
  async function tracked(work) {
    accepting(); const promise = Promise.resolve().then(work); pending.add(promise);
    try { return await promise; } finally { pending.delete(promise); }
  }
  function invoke(name, args = {}, options) {
    const selected = wire(args);
    return tracked(async () => {
      const result = await call(name, {...selected, workspace}, options);
      need(plain(result), 'The original merchant returned no structured result.', 'REPLY');
      return result;
    });
  }
  async function transition(work, permanent = false) {
    accepting(); transitioning = true;
    try {
      await Promise.allSettled([...pending]);
      const result = await work();
      if (permanent) closed = true;
      return result;
    } finally { transitioning = false; }
  }
  function closeAfter(work) {
    if (!closePromise) {
      const attempt = transition(work, true); closePromise = attempt;
      attempt.catch(() => { if (closePromise === attempt) closePromise = undefined; });
    }
    return closePromise;
  }
  const client = {
    workspace,
    open: options => invoke('merchant_accounting_open', {}, options),
    configuredSources: options => invoke('merchant_accounting_sources', {}, options),
    callOperation(kind, args = {}, options) {
      need(OPERATIONS.has(kind), 'Choose a declared commissioning operation.');
      return invoke(PREFIX + kind, Object.hasOwn(ACTIONS, kind) ? accountingCommissioningArguments(kind, args) : args, options);
    },
    async listAll(kind, args = {}, options) {
      need(PAGED.has(kind) && args.offset === undefined && args.limit === undefined &&
        (kind !== 'source_detail' || ['projects', 'history'].includes(args.view)),
        'Choose an original paged view and let this reader advance offsets.');
      const items = []; let offset = 0, total, version, metadata, stamp;
      for (;;) {
        const page = await client.callOperation(kind, {...args, offset, limit: 200}, options);
        need(Array.isArray(page.items) && page.offset === offset && Number.isSafeInteger(page.total) &&
          page.total >= offset + page.items.length && page.items.length <= 200,
          'The original inventory returned an inconsistent page.', 'PAGE');
        revision(page.revision);
        const observed = JSON.stringify({view: page.view ?? null, asOf: page.asOf ?? null,
          sourceId: page.sourceId ?? page.source?.id ?? null, projectId: page.projectId ?? null,
          customerId: page.customerId ?? null});
        if (metadata === undefined) {
          const {items: omitted, offset: ignoredOffset, limit: ignoredLimit, ...rest} = page;
          metadata = rest; total = page.total; version = page.revision; stamp = observed;
        }
        need(total === page.total && version === page.revision && stamp === observed,
          'The original inventory changed between pages. Read the current inventory again.', 'OBSERVATION_CHANGED');
        items.push(...page.items); offset += page.items.length;
        if (offset === total) return {...metadata, items, total, revision: version};
        need(page.items.length > 0, 'The original inventory did not advance.', 'PAGE');
      }
    },
    async reconcileOperation(kind, value, options) {
      const args = accountingCommissioningArguments(kind, value);
      const observed = await client.request({requestId: args.requestId}, options);
      if (!observed.found) return observed;
      const operation = observed.operation;
      need(operation?.id === args.requestId && operation.action === ACTIONS[kind] &&
        operation.actor === args.actor.trim() && operation.intentSha256 === nativeIntent(kind, args),
        'The request ID belongs to a different original operation or source selection.', 'REQUEST_BINDING');
      return observed;
    },
    registerFileRead: readId => maintenance.registerFileRead(readId),
    releaseFile: (readId, options) => maintenance.releaseFile(readId, options),
    drainFileReads: () => transition(() => maintenance.drainFileReads()),
    async *fileChunks(selection, options) {
      accepting(); const iterator = maintenance.fileChunks(selection, options);
      try {
        for (;;) { accepting(); const item = await iterator.next(); if (item.done) return; yield item.value; }
      } finally { await iterator.return?.(); }
    },
    async fileBytes(selection, {maximumBytes = 128 * 1024 * 1024, ...options} = {}) {
      need(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 128 * 1024 * 1024,
        'Use a complete-file limit within the native private export size.');
      const parts = []; let length = 0, file;
      for await (const chunk of client.fileChunks(selection, options)) {
        file ??= chunk.file;
        need(Number.isSafeInteger(file.bytes) && file.bytes <= maximumBytes &&
          length + chunk.bytes.length <= maximumBytes,
          'The complete original file exceeds the selected byte limit.', 'FILE_SIZE');
        parts.push(chunk.bytes); length += chunk.bytes.length;
      }
      need(file && length === file.bytes, 'The complete original file ended early.', 'FILE_REPLY');
      return {bytes: Buffer.concat(parts, length), file};
    },
    disconnect: () => closeAfter(() => maintenance.drainFileReads()),
    closeWorkspace: options => closeAfter(() => maintenance.closeWorkspace(options)),
  };
  for (const [name, suffix] of Object.entries(ACCOUNTING_COMMISSIONING_METHODS))
    client[name] = (args = {}, options) => client.callOperation(suffix, args, options);
  const inspect = client.inspectSource, preview = client.preview;
  client.inspectSource = async (args, options) => accountingCommissioningInspection(await inspect(args, options));
  client.preview = async (args, options) => {
    const result = accountingCommissioningPreview(await preview(args, options));
    need(result.source.id === args.sourceId, 'The native review belongs to another source.', 'PREVIEW');
    return result;
  };
  return Object.freeze(client);
}
/** Connect to the existing listener; no server, owner, credentials or keys are created. */
export async function connectAccountingCommissioningClient({
  workspace, bearerToken, tokenEnv = 'MCP_ACCESS_TOKEN', environment = process.env,
  maximumResponseBytes = 128 * 1024 * 1024, ...options
} = {}) {
  const selectedEnvironment = bearerToken === undefined ? environment : {...environment, [tokenEnv]: bearerToken};
  const connection = await openMerchantFileClient({...options, tokenEnv, environment: selectedEnvironment,
    maximumResponseBytes, errorPrefix: 'ACCOUNTING_COMMISSIONING', clientName: 'starforge-accounting-commissioning'});
  return Object.freeze({...createAccountingCommissioningClient({workspace, call: connection.call}), endpoint: connection.endpoint});
}
