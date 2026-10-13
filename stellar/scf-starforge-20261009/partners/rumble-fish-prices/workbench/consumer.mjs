import { randomBytes } from 'node:crypto';
import { mkdir, readdir, lstat, readFile, open, rename, unlink, link } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { clone, digest, parseAssetIdentifier, validateProviderResponse, WorkbenchError } from './contract.mjs';

export const CONSUMER_SCHEMA = 'tjlabs.prices-workbench.consumer.v1';
export const EDITION_SCHEMA = 'tjlabs.prices-workbench.consumer-edition.v1';
export const VALUES_SCHEMA = 'tjlabs.prices-workbench.consumer-values.v1';
const BOOK_SCHEMA = 'tjlabs.prices-workbench.consumer-book.v1';
const REVIEW_SCHEMA = 'tjlabs.prices-workbench.consumer-review.v1';
const now = () => new Date().toISOString();
const fail = (code, message, status = 400) => { throw new WorkbenchError(code, message, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value, label = 'consumerId') => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{1,95}$/.test(value)) fail('CONSUMER_ID_INVALID', label + ' must start with a letter and contain 2–96 lowercase letters, digits or hyphens.');
  return value;
};
const text = (value, limit, label, required = false) => {
  if (typeof value !== 'string' || Buffer.byteLength(value) > limit || /[\u0000-\u001f]/u.test(value) || (required && !value.trim())) fail('CONSUMER_INPUT_INVALID', label + ' must be ' + (required ? 'nonempty ' : '') + 'text of at most ' + limit + ' bytes without control characters.');
  return value.trim();
};
function fields(value, allowed, label) {
  if (!object(value)) fail('CONSUMER_INPUT_INVALID', label + ' must be an object.');
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) fail('CONSUMER_INPUT_INVALID', label + ' has unknown fields: ' + unknown.join(', '));
}
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : object(value) ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const seal = value => ({ ...value, sha256: digest(Buffer.from(canonical(value))) });
function verify(record, schema, label) {
  if (!object(record) || record.schema !== schema || typeof record.sha256 !== 'string') fail('CONSUMER_RECORD_INVALID', label + ' has an unsupported record shape.', 409);
  const { sha256, ...body } = record;
  if (digest(Buffer.from(canonical(body))) !== sha256) fail('CONSUMER_RECORD_CHANGED', label + ' does not match its saved identity.', 409);
  return record;
}

/** Exact fixed-point arithmetic. Original input strings remain on each saved row. */
function decimal(value, { negative = true, digits = 256, scale = 128 } = {}) {
  if (typeof value !== 'string' || value.length > digits + scale + 3 || !/^-?\d+(?:\.\d+)?$/.test(value)) fail('DECIMAL_INVALID', 'Use decimal strings without exponent notation or grouping separators.');
  const sign = value.startsWith('-') ? -1n : 1n;
  if (!negative && sign < 0n) fail('DECIMAL_INVALID', 'Quantities and usable prices must be nonnegative.');
  const parts = (sign < 0n ? value.slice(1) : value).split('.');
  if (parts[0].length > digits || (parts[1]?.length ?? 0) > scale) fail('DECIMAL_LIMIT', 'The decimal exceeds the supported precision.');
  return { coefficient: sign * BigInt(parts[0] + (parts[1] ?? '')), scale: parts[1]?.length ?? 0 };
}
function display({ coefficient, scale }) {
  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, '0');
  let result = scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits;
  if (scale) result = result.replace(/0+$/, '').replace(/\.$/, '');
  return (negative && coefficient !== 0n ? '-' : '') + result;
}
function align(left, right) {
  const a = decimal(left), b = decimal(right), scale = Math.max(a.scale, b.scale);
  return { a: a.coefficient * 10n ** BigInt(scale - a.scale), b: b.coefficient * 10n ** BigInt(scale - b.scale), scale };
}
export function addDecimal(left, right) { const { a, b, scale } = align(left, right); return display({ coefficient: a + b, scale }); }
export function subtractDecimal(left, right) { const { a, b, scale } = align(left, right); return display({ coefficient: a - b, scale }); }
export function multiplyDecimal(left, right) { const a = decimal(left), b = decimal(right); return display({ coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale }); }

export function normalizeConsumerBook(value) {
  fields(value, ['name', 'customerReference', 'currency', 'positions', 'quality'], 'configuration');
  const currency = value.currency ?? 'USD';
  if (!['USD', 'XLM'].includes(currency)) fail('CONSUMER_CURRENCY_INVALID', 'Choose USD or XLM.');
  if (!Array.isArray(value.positions) || !value.positions.length || value.positions.length > 1000) fail('CONSUMER_POSITIONS_INVALID', 'Provide 1–1000 exact assets and decimal-string quantities.');
  const assets = new Set();
  const positions = value.positions.map((position, index) => {
    fields(position, ['asset', 'quantity', 'label'], 'position ' + (index + 1));
    const asset = parseAssetIdentifier(position.asset).identifier;
    if (assets.has(asset)) fail('CONSUMER_ASSET_DUPLICATE', 'Combine quantities for the repeated exact asset: ' + asset);
    assets.add(asset);
    decimal(position.quantity, { negative: false, digits: 60, scale: 30 });
    return { asset, quantity: position.quantity, label: text(position.label ?? '', 200, 'position label') };
  });
  const quality = value.quality ?? {};
  fields(quality, ['maxAgeSeconds', 'allowCarried', 'allowOlder', 'allowUnknown'], 'quality');
  const maxAgeSeconds = quality.maxAgeSeconds ?? 7200;
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 2592000) fail('CONSUMER_AGE_INVALID', 'The price age target must be 1–2592000 seconds.');
  const normalizedQuality = { maxAgeSeconds };
  for (const [key, fallback] of Object.entries({ allowCarried: true, allowOlder: false, allowUnknown: false })) {
    const selected = quality[key] ?? fallback;
    if (typeof selected !== 'boolean') fail('CONSUMER_POLICY_INVALID', key + ' must be true or false.');
    normalizedQuality[key] = selected;
  }
  return { name: text(value.name, 200, 'customer name', true), customerReference: text(value.customerReference ?? '', 300, 'customer reference'), currency, positions, quality: normalizedQuality };
}

function priceRow(position, quote, receipt, missing, config, evaluatedAt) {
  const flags = [];
  const add = (code, message, blocking = true) => flags.push({ code, message, blocking });
  let unitPrice = null, ageSeconds = null;
  if (!quote) add(missing?.code ?? 'NOT_REQUESTED', missing?.message ?? 'This asset was not requested by the selected collection.');
  else {
    const field = config.currency === 'USD' ? 'price_usd' : 'price_xlm';
    try {
      const number = decimal(quote[field], { negative: false, digits: 128, scale: 60 });
      if (number.coefficient === 0n) add('NO_PRICE_SENTINEL', 'The provider returned its zero sentinel for an unavailable price.');
      else unitPrice = quote[field];
    } catch { add('PRICE_DECIMAL_INVALID', 'The retained provider price is not a usable nonnegative decimal string.'); }
    if (quote.price_status === 'unpriced') add('UNPRICED', 'The source explicitly reports no priced observation.');
    else if (quote.price_status === 'carried') add('CARRIED', 'A newer price-forming observation remains unpriced by the provider.', !config.quality.allowCarried);
    else if (quote.price_status !== 'priced') add('STATUS_UNKNOWN', 'The provider has not specified a recognized price status.', !config.quality.allowUnknown);
    const observed = Date.parse(quote.as_of ?? '');
    if (!Number.isFinite(observed)) add('AGE_UNKNOWN', 'The original price observation time is unavailable.', !config.quality.allowUnknown);
    else {
      const difference = (Date.parse(evaluatedAt) - observed) / 1000;
      if (difference < -300) add('OBSERVATION_IN_FUTURE', 'The source price time is more than five minutes after this edition was evaluated.');
      ageSeconds = Math.max(0, Math.floor(difference));
      if (ageSeconds > config.quality.maxAgeSeconds) add('OLDER_THAN_TARGET', 'The observation is older than the saved customer price-age target.', !config.quality.allowOlder);
    }
    if (config.currency === 'XLM') add('INDEPENDENT_XLM_CLOCK', 'The provider divides by an independently dated XLM/USD close; as_of bounds the USD observation only.', false);
  }
  const available = unitPrice !== null && !flags.some(flag => flag.blocking);
  return {
    ...clone(position), currency: config.currency, priceField: config.currency === 'USD' ? 'price_usd' : 'price_xlm',
    unitPrice, value: available ? multiplyDecimal(position.quantity, unitPrice) : null,
    availability: available ? 'valued' : 'unavailable', flags, ageSeconds,
    asOf: quote?.as_of ?? null, updatedAt: quote?.updated_at ?? null,
    priceStatus: quote?.price_status ?? null, method: quote?.method ?? null,
    source: receipt ? clone(receipt) : null, providerPrice: quote ? clone(quote) : null,
  };
}

export function compareConsumerEditions(previous, current) {
  if (!previous) return null;
  if (previous.consumerId !== current.consumerId || previous.workspaceId !== current.workspaceId) fail('CONSUMER_COMPARISON_INVALID', 'Compare editions from the same original customer and workspace.');
  const before = new Map(previous.rows.map(row => [row.asset, row]));
  const after = new Map(current.rows.map(row => [row.asset, row]));
  const sameCurrency = previous.currency === current.currency;
  let comparableValueDelta = '0';
  const rows = [...new Set([...before.keys(), ...after.keys()])].map(asset => {
    const old = before.get(asset), row = after.get(asset);
    const bothValued = sameCurrency && old?.value !== null && old?.value !== undefined && row?.value !== null && row?.value !== undefined;
    const valueDelta = bothValued ? subtractDecimal(row.value, old.value) : null;
    if (valueDelta !== null) comparableValueDelta = addDecimal(comparableValueDelta, valueDelta);
    const quantityDelta = old && row ? subtractDecimal(row.quantity, old.quantity) : null;
    const priceDelta = sameCurrency && old?.unitPrice !== null && old?.unitPrice !== undefined && row?.unitPrice !== null && row?.unitPrice !== undefined ? subtractDecimal(row.unitPrice, old.unitPrice) : null;
    const status = !old ? 'added' : !row ? 'removed' : !sameCurrency ? 'currency_changed' : old.value === null && row.value !== null ? 'became_available' : old.value !== null && row.value === null ? 'became_unavailable' : old.value === row.value && old.quantity === row.quantity && old.unitPrice === row.unitPrice ? 'value_unchanged' : 'value_changed';
    return {
      asset, status, previousQuantity: old?.quantity ?? null, quantity: row?.quantity ?? null,
      previousValue: old?.value ?? null, value: row?.value ?? null, quantityDelta, priceDelta, valueDelta,
      quantityEffect: bothValued ? multiplyDecimal(quantityDelta, old.unitPrice) : null,
      priceEffect: bothValued ? multiplyDecimal(row.quantity, priceDelta) : null,
      observationChanged: old?.asOf !== row?.asOf,
      qualityChanged: canonical(old?.flags ?? []) !== canonical(row?.flags ?? []),
      previousAsOf: old?.asOf ?? null, asOf: row?.asOf ?? null,
    };
  });
  return {
    previousEditionId: previous.id, previousEditionSha256: previous.sha256, sameCurrency,
    previousCurrency: previous.currency, currency: current.currency,
    totalDelta: sameCurrency && previous.totals.complete && current.totals.complete ? subtractDecimal(current.totals.total, previous.totals.total) : null,
    comparableValueDelta: sameCurrency ? comparableValueDelta : null,
    comparedValuedPositions: rows.filter(row => row.valueDelta !== null).length,
    rows,
  };
}

async function captureEditionSource({ run, plan, readResponse, config, evaluatedAt }) {
  const quotes = new Map(), missing = new Map(), sourceByAsset = new Map(), requested = new Set(), tasks = [];
  const selected = run.tasks.filter(task => ['price', 'batch'].includes(task.kind));
  if (!selected.length) fail('CONSUMER_SOURCE_INVALID', 'Choose a retained collection with current batch or individual price requests.');
  for (const task of selected) {
    const planned = plan.tasks.find(item => item.id === task.id);
    if (!planned || planned.kind !== task.kind || canonical(planned.request) !== canonical(task.request) || planned.asset !== task.asset) fail('CONSUMER_SOURCE_CHANGED', 'The retained price task differs from its immutable request plan.', 409);
    const assets = task.kind === 'batch' ? task.request?.body?.assets : [task.asset];
    if (!Array.isArray(assets) || !assets.length) fail('CONSUMER_SOURCE_INVALID', 'The saved price request has no exact asset list.', 409);
    const requestedHere = new Set(assets.map(value => parseAssetIdentifier(value).identifier));
    for (const asset of requestedHere) {
      if (requested.has(asset)) fail('CONSUMER_SOURCE_AMBIGUOUS', 'The selected collection has more than one current-price request for ' + asset + '.', 409);
      requested.add(asset);
    }
    const attempt = [...task.attempts].reverse().find(item => item.response) ?? task.attempts.at(-1) ?? null;
    const source = {
      runId: run.id, taskId: task.id, kind: task.kind, taskState: task.state,
      attemptId: attempt?.id ?? null, receivedAt: attempt?.receivedAt ?? null,
      status: attempt?.status ?? null, request: clone(task.request),
      response: attempt?.response ? clone(attempt.response) : null,
    };
    tasks.push(source);
    for (const asset of requestedHere) sourceByAsset.set(asset, source);
    if (task.state !== 'COMPLETE' || !attempt?.response || attempt.classification?.kind !== 'success' || attempt.status < 200 || attempt.status >= 300) {
      for (const asset of requestedHere) missing.set(asset, { code: task.state === 'ERROR' ? 'REQUEST_FAILED' : 'REQUEST_INCOMPLETE', message: 'The selected native request has no completed successful price response.' });
      continue;
    }
    let data;
    try { data = JSON.parse((await readResponse(attempt.response)).toString('utf8')); }
    catch (error) { if (error instanceof WorkbenchError) throw error; fail('CONSUMER_SOURCE_INVALID', 'The saved source response cannot be parsed.', 409); }
    const validation = await validateProviderResponse(task.kind, data);
    if (!validation.valid) fail('CONSUMER_SOURCE_INVALID', 'The original saved response does not match the delivered provider contract.', 409);
    const rows = task.kind === 'batch' ? data.prices : [data], absent = task.kind === 'batch' ? data.not_found : [], returned = new Set();
    for (const quote of rows) {
      const asset = parseAssetIdentifier(quote.asset).identifier;
      if (!requestedHere.has(asset) || returned.has(asset)) fail('CONSUMER_SOURCE_AMBIGUOUS', 'The original price response repeats an asset or names an asset outside its request.', 409);
      returned.add(asset); quotes.set(asset, quote);
    }
    for (const value of absent) {
      const asset = parseAssetIdentifier(value).identifier;
      if (!requestedHere.has(asset) || returned.has(asset)) fail('CONSUMER_SOURCE_AMBIGUOUS', 'The original not_found list conflicts with its request or price rows.', 409);
      returned.add(asset); missing.set(asset, { code: 'NOT_FOUND', message: 'The provider listed this exact asset in not_found.' });
    }
    for (const asset of requestedHere) if (!returned.has(asset)) missing.set(asset, { code: 'NOT_RETURNED', message: 'The response omitted this requested asset from both prices and not_found.' });
  }
  const rows = config.positions.map(position => priceRow(position, quotes.get(position.asset), sourceByAsset.get(position.asset), missing.get(position.asset), config, evaluatedAt));
  let subtotal = '0';
  for (const row of rows) if (row.value !== null) subtotal = addDecimal(subtotal, row.value);
  const unavailable = rows.filter(row => row.value === null).length;
  const received = tasks.map(task => task.receivedAt).filter(value => value && Number.isFinite(Date.parse(value))).sort();
  return {
    rows, totals: { currency: config.currency, positions: rows.length, valuedPositions: rows.length - unavailable, unavailablePositions: unavailable, complete: unavailable === 0, pricedSubtotal: subtotal, total: unavailable === 0 ? subtotal : null },
    source: { runId: run.id, planId: run.planId, planSha256: plan.sha256, runState: run.status, providerOrigin: plan.configuration.baseUrl, selectedRunCreatedAt: run.createdAt, firstReceivedAt: received[0] ?? null, lastReceivedAt: received.at(-1) ?? null, selection: 'only-this-retained-run', tasks },
  };
}

function editionSummary(edition) {
  return { id: edition.id, sha256: edition.sha256, name: edition.name, createdAt: edition.createdAt, bookRevision: edition.bookRevision, sourceRunId: edition.source.runId, currency: edition.currency, totals: clone(edition.totals), previousEditionId: edition.previousEditionId };
}
function checkRevision(expected, head) {
  if (!Number.isSafeInteger(expected) || expected !== (head?.revision ?? 0)) fail('CONSUMER_REVISION_CONFLICT', 'The customer workspace changed. Reload its current revision before saving this operation.', 409);
}

/** Storage is owned by the existing workspace lock and its original write queue. */
export function createConsumerStore({ root, queue, readWorkspace, getRun, getPlan, readResponse }) {
  const folder = join(root, 'consumers');
  const consumerPath = consumerId => join(folder, id(consumerId));
  async function readJson(path) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) fail('CONSUMER_FILE_INVALID', 'A retained consumer entry is not a regular file.', 409);
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code) throw error; fail('CONSUMER_RECORD_INVALID', 'A retained consumer record is not valid JSON.', 409); }
  }
  async function parentDirectories(path) {
    const relative = path.slice(root.length + 1).split('/');
    let current = root;
    for (const part of relative.slice(0, -1)) {
      current = join(current, part);
      try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) fail('CONSUMER_FILE_INVALID', 'Consumer storage must remain inside regular workspace directories.', 409);
    }
  }
  async function immutable(path, record) {
    await parentDirectories(path);
    const encoded = JSON.stringify(record, null, 2) + '\n';
    const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(encoded); await handle.sync(); }
    finally { await handle.close(); }
    try {
      try { await link(temporary, path); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (await readFile(path, 'utf8') !== encoded) fail('CONSUMER_IMMUTABLE_CONFLICT', 'This saved consumer record already has different content.', 409);
      }
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async function existingRecord(path, schema) {
    try { return verify(await readJson(path), schema, 'Uncommitted consumer record'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function writeHead(head) {
    const path = join(consumerPath(head.consumerId), 'head.json');
    await parentDirectories(path);
    const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(seal(head), null, 2) + '\n'); await handle.sync(); }
    catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    finally { await handle.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async function head(consumerId, optional = false) {
    let value;
    try { value = await readJson(join(consumerPath(consumerId), 'head.json')); }
    catch (error) { if (optional && error.code === 'ENOENT') return null; if (error.code === 'ENOENT') fail('CONSUMER_MISSING', 'The selected customer is not in this workspace.', 404); throw error; }
    verify(value, CONSUMER_SCHEMA, 'Customer workspace');
    const workspace = await readWorkspace();
    if (value.consumerId !== consumerId || value.workspaceId !== workspace.id || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.editions) || !Array.isArray(value.reviews)) fail('CONSUMER_RECORD_INVALID', 'The customer pointer does not belong to this workspace.', 409);
    for (const entry of [value.book, ...value.editions, ...value.reviews]) {
      if (!object(entry) || typeof entry.sha256 !== 'string') fail('CONSUMER_RECORD_INVALID', 'A retained consumer pointer is invalid.', 409);
      id(entry.id, 'record ID');
    }
    if (new Set(value.editions.map(row => row.id)).size !== value.editions.length || new Set(value.reviews.map(row => row.id)).size !== value.reviews.length || (value.publishedEditionId && !value.editions.some(row => row.id === value.publishedEditionId))) fail('CONSUMER_RECORD_INVALID', 'The customer edition list is inconsistent.', 409);
    return value;
  }
  async function retained(consumerId, category, pointer, schema) {
    const record = verify(await readJson(join(consumerPath(consumerId), category, id(pointer.id) + '.json')), schema, 'Saved ' + category);
    if (record.consumerId !== consumerId || record.id !== pointer.id || record.sha256 !== pointer.sha256) fail('CONSUMER_RECORD_CHANGED', 'A saved consumer record differs from its active pointer.', 409);
    return record;
  }
  const book = current => retained(current.consumerId, 'books', current.book, BOOK_SCHEMA);
  async function getEdition({ consumerId, editionId }, current) {
    current ??= await head(consumerId);
    const pointer = current.editions.find(entry => entry.id === editionId);
    if (!pointer) fail('CONSUMER_EDITION_MISSING', 'The selected edition is not saved for this customer.', 404);
    return retained(consumerId, 'editions', pointer, EDITION_SCHEMA);
  }
  async function inspect({ consumerId }) {
    const current = await head(consumerId), saved = await book(current);
    return { schema: CONSUMER_SCHEMA, workspaceId: current.workspaceId, consumerId, revision: current.revision, createdAt: current.createdAt, updatedAt: current.updatedAt, book: saved, editions: current.editions.map(entry => clone(entry.summary)), publishedEditionId: current.publishedEditionId, reviews: await Promise.all(current.reviews.map(pointer => retained(consumerId, 'reviews', pointer, REVIEW_SCHEMA))) };
  }
  async function list() {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const rows = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) fail('CONSUMER_FILE_INVALID', 'Consumer storage contains an unexpected entry.', 409);
      const current = await head(entry.name, true);
      if (!current) continue; // An unfinished first immutable write has no committed customer pointer.
      const saved = await book(current);
      rows.push({ consumerId: current.consumerId, name: saved.configuration.name, customerReference: saved.configuration.customerReference, currency: saved.configuration.currency, revision: current.revision, bookRevision: saved.revision, positions: saved.configuration.positions.length, editions: current.editions.length, latestEdition: current.editions.at(-1)?.summary ?? null, publishedEditionId: current.publishedEditionId, updatedAt: current.updatedAt });
    }
    return rows;
  }
  async function save({ consumerId, expectedRevision, configuration }) {
    id(consumerId);
    return queue(async () => {
      const config = normalizeConsumerBook(configuration), prior = await head(consumerId, true);
      checkRevision(expectedRevision, prior);
      const workspace = await readWorkspace(), oldBook = prior ? await book(prior) : null;
      if (oldBook && canonical(oldBook.configuration) === canonical(config)) return inspect({ consumerId });
      const createdAt = now(), revision = (oldBook?.revision ?? 0) + 1;
      const bookId = 'book-' + String(revision).padStart(8, '0') + '-' + digest(Buffer.from(canonical(config))).slice(0, 12);
      const bookPath = join(consumerPath(consumerId), 'books', bookId + '.json');
      let saved = await existingRecord(bookPath, BOOK_SCHEMA);
      if (saved && (saved.consumerId !== consumerId || saved.workspaceId !== workspace.id || saved.revision !== revision || canonical(saved.configuration) !== canonical(config) || canonical(saved.previousBook) !== canonical(prior?.book ?? null))) fail('CONSUMER_IMMUTABLE_CONFLICT', 'The uncommitted asset book belongs to different input.', 409);
      saved ??= seal({ schema: BOOK_SCHEMA, id: bookId, consumerId, workspaceId: workspace.id, revision, createdAt, previousBook: prior?.book ?? null, configuration: config });
      await immutable(bookPath, saved);
      const { sha256: discarded, ...existing } = prior ?? {};
      await writeHead({ ...existing, schema: CONSUMER_SCHEMA, consumerId, workspaceId: workspace.id, revision: (prior?.revision ?? 0) + 1, createdAt: prior?.createdAt ?? createdAt, updatedAt: createdAt, book: { id: saved.id, sha256: saved.sha256 }, editions: prior?.editions ?? [], reviews: prior?.reviews ?? [], publishedEditionId: prior?.publishedEditionId ?? null });
      return inspect({ consumerId });
    });
  }
  async function createEdition({ consumerId, expectedRevision, sourceRunId, name = '', note = '', operationId }) {
    id(consumerId); id(sourceRunId, 'sourceRunId'); text(operationId, 200, 'operationId', true);
    name = text(name, 200, 'edition name'); note = text(note, 2000, 'edition note');
    const input = { consumerId, expectedRevision, sourceRunId, name, note, operationId };
    const inputSha256 = digest(Buffer.from(canonical(input)));
    return queue(async () => {
      const current = await head(consumerId);
      const recordId = 'edition-' + digest(Buffer.from(operationId)).slice(0, 32);
      const existing = current.editions.find(entry => entry.id === recordId);
      if (existing) {
        const edition = await getEdition({ consumerId, editionId: recordId }, current);
        if (edition.inputSha256 !== inputSha256) fail('CONSUMER_OPERATION_CONFLICT', 'The edition operationId was already used with different input.', 409);
        return { replayed: true, consumer: await inspect({ consumerId }), edition };
      }
      checkRevision(expectedRevision, current);
      const recovered = await existingRecord(join(consumerPath(consumerId), 'editions', recordId + '.json'), EDITION_SCHEMA);
      if (recovered) {
        if (recovered.inputSha256 !== inputSha256 || recovered.consumerId !== consumerId || recovered.workspaceId !== current.workspaceId || recovered.bookSha256 !== current.book.sha256 || recovered.previousEditionId !== (current.editions.at(-1)?.id ?? null)) fail('CONSUMER_OPERATION_CONFLICT', 'The uncommitted edition belongs to different input or an earlier customer state.', 409);
        const { sha256: discarded, ...next } = current;
        await writeHead({ ...next, revision: current.revision + 1, updatedAt: now(), editions: [...current.editions, { id: recovered.id, sha256: recovered.sha256, summary: editionSummary(recovered) }] });
        return { replayed: true, consumer: await inspect({ consumerId }), edition: recovered };
      }
      const saved = await book(current), run = await getRun(sourceRunId), plan = await getPlan(run.planId), workspace = await readWorkspace();
      const createdAt = now();
      const data = await captureEditionSource({ run, plan, readResponse, config: saved.configuration, evaluatedAt: createdAt });
      const previous = current.editions.length ? await getEdition({ consumerId, editionId: current.editions.at(-1).id }, current) : null;
      const body = {
        schema: EDITION_SCHEMA, id: recordId, consumerId, workspaceId: workspace.id,
        operationId, inputSha256, name: name || saved.configuration.name + ' / ' + run.name, note, createdAt,
        bookId: saved.id, bookSha256: saved.sha256, bookRevision: saved.revision,
        customerReference: saved.configuration.customerReference, currency: saved.configuration.currency,
        quality: clone(saved.configuration.quality), previousEditionId: previous?.id ?? null,
        contractSha256: workspace.contractSha256, ...data,
      };
      const edition = seal({ ...body, comparison: compareConsumerEditions(previous, body) });
      await immutable(join(consumerPath(consumerId), 'editions', edition.id + '.json'), edition);
      const { sha256: discarded, ...next } = current;
      await writeHead({ ...next, revision: current.revision + 1, updatedAt: createdAt, editions: [...current.editions, { id: edition.id, sha256: edition.sha256, summary: editionSummary(edition) }] });
      return { replayed: false, consumer: await inspect({ consumerId }), edition };
    });
  }
  async function review({ consumerId, expectedRevision, editionId, decision, reviewedBy, note = '' }) {
    id(consumerId); id(editionId, 'editionId');
    if (!['publish', 'reject'].includes(decision)) fail('CONSUMER_REVIEW_INVALID', 'Choose publish or reject.');
    reviewedBy = text(reviewedBy, 200, 'reviewedBy', true); note = text(note, 2000, 'review note');
    return queue(async () => {
      const current = await head(consumerId); checkRevision(expectedRevision, current);
      const edition = await getEdition({ consumerId, editionId }, current);
      if (decision === 'publish' && edition.bookSha256 !== current.book.sha256) fail('CONSUMER_BOOK_CHANGED', 'Create an edition using the current saved customer configuration before publishing it.', 409);
      const createdAt = now();
      const record = seal({ schema: REVIEW_SCHEMA, id: 'review-' + randomBytes(12).toString('hex'), consumerId, workspaceId: current.workspaceId, editionId, editionSha256: edition.sha256, decision, reviewedBy, note, createdAt });
      await immutable(join(consumerPath(consumerId), 'reviews', record.id + '.json'), record);
      const { sha256: discarded, ...next } = current;
      await writeHead({ ...next, revision: current.revision + 1, updatedAt: createdAt, reviews: [...current.reviews, { id: record.id, sha256: record.sha256 }], publishedEditionId: decision === 'publish' ? editionId : current.publishedEditionId === editionId ? null : current.publishedEditionId });
      return { consumer: await inspect({ consumerId }), review: record };
    });
  }
  async function output({ consumerId, editionId, format = 'json' }) {
    if (!['json', 'csv'].includes(format)) fail('CONSUMER_FORMAT_INVALID', 'Choose JSON or CSV.');
    const current = await head(consumerId);
    const selected = editionId ?? current.publishedEditionId;
    if (!selected) fail('CONSUMER_PUBLICATION_MISSING', 'Publish a reviewed edition or select an exact saved edition.', 409);
    const edition = await getEdition({ consumerId, editionId: selected }, current);
    const reviews = await Promise.all(current.reviews.map(pointer => retained(consumerId, 'reviews', pointer, REVIEW_SCHEMA)));
    const savedBook = await retained(consumerId, 'books', { id: edition.bookId, sha256: edition.bookSha256 }, BOOK_SCHEMA);
    const value = seal({ schema: VALUES_SCHEMA, consumerId, workspaceId: current.workspaceId, customerRevision: current.revision, publicationState: current.publishedEditionId === selected ? 'published' : 'saved-edition', currentBookMatches: current.book.sha256 === edition.bookSha256, book: clone(savedBook), edition: clone(edition), review: reviews.filter(item => item.editionId === selected).at(-1) ?? null });
    if (format === 'json') return value;
    return { filename: consumerId + '-' + selected + '.csv', contentType: 'text/csv; charset=utf-8', content: consumerCsv(value) };
  }
  async function verifyAll() {
    for (const consumer of await list()) {
      const current = await head(consumer.consumerId); await book(current);
      for (const pointer of current.editions) {
        const edition = await getEdition({ consumerId: consumer.consumerId, editionId: pointer.id }, current);
        for (const task of edition.source.tasks) if (task.response) await readResponse(task.response);
        await retained(consumer.consumerId, 'books', { id: edition.bookId, sha256: edition.bookSha256 }, BOOK_SCHEMA);
      }
      for (const pointer of current.reviews) await retained(consumer.consumerId, 'reviews', pointer, REVIEW_SCHEMA);
    }
  }
  return Object.freeze({ list, inspect, getEdition, save, createEdition, review, output, verifyAll });
}

export function verifyConsumerValues(value) {
  verify(value, VALUES_SCHEMA, 'Consumer values');
  const edition = verify(value.edition, EDITION_SCHEMA, 'Consumer edition');
  const savedBook = verify(value.book, BOOK_SCHEMA, 'Consumer asset book');
  if (savedBook.consumerId !== value.consumerId || savedBook.workspaceId !== value.workspaceId || savedBook.id !== edition.bookId || savedBook.sha256 !== edition.bookSha256) fail('CONSUMER_VALUES_INVALID', 'The asset book belongs to another edition.', 409);
  if (edition.consumerId !== value.consumerId || edition.workspaceId !== value.workspaceId) fail('CONSUMER_VALUES_INVALID', 'Consumer values have inconsistent customer identity.', 409);
  if (value.review) {
    verify(value.review, REVIEW_SCHEMA, 'Consumer review');
    if (value.review.consumerId !== value.consumerId || value.review.workspaceId !== value.workspaceId || value.review.editionId !== edition.id || value.review.editionSha256 !== edition.sha256) fail('CONSUMER_VALUES_INVALID', 'The review belongs to another edition.', 409);
  }
  if (value.publicationState === 'published' && value.review?.decision !== 'publish') fail('CONSUMER_VALUES_INVALID', 'Published values require the retained publish decision.', 409);
  return clone(value);
}

const csvCell = value => {
  const string = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const guarded = /^[=+@\t\r]/.test(string) || (/^-/.test(string) && !/^-\d+(?:\.\d+)?$/.test(string)) ? "'" + string : string;
  return '"' + guarded.replaceAll('"', '""') + '"';
};
export function consumerCsv(value) {
  verifyConsumerValues(value);
  const columns = ['consumer_id', 'edition_id', 'currency', 'asset', 'label', 'quantity', 'unit_price', 'value', 'availability', 'price_status', 'method', 'as_of', 'updated_at', 'age_seconds_at_evaluation', 'evaluated_at', 'run_id', 'task_id', 'response_sha256', 'flags'];
  const rows = value.edition.rows.map(row => [
    value.consumerId, value.edition.id, row.currency, row.asset, row.label, row.quantity, row.unitPrice, row.value, row.availability, row.priceStatus, row.method, row.asOf, row.updatedAt, row.ageSeconds, value.edition.createdAt, row.source?.runId, row.source?.taskId, row.source?.response?.sha256, row.flags,
  ]);
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
