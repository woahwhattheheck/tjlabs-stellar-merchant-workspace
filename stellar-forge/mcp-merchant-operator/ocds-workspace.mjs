// MIT. Original OCDS model, browser and merchant controls behind host-declared aliases.
import { constants } from 'node:fs';
import { mkdir, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { definitions } from './catalog/ocds-workspace.mjs';
export { ocdsWorkspaceTools } from './catalog/ocds-workspace.mjs';
import { exact, failure, identifier, line, plain, privateSupportDirectory, writePrivate } from './host-files.mjs';
import { RetainedFileReads } from './retained-file-reads.mjs';
import { OcdsClient } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/client.mjs';

export const OCDS_WORKSPACE_CONNECTION_SCHEMA = 'starforge.ocds.workspace-connection.v1';
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
  catch { throw failure('OCDS_INVALID_JSON', 'The selected original file must contain complete UTF-8 JSON.'); }
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
    if (!before.isFile() || before.size > BigInt(maximum)) throw failure('OCDS_INPUT_INVALID', 'Use a regular original source within the native size limit.');
    const hash = createHash('sha256'), blocks = [], buffer = Buffer.alloc(65536);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead;
      if (position > maximum) throw failure('OCDS_INPUT_TOO_LARGE', 'The original source exceeds its native size limit.');
      const block = buffer.subarray(0, bytesRead); hash.update(block);
      if (consume) blocks.push(Buffer.from(block));
    }
    const after = await handle.stat({ bigint: true });
    if (BigInt(position) !== after.size || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key]))
      throw failure('OCDS_INPUT_CHANGED', 'The original file changed while being read; inspect its current source identity.');
    return { bytes: position, sha256: hash.digest('hex'), ...(consume ? { content: Buffer.concat(blocks, position) } : {}) };
  } catch (issue) {
    if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR'].includes(issue.code))
      throw failure('OCDS_INPUT_UNAVAILABLE', 'The selected host-declared original file is unavailable. Check that same alias on the host.');
    throw issue;
  } finally { await handle?.close(); }
}

/** Configuration reads declarations only. The original SQLite service opens explicitly. */
export async function readOcdsWorkspaceConfiguration(path) {
  path = resolve(path);
  const raw = parse((await originalFile(path, { consume: true, maximum: 1048576 })).content);
  exact(raw, ['schema', 'workspaces'], ['schema', 'workspaces']);
  if (raw.schema !== OCDS_WORKSPACE_CONNECTION_SCHEMA || !plain(raw.workspaces)
      || !Object.keys(raw.workspaces).length || Object.keys(raw.workspaces).length > 32)
    throw failure('CONFIGURATION_ERROR', 'Declare between 1 and 32 original OCDS workspace aliases.');
  const base = dirname(path), directories = new Set(), workspaces = Object.create(null);
  for (const [alias, item] of Object.entries(raw.workspaces)) {
    identifier(alias, 'OCDS workspace alias');
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
      identifier(key, 'OCDS input alias');
      exact(value, ['file', 'label', 'url'], ['file']);
      if (value.url !== undefined && (typeof value.url !== 'string' || value.url.length > 8192))
        throw failure('CONFIGURATION_ERROR', 'Use the original publication URL as source metadata.');
      inputs[key] = { file: pathFor(value.file, base), label: line(value.label ?? key, 'Input label'), url: value.url };
    }
    for (const [key, value] of Object.entries(item.deliveries ?? {})) {
      identifier(key, 'OCDS delivery alias');
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
  return { schema: OCDS_WORKSPACE_CONNECTION_SCHEMA, workspaces };
}
function publicationView(item) {
  const { directory, sourceFile, file, ...publicItem } = item;
  return publicItem;
}
function sourceView(source) {
  if (!source) return source;
  const { body, document, ...metadata } = source;
  return metadata;
}
function metadata(entry) {
  const { document, source, ...value } = entry;
  return { ...value, ...(source ? { source: sourceView(source) } : {}) };
}
function page(values, args = {}) {
  const offset = integer(args.offset, 0), limit = integer(args.limit, 50, 500);
  if (!limit) throw failure('INVALID_PARAMS', 'Use a page limit of at least one.');
  const items = values.slice(offset, offset + limit);
  return { items, page: { offset, limit, total: values.length, nextOffset: offset + items.length < values.length ? offset + items.length : null } };
}

export class MerchantOcdsWorkspaces {
  #config; #entries = new Map(); #opening = new Map(); #closing = false; #close;
  #reads = new RetainedFileReads({ errorPrefix: 'OCDS_FILE' });
  constructor(config) { this.#config = config; }
  get summary() {
    return { configured: Boolean(this.#config.ocdsWorkspaces), ...this.#reads.summary,
      workspaces: Object.entries(this.#config.ocdsWorkspaces?.workspaces ?? {}).map(([workspace, definition]) => {
        const entry = this.#entries.get(workspace);
        return { workspace, label: definition.label, open: Boolean(entry), opening: this.#opening.has(workspace),
          closing: Boolean(entry?.closing), instanceId: entry?.instanceId ?? null, browserUrl: entry?.service.url ?? null,
          inputAliases: Object.keys(definition.inputs), deliveryAliases: Object.keys(definition.deliveries),
          merchantConfigured: Boolean(definition.merchant), sellerInstanceId: entry?.seller?.id ?? null };
      }) };
  }
  #definition(alias) {
    identifier(alias, 'OCDS workspace alias');
    const value = this.#config.ocdsWorkspaces?.workspaces[alias];
    if (!value) throw failure('OCDS_WORKSPACE_NOT_CONFIGURED', 'Choose a host-declared alias from merchant_ocds_workspaces.');
    return value;
  }
  #entry(alias) {
    this.#definition(alias);
    const entry = this.#entries.get(alias);
    if (!entry) throw failure('OCDS_WORKSPACE_NOT_OPEN', 'Open the selected original workspace first.');
    if (entry.closing) throw failure('OCDS_WORKSPACE_CLOSING', 'The current owned workspace is draining.');
    return entry;
  }
  #scope(alias) { return 'ocds:' + alias + ':' + this.#definition(alias).directory; }
  #revision(entry, expected) {
    integer(expected, -1);
    const actual = entry.model.view().workspace.revision;
    if (expected !== actual) throw failure('OCDS_REVISION_CONFLICT', 'Use the current global workspace revision from merchant_ocds_status.');
    return actual;
  }
  #state(entry, args = {}) {
    const view = entry.model.view(), collection = args.collection ?? 'projects';
    if (!['projects', 'sources', 'publications', 'diagnostics', 'receivings', 'captures'].includes(collection)) throw failure('INVALID_PARAMS', 'Choose a declared workspace collection.');
    const selected = page(view[collection] ?? [], args);
    if (collection === 'publications') selected.items = selected.items.map(publicationView);
    return { workspace: entry.alias, instanceId: entry.instanceId, browserUrl: entry.service.url,
      native: view.workspace, collection, ...selected,
      counts: Object.fromEntries(['projects', 'sources', 'publications', 'diagnostics', 'receivings', 'captures'].map(key => [key, (view[key] ?? []).length])),
      seller: entry.seller ? { sellerInstanceId: entry.seller.id, publicationId: entry.seller.publicationId,
        origin: entry.seller.service.origin ?? entry.seller.service.url ?? null, snapshot: entry.seller.service.snapshot } : null,
      fileReads: this.#reads.status(this.#scope(entry.alias)) };
  }
  async #open(alias) {
    const definition = this.#definition(alias);
    if (this.#entries.has(alias)) return this.#state(this.#entry(alias));
    if (this.#opening.has(alias)) return this.#opening.get(alias);
    const opening = (async () => {
      const { startOcdsServer } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/server.mjs');
      let service;
      try {
        service = await startOcdsServer({ directory: definition.directory, operator: definition.operator, title: definition.title, port: 0 });
        if (this.#closing) throw failure('OCDS_WORKSPACE_CLOSING', 'The merchant operator is closing.');
        const exportsDirectory = join(this.#config.exportsDirectory, 'ocds', alias);
        await mkdir(exportsDirectory, { recursive: true, mode: 0o700 });
        await privateSupportDirectory(exportsDirectory);
        const entry = { alias, definition, service, model: service.workspace,
          client: new OcdsClient(service.origin, { timeoutMs: 300000, maxResponseBytes: INPUT_LIMIT }),
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
    if (!seller || seller.id !== expectedId) throw failure('OCDS_SELLER_INSTANCE_CONFLICT', 'Use the current owned seller instance identifier.');
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
      if (results.some(result => result.status === 'rejected')) throw failure('OCDS_SHUTDOWN_INCOMPLETE', 'An owned native service reported incomplete shutdown.');
      if (this.#entries.get(entry.alias) === entry) this.#entries.delete(entry.alias);
      return { workspace: entry.alias, instanceId: entry.instanceId, state: 'CLOSED' };
    })();
    return entry.closing;
  }
  #input(entry, alias) {
    identifier(alias, 'OCDS input alias');
    const input = entry.definition.inputs[alias];
    if (!input) throw failure('OCDS_INPUT_NOT_CONFIGURED', 'Choose a host-declared input from merchant_ocds_inputs.');
    return input;
  }
  #publication(entry, id) {
    const item = (entry.model.view().publications ?? []).find(value => value.id === id);
    if (!item) throw failure('OCDS_PUBLICATION_NOT_FOUND', 'Choose a retained publication from merchant_ocds_status.');
    return item;
  }
  async #package(entry, item) {
    if (item.kind !== 'ocds-merchant' || !HASH.test(item.bundleSha256 ?? '') || !UUID.test(item.merchantId ?? '')
        || typeof item.directory !== 'string' || item.directory !== join(entry.definition.directory, 'merchant', item.merchantId))
      throw failure('OCDS_MERCHANT_PUBLICATION_REQUIRED', 'Select an original OCDS merchant publication.');
    const key = item.id + ':' + item.bundleSha256;
    if (entry.packages.has(key)) return entry.packages.get(key);
    const pending = (async () => {
      const { loadMerchant } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/merchant.mjs');
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
    if (item.kind === 'ocds-merchant') {
      const merchant = await this.#package(entry, item);
      return { directory: merchant.directory, files: merchant.files.map(file => ({ ...file, mime: mime(file.file) })) };
    }
    if (item.kind !== 'ocds-export' || item.directory !== entry.exportsDirectory
        || typeof item.file !== 'string' || basename(item.file) !== item.file
        || !HASH.test(item.sha256 ?? '') || !Number.isSafeInteger(item.bytes) || item.bytes < 0)
      throw failure('OCDS_EXPORT_PUBLICATION_REQUIRED', 'Select an original retained export or merchant publication.');
    return { directory: item.directory, files: [{ file: item.file, sha256: item.sha256, bytes: item.bytes, mime: item.mime ?? mime(item.file) }] };
  }
  async #export(entry, args) {
    this.#revision(entry, args.expectedRevision);
    const options = { scope: args.scope ?? 'all', ocids: args.ocids };
    let body, contentType = 'application/json; charset=utf-8', extension = 'json';
    if (['json', 'csv', 'html'].includes(args.format)) {
      const report = entry.model.report({ format: args.format, ...options });
      body = report.body; contentType = report.mime; extension = args.format;
    } else if (args.format === 'package') body = encoded(entry.model.exportPackage(options));
    else if (args.format === 'comparison') {
      if (!args.beforeId || !args.afterId) throw failure('INVALID_PARAMS', 'Select both retained entries for the complete comparison export.');
      body = encoded(entry.model.compare(args.beforeId, args.afterId));
    } else if (args.format === 'source' && args.sourceId) {
      if (args.entryId) throw failure('INVALID_PARAMS', 'Select either sourceId or entryId for one original source export.');
      const original = entry.model.getSource(args.sourceId);
      if (!original) throw failure('OCDS_SOURCE_NOT_FOUND', 'Select one exact original source from the workspace.');
      body = original.body;
    } else {
      if (!args.entryId) throw failure('INVALID_PARAMS', 'Select one exact retained entry for this export.');
      const original = entry.model.getEntry(args.entryId);
      if (!original) throw failure('OCDS_ENTRY_NOT_FOUND', 'Select one retained entry from the process index.');
      body = args.format === 'source' ? original.source.body : encoded(original.document);
    }
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) throw failure('OCDS_EXPORT_INVALID', 'The original report did not return complete text or bytes.');
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const file = 'ocds-' + args.format + '-' + randomUUID() + '.' + extension;
    await writePrivate(join(entry.exportsDirectory, file), bytes);
    // The original snapshot was frozen synchronously before disk I/O.
    const publication = entry.model.recordPublication({ kind: 'ocds-export', format: args.format,
      sourceRevision: args.expectedRevision, directory: entry.exportsDirectory, file,
      mime: contentType, bytes: bytes.length, sha256: digest(bytes),
      selection: { scope: options.scope, ...(options.ocids ? { ocids: options.ocids } : {}),
        ...(args.sourceId ? { sourceId: args.sourceId } : {}),
        ...(args.entryId ? { entryId: args.entryId } : {}),
        ...(args.beforeId ? { beforeId: args.beforeId, afterId: args.afterId } : {}) } });
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
        throw failure('OCDS_SELLER_ALREADY_RUNNING', 'Stop the currently owned seller instance before selecting a different publication.');
      return { sellerInstanceId: entry.seller.id, publicationId: item.id,
        origin: entry.seller.service.origin ?? entry.seller.service.url ?? null, snapshot: entry.seller.service.snapshot };
    }
    const opening = (async () => {
      await this.#package(entry, item);
      const { serveMerchant } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/merchant.mjs');
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
  async #execute(entry, name, args) {
    const { workspace, ...input } = args;
    const model = entry.model;
    switch (name) {
      case 'merchant_ocds_status': return this.#state(entry, input);
      case 'merchant_ocds_entries': {
        const project = model.view().projects.find(item => item.ocid === input.ocid);
        if (!project) throw failure('OCDS_PROCESS_NOT_FOUND', 'Select a contracting process from the original workspace.');
        return { workspace, ocid: project.ocid, review: project.review, ...page(project.entries, input) };
      }
      case 'merchant_ocds_entry': {
        const original = model.getEntry(input.entryId);
        if (!original) throw failure('OCDS_ENTRY_NOT_FOUND', 'Select a retained entry from the process index.');
        return { workspace, entry: input.includeDocument === false ? metadata(original)
          : { ...original, source: sourceView(original.source) } };
      }
      case 'merchant_ocds_compare': {
        const comparison = model.compare(input.beforeId, input.afterId);
        const selected = page(comparison.changes, input);
        if (!input.includeValues) selected.items = selected.items.map(({ before, after, ...change }) => change);
        return { workspace, before: metadata(comparison.before), after: metadata(comparison.after), counts: comparison.counts, ...selected };
      }
      case 'merchant_ocds_source': {
        const original = model.getSource(input.sourceId);
        if (!original) throw failure('OCDS_SOURCE_NOT_FOUND', 'Select one exact original source from the workspace.');
        return { workspace, source: input.includeBody ? original : sourceView(original) };
      }
      case 'merchant_ocds_capture_record': {
        const capture = model.getCapture(input.captureId);
        if (!capture) throw failure('OCDS_CAPTURE_NOT_FOUND', 'Select one saved capture from the original workspace.');
        return { workspace, capture };
      }
      case 'merchant_ocds_receiving': {
        const receiving = model.getReceiving(input.packageId);
        if (!receiving) throw failure('OCDS_RECEIVING_NOT_FOUND', 'Select a package identifier from the retained receiving history.');
        return { workspace, receiving };
      }
      case 'merchant_ocds_inputs': {
        if (input.input === undefined) return { workspace,
          inputs: Object.entries(entry.definition.inputs).map(([alias, value]) => ({ input: alias, label: value.label, url: value.url })),
          deliveries: Object.keys(entry.definition.deliveries) };
        const selected = this.#input(entry, input.input), original = await originalFile(selected.file);
        return { workspace, input: input.input, label: selected.label, url: selected.url, file: { name: basename(selected.file), ...original } };
      }
      case 'merchant_ocds_import':
      case 'merchant_ocds_receive': {
        const selected = this.#input(entry, input.input), original = await originalFile(selected.file, { consume: true });
        if (original.sha256 !== input.expectedSha256) throw failure('OCDS_INPUT_CHANGED', 'The selected input differs from its inspected SHA256.');
        const document = parse(original.content);
        this.#revision(entry, input.expectedRevision);
        if (name === 'merchant_ocds_receive') model.receivePackage(document, { expectedRevision: input.expectedRevision });
        else model.importDocument(document, { rawText: original.content.toString('utf8'), label: selected.label, url: selected.url,
          retrievedAt: new Date().toISOString() }, input.expectedRevision);
        return { workspace, input: input.input, sha256: original.sha256, ...this.#state(entry) };
      }
      case 'merchant_ocds_capture': {
        if (!input.captureId && !input.kind) throw failure('INVALID_PARAMS', 'Supply kind for a new capture or the original captureId to resume.');
        const result = await entry.client.capture(input.captureId ? { captureId: input.captureId } : input);
        return { ...this.#state(entry), ...(Object.hasOwn(result, 'capture') ? { capture: result.capture } : {}) };
      }
      case 'merchant_ocds_review':
        model.updateReview(input.ocid, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'ocid')));
        return this.#state(entry);
      case 'merchant_ocds_export': return this.#export(entry, input);
      case 'merchant_ocds_files': {
        const item = this.#publication(entry, input.publicationId), selected = await this.#files(entry, item);
        return { workspace, publication: publicationView(item), files: selected.files };
      }
      case 'merchant_ocds_file_read': {
        const item = this.#publication(entry, input.publicationId), selected = await this.#files(entry, item);
        const file = selected.files.find(value => value.file === input.file);
        if (!file) throw failure('OCDS_FILE_NOT_FOUND', 'Select an original listed file from this publication.');
        if (file.sha256 !== input.expectedSha256) throw failure('OCDS_FILE_CHANGED', 'Use the original listed file SHA256.');
        return this.#reads.read({ scope: this.#scope(workspace), key: item.id + ':' + file.file,
          kind: item.kind, directory: entry.exportsDirectory, expectedSha256: input.expectedSha256,
          readId: input.readId, offset: input.offset, limit: input.limit,
          load: async () => ({ name: basename(file.file), type: file.mime, bytes: file.bytes, sha256: file.sha256,
            readonlyFileHandle: await open(join(selected.directory, file.file), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)) }) });
      }
      case 'merchant_ocds_file_release': return this.#reads.release(this.#scope(workspace), input.readId);
      case 'merchant_ocds_merchant_prepare': {
        this.#revision(entry, input.expectedRevision);
        const { prepareMerchant } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/merchant.mjs');
        const host = entry.definition.merchant ?? {};
        const prepared = await prepareMerchant(model, { expectedRevision: input.expectedRevision,
          scope: input.scope ?? 'shortlist', ocids: input.ocids, name: input.name ?? host.name,
          payment: host.payment, origin: host.origin, path: host.path,
          defaultLimit: host.defaultLimit, maxLimit: host.maxLimit });
        return { workspace, publication: publicationView(prepared.publication), bundle: prepared.bundle };
      }
      case 'merchant_ocds_merchant_preview': {
        const merchant = await this.#package(entry, this.#publication(entry, input.publicationId));
        const context = { query: input.query ?? {} }, admission = await merchant.dataset.admit(context);
        if (admission !== true) throw failure('OCDS_DATASET_QUERY_REJECTED', admission?.body?.message ?? 'The original dataset rejected this query.');
        const result = await merchant.dataset.handle(context);
        if (result.status !== 200) throw failure('OCDS_DATASET_QUERY_REJECTED', result.body?.message ?? 'The original dataset rejected this query.');
        return { workspace, snapshot: merchant.bundle.dataset.snapshot, result };
      }
      case 'merchant_ocds_merchant_start':
        return { workspace, ...await this.#startSeller(entry, this.#publication(entry, input.publicationId)) };
      case 'merchant_ocds_merchant_stop': return { workspace, ...await this.#stopSeller(entry, input.sellerInstanceId) };
      case 'merchant_ocds_delivery_adopt': {
        const directory = entry.definition.deliveries[input.delivery];
        if (!directory) throw failure('OCDS_DELIVERY_NOT_CONFIGURED', 'Choose a host-declared completed delivery alias.');
        this.#revision(entry, input.expectedRevision);
        const { adoptDelivery } = await import('../../stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/merchant.mjs');
        const result = await adoptDelivery(model, directory, { expectedRevision: input.expectedRevision });
        return { workspace, publication: publicationView(result.publication), replay: Boolean(result.replay), ...this.#state(entry) };
      }
      default: throw failure('TOOL_NOT_FOUND', 'Unknown OCDS workspace operation.');
    }
  }
  async call(name, args = {}) {
    if (this.#closing) throw failure('OCDS_WORKSPACE_CLOSING', 'The merchant operator is closing.');
    const definition = byName.get(name);
    if (!definition) throw failure('TOOL_NOT_FOUND', 'Unknown OCDS workspace operation.');
    exact(args, Object.keys(definition[2]), definition[3]);
    for (const [key, value] of Object.entries(args)) validate(value, definition[2][key], key);
    if (name === 'merchant_ocds_workspaces') return this.summary;
    if (name === 'merchant_ocds_open') return this.#open(args.workspace);
    if (name === 'merchant_ocds_close') {
      const entry = this.#entry(args.workspace);
      if (entry.instanceId !== args.instanceId) throw failure('OCDS_INSTANCE_CONFLICT', 'Close the exact currently owned service instance.');
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
        if (results.some(result => result.status === 'rejected')) throw failure('OCDS_SHUTDOWN_INCOMPLETE', 'An owned native service reported incomplete shutdown.');
      })();
    }
    return this.#close;
  }
}

/** Initialize the original merchant host with the independently registered provider. */
export async function initializeOcdsWorkspaceMerchant({ directory, connection, name = 'Starforge procurement' }) {
  const root = resolve(directory), ocdsWorkspaceConnection = pathFor(connection, process.cwd());
  const configuration = await readOcdsWorkspaceConfiguration(ocdsWorkspaceConnection);
  name = line(name, 'Merchant name');
  await mkdir(root, { mode: 0o700 });
  await (await import('../../stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs')).initReleaseStore(join(root, 'releases'));
  await mkdir(join(root, 'customer-exports'), { mode: 0o700 });
  const file = join(root, 'merchant-mcp.json');
  await writePrivate(file, { schema: 'stellar-forge.merchant-mcp.v1', name, releaseStore: './releases',
    exportsDirectory: './customer-exports', sources: {}, ocdsWorkspaceConnection });
  await (await import('./config.mjs')).readMerchantConfig(file);
  return { schema: 'stellar-forge.merchant-mcp.v1', configuration: file, state: 'INITIALIZED', ocdsWorkspacesConfigured: true,
    workspaces: Object.entries(configuration.workspaces).map(([workspace, item]) => ({ workspace, label: item.label })),
    authoring: 'OPENED_BY_MERCHANT_OCDS_OPEN' };
}
