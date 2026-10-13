// MIT. Original CANADABUYS model, browser and merchant controls behind host-declared aliases.
import { constants } from 'node:fs';
import { mkdir, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { definitions } from './catalog/canadabuys-workspace.mjs';
export { canadabuysWorkspaceTools } from './catalog/canadabuys-workspace.mjs';
import { exact, failure, identifier, line, plain, privateSupportDirectory, writePrivate } from './host-files.mjs';
import { RetainedFileReads } from './retained-file-reads.mjs';
import { CanadaBuysClient } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/client.mjs';

export const CANADABUYS_WORKSPACE_CONNECTION_SCHEMA = 'starforge.canadabuys.workspace-connection.v1';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const INPUT_LIMIT = 256 * 1024 * 1024;
const byName = new Map(definitions.map(definition => [definition[0], definition]));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const encoded = value => JSON.stringify(value, null, 2) + '\n';
const mime = file => /\.html$/.test(file) ? 'text/html; charset=utf-8'
  : /\.csv$/.test(file) ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
function pathFor(value, base) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw failure('CONFIGURATION_ERROR', 'Declare a nonempty original host path.');
  return isAbsolute(value) ? resolve(value) : resolve(base, value);
}
function integer(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 0 || result > maximum) throw failure('INVALID_PARAMS', 'Use an integer within the declared limits.');
  return result;
}
function parse(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('CANADABUYS_INVALID_JSON', 'The selected original file must contain complete UTF-8 JSON.'); }
}
function validate(value, schema, path) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!types.some(type => type === actual || type === 'integer' && Number.isSafeInteger(value)))
    throw failure('INVALID_PARAMS', path + ' has the wrong value type.');
  if (schema.enum && !schema.enum.includes(value)) throw failure('INVALID_PARAMS', path + ' must use one of the declared choices.');
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)))
    throw failure('INVALID_PARAMS', path + ' is outside the declared limits.');
  if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)
      || schema.pattern && !new RegExp(schema.pattern).test(value)))
    throw failure('INVALID_PARAMS', path + ' has an invalid length or format.');
  if (Array.isArray(value)) {
    if (value.length > (schema.maxItems ?? Infinity) || value.length < (schema.minItems ?? 0)
        || schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length)
      throw failure('INVALID_PARAMS', path + ' must use a complete valid selection without duplicate members.');
    if (schema.items) for (let index = 0; index < value.length; index++) validate(value[index], schema.items, path + '[' + index + ']');
  }
  if (plain(value) && plain(schema.additionalProperties))
    for (const [key, item] of Object.entries(value)) validate(item, schema.additionalProperties, path + '.' + key);
}
async function originalFile(path, { consume = false, maximum = INPUT_LIMIT } = {}) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximum)) throw failure('CANADABUYS_INPUT_INVALID', 'Use a regular original source within the native size limit.');
    const hash = createHash('sha256'), blocks = [], buffer = Buffer.alloc(65536);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead;
      if (position > maximum) throw failure('CANADABUYS_INPUT_TOO_LARGE', 'The original source exceeds its native size limit.');
      const block = buffer.subarray(0, bytesRead); hash.update(block);
      if (consume) blocks.push(Buffer.from(block));
    }
    const after = await handle.stat({ bigint: true });
    if (BigInt(position) !== after.size || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key]))
      throw failure('CANADABUYS_INPUT_CHANGED', 'The original file changed while being read; inspect its current source identity.');
    return { bytes: position, sha256: hash.digest('hex'), ...(consume ? { content: Buffer.concat(blocks, position) } : {}) };
  } catch (issue) {
    if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR'].includes(issue.code))
      throw failure('CANADABUYS_INPUT_UNAVAILABLE', 'The selected host-declared original file is unavailable. Check that same alias on the host.');
    throw issue;
  } finally { await handle?.close(); }
}

/** Configuration reads declarations only. The original SQLite service opens explicitly. */
export async function readCanadaBuysWorkspaceConfiguration(path) {
  path = resolve(path);
  const raw = parse((await originalFile(path, { consume: true, maximum: 1048576 })).content);
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== CANADABUYS_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces)
      || !Object.keys(raw.workspaces).length || Object.keys(raw.workspaces).length > 32)
    throw failure('CONFIGURATION_ERROR', 'Declare between 1 and 32 original CANADABUYS workspace aliases.');
  const base = dirname(path), directories = new Set(), workspaces = Object.create(null);
  for (const [alias, item] of Object.entries(raw.workspaces)) {
    identifier(alias, 'CANADABUYS workspace alias');
    exact(item, ['directory', 'label', 'operator', 'title', 'inputs', 'deliveries', 'merchant'], ['directory']);
    const directory = pathFor(item.directory, base);
    await privateSupportDirectory(directory);
    const canonical = await realpath(directory);
    if (canonical !== directory || directories.has(canonical))
      throw failure('CONFIGURATION_ERROR', 'Bind each canonical original workspace through one host alias.');
    directories.add(canonical);
    const inputs = Object.create(null), deliveries = Object.create(null);
    for (const collection of ['inputs', 'deliveries'])
      if (item[collection] !== undefined && (!plain(item[collection]) || Object.keys(item[collection]).length > 100))
        throw failure('CONFIGURATION_ERROR', 'Declare at most 100 named original ' + collection + '.');
    for (const [key, value] of Object.entries(item.inputs ?? {})) {
      identifier(key, 'CANADABUYS input alias');
      exact(value, ['file', 'label', 'url', 'stream', 'retrievedAt'], ['file']);
      if (value.url !== undefined && (typeof value.url !== 'string' || value.url.length > 8192))
        throw failure('CONFIGURATION_ERROR', 'Use the original publication URL as source metadata.');
      inputs[key] = { file: pathFor(value.file, base), label: line(value.label ?? key, 'Input label'), url: value.url, stream: value.stream, retrievedAt: value.retrievedAt };
    }
    for (const [key, value] of Object.entries(item.deliveries ?? {})) {
      identifier(key, 'CANADABUYS delivery alias');
      deliveries[key] = pathFor(value, base);
    }
    let merchant = null;
    if (item.merchant !== undefined) {
      exact(item.merchant, ['payment', 'origin', 'path', 'defaultLimit', 'maxLimit', 'name',
        'facilitator', 'allowLocalFacilitator', 'availabilityDirectory'], ['payment', 'origin']);
      if (!plain(item.merchant.payment)) throw failure('CONFIGURATION_ERROR', 'Declare the original public payment terms.');
      merchant = structuredClone(item.merchant);
      if (merchant.availabilityDirectory !== undefined) merchant.availabilityDirectory = pathFor(merchant.availabilityDirectory, base);
      if (merchant.allowLocalFacilitator !== undefined && typeof merchant.allowLocalFacilitator !== 'boolean')
        throw failure('CONFIGURATION_ERROR', 'allowLocalFacilitator must be boolean.');
    }
    workspaces[alias] = { directory, inputs, deliveries, merchant,
      label: line(item.label ?? alias, 'Workspace label'), operator: line(item.operator ?? 'merchant-operator', 'Operator'),
      title: line(item.title ?? item.label ?? alias, 'Workspace title') };
  }
  return { schema: CANADABUYS_WORKSPACE_CONNECTION_SCHEMA, workspaces };
}
function publicationView(item) {
  const { directory, sourceFile, file, ...publicItem } = item;
  return publicItem;
}
function sourceView(source) {
  if (!source) return source;
  const { body, rawText, document, ...metadata } = source;
  return metadata;
}
function metadata(entry) {
  const { document, row, source, ...value } = entry;
  return { ...value, ...(source ? { source: sourceView(source) } : {}) };
}
function page(values, args = {}) {
  const offset = integer(args.offset, 0), limit = integer(args.limit, 50, 500);
  if (!limit) throw failure('INVALID_PARAMS', 'Use a page limit of at least one.');
  const items = values.slice(offset, offset + limit);
  return { items, page: { offset, limit, total: values.length, nextOffset: offset + items.length < values.length ? offset + items.length : null } };
}

export class MerchantCanadaBuysWorkspaces {
  #config; #entries = new Map(); #opening = new Map(); #closing = false; #close;
  #reads = new RetainedFileReads({ errorPrefix: 'CANADABUYS_FILE' });
  constructor(config) { this.#config = config; }
  get summary() {
    return { configured: Boolean(this.#config.canadabuysWorkspaces), ...this.#reads.summary,
      workspaces: Object.entries(this.#config.canadabuysWorkspaces?.workspaces ?? {}).map(([workspace, definition]) => {
        const entry = this.#entries.get(workspace);
        return { workspace, label: definition.label, open: Boolean(entry), opening: this.#opening.has(workspace),
          closing: Boolean(entry?.closing), instanceId: entry?.instanceId ?? null, browserUrl: entry?.service.url ?? null,
          inputAliases: Object.keys(definition.inputs), deliveryAliases: Object.keys(definition.deliveries),
          merchantConfigured: Boolean(definition.merchant), sellerInstanceId: entry?.seller?.id ?? null };
      }) };
  }
  #definition(alias) {
    identifier(alias, 'CANADABUYS workspace alias');
    const value = this.#config.canadabuysWorkspaces?.workspaces[alias];
    if (!value) throw failure('CANADABUYS_WORKSPACE_NOT_CONFIGURED', 'Choose a host-declared alias from merchant_canadabuys_workspaces.');
    return value;
  }
  #entry(alias) {
    this.#definition(alias);
    const entry = this.#entries.get(alias);
    if (!entry) throw failure('CANADABUYS_WORKSPACE_NOT_OPEN', 'Open the selected original workspace first.');
    if (entry.closing) throw failure('CANADABUYS_WORKSPACE_CLOSING', 'The current owned workspace is draining.');
    return entry;
  }
  #scope(alias) { return 'canadabuys:' + alias + ':' + this.#definition(alias).directory; }
  #revision(entry, expected) {
    integer(expected, -1);
    const actual = entry.model.metadata().revision;
    if (expected !== actual) throw failure('CANADABUYS_REVISION_CONFLICT', 'Use the current global workspace revision from merchant_canadabuys_status.');
    return actual;
  }
  #state(entry, args = {}) {
    const view = entry.model.view(), collection = args.collection ?? 'notices';
    if (!['notices', 'sources', 'publications', 'sourceObservations', 'receivings', 'captures', 'workshares'].includes(collection)) throw failure('INVALID_PARAMS', 'Choose a declared workspace collection.');
    const selected = page(view[collection] ?? [], args);
    if (collection === 'publications') selected.items = selected.items.map(publicationView);
    return { workspace: entry.alias, instanceId: entry.instanceId, browserUrl: entry.service.url,
      native: view.workspace, collection, ...selected,
      counts: Object.fromEntries(['notices', 'sources', 'publications', 'sourceObservations', 'receivings', 'captures', 'workshares'].map(key => [key, (view[key] ?? []).length])),
      seller: entry.seller ? { sellerInstanceId: entry.seller.id, publicationId: entry.seller.publicationId,
        origin: entry.seller.service.origin ?? entry.seller.service.url ?? null, snapshot: entry.seller.service.snapshot } : null,
      fileReads: this.#reads.status(this.#scope(entry.alias)) };
  }
  async #open(alias) {
    const definition = this.#definition(alias);
    if (this.#entries.has(alias)) return this.#state(this.#entry(alias));
    if (this.#opening.has(alias)) return this.#opening.get(alias);
    const opening = (async () => {
      const { startCanadaBuysServer } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/server.mjs');
      let service;
      try {
        service = await startCanadaBuysServer({ directory: definition.directory, operator: definition.operator, title: definition.title, port: 0 });
        if (this.#closing) throw failure('CANADABUYS_WORKSPACE_CLOSING', 'The merchant operator is closing.');
        const exportsDirectory = join(this.#config.exportsDirectory, 'canadabuys', alias);
        await mkdir(exportsDirectory, { recursive: true, mode: 0o700 });
        await privateSupportDirectory(exportsDirectory);
        const entry = { alias, definition, service, model: service.workspace,
          client: new CanadaBuysClient(service.origin, { timeoutMs: 300000, maxResponseBytes: INPUT_LIMIT }),
          instanceId: randomUUID(), exportsDirectory, pending: new Set(), packages: new Map(), seller: null, sellerOpening: null, closing: null };
        this.#entries.set(alias, entry);
        try { return this.#state(entry); }
        catch (issue) { this.#entries.delete(alias); throw issue; }
      } catch (issue) { await service?.close(); throw issue; }
    })();
    this.#opening.set(alias, opening);
    try { return await opening; } finally { this.#opening.delete(alias); }
  }
  async #stopSeller(entry, expectedId) {
    const seller = entry.seller;
    if (!seller || seller.id !== expectedId) throw failure('CANADABUYS_SELLER_INSTANCE_CONFLICT', 'Use the current owned seller instance identifier.');
    if (!seller.closing) seller.closing = (async () => {
      await seller.service.close();
      if (entry.seller === seller) entry.seller = null;
      return { sellerInstanceId: seller.id, publicationId: seller.publicationId, state: 'CLOSED' };
    })();
    return seller.closing;
  }
  async #closeEntry(entry) {
    if (!entry.closing) entry.closing = (async () => {
      await Promise.allSettled([...entry.pending]);
      const results = await Promise.allSettled([
        entry.seller ? this.#stopSeller(entry, entry.seller.id) : Promise.resolve(),
        this.#reads.closeScope(this.#scope(entry.alias)), entry.service.close(),
      ]);
      entry.packages.clear();
      if (results.some(result => result.status === 'rejected')) throw failure('CANADABUYS_SHUTDOWN_INCOMPLETE', 'An owned native service reported incomplete shutdown.');
      if (this.#entries.get(entry.alias) === entry) this.#entries.delete(entry.alias);
      return { workspace: entry.alias, instanceId: entry.instanceId, state: 'CLOSED' };
    })();
    return entry.closing;
  }
  #input(entry, alias) {
    identifier(alias, 'CANADABUYS input alias');
    const input = entry.definition.inputs[alias];
    if (!input) throw failure('CANADABUYS_INPUT_NOT_CONFIGURED', 'Choose a host-declared input from merchant_canadabuys_inputs.');
    return input;
  }
  #publication(entry, id) {
    const item = entry.model.getPublication(id);
    if (!item) throw failure('CANADABUYS_PUBLICATION_NOT_FOUND', 'Choose a retained publication from merchant_canadabuys_status.');
    return item;
  }
  async #package(entry, item) {
    if (item.kind !== 'canadabuys-merchant' || !HASH.test(item.bundleSha256 ?? '') || !UUID.test(item.merchantId ?? '')
        || typeof item.directory !== 'string' || item.directory !== join(entry.definition.directory, 'merchant', item.merchantId))
      throw failure('CANADABUYS_MERCHANT_PUBLICATION_REQUIRED', 'Select an original CANADABUYS merchant publication.');
    const key = item.id + ':' + item.bundleSha256;
    if (entry.packages.has(key)) return entry.packages.get(key);
    const pending = (async () => {
      const { loadMerchant } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/merchant.mjs');
      return loadMerchant(item.directory, { expectedBundleSha256: item.bundleSha256 });
    })();
    entry.packages.set(key, pending);
    try {
      const result = await pending;
      for (const oldest of entry.packages.keys()) {
        if (entry.packages.size <= 2) break;
        if (oldest !== key) entry.packages.delete(oldest);
      }
      return result;
    } catch (issue) { if (entry.packages.get(key) === pending) entry.packages.delete(key); throw issue; }
  }
  async #files(entry, item) {
    if (item.kind === 'canadabuys-merchant') {
      const merchant = await this.#package(entry, item);
      return { directory: merchant.directory, files: merchant.files.map(file => ({ ...file, mime: mime(file.file) })) };
    }
    if (item.kind !== 'canadabuys-export' || item.directory !== entry.exportsDirectory
        || typeof item.file !== 'string' || basename(item.file) !== item.file
        || !HASH.test(item.sha256 ?? '') || !Number.isSafeInteger(item.bytes) || item.bytes < 0)
      throw failure('CANADABUYS_EXPORT_PUBLICATION_REQUIRED', 'Select an original retained export or merchant publication.');
    return { directory: item.directory, files: [{ file: item.file, sha256: item.sha256, bytes: item.bytes, mime: item.mime ?? mime(item.file) }] };
  }
  async #export(entry, args) {
    const frozen = entry.model._snapshot(() => {
    this.#revision(entry, args.expectedRevision);
    const options = { scope: args.scope ?? 'all', noticeIds: args.noticeIds };
    let selectedNoticeIds = entry.model._selected(options).notices.map(notice => notice.id);
    let body, contentType = 'application/json; charset=utf-8', extension = 'json';
    if (args.format.startsWith('decision-')) {
      if (!args.decisionId) throw failure('INVALID_PARAMS', 'Select the saved decision for this complete report.');
      const record = entry.model.bidderDesk.get('decision', args.decisionId, { revision: args.recordRevision });
      const report = entry.model.bidderDesk.report(args.decisionId, { revision: args.recordRevision, format: args.format.slice('decision-'.length) });
      body = report.body; contentType = report.mime; extension = args.format.slice('decision-'.length);
      selectedNoticeIds = [record.noticeId];
    } else if (args.format === 'evidence') {
      if (!args.evidenceId) throw failure('INVALID_PARAMS', 'Select the saved evidence document for its original bytes.');
      const original = entry.model.bidderDesk.evidenceFile(args.evidenceId, { revision: args.recordRevision });
      body = original.body; contentType = original.mime; extension = 'bin';
      selectedNoticeIds = original.record.noticeId ? [original.record.noticeId] : [];
    } else if (['json', 'csv', 'html'].includes(args.format)) {
      const report = entry.model.report({ format: args.format, ...options });
      body = report.body; contentType = report.mime; extension = args.format;
    } else if (args.format === 'package') body = encoded(entry.model.exportPackage(options));
    else if (args.format === 'comparison') {
      if (!args.beforeId || !args.afterId) throw failure('INVALID_PARAMS', 'Select both retained entries for the complete comparison export.');
      body = encoded(entry.model.compare(args.beforeId, args.afterId));
    } else if (args.format === 'source' && args.sourceId) {
      if (args.entryId) throw failure('INVALID_PARAMS', 'Select either sourceId or entryId for one original source export.');
      const original = entry.model.getSource(args.sourceId);
      if (!original) throw failure('CANADABUYS_SOURCE_NOT_FOUND', 'Select one exact original source from the workspace.');
      body = original.rawText; contentType = 'text/csv; charset=utf-8'; extension = 'csv';
    } else {
      if (!args.entryId) throw failure('INVALID_PARAMS', 'Select one exact retained entry for this export.');
      const original = entry.model.getEntry(args.entryId);
      if (!original) throw failure('CANADABUYS_ENTRY_NOT_FOUND', 'Select one retained entry from the process index.');
      body = args.format === 'source' ? entry.model.getSource(original.sourceId).rawText : encoded(original.row);
      if (args.format === 'source') { contentType = 'text/csv; charset=utf-8'; extension = 'csv'; }
    }
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) throw failure('CANADABUYS_EXPORT_INVALID', 'The original report did not return complete text or bytes.');
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    return { bytes, contentType, extension, selectedNoticeIds, options, sourceRevision: entry.model.metadata().revision };
    });
    const { bytes, contentType, extension, selectedNoticeIds, options, sourceRevision } = frozen;
    const file = 'canadabuys-' + args.format + '-' + randomUUID() + '.' + extension;
    await writePrivate(join(entry.exportsDirectory, file), bytes);
    // The original snapshot was frozen synchronously before disk I/O.
    const publication = entry.model.recordPublication({ kind: 'canadabuys-export', format: args.format,
      sourceRevision, noticeIds: selectedNoticeIds, directory: entry.exportsDirectory, file,
      mime: contentType, bytes: bytes.length, sha256: digest(bytes),
      selection: { scope: options.scope, ...(options.noticeIds ? { noticeIds: options.noticeIds } : {}),
        ...(args.sourceId ? { sourceId: args.sourceId } : {}),
        ...(args.entryId ? { entryId: args.entryId } : {}),
        ...(args.decisionId ? { decisionId: args.decisionId } : {}),
        ...(args.evidenceId ? { evidenceId: args.evidenceId } : {}),
        ...(args.recordRevision ? { recordRevision: args.recordRevision } : {}),
        ...(args.beforeId ? { beforeId: args.beforeId, afterId: args.afterId } : {}) } }).publication;
    return { workspace: entry.alias, publication: publicationView(publication),
      files: [{ file, mime: contentType, bytes: bytes.length, sha256: publication.sha256 }] };
  }
  async #startSeller(entry, item) {
    if (entry.sellerOpening) {
      await entry.sellerOpening;
      return this.#startSeller(entry, item);
    }
    if (entry.seller) {
      if (entry.seller.publicationId !== item.id || entry.seller.closing)
        throw failure('CANADABUYS_SELLER_ALREADY_RUNNING', 'Stop the currently owned seller instance before selecting a different publication.');
      return { sellerInstanceId: entry.seller.id, publicationId: item.id,
        origin: entry.seller.service.origin ?? entry.seller.service.url ?? null, snapshot: entry.seller.service.snapshot };
    }
    const opening = (async () => {
      await this.#package(entry, item);
      const { serveMerchant } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/merchant.mjs');
      const host = entry.definition.merchant ?? {};
      const service = await serveMerchant(item.directory, { expectedBundleSha256: item.bundleSha256,
        facilitator: host.facilitator, allowLocalFacilitator: host.allowLocalFacilitator,
        availabilityDirectory: host.availabilityDirectory, port: 0 });
      entry.seller = { id: randomUUID(), publicationId: item.id, service, closing: null };
      return { sellerInstanceId: entry.seller.id, publicationId: item.id,
        origin: service.origin ?? service.url ?? null, snapshot: service.snapshot };
    })();
    entry.sellerOpening = opening;
    try { return await opening; } finally { if (entry.sellerOpening === opening) entry.sellerOpening = null; }
  }

  async #intakeInput(entry, input) {
    const selected = this.#input(entry, input.input);
    const file = await originalFile(selected.file, { consume: true, maximum: 192 * 1024 * 1024 });
    if (input.expectedSha256 !== undefined && file.sha256 !== input.expectedSha256)
      throw failure('CANADABUYS_INPUT_CHANGED', 'The prepared intake differs from its inspected complete SHA256.');
    const request = parse(file.content);
    exact(request, ['workspaceId', 'noticeId', 'expectedRevision', 'applyRevision', 'commandId', 'documents'],
      ['workspaceId', 'noticeId', 'expectedRevision', 'commandId', 'documents']);
    if (request.workspaceId !== entry.model.metadata().id)
      throw failure('CANADABUYS_INTAKE_WORKSPACE_CHANGED', 'The prepared intake belongs to another native workspace.');
    integer(request.expectedRevision, -1);
    if (request.applyRevision !== undefined) integer(request.applyRevision, -1);
    if (typeof request.commandId !== 'string' || !request.commandId.trim() || request.commandId.length > 180
        || /[\x00-\x1f\x7f]/.test(request.commandId))
      throw failure('INVALID_PARAMS', 'Retain the original nonempty intake commandId.');
    if (input.commandId !== undefined && request.commandId !== input.commandId)
      throw failure('CANADABUYS_INTAKE_COMMAND_CHANGED', 'The selected input belongs to another original intake command.');
    for (const key of ['workspaceId', 'noticeId', 'expectedRevision', 'applyRevision'])
      if (input[key] !== undefined && input[key] !== request[key])
        throw failure('CANADABUYS_INTAKE_SELECTION_CHANGED', 'The prepared intake changed its original ' + key + '.');
    const notice = entry.model.getNotice(request.noticeId);
    if (!Array.isArray(request.documents) || request.documents.length < 1 || request.documents.length > 100)
      throw failure('INVALID_PARAMS', 'Select between 1 and 100 original documents.');
    let totalBytes = 0;
    const documents = request.documents.map((document, index) => {
      if (!plain(document) || typeof document.bodyBase64 !== 'string'
          || document.bodyBase64.length > Math.ceil(64 * 1024 * 1024 / 3) * 4)
        throw failure('INVALID_PARAMS', 'Each intake document needs its complete original bytes within 64 MiB.');
      const body = Buffer.from(document.bodyBase64, 'base64'), sha256 = digest(body);
      if (body.toString('base64') !== document.bodyBase64 || body.length > 64 * 1024 * 1024
          || document.sha256 !== undefined && document.sha256 !== sha256
          || document.bytes !== undefined && document.bytes !== body.length)
        throw failure('CANADABUYS_INTAKE_DOCUMENT_CHANGED', 'The original document bytes or declared identity differ.');
      totalBytes += body.length;
      if (totalBytes > 128 * 1024 * 1024)
        throw failure('CANADABUYS_INTAKE_TOO_LARGE', 'The prepared document set exceeds 128 MiB.');
      const { bodyBase64, ...metadata } = document;
      return { index, metadata, bytes: body.length, sha256 };
    });
    return { request, inspection: { workspace: entry.alias, native: entry.model.metadata(),
      input: input.input, file: { name: basename(selected.file), bytes: file.bytes, sha256: file.sha256 },
      selection: { workspaceId: request.workspaceId, noticeId: notice.id, commandId: request.commandId,
        expectedRevision: request.expectedRevision, ...(request.applyRevision === undefined ? {} : { applyRevision: request.applyRevision }) },
      documents, totalBytes, mutation: false } };
  }

  async #execute(entry, name, args) {
    const { workspace, ...input } = args;
    const model = entry.model;
    switch (name) {
      case 'merchant_canadabuys_bidder_intake_inspect':
        return (await this.#intakeInput(entry, input)).inspection;
      case 'merchant_canadabuys_bidder_intake': {
        const { request } = await this.#intakeInput(entry, input);
        // The native transaction checks original command history before its save revision.
        // Preserve expectedRevision/applyRevision and every submitted document exactly.
        const result = model.bidderDesk.intakeEvidence(request);
        return { workspace, native: result.workspace, schema: result.schema,
          commandId: result.commandId, intakeSha256: result.intakeSha256, noticeId: result.noticeId,
          records: result.records, alreadyApplied: result.alreadyApplied };
      }
      case 'merchant_canadabuys_bidder_status': {
        const result=model.bidderDesk.status();return { workspace, native:result.workspace, schema:result.schema, counts:result.counts };
      }
      case 'merchant_canadabuys_bidder_list': return { workspace, ...model.bidderDesk.list(input.kind, input) };
      case 'merchant_canadabuys_bidder_record': return { workspace, record: model.bidderDesk.get(input.kind, input.recordId, input) };
      case 'merchant_canadabuys_bidder_create':
      case 'merchant_canadabuys_bidder_update': {
        const record = { ...input.record, expectedRevision: input.expectedRevision,
          ...(input.commandId ? { commandId: input.commandId } : {}) };
        if (input.input) {
          if (input.kind !== 'evidence' || !input.expectedSha256) throw failure('INVALID_PARAMS', 'Evidence intake needs its inspected input SHA256.');
          const selected = this.#input(entry, input.input), original = await originalFile(selected.file, { consume: true, maximum: 64 * 1024 * 1024 });
          if (original.sha256 !== input.expectedSha256) throw failure('CANADABUYS_INPUT_CHANGED', 'The selected evidence differs from its inspected SHA256.');
          record.bodyBase64 = original.content.toString('base64');
          record.sha256 = original.sha256; record.bytes = original.bytes;
          record.localOrigin = record.localOrigin || basename(selected.file);
          record.title = record.title || selected.label || basename(selected.file);
          if (!record.sourceUrl && selected.url) record.sourceUrl = selected.url;
        } else if (input.expectedSha256) throw failure('INVALID_PARAMS', 'Select the configured input for the evidence SHA256.');
        const result = name === 'merchant_canadabuys_bidder_create'
          ? model.bidderDesk.create(input.kind, record)
          : model.bidderDesk.update(input.kind, input.recordId, record);
        return { workspace, native:result.workspace, record:result.record, alreadyApplied:result.alreadyApplied||false };
      }
      case 'merchant_canadabuys_bidder_fit': {
        const result = model.bidderDesk.fit(input.profileId, input);
        return { workspace, profile: result.profile, ...page(result.results, input) };
      }
      case 'merchant_canadabuys_bidder_assess': return { workspace, ...model.bidderDesk.assess(input) };
      case 'merchant_canadabuys_bidder_compare': return { workspace, ...model.bidderDesk.compareCurrent(input.recordId) };
      case 'merchant_canadabuys_status': return this.#state(entry, input);
      case 'merchant_canadabuys_entries': {
        const project = model.view().notices.find(item => item.id === input.noticeId);
        if (!project) throw failure('CANADABUYS_PROCESS_NOT_FOUND', 'Select a contracting process from the original workspace.');
        return { workspace, noticeId: project.id, review: project.review, ...page(project.entries, input) };
      }
      case 'merchant_canadabuys_notice': return { workspace, notice: model.getNotice(input.noticeId) };
      case 'merchant_canadabuys_workshare': return { workspace, workshare: model.getWorkshare(input.workshareId) };
      case 'merchant_canadabuys_entry': {
        const original = model.getEntry(input.entryId);
        if (!original) throw failure('CANADABUYS_ENTRY_NOT_FOUND', 'Select a retained entry from the process index.');
        return { workspace, entry: input.includeDocument === false ? metadata(original)
          : { ...original, source: sourceView(original.source) } };
      }
      case 'merchant_canadabuys_compare': {
        const comparison = model.compare(input.beforeId, input.afterId);
        const selected = page(comparison.changes, input);
        if (!input.includeValues) selected.items = selected.items.map(({ before, after, ...change }) => change);
        return { workspace, before: metadata(comparison.before), after: metadata(comparison.after), sameNotice: comparison.sameNotice, counts: { changes: comparison.changes.length }, ...selected };
      }
      case 'merchant_canadabuys_source': {
        const original = model.getSource(input.sourceId);
        if (!original) throw failure('CANADABUYS_SOURCE_NOT_FOUND', 'Select one exact original source from the workspace.');
        return { workspace, source: input.includeBody ? original : sourceView(original) };
      }
      case 'merchant_canadabuys_capture_record': {
        const capture = model.getCapture(input.captureId);
        if (!capture) throw failure('CANADABUYS_CAPTURE_NOT_FOUND', 'Select one saved capture from the original workspace.');
        return { workspace, capture };
      }
      case 'merchant_canadabuys_receiving': {
        const receiving = model.getReceiving(input.packageId);
        if (!receiving) throw failure('CANADABUYS_RECEIVING_NOT_FOUND', 'Select a package identifier from the retained receiving history.');
        return { workspace, receiving };
      }
      case 'merchant_canadabuys_inputs': {
        if (input.input === undefined) return { workspace,
          inputs: Object.entries(entry.definition.inputs).map(([alias, value]) => ({ input: alias, label: value.label, url: value.url })),
          deliveries: Object.keys(entry.definition.deliveries) };
        const selected = this.#input(entry, input.input), original = await originalFile(selected.file);
        return { workspace, input: input.input, label: selected.label, url: selected.url, file: { name: basename(selected.file), ...original } };
      }
      case 'merchant_canadabuys_import':
      case 'merchant_canadabuys_receive': {
        const selected = this.#input(entry, input.input), original = await originalFile(selected.file, { consume: true });
        if (original.sha256 !== input.expectedSha256) throw failure('CANADABUYS_INPUT_CHANGED', 'The selected input differs from its inspected SHA256.');
        this.#revision(entry, input.expectedRevision);
        if (name === 'merchant_canadabuys_receive') model.receivePackage(parse(original.content), { expectedRevision: input.expectedRevision });
        else model.importCsv(original.content, { stream: input.stream || selected.stream, label: selected.label, url: selected.url,
          retrievedAt: selected.retrievedAt || new Date().toISOString(), expectedSha256: input.expectedSha256 }, input.expectedRevision);
        return { workspace, input: input.input, sha256: original.sha256, ...this.#state(entry) };
      }
      case 'merchant_canadabuys_capture': {
        if (!input.captureId && !input.stream) throw failure('INVALID_PARAMS', 'Supply stream for a new capture or the original captureId to resume.');
        const result = await entry.client.capture(input);
        return { ...this.#state(entry), ...(Object.hasOwn(result, 'capture') ? { capture: result.capture } : {}) };
      }
      case 'merchant_canadabuys_review':
        model.updateReview(input.noticeId, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'noticeId')));
        return this.#state(entry);
      case 'merchant_canadabuys_workshare_create': {
        const result = model.createWorkshare(input.record, input.expectedRevision);
        return { ...this.#state(entry), workshare: result.workshare };
      }
      case 'merchant_canadabuys_workshare_update': {
        const result = model.updateWorkshare(input.workshareId, { ...input.record, expectedRevision: input.expectedRevision });
        return { ...this.#state(entry), workshare: result.workshare };
      }
      case 'merchant_canadabuys_qualify': {
        const result = model.qualify(input.profile);
        return { workspace, profile: result.profile, ...page(result.results, input) };
      }
      case 'merchant_canadabuys_export': return this.#export(entry, input);
      case 'merchant_canadabuys_files': {
        const item = this.#publication(entry, input.publicationId), selected = await this.#files(entry, item);
        return { workspace, publication: publicationView(item), files: selected.files };
      }
      case 'merchant_canadabuys_file_read': {
        const item = this.#publication(entry, input.publicationId), selected = await this.#files(entry, item);
        const file = selected.files.find(value => value.file === input.file);
        if (!file) throw failure('CANADABUYS_FILE_NOT_FOUND', 'Select an original listed file from this publication.');
        if (file.sha256 !== input.expectedSha256) throw failure('CANADABUYS_FILE_CHANGED', 'Use the original listed file SHA256.');
        return this.#reads.read({ scope: this.#scope(workspace), key: item.id + ':' + file.file,
          kind: item.kind, directory: entry.exportsDirectory, expectedSha256: input.expectedSha256,
          readId: input.readId, offset: input.offset, limit: input.limit,
          load: async () => ({ name: basename(file.file), type: file.mime, bytes: file.bytes, sha256: file.sha256,
            readonlyFileHandle: await open(join(selected.directory, file.file), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)) }) });
      }
      case 'merchant_canadabuys_file_release':
        await this.#reads.release(this.#scope(workspace), input.readId);
        return { workspace, readId: input.readId, released: true };
      case 'merchant_canadabuys_merchant_prepare': {
        this.#revision(entry, input.expectedRevision);
        const { prepareMerchant } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/merchant.mjs');
        const host = entry.definition.merchant ?? {};
        const prepared = await prepareMerchant(model, { expectedRevision: input.expectedRevision,
          scope: input.scope ?? 'shortlist', noticeIds: input.noticeIds, name: input.name ?? host.name,
          payment: host.payment, origin: host.origin, path: host.path,
          defaultLimit: host.defaultLimit, maxLimit: host.maxLimit });
        return { workspace, publication: publicationView(prepared.publication), bundle: prepared.bundle };
      }
      case 'merchant_canadabuys_merchant_preview': {
        const merchant = await this.#package(entry, this.#publication(entry, input.publicationId));
        const context = { query: input.query ?? {} }, admission = await merchant.dataset.admit(context);
        if (admission !== true) throw failure('CANADABUYS_DATASET_QUERY_REJECTED', admission?.body?.message ?? 'The original dataset rejected this query.');
        const result = await merchant.dataset.handle(context);
        if (result.status !== 200) throw failure('CANADABUYS_DATASET_QUERY_REJECTED', result.body?.message ?? 'The original dataset rejected this query.');
        return { workspace, snapshot: merchant.bundle.dataset.snapshot, result };
      }
      case 'merchant_canadabuys_merchant_start':
        return { workspace, ...await this.#startSeller(entry, this.#publication(entry, input.publicationId)) };
      case 'merchant_canadabuys_merchant_stop': return { workspace, ...await this.#stopSeller(entry, input.sellerInstanceId) };
      case 'merchant_canadabuys_delivery_adopt': {
        const directory = entry.definition.deliveries[input.delivery];
        if (!directory) throw failure('CANADABUYS_DELIVERY_NOT_CONFIGURED', 'Choose a host-declared completed delivery alias.');
        this.#revision(entry, input.expectedRevision);
        const { adoptDelivery } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/merchant.mjs');
        const result = await adoptDelivery(model, directory, { expectedRevision: input.expectedRevision });
        return { workspace, publication: publicationView(result.publication), replay: Boolean(result.replay), ...this.#state(entry) };
      }
      default: throw failure('TOOL_NOT_FOUND', 'Unknown CANADABUYS workspace operation.');
    }
  }
  async call(name, args = {}) {
    if (this.#closing) throw failure('CANADABUYS_WORKSPACE_CLOSING', 'The merchant operator is closing.');
    const definition = byName.get(name);
    if (!definition) throw failure('TOOL_NOT_FOUND', 'Unknown CANADABUYS workspace operation.');
    exact(args, Object.keys(definition[2]), definition[3]);
    for (const [key, value] of Object.entries(args)) validate(value, definition[2][key], key);
    if (name === 'merchant_canadabuys_workspaces') return this.summary;
    if (name === 'merchant_canadabuys_open') return this.#open(args.workspace);
    if (name === 'merchant_canadabuys_close') {
      const entry = this.#entry(args.workspace);
      if (entry.instanceId !== args.instanceId) throw failure('CANADABUYS_INSTANCE_CONFLICT', 'Close the exact currently owned service instance.');
      return this.#closeEntry(entry);
    }
    const entry = this.#entry(args.workspace), pending = Promise.resolve().then(() => this.#execute(entry, name, args));
    entry.pending.add(pending);
    try { return await pending; } finally { entry.pending.delete(pending); }
  }
  close() {
    if (!this.#close) {
      this.#closing = true;
      this.#close = (async () => {
        await Promise.allSettled([...this.#opening.values()]);
        const results = await Promise.allSettled([...this.#entries.values()].map(entry => this.#closeEntry(entry)));
        await this.#reads.close();
        if (results.some(result => result.status === 'rejected')) throw failure('CANADABUYS_SHUTDOWN_INCOMPLETE', 'An owned native service reported incomplete shutdown.');
      })();
    }
    return this.#close;
  }
}

/** Initialize the original merchant host with the independently registered provider. */
export async function initializeCanadaBuysWorkspaceMerchant({ directory, connection, name = 'Starforge procurement' }) {
  const root = resolve(directory), canadabuysWorkspaceConnection = pathFor(connection, process.cwd());
  const configuration = await readCanadaBuysWorkspaceConfiguration(canadabuysWorkspaceConnection);
  name = line(name, 'Merchant name');
  await mkdir(root, { mode: 0o700 });
  await (await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')).initReleaseStore(join(root, 'releases'));
  await mkdir(join(root, 'customer-exports'), { mode: 0o700 });
  const file = join(root, 'merchant-mcp.json');
  await writePrivate(file, { schema: 'stellar-forge.merchant-mcp.v1', name, releaseStore: './releases',
    exportsDirectory: './customer-exports', sources: {}, canadabuysWorkspaceConnection });
  await (await import('./config.mjs')).readMerchantConfig(file);
  return { schema: 'stellar-forge.merchant-mcp.v1', configuration: file, state: 'INITIALIZED', canadabuysWorkspacesConfigured: true,
    workspaces: Object.entries(configuration.workspaces).map(([workspace, item]) => ({ workspace, label: item.label })),
    authoring: 'OPENED_BY_MERCHANT_CANADABUYS_OPEN' };
}
