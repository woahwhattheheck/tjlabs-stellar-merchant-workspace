// MIT. Durable business state for the x402api merchant application.
// x402api remains the payment authority. This store records its verified
// identifiers and original bytes; it never interprets a signature as payment.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, lstatSync, fsyncSync } from 'node:fs';
import { mkdir, realpath, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { operationLease } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

const VERSION = 1;
const APPLICATION_ID = 0x58344d31;
const SCHEMA = 'stellar-forge.x402api-merchant-store.v1';
const OPEN_TOKEN = Symbol('MerchantStore.open');
const now = () => new Date().toISOString();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function fail(code, message, status = 409) {
  throw Object.assign(new Error(message), { code, status });
}
function need(value, code, message, status) {
  if (!value) fail(code, message, status);
}
function identifier(value, label) {
  need(typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0'),
    'MERCHANT_IDENTIFIER_INVALID', 'Use the original ' + label + '.', 400);
  need(Buffer.from(value, 'utf8').toString('utf8') === value,
    'MERCHANT_IDENTIFIER_INVALID', 'Keep the original valid UTF-8 ' + label + '.', 400);
  return value;
}
function text(value, label, maximum = 4096) {
  need(typeof value === 'string' && value.length <= maximum && !value.includes('\0'),
    'MERCHANT_TEXT_INVALID', 'Use a complete valid ' + label + '.', 400);
  need(Buffer.from(value, 'utf8').toString('utf8') === value,
    'MERCHANT_TEXT_INVALID', 'Use valid UTF-8 text for ' + label + '.', 400);
  return value;
}
function canonical(value, active = new Set(), depth = 0) {
  need(depth <= 64, 'MERCHANT_JSON_DEPTH', 'The business record exceeds 64 JSON levels.', 400);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string') text(value, 'JSON string', Number.MAX_SAFE_INTEGER);
    return value;
  }
  if (typeof value === 'number') {
    need(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)),
      'MERCHANT_JSON_NUMBER', 'Keep large integers and exact commercial amounts as strings.', 400);
    return value;
  }
  need(Array.isArray(value) || plain(value), 'MERCHANT_JSON_REQUIRED', 'Use complete JSON business data.', 400);
  need(!active.has(value), 'MERCHANT_JSON_CYCLE', 'A business record cannot contain a cycle.', 400);
  active.add(value);
  let result;
  if (Array.isArray(value)) {
    result = [];
    for (let i = 0; i < value.length; i++) {
      need(Object.hasOwn(value, i), 'MERCHANT_JSON_REQUIRED', 'Keep every original array value.', 400);
      result.push(canonical(value[i], active, depth + 1));
    }
  } else {
    result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = canonical(value[key], active, depth + 1);
  }
  active.delete(value);
  return result;
}
const encoded = value => JSON.stringify(canonical(value));
const decoded = value => value === null ? null : JSON.parse(value);
function bytes(value, label) {
  if (typeof value === 'string') return Buffer.from(text(value, label, Number.MAX_SAFE_INTEGER), 'utf8');
  need(value instanceof Uint8Array, 'MERCHANT_BYTES_REQUIRED', 'Keep the exact ' + label + ' bytes.', 400);
  return Buffer.from(value);
}
function safeNumber(value, label) {
  const result = typeof value === 'bigint' ? Number(value) : value;
  need(Number.isSafeInteger(result) && result >= 0,
    'MERCHANT_INTEGER_RANGE', 'The original ' + label + ' exceeds the supported metadata range.');
  return result;
}
function sameInode(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.isFile() && b.isFile() &&
    a.nlink === 1 && b.nlink === 1;
}
function checkFile(info, label) {
  need(info.isFile() && info.nlink === 1 && !(info.mode & 0o077) &&
    (process.getuid === undefined || info.uid === process.getuid()),
    'MERCHANT_PRIVATE_FILE_REQUIRED', 'Keep the original private regular ' + label + '.');
}
function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
async function privateDirectory(path) {
  need(typeof path === 'string' && path === resolve(path) && !path.includes('\0'),
    'MERCHANT_DIRECTORY_REQUIRED', 'Select an absolute private merchant directory.', 400);
  let info;
  try { info = await lstat(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(path);
    need(parent !== path, 'MERCHANT_DIRECTORY_REQUIRED', 'Select an existing private directory parent.', 400);
    try { await lstat(parent); }
    catch (parentError) {
      if (parentError.code !== 'ENOENT') throw parentError;
      await privateDirectory(parent);
    }
    need(await realpath(parent) === parent, 'MERCHANT_DIRECTORY_REQUIRED', 'Keep canonical directory components.', 400);
    try { await mkdir(path, { mode: 0o700 }); } catch (mkdirError) {
      if (mkdirError.code !== 'EEXIST') throw mkdirError;
    }
    info = await lstat(path);
  }
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path &&
    !(info.mode & 0o077) && (process.getuid === undefined || info.uid === process.getuid()),
    'MERCHANT_DIRECTORY_REQUIRED', 'Use the original private merchant directory owned by this operator.', 400);
  syncDirectory(path); syncDirectory(dirname(path));
  return path;
}

const SQL = [
  'CREATE TABLE merchant_meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL, store_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL) STRICT;',
  'CREATE TABLE merchant_runtimes (id TEXT PRIMARY KEY, opened_at TEXT NOT NULL, closed_at TEXT, state TEXT NOT NULL CHECK(state IN (\'OPEN\',\'CLOSED\',\'LEASE_ENDED\')), ended_observed_at TEXT) STRICT;',
  'CREATE TABLE merchant_orders (id TEXT PRIMARY KEY, reference TEXT NOT NULL, title TEXT NOT NULL, frozen_json TEXT NOT NULL, charge_request BLOB NOT NULL, charge_request_bytes INTEGER NOT NULL CHECK(charge_request_bytes>=0), charge_request_sha256 TEXT NOT NULL, charge_idempotency_key TEXT NOT NULL UNIQUE, signature BLOB, signature_encoding TEXT CHECK(signature_encoding IN (\'utf8\',\'bytes\')), signature_sha256 TEXT, charge_identity_json TEXT NOT NULL DEFAULT \'{}\', data_json TEXT NOT NULL DEFAULT \'{}\', state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;',
  'CREATE INDEX merchant_orders_reference ON merchant_orders(reference);',
  'CREATE INDEX merchant_orders_state ON merchant_orders(state,created_at,id);',
  'CREATE TABLE merchant_history (sequence INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES merchant_orders(id), kind TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;',
  'CREATE INDEX merchant_history_order ON merchant_history(order_id,sequence);',
  'CREATE TABLE merchant_exchanges (sequence INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES merchant_orders(id), kind TEXT NOT NULL, status INTEGER, headers_json TEXT NOT NULL, raw BLOB, raw_bytes INTEGER, raw_sha256 TEXT, response_complete INTEGER NOT NULL CHECK(response_complete IN (0,1)), error_json TEXT, created_at TEXT NOT NULL) STRICT;',
  'CREATE INDEX merchant_exchanges_order ON merchant_exchanges(order_id,sequence);',
  'CREATE TABLE merchant_events (delivery_id TEXT PRIMARY KEY, order_id TEXT REFERENCES merchant_orders(id), kind TEXT NOT NULL, event_json TEXT NOT NULL, raw BLOB NOT NULL, raw_bytes INTEGER NOT NULL CHECK(raw_bytes>=0), raw_sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN (\'PENDING\',\'COMPLETE\',\'REJECTED\')), details_json TEXT NOT NULL DEFAULT \'{}\', created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;',
  'CREATE INDEX merchant_events_pending ON merchant_events(state,created_at,delivery_id);',
  'CREATE TABLE merchant_fulfillments (payment_id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES merchant_orders(id), state TEXT NOT NULL CHECK(state IN (\'CLAIMED\',\'RUNNING\',\'INTERRUPTED\',\'RETURNED\',\'COMPLETE\')), owner_runtime TEXT REFERENCES merchant_runtimes(id), attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt>=0), run_kind TEXT CHECK(run_kind IN (\'FULFILL\',\'RECONCILE\')), interruption_json TEXT, returned BLOB, returned_bytes INTEGER, returned_sha256 TEXT, content_type TEXT, file_name TEXT, result_file_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK((returned IS NULL AND returned_bytes IS NULL AND returned_sha256 IS NULL) OR (returned IS NOT NULL AND returned_bytes>=0 AND returned_sha256 IS NOT NULL)), CHECK(state NOT IN (\'RETURNED\',\'COMPLETE\') OR returned IS NOT NULL), CHECK(state!=\'COMPLETE\' OR result_file_json IS NOT NULL)) STRICT;'
].join('\n');

const ORDER_COLUMNS = [
  'id','reference','title','frozen_json','charge_request_bytes','charge_request_sha256',
  'charge_idempotency_key','signature_encoding','signature_sha256','charge_identity_json',
  'data_json','state','created_at','updated_at'
].join(',');
const RESERVED = new Set([
  'id','reference','title','frozen','chargeRequestBytes','chargeRequestSha256','chargeIdempotencyKey',
  'signature','signatureBytes','signatureSha256','createdAt','updatedAt','fulfillment','schema','storeId'
]);
const CHARGE_IDENTIFIERS = [
  'charge_id','order_id','payment_identifier','request_fingerprint','resource_version_id','charge_digest'
];
const DIRECT_IDENTIFIERS = [
  'chargeId','providerOrderId','paymentIdentifier','requestFingerprint','resourceVersionId','chargeDigest','paymentId'
];
const PUBLIC_DATA = new Set([
  'state','chargeId','providerOrderId','paymentIdentifier','paymentId',
  'checkoutUrl','expiresAt','paidAt','fulfilledAt','paymentStatus'
]);

/**
 * One store instance owns its original kernel lease until close().
 * Drain the application's active handler promises before closing the store.
 * Mutating methods return private application records; HTTP handlers must use
 * getOrder(id) / getFulfillment(paymentId) for their public projection.
 */
export class MerchantStore {
  static async open(directory) {
    await privateDirectory(directory);
    const leasePath = join(directory, 'merchant-owner.lock');
    const lease = await operationLease(leasePath);
    let database = null, descriptor = null;
    try {
      const leaseInfo = fstatSync(lease.fd);
      checkFile(leaseInfo, 'merchant ownership lease');
      need(sameInode(leaseInfo, lstatSync(leasePath)), 'MERCHANT_OWNER_CHANGED', 'Keep the held original merchant lease.');
      const path = join(directory, 'merchant.sqlite3');
      let created = false;
      try {
        descriptor = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        descriptor = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
      }
      const before = fstatSync(descriptor);
      checkFile(before, 'merchant database');
      for (const suffix of ['-wal','-shm','-journal']) {
        try { checkFile(lstatSync(path + suffix), 'merchant database ' + suffix); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (created) { fsyncSync(descriptor); syncDirectory(directory); }
      database = new DatabaseSync(path, { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false });
      need(sameInode(before, lstatSync(path)) && sameInode(before, fstatSync(descriptor)),
        'MERCHANT_DATABASE_CHANGED', 'Keep the original selected database inode.');
      closeSync(descriptor); descriptor = null;
      database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-2048; PRAGMA mmap_size=0;');
      const mode = database.prepare('PRAGMA journal_mode=WAL').get();
      need(String(mode.journal_mode).toLowerCase() === 'wal',
        'MERCHANT_WAL_REQUIRED', 'Use storage that supports the original SQLite WAL.');
      database.exec('PRAGMA wal_autocheckpoint=256;');
      need(database.prepare('PRAGMA synchronous').get().synchronous === 2 &&
        database.prepare('PRAGMA foreign_keys').get().foreign_keys === 1,
        'MERCHANT_DURABILITY_REQUIRED', 'Keep SQLite FULL synchronization and foreign-key checks enabled.');
      const version = database.prepare('PRAGMA user_version').get().user_version;
      const application = database.prepare('PRAGMA application_id').get().application_id;
      const objects = database.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
      if (version === 0 && application === 0 && objects.length === 0) {
        database.exec('BEGIN IMMEDIATE');
        try {
          database.exec(SQL);
          database.prepare('INSERT INTO merchant_meta VALUES(1,?,?,?)').run(VERSION, randomUUID(), now());
          database.exec('PRAGMA user_version=1; PRAGMA application_id=' + APPLICATION_ID + '; COMMIT;');
        } catch (error) {
          try { database.exec('ROLLBACK'); } catch {}
          throw error;
        }
      } else {
        need(version === VERSION && application === APPLICATION_ID,
          'MERCHANT_SCHEMA_CHANGED', 'Open the original merchant store with its supported source edition.');
      }
      const metadata = database.prepare('SELECT * FROM merchant_meta WHERE singleton=1').get();
      need(metadata && metadata.schema_version === VERSION, 'MERCHANT_SCHEMA_CHANGED', 'Keep the original complete merchant schema.');
      const store = new MerchantStore(OPEN_TOKEN, directory, database, lease, leasePath, metadata.store_id);
      // The kernel lease was acquired first. No other live store writer can
      // have its RUNNING fulfillment reclassified by this opener.
      store._transaction(() => {
        const observed = now();
        const abandoned = store._all("SELECT payment_id,order_id,owner_runtime,attempt,run_kind FROM merchant_fulfillments WHERE state='RUNNING'");
        for (const row of abandoned) {
          const details = { previousRuntime: row.owner_runtime, attempt: safeNumber(row.attempt, 'attempt'),
            runKind: row.run_kind, reason: 'original-runtime-lease-ended', observedAt: observed };
          store._run("UPDATE merchant_fulfillments SET state='INTERRUPTED',interruption_json=?,updated_at=? WHERE payment_id=?",
            encoded(details), observed, row.payment_id);
          store._history(row.order_id, 'FULFILLMENT_INTERRUPTED', { paymentId: row.payment_id, ...details }, observed);
        }
        store._run("UPDATE merchant_runtimes SET state='LEASE_ENDED',ended_observed_at=? WHERE state='OPEN'", observed);
        store._run("INSERT INTO merchant_runtimes(id,opened_at,state) VALUES(?,?,'OPEN')", store.runtimeId, observed);
      });
      syncDirectory(directory);
      return store;
    } catch (error) {
      const cleanup = [];
      try { if (descriptor !== null) closeSync(descriptor); } catch (failure) { cleanup.push(failure); }
      try { if (database !== null) database.close(); } catch (failure) { cleanup.push(failure); }
      try { await lease.close(); } catch (failure) { cleanup.push(failure); }
      if (cleanup.length) error.cleanupErrors = cleanup.map(failure => ({code:failure.code ?? null,message:String(failure.message)}));
      throw error;
    }
  }

  constructor(token, directory, database, lease, leasePath, storeId) {
    need(token === OPEN_TOKEN, 'MERCHANT_OPEN_REQUIRED', 'Use await MerchantStore.open(directory).', 400);
    this.directory = directory;
    this.storeId = storeId;
    this.runtimeId = randomUUID();
    this._db = database;
    this._lease = lease;
    this._leasePath = leasePath;
    this._closed = false;
    this._closing = null;
  }

  _assertOpen(allowClosing = false) {
    need(!this._closed && this._db !== null && (allowClosing || !this._closing),
      'MERCHANT_STORE_CLOSED', 'Open the original merchant store before using it.');
    const held = fstatSync(this._lease.fd), named = lstatSync(this._leasePath);
    checkFile(held, 'merchant ownership lease');
    need(sameInode(held, named), 'MERCHANT_OWNER_CHANGED', 'Keep the held original merchant ownership lease.');
  }
  _statement(sql) {
    const statement = this._db.prepare(sql);
    statement.setReadBigInts(true);
    return statement;
  }
  _get(sql, ...args) { return this._statement(sql).get(...args); }
  _all(sql, ...args) { return this._statement(sql).all(...args); }
  _run(sql, ...args) { return this._statement(sql).run(...args); }
  _transaction(work, allowClosing = false) {
    this._assertOpen(allowClosing);
    need(!this._db.isTransaction, 'MERCHANT_NESTED_TRANSACTION', 'Finish the original business transaction.');
    this._db.exec('BEGIN IMMEDIATE');
    let result;
    try {
      result = work();
      need(!(result && typeof result.then === 'function'), 'MERCHANT_ASYNC_TRANSACTION',
        'Keep provider and handler calls outside the business transaction.');
      this._db.exec('COMMIT');
    } catch (error) {
      try { this._db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    // A completed COMMIT stays authoritative if the later directory sync
    // reports an error. Original identity comparisons make its replay safe.
    syncDirectory(this.directory);
    return result;
  }
  _order(id, privateFields = false) {
    identifier(id, 'merchant order id');
    const row = this._get('SELECT ' + ORDER_COLUMNS +
      (privateFields ? ',charge_request,signature' : '') + ' FROM merchant_orders WHERE id=?', id);
    need(row, 'MERCHANT_ORDER_NOT_FOUND', 'The original merchant order does not exist.', 404);
    return row;
  }
  _history(orderId, kind, data, timestamp = now()) {
    identifier(kind, 'history kind');
    this._run('INSERT INTO merchant_history(order_id,kind,data_json,created_at) VALUES(?,?,?,?)',
      orderId, kind, encoded(data), timestamp);
  }
  _fulfillment(paymentId, withBytes = false) {
    identifier(paymentId, 'settled payment id');
    return this._get('SELECT payment_id,order_id,state,owner_runtime,attempt,run_kind,interruption_json,' +
      'returned_bytes,returned_sha256,content_type,file_name,result_file_json,created_at,updated_at' +
      (withBytes ? ',returned' : '') + ' FROM merchant_fulfillments WHERE payment_id=?', paymentId);
  }
  _fulfillmentView(row, privateFields = false) {
    if (!row) return null;
    const value = {
      paymentId: row.payment_id, orderId: row.order_id, state: row.state,
      attempt: safeNumber(row.attempt, 'fulfillment attempt'), createdAt: row.created_at, updatedAt: row.updated_at,
      returned: row.returned_sha256 === null ? null : {
        byteLength: safeNumber(row.returned_bytes, 'returned byte count'),
        sha256: row.returned_sha256, contentType: row.content_type, fileName: row.file_name
      },
      resultFile: decoded(row.result_file_json),
      byteLength: row.returned_bytes === null ? null : safeNumber(row.returned_bytes, 'returned byte count'),
      sha256: row.returned_sha256, contentType: row.content_type, fileName: row.file_name,
      reconcileRequired: row.state === 'INTERRUPTED'
    };
    if (privateFields) {
      value.ownerRuntime = row.owner_runtime;
      value.runKind = row.run_kind;
      value.interruption = decoded(row.interruption_json);
      if (value.returned) {
        const returned = Buffer.from(row.returned);
        need(returned.length === value.returned.byteLength && sha(returned) === value.returned.sha256,
          'MERCHANT_RETURN_CHANGED', 'Keep the exact retained fulfillment return.');
        value.returned.bytes = returned;
        value.bytes = returned;
      } else value.bytes = null;
    }
    return value;
  }
  _orderView(row, privateFields = false) {
    const data = decoded(row.data_json), publicData = {};
    for (const key of PUBLIC_DATA) if (Object.hasOwn(data, key)) publicData[key] = data[key];
    const result = {
      ...(privateFields ? data : publicData), schema: SCHEMA, id: row.id, reference: row.reference,
      title: row.title, frozen: decoded(row.frozen_json), state: row.state, createdAt: row.created_at, updatedAt: row.updated_at,
      chargeRequest: { byteLength: safeNumber(row.charge_request_bytes, 'charge request byte count'),
        sha256: row.charge_request_sha256 },
      signatureRetained: row.signature_sha256 !== null,
      fulfillment: this._fulfillmentView(this._get(
        'SELECT payment_id,order_id,state,owner_runtime,attempt,run_kind,interruption_json,returned_bytes,' +
        'returned_sha256,content_type,file_name,result_file_json,created_at,updated_at FROM merchant_fulfillments WHERE order_id=?', row.id))
    };
    if (privateFields) {
      const request = Buffer.from(row.charge_request);
      need(request.length === result.chargeRequest.byteLength && sha(request) === result.chargeRequest.sha256,
        'MERCHANT_CHARGE_REQUEST_CHANGED', 'Keep the original exact charge request.');
      result.chargeRequestBytes = request;
      result.chargeIdempotencyKey = row.charge_idempotency_key;
      result.chargeIdentity = decoded(row.charge_identity_json);
      result.signatureSha256 = row.signature_sha256;
      result.signatureBytes = row.signature === null ? null : Buffer.from(row.signature);
      result.signature = result.signatureBytes === null ? null :
        row.signature_encoding === 'utf8' ? result.signatureBytes.toString('utf8') : Buffer.from(result.signatureBytes);
      if (result.signatureBytes) need(sha(result.signatureBytes) === row.signature_sha256,
        'MERCHANT_SIGNATURE_CHANGED', 'Keep the original exact payment signature.');
    }
    return result;
  }

  createOrder({ id, reference, title, frozen, chargeRequestBytes, chargeIdempotencyKey }) {
    identifier(id, 'merchant order id'); identifier(reference, 'order reference'); text(title, 'order title');
    need(title.length > 0, 'MERCHANT_TITLE_REQUIRED', 'Provide the original order title.', 400);
    identifier(chargeIdempotencyKey, 'charge idempotency key');
    const frozenJson = encoded(frozen), request = bytes(chargeRequestBytes, 'charge request'), digest = sha(request);
    this._transaction(() => {
      const old = this._get('SELECT * FROM merchant_orders WHERE id=?', id);
      if (old) {
        need(old.reference === reference && old.title === title && old.frozen_json === frozenJson &&
          old.charge_idempotency_key === chargeIdempotencyKey && old.charge_request_sha256 === digest &&
          safeNumber(old.charge_request_bytes, 'charge request byte count') === request.length &&
          Buffer.from(old.charge_request).equals(request),
          'MERCHANT_ORDER_ID_REUSED', 'Keep the original order, frozen terms and exact charge request.');
        return;
      }
      const keyOwner = this._get('SELECT id FROM merchant_orders WHERE charge_idempotency_key=?', chargeIdempotencyKey);
      need(!keyOwner, 'MERCHANT_CHARGE_KEY_REUSED', 'The original charge idempotency key belongs to another order.');
      const time = now();
      this._run('INSERT INTO merchant_orders(id,reference,title,frozen_json,charge_request,charge_request_bytes,' +
        'charge_request_sha256,charge_idempotency_key,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        id, reference, title, frozenJson, request, request.length, digest, chargeIdempotencyKey, 'CREATED', time, time);
      this._history(id, 'ORDER_CREATED', { chargeRequestSha256: digest, chargeRequestBytes: request.length }, time);
    });
    return this.getOrder(id, { private: true });
  }

  getOrder(id, { private: privateFields = false } = {}) {
    this._assertOpen();
    return this._orderView(this._order(id, privateFields), privateFields);
  }

  listOrders({ state, reference, query, limit, offset = 0, private: privateFields = false } = {}) {
    this._assertOpen();
    const predicates = [], parameters = [];
    if (state !== undefined) { identifier(state, 'business order state'); predicates.push('state=?'); parameters.push(state); }
    if (reference !== undefined) { identifier(reference, 'order reference'); predicates.push('reference=?'); parameters.push(reference); }
    if (query !== undefined) {
      text(query, 'order search', 4096);
      predicates.push('(instr(lower(id),lower(?))>0 OR instr(lower(reference),lower(?))>0 OR instr(lower(title),lower(?))>0)');
      parameters.push(query, query, query);
    }
    need(Number.isSafeInteger(offset) && offset >= 0, 'MERCHANT_PAGE_INVALID', 'Use an explicit nonnegative offset.', 400);
    if (limit !== undefined) need(Number.isSafeInteger(limit) && limit >= 1, 'MERCHANT_PAGE_INVALID', 'Use a positive explicit limit.', 400);
    let sql = 'SELECT ' + ORDER_COLUMNS + (privateFields ? ',charge_request,signature' : '') + ' FROM merchant_orders';
    if (predicates.length) sql += ' WHERE ' + predicates.join(' AND ');
    sql += ' ORDER BY created_at,id';
    if (limit !== undefined || offset) { sql += ' LIMIT ? OFFSET ?'; parameters.push(limit ?? -1, offset); }
    return this._all(sql, ...parameters).map(row => this._orderView(row, privateFields));
  }

  updateOrder(id, { set = {}, kind = 'ORDER_UPDATED', data = {} } = {}) {
    need(plain(set), 'MERCHANT_UPDATE_INVALID', 'Use a JSON object for the original order update.', 400);
    for (const key of Object.keys(set)) need(!RESERVED.has(key) &&
      !['__proto__','constructor','prototype'].includes(key),
      'MERCHANT_IMMUTABLE_ORDER', 'Keep original order identity field ' + key + '.', 400);
    const selection = canonical(set); identifier(kind, 'history kind'); encoded(data);
    this._transaction(() => {
      const row = this._order(id), previous = decoded(row.data_json), identity = decoded(row.charge_identity_json);
      for (const key of DIRECT_IDENTIFIERS) {
        if (!Object.hasOwn(selection, key)) continue;
        identifier(selection[key], key);
        need(!Object.hasOwn(identity, key) || identity[key] === selection[key],
          'MERCHANT_CHARGE_IDENTITY_CHANGED', 'Keep the original ' + key + '.');
        identity[key] = selection[key];
      }
      if (Object.hasOwn(selection, 'charge')) {
        need(plain(selection.charge), 'MERCHANT_CHARGE_INVALID', 'Keep the original returned charge object.', 400);
        for (const key of CHARGE_IDENTIFIERS) {
          if (!Object.hasOwn(selection.charge, key)) continue;
          identifier(selection.charge[key], 'charge.' + key);
          const identityKey = 'charge.' + key;
          need(!Object.hasOwn(identity, identityKey) || identity[identityKey] === selection.charge[key],
            'MERCHANT_CHARGE_IDENTITY_CHANGED', 'Keep original charge.' + key + '.');
          identity[identityKey] = selection.charge[key];
        }
        if (previous.charge) {
          need(encoded(previous.charge) === encoded(selection.charge),
            'MERCHANT_CHARGE_CHANGED', 'Keep the original full returned charge and its payment requirement.');
          for (const key of CHARGE_IDENTIFIERS) if (Object.hasOwn(previous.charge, key))
            need(selection.charge[key] === previous.charge[key],
              'MERCHANT_CHARGE_IDENTITY_CHANGED', 'Preserve every original returned charge identifier.');
        }
      }
      const aliases = {charge_id:'chargeId',order_id:'providerOrderId',payment_identifier:'paymentIdentifier',
        request_fingerprint:'requestFingerprint',resource_version_id:'resourceVersionId',charge_digest:'chargeDigest'};
      for (const [native, local] of Object.entries(aliases)) {
        const nested = identity['charge.' + native];
        if (nested === undefined) continue;
        need(identity[local] === undefined || identity[local] === nested,
          'MERCHANT_CHARGE_IDENTITY_CHANGED', 'Preserve the same original charge identity across its field names.');
        identity[local] = nested;
      }
      const next = { ...previous, ...selection };
      const state = Object.hasOwn(selection, 'state') ? identifier(selection.state, 'business order state') : row.state;
      const time = now();
      this._run('UPDATE merchant_orders SET data_json=?,charge_identity_json=?,state=?,updated_at=? WHERE id=?',
        encoded(next), encoded(identity), state, time, id);
      this._history(id, kind, { set: selection, data }, time);
    });
    return this.getOrder(id, { private: true });
  }

  retainSignature(id, exactSignature) {
    const original = bytes(exactSignature, 'PAYMENT-SIGNATURE'), digest = sha(original);
    need(original.length > 0, 'MERCHANT_SIGNATURE_REQUIRED', 'Keep the complete original payment signature.', 400);
    this._transaction(() => {
      const row = this._order(id, true);
      if (row.signature !== null) {
        need(row.signature_sha256 === digest && Buffer.from(row.signature).equals(original),
          'MERCHANT_SIGNATURE_REUSED', 'Retry only the exact original payment signature for this order.');
        return;
      }
      const time = now(), encoding = typeof exactSignature === 'string' ? 'utf8' : 'bytes';
      this._run('UPDATE merchant_orders SET signature=?,signature_encoding=?,signature_sha256=?,updated_at=? WHERE id=?',
        original, encoding, digest, time, id);
      this._history(id, 'SIGNATURE_RETAINED', { bytes: original.length, sha256: digest }, time);
    });
    return this.getOrder(id, { private: true });
  }

  appendExchange(id, { kind, status = null, headers = {}, raw = null, responseComplete = false, error = null }) {
    identifier(kind, 'provider exchange kind');
    need(status === null || Number.isInteger(status) && status >= 100 && status <= 599,
      'MERCHANT_HTTP_STATUS_INVALID', 'Retain the actual HTTP status or null before a response.', 400);
    need(typeof responseComplete === 'boolean', 'MERCHANT_RESPONSE_COMPLETE_INVALID', 'Record whether the original response completed.', 400);
    const body = raw === null ? null : bytes(raw, 'provider response');
    const headersJson = encoded(headers), errorJson = error === null ? null : encoded(error);
    let sequence;
    this._transaction(() => {
      this._order(id);
      const time = now();
      const result = this._run('INSERT INTO merchant_exchanges(order_id,kind,status,headers_json,raw,raw_bytes,' +
        'raw_sha256,response_complete,error_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id, kind, status, headersJson, body, body === null ? null : body.length, body === null ? null : sha(body),
        responseComplete ? 1 : 0, errorJson, time);
      sequence = safeNumber(result.lastInsertRowid, 'exchange sequence');
      this._history(id, 'PROVIDER_EXCHANGE', { exchangeId: sequence, kind, status,
        responseComplete, rawSha256: body === null ? null : sha(body), error }, time);
    });
    return this._exchange(sequence);
  }

  _exchange(sequence) {
    const row = this._get('SELECT * FROM merchant_exchanges WHERE sequence=?', sequence);
    need(row, 'MERCHANT_EXCHANGE_NOT_FOUND', 'Read the original provider exchange.', 404);
    const raw = row.raw === null ? null : Buffer.from(row.raw);
    if (raw !== null) need(raw.length === safeNumber(row.raw_bytes, 'provider response byte count') &&
      sha(raw) === row.raw_sha256, 'MERCHANT_EXCHANGE_CHANGED', 'Keep the complete original provider response.');
    return { id: safeNumber(row.sequence, 'exchange sequence'), orderId: row.order_id, kind: row.kind,
      status: row.status === null ? null : safeNumber(row.status, 'HTTP status'), headers: decoded(row.headers_json),
      raw, rawSha256: row.raw_sha256, responseComplete: row.response_complete === 1n,
      error: decoded(row.error_json), createdAt: row.created_at };
  }

  // This is the complete private operator history. The public order projection
  // intentionally does not include these original signature/header/body records.
  history(id) {
    this._assertOpen(); this._order(id);
    return this._all('SELECT * FROM merchant_history WHERE order_id=? ORDER BY sequence', id).map(row => {
      const data = decoded(row.data_json), result = { sequence: safeNumber(row.sequence, 'history sequence'),
        orderId: id, kind: row.kind, data, createdAt: row.created_at };
      if (row.kind === 'PROVIDER_EXCHANGE') result.exchange = this._exchange(data.exchangeId);
      return result;
    });
  }

  acceptEvent({ deliveryId, orderId = null, kind, event, raw }) {
    identifier(deliveryId, 'webhook delivery id'); identifier(kind, 'verified webhook kind');
    if (orderId !== null) identifier(orderId, 'event order id');
    const body = bytes(raw, 'webhook body'), eventJson = encoded(event), digest = sha(body);
    let created = false;
    this._transaction(() => {
      const old = this._get('SELECT * FROM merchant_events WHERE delivery_id=?', deliveryId);
      if (old) {
        need(old.order_id === orderId && old.kind === kind && old.event_json === eventJson &&
          old.raw_sha256 === digest && safeNumber(old.raw_bytes, 'webhook byte count') === body.length &&
          Buffer.from(old.raw).equals(body), 'MERCHANT_EVENT_ID_REUSED',
          'The same delivery id must retain its original order, verified event and exact raw body.');
        return;
      }
      if (orderId !== null) this._order(orderId);
      const time = now();
      this._run('INSERT INTO merchant_events(delivery_id,order_id,kind,event_json,raw,raw_bytes,raw_sha256,' +
        'state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        deliveryId, orderId, kind, eventJson, body, body.length, digest, 'PENDING', time, time);
      if (orderId !== null) this._history(orderId, 'WEBHOOK_ACCEPTED', { deliveryId, kind, rawSha256: digest }, time);
      created = true;
    });
    return { ...this.getEvent(deliveryId), created };
  }

  _eventView(row) {
    if (!row) return null;
    const raw = Buffer.from(row.raw);
    need(raw.length === safeNumber(row.raw_bytes, 'webhook byte count') && sha(raw) === row.raw_sha256,
      'MERCHANT_EVENT_CHANGED', 'Keep the complete original webhook body.');
    return { deliveryId: row.delivery_id, orderId: row.order_id, kind: row.kind, event: decoded(row.event_json),
      raw, rawSha256: row.raw_sha256, state: row.state, details: decoded(row.details_json),
      createdAt: row.created_at, updatedAt: row.updated_at };
  }
  getEvent(deliveryId) {
    this._assertOpen(); identifier(deliveryId, 'webhook delivery id');
    return this._eventView(this._get('SELECT * FROM merchant_events WHERE delivery_id=?', deliveryId));
  }
  pendingEvents() {
    this._assertOpen();
    return this._all("SELECT * FROM merchant_events WHERE state='PENDING' ORDER BY created_at,delivery_id").map(row => this._eventView(row));
  }
  finishEvent(deliveryId, { state, details = {} }) {
    identifier(deliveryId, 'webhook delivery id');
    need(['PENDING','COMPLETE','REJECTED'].includes(state), 'MERCHANT_EVENT_STATE_INVALID',
      'Keep PENDING for retry, or retain the final COMPLETE/REJECTED disposition.', 400);
    const detailsJson = encoded(details);
    this._transaction(() => {
      const old = this._get('SELECT * FROM merchant_events WHERE delivery_id=?', deliveryId);
      need(old, 'MERCHANT_EVENT_NOT_FOUND', 'Read the original webhook delivery before finishing it.', 404);
      if (old.state !== 'PENDING') {
        need(old.state === state && old.details_json === detailsJson, 'MERCHANT_EVENT_ALREADY_FINISHED',
          'Preserve the original completed webhook disposition.');
        return;
      }
      const time = now();
      this._run('UPDATE merchant_events SET state=?,details_json=?,updated_at=? WHERE delivery_id=?',
        state, detailsJson, time, deliveryId);
      if (old.order_id !== null) this._history(old.order_id, 'WEBHOOK_DISPOSITION', { deliveryId, state, details }, time);
    });
    return this.getEvent(deliveryId);
  }

  claimFulfillment(orderId, paymentId) {
    identifier(orderId, 'merchant order id'); identifier(paymentId, 'settled payment id');
    let created = false;
    this._transaction(() => {
      const order = this._order(orderId), data = decoded(order.data_json), identity = decoded(order.charge_identity_json);
      need((data.paymentId === undefined || data.paymentId === paymentId) &&
        (identity.paymentId === undefined || identity.paymentId === paymentId),
        'MERCHANT_PAYMENT_REUSED', 'Keep the original settled payment identity for this order.');
      const old = this._fulfillment(paymentId);
      if (old) {
        need(old.order_id === orderId, 'MERCHANT_PAYMENT_REUSED', 'The original settled payment belongs to another order.');
        return;
      }
      const previous = this._get('SELECT payment_id FROM merchant_fulfillments WHERE order_id=?', orderId);
      need(!previous, 'MERCHANT_ORDER_ALREADY_CLAIMED', 'Retain the original settled payment for this order.');
      const time = now();
      data.paymentId = paymentId; identity.paymentId = paymentId;
      this._run('UPDATE merchant_orders SET data_json=?,charge_identity_json=?,updated_at=? WHERE id=?',
        encoded(data), encoded(identity), time, orderId);
      this._run("INSERT INTO merchant_fulfillments(payment_id,order_id,state,created_at,updated_at) VALUES(?,?,'CLAIMED',?,?)",
        paymentId, orderId, time, time);
      this._history(orderId, 'FULFILLMENT_CLAIMED', { paymentId }, time);
      created = true;
    });
    return { ...this.getFulfillment(paymentId, { private: true }), created };
  }

  beginFulfillment(paymentId) {
    identifier(paymentId, 'settled payment id');
    let claimed = false, started = false, reconcileRequired = false;
    this._transaction(() => {
      const row = this._fulfillment(paymentId);
      need(row, 'MERCHANT_FULFILLMENT_NOT_FOUND', 'Claim the original paid fulfillment before beginning it.', 404);
      if (!['CLAIMED','INTERRUPTED'].includes(row.state)) return;
      reconcileRequired = row.state === 'INTERRUPTED';
      const kind = reconcileRequired ? 'RECONCILE' : 'FULFILL', time = now();
      this._run("UPDATE merchant_fulfillments SET state='RUNNING',owner_runtime=?,attempt=attempt+1,run_kind=?,updated_at=? WHERE payment_id=?",
        this.runtimeId, kind, time, paymentId);
      this._history(row.order_id, reconcileRequired ? 'FULFILLMENT_RECONCILIATION_STARTED' : 'FULFILLMENT_STARTED',
        { paymentId, runtimeId: this.runtimeId, attempt: safeNumber(row.attempt, 'fulfillment attempt') + 1 }, time);
      claimed = true; started = !reconcileRequired;
    });
    return { ...this.getFulfillment(paymentId, { private: true }), claimed, started, reconcileRequired };
  }

  failFulfillment(paymentId, { code, message = '' }) {
    identifier(paymentId, 'settled payment id'); identifier(code, 'handler failure code');
    text(message, 'handler failure message', 16000);
    this._transaction(() => {
      const row = this._fulfillment(paymentId);
      need(row, 'MERCHANT_FULFILLMENT_NOT_FOUND', 'Keep the original paid fulfillment.', 404);
      // A completed handler return wins even when its later directory sync or
      // SF31 publication reports an error. Never turn retained bytes into a retry.
      if (['RETURNED','COMPLETE'].includes(row.state)) return;
      const previous = decoded(row.interruption_json);
      if (row.state === 'INTERRUPTED') {
        need(row.owner_runtime === this.runtimeId && previous?.code === code && previous?.message === message,
          'MERCHANT_FAILURE_REUSED', 'Preserve the original interrupted handler outcome.');
        return;
      }
      need(row.state === 'RUNNING' && row.owner_runtime === this.runtimeId,
        'MERCHANT_FULFILLMENT_OWNER_REQUIRED', 'Only the current original handler can record its ended failure.');
      const time = now(), details = { code, message, runtimeId: this.runtimeId,
        runKind: row.run_kind, attempt: safeNumber(row.attempt, 'fulfillment attempt'),
        reason: 'handler-outcome-requires-reconciliation', observedAt: time };
      this._run("UPDATE merchant_fulfillments SET state='INTERRUPTED',interruption_json=?,updated_at=? WHERE payment_id=?",
        encoded(details), time, paymentId);
      this._history(row.order_id, 'FULFILLMENT_INTERRUPTED', { paymentId, ...details }, time);
    });
    return this.getFulfillment(paymentId, { private: true });
  }

  retainFulfillmentReturn(paymentId, { bytes: returnedBytes, contentType, fileName }) {
    identifier(paymentId, 'settled payment id');
    const body = bytes(returnedBytes, 'fulfillment handler return'), digest = sha(body);
    text(contentType, 'returned content type', 1024);
    text(fileName, 'returned file name', 1024);
    need(contentType.length > 0 && !/[\r\n]/.test(contentType) && fileName.length > 0 &&
      !/[\/\\\r\n]/.test(fileName) && fileName !== '.' && fileName !== '..',
      'MERCHANT_RETURN_DESCRIPTION_INVALID', 'Use a content type and one safe original file name.', 400);
    this._transaction(() => {
      const row = this._fulfillment(paymentId, true);
      need(row, 'MERCHANT_FULFILLMENT_NOT_FOUND', 'Keep the original paid fulfillment.', 404);
      if (['RETURNED','COMPLETE'].includes(row.state)) {
        need(row.returned_sha256 === digest && safeNumber(row.returned_bytes, 'returned byte count') === body.length &&
          Buffer.from(row.returned).equals(body) && row.content_type === contentType && row.file_name === fileName,
          'MERCHANT_RETURN_REUSED', 'Keep the exact original handler bytes and description.');
        return;
      }
      need(row.state === 'RUNNING' && row.owner_runtime === this.runtimeId,
        'MERCHANT_FULFILLMENT_OWNER_REQUIRED', 'Complete the original claimed handler or its reconciliation first.');
      const time = now();
      this._run("UPDATE merchant_fulfillments SET state='RETURNED',returned=?,returned_bytes=?,returned_sha256=?," +
        'content_type=?,file_name=?,updated_at=? WHERE payment_id=?',
        body, body.length, digest, contentType, fileName, time, paymentId);
      this._history(row.order_id, 'FULFILLMENT_RETURNED', { paymentId, bytes: body.length, sha256: digest, contentType, fileName }, time);
    });
    return this.getFulfillment(paymentId, { private: true });
  }

  getFulfillment(paymentId, { private: privateFields = false } = {}) {
    this._assertOpen();
    return this._fulfillmentView(this._fulfillment(paymentId, privateFields), privateFields);
  }

  completeFulfillment(paymentId, resultFile) {
    identifier(paymentId, 'settled payment id');
    need(plain(resultFile) && Object.keys(resultFile).length > 0, 'MERCHANT_RESULT_FILE_REQUIRED',
      'Retain the actual original SF31 result-file metadata.', 400);
    const resultJson = encoded(resultFile);
    this._transaction(() => {
      const row = this._fulfillment(paymentId);
      need(row, 'MERCHANT_FULFILLMENT_NOT_FOUND', 'Keep the original paid fulfillment.', 404);
      if (row.state === 'COMPLETE') {
        need(row.result_file_json === resultJson, 'MERCHANT_RESULT_FILE_CHANGED', 'Keep the original completed result-file identity.');
        return;
      }
      need(row.state === 'RETURNED', 'MERCHANT_RETURN_REQUIRED', 'Retain the handler bytes durably before saving their SF31 result.');
      const time = now();
      this._run("UPDATE merchant_fulfillments SET state='COMPLETE',result_file_json=?,updated_at=? WHERE payment_id=?",
        resultJson, time, paymentId);
      this._history(row.order_id, 'FULFILLMENT_COMPLETE', { paymentId, resultFile }, time);
    });
    return this.getFulfillment(paymentId, { private: true });
  }

  async close() {
    if (this._closed) return;
    if (this._closing) return this._closing;
    // Publish the in-flight close before its first operation. A synchronous
    // database-close error keeps the original lease and remains retryable.
    this._closing = Promise.resolve().then(async () => {
      let failure = null;
      if (this._db !== null) {
        try {
          this._transaction(() => this._run("UPDATE merchant_runtimes SET state='CLOSED',closed_at=? WHERE id=?",
            now(), this.runtimeId), true);
        } catch (error) { failure = error; }
        try { this._db.close(); this._db = null; }
        catch (error) { throw failure ?? error; }
      }
      try { await this._lease.close(); this._closed = true; }
      catch (error) { failure ??= error; }
      if (failure) throw failure;
    });
    try { return await this._closing; }
    finally { this._closing = null; }
  }
}

export default MerchantStore;
