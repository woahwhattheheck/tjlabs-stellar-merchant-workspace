// MIT License.
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { openMerchantWorkspace, validateConfig, MerchantError } from './workspace.mjs';
import { ProtocolError } from './protocol.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
function fail(code, status = 400) { throw new MerchantError(code, status); }
function header(request, name) {
  const lower = name.toLowerCase(), matches = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2)
    if (request.rawHeaders[index].toLowerCase() === lower) matches.push(request.rawHeaders[index + 1]);
  if (matches.length > 1) fail('DUPLICATE_' + name.toUpperCase().replaceAll('-', '_'));
  return matches[0] ?? null;
}
function safeError(error) { return { error: String(error?.code ?? 'APPLICATION_ERROR').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120) }; }
function constantEqual(a, b) { const left = createHash('sha256').update(String(a)).digest(), right = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(left, right); }
async function rawBody(request, limit) {
  const contentLength = header(request, 'content-length');
  if (contentLength !== null && (!/^(0|[1-9][0-9]*)$/.test(contentLength) || Number(contentLength) > limit)) fail('BODY_TOO_LARGE', 413);
  const encoding = header(request, 'content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') fail('CONTENT_ENCODING_UNSUPPORTED', 415);
  const parts = []; let bytes = 0;
  for await (const part of request) { bytes += part.length; if (bytes > limit) fail('BODY_TOO_LARGE', 413); parts.push(part); }
  return Buffer.concat(parts);
}
async function jsonBody(request, limit = 1048576) {
  if (header(request, 'content-type')?.trim() !== 'application/json') fail('JSON_CONTENT_TYPE_REQUIRED', 415);
  const raw = await rawBody(request, limit);
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('JSON_OBJECT_REQUIRED');
    return value;
  } catch (error) { if (error instanceof MerchantError) throw error; fail('JSON_INVALID'); }
}
function respond(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}
async function serveResult(response, result, headers = {}) {
  const controller = new AbortController();
  const onClose = () => {
    if (!response.writableFinished) controller.abort(new MerchantError('DOWNLOAD_INTERRUPTED', 499));
  };
  response.once('close', onClose);
  try {
    await result.verify({ signal: controller.signal });
    if (response.destroyed || controller.signal.aborted) throw new MerchantError('DOWNLOAD_INTERRUPTED', 499);
    const metadata = result._metadata();
    response.writeHead(200, { 'Content-Type': metadata.contentType, 'Content-Length': String(metadata.bytes),
      'Content-Disposition': 'attachment; filename="' + metadata.fileName + '"', 'Cache-Control': 'no-store',
      'X-Content-SHA256': metadata.sha256, ...headers });
    await pipeline(Readable.from(result.chunks({ signal: controller.signal }), { objectMode: false }), response,
      { signal: controller.signal });
  } finally { response.off('close', onClose); }
}
export async function startMerchantServer({ workspace, operatorToken, host = '127.0.0.1', port = 8764, intervalMs = 10000 }) {
  if (typeof operatorToken !== 'string' || operatorToken.length < 32 || /[\u0000-\u0020\u007f]/.test(operatorToken)) fail('OPERATOR_TOKEN_REQUIRED');
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('PORT_INVALID');
  if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 2147483647) fail('WORKER_INTERVAL_INVALID');
  let stopping = false, tick = null, closePromise = null;
  const inFlight = new Set(), assets = new Map();
  for (const [url, [name, type]] of ASSETS) assets.set(url, { bytes: await readFile(join(ROOT, 'web', name)), type });
  function runTick() {
    if (!stopping && !tick) {
      tick = workspace.tick().catch(error => { process.stderr.write(JSON.stringify({ event: 'merchant_worker_error', ...safeError(error) }) + '\n'); }).finally(() => { tick = null; });
    }
    return tick;
  }
  async function handle(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (stopping) return respond(response, 503, { error: 'APPLICATION_CLOSING' });
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) fail('REQUEST_TARGET_INVALID');
    const parsed = new URL(request.url, 'http://merchant.local');
    const path = parsed.pathname;
    const asset = assets.get(path);
    if (request.method === 'GET' && asset && !parsed.search) {
      response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': String(asset.bytes.length), 'Cache-Control': 'no-store' });
      return response.end(asset.bytes);
    }
    if (request.method === 'GET' && path === '/health' && !parsed.search) return respond(response, 200, { status: 'ready', application: 'x402api-merchant-workspace' });
    if (request.method === 'POST' && path === '/webhooks/x402api' && !parsed.search) {
      for (const name of ['x-x402api-webhook-id', 'x-x402api-webhook-timestamp', 'x-x402api-webhook-key-version', 'x-x402api-webhook-signature', 'x-x402api-webhook-verification-id']) header(request, name);
      const raw = await rawBody(request, 1048576);
      let outcome;
      try { outcome = workspace.acceptWebhook(raw, request.headers); }
      catch (error) {
        if (error instanceof ProtocolError) fail(error.code, 400);
        throw error;
      }
      respond(response, outcome.status, outcome.body);
      if (outcome.accepted) void runTick();
      return;
    }
    const paymentRoute = /^\/orders\/([0-9a-f-]{36})\/pay$/i.exec(path);
    if (request.method === 'POST' && paymentRoute) {
      const outcome = await workspace.paidRequest({ id: paymentRoute[1], method: request.method,
        url: workspace.config.publicOrigin + request.url, contentType: header(request, 'content-type'),
        rawBody: await rawBody(request, 1048576), paymentSignature: header(request, 'payment-signature') });
      if (outcome.result) await serveResult(response, outcome.result, outcome.headers);
      else respond(response, outcome.status, outcome.body, outcome.headers);
      return;
    }
    if (!path.startsWith('/api/')) fail('NOT_FOUND', 404);
    const authorization = header(request, 'authorization');
    if (!authorization || !authorization.startsWith('Bearer ') || !constantEqual(authorization.slice(7), operatorToken)) {
      response.setHeader('WWW-Authenticate', 'Bearer realm="merchant"'); fail('OPERATOR_AUTHENTICATION_REQUIRED', 401);
    }
    const origin = header(request, 'origin'), localOrigin = 'http://' + header(request, 'host');
    if (origin && origin !== workspace.config.publicOrigin && origin !== localOrigin) fail('ORIGIN_NOT_ALLOWED', 403);
    if (parsed.search) fail('QUERY_NOT_SUPPORTED');
    if (path === '/api/state' && request.method === 'GET') return respond(response, 200, { config: workspace.publicConfig(), orders: workspace.listOrders() });
    if (path === '/api/orders' && request.method === 'POST') {
      const selection = await jsonBody(request);
      return respond(response, 201, { order: await workspace.createOrder(selection) });
    }
    const match = /^\/api\/orders\/([0-9a-f-]{36})(?:\/(charge|envelope|payment-authorization|reconcile|result))?$/i.exec(path);
    if (!match) fail('NOT_FOUND', 404);
    const [, id, action] = match;
    if (!action && request.method === 'GET') return respond(response, 200, workspace.inspect(id));
    if (action === 'charge' && request.method === 'POST') {
      await rawBody(request, 0); return respond(response, 200, { order: await workspace.createCharge(id) });
    }
    if (action === 'envelope' && request.method === 'GET') return respond(response, 200, workspace.envelope(id), { 'Content-Disposition': 'attachment; filename="payment-request-' + id + '.json"' });
    if (action === 'payment-authorization' && request.method === 'POST') {
      const selected = await jsonBody(request, 70000);
      const order = await workspace.submitAuthorization(id, selected.paymentSignature);
      return respond(response, 200, { order });
    }
    if (action === 'reconcile' && request.method === 'POST') { await rawBody(request, 0); return respond(response, 200, await workspace.reconcile(id)); }
    if (action === 'result' && request.method === 'GET') return serveResult(response, workspace.result(id));
    fail('METHOD_NOT_ALLOWED', 405);
  }
  const server = createServer({ maxHeaderSize: 98304 }, (request, response) => {
    const promise = handle(request, response).catch(error => {
      if (response.headersSent) response.destroy(error);
      else respond(response, Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500, safeError(error));
    }).finally(() => inFlight.delete(promise));
    inFlight.add(promise);
  });
  server.requestTimeout = 35000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolveListen(); });
  });
  const timer = setInterval(runTick, intervalMs);
  timer.unref();
  void runTick();
  const address = server.address(), actualHost = address.address.includes(':') ? '[' + address.address + ']' : address.address;
  const url = 'http://' + actualHost + ':' + address.port;
  async function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      stopping = true; clearInterval(timer);
      const closed = server.listening ? new Promise((resolveClose, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolveClose())) : Promise.resolve();
      server.closeIdleConnections();
      await Promise.allSettled([...inFlight, ...(tick ? [tick] : [])]);
      await closed;
      await workspace.close();
    })();
    try { return await closePromise; } catch (error) { closePromise = null; throw error; }
  }
  return { server, workspace, url, close, runTick };
}
export async function loadMerchantConfiguration(configPath, { env = process.env, allowLoopback = false } = {}) {
  if (!isAbsolute(configPath)) fail('ABSOLUTE_CONFIG_PATH_REQUIRED');
  const raw = await readFile(configPath);
  if (raw.length > 1048576) fail('CONFIG_TOO_LARGE');
  const config = validateConfig(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), { allowLoopback });
  function environment(name, minimum) {
    if (typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(name)) fail('ENVIRONMENT_REFERENCE_INVALID');
    const value = env[name];
    if (typeof value !== 'string' || value.length < minimum || /[\r\n\u0000]/.test(value)) fail('CONFIGURED_ENVIRONMENT_VALUE_REQUIRED');
    return value;
  }
  const credential = environment(config.tenantCredentialEnv, 16);
  const operatorToken = environment(config.operatorTokenEnv, 32);
  const webhookSecretsByVersion = {};
  for (const [version, name] of Object.entries(config.webhook.secretEnvironmentByVersion ?? {})) {
    if (!/^[1-9][0-9]*$/.test(version)) fail('WEBHOOK_KEY_VERSION_INVALID');
    webhookSecretsByVersion[version] = environment(name, 32);
  }
  if (!Object.keys(webhookSecretsByVersion).length) fail('WEBHOOK_SIGNING_KEY_REQUIRED');
  if (typeof config.fulfillmentModule !== 'string') fail('FULFILLMENT_MODULE_REQUIRED');
  const modulePath = resolve(dirname(configPath), config.fulfillmentModule);
  const module = await import(pathToFileURL(modulePath).href);
  const fulfillment = typeof module.createFulfillment === 'function' ? await module.createFulfillment({ configuration: config.fulfillmentOptions ?? {}, baseDirectory: dirname(configPath) }) : module;
  if (typeof fulfillment.fulfill !== 'function' || typeof fulfillment.reconcile !== 'function') fail('FULFILLMENT_MODULE_CONTRACT_REQUIRED');
  return { config, credential, operatorToken, webhookSecretsByVersion, fulfillment };
}
export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true,
    options: { config: { type: 'string' }, directory: { type: 'string' }, host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '8764' }, 'allow-loopback': { type: 'boolean', default: false } } });
  const command = positionals[0] ?? 'serve';
  if (!['serve', 'doctor'].includes(command) || positionals.length > 1 || !values.config) fail('USE_SERVE_OR_DOCTOR_WITH_CONFIG');
  const selected = await loadMerchantConfiguration(resolve(values.config), { allowLoopback: values['allow-loopback'] });
  if (command === 'doctor') {
    if (typeof selected.fulfillment.doctor === 'function') await selected.fulfillment.doctor({ binding: selected.config.fulfillmentBinding });
    process.stdout.write(JSON.stringify({ application: 'x402api-merchant-workspace', configured: true,
      tenantId: selected.config.tenantId, resourceVersionId: selected.config.template.resourceVersionId,
      rails: selected.config.template.rails.map(rail => rail.assetId), fulfillment: 'ready',
      receiptSigningKeyVersions: Object.keys(selected.config.receiptFingerprintsByVersion) }) + '\n');
    return;
  }
  if (!values.directory || !/^(0|[1-9][0-9]{0,4})$/.test(values.port)) fail('PRIVATE_DIRECTORY_AND_PORT_REQUIRED');
  const workspace = await openMerchantWorkspace({ ...selected, directory: resolve(values.directory), allowLoopback: values['allow-loopback'] });
  let host;
  try { host = await startMerchantServer({ workspace, operatorToken: selected.operatorToken, host: values.host, port: Number(values.port) }); }
  catch (error) { await workspace.close(); throw error; }
  process.stdout.write(JSON.stringify({ schema: 'stellar-forge.x402api-merchant-workspace.v1', url: host.url, directory: workspace.store.directory }) + '\n');
  let ending = null;
  const stop = () => {
    if (ending) return;
    ending = (async () => {
      let lastNotice = null;
      for (;;) {
        try { await host.close(); return; }
        catch (error) {
          // The same store lease and actual returns remain owned until their
          // local durability succeeds. A referenced timer keeps this shutdown
          // alive after the HTTP server and periodic work have already closed.
          const notice = JSON.stringify({ state: 'AWAITING_DURABLE_SHUTDOWN', ...safeError(error) });
          if (notice !== lastNotice) {
            try { process.stderr.write(notice + '\n'); } catch {}
            lastNotice = notice;
          }
          await new Promise(resolveRetry => setTimeout(resolveRetry, 5000));
        }
      }
    })();
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => { process.stderr.write(JSON.stringify(safeError(error)) + '\n'); process.exitCode = 1; });
