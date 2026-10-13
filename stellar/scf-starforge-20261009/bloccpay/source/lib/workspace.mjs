// MIT. Exact request custody and immutable payroll evidence using Node's SQLite.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  BloccpayError, need, now, hash, canonical, jsonBytes, clone, directory, confined,
  writeExact, fileDescriptor, verifyFile, readJSON, lease, publicError, redact, parseLedgerCSV,
} from './files.mjs';
import {
  NATIVE_ACTIONS, describeConnection, buildRequest, executeProvider, projectResource,
  reconcileVersions, verifyWebhook, nextPageRequest, validateOperation,
} from './native.mjs';
import { parseSourceJSON } from './source-json.mjs';
import { normalizeProgramme, normalizePayroll, buildPayrollInstructions,
  reconcilePayroll, payrollReport } from './payroll.mjs';

export const WORKSPACE_SCHEMA = 'bloccpay.operations-workspace.v1';
export const TABLES = [
  'operations', 'attempts', 'captures', 'sources', 'resources',
  'resourceVersions', 'webhooks', 'corrections', 'reconciliations',
  'reports', 'exports', 'programmes', 'payrolls', 'instructions', 'collections', 'runs',
];

const definition = (name, required, properties = {}) => ({
  name, mutates: true,
  inputSchema: { type: 'object', required, properties, additionalProperties: true },
});
const textField = { type: 'string' };
export const BLOCCPAY_METHODS = [
  definition('profile.update', ['name'], { name: textField }),
  definition('file.retain',['fileId'],{fileId:textField}),
  definition('programme.save', ['definition'], {
    definition: {type:'object'}, programmeId:textField, sourceIds:{type:'array',items:textField},
  }),
  definition('payroll.import', ['programmeVersionId','fileId','format'], {
    programmeVersionId:textField,fileId:textField,format:{enum:['csv','json']},recordsPath:textField,
  }),
  definition('payroll.instructions', ['payrollId','walletVersionId','disbursementVersionId'], {
    payrollId:textField,walletVersionId:textField,disbursementVersionId:textField,
  }),
  definition('operation.prepare', ['connectionAlias','action','input'], {
    connectionAlias:textField,action:textField,input:{type:'object'},fileId:textField,
    evidence:{type:'object',properties:{
      programmeVersionId:textField,payrollId:textField,instructionId:textField,
      versionIds:{type:'object',additionalProperties:textField},
      sourceIds:{type:'object',additionalProperties:textField},
    }},
  }),
  definition('operation.dispatch', ['operationId'], {operationId:textField}),
  definition('operation.reconcile', ['operationId'], {operationId:textField}),
  definition('operation.retry-original',['operationId'],{operationId:textField}),
  definition('operation.cancel', ['operationId','reason']),
  definition('capture.start', ['connectionAlias','action','input']),
  definition('capture.run', ['captureId'], {captureId:textField,maxPages:{type:'integer',minimum:1,maximum:10000}}),
  definition('capture.pause', ['captureId']),
  definition('collection.save', ['name','programmeVersionId','tasks'], {
    name:textField,programmeVersionId:textField,payrollId:textField,
    intervalSeconds:{type:'integer',minimum:60,default:900},
    tasks:{type:'array',minItems:1,items:{type:'object',required:['id','connectionAlias','action','input'],
      properties:{id:textField,connectionAlias:textField,action:textField,input:{type:'object'},required:{type:'boolean'}}}},
  }),
  definition('collection.enable', ['collectionId','enabled']),
  definition('collection.run', ['collectionId'], {collectionId:textField,scheduledFor:textField,maxPages:{type:'integer'}}),
  definition('run.continue', ['runId'], {runId:textField,maxPages:{type:'integer'}}),
  definition('run.pause', ['runId']),
  definition('source.import', ['fileId','connectionAlias','action']),
  definition('source.project', ['sourceId']),
  definition('correction.save', ['programmeVersionId','payrollId','action','reason','actor']),
  definition('reconciliation.create', ['programmeVersionId','payrollId'], {
    programmeVersionId:textField,payrollId:textField,
    versionIds:{type:'array',items:textField},sourceIds:{type:'array',items:textField},
    captureIds:{type:'array',items:textField},runIds:{type:'array',items:textField},
  }),
  definition('report.create', ['reconciliationId']),
  definition('webhook.reconcile', ['webhookId']),
  definition('webhook.project', ['webhookId']),
  definition('delivery.configure', ['enabled']),
  definition('workspace.export', ['destination']),
  definition('report.export', ['reportId','destination']),
  definition('package.inspect', ['sourceDirectory']),
  definition('package.receive', ['sourceDirectory','destination']),
];
function json(value) { return value == null ? null : JSON.parse(value); }
function rowValue(row) { return row ? JSON.parse(row.document) : null; }
function requestIdentity(method, args) { return hash(Buffer.from(canonical({ method, args }))); }
function normalizedNativeId(id) {
  const value = String(id);
  return /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : value;
}
function localResourceId(scope, environment, kind, id) {
  return hash(Buffer.from(canonical([scope, environment, kind, normalizedNativeId(id)])));
}

export async function openBloccpayWorkspace({
  directory: workspaceDirectory,
  connections = {},
  name = 'Bloccpay operations',
  sourceDirectory,
  runtimeDirectory,
  expectedManifestSha256,
  adapters = {},
} = {}) {
  need(Number(process.versions.node.split('.')[0]) === 24, 'NODE_24_REQUIRED');
  need(path.isAbsolute(workspaceDirectory), 'ABSOLUTE_DIRECTORY_REQUIRED');
  await directory(workspaceDirectory);
  await directory(path.join(workspaceDirectory, 'objects'));
  const dbPath = path.join(workspaceDirectory, 'workspace.sqlite');
  const db = new DatabaseSync(dbPath, { timeout: 10000 });
  await fs.chmod(dbPath, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  db.exec([
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;',
    'CREATE TABLE IF NOT EXISTS records (',
    ' table_name TEXT NOT NULL, id TEXT NOT NULL, sequence INTEGER NOT NULL,',
    ' document TEXT NOT NULL, PRIMARY KEY(table_name,id)) STRICT;',
    'CREATE INDEX IF NOT EXISTS records_page ON records(table_name,sequence,id);',
    "CREATE INDEX IF NOT EXISTS records_run_scope ON records(table_name,",
    " json_extract(document,'$.collectionId'),json_extract(document,'$.status'),sequence,id);",
    'CREATE TABLE IF NOT EXISTS journal (revision INTEGER PRIMARY KEY,',
    ' previous_sha256 TEXT, sha256 TEXT NOT NULL, document TEXT NOT NULL) STRICT;',
    'CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, intent_sha256 TEXT NOT NULL,',
    ' method TEXT NOT NULL, args TEXT NOT NULL, expected_revision INTEGER,',
    ' status TEXT NOT NULL, result TEXT, error TEXT, created_at TEXT NOT NULL,',
    ' updated_at TEXT NOT NULL) STRICT;',
    'CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, document TEXT NOT NULL) STRICT;',
  ].join('\n'));

  const native = {
    buildRequest, executeProvider, projectResource, reconcileVersions,
    verifyWebhook, nextPageRequest, validateOperation, ...adapters,
  };
  const getMeta = key => json(db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value);
  const setMeta = (key, value) => db.prepare(
    'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, JSON.stringify(value));
  if (!getMeta('identity')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!getMeta('identity')) {
        setMeta('identity', { schema: WORKSPACE_SCHEMA, id: randomUUID(), createdAt: now() });
        setMeta('profile', { name });
        setMeta('revision', 0);
        setMeta('head', null);
        setMeta('dispatchEnabled', false);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  need(getMeta('identity').schema === WORKSPACE_SCHEMA, 'WORKSPACE_SCHEMA_MISMATCH');

  const selectedConnections = clone(connections);
  const secrets = () => Object.values(selectedConnections).flatMap(connection =>
    [connection.apiKey, connection.token, connection.bearerToken, connection.webhookSecret,
      ...Object.values(connection.webhookSecrets ?? {}), ...Object.values(connection.secrets ?? {}),
      ...Object.values(connection.webhookEndpoints ?? {}).map(endpoint=>endpoint.secret)]).filter(Boolean);

  function connection(alias, expected) {
    const selected = selectedConnections[alias];
    need(selected, 'CONNECTION_NOT_CONFIGURED', { alias });
    const descriptor = publicConnection(alias, selected);
    if (expected) need(canonical(descriptor) === canonical(expected),
      'CONNECTION_SCOPE_CHANGED', { alias });
    return selected;
  }

  function publicConnection(alias, selected) {
    const descriptor = describeConnection(selected);
    need(descriptor && typeof descriptor === 'object', 'INVALID_CONNECTION_DESCRIPTOR');
    return { ...clone(descriptor), alias };
  }

  function sourceScope(selected) {
    const descriptor = describeConnection(selected);
    return descriptor.sourceScope ?? descriptor.id ?? hash(Buffer.from(canonical({
      provider: descriptor.provider, environment: descriptor.environment,
      organizationId: descriptor.organizationId ?? null, tenant: descriptor.tenant ?? null,
      sourceWalletId: descriptor.sourceWalletId ?? null, network: descriptor.network ?? null,
      baseUrl: descriptor.baseUrl ?? null,
    })));
  }

  function current(table, id) {
    need(TABLES.includes(table), 'UNKNOWN_TABLE');
    return rowValue(db.prepare(
      'SELECT document FROM records WHERE table_name=? AND id=?').get(table, String(id)));
  }

  function requireRow(table, id) {
    const row = current(table, id);
    need(row, 'RECORD_NOT_FOUND', { table, id });
    return row;
  }

  function put(table, value) {
    need(TABLES.includes(table) && typeof value.id === 'string', 'INVALID_RECORD');
    const previous = db.prepare(
      'SELECT sequence FROM records WHERE table_name=? AND id=?').get(table, value.id);
    const sequence = previous?.sequence ?? db.prepare(
      'SELECT COALESCE(MAX(sequence),0)+1 AS n FROM records').get().n;
    db.prepare([
      'INSERT INTO records(table_name,id,sequence,document) VALUES(?,?,?,?)',
      'ON CONFLICT(table_name,id) DO UPDATE SET document=excluded.document',
    ].join(' ')).run(table, value.id, sequence, JSON.stringify(value));
    return value;
  }

  function transition(kind, detail, work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      const revision = getMeta('revision') + 1;
      const entry = {
        revision, previous: getMeta('head'), kind, detail,
        createdAt: now(), result: result ?? null,
      };
      const digest = hash(Buffer.from(canonical(entry)));
      db.prepare('INSERT INTO journal VALUES(?,?,?,?)').run(
        revision, entry.previous, digest, JSON.stringify(entry));
      setMeta('revision', revision);
      setMeta('head', digest);
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function listAll(table) {
    need(TABLES.includes(table), 'UNKNOWN_TABLE');
    return db.prepare('SELECT document FROM records WHERE table_name=? ORDER BY sequence,id')
      .all(table).map(rowValue);
  }

  async function retainFile(body, {
    filename = 'source.bin', contentType = 'application/octet-stream', private: isPrivate = false,
  } = {}) {
    body = Buffer.from(body);
    const sha256 = hash(body);
    const id = (isPrivate ? 'private-' : 'public-') + sha256;
    const relative = 'objects/' + id.slice(0, 12) + '/' + id;
    const destination = await confined(workspaceDirectory, relative, true);
    await writeExact(destination, body);
    const descriptor = {
      id, path: relative, filename: path.basename(filename), contentType,
      bytes: body.length, sha256, mode: 0o600, private: isPrivate,
    };
    db.prepare('INSERT INTO files(id,document) VALUES(?,?) ON CONFLICT(id) DO NOTHING')
      .run(id, JSON.stringify(descriptor));
    return descriptor;
  }

  function file(id, { private: allowPrivate = false } = {}) {
    const descriptor = rowValue(db.prepare('SELECT document FROM files WHERE id=?').get(id));
    need(descriptor && (allowPrivate || !descriptor.private), 'FILE_NOT_AVAILABLE');
    return descriptor;
  }

  async function fileBytes(id, options) {
    const descriptor = file(id, options);
    await verifyFile(workspaceDirectory, descriptor);
    return fs.readFile(await confined(workspaceDirectory, descriptor.path));
  }

  function publicValue(value) { return redact(value, secrets()); }

  function describe() {
    const identity = getMeta('identity');
    return {
      workspace: {
        id: identity.id, revision: getMeta('revision'), head: getMeta('head'),
        name: getMeta('profile').name, createdAt: identity.createdAt,
        dispatchEnabled: getMeta('dispatchEnabled'),
        receivedFrom: getMeta('receivedFrom'),
      },
      connections: Object.entries(selectedConnections)
        .map(([alias, value]) => publicConnection(alias, value)),
      catalogue: NATIVE_ACTIONS,
      methods: BLOCCPAY_METHODS,
      summary: Object.fromEntries(TABLES.map(table => [
        table, db.prepare('SELECT count(*) AS n FROM records WHERE table_name=?').get(table).n,
      ])),
    };
  }

  function list({ table, limit = 100, cursor = null, ...filters }) {
    need(TABLES.includes(table) || table === 'requests', 'UNKNOWN_TABLE');
    need(Number.isSafeInteger(Number(limit)) && Number(limit) >= 1 && Number(limit) <= 500,
      'INVALID_PAGE_SIZE');
    const start = cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString()) : { sequence: 0, id: '' };
    if (table === 'requests') {
      const rows = db.prepare(
        'SELECT * FROM requests WHERE (created_at,id) > (?,?) ORDER BY created_at,id LIMIT ?'
      ).all(start.createdAt ?? '', start.id, Number(limit) + 1);
      const selected = rows.slice(0, Number(limit));
      const last = selected.at(-1);
      return {
        rows: selected.map(requestRow),
        nextCursor: rows.length > Number(limit) ? Buffer.from(JSON.stringify({
          createdAt: last.created_at, id: last.id,
        })).toString('base64url') : null,
      };
    }
    const allowed = ['state', 'status', 'connectionAlias', 'environment', 'resourceKind',
      'resourceId', 'operationId', 'captureId', 'kind', 'programmeId', 'payrollId', 'collectionId', 'runId'];
    const clauses = ['table_name=?', '(sequence,id) > (?,?)'];
    const values = [table, start.sequence, start.id];
    for (const [key, value] of Object.entries(filters)) {
      need(allowed.includes(key), 'UNSUPPORTED_FILTER', { key });
      clauses.push("json_extract(document,'$." + key + "')=?");
      values.push(String(value));
    }
    const rows = db.prepare('SELECT sequence,id,document FROM records WHERE ' +
      clauses.join(' AND ') + ' ORDER BY sequence,id LIMIT ?')
      .all(...values, Number(limit) + 1);
    const selected = rows.slice(0, Number(limit));
    const last = selected.at(-1);
    return {
      rows: selected.map(row => publicValue(rowValue(row))),
      nextCursor: rows.length > Number(limit) ? Buffer.from(JSON.stringify({
        sequence: last.sequence, id: last.id,
      })).toString('base64url') : null,
    };
  }

  function requestRow(row) {
    return publicValue({
      id: row.id, method: row.method, args: json(row.args), status: row.status,
      result: json(row.result), error: json(row.error), createdAt: row.created_at,
      updatedAt: row.updated_at, expectedRevision: row.expected_revision,
    });
  }

  function item(table, id) {
    if (table === 'requests') {
      const row = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
      need(row, 'RECORD_NOT_FOUND');
      return requestRow(row);
    }
    return publicValue(requireRow(table, id));
  }

  function applyProjection(source, rows) {
    const versionIds = [];
    for (const incoming of rows) {
      need(incoming.kind && incoming.id != null, 'INVALID_PROVIDER_PROJECTION');
      const contentSha256=incoming.contentSha256 ?? incoming.versionSha256;
      need(typeof contentSha256==='string' && /^[a-f0-9]{64}$/.test(contentSha256),
        'PROVIDER_PROJECTION_HASH_REQUIRED');
      const resourceId = localResourceId(source.sourceScope ?? source.connectionAlias, incoming.environment,
        incoming.kind, String(incoming.id));
      const versionId = hash(Buffer.from(canonical([
        source.id, incoming.kind, String(incoming.id), incoming.pointer ?? '',
        contentSha256,
      ])));
      if (current('resourceVersions', versionId)) {
        versionIds.push(versionId);
        continue;
      }
      const version = {
        ...incoming,contentSha256,provider:incoming.provider??source.provider,
        id: versionId, resourceId: String(incoming.id),
        localResourceId: resourceId, sourceId: source.id,
        connectionAlias: source.connectionAlias, sourceScope: source.sourceScope, createdAt: source.createdAt,
      };
      const resource = current('resources', resourceId);
      const existing = resource ? requireRow('resourceVersions', resource.currentVersionId) : null;
      const decision = existing ? native.reconcileVersions(
        { ...existing, id: normalizedNativeId(existing.resourceId) },
        { ...incoming, id: normalizedNativeId(incoming.id) }) :
        { decision: 'replace', reason: 'First original observation.' };
      put('resourceVersions', { ...version, reconciliation: decision });
      if (!resource || decision.decision === 'replace') {
        put('resources', {
          id: resourceId, kind: incoming.kind, resourceId: String(incoming.id),
          environment: incoming.environment, connectionAlias: source.connectionAlias,
          sourceScope: source.sourceScope,
          connectionAliases: [...new Set([...(resource?.connectionAliases ?? []), source.connectionAlias])],
          currentVersionId: versionId, conflict: false,
          projection: incoming.value, createdAt: resource?.createdAt ?? source.createdAt,
          updatedAt: source.createdAt, sourceUpdatedAt: incoming.sourceUpdatedAt,
        });
      } else if (decision.decision === 'conflict') {
        put('resources', { ...resource, conflict: true, updatedAt: source.createdAt });
      }
      versionIds.push(versionId);
    }
    return versionIds;
  }

  async function retainExchange(exchange, context) {
    const id = context.sourceId ?? randomUUID();
    const existing = current('sources', id);
    if (existing) return existing;
    const requestBody = jsonBytes(exchange.request);
    const requestFile = await retainFile(requestBody, {
      filename: 'provider-request.json', contentType: 'application/json', private: true,
    });
    let responseFile = null;
    let downloadFile = null;
    if (exchange.response?.bodyBase64 !== undefined) {
      const raw = Buffer.from(exchange.response.bodyBase64, 'base64');
      need(raw.length === exchange.response.bytes && hash(raw) === exchange.response.sha256,
        'PROVIDER_BODY_IDENTITY_MISMATCH');
      responseFile = await retainFile(raw, {
        filename: context.filename ?? 'provider-response.bin',
        contentType: exchange.response.headers?.['content-type'] ?? 'application/octet-stream',
        private: true,
      });
      const containsSecret = secrets().some(secret => raw.includes(Buffer.from(secret)) ||
        raw.includes(Buffer.from(encodeURIComponent(secret))) ||
        raw.includes(Buffer.from(JSON.stringify(secret).slice(1, -1))));
      const safeValue = !exchange.parsed ||
        canonical(publicValue(exchange.parsed.value)) === canonical(exchange.parsed.value);
      const statement = exchange.request.downloadable === true &&
        ['csv', 'pdf', 'binary'].includes(exchange.request.responseFormat) && exchange.response.complete &&
        exchange.classification?.outcome === 'accepted';
      if (!containsSecret && safeValue && (statement || exchange.parsed)) {
        downloadFile = await retainFile(raw, {
          filename: statement ? 'original-statement.' + exchange.request.responseFormat : 'original-response.json',
          contentType: exchange.response.headers?.['content-type'] ?? 'application/octet-stream',
        });
      }
    }
    const receiptFile = await retainFile(jsonBytes(exchange), {
      filename: 'original-exchange.json', contentType: 'application/json', private: true,
    });
    const publicBody = {
      request: publicValue(exchange.request),
      startedAt: exchange.startedAt, finishedAt: exchange.finishedAt,
      transport: publicValue(exchange.transport),
      response: exchange.response ? {
        status: exchange.response.status, statusText: exchange.response.statusText,
        headers: publicValue(exchange.response.headers),
        bytes: exchange.response.bytes, sha256: exchange.response.sha256,
        complete: exchange.response.complete,
      } : null,
      parsed: publicValue(exchange.parsed), parseError: exchange.parseError,
      classification:exchange.classification,retry:exchange.retry??null,
      retryAfter:exchange.retryAfter??exchange.response?.headers?.['retry-after']??null,
    };
    const publicFile = await retainFile(jsonBytes(publicBody), {
      filename: 'provider-observation.json', contentType: 'application/json',
    });
    let rows = [];
    let projectionError = null;
    try {
      const projected = exchange.classification?.outcome === 'accepted' && exchange.response?.complete
        ? native.projectResource({
        exchange, environment: context.environment,
        sourceReference: {
          sourceId:id,connectionAlias:context.connectionAlias,
          sourceScope:sourceScope(connection(context.connectionAlias)),
          provider:exchange.request.provider ?? connection(context.connectionAlias).provider,
          network:publicConnection(context.connectionAlias,connection(context.connectionAlias)).network ?? null,
          networkPassphrase:publicConnection(context.connectionAlias,connection(context.connectionAlias)).networkPassphrase ?? null,
          observedAt:exchange.finishedAt ?? now(),requestAction: exchange.request.action, input: exchange.request.input,
        },
      }) : [];
      if(context.sdpWebhook&&projected.length) {
        const selection=context.sdpWebhook;
        need(exchange.request.provider==='sdp'&&!exchange.request.mutation&&exchange.request.method==='GET'&&
          exchange.request.action===selection.action&&sourceScope(connection(context.connectionAlias))===selection.sourceScope&&
          projected.length===1&&projected.every(row=>row.kind===selection.resourceKind&&
            normalizedNativeId(row.id)===normalizedNativeId(selection.resourceId)&&
            (selection.resourceKind!=='sdp-disbursement'||row.value?.source_wallet_id===selection.sourceWalletId)),
          'SDP_EVENT_RESOURCE_READBACK_MISMATCH');
      }
      rows=projected;
    } catch (error) { projectionError = publicError(error); }
    const source = {
      id, kind: context.kind ?? exchange.request.action,
      createdAt: exchange.finishedAt ?? now(), ...context,
      provider: exchange.request.provider ?? connection(context.connectionAlias).provider,
      sourceScope:sourceScope(connection(context.connectionAlias)),
      network:publicConnection(context.connectionAlias,connection(context.connectionAlias)).network ?? null,
      networkPassphrase:publicConnection(context.connectionAlias,connection(context.connectionAlias)).networkPassphrase ?? null,
      requestFileId: requestFile.id, responseFileId: responseFile?.id ?? null,
      receiptFileId: receiptFile.id, publicFileId: publicFile.id,
      downloadableFileId: downloadFile?.id ?? null,
      downloadFileName: downloadFile?.filename ?? null,
      downloadContentType: downloadFile?.contentType ?? null,
      privateBody: true, bodySha256: responseFile?.sha256 ?? null,
      bytes: responseFile?.bytes ?? 0, status: exchange.response?.status ?? null,
      bodyComplete: exchange.response?.complete ?? false,
      classification:exchange.classification,retry:exchange.retry??null,
      retryAfter:exchange.retryAfter??exchange.response?.headers?.['retry-after']??null,projectionError,
      error: exchange.transport.error ?? exchange.parseError ?? null,
    };
    transition('source.retained', { sourceId: id }, () => {
      source.versionIds = applyProjection(source, rows);
      return put('sources', source);
    });
    return source;
  }

  async function prepareOperation(args, requestId) {
    const previous = current('operations', requestId);
    if (previous) return previous;
    const selected = connection(args.connectionAlias);
    const input = clone(args.input ?? {});
    if (args.fileId) {
      const descriptor = file(args.fileId, { private: true });
      const body = await fileBytes(descriptor.id, { private: true });
      need(input.file === undefined, 'DUPLICATE_ORIGINAL_FILE_SELECTION');
      input.file = { filename: descriptor.filename, contentType: descriptor.contentType,
        bodyBase64: body.toString('base64'), bytes: descriptor.bytes, sha256: descriptor.sha256 };
    }
    const request = await native.buildRequest(selected, args.action, input);
    need(request.action === args.action && !request.headers?.Authorization &&
      !request.headers?.authorization, 'INVALID_NATIVE_PREPARATION');
    const operation = {
      id: requestId, action: args.action, input: clone(args.input ?? {}), fileId: args.fileId ?? null,
      connectionAlias: args.connectionAlias,
      connection: publicConnection(args.connectionAlias, selected),
      request, requestSha256: hash(Buffer.from(canonical(request))),
      evidence: clone(args.evidence ?? {}), state: 'PREPARED',
      readback: request.readback, resourceKind: request.resourceKind,
      resourceId: request.resourceId, environment: request.environment,
      attemptIds: [], sourceIds: [], createdAt: now(), updatedAt: now(),
    };
    const prepared = await retainFile(jsonBytes(operation), {
      filename: 'prepared-operation.json', contentType: 'application/json', private: true,
    });
    operation.preparedFileId = prepared.id;
    return transition('operation.prepared', { operationId: operation.id },
      () => put('operations', operation));
  }

  async function economicEvidence(operation) {
    if (!operation.request.mutation) return;
    const selection = operation.evidence ?? {};
    const evidence = {versions:{},sources:{},programme:null,payroll:null,instructions:null};
    for (const [name,id] of Object.entries(selection.versionIds ?? {})) {
      const value = requireRow('resourceVersions',id);
      need(value.environment === operation.environment,'EVIDENCE_ENVIRONMENT_MISMATCH');
      evidence.versions[name] = value;
      need(!Object.hasOwn(evidence,name),'RESERVED_EVIDENCE_NAME');
      evidence[name] = value;
    }
    for (const [name,id] of Object.entries(selection.sourceIds ?? {})) {
      const value = requireRow('sources',id);
      need(value.environment === operation.environment,'EVIDENCE_ENVIRONMENT_MISMATCH');
      const original = {...value,exchange:value.receiptFileId ?
        JSON.parse((await fileBytes(value.receiptFileId,{private:true})).toString()) : null};
      evidence.sources[name] = original;
      need(!Object.hasOwn(evidence,name),'DUPLICATE_EVIDENCE_NAME');
      evidence[name] = original;
    }
    if (selection.programmeVersionId) evidence.programme =
      requireRow('programmes',selection.programmeVersionId).definition;
    if (selection.payrollId) {
      const payroll = requireRow('payrolls',selection.payrollId);
      if (selection.programmeVersionId) need(payroll.programmeVersionId === selection.programmeVersionId,
        'PAYROLL_PROGRAMME_VERSION_MISMATCH');
      evidence.payroll = payroll.data;
    }
    if (selection.instructionId) {
      const instructions = requireRow('instructions',selection.instructionId);
      if(operation.fileId)need(operation.fileId === instructions.fileId,'INSTRUCTION_FILE_SELECTION_MISMATCH');
      if (selection.payrollId) need(instructions.payrollId === selection.payrollId,'INSTRUCTION_PAYROLL_MISMATCH');
      await fileBytes(instructions.fileId,{private:true});
      evidence.instructions = instructions;
    }
    await native.validateOperation({request:operation.request,evidence,now:now()});
  }

  async function retryAuthorization(operation,commandId) {
    need(operation.request.provider === 'bridge' && operation.request.method === 'POST',
      'ORIGINAL_RETRY_UNSUPPORTED');
    const lastAttempt = operation.attemptIds.length ?
      requireRow('attempts',operation.attemptIds.at(-1)) : null;
    need(lastAttempt?.sourceId && operation.sourceIds.at(-1) === lastAttempt.sourceId,
      'LATEST_ORIGINAL_RETRY_RESPONSE_REQUIRED');
    const source = requireRow('sources',lastAttempt.sourceId);
    const exchange = JSON.parse((await fileBytes(source.receiptFileId,{private:true})).toString());
    need(exchange.retry?.sameRequestSafe === true && exchange.response?.status === 409 &&
      exchange.response?.complete && exchange.retry.reason === 'BRIDGE_RESOURCE_STATE_CONFLICT',
      'NATIVE_ORIGINAL_RETRY_NOT_PERMITTED');
    need(hash(jsonBytes(exchange.request)) === hash(jsonBytes(operation.request)),
      'ORIGINAL_RETRY_REQUEST_CHANGED');
    const first = requireRow('attempts',operation.attemptIds[0]);
    const firstAt=Date.parse(first.startedAt),current=Date.now();
    need(Number.isFinite(firstAt) && current >= firstAt && current-firstAt < 24*3600000,
      'ORIGINAL_IDEMPOTENCY_WINDOW_EXPIRED');
    const retryAfter=exchange.retryAfter ?? exchange.response.headers?.['retry-after'];
    let eligibleAt=Date.parse(exchange.finishedAt);
    need(Number.isFinite(eligibleAt),'ORIGINAL_RETRY_TIME_REQUIRED');
    if(retryAfter!==undefined && retryAfter!==null && retryAfter!=='') {
      if(/^\d+(?:\.\d+)?$/.test(String(retryAfter)))
        eligibleAt+=Number(retryAfter)*1000;
      else {
        const parsed=Date.parse(String(retryAfter));
        need(Number.isFinite(parsed),'INVALID_ORIGINAL_RETRY_AFTER');
        eligibleAt=Math.max(eligibleAt,parsed);
      }
    }
    need(Number.isFinite(eligibleAt) && current>=eligibleAt,'ORIGINAL_RETRY_NOT_DUE');
    return{commandId,sourceId:source.id,firstStartedAt:first.startedAt,
      eligibleAt:new Date(eligibleAt).toISOString(),authorizedAt:now(),
      requestSha256:operation.requestSha256,reason:exchange.retry.reason};
  }

  async function dispatchOperation(operationId, commandId, signal, {retryOriginal=false} = {}) {
    const guard = await lease(workspaceDirectory, 'operation-' + hash(operationId));
    try {
      let operation = requireRow('operations', operationId);
      const attemptId = operation.state === 'DISPATCHING'
        ? operation.attemptIds.at(-1) : commandId + ':dispatch';
      need(attemptId, 'ORIGINAL_ATTEMPT_REQUIRED');
      const prior = current('attempts', attemptId);
      if (prior?.sourceId) return operation;
      if(retryOriginal)need(operation.state!=='PREPARED','LATEST_ORIGINAL_RETRY_RESPONSE_REQUIRED');
      if(retryOriginal && ['REJECTED','UNCERTAIN'].includes(operation.state)) {
        const authorization=await retryAuthorization(operation,commandId);
        operation=transition('operation.original-retry-selected',{operationId,commandId},() =>
          put('operations',{...operation,state:'RETRY_READY',retryAuthorization:authorization,updatedAt:now()}));
      }
      if(operation.state==='RETRY_READY') {
        need(retryOriginal,'ORIGINAL_RETRY_REQUEST_REQUIRED');
        if(operation.retryAuthorization?.commandId!==commandId) {
          const priorCommand=db.prepare('SELECT status FROM requests WHERE id=?')
            .get(operation.retryAuthorization?.commandId);
          const priorAttempt=current('attempts',operation.retryAuthorization?.commandId+':dispatch');
          need(priorCommand?.status==='FAILED' && !priorAttempt,'ORIGINAL_RETRY_REQUEST_REQUIRED');
          const authorization=await retryAuthorization(operation,commandId);
          operation=transition('operation.original-retry-reselected',{operationId,commandId},() =>
            put('operations',{...operation,
              retrySelectionHistory:[...(operation.retrySelectionHistory??[]),operation.retryAuthorization],
              retryAuthorization:authorization,updatedAt:now()}));
        }
      } else if(['ACCEPTED','REJECTED','UNCERTAIN','CANCELED'].includes(operation.state))return operation;
      connection(operation.connectionAlias, operation.connection);
      const attemptDirectory = path.join(workspaceDirectory, 'attempts', hash(attemptId));
      await directory(attemptDirectory);
      const responsePath = path.join(attemptDirectory, 'exchange.private.json');
      let exchange = await readJSON(responsePath, true);
      if (operation.state === 'DISPATCHING' && !exchange) {
        return transition('operation.uncertain', { operationId, attemptId }, () => {
          const original = operation.attemptIds.at(-1);
          if (original) {
            const row = requireRow('attempts', original);
            put('attempts', { ...row, status: 'UNCERTAIN', finishedAt: now() });
          }
          operation = { ...operation, state: 'UNCERTAIN', updatedAt: now() };
          return put('operations', operation);
        });
      }
      if (!exchange) {
        need(['PREPARED','RETRY_READY'].includes(operation.state),'OPERATION_NOT_PREPARED');
        if(operation.state==='RETRY_READY')await retryAuthorization(operation,commandId);
        if (operation.request.mutation) need(getMeta('dispatchEnabled') === true,
          'PROVIDER_DISPATCH_DISABLED');
        await economicEvidence(operation);
        transition('operation.dispatching', { operationId, attemptId }, () => {
          put('attempts', {
            id: attemptId, operationId, requestSha256: operation.requestSha256,
            originalRetry:operation.state==='RETRY_READY' ? operation.retryAuthorization : null,
            status: 'DISPATCHING', startedAt: now(),
          });
          operation = {
            ...operation, state: 'DISPATCHING', updatedAt: now(),
            attemptIds: [...operation.attemptIds, attemptId],
          };
          put('operations', operation);
        });
        const selected = connection(operation.connectionAlias, operation.connection);
        try {
          exchange = await native.executeProvider(operation.request,
            { connection: selected, signal });
        } catch (error) {
          exchange = {
            schema: 'bloccpay.original-provider-exchange.v1', request: operation.request,
            startedAt: requireRow('attempts', attemptId).startedAt, finishedAt: now(),
            transport: { status: 'uncertain', error: publicError(error) },
            response: null, parsed: null, parseError: null,
            classification: { outcome: 'uncertain', reason: 'Original dispatch has no complete response.' },
          };
        }
        await writeExact(responsePath, jsonBytes(exchange));
      }
      const source = await retainExchange(exchange, {
        sourceId: hash('attempt-source:' + attemptId),
        connectionAlias: operation.connectionAlias, operationId, attemptId,
        environment: operation.environment,
        ...(operation.evidence?.sdpWebhook?{sdpWebhook:clone(operation.evidence.sdpWebhook)}:{}),
      });
      return transition('operation.observed', { operationId, attemptId, sourceId: source.id }, () => {
        const status = exchange.classification.outcome.toUpperCase();
        need(['ACCEPTED', 'REJECTED', 'UNCERTAIN'].includes(status), 'INVALID_PROVIDER_OUTCOME');
        put('attempts', {
          ...requireRow('attempts', attemptId), status,
          finishedAt: exchange.finishedAt, sourceId: source.id,
        });
        return put('operations', {
          ...operation, state: status, updatedAt: now(),
          sourceIds: [...new Set([...operation.sourceIds, source.id])],
          outcome:exchange.classification,retry:exchange.retry??null,
          retryAfter:exchange.retryAfter??exchange.response?.headers?.['retry-after']??null,
          firstAttemptAt:requireRow('attempts',operation.attemptIds[0]).startedAt,
        });
      });
    } finally { await guard.release(); }
  }

  async function reconcileOperation(args, requestId, signal) {
    const original = requireRow('operations', args.operationId);
    need(original.readback, 'NATIVE_READBACK_UNAVAILABLE');
    const sdpWebhook=original.evidence?.sdpWebhook;
    if(sdpWebhook) {
      need(original.request.provider==='sdp'&&original.request.mutation===false&&original.request.method==='GET'&&
        original.action===sdpWebhook.action&&original.readback.action===sdpWebhook.action&&
        original.readback.resourceKind===sdpWebhook.resourceKind&&
        normalizedNativeId(original.readback.resourceId)===normalizedNativeId(sdpWebhook.resourceId)&&
        canonical(original.readback.input)===canonical(original.input),'SDP_EVENT_READBACK_CHANGED');
      connection(original.connectionAlias,original.connection);
    }
    const read = await prepareOperation({
      connectionAlias: original.connectionAlias,
      action: original.readback.action, input: original.readback.input,
      ...(sdpWebhook?{evidence:{sdpWebhook:clone(sdpWebhook)}}:{}),
    }, requestId + ':readback');
    need(read.request.mutation === false, 'RECONCILIATION_MUST_BE_READ_ONLY');
    if(sdpWebhook)need(read.request.provider==='sdp'&&read.request.method==='GET'&&
      read.action===original.readback.action&&canonical(read.input)===canonical(original.readback.input)&&
      read.connectionAlias===original.connectionAlias&&canonical(read.connection)===canonical(original.connection)&&
      canonical(read.evidence?.sdpWebhook)===canonical(sdpWebhook),'SDP_EVENT_READBACK_CHANGED');
    const observed = await dispatchOperation(read.id, requestId, signal);
    const sources = observed.sourceIds.map(id => requireRow('sources', id));
    const versions = sources.flatMap(source => source.versionIds)
      .map(id => requireRow('resourceVersions', id));
    const readbackResourceId = original.readback.resourceId ?? original.resourceId;
    const readbackResourceKind = original.readback.resourceKind ?? original.resourceKind;
    const matching = versions.filter(version =>
      normalizedNativeId(version.resourceId) === normalizedNativeId(readbackResourceId) &&
      version.kind === readbackResourceKind &&
      version.environment === original.environment &&
      version.connectionAlias === original.connectionAlias);
    return transition('operation.reconciled', { operationId: original.id }, () => {
      const latest = requireRow('operations', original.id);
      return put('operations', {
        ...latest, updatedAt: now(),
        reconciliation: {
          operationId: observed.id, observedState: observed.state,
          sourceIds: observed.sourceIds, versionIds: matching.map(row => row.id),
          matched: matching.length > 0, observedAt: now(),
        },
      });
    });
  }

  async function runCapture(args, commandId, signal) {
    const guard = await lease(workspaceDirectory, 'capture-' + hash(args.captureId));
    try {
      let capture = requireRow('captures', args.captureId);
      if (capture.status === 'COMPLETE') return capture;
      connection(capture.connectionAlias, capture.connection);
      if (['PAUSED', 'PARTIAL'].includes(capture.status)) {
        capture = transition('capture.resumed', { captureId: capture.id }, () =>
          put('captures', {
            ...capture, status: 'RUNNING', pendingOperationId: null,
            error: null, updatedAt: now(),
          }));
      }
      const maxPages = Number(args.maxPages ?? 100);
      need(Number.isSafeInteger(maxPages) && maxPages > 0 && maxPages <= 10000,
        'INVALID_PAGE_LIMIT');
      for (let index = 0; index < maxPages; index++) {
        signal?.throwIfAborted();
        capture = requireRow('captures', args.captureId);
        if (capture.status === 'PAUSED') return capture;
        const pageIndex = capture.pages.length;
        let pageId = capture.pendingOperationId;
        if (!pageId) {
          const attempt = (capture.pageAttempts ?? []).filter(row => row.index === pageIndex).length;
          pageId = capture.id + ':page:' + pageIndex + ':attempt:' + attempt;
          capture = transition('capture.page-selected', { captureId: capture.id, pageId }, () =>
            put('captures', {
              ...capture, pendingOperationId: pageId, status: 'RUNNING',
              pageAttempts: [...(capture.pageAttempts ?? []), {
                index: pageIndex, operationId: pageId, selectedAt: now(),
              }],
            }));
        }
        let operation = await prepareOperation({
          connectionAlias: capture.connectionAlias,
          action: capture.next.action, input: capture.next.input,
        }, pageId);
        need(!operation.request.mutation, 'CAPTURE_MUST_BE_READ_ONLY');
        operation = await dispatchOperation(pageId, pageId, signal);
        const source = operation.sourceIds.length ?
          requireRow('sources', operation.sourceIds.at(-1)) : null;
        if (operation.state !== 'ACCEPTED' || !source?.bodyComplete) {
          return transition('capture.interrupted', { captureId: capture.id }, () =>
            put('captures', {
              ...capture, status: 'PARTIAL', updatedAt: now(),
              pendingOperationId: operation.id,
              error: { code: 'ORIGINAL_PAGE_INCOMPLETE', state: operation.state },
            }));
        }
        const exchange = JSON.parse((await fileBytes(source.receiptFileId, { private: true })).toString());
        if (capture.pages.some(page => page.bodySha256 === source.bodySha256)) {
          return transition('capture.repeated-page', { captureId: capture.id }, () =>
            put('captures', {
              ...capture, status: 'PARTIAL', updatedAt: now(),
              rejectedSourceIds: [...(capture.rejectedSourceIds ?? []), source.id],
              error: { code: 'REPEATED_NATIVE_PAGE' },
            }));
        }
        const continuation = native.nextPageRequest({ request: operation.request, exchange });
        need(continuation && typeof continuation.done === 'boolean', 'INVALID_NATIVE_CONTINUATION');
        const next = continuation.done ? null : {
          action: continuation.action, input: continuation.input,
        };
        if (next) need(canonical(next) !== canonical(capture.next), 'UNCHANGED_NATIVE_CURSOR');
        capture = transition('capture.page', { captureId: capture.id, sourceId: source.id }, () =>
          put('captures', {
            ...capture, status: continuation.done ? 'COMPLETE' : 'RUNNING',
            pages: [...capture.pages, {
              index: pageIndex, sourceId: source.id,
              requestSha256: operation.requestSha256, bodySha256: source.bodySha256,
            }],
            next, pendingOperationId: null, error: null, updatedAt: now(),
          }));
        if (capture.status === 'COMPLETE') return capture;
      }
      return capture;
    } finally { await guard.release(); }
  }

  async function importSource(args, requestId) {
    const previous = current('sources', requestId);
    if (previous) return previous;
    const descriptor = file(args.fileId, { private: true });
    const body = await fileBytes(descriptor.id, { private: true });
    const selected = connection(args.connectionAlias);
    const prepared = await native.buildRequest(selected, args.action, args.input ?? {});
    let parsed = null;
    let parseError = null;
    if (prepared.responseFormat === 'json') {
      try { parsed = parseSourceJSON(body); }
      catch (error) { parseError = publicError(error); }
    }
    const status = args.status ?? 200;
    need(Number.isInteger(status) && status >= 100 && status <= 599, 'INVALID_ORIGINAL_HTTP_STATUS');
    const complete = args.bodyComplete !== false;
    const outcome = !complete || parseError || status === 409 || status >= 500 ? 'uncertain' :
      status >= 200 && status < 300 ? 'accepted' : 'rejected';
    const exchange = {
      schema: 'bloccpay.imported-provider-exchange.v1', request: prepared,
      startedAt: args.observedAt ?? now(), finishedAt: args.observedAt ?? now(),
      transport: { status: 'received', imported: true },
      response: {
        status, statusText: '', headers: { 'content-type': descriptor.contentType },
        bodyBase64: body.toString('base64'), bytes: body.length, sha256: hash(body),
        complete,
      },
      parsed, parseError,
      classification: { outcome, reason: 'Original imported HTTP status and body completeness; no provider dispatch.' },
    };
    return retainExchange(exchange, {
      sourceId: requestId, connectionAlias: args.connectionAlias,
      environment: prepared.environment, imported: true,
      originalFileId: descriptor.id,
    });
  }


  function selectedSDPEndpoint(selected, endpoint) {
    const descriptor=describeConnection(selected);
    need(descriptor.provider==='sdp','SDP_EVENT_PROVIDER_MISMATCH');
    need(endpoint&&endpoint.sourceWalletId===descriptor.sourceWalletId&&
      typeof endpoint.tenantId==='string'&&endpoint.tenantId.length>0&&
      endpoint.origin===descriptor.baseUrl,'SDP_ENDPOINT_SCOPE_MISMATCH');
    if(selected.tenantId!==undefined)need(endpoint.tenantId===selected.tenantId,'SDP_ENDPOINT_TENANT_MISMATCH');
    return descriptor;
  }

  async function retainSDPWebhook({connectionAlias,subscriptionId,body,headers},selected,endpoint) {
    const raw=Buffer.from(body),receivedAt=now();
    const bodyFile=await retainFile(raw,{
      filename:'sdp-webhook-original.json',contentType:'application/json',private:true,
    });
    const signatureFile=await retainFile(jsonBytes({headers,receivedAt}),{
      filename:'sdp-webhook-headers.json',contentType:'application/json',private:true,
    });
    let event=null,error=null;
    try {
      selectedSDPEndpoint(selected,endpoint);
      event=await native.verifyWebhook({provider:'sdp',rawBody:raw,headers,configuration:endpoint,receivedAt});
      need(event?.verified===true&&event.provider==='sdp'&&event.rawSha256===bodyFile.sha256&&
        event.bytes===bodyFile.bytes&&event.eventId===event.value?.event_id&&
        canonical(event.scope)===canonical({tenantId:endpoint.tenantId,
          sourceWalletId:endpoint.sourceWalletId,origin:endpoint.origin}),'SDP_VERIFIED_EVENT_CHANGED');
    }catch(problem){event=null;error=publicError(problem);}
    if(!event) {
      const id=hash(jsonBytes(['sdp-rejected',connectionAlias,subscriptionId,bodyFile.sha256,signatureFile.sha256]));
      transition('webhook.rejected',{webhookId:id,provider:'sdp'},()=>put('webhooks',{
        id,provider:'sdp',connectionAlias,subscriptionId,bodyFileId:bodyFile.id,
        signatureFileId:signatureFile.id,rawSha256:bodyFile.sha256,bytes:bodyFile.bytes,
        verified:false,status:'REJECTED',eventType:null,createdAt:receivedAt,error,
        receptions:[{receivedAt,signatureFileId:signatureFile.id}],
      }));
      return {accepted:false,id,replayed:false,status:'rejected',error};
    }
    const descriptor=publicConnection(connectionAlias,selected),scope=clone(event.scope);
    const eventKey={provider:'sdp',environment:descriptor.environment,scope,eventId:event.eventId};
    const id=hash(jsonBytes(eventKey)),sourceId='webhook-'+id;
    const selection={schema:'bloccpay.sdp-webhook-readback-selection.v1',eventKey,
      connection:descriptor,sourceScope:sourceScope(selected),readback:clone(event.readback)};
    need(selection.readback&&['sdp.disbursement.get','sdp.distribution-wallet.get'].includes(selection.readback.action),
      'SDP_EVENT_READBACK_REQUIRED');
    const selectionSha256=hash(jsonBytes(selection));
    const eventFile=await retainFile(jsonBytes(event),{
      filename:'sdp-verified-event.json',contentType:'application/json',private:true,
    });
    const metadata={schema:'bloccpay.sdp-event-metadata.v1',eventKey,eventType:event.eventType,
      occurredAt:event.value.occurred_at,rawSha256:bodyFile.sha256,bytes:bodyFile.bytes,
      selection,selectionSha256,ledgerAction:'NONE'};
    const publicFile=await retainFile(jsonBytes(publicValue(metadata)),{
      filename:'sdp-event-metadata.json',contentType:'application/json',
    });
    // The decision is made inside the original SQLite transaction after all async
    // file work. A concurrent delivery can never overwrite the first event.
    return transition('sdp.webhook.admitted',{webhookId:id,eventId:event.eventId},()=>{
      const previous=current('webhooks',id);
      const reception={receivedAt,connectionAlias,subscriptionId,signatureFileId:signatureFile.id,
        bodyFileId:bodyFile.id,eventFileId:eventFile.id,rawSha256:bodyFile.sha256};
      if(previous) {
        need(previous.provider==='sdp'&&canonical(previous.eventKey)===canonical(eventKey),'SDP_EVENT_IDENTITY_CONFLICT');
        if(previous.rawSha256!==bodyFile.sha256) {
          const conflictId=hash(jsonBytes(['sdp-event-conflict',id,bodyFile.sha256]));
          const conflict=current('webhooks',conflictId);
          put('webhooks',{...(conflict??{}),id:conflictId,provider:'sdp',connectionAlias,subscriptionId,
            eventKey,eventId:event.eventId,eventType:event.eventType,bodyFileId:bodyFile.id,
            signatureFileId:signatureFile.id,eventFileId:eventFile.id,rawSha256:bodyFile.sha256,
            bytes:bodyFile.bytes,verified:true,status:'CONFLICT',conflictsWith:id,
            createdAt:conflict?.createdAt??receivedAt,
            receptions:[...(conflict?.receptions??[]),reception]});
          put('webhooks',{...previous,conflictIds:[...new Set([...(previous.conflictIds??[]),conflictId])]});
          return {accepted:false,id,replayed:!!conflict,status:'conflict',conflictId,eventKey};
        }
        // Same event bytes may arrive through another selected subscription.
        // Keep the original connection and readback command, never rebind them.
        put('webhooks',{...previous,receptions:[...(previous.receptions??[]),reception]});
        return {accepted:true,id,replayed:true,status:'duplicate',eventKey,
          sourceId:previous.sourceId,readback:clone(previous.readback)};
      }
      const source={id:sourceId,kind:'sdp.event-metadata',provider:'sdp',connectionAlias,
        sourceScope:selection.sourceScope,environment:descriptor.environment,createdAt:receivedAt,
        network:descriptor.network??null,networkPassphrase:descriptor.networkPassphrase??null,
        responseFileId:bodyFile.id,publicFileId:publicFile.id,privateBody:true,
        bodySha256:bodyFile.sha256,bytes:bodyFile.bytes,status:null,bodyComplete:true,
        webhookId:id,eventId:event.eventId,eventType:event.eventType,selection,selectionSha256,
        versionIds:[],ledgerAction:'NONE'};
      const record={id,provider:'sdp',connectionAlias,subscriptionId,eventKey,eventId:event.eventId,
        eventType:event.eventType,bodyFileId:bodyFile.id,signatureFileId:signatureFile.id,
        eventFileId:eventFile.id,rawSha256:bodyFile.sha256,bytes:bodyFile.bytes,
        verified:true,status:'RETAINED',createdAt:receivedAt,error:null,sourceId,
        connection:descriptor,selection,selectionSha256,conflictIds:[],receptions:[reception],
        readback:{status:'SELECTED',operationId:'sdp-event-read:'+id,
          dispatchId:'sdp-event-dispatch:'+id,sourceIds:[],versionIds:[]}};
      need(!current('sources',sourceId),'SDP_EVENT_SOURCE_CONFLICT');
      put('sources',source);put('webhooks',record);
      return {accepted:true,id,replayed:false,status:'accepted',eventKey,sourceId,readback:clone(record.readback)};
    });
  }

  async function projectSDPWebhook(args,requestId,signal) {
    const guard=await lease(workspaceDirectory,'sdp-event-'+hash(args.webhookId));
    let primary=null;
    try {
      let row=requireRow('webhooks',args.webhookId);
      need(row.provider==='sdp'&&row.verified&&row.status!=='CONFLICT'&&!row.conflictsWith,'SDP_EVENT_NOT_ADMITTED');
      const selected=connection(row.connectionAlias,row.connection);
      selectedSDPEndpoint(selected,selected.webhookEndpoints?.[row.subscriptionId]);
      need(hash(jsonBytes(row.selection))===row.selectionSha256&&
        canonical(row.selection.connection)===canonical(row.connection),'SDP_EVENT_SELECTION_CHANGED');
      const metadata=requireRow('sources',row.sourceId);
      need(metadata.webhookId===row.id&&metadata.bodySha256===row.rawSha256&&
        metadata.selectionSha256===row.selectionSha256&&metadata.versionIds.length===0,'SDP_EVENT_SOURCE_CHANGED');
      const event=JSON.parse((await fileBytes(row.eventFileId,{private:true})).toString());
      await fileBytes(row.bodyFileId,{private:true});
      need(event.rawSha256===row.rawSha256&&event.eventId===row.eventId&&
        canonical(event.scope)===canonical(row.eventKey.scope)&&
        canonical(event.readback)===canonical(row.selection.readback),'SDP_EVENT_SELECTION_CHANGED');
      if(row.readback.status==='COMPLETE')return row;
      const readback=row.selection.readback;
      const constraint={webhookId:row.id,selectionSha256:row.selectionSha256,
        action:readback.action,resourceKind:readback.resourceKind,resourceId:readback.resourceId,sourceWalletId:row.eventKey.scope.sourceWalletId,
        sourceScope:row.selection.sourceScope};
      const operation=await prepareOperation({connectionAlias:row.connectionAlias,
        action:readback.action,input:readback.input,evidence:{sdpWebhook:constraint}},row.readback.operationId);
      need(operation.request.mutation===false&&operation.request.method==='GET'&&
        operation.action===readback.action&&canonical(operation.input)===canonical(readback.input)&&
        canonical(operation.connection)===canonical(row.connection)&&
        canonical(operation.evidence.sdpWebhook)===canonical(constraint),'SDP_EVENT_READBACK_CHANGED');
      let observed,reconciliation=null;
      if(operation.reconciliation) {
        // Only an explicitly reconciled original operation can select a later
        // read. Reopening this event never dispatches that read or its original.
        reconciliation=clone(operation.reconciliation);
        observed=requireRow('operations',reconciliation.operationId);
        need(observed.id!==operation.id&&observed.request.provider==='sdp'&&
          observed.request.mutation===false&&observed.request.method==='GET'&&
          observed.action===readback.action&&canonical(observed.input)===canonical(readback.input)&&
          observed.connectionAlias===row.connectionAlias&&canonical(observed.connection)===canonical(row.connection)&&
          canonical(observed.evidence?.sdpWebhook)===canonical(constraint)&&
          canonical(reconciliation.sourceIds)===canonical(observed.sourceIds)&&
          reconciliation.observedState===observed.state,'SDP_EVENT_RECONCILIATION_CHANGED');
      } else observed=await dispatchOperation(operation.id,row.readback.dispatchId,signal);
      const sources=observed.sourceIds.map(id=>requireRow('sources',id));
      need(sources.every(source=>source.operationId===observed.id&&source.provider==='sdp'&&
        source.sourceScope===row.selection.sourceScope&&source.connectionAlias===row.connectionAlias&&
        canonical(source.sdpWebhook)===canonical(constraint)),'SDP_EVENT_READBACK_SOURCE_CHANGED');
      const versions=sources.flatMap(source=>source.versionIds??[]).map(id=>requireRow('resourceVersions',id));
      const matching=versions.filter(version=>version.kind===readback.resourceKind&&
        normalizedNativeId(version.resourceId)===normalizedNativeId(readback.resourceId)&&
        version.environment===operation.environment&&observed.sourceIds.includes(version.sourceId)&&
        version.sourceScope===row.selection.sourceScope&&version.connectionAlias===row.connectionAlias);
      if(reconciliation)need(canonical(reconciliation.versionIds)===canonical(matching.map(version=>version.id))&&
        reconciliation.matched===(matching.length>0),'SDP_EVENT_RECONCILIATION_CHANGED');
      const complete=observed.state==='ACCEPTED'&&sources.length>0&&
        sources.every(source=>source.bodyComplete&&!source.projectionError)&&matching.length>0&&matching.length===versions.length;
      row=requireRow('webhooks',row.id);
      const result={...row,status:complete?'PROJECTED':'READBACK_INCOMPLETE',
        readback:{...row.readback,status:complete?'COMPLETE':'INCOMPLETE',
          observedOperationId:observed.id,reconciliation,
          observedState:observed.state,sourceIds:observed.sourceIds,versionIds:matching.map(version=>version.id),
          error:complete?null:{code:'ORIGINAL_SDP_READBACK_INCOMPLETE',operationId:operation.id,
            observedOperationId:observed.id}}};
      if(canonical(row)===canonical(result))return row;
      return transition('sdp.webhook.readback',{webhookId:row.id,operationId:operation.id,requestId},()=>put('webhooks',result));
    }catch(error){primary=error;throw error;}
    finally{
      try{await guard.release();}
      catch(error){if(primary)primary.cleanupError=publicError(error);else throw error;}
    }
  }

  async function webhook({ connectionAlias, subscriptionId, body, headers = {} }) {
    const selected = connection(connectionAlias);
    const endpoint = selected.webhookEndpoints?.[subscriptionId];
    need(endpoint,'WEBHOOK_ENDPOINT_NOT_CONFIGURED');
    if(selected.provider==='sdp')return retainSDPWebhook({connectionAlias,subscriptionId,body,headers},selected,endpoint);
    const raw = Buffer.from(body);
    const receivedAt = now();
    const bodyFile = await retainFile(raw, {
      filename: 'webhook-original.json', contentType: 'application/json', private: true,
    });
    let event = null;
    let error = null;
    try { event = await native.verifyWebhook({
      provider:selected.provider,rawBody:raw,headers,receivedAt,
      configuration:endpoint,
    }); }
    catch (problem) { error = publicError(problem); }
    const signatureFile = await retainFile(jsonBytes({ headers, receivedAt }), {
      filename: 'webhook-headers.json', contentType: 'application/json', private: true,
    });
    const verified = event?.verified === true;
    const receiptId = hash(Buffer.from(canonical([
      connectionAlias, subscriptionId, verified ? 'verified' : 'rejected',
      bodyFile.sha256, verified ? (event.canonicalSha256 ?? event.rawSha256 ?? bodyFile.sha256) : signatureFile.sha256,
    ])));
    const previous = current('webhooks', receiptId);
    if (previous) {
      transition('webhook.redelivered', { webhookId: receiptId, verified }, () =>
        put('webhooks', {
          ...previous,
          receptions: [...(previous.receptions ?? []), {
            receivedAt: now(), signatureFileId: signatureFile.id,
          }],
        }));
      return { accepted: verified, id: receiptId, replayed: true };
    }
    const record = {
      id: receiptId, connectionAlias, provider:selected.provider, subscriptionId, bodyFileId: bodyFile.id,
      signatureFileId: signatureFile.id, rawSha256: bodyFile.sha256,
      bytes: bodyFile.bytes, verified: event?.verified === true,
      eventType: event?.eventType ?? null,
      createdAt: now(), status: event?.verified ? 'RETAINED' : 'REJECTED', error,
      receptions: [{ receivedAt: now(), signatureFileId: signatureFile.id }],
    };
    if (event?.canonicalBase64) {
      const canonicalBody = Buffer.from(event.canonicalBase64, 'base64');
      need(hash(canonicalBody) === event.canonicalSha256, 'CANONICAL_WEBHOOK_HASH_MISMATCH');
      const canonicalFile = await retainFile(canonicalBody, {
        filename: 'webhook-canonical.json', contentType: 'application/json', private: true,
      });
      record.canonicalFileId = canonicalFile.id;
      record.canonicalSha256 = canonicalFile.sha256;
    }
    const verifiedEvent = event ? await retainFile(jsonBytes(event), {
      filename: 'verified-webhook.json', contentType: 'application/json', private: true,
    }) : null;
    record.eventFileId = verifiedEvent?.id ?? null;
    transition('webhook.retained', { webhookId: receiptId }, () => put('webhooks', record));
    return { accepted: record.verified, id: receiptId, replayed: false };
  }

  async function projectWebhook(args,requestId,signal) {
    const row = requireRow('webhooks', args.webhookId);
    if(row.provider==='sdp')return projectSDPWebhook(args,requestId,signal);
    need(row.verified, 'WEBHOOK_NOT_VERIFIED');
    if (row.status === 'PROJECTED') return row;
    const event = JSON.parse((await fileBytes(row.eventFileId, { private: true })).toString());
    const selected = connection(row.connectionAlias);
    const descriptor=publicConnection(row.connectionAlias,selected);
    const publicFile = await retainFile(jsonBytes(publicValue(event)), {
      filename: 'verified-webhook-public.json', contentType: 'application/json',
    });
    const source = {
      id: 'webhook-' + row.id, kind: row.eventType, connectionAlias: row.connectionAlias,
      environment:descriptor.environment,createdAt:row.createdAt,
      sourceScope:sourceScope(selected),provider:descriptor.provider,
      network:descriptor.network??null,networkPassphrase:descriptor.networkPassphrase??null,
      responseFileId: row.bodyFileId, publicFileId: publicFile.id,
      privateBody: true, bodySha256: row.rawSha256, bytes: row.bytes,
      status: null, bodyComplete: true, webhookId: row.id,
    };
    const rows = native.projectResource({
      event, provider:selected.provider, eventType: row.eventType, environment: source.environment,
      sourceReference:{sourceId:source.id,connectionAlias:row.connectionAlias,
        sourceScope:source.sourceScope,provider:descriptor.provider,
        organizationId:descriptor.organizationId??null,network:descriptor.network??null,
        networkPassphrase:descriptor.networkPassphrase??null,observedAt:row.createdAt},
    });
    return transition('webhook.projected', { webhookId: row.id }, () => {
      source.versionIds = applyProjection(source, rows);
      put('sources', source);
      return put('webhooks', { ...row, status: 'PROJECTED', sourceId: source.id });
    });
  }


  function pointer(value, selected = '') {
    if (selected === null || selected === '') return value;
    need(typeof selected === 'string' && selected.startsWith('/'),'INVALID_JSON_POINTER');
    for (const part of selected.slice(1).split('/')) {
      need(!/~(?:[^01]|$)/.test(part),'INVALID_JSON_POINTER');
      const key = part.replace(/~1/g,'/').replace(/~0/g,'~');
      need(value !== null && typeof value === 'object' && Object.hasOwn(value,key),
        'SOURCE_POINTER_NOT_FOUND',{pointer:selected});
      value = value[key];
    }
    return value;
  }

  async function saveProgramme(args, requestId) {
    const previous = current('programmes',requestId);
    if (previous) return previous;
    const input = clone(args.definition);
    if (args.programmeId) {
      need(!input.id || input.id === args.programmeId,'PROGRAMME_ID_MISMATCH');
      input.id = args.programmeId;
    }
    input.id ??= requestId;
    const definition = await normalizeProgramme(input);
    const sourceIds = [...new Set(args.sourceIds ?? [])];
    for (const id of sourceIds) requireRow('sources',id);
    for (const alias of Object.values(definition.connectionAliases ?? {}).flat()) {
      if (typeof alias === 'string') connection(alias);
    }
    return transition('programme.saved',{programmeId:definition.id},() => {
      const versions = listAll('programmes').filter(row => row.programmeId === definition.id);
      return put('programmes',{
        id:requestId,programmeId:definition.id,version:versions.length+1,
        sha256:hash(jsonBytes(definition)),definition,sourceIds,createdAt:now(),
      });
    });
  }

  async function importPayroll(args, requestId) {
    const previous = current('payrolls',requestId);
    if (previous) return previous;
    const programme = requireRow('programmes',args.programmeVersionId);
    const descriptor = file(args.fileId,{private:true});
    const body = await fileBytes(descriptor.id,{private:true});
    need(['csv','json'].includes(args.format),'INVALID_PAYROLL_FORMAT');
    const parsed = args.format === 'csv' ? parseLedgerCSV(body) : parseSourceJSON(body);
    const recordsPath = args.recordsPath ?? '';
    need(args.format !== 'csv' || recordsPath === '','CSV_RECORDS_PATH_UNSUPPORTED');
    const rows = pointer(parsed.value,recordsPath);
    need(Array.isArray(rows),'PAYROLL_ROWS_REQUIRED');
    const sourceId = requestId + ':original';
    const original = {
      sourceId,fileId:descriptor.id,sha256:descriptor.sha256,bytes:descriptor.bytes,
      format:args.format,recordsPath,numberTokens:parsed.numberTokens ?? {},
    };
    // Retain an original source before domain validation so rejected rows remain reviewable.
    if (!current('sources',sourceId)) transition('payroll.original-retained',{sourceId},() =>
      put('sources',{
        id:sourceId,kind:'payroll.original',provider:'ledger',
        programmeId:programme.programmeId,programmeVersionId:programme.id,
        environment:programme.definition.environment,sourceScope:'payroll:' + programme.programmeId,
        originalFileId:descriptor.id,responseFileId:descriptor.id,privateBody:true,
        bodySha256:descriptor.sha256,bytes:descriptor.bytes,bodyComplete:true,
        format:args.format,recordsPath,versionIds:[],createdAt:now(),
      }));
    const data = await normalizePayroll({id:requestId,rows,original},{programme:programme.definition});
    return transition('payroll.imported',{payrollId:requestId,sourceId},() => put('payrolls',{
      id:requestId,programmeId:programme.programmeId,programmeVersionId:programme.id,
      sha256:hash(jsonBytes(data)),data,sourceId,fileId:descriptor.id,createdAt:now(),
    }));
  }

  async function prepareInstructions(args, requestId) {
    const previous = current('instructions',requestId);
    if (previous) return previous;
    const payroll = requireRow('payrolls',args.payrollId);
    const programme = requireRow('programmes',payroll.programmeVersionId);
    const wallet = requireRow('resourceVersions',args.walletVersionId);
    const disbursement = requireRow('resourceVersions',args.disbursementVersionId);
    need(wallet.environment === programme.definition.environment &&
      disbursement.environment === programme.definition.environment,'INSTRUCTION_ENVIRONMENT_MISMATCH');
    const generated = await buildPayrollInstructions(payroll.data,{
      programme:programme.definition,wallet,disbursement,
    });
    const body = Buffer.from(generated.bodyBase64,'base64');
    need(body.length === generated.bytes && hash(body) === generated.sha256,
      'INSTRUCTION_BODY_IDENTITY_MISMATCH');
    const saved = await retainFile(body,{
      filename:generated.filename,contentType:generated.contentType,private:false,
    });
    return transition('payroll.instructions',{instructionId:requestId},() => put('instructions',{
      id:requestId,payrollId:payroll.id,programmeId:programme.programmeId,
      programmeVersionId:programme.id,walletVersionId:wallet.id,disbursementVersionId:disbursement.id,
      fileId:saved.id,file:{...saved,url:'/api/file/'+saved.id},
      sha256:saved.sha256,bytes:saved.bytes,rowIds:generated.rowIds,
      providerContract:generated.providerContract,createdAt:now(),
    }));
  }

  async function startCapture(args, requestId) {
    const previous = current('captures',requestId);
    if (previous) return previous;
    const selected = connection(args.connectionAlias,args.connection);
    const request = await native.buildRequest(selected,args.action,args.input);
    need(!request.mutation,'CAPTURE_MUST_BE_READ_ONLY');
    return transition('capture.started',{captureId:requestId},() => put('captures',{
      id:requestId,connectionAlias:args.connectionAlias,action:args.action,
      input:clone(args.input),connection:publicConnection(args.connectionAlias,selected),
      programmeId:args.programmeId ?? null,runId:args.runId ?? null,
      status:'READY',pages:[],next:{action:args.action,input:clone(args.input)},
      createdAt:now(),updatedAt:now(),
    }));
  }

  async function saveCollection(args, requestId) {
    const previous = current('collections',requestId);
    if (previous) return previous;
    const programme = requireRow('programmes',args.programmeVersionId);
    if (args.payrollId) need(requireRow('payrolls',args.payrollId).programmeVersionId === programme.id,
      'PAYROLL_PROGRAMME_VERSION_MISMATCH');
    need(typeof args.name === 'string' && args.name.trim(),'NAME_REQUIRED');
    const intervalSeconds = args.intervalSeconds ?? 900;
    need(Number.isSafeInteger(intervalSeconds) && intervalSeconds >= 60 &&
      intervalSeconds <= 86400,'INVALID_COLLECTION_INTERVAL');
    need(Array.isArray(args.tasks) && args.tasks.length > 0 && args.tasks.length <= 1000,
      'COLLECTION_TASKS_REQUIRED');
    const ids = new Set(),tasks = [];
    for (const input of args.tasks) {
      need(typeof input.id === 'string' && input.id && !ids.has(input.id),'DUPLICATE_TASK_ID');
      ids.add(input.id);
      const selected = connection(input.connectionAlias);
      const request = await native.buildRequest(selected,input.action,input.input ?? {});
      need(!request.mutation,'COLLECTION_MUST_BE_READ_ONLY');
      need(request.environment === programme.definition.environment,'COLLECTION_ENVIRONMENT_MISMATCH');
      tasks.push({id:input.id,connectionAlias:input.connectionAlias,action:input.action,
        input:clone(input.input ?? {}),required:input.required !== false,
        connection:publicConnection(input.connectionAlias,selected)});
    }
    const definition = {name:args.name.trim(),programmeVersionId:programme.id,
      payrollId:args.payrollId ?? null,intervalSeconds,tasks};
    return transition('collection.saved',{collectionId:requestId},() => put('collections',{
      ...definition,id:requestId,programmeId:programme.programmeId,
      definitionSha256:hash(jsonBytes(definition)),enabled:false,createdAt:now(),updatedAt:now(),
    }));
  }

  async function collectionRun(args, requestId, signal) {
    let run = current('runs',requestId);
    if (!run) {
      const collection = requireRow('collections',args.collectionId);
      const scheduledFor = args.scheduledFor ?? now();
      need(Number.isFinite(Date.parse(scheduledFor)),'INVALID_SCHEDULED_TIME');
      const tasks = collection.tasks.map(task => ({
        ...clone(task),captureId:hash('collection-capture:' + requestId + ':' + task.id),
      }));
      run = transition('collection.run-started',{collectionId:collection.id,runId:requestId},() =>
        put('runs',{id:requestId,collectionId:collection.id,programmeId:collection.programmeId,
          programmeVersionId:collection.programmeVersionId,payrollId:collection.payrollId,
          collectionSha256:collection.definitionSha256,tasks,scheduledFor,
          status:'READY',passes:[],createdAt:now(),updatedAt:now()}));
    }
    return continueRun({runId:run.id,maxPages:args.maxPages},requestId + ':initial',signal);
  }

  async function continueRun(args, requestId, signal) {
    const guard = await lease(workspaceDirectory,'run-' + hash(args.runId));
    try {
      let run = requireRow('runs',args.runId);
      if (run.status === 'COMPLETE') return run;
      const previous = run.passes.find(pass => pass.requestId === requestId);
      if (previous?.completedAt) return run;
      run = transition('run.continuing',{runId:run.id,requestId},() => put('runs',{
        ...run,status:'RUNNING',activePassId:requestId,
        passes:previous ? run.passes : [...run.passes.map(pass=>!pass.completedAt && !pass.interruptedAt ?
          {...pass,interruptedAt:now(),continuedBy:requestId}:pass),{requestId,startedAt:now()}],updatedAt:now(),
      }));
      const errors = [];
      for (const task of run.tasks) {
        signal?.throwIfAborted();
        if (requireRow('runs',run.id).status === 'PAUSED') return requireRow('runs',run.id);
        try {
          const capture = await startCapture({...task,runId:run.id,programmeId:run.programmeId},task.captureId);
          if (capture.status !== 'COMPLETE') await runCapture({
            captureId:capture.id,maxPages:args.maxPages ?? 100,
          },requestId + ':' + task.id,signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          errors.push({taskId:task.id,error:publicError(error)});
        }
      }
      run = requireRow('runs',run.id);
      if (run.status === 'PAUSED') return run;
      const captures = run.tasks.map(task => ({task, capture:current('captures',task.captureId)}));
      const complete = captures.every(({capture}) => capture?.status === 'COMPLETE');
      const interrupted = errors.length > 0 || captures.some(({capture}) =>
        !capture || ['PARTIAL','PAUSED'].includes(capture.status));
      const sourceIds = [...new Set(captures.flatMap(({capture}) =>
        [...(capture?.pages ?? []).map(page => page.sourceId),...(capture?.rejectedSourceIds ?? [])]))];
      let reconciliationId = null;
      if (run.payrollId) {
        const edition = await createReconciliation({
          programmeVersionId:run.programmeVersionId,payrollId:run.payrollId,
          sourceIds,captureIds:captures.filter(row => row.capture).map(row => row.capture.id),
          runIds:[run.id],name:'Collection ' + run.scheduledFor,
        },requestId + ':reconciliation');
        reconciliationId = edition.id;
      }
      return transition('run.observed',{runId:run.id,requestId},() => {
        const currentRun = requireRow('runs',run.id);
        return put('runs',{
          ...currentRun,status:complete ? 'COMPLETE' : interrupted ? 'PARTIAL' : 'RUNNING',activePassId:null,
          sourceIds,reconciliationIds:[...new Set([...(currentRun.reconciliationIds ?? []),
            ...(reconciliationId ? [reconciliationId] : [])])],
          passes:currentRun.passes.map(pass => pass.requestId === requestId ?
            {...pass,completedAt:now(),sourceIds,reconciliationId,errors} : pass),updatedAt:now(),
        });
      });
    } finally { await guard.release(); }
  }

  async function createReconciliation(args, requestId) {
    const previous = current('reconciliations',requestId);
    if (previous) return previous;
    const programme = requireRow('programmes',args.programmeVersionId);
    const payroll = requireRow('payrolls',args.payrollId);
    need(payroll.programmeVersionId === programme.id,'PAYROLL_PROGRAMME_VERSION_MISMATCH');
    const selectedSourceIds = args.sourceIds ? new Set(args.sourceIds) : null;
    if (selectedSourceIds) for (const id of selectedSourceIds) requireRow('sources',id);
    const aliases = new Set(Object.values(programme.definition.connectionAliases ?? {}).flat()
      .filter(value => typeof value === 'string'));
    need(aliases.size > 0,'PROGRAMME_CONNECTIONS_REQUIRED');
    const inScope = row => row.environment === programme.definition.environment &&
      aliases.has(row.connectionAlias);
    const history = listAll('resourceVersions').filter(row => inScope(row) &&
      (!selectedSourceIds || selectedSourceIds.has(row.sourceId)));
    let versions,selectionConflicts=[];
    if (args.versionIds) {
      versions=args.versionIds.map(id=>requireRow('resourceVersions',id));
      need(versions.every(inScope),'VERSION_OUTSIDE_PROGRAMME');
      if(selectedSourceIds)need(versions.every(row=>selectedSourceIds.has(row.sourceId)),
        'VERSION_OUTSIDE_SOURCE_SELECTION');
    } else if(selectedSourceIds) {
      const selected=new Map();
      for(const row of history) {
        const key=row.localResourceId;
        const previous=selected.get(key);
        if(!previous) { selected.set(key,row);continue; }
        const decision=native.reconcileVersions(
          {...previous,id:normalizedNativeId(previous.resourceId)},
          {...row,id:normalizedNativeId(row.resourceId)});
        if(decision.decision==='replace') {
          selected.set(key,row);
          selectionConflicts=selectionConflicts.filter(conflict=>conflict.resourceId!==key);
        } else if(decision.decision==='conflict') {
          selectionConflicts.push({resourceId:key,versionIds:[previous.id,row.id],
            reason:decision.reason});
        }
      }
      versions=[...selected.values()];
    } else {
      const resources=listAll('resources').filter(row=>inScope(row));
      versions=resources.map(row=>requireRow('resourceVersions',row.currentVersionId));
      selectionConflicts=resources.filter(row=>row.conflict).map(row=>({
        resourceId:row.id,versionIds:history.filter(version=>version.localResourceId===row.id)
          .map(version=>version.id),reason:'Unresolved original provider observations.',
      }));
    }
    const sourceIds = [...new Set([payroll.sourceId,...programme.sourceIds,
      ...(selectedSourceIds ?? []),...versions.map(row => row.sourceId)])];
    const sources = sourceIds.map(id => requireRow('sources',id));
    for (const source of sources) if (source.connectionAlias)
      need(aliases.has(source.connectionAlias),'SOURCE_OUTSIDE_PROGRAMME');
    const corrections = listAll('corrections').filter(row =>
      row.programmeVersionId === programme.id && row.payrollId === payroll.id);
    const captures = (args.captureIds ? args.captureIds.map(id => requireRow('captures',id)) :
      listAll('captures').filter(row => row.pages.some(page => sourceIds.includes(page.sourceId))));
    const runs = (args.runIds ?? []).map(id => requireRow('runs',id));
    const coverage = {
      period:programme.definition.period,programmeVersionId:programme.id,
      payrollId:payroll.id,payrollSourceId:payroll.sourceId,
      sourceIds,versionIds:versions.map(row => row.id),currentVersionIds:versions.map(row=>row.id),
      selectionConflicts,historyVersionIds:history.map(row=>row.id),
      captures:captures.map(row => ({id:row.id,status:row.status,connectionAlias:row.connectionAlias,
        action:row.action,pages:row.pages.length,sourceIds:row.pages.map(page => page.sourceId),
        next:row.next,rejectedSourceIds:row.rejectedSourceIds ?? [],error:row.error ?? null})),
      runs:runs.map(row => ({id:row.id,collectionId:row.collectionId,scheduledFor:row.scheduledFor,
        tasks:row.tasks.map(task => ({id:task.id,required:task.required,captureId:task.captureId}))})),
      correctionIds:corrections.map(row => row.id),
    };
    const data = await reconcilePayroll({
      programme:programme.definition,payroll:payroll.data,versions,history,sources,corrections,coverage,
    });
    const edition = {
      id:requestId,name:args.name ?? 'Payroll reconciliation',createdAt:now(),
      programmeId:programme.programmeId,programmeVersionId:programme.id,payrollId:payroll.id,
      sourceIds,versionIds:versions.map(row => row.id),correctionIds:coverage.correctionIds,data,
    };
    return transition('reconciliation.created',{reconciliationId:requestId},() =>
      put('reconciliations',edition));
  }

  async function createReport(args, requestId) {
    const previous = current('reports',requestId);
    if (previous) return previous;
    const edition = requireRow('reconciliations',args.reconciliationId);
    const generated = await payrollReport(publicValue(edition.data));
    const files = [];
    for (const [extension,contentType] of [['json','application/json'],['csv','text/csv; charset=utf-8'],
      ['html','text/html; charset=utf-8']]) {
      need(typeof generated[extension] === 'string','INVALID_PAYROLL_REPORT');
      const descriptor = await retainFile(Buffer.from(generated[extension],'utf8'),{
        filename:'payroll-report.' + extension,contentType,
      });
      files.push({...descriptor,url:'/api/file/' + descriptor.id});
    }
    const report = {
      id:requestId,reconciliationId:edition.id,name:args.name ?? edition.name,createdAt:now(),
      programmeId:edition.programmeId,payrollId:edition.payrollId,files,
      scope:{sourceIds:edition.sourceIds,versionIds:edition.versionIds,
        correctionIds:edition.correctionIds,programmeVersionId:edition.programmeVersionId,
        period:edition.data.coverage?.period ?? null},
    };
    return transition('report.created',{reportId:requestId},() => put('reports',report));
  }

  function localCommandTransition(requestId, kind, detail, work) {
    const key = 'local-command-result:' + requestId;
    const retained = getMeta(key);
    if (retained) return retained.value;
    return transition(kind, { ...detail, requestId }, () => {
      const value = work();
      setMeta(key, { value, completedAt: now() });
      return value;
    });
  }

  async function executeCommand(method, args, requestId, signal) {
    switch (method) {
      case 'file.retain': return {file:file(args.fileId,{private:true})};
      case 'profile.update':
        return localCommandTransition(requestId, method, {}, () => {
          need(typeof args.name === 'string' && args.name.trim(), 'NAME_REQUIRED');
          setMeta('profile', { ...getMeta('profile'), name: args.name.trim() });
          return describe().workspace;
        });
      case 'delivery.configure':
        return localCommandTransition(requestId, method, {}, () => {
          need(typeof args.enabled === 'boolean', 'EXPLICIT_DISPATCH_SELECTION_REQUIRED');
          setMeta('dispatchEnabled', args.enabled);
          return { enabled: args.enabled };
        });
      case 'programme.save': return saveProgramme(args,requestId);
      case 'payroll.import': return importPayroll(args,requestId);
      case 'payroll.instructions': return prepareInstructions(args,requestId);
      case 'collection.save': return saveCollection(args,requestId);
      case 'collection.run': return collectionRun(args,requestId,signal);
      case 'run.continue': return continueRun(args,requestId,signal);
      case 'collection.enable':
        return localCommandTransition(requestId,method,{collectionId:args.collectionId},() => {
          need(typeof args.enabled === 'boolean','EXPLICIT_COLLECTION_SELECTION_REQUIRED');
          const row = requireRow('collections',args.collectionId);
          return put('collections',{...row,enabled:args.enabled,updatedAt:now()});
        });
      case 'run.pause':
        return localCommandTransition(requestId,method,{runId:args.runId},() => {
          const row = requireRow('runs',args.runId);
          if (row.status === 'COMPLETE') return row;
          for (const task of row.tasks) {
            const capture = current('captures',task.captureId);
            if (capture && capture.status !== 'COMPLETE')
              put('captures',{...capture,status:'PAUSED',updatedAt:now()});
          }
          return put('runs',{...row,status:'PAUSED',updatedAt:now()});
        });
      case 'operation.prepare': return prepareOperation(args, requestId);
      case 'operation.dispatch': return dispatchOperation(args.operationId, requestId, signal);
      case 'operation.reconcile': return reconcileOperation(args, requestId, signal);
      case 'operation.retry-original': return dispatchOperation(args.operationId,requestId,signal,{retryOriginal:true});
      case 'operation.cancel':
        return localCommandTransition(requestId, method, { operationId: args.operationId }, () => {
          const row = requireRow('operations', args.operationId);
          need(row.state === 'PREPARED', 'DISPATCHED_OPERATION_CANNOT_BE_CANCELED_LOCALLY');
          need(args.reason?.trim(), 'REASON_REQUIRED');
          return put('operations', { ...row, state: 'CANCELED', reason: args.reason, updatedAt: now() });
        });
      case 'capture.start': return startCapture(args,requestId);
      case 'capture.run': return runCapture(args, requestId, signal);
      case 'capture.pause':
        return localCommandTransition(requestId, method, { captureId: args.captureId }, () => {
          const row = requireRow('captures', args.captureId);
          return put('captures', {
            ...row, status: row.status === 'COMPLETE' ? 'COMPLETE' : 'PAUSED', updatedAt: now(),
          });
        });
      case 'source.import': return importSource(args, requestId);
      case 'source.project': {
        const row = requireRow('sources', args.sourceId);
        need(row.receiptFileId, 'ORIGINAL_EXCHANGE_REQUIRED');
        const exchange = JSON.parse((await fileBytes(row.receiptFileId, { private: true })).toString());
        return retainExchange(exchange, {
          sourceId: requestId, connectionAlias: row.connectionAlias,
          environment: row.environment, reprojectedSourceId: row.id,
        });
      }
      case 'webhook.project':
      case 'webhook.reconcile': return projectWebhook(args,requestId,signal);
      case 'correction.save': {
        const old = current('corrections', requestId);
        if (old) return old;
        need(['note', 'exclude', 'include', 'link'].includes(args.action) &&
          args.reason?.trim() && args.actor?.trim(), 'INVALID_CORRECTION');
        const programme = requireRow('programmes',args.programmeVersionId);
        const payroll = requireRow('payrolls',args.payrollId);
        need(payroll.programmeVersionId === programme.id,'PAYROLL_PROGRAMME_VERSION_MISMATCH');
        need(args.resourceId || args.versionId || args.sourceId || args.payrollRowId,'CORRECTION_TARGET_REQUIRED');
        if (args.payrollRowId) need(payroll.data.rows.some(row => row.id === args.payrollRowId),
          'PAYROLL_ROW_NOT_FOUND');
        if (args.resourceId) requireRow('resources', args.resourceId);
        if (args.versionId) requireRow('resourceVersions', args.versionId);
        if (args.sourceId) requireRow('sources', args.sourceId);
        if (args.supersedes) {
          const previous = requireRow('corrections',args.supersedes);
          need(previous.programmeVersionId === programme.id && previous.payrollId === payroll.id,
            'CORRECTION_SCOPE_MISMATCH');
          need(!listAll('corrections').some(row => row.supersedes === previous.id),
            'CORRECTION_ALREADY_SUPERSEDED');
        }
        return transition(method, { correctionId: requestId }, () =>
          put('corrections', { ...clone(args), id: requestId, createdAt: now() }));
      }
      case 'reconciliation.create': return createReconciliation(args, requestId);
      case 'report.create': return createReport(args, requestId);
      default: {
        const receiving = await import('./receiving.mjs');
        if (method === 'workspace.export') return receiving.exportBloccpayWorkspace({
          workspace: api, ...args, requestId, sourceDirectory, runtimeDirectory, expectedManifestSha256,
        });
        if (method === 'report.export') return receiving.exportBloccpayReport({
          workspace: api, ...args, requestId,
        });
        if (method === 'package.inspect') return receiving.inspectBloccpayDelivery(args);
        if (method === 'package.receive') return receiving.receiveBloccpayDelivery({
          ...args, requestId, signal,
        });
        throw new BloccpayError('UNKNOWN_METHOD');
      }
    }
  }

  async function command({ requestId, expectedRevision, method, args = {}, signal }) {
    need(typeof requestId === 'string' && requestId.length > 0 && requestId.length < 200,
      'REQUEST_ID_REQUIRED');
    need(BLOCCPAY_METHODS.some(entry => entry.name === method), 'UNKNOWN_METHOD');
    const identity = requestIdentity(method, args);
    const guard = await lease(workspaceDirectory, 'request-' + hash(requestId));
    try {
      let row = db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);
      if (row) {
        need(row.intent_sha256 === identity, 'REQUEST_ID_CONFLICT');
        if (row.status === 'COMPLETE') return json(row.result);
        if (row.status === 'FAILED') {
          const previous = json(row.error);
          throw new BloccpayError(previous.code, previous.message, previous.details);
        }
      } else {
        db.exec('BEGIN IMMEDIATE');
        try {
          if (expectedRevision !== undefined) need(expectedRevision === getMeta('revision'),
            'REVISION_CONFLICT', { actualRevision: getMeta('revision') });
          db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?)').run(
            requestId, identity, method, JSON.stringify(args), expectedRevision ?? null,
            'RUNNING', null, null, now(), now());
          const revision = getMeta('revision') + 1;
          const accepted = {
            revision, previous: getMeta('head'), kind: 'request.accepted',
            detail: { requestId, method, intentSha256: identity },
            createdAt: now(), result: null,
          };
          const acceptedHash = hash(Buffer.from(canonical(accepted)));
          db.prepare('INSERT INTO journal VALUES(?,?,?,?)').run(
            revision, accepted.previous, acceptedHash, JSON.stringify(accepted));
          setMeta('revision', revision);
          setMeta('head', acceptedHash);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      try {
        const value = await executeCommand(method, args, requestId, signal);
        const result = {
          requestId, workspaceId: getMeta('identity').id,
          revision: getMeta('revision'), result: publicValue(value),
        };
        db.prepare('UPDATE requests SET status=?,result=?,updated_at=? WHERE id=?')
          .run('COMPLETE', JSON.stringify(result), now(), requestId);
        return result;
      } catch (error) {
        const failure = publicError(error);
        // Only an admitted SDP readback may resume its original local/storage
        // interruption. Its frozen prepare/dispatch IDs still prevent a resend.
        const resumable=['webhook.project','webhook.reconcile'].includes(method)&&
          current('webhooks',args.webhookId)?.provider==='sdp'&&
          (signal?.aborted||['EIO','ENOSPC','EDQUOT','EBUSY','EINTR','EMFILE','ENFILE',
            'ABORT_ERR','AbortError','OPERATION_BUSY','LEASE_UNAVAILABLE'].includes(error.code??error.name));
        // Explicit scope, signature, identity and domain preconditions stay failed.
        db.prepare('UPDATE requests SET status=?,error=?,updated_at=? WHERE id=?')
          .run(resumable?'RUNNING':'FAILED', JSON.stringify(failure), now(), requestId);
        throw error;
      }
    } finally { await guard.release(); }
  }

  async function snapshot(destination) {
    need(path.isAbsolute(destination), 'ABSOLUTE_FILE_REQUIRED');
    need(!await fs.lstat(destination).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }), 'SNAPSHOT_DESTINATION_EXISTS');
    await directory(path.dirname(destination));
    // SQLite performs a consistent committed snapshot, including WAL contents.
    // Referenced objects are immutable, so later workspace writes cannot change this selection.
    db.prepare('VACUUM INTO ?').run(destination);
    await fs.chmod(destination, 0o600);
    const handle = await fs.open(destination, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      need(copy.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
        'SNAPSHOT_INTEGRITY_FAILED');
      const meta = key => json(copy.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value);
      return {
        workspaceId: meta('identity').id, revision: meta('revision'), head: meta('head'),
        files: copy.prepare('SELECT document FROM files ORDER BY id').all().map(rowValue),
        descriptor: await fileDescriptor(destination, 'workspace/workspace.sqlite'),
      };
    } finally { copy.close(); }
  }

  function registerExport(value) {
    const previous = current('exports', value.id);
    if (previous) {
      need(canonical(previous) === canonical(value), 'EXPORT_ID_CONFLICT');
      return previous;
    }
    return transition('export.completed', { exportId: value.id }, () => put('exports', value));
  }

  function prepareReceived(origin) {
    if (getMeta('receivedFrom')?.manifestSha256 === origin.manifestSha256)
      return describe().workspace;
    return transition('workspace.received', origin, () => {
      setMeta('dispatchEnabled', false);
      setMeta('receivedFrom', { ...origin, workspaceId: getMeta('identity').id });
      setMeta('identity', { schema: WORKSPACE_SCHEMA, id: randomUUID(), createdAt: now() });
      for (const row of listAll('operations')) {
        if (row.state === 'DISPATCHING')
          put('operations', { ...row, state: 'UNCERTAIN', receivedWhileDispatching: true });
      }
      for (const row of listAll('attempts')) {
        if (row.status === 'DISPATCHING')
          put('attempts', { ...row, status: 'UNCERTAIN', receivedWhileDispatching: true });
      }
      for (const row of listAll('captures')) {
        if (!['COMPLETE', 'CANCELED'].includes(row.status))
          put('captures', { ...row, status: 'PAUSED', receivedFromStatus: row.status });
      }
      for (const row of listAll('collections')) put('collections',{
        ...row,enabled:false,receivedFromEnabled:row.enabled,
      });
      for (const row of listAll('runs')) if (!['COMPLETE','CANCELED'].includes(row.status))
        put('runs',{...row,status:'PAUSED',receivedFromStatus:row.status});
      return describe().workspace;
    });
  }

  const api = {
    directory: workspaceDirectory, describe, list, item, command,
    retainFile, file, fileBytes, webhook, snapshot, registerExport,
    privateItem: requireRow, privateList: listAll, prepareReceived,
    sourceDirectory, runtimeDirectory, expectedManifestSha256,
    async close() { db.close(); },
  };
  return api;
}
