// MIT. Receive an original whole Merchant archive through one managed private desk.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { lstat, readdir, realpath, readFile } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readMerchantInput } from './application-inputs.mjs';
import { canonicalJson } from './protocol.mjs';
import { runPortable } from './portable.mjs';
import { startReceivedMerchantReview, reviewEnvironmentName, reviewEnvironmentValue } from './received-project-review.mjs';

export const MERCHANT_INTAKE_SCHEMA = 'stellar-forge.merchant-project-intake.v1';
const REQUEST = 'stellar-forge.merchant-portable-request.v1';
const RESULT = 'stellar-forge.merchant-portable-result.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const ROOT = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (value, code, status = 409) => {
  if (!value) throw Object.assign(new Error(code), { code, status });
};
const absolute = value => {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'MERCHANT_INTAKE_ABSOLUTE_PATH_REQUIRED', 400);
  return value;
};
const decode = raw => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
const errorView = error => ({ code: /^[A-Za-z0-9_.:-]{1,160}$/.test(error?.code ?? '')
  ? error.code : 'MERCHANT_INTAKE_FAILED', message: String(error?.message ?? error).slice(0, 2000) });
const exists = async path => {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
function receiveIdentity(archive, archiveSha256, destination) {
  const value = hash(canonicalJson({ schema: MERCHANT_INTAKE_SCHEMA, archive, archiveSha256, destination }));
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-5' + value.slice(13, 16) +
    '-a' + value.slice(17, 20) + '-' + value.slice(20, 32);
}
async function privateExistingDirectory(path) {
  const info = await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path &&
    !(info.mode & 0o077) && (process.getuid === undefined || info.uid === process.getuid()),
  'MERCHANT_INTAKE_PRIVATE_DIRECTORY_REQUIRED');
}
async function retainedRequest(destination) {
  if (!await exists(destination)) {
    await privateExistingDirectory(dirname(destination));
    return null;
  }
  await privateExistingDirectory(destination);
  const entries = await readdir(destination);
  if (entries.length === 0) return null;
  const control = join(destination, 'control');
  const controlInfo = await exists(control);
  need(controlInfo, 'MERCHANT_INTAKE_DESTINATION_IN_USE');
  await privateExistingDirectory(control);
  const path = join(control, 'request.json');
  if (!await exists(path)) {
    // A native receive interrupted before retaining its request can leave only
    // its private directory and original lock. The stable saved selection still
    // supplies that same request on continuation.
    need(entries.length === 1 && entries[0] === 'control' &&
      (await readdir(control)).every(name => name === 'receive.lock'),
    'MERCHANT_INTAKE_ORIGINAL_REQUEST_REQUIRED');
    return null;
  }
  const original = await readMerchantInput(path, {
    maximum: 4 * 1024 * 1024, collect: true, privateOnly: true, allowMultipleLinks: true,
  });
  const request = decode(original.raw);
  need(plain(request) && request.schema === REQUEST && request.action === 'receive' &&
    UUID.test(request.operation ?? ''), 'MERCHANT_INTAKE_ORIGINAL_REQUEST_REQUIRED');
  return request;
}

/** Complete native archive inspection. Preparation never receives or replaces a case. */
export async function inspectMerchantIntake({
  archive, archiveSha256, destination, operation = null, python,
  expectedSelectionSha256 = null, signal = null,
}) {
  absolute(archive); absolute(destination);
  need(SHA.test(archiveSha256 ?? ''), 'MERCHANT_INTAKE_ARCHIVE_SHA256_REQUIRED', 400);
  const previous = await retainedRequest(destination);
  if (previous) {
    need(previous.archive === archive && previous.archiveSha256 === archiveSha256 &&
      previous.destination === destination && (operation === null || operation === previous.operation),
    'MERCHANT_INTAKE_ORIGINAL_SELECTION_CHANGED');
  }
  operation ??= previous?.operation ?? receiveIdentity(archive, archiveSha256, destination);
  need(UUID.test(operation), 'MERCHANT_INTAKE_OPERATION_REQUIRED', 400);
  const request = previous ?? { schema: REQUEST, action: 'receive', operation, archive, archiveSha256, destination };
  const inspected = await runPortable({ schema: REQUEST, action: 'inspect', operation, archive, archiveSha256 },
    { python, signal });
  need(inspected.schema === RESULT && inspected.action === 'inspect' && inspected.state === 'COMPLETE' &&
    inspected.operation === operation && inspected.archive?.path === archive &&
    inspected.archive.sha256 === archiveSha256 && SHA.test(inspected.manifestSha256 ?? ''),
  'MERCHANT_INTAKE_NATIVE_INSPECTION_CHANGED');
  const manifest = inspected.manifest, original = manifest?.original;
  need(plain(original) && typeof original.storeId === 'string' && original.storeId &&
    typeof original.directory === 'string' && SHA.test(manifest?.source?.sha256 ?? '') &&
    Array.isArray(manifest.files) && Array.isArray(manifest.snapshot?.tables),
  'MERCHANT_INTAKE_COMPLETE_MANIFEST_REQUIRED');
  absolute(original.directory);
  need(destination !== original.directory && !destination.startsWith(original.directory + '/') &&
    archive !== destination && !archive.startsWith(destination + '/'),
  'MERCHANT_INTAKE_INDEPENDENT_DESTINATION_REQUIRED');
  const selection = {
    schema: MERCHANT_INTAKE_SCHEMA,
    request: { schema: REQUEST, action: 'receive', operation, archive, archiveSha256, destination },
    requestSelectionSha256: hash(canonicalJson(request)),
    archive: { path: archive, bytes: inspected.archive.bytes, sha256: archiveSha256, members: inspected.archive.members },
    manifestSha256: inspected.manifestSha256,
    originalOperation: manifest.operation, storeId: original.storeId,
    originalWorkspace: original.directory, originalRowsSha256: manifest.snapshot.allRowsSha256,
    sourceSha256: manifest.source.sha256, sourceBytes: manifest.source.bytes,
    destination, workspaceDirectory: join(destination, 'runtime/workspace'),
  };
  const selectionSha256 = hash(canonicalJson(selection));
  need(expectedSelectionSha256 === null || SHA.test(expectedSelectionSha256) &&
    expectedSelectionSha256 === selectionSha256, 'MERCHANT_INTAKE_REVIEWED_SELECTION_CHANGED');
  let complete = null;
  const receiptPath = join(destination, 'control/result.json');
  if (await exists(receiptPath)) {
    complete = decode((await readMerchantInput(receiptPath, {
      maximum: 64 * 1024 * 1024, collect: true, privateOnly: true, allowMultipleLinks: true,
    })).raw);
    need(complete.schema === RESULT && complete.state === 'COMPLETE' && complete.action === 'receive' &&
      complete.operation === operation && complete.manifestSha256 === selection.manifestSha256 &&
      complete.archive?.sha256 === archiveSha256 && complete.received?.storeId === selection.storeId &&
      complete.received.workspaceDirectory === selection.workspaceDirectory,
    'MERCHANT_INTAKE_ORIGINAL_RECEIPT_CHANGED');
  }
  return { selection, selectionSha256, request, manifest, complete };
}
export function intakeSummary(inspected) {
  const { selection, manifest } = inspected;
  return { storeId: selection.storeId, operation: selection.request.operation,
    exportOperation: selection.originalOperation, archive: selection.archive,
    manifestSha256: selection.manifestSha256, destination: selection.destination,
    sourceSha256: selection.sourceSha256, sourceBytes: selection.sourceBytes,
    originalRowsSha256: selection.originalRowsSha256,
    tables: manifest.snapshot.tables.map(row => ({ name: row.name, rows: row.rows })),
    counts: { members: manifest.files.length, results: manifest.results?.length ?? 0,
      inputs: manifest.inputFiles?.length ?? 0, sourceFiles: manifest.source.requiredSource?.length ?? 0 },
    environmentReferences: manifest.configuration.environmentReferences,
  };
}
function tokenEqual(a, b) {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
async function emptyBody(request) {
  let bytes = 0, chunks = [];
  for await (const part of request) {
    bytes += part.length; need(bytes <= 1024, 'MERCHANT_INTAKE_REQUEST_TOO_LARGE', 413); chunks.push(part);
  }
  const raw = Buffer.concat(chunks);
  const value = raw.length ? decode(raw) : {};
  need(plain(value) && Object.keys(value).length === 0, 'MERCHANT_INTAKE_ORIGINAL_REQUEST_ONLY', 400);
}
function respond(response, status, value, extra = {}) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + '\n');
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': raw.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  response.end(raw);
}
export async function startMerchantIntake(options) {
  const { python, environment = process.env, operatorTokenEnv = 'MERCHANT_REVIEW_OPERATOR_TOKEN',
    allowLoopback = false, host = '127.0.0.1', port = 0, signal = null } = options;
  need(host === '127.0.0.1' && Number.isInteger(port) && port >= 0 && port <= 65535,
    'MERCHANT_INTAKE_LOOPBACK_REQUIRED', 400);
  const credentialName = reviewEnvironmentName(operatorTokenEnv);
  const credential = reviewEnvironmentValue(environment, credentialName);
  need(!/[\u0000-\u0020\u007f]/.test(credential), 'MERCHANT_INTAKE_PRIVATE_CREDENTIAL_REQUIRED', 400);
  const inspected = await inspectMerchantIntake(options);
  const selected = inspected.selection;
  const nativeController = new AbortController();
  let state = 'READY', failure = null, nativeResult = inspected.complete, opened = null;
  let work = null, closing = false, closePromise = null, url = null, server = null;
  const inFlight = new Set();
  const summary = intakeSummary(inspected);
  async function openReview() {
    need(!closing && !nativeController.signal.aborted, 'MERCHANT_INTAKE_STOPPING', 503);
    if (opened) { await opened.server.close(); opened = null; }
    const next = await startReceivedMerchantReview(selected.destination, { python, environment,
      operatorTokenEnv: credentialName, allowLoopback, host, port: 0, signal: nativeController.signal });
    opened = next;
    const s = next.selection;
    if (s.directory !== selected.destination || s.operation !== selected.request.operation ||
        s.archiveSha256 !== selected.archive.sha256 || s.manifestSha256 !== selected.manifestSha256 ||
        s.storeId !== selected.storeId || s.sourceSha256 !== selected.sourceSha256 ||
        s.workspaceDirectory !== selected.workspaceDirectory) {
      await opened.server.close();
      need(false, 'MERCHANT_INTAKE_RECEIVED_SELECTION_CHANGED');
    }
    if (closing || nativeController.signal.aborted) await opened.server.close();
    else state = 'COMPLETE';
  }
  function status() {
    return { schema: MERCHANT_INTAKE_SCHEMA, selection: selected, selectionSha256: inspected.selectionSha256,
      state, summary, error: failure, reviewUrl: state === 'COMPLETE' ? opened?.server.url ?? null : null,
      receiptAvailable: nativeResult !== null, receiving: work !== null };
  }
  function begin() {
    need(!closing, 'MERCHANT_INTAKE_STOPPING', 503);
    if (work || state === 'COMPLETE') return status();
    state = 'RECEIVING'; failure = null;
    const current = Promise.resolve().then(async () => {
      try {
        nativeResult = await runPortable(inspected.request, { python, signal: nativeController.signal });
        need(nativeResult.state === 'COMPLETE' && nativeResult.operation === selected.request.operation &&
          nativeResult.manifestSha256 === selected.manifestSha256 &&
          nativeResult.received?.storeId === selected.storeId, 'MERCHANT_INTAKE_NATIVE_RECEIPT_CHANGED');
        state = 'RECEIVED';
        if (!closing) await openReview();
      } catch (error) {
        failure = errorView(error); state = 'RETRY_REQUIRED';
        process.stderr.write(JSON.stringify({ event: 'merchant_intake_continuation', operation: selected.request.operation,
          state, error: failure }) + '\n');
      }
    }).finally(() => { if (work === current) work = null; });
    work = current;
    return status();
  }
  const assets = new Map([
    ['/', ['intake.html', 'text/html; charset=utf-8']],
    ['/intake.mjs', ['intake.mjs', 'text/javascript; charset=utf-8']],
    ['/intake.css', ['intake.css', 'text/css; charset=utf-8']],
  ]);
  async function handle(request, response) {
    need(!closing, 'MERCHANT_INTAKE_STOPPING', 503);
    need(request.headers.host === new URL(url).host, 'MERCHANT_INTAKE_HOST_CHANGED', 403);
    const parsed = new URL(request.url, url), path = parsed.pathname;
    if (path === '/favicon.ico' && request.method === 'GET' && !parsed.search)
      return respond(response, 204, Buffer.alloc(0));
    const asset = assets.get(path);
    if (asset && request.method === 'GET') {
      need(!parsed.search, 'MERCHANT_INTAKE_QUERY_INVALID', 400);
      const raw = await readFile(join(ROOT, 'web', asset[0]));
      return respond(response, 200, raw, { 'Content-Type': asset[1],
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'Referrer-Policy': 'no-referrer' });
    }
    need(path.startsWith('/api/'), 'NOT_FOUND', 404);
    const authorization = request.headers.authorization;
    need(typeof authorization === 'string' && authorization.startsWith('Bearer ') &&
      tokenEqual(authorization.slice(7), credential), 'MERCHANT_INTAKE_AUTHENTICATION_REQUIRED', 401);
    need(!request.headers.origin || request.headers.origin === url, 'MERCHANT_INTAKE_ORIGIN_INVALID', 403);
    const expectedSelection = request.headers['x-merchant-intake-selection-sha256'];
    need(expectedSelection === undefined || expectedSelection === inspected.selectionSha256,
      'MERCHANT_INTAKE_REVIEWED_SELECTION_CHANGED', 409);
    response.setHeader('X-Merchant-Intake-Selection-Sha256', inspected.selectionSha256);
    if (path !== '/api/files') need(!parsed.search, 'MERCHANT_INTAKE_QUERY_INVALID', 400);
    if (path === '/api/state' && request.method === 'GET') return respond(response, 200, status());
    if (path === '/api/manifest' && request.method === 'GET')
      return respond(response, 200, inspected.manifest, {
        'Content-Disposition': 'attachment; filename="merchant-project-manifest-' + selected.originalOperation + '.json"' });
    if (path === '/api/receipt' && request.method === 'GET') {
      need(nativeResult !== null, 'MERCHANT_INTAKE_RECEIPT_PENDING', 409);
      const raw = await readMerchantInput(join(selected.destination, 'control/result.json'), {
        maximum: 64 * 1024 * 1024, collect: true, privateOnly: true, allowMultipleLinks: true,
      });
      const receipt = decode(raw.raw);
      need(receipt.schema === RESULT && receipt.state === 'COMPLETE' && receipt.operation === selected.request.operation &&
        receipt.manifestSha256 === selected.manifestSha256 &&
        receipt.received?.workspaceDirectory === selected.workspaceDirectory, 'MERCHANT_INTAKE_ORIGINAL_RECEIPT_CHANGED');
      return respond(response, 200, raw.raw, {
        'Content-Disposition': 'attachment; filename="merchant-receiving-' + selected.request.operation + '.json"' });
    }
    if (path === '/api/files' && request.method === 'GET') {
      const params = parsed.searchParams, keys = [...params.keys()];
      need(keys.every(key => ['offset','limit','filter'].includes(key)) && new Set(keys).size === keys.length,
        'MERCHANT_INTAKE_QUERY_INVALID', 400);
      const offsetText = params.get('offset') ?? '0', limitText = params.get('limit') ?? '50';
      need(/^(0|[1-9][0-9]{0,8})$/.test(offsetText) && /^[1-9][0-9]{0,2}$/.test(limitText),
        'MERCHANT_INTAKE_PAGE_INVALID', 400);
      const offset = Number(offsetText), limit = Number(limitText), filter = params.get('filter') ?? '';
      need(limit <= 100 && filter.length <= 512, 'MERCHANT_INTAKE_PAGE_INVALID', 400);
      const rows = filter ? inspected.manifest.files.filter(row => row.path.toLowerCase().includes(filter.toLowerCase()))
        : inspected.manifest.files;
      need(offset <= rows.length || offset === 0, 'MERCHANT_INTAKE_PAGE_INVALID', 400);
      return respond(response, 200, { manifestSha256: selected.manifestSha256, total: rows.length, offset, limit,
        rows: rows.slice(offset, offset + limit), nextOffset: offset + limit < rows.length ? offset + limit : null });
    }
    if (path === '/api/receive' && request.method === 'POST') {
      need((request.headers['content-type'] ?? '').split(';')[0] === 'application/json',
        'MERCHANT_INTAKE_JSON_REQUIRED', 415);
      await emptyBody(request);
      const current = begin();
      return respond(response, current.state === 'COMPLETE' ? 200 : 202, current);
    }
    need(false, 'NOT_FOUND', 404);
  }
  const abort = () => { if (!nativeController.signal.aborted) nativeController.abort(signal?.reason ?? 'SIGTERM'); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    need(!nativeController.signal.aborted, 'MERCHANT_INTAKE_INTERRUPTED', 503);
    // A cold opening validates the existing complete receipt and opens the same
    // read-only store. It never re-extracts the archive or rewrites customer rows.
    if (nativeResult) await openReview();
    server = createServer({ maxHeaderSize: 16384 }, (request, response) => {
      const pending = handle(request, response).catch(error => {
        if (response.headersSent) response.destroy(error);
        else respond(response, Number.isInteger(error.status) ? error.status : 500, { error: errorView(error) });
      }).finally(() => inFlight.delete(pending));
      inFlight.add(pending);
    });
    server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 2000;
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); accept(); });
    });
    url = 'http://127.0.0.1:' + server.address().port;
  } catch (error) {
    signal?.removeEventListener('abort', abort);
    if (opened) {
      for (;;) {
        try { await opened.server.close(); break; }
        catch (closeError) {
          process.stderr.write(JSON.stringify({ state: 'AWAITING_MERCHANT_INTAKE_OPENING_CLOSE',
            error: errorView(closeError) }) + '\n');
          await new Promise(accept => setTimeout(accept, 5000));
        }
      }
    }
    throw error;
  }
  async function close() {
    if (closePromise) return closePromise;
    closing = true;
    if (!nativeController.signal.aborted) nativeController.abort('SIGTERM');
    closePromise = (async () => {
      const ending = server.listening ? new Promise((accept, reject) => server.close(error =>
        error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : accept())) : Promise.resolve();
      // Observe an early listener-close rejection while draining the owned work.
      void ending.catch(() => {});
      server.closeIdleConnections();
      await Promise.allSettled([...inFlight]);
      if (work) await work;
      await ending;
      if (opened) await opened.server.close();
      signal?.removeEventListener('abort', abort);
    })();
    try { return await closePromise; } catch (error) { closePromise = null; throw error; }
  }
  return { server, url, close, status, selection: selected, selectionSha256: inspected.selectionSha256,
    announcement: { schema: MERCHANT_INTAKE_SCHEMA, mode: 'intake', url,
      selection: selected, selectionSha256: inspected.selectionSha256 } };
}

export function merchantIntakeArguments(argv) {
  const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
    archive: { type: 'string' }, 'archive-sha256': { type: 'string' },
    destination: { type: 'string' }, operation: { type: 'string' },
    'expect-selection-sha256': { type: 'string' }, python: { type: 'string' },
    'operator-token-env': { type: 'string', default: 'MERCHANT_REVIEW_OPERATOR_TOKEN' },
    host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '0' },
    'allow-loopback': { type: 'boolean', default: false },
  } });
  absolute(values.archive); absolute(values.destination);
  need(SHA.test(values['archive-sha256'] ?? ''), 'MERCHANT_INTAKE_ARCHIVE_SHA256_REQUIRED', 400);
  if (values.operation !== undefined) need(UUID.test(values.operation), 'MERCHANT_INTAKE_OPERATION_REQUIRED', 400);
  if (values.python !== undefined) absolute(values.python);
  if (values['expect-selection-sha256'] !== undefined)
    need(SHA.test(values['expect-selection-sha256']), 'MERCHANT_INTAKE_REVIEWED_SELECTION_REQUIRED', 400);
  reviewEnvironmentName(values['operator-token-env']);
  need(values.host === '127.0.0.1' && /^(0|[1-9][0-9]{0,4})$/.test(values.port) &&
    Number(values.port) <= 65535, 'MERCHANT_INTAKE_LOOPBACK_REQUIRED', 400);
  return values;
}
export async function main(argv = process.argv.slice(2)) {
  const values = merchantIntakeArguments(argv), controller = new AbortController();
  let opened = null, closing = null;
  const remove = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
  function stop(signal) {
    if (!controller.signal.aborted) controller.abort(signal);
    if (!opened || closing) return closing;
    closing = (async () => {
      for (;;) {
        try { await opened.close(); remove(); return; }
        catch (error) {
          process.stderr.write(JSON.stringify({ state: 'AWAITING_MERCHANT_INTAKE_CLOSE', error: errorView(error) }) + '\n');
          await new Promise(accept => setTimeout(accept, 5000));
        }
      }
    })();
    return closing;
  }
  const interrupt = () => { void stop('SIGINT'); }, terminate = () => { void stop('SIGTERM'); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    opened = await startMerchantIntake({ archive: values.archive, archiveSha256: values['archive-sha256'],
      destination: values.destination, operation: values.operation ?? null, python: values.python,
      expectedSelectionSha256: values['expect-selection-sha256'] ?? null,
      operatorTokenEnv: values['operator-token-env'], host: values.host, port: Number(values.port),
      allowLoopback: values['allow-loopback'], signal: controller.signal });
    if (controller.signal.aborted) { await stop(controller.signal.reason); return opened; }
    process.stdout.write(JSON.stringify(opened.announcement) + '\n');
    return opened;
  } catch (error) { remove(); throw error; }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => { process.stderr.write(JSON.stringify({ error: errorView(error) }) + '\n'); process.exitCode = 1; });
