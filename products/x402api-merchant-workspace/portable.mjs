// MIT. Complete private handover of the existing merchant and its retained files.
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath, readdir, rename, readFile, chmod } from 'node:fs/promises';
import { dirname, basename, resolve, relative, join, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { operationLease } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { validateConfig } from './workspace.mjs';
import { fileBinding } from './fulfillment/file-delivery.mjs';
import { inspectMerchantReservations, restoreMerchantReservations } from './portable-reservations.mjs';

const PRODUCT = 'products/x402api-merchant-workspace';
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_FILES = [
  "products/x402api-merchant-workspace/workspace.mjs",
  "products/x402api-merchant-workspace/server.mjs",
  "products/x402api-merchant-workspace/store.mjs",
  "products/x402api-merchant-workspace/observations.mjs",
  "products/x402api-merchant-workspace/OBSERVATIONS.md",
  "products/x402api-merchant-workspace/provider.mjs",
  "products/x402api-merchant-workspace/protocol.mjs",
  "products/x402api-merchant-workspace/web/index.html",
  "products/x402api-merchant-workspace/web/style.css",
  "products/x402api-merchant-workspace/web/app.mjs",
  "products/x402api-merchant-workspace/fulfillment/file-delivery.mjs",
  "products/x402api-merchant-workspace/config.example.json",
  "products/x402api-merchant-workspace/README.md",
  "products/x402api-merchant-workspace/RECEIVING.md",
  "stellar/scf-starforge-20261009/distribution/contributions/x402api-merchant.json",
  "stellar/scf-starforge-20261009/sf31-buyer-client/response-file.mjs",
  "stellar/scf-starforge-20261009/sf31-buyer-client/response-stream.mjs",
  "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/result.mjs",
  "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs",
  "products/x402api-merchant-workspace/fixtures/protocol-fixture.mjs",
  "products/x402api-merchant-workspace/native-receiving.mjs",
  "products/x402api-merchant-workspace/run-native-receiving.py",
  "products/x402api-merchant-workspace/receive-native-source.py",
  "products/x402api-merchant-workspace/NATIVE_RECEIVING.md",
  "products/x402api-merchant-workspace/portable.mjs",
  "products/x402api-merchant-workspace/web/portable.js",
  "products/x402api-merchant-workspace/web/portable.css",
  "products/x402api-merchant-workspace/PORTABLE.md",
  "products/x402api-merchant-workspace/portable-receiving.mjs",
  "products/x402api-merchant-workspace/receive-portable-native.py",
  "products/x402api-merchant-workspace/portable-reservations.mjs",
  "products/x402api-merchant-workspace/application-inputs.mjs",
  "products/x402api-merchant-workspace/application-provider.mjs",
  "products/x402api-merchant-workspace/managed-application.mjs",
  "products/x402api-merchant-workspace/package.json",
  "products/x402api-merchant-workspace/OPERATING.md",
  "products/x402api-merchant-workspace/INSTALLED_RECEIVING.md",
  "products/x402api-merchant-workspace/INSTALLED_FOREGROUND.md",
  "stellar/scf-starforge-20261009/distribution/runtime-profile.mjs",
  "stellar/scf-starforge-20261009/distribution/specification.mjs",
  "stellar/scf-starforge-20261009/distribution/product-package.mjs",
  "stellar/scf-starforge-20261009/distribution/source-selection.mjs",
  "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs"
];
const SCHEMA = 'stellar-forge.x402api-merchant-handover.v1';
const RESTORE_SCHEMA = 'stellar-forge.x402api-merchant-restoration.v1';
const MAXIMUM_FILE = Number.MAX_SAFE_INTEGER;
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const need = (value, code, message) => { if (!value) fail(code, message); };
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const own = info => process.getuid === undefined || info.uid === process.getuid();
const same = (a,b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
  a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

const FILE_ADAPTER_ORIGINAL = Object.freeze({bytes:6737,sha256:'3251c490ed7bf16c146cf908abe14f51a4ecf054d387ba66f6648e6d1da28482'});
const FILE_ADAPTER_REVIEWED = Object.freeze({bytes:6994,sha256:'d8ef397d66201b13ef9c2a79929807b87989ba7593eee13d231f282b2735da89'});
const sameIdentity = (a,b) => a.bytes === b.bytes && a.sha256 === b.sha256;
function fileAdapterAdoption(selected, current) {
  const unchanged = sameIdentity(selected,current);
  const reviewedManifest = sameIdentity(selected,FILE_ADAPTER_ORIGINAL) && sameIdentity(current,FILE_ADAPTER_REVIEWED);
  need(unchanged || reviewedManifest, 'MERCHANT_PORTABLE_FILE_DELIVERY_REQUIRED',
    'Use the maintained file-delivery adapter or its recorded original predecessor.');
  return {schema:'stellar-forge.merchant-file-adapter-adoption.v1',
    kind:unchanged ? 'same-source' : 'reviewed-delivery-manifest',
    original:{path:'original/fulfillment/file-delivery.mjs',bytes:selected.bytes,sha256:selected.sha256},
    operating:{path:'source/' + PRODUCT + '/fulfillment/file-delivery.mjs',bytes:current.bytes,sha256:current.sha256}};
}

function archivePath(value) {
  need(typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
    !isAbsolute(value) && !/[\\\u0000-\u001f\u007f]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..'),
    'MERCHANT_ARCHIVE_PATH_INVALID');
  return value;
}
function below(directory, path) {
  const selected = relative(directory, path);
  need(selected && selected !== '..' && !selected.startsWith('..' + sep) && !isAbsolute(selected),
    'MERCHANT_RETAINED_FILE_OUTSIDE_WORKSPACE');
  return archivePath(selected.split(sep).join('/'));
}
async function realDirectory(path, { private: requirePrivate = false } = {}) {
  need(isAbsolute(path) && resolve(path) === path, 'MERCHANT_ABSOLUTE_DIRECTORY_REQUIRED');
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path &&
    own(info) && (!requirePrivate || !(info.mode & 0o077)), 'MERCHANT_PRIVATE_DIRECTORY_REQUIRED');
  return path;
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function fileIdentity(path, maximum = MAXIMUM_FILE) {
  need(await realpath(dirname(path)) === dirname(path), 'MERCHANT_FILE_PARENT_CHANGED');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    need(before.isFile() && before.size <= maximum, 'MERCHANT_REGULAR_FILE_REQUIRED');
    const hash = createHash('sha256'), block = Buffer.allocUnsafe(256 * 1024);
    let position = 0;
    for (;;) {
      const result = await handle.read(block, 0, block.length, position);
      if (!result.bytesRead) break;
      hash.update(block.subarray(0, result.bytesRead)); position += result.bytesRead;
    }
    const after = await handle.stat();
    need(position === before.size && same(before, after), 'MERCHANT_FILE_CHANGED');
    return { bytes: position, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}
async function writeNew(path, bytes) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dirname(path));
  return { bytes: Buffer.byteLength(bytes), sha256: digest(bytes) };
}
async function copyOriginal(source, destination, expected = null) {
  need(await realpath(dirname(source)) === dirname(source), 'MERCHANT_FILE_PARENT_CHANGED');
  const input = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  let output;
  try {
    const before = await input.stat();
    need(before.isFile() && before.size <= MAXIMUM_FILE, 'MERCHANT_REGULAR_FILE_REQUIRED');
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    output = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const hash = createHash('sha256'), block = Buffer.allocUnsafe(256 * 1024); let position = 0;
    for (;;) {
      const result = await input.read(block, 0, block.length, position);
      if (!result.bytesRead) break;
      const bytes = block.subarray(0, result.bytesRead); hash.update(bytes);
      let written = 0;
      while (written < bytes.length) {
        const part = await output.write(bytes, written, bytes.length - written, position + written);
        need(part.bytesWritten > 0, 'MERCHANT_ARCHIVE_WRITE_INTERRUPTED'); written += part.bytesWritten;
      }
      position += result.bytesRead;
    }
    const after = await input.stat(), identity = { bytes: position, sha256: hash.digest('hex') };
    need(position === before.size && same(before, after), 'MERCHANT_FILE_CHANGED');
    if (expected) need(identity.bytes === expected.bytes && identity.sha256 === expected.sha256,
      'MERCHANT_RETAINED_FILE_CHANGED');
    await output.sync(); await syncDirectory(dirname(destination));
    return identity;
  } finally { if (output) await output.close(); await input.close(); }
}
async function filesIn(directory, prefix = '') {
  const found = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = archivePath(prefix + entry.name);
    if (entry.isDirectory()) found.push(...await filesIn(join(directory, entry.name), path + '/'));
    else { need(entry.isFile() && !entry.isSymbolicLink(), 'MERCHANT_ARCHIVE_REGULAR_MEMBERS_REQUIRED'); found.push(path); }
  }
  return found;
}
function openDatabase(path, readOnly = true) {
  const database = new DatabaseSync(path, { readOnly, enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false, allowExtension: false });
  try {
    database.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA temp_store=MEMORY;');
    need(database.prepare('PRAGMA application_id').get().application_id === 0x58344d31 &&
      database.prepare('PRAGMA user_version').get().user_version === 1, 'MERCHANT_ARCHIVE_DATABASE_SCHEMA_CHANGED');
    need(database.prepare('PRAGMA integrity_check').all().every(row => row.integrity_check === 'ok') &&
      database.prepare('PRAGMA foreign_key_check').all().length === 0, 'MERCHANT_ARCHIVE_DATABASE_DAMAGED');
    return database;
  } catch (error) { database.close(); throw error; }
}
export function databaseIdentity(database) {
  const hash = createHash('sha256'), counts = {};
  const tables = database.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  for (const table of tables) {
    hash.update(json(table));
    const columns = database.prepare('PRAGMA table_info(' + quote(table.name) + ')').all();
    const keys = columns.filter(column => column.pk).sort((a,b) => a.pk - b.pk).map(column => column.name);
    if (!keys.length) keys.push(...columns.map(column => column.name));
    const statement = database.prepare('SELECT * FROM ' + quote(table.name) + ' ORDER BY ' + keys.map(quote).join(','));
    statement.setReadBigInts(true);
    let count = 0;
    for (const row of statement.iterate()) {
      for (const column of columns) {
        const value = row[column.name];
        const body = value instanceof Uint8Array ? Buffer.from(value) :
          Buffer.from(value === null ? '' : String(value), 'utf8');
        hash.update(JSON.stringify([column.name, value === null ? 'null' : value instanceof Uint8Array ? 'blob' : typeof value, body.length]) + '\n');
        hash.update(body);
      }
      count++;
    }
    counts[table.name] = count;
  }
  const metadata = database.prepare('SELECT * FROM merchant_meta WHERE singleton=1').get();
  need(metadata && metadata.schema_version === 1, 'MERCHANT_ARCHIVE_DATABASE_SCHEMA_CHANGED');
  return { storeId: metadata.store_id, createdAt: metadata.created_at, logicalSha256: hash.digest('hex'), counts };
}
async function outputReservation(destination) {
  need(isAbsolute(destination) && resolve(destination) === destination, 'MERCHANT_ABSOLUTE_OUTPUT_REQUIRED');
  const parent = dirname(destination); await realDirectory(parent);
  need(!((await lstat(parent)).mode & 0o022), 'MERCHANT_OWNED_OUTPUT_PARENT_REQUIRED');
  const lease = await operationLease(join(parent, '.' + basename(destination) + '.handover-owner.lock'));
  return { lease, parent };
}
async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
const tableJSON = (database, table, order) => database.prepare('SELECT * FROM ' + quote(table) + ' ORDER BY ' + order).all()
  .map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,
    value instanceof Uint8Array ? { encoding: 'base64', bytes: value.byteLength, sha256: digest(value), value: Buffer.from(value).toString('base64') } : value])));

async function projectRecords(database, stage, mappings) {
  const orders = [], allHistory = tableJSON(database, 'merchant_history', 'sequence');
  const allEvents = tableJSON(database, 'merchant_events', 'created_at,delivery_id');
  const exchanges = [];
  for (const row of database.prepare('SELECT * FROM merchant_exchanges ORDER BY sequence').iterate()) {
    const selected = { ...row };
    if (selected.raw !== null) {
      const raw = Buffer.from(selected.raw);
      need(raw.length === selected.raw_bytes && digest(raw) === selected.raw_sha256, 'MERCHANT_EXCHANGE_BYTES_CHANGED');
      const path = 'records/exchanges/' + selected.sequence + '.bin';
      await writeNew(join(stage, path), raw); selected.raw = { path, bytes: raw.length, sha256: selected.raw_sha256 };
    }
    exchanges.push(selected);
  }
  for (const row of database.prepare('SELECT * FROM merchant_orders ORDER BY created_at,id').iterate()) {
    const selected = { ...row };
    for (const name of ['charge_request', 'signature']) {
      if (selected[name] !== null) {
        const raw = Buffer.from(selected[name]), path = 'records/orders/' + row.id + '/' + name + '.bin';
        const expected = name === 'signature' ? row.signature_sha256 : row.charge_request_sha256;
        need(digest(raw) === expected, 'MERCHANT_ORIGINAL_REQUEST_CHANGED');
        await writeNew(join(stage,path), raw); selected[name] = { path, bytes: raw.length, sha256: expected };
      }
    }
    const fulfillment = database.prepare('SELECT * FROM merchant_fulfillments WHERE order_id=?').get(row.id);
    if (fulfillment?.returned !== null && fulfillment?.returned !== undefined) {
      const raw = Buffer.from(fulfillment.returned);
      need(raw.length === fulfillment.returned_bytes && digest(raw) === fulfillment.returned_sha256,
        'MERCHANT_FULFILLMENT_BYTES_CHANGED');
      const result = mappings.find(mapping => mapping.orderId === row.id);
      const path = result?.relativePath ?? 'records/orders/' + row.id + '/fulfillment-return.bin';
      if (!result) await writeNew(join(stage,path), raw);
      else need(result.bytes === raw.length && result.sha256 === fulfillment.returned_sha256, 'MERCHANT_FULFILLMENT_RESULT_CHANGED');
      fulfillment.returned = { path, bytes: raw.length, sha256: fulfillment.returned_sha256 };
    }
    const record = { order: selected, fulfillment: fulfillment ?? null,
      history: allHistory.filter(item => item.order_id === row.id),
      exchanges: exchanges.filter(item => item.order_id === row.id),
      events: allEvents.filter(item => item.order_id === row.id) };
    const recordPath = 'records/orders/' + row.id + '/record.json'; await writeNew(join(stage,recordPath), json(record));
    const state = JSON.parse(row.data_json), identity = JSON.parse(row.charge_identity_json);
    orders.push({ id: row.id, reference: row.reference, title: row.title, state: row.state,
      createdAt: row.created_at, updatedAt: row.updated_at, paymentId: state.paymentId ?? identity.paymentId ?? null,
      chargeId: identity.charge_id ?? state.charge?.charge_id ?? null, recordPath,
      history: record.history.map(item => ({ sequence: item.sequence, kind: item.kind, at: item.created_at, details: JSON.parse(item.data_json) })),
      exchanges: record.exchanges.map(item => ({ sequence: item.sequence, kind: item.kind, status: item.status,
        complete: item.response_complete === 1, at: item.created_at, raw: item.raw })),
      result: mappings.find(mapping => mapping.orderId === row.id) ?? null });
  }
  await writeNew(join(stage,'records/events.json'), json(allEvents));
  return orders;
}
function operatorHTML() {
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">' +
    '<title>Merchant handover</title><link rel="stylesheet" href="operator/portable.css"></head><body>' +
    '<header><p class="eyebrow">X402API · MERCHANT OPERATIONS</p><h1>Merchant handover</h1><p id="edition"></p></header>' +
    '<main><section class="summary" aria-label="Handover summary"><div><span>Invoices</span><strong id="invoice-count"></strong></div>' +
    '<div><span>Completed</span><strong id="completed-count"></strong></div><div><span>Retained files</span><strong id="result-count"></strong></div></section>' +
    '<nav aria-label="Complete handover files"><a href="workspace/merchant.sqlite3" download>Full business database</a>' +
    '<a href="MANIFEST.json" download>Original archive manifest</a><a href="source/' + PRODUCT + '/PORTABLE.md">Operator guide</a></nav>' +
    '<section aria-labelledby="invoices-heading"><div class="section-heading"><h2 id="invoices-heading">Invoices</h2>' +
    '<label>Find invoice<input id="search" type="search" placeholder="Reference, title or payment"></label></div><div id="invoices"></div></section>' +
    '<section id="detail" hidden aria-labelledby="detail-heading"><div class="section-heading"><h2 id="detail-heading"></h2><button id="close-detail" type="button">Close details</button></div><div id="detail-content"></div></section>' +
    '<footer><p>Open the retained files and original history from this complete handover. Restore the workspace with the included operator guide.</p><p id="store-id"></p></footer></main>' +
    '<script src="operator/data.js"></script><script src="operator/portable.js"></script></body></html>\n';
}

export async function exportMerchant({ directory, configPath, output, allowLoopback = false, originalRoot = null, retainedRoot = null }) {
  await realDirectory(directory, { private: true });
  need(output !== directory && !output.startsWith(directory + sep), 'MERCHANT_EXPORT_OUTSIDE_WORKSPACE_REQUIRED');
  need(isAbsolute(configPath), 'MERCHANT_ABSOLUTE_CONFIG_REQUIRED');
  need((originalRoot === null) === (retainedRoot === null), 'MERCHANT_COMPLETE_RELOCATION_PAIR_REQUIRED');
  if (originalRoot !== null) {
    need(isAbsolute(originalRoot) && resolve(originalRoot) === originalRoot, 'MERCHANT_ORIGINAL_ROOT_REQUIRED');
    await realDirectory(retainedRoot, { private: true });
    below(retainedRoot, directory); below(retainedRoot, configPath);
  }
  const translate = path => originalRoot !== null && (path === originalRoot || path.startsWith(originalRoot + sep))
    ? resolve(retainedRoot, relative(originalRoot, path)) : path;
  const recordedDirectory = originalRoot === null ? directory : resolve(originalRoot, relative(retainedRoot,directory));
  const reserved = await outputReservation(output);
  let owner, database;
  try {
    owner = await operationLease(join(directory,'merchant-owner.lock'));
    const originalConfig = await readFile(configPath);
    need(originalConfig.length <= 1048576, 'MERCHANT_CONFIG_TOO_LARGE');
    const config = validateConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(originalConfig)), { allowLoopback });
    const originalDatabase = join(directory,'merchant.sqlite3');
    const databaseFile = await lstat(originalDatabase);
    need(databaseFile.isFile() && !databaseFile.isSymbolicLink() && databaseFile.nlink === 1 &&
      own(databaseFile) && !(databaseFile.mode & 0o077), 'MERCHANT_PRIVATE_DATABASE_REQUIRED');
    database = openDatabase(originalDatabase);
    const identity = databaseIdentity(database);
    const reservations = await inspectMerchantReservations({database,directory,recordedDirectory});
    const originalModule = translate(resolve(dirname(configPath),config.fulfillmentModule));
    const selectedModule = await fileIdentity(originalModule);
    const builtIn = await fileIdentity(join(SOURCE_ROOT,PRODUCT,'fulfillment/file-delivery.mjs'));
    const fulfillmentAdapter = fileAdapterAdoption(selectedModule,builtIn);
    if (await exists(output)) {
      const old = await inspectMerchantArchive({ bundle: output });
      need(old.manifest.original.logicalSha256 === identity.logicalSha256 &&
        old.manifest.original.directory === recordedDirectory &&
        old.manifest.original.receivedDirectory === directory &&
        old.manifest.original.configPath === configPath &&
        old.manifest.original.configSha256 === digest(originalConfig) &&
        JSON.stringify(old.manifest.reservationMappings) === JSON.stringify(reservations), 'MERCHANT_EXPORT_DESTINATION_IN_USE');
      for (const path of SOURCE_FILES) {
        const actual = await fileIdentity(join(SOURCE_ROOT,path));
        const previous = old.manifest.files.find(item => item.path === 'source/' + path);
        need(previous && previous.bytes === actual.bytes && previous.sha256 === actual.sha256, 'MERCHANT_EXPORT_SOURCE_CHANGED');
      }
      const skip = new Set(['merchant-owner.lock','merchant.sqlite3','merchant.sqlite3-wal','merchant.sqlite3-shm','merchant.sqlite3-journal']);
      const currentFiles = (await filesIn(directory)).filter(path => !skip.has(path));
      const retainedFiles = old.manifest.files.filter(file => file.path.startsWith('workspace/') &&
        file.path !== 'workspace/merchant.sqlite3');
      need(currentFiles.length === retainedFiles.length, 'MERCHANT_EXPORT_WORKSPACE_CHANGED');
      for (const path of currentFiles) {
        const actual = await fileIdentity(join(directory,path));
        const previous = retainedFiles.find(file => file.path === 'workspace/' + path);
        need(previous && actual.bytes === previous.bytes && actual.sha256 === previous.sha256,
          'MERCHANT_EXPORT_WORKSPACE_CHANGED');
      }
      const adapter = old.manifest.files.find(file => file.path === fulfillmentAdapter.original.path);
      need(adapter && sameIdentity(selectedModule,adapter) &&
        JSON.stringify(old.manifest.fulfillmentAdapter) === JSON.stringify(fulfillmentAdapter),
        'MERCHANT_EXPORT_FULFILLMENT_CHANGED');
      const manifestPath = translate(resolve(dirname(configPath),config.fulfillmentOptions?.manifest ?? ''));
      const manifestBytes = await readFile(manifestPath);
      const previousManifest = old.manifest.files.find(file => file.path === 'original/delivery-manifest.json');
      need(previousManifest && manifestBytes.length === previousManifest.bytes &&
        digest(manifestBytes) === previousManifest.sha256, 'MERCHANT_EXPORT_DELIVERY_EDITION_CHANGED');
      const delivery = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));
      for (const [binding,selected] of Object.entries(delivery.files)) {
        need(binding === fileBinding(selected), 'MERCHANT_DELIVERY_BINDING_CHANGED');
        const actual = await fileIdentity(translate(resolve(dirname(manifestPath),selected.path)));
        const previous = old.manifest.files.find(file => file.path === 'fulfillment/files/' + binding.slice(7) + '/' + selected.fileName);
        need(previous && actual.bytes === selected.bytes && actual.sha256 === selected.sha256 &&
          actual.bytes === previous.bytes && actual.sha256 === previous.sha256, 'MERCHANT_EXPORT_DELIVERY_EDITION_CHANGED');
      }
      return { ...old.summary, directory: output, alreadyExported: true };
    }
    const stage = join(reserved.parent, '.' + basename(output) + '.building-' + randomUUID());
    await mkdir(stage,{mode:0o700});
    await mkdir(join(stage,'workspace'),{mode:0o700});
    const snapshot = join(stage,'workspace/merchant.sqlite3');
    await writeNew(snapshot, Buffer.alloc(0)); await backup(database,snapshot); await chmod(snapshot,0o600);
    const snapshotHandle = await open(snapshot,'r+'); try { await snapshotHandle.sync(); } finally { await snapshotHandle.close(); }
    const reopened = openDatabase(snapshot,false);
    try { reopened.exec('PRAGMA journal_mode=DELETE;'); need(databaseIdentity(reopened).logicalSha256 === identity.logicalSha256, 'MERCHANT_DATABASE_BACKUP_CHANGED'); }
    finally { reopened.close(); }
    const skip = new Set(['merchant-owner.lock','merchant.sqlite3','merchant.sqlite3-wal','merchant.sqlite3-shm','merchant.sqlite3-journal']);
    for (const path of await filesIn(directory)) if (!skip.has(path)) await copyOriginal(join(directory,path),join(stage,'workspace',path));
    for (const path of SOURCE_FILES) await copyOriginal(join(SOURCE_ROOT,path),join(stage,'source',path));
    await copyOriginal(originalModule,join(stage,fulfillmentAdapter.original.path),selectedModule);
    const originalManifestPath = translate(resolve(dirname(configPath),config.fulfillmentOptions?.manifest ?? ''));
    const originalManifestBytes = await readFile(originalManifestPath);
    need(originalManifestBytes.length <= 1048576, 'MERCHANT_DELIVERY_MANIFEST_TOO_LARGE');
    const delivery = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(originalManifestBytes));
    need(delivery.schema === 'stellar-forge.merchant-file-delivery.v1' &&
      delivery.files && typeof delivery.files === 'object' && !Array.isArray(delivery.files), 'MERCHANT_DELIVERY_MANIFEST_INVALID');
    const retainedDelivery = structuredClone(delivery);
    for (const [binding, selected] of Object.entries(delivery.files)) {
      need(binding === fileBinding(selected), 'MERCHANT_DELIVERY_BINDING_CHANGED');
      const path = 'files/' + binding.slice(7) + '/' + selected.fileName;
      await copyOriginal(translate(resolve(dirname(originalManifestPath),selected.path)),join(stage,'fulfillment',path),selected);
      retainedDelivery.files[binding].path = path;
    }
    need(Object.hasOwn(delivery.files, config.fulfillmentBinding), 'MERCHANT_CURRENT_DELIVERY_MISSING');
    for (const row of database.prepare('SELECT frozen_json FROM merchant_orders').iterate())
      need(Object.hasOwn(delivery.files,JSON.parse(row.frozen_json).fulfillmentBinding), 'MERCHANT_ORIGINAL_DELIVERY_EDITION_MISSING');
    await writeNew(join(stage,'original/merchant.configuration.json'),originalConfig);
    await writeNew(join(stage,'original/delivery-manifest.json'),originalManifestBytes);
    await writeNew(join(stage,'fulfillment/manifest.json'),json(retainedDelivery));
    const relocatedConfig = structuredClone(config);
    relocatedConfig.fulfillmentModule = '../source/' + PRODUCT + '/fulfillment/file-delivery.mjs';
    relocatedConfig.fulfillmentOptions = { ...config.fulfillmentOptions, manifest: '../fulfillment/manifest.json' };
    await writeNew(join(stage,'configuration/merchant.json'),json(relocatedConfig));
    const mappings = [];
    for (const row of database.prepare('SELECT id,data_json FROM merchant_orders ORDER BY id').iterate()) {
      const selected = JSON.parse(row.data_json).result;
      const fulfillment = database.prepare('SELECT payment_id,state,result_file_json FROM merchant_fulfillments WHERE order_id=?').get(row.id);
      const returned = fulfillment?.result_file_json ? JSON.parse(fulfillment.result_file_json) : null;
      if (!selected && !returned) continue;
      // A retained fulfillment commits before the invoice's COMPLETE update.
      // Preserve that valid interrupted state and relocate only existing fields.
      need(returned && (!selected || selected.path === returned.path && selected.bytes === returned.bytes &&
        selected.sha256 === returned.sha256), 'MERCHANT_RESULT_BINDING_CHANGED');
      const retained = selected ?? returned;
      const path = 'workspace/' + below(recordedDirectory,retained.path);
      const actual = await fileIdentity(join(stage,path));
      need(actual.bytes === retained.bytes && actual.sha256 === retained.sha256, 'MERCHANT_PAID_RESULT_CHANGED');
      mappings.push({ orderId:row.id, paymentId:fulfillment.payment_id, originalPath:retained.path, relativePath:path,
        orderResultPresent:Boolean(selected),fulfillmentResultPresent:true,
        bytes:retained.bytes,sha256:retained.sha256,contentType:retained.contentType,fileName:retained.fileName });
    }
    const orders = await projectRecords(database,stage,mappings);
    await copyOriginal(join(SOURCE_ROOT,PRODUCT,'web/portable.js'),join(stage,'operator/portable.js'));
    await copyOriginal(join(SOURCE_ROOT,PRODUCT,'web/portable.css'),join(stage,'operator/portable.css'));
    const createdAt = new Date().toISOString(), data = { ...identity,schema:SCHEMA,createdAt,storeCreatedAt:identity.createdAt,orders };
    await writeNew(join(stage,'operator/data.js'),'globalThis.MerchantHandover = ' + JSON.stringify(data) + ';\n');
    await writeNew(join(stage,'index.html'),operatorHTML());
    const files = [];
    for (const path of await filesIn(stage)) files.push({path,...await fileIdentity(join(stage,path))});
    need(databaseIdentity(database).logicalSha256 === identity.logicalSha256, 'MERCHANT_SOURCE_CHANGED_DURING_EXPORT');
    const manifest = { schema:SCHEMA,createdAt,application:'x402api-merchant-workspace',
      original:{...identity,directory:recordedDirectory,receivedDirectory:directory,configPath,configSha256:digest(originalConfig)},
      entrypoint:'index.html',configuration:'configuration/merchant.json',database:'workspace/merchant.sqlite3',
      sourceEntrypoint:'source/' + PRODUCT + '/server.mjs',fulfillmentAdapter,
      resultMappings:mappings,reservationMappings:reservations,files };
    await writeNew(join(stage,'MANIFEST.json'),json(manifest)); await syncDirectory(stage);
    need(!(await exists(output)), 'MERCHANT_EXPORT_DESTINATION_IN_USE');
    await rename(stage,output); await syncDirectory(reserved.parent);
    const complete = await inspectMerchantArchive({bundle:output});
    return {...complete.summary,directory:output,alreadyExported:false};
  } finally {
    try { if (database) database.close(); } finally {
      try { if (owner) await owner.close(); } finally { await reserved.lease.close(); }
    }
  }
}
export async function inspectMerchantArchive({ bundle, expectedSha256 = null }) {
  await realDirectory(bundle);
  const raw = await readFile(join(bundle,'MANIFEST.json'));
  need(raw.length <= 16 * 1024 * 1024, 'MERCHANT_ARCHIVE_MANIFEST_TOO_LARGE');
  const manifestSha256 = digest(raw);
  if (expectedSha256 !== null) need(/^[a-f0-9]{64}$/.test(expectedSha256) && expectedSha256 === manifestSha256,
    'MERCHANT_ARCHIVE_MANIFEST_CHANGED');
  const manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  need(manifest.schema === SCHEMA && Array.isArray(manifest.files) &&
    manifest.database === 'workspace/merchant.sqlite3' && manifest.configuration === 'configuration/merchant.json' &&
    manifest.sourceEntrypoint === 'source/' + PRODUCT + '/server.mjs' &&
    Array.isArray(manifest.resultMappings) && Array.isArray(manifest.reservationMappings), 'MERCHANT_ARCHIVE_MANIFEST_INVALID');
  const unique = new Set();
  for (const selected of manifest.files) {
    archivePath(selected.path);
    need(selected.path !== 'MANIFEST.json' && !unique.has(selected.path) && Number.isSafeInteger(selected.bytes) &&
      selected.bytes >= 0 && /^[a-f0-9]{64}$/.test(selected.sha256), 'MERCHANT_ARCHIVE_INVENTORY_INVALID');
    unique.add(selected.path);
    const actual = await fileIdentity(join(bundle,selected.path));
    need(actual.bytes === selected.bytes && actual.sha256 === selected.sha256, 'MERCHANT_ARCHIVE_MEMBER_CHANGED');
  }
  const observed = (await filesIn(bundle)).filter(path => path !== 'MANIFEST.json');
  need(observed.length === unique.size && observed.every(path => unique.has(path)), 'MERCHANT_ARCHIVE_INVENTORY_CHANGED');
  for (const path of [manifest.database,manifest.configuration,manifest.sourceEntrypoint,'index.html','original/merchant.configuration.json'])
    need(unique.has(path), 'MERCHANT_ARCHIVE_MEMBER_MISSING');
  const originalAdapter = manifest.files.find(file => file.path === 'original/fulfillment/file-delivery.mjs');
  if (originalAdapter || manifest.fulfillmentAdapter !== undefined) {
    const adoption = manifest.fulfillmentAdapter;
    need(adoption && typeof adoption === 'object' && adoption.original && adoption.operating,
      'MERCHANT_ARCHIVE_ADAPTER_ADOPTION_INVALID');
    const operatingAdapter = manifest.files.find(file => file.path === 'source/' + PRODUCT + '/fulfillment/file-delivery.mjs');
    need(originalAdapter && operatingAdapter &&
      JSON.stringify(adoption) === JSON.stringify(fileAdapterAdoption(originalAdapter,operatingAdapter)),
      'MERCHANT_ARCHIVE_ADAPTER_ADOPTION_CHANGED');
  }
  const database = openDatabase(join(bundle,manifest.database));
  let identity;
  try {
    identity = databaseIdentity(database);
    need(identity.storeId === manifest.original.storeId && identity.logicalSha256 === manifest.original.logicalSha256,
      'MERCHANT_ARCHIVE_ORIGINAL_STORE_CHANGED');
    const reservations = await inspectMerchantReservations({database,directory:join(bundle,'workspace'),
      recordedDirectory:manifest.original.directory});
    need(JSON.stringify(reservations) === JSON.stringify(manifest.reservationMappings),
      'MERCHANT_ARCHIVE_RESERVATION_MAPPING_CHANGED');
    for (const mapping of manifest.resultMappings) {
      archivePath(mapping.relativePath);
      need(mapping.relativePath === 'workspace/' + below(manifest.original.directory,mapping.originalPath), 'MERCHANT_ARCHIVE_RESULT_PATH_CHANGED');
      const selected = manifest.files.find(file => file.path === mapping.relativePath);
      need(selected && selected.bytes === mapping.bytes && selected.sha256 === mapping.sha256, 'MERCHANT_ARCHIVE_RESULT_CHANGED');
    }
  } finally { database.close(); }
  return { manifest, summary:{schema:SCHEMA,manifestSha256,storeId:identity.storeId,
    logicalSha256:identity.logicalSha256,files:manifest.files.length,bytes:manifest.files.reduce((sum,file)=>sum+file.bytes,0),
    invoices:identity.counts.merchant_orders,results:manifest.resultMappings.length,
    reservations:manifest.reservationMappings.length,counts:identity.counts} };
}
export async function restoreMerchant({ bundle, directory, expectedSha256 = null }) {
  need(directory !== bundle && !directory.startsWith(bundle + sep), 'MERCHANT_RESTORE_OUTSIDE_ARCHIVE_REQUIRED');
  const inspected = await inspectMerchantArchive({bundle,expectedSha256}), manifest = inspected.manifest;
  const reserved = await outputReservation(directory);
  try {
    if (await exists(directory)) {
      await realDirectory(directory,{private:true});
      const previous = JSON.parse(await readFile(join(directory,'RESTORE.json'),'utf8'));
      need(previous.schema === RESTORE_SCHEMA && previous.sourceManifestSha256 === inspected.summary.manifestSha256 &&
        previous.directory === directory && previous.storeId === manifest.original.storeId &&
        previous.workspace === join(directory,'workspace') &&
        previous.configPath === join(directory,manifest.configuration) &&
        previous.server === join(directory,manifest.sourceEntrypoint), 'MERCHANT_RESTORE_DESTINATION_IN_USE');
      await realDirectory(previous.workspace,{private:true});
      await fileIdentity(previous.configPath); await fileIdentity(previous.server);
      const currentFile = await lstat(join(previous.workspace,'merchant.sqlite3'));
      need(currentFile.isFile() && !currentFile.isSymbolicLink() && currentFile.nlink === 1 &&
        own(currentFile) && !(currentFile.mode & 0o077), 'MERCHANT_RESTORED_DATABASE_CHANGED');
      const current = openDatabase(join(previous.workspace,'merchant.sqlite3'));
      try {
        const metadata = current.prepare('SELECT store_id,schema_version FROM merchant_meta WHERE singleton=1').get();
        need(metadata?.schema_version === 1, 'MERCHANT_ARCHIVE_DATABASE_SCHEMA_CHANGED');
        need(metadata.store_id === previous.storeId, 'MERCHANT_RESTORED_STORE_CHANGED');
      } finally { current.close(); }
      return {...previous,alreadyRestored:true};
    }
    const stage = join(reserved.parent,'.' + basename(directory) + '.receiving-' + randomUUID());
    await mkdir(stage,{mode:0o700});
    for (const file of manifest.files) await copyOriginal(join(bundle,file.path),join(stage,file.path),file);
    await copyOriginal(join(bundle,'MANIFEST.json'),join(stage,'MANIFEST.json'),await fileIdentity(join(bundle,'MANIFEST.json')));
    const database = openDatabase(join(stage,manifest.database),false);
    const relocations=[];
    try {
      database.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
      for (const mapping of manifest.resultMappings) {
        const row = database.prepare('SELECT data_json FROM merchant_orders WHERE id=?').get(mapping.orderId);
        const fulfillment = database.prepare('SELECT result_file_json FROM merchant_fulfillments WHERE payment_id=? AND order_id=?').get(mapping.paymentId,mapping.orderId);
        need(row && fulfillment, 'MERCHANT_RESTORE_RESULT_IDENTITY_CHANGED');
        const orderData = JSON.parse(row.data_json), resultData=JSON.parse(fulfillment.result_file_json);
        need(Boolean(orderData.result) === (mapping.orderResultPresent ?? true) &&
          (!orderData.result || orderData.result.path === mapping.originalPath) && resultData?.path === mapping.originalPath &&
          (mapping.fulfillmentResultPresent ?? true) === true, 'MERCHANT_RESTORE_ORIGINAL_PATH_CHANGED');
        const path = join(directory,mapping.relativePath);
        if (orderData.result) {
          orderData.result.path = path;
          database.prepare('UPDATE merchant_orders SET data_json=? WHERE id=?').run(JSON.stringify(orderData),mapping.orderId);
        }
        resultData.path = path;
        database.prepare('UPDATE merchant_fulfillments SET result_file_json=? WHERE payment_id=?').run(JSON.stringify(resultData),mapping.paymentId);
        relocations.push({orderId:mapping.orderId,paymentId:mapping.paymentId,from:mapping.originalPath,to:path,
          bytes:mapping.bytes,sha256:mapping.sha256});
      }
      database.exec('COMMIT');
      need(database.prepare('PRAGMA foreign_key_check').all().length===0,'MERCHANT_RESTORED_DATABASE_DAMAGED');
    } catch(error) {try{database.exec('ROLLBACK');}catch{}throw error;} finally {database.close();}
    const reservationRelocations = await restoreMerchantReservations({stage,directory,reservations:manifest.reservationMappings});
    const restoration={schema:RESTORE_SCHEMA,sourceManifestSha256:inspected.summary.manifestSha256,storeId:manifest.original.storeId,
      directory,restoredAt:new Date().toISOString(),workspace:join(directory,'workspace'),
      configPath:join(directory,manifest.configuration),server:join(directory,manifest.sourceEntrypoint),relocations,reservationRelocations};
    await writeNew(join(stage,'RESTORE.json'),json(restoration)); await syncDirectory(stage);
    need(!(await exists(directory)), 'MERCHANT_RESTORE_DESTINATION_IN_USE');
    await rename(stage,directory); await syncDirectory(reserved.parent);
    return {...restoration,alreadyRestored:false};
  } finally {await reserved.lease.close();}
}
export async function startMerchantArchiveServer({bundle,host='127.0.0.1',port=8764,expectedSha256=null}) {
  need(['127.0.0.1','::1','localhost'].includes(host),'MERCHANT_ARCHIVE_LOOPBACK_REQUIRED');
  need(Number.isInteger(port) && port >= 0 && port <= 65535,'MERCHANT_ARCHIVE_PORT_INVALID');
  const inspected=await inspectMerchantArchive({bundle,expectedSha256});
  const allowed=new Map(inspected.manifest.files.map(file=>[file.path,file]));
  allowed.set('MANIFEST.json',await fileIdentity(join(bundle,'MANIFEST.json')));
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
  const server=createServer((request,response)=>{
    // data.js contains private invoice/history records. Restrict both authority
    // and cross-origin embedding before any inventoried member is read.
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Frame-Options','DENY');
    const deny=(status,code)=>{
      response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
      response.end(request.method==='HEAD'?undefined:JSON.stringify({error:code}));
    };
    (async()=>{
      const hostHeaders=[];
      for(let index=0;index<request.rawHeaders.length;index+=2)
        if(request.rawHeaders[index].toLowerCase()==='host')hostHeaders.push(request.rawHeaders[index+1]);
      if(hostHeaders.length!==1){deny(400,'MERCHANT_ARCHIVE_AUTHORITY_REQUIRED');return;}
      const address=server.address();
      if(!address||typeof address==='string'||!['127.0.0.1','::1'].includes(address.address)){
        deny(503,'MERCHANT_ARCHIVE_NOT_LISTENING');return;
      }
      const literal=address.address.includes(':')?'['+address.address+']':address.address;
      const authorities=new Set([literal+':'+address.port,'localhost:'+address.port]);
      if(address.port===80){authorities.add(literal);authorities.add('localhost');}
      if(!authorities.has(hostHeaders[0].toLowerCase())){
        deny(421,'MERCHANT_ARCHIVE_AUTHORITY_NOT_ALLOWED');return;
      }
      if(typeof request.url!=='string'||!request.url.startsWith('/')||request.url.startsWith('//')){
        deny(400,'MERCHANT_ARCHIVE_REQUEST_TARGET_INVALID');return;
      }
      if(request.method!=='GET'&&request.method!=='HEAD'){
        response.setHeader('Allow','GET, HEAD');deny(405,'MERCHANT_ARCHIVE_METHOD_NOT_ALLOWED');return;
      }
      const url=new URL(request.url,'http://archive.local');
      const path=url.pathname==='/'?'index.html':archivePath(decodeURIComponent(url.pathname.slice(1)));
      const selected=allowed.get(path);
      if(!selected||url.search){response.writeHead(404);response.end();return;}
      const actual=await fileIdentity(join(bundle,path));
      need(actual.bytes===selected.bytes&&actual.sha256===selected.sha256,'MERCHANT_ARCHIVE_MEMBER_CHANGED');
      const extension=/\.[^./]+$/.exec(path)?.[0]??'';
      response.writeHead(200,{'Content-Type':types[extension]??'application/octet-stream',
        'Content-Length':String(selected.bytes),'X-Content-SHA256':selected.sha256,
        ...(path.startsWith('workspace/')||path.endsWith('.bin')?{'Content-Disposition':'attachment; filename="'+basename(path)+'"'}:{})});
      if(request.method==='HEAD'){response.end();return;}
      const file=await open(join(bundle,path),constants.O_RDONLY|constants.O_NOFOLLOW);
      try{await pipeline(file.createReadStream({autoClose:false}),response);}finally{await file.close();}
    })().catch(error=>{if(response.headersSent)response.destroy(error);else{response.writeHead(409,{'Content-Type':'application/json'});response.end(JSON.stringify({error:error.code??'MERCHANT_ARCHIVE_READ_FAILED'}));}});
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);accept();});});
  const address=server.address();
  if(!address||typeof address==='string'||!['127.0.0.1','::1'].includes(address.address)){
    await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
    fail('MERCHANT_ARCHIVE_LOOPBACK_REQUIRED');
  }
  const url='http://'+(address.address.includes(':')?'['+address.address+']':address.address)+':'+address.port;
  return {server,url,summary:inspected.summary,async close(){server.closeIdleConnections();await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));}};
}
export async function portableCommand(command,values) {
  if(command==='export'){
    need(values.directory&&values.config&&values.output,'USE_EXPORT_WITH_DIRECTORY_CONFIG_AND_OUTPUT');
    return exportMerchant({directory:resolve(values.directory),configPath:resolve(values.config),output:resolve(values.output),allowLoopback:values['allow-loopback'],
      originalRoot:values['original-root']?resolve(values['original-root']):null,
      retainedRoot:values['retained-root']?resolve(values['retained-root']):null});
  }
  need(values.bundle,'MERCHANT_HANDOVER_BUNDLE_REQUIRED');
  const input={bundle:resolve(values.bundle),expectedSha256:values['expected-sha256']??null};
  if(command==='inspect')return (await inspectMerchantArchive(input)).summary;
  if(command==='restore'){need(values.directory,'MERCHANT_RESTORE_DIRECTORY_REQUIRED');return restoreMerchant({...input,directory:resolve(values.directory)});}
  need(command==='serve-archive'&&/^(0|[1-9][0-9]{0,4})$/.test(values.port),'MERCHANT_ARCHIVE_COMMAND_INVALID');
  const host=await startMerchantArchiveServer({...input,host:values.host,port:Number(values.port)});
  let closing=null;const stop=()=>{closing??=host.close().catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'MERCHANT_ARCHIVE_CLOSE_FAILED'})+'\n');process.exitCode=1;});};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  return {...host.summary,url:host.url};
}
