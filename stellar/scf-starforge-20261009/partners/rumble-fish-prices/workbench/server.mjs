import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorkbench } from './runner.mjs';
import { buildDelivery } from './delivery.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PREFIX = '/_prices';
const fault = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const send = (response, status, value, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...headers });
  response.end(JSON.stringify(value) + '\n');
};
async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw fault('JSON_REQUIRED', 'Send application/json.', 415);
  const parts = []; let bytes = 0;
  for await (const part of request) {
    bytes += part.length;
    if (bytes > 1024 * 1024) throw fault('BODY_TOO_LARGE', 'The operator request exceeds one megabyte.', 413);
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw fault('JSON_INVALID', 'The request body is not valid JSON.'); }
}

export async function startWorkbenchServer({ directory, apiKey, port = 8788, host = '127.0.0.1', workbench, fetchImpl } = {}) {
  if (host !== '127.0.0.1') throw fault('LOOPBACK_REQUIRED', 'The operator service binds to 127.0.0.1.');
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw fault('PORT_INVALID', 'Choose a TCP port from 0 to 65535.');
  const core = workbench ?? await openWorkbench({ directory, apiKey, fetchImpl });
  const capability = randomBytes(32).toString('hex'), secret = Buffer.from(capability);
  let origin, closing = null, available = true;
  const authorized = request => {
    const value = request.headers.authorization;
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
    const candidate = Buffer.from(value.slice(7));
    return candidate.length === secret.length && timingSafeEqual(candidate, secret);
  };
  const assets = new Map([
    [PREFIX, ['index.html', 'text/html; charset=utf-8']],
    [PREFIX + '/', ['index.html', 'text/html; charset=utf-8']],
    [PREFIX + '/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
    [PREFIX + '/consumer.mjs', ['consumer.mjs', 'text/javascript; charset=utf-8']],
    [PREFIX + '/style.css', ['style.css', 'text/css; charset=utf-8']],
  ]);
  const server = createServer((request, response) => {
    (async () => {
      const url = new URL(request.url, origin ?? 'http://127.0.0.1');
      if (assets.has(url.pathname) && ['GET', 'HEAD'].includes(request.method)) {
        const [path, type] = assets.get(url.pathname), bytes = await readFile(join(root, 'ui', path));
        response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
        response.end(request.method === 'HEAD' ? undefined : bytes); return;
      }
      if (!url.pathname.startsWith(PREFIX + '/api/')) throw fault('NOT_FOUND', 'This route is unavailable.', 404);
      if (!available) throw fault('WORKSPACE_CLOSING', 'The owning process is finishing its active read.', 503);
      if (!authorized(request)) throw fault('OPERATOR_AUTH_REQUIRED', 'Open the private operator link printed by this process.', 401);
      if (request.headers.origin && request.headers.origin !== origin) throw fault('ORIGIN_REJECTED', 'Use the owning operator origin.', 403);
      const action = url.pathname.slice((PREFIX + '/api/').length);
      if (request.method === 'GET') {
        if (action === 'state') { send(response, 200, await core.snapshot()); return; }
        if (action === 'consumers') { send(response, 200, await core.consumers()); return; }
        if (action === 'consumer' || action === 'consumer/edition' || action === 'consumer/output') {
          const consumerId = url.searchParams.get('consumerId');
          if (!consumerId) throw fault('CONSUMER_REQUIRED', 'Select a saved customer.');
          const editionId = url.searchParams.get('editionId') || undefined;
          if (action === 'consumer') { send(response, 200, await core.consumer({ consumerId })); return; }
          if (action === 'consumer/edition') { send(response, 200, await core.consumerEdition({ consumerId, editionId })); return; }
          const format = url.searchParams.get('format') || 'json';
          const output = await core.consumerOutput({ consumerId, editionId, format });
          if (format === 'csv') {
            response.writeHead(200, { 'content-type': output.contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-disposition': 'attachment; filename="' + output.filename.replace(/[^a-zA-Z0-9_.-]/g, '_') + '"' });
            response.end(output.content); return;
          }
          send(response, 200, output); return;
        }
        if (action === 'plan') {
          const planId = url.searchParams.get('planId');
          if (!planId) throw fault('PLAN_REQUIRED', 'Select a retained request plan.');
          send(response, 200, await core.getPlan({ planId })); return;
        }
        if (action === 'delivery') {
          const delivery = await buildDelivery(core);
          send(response, 200, delivery, { 'content-disposition': 'attachment; filename="stellar-prices-workbench.json"' }); return;
        }
        if (action === 'result') {
          const input = { runId: url.searchParams.get('runId'), taskId: url.searchParams.get('taskId'), format: url.searchParams.get('format') ?? 'json' };
          if (!input.runId || !input.taskId || !['json', 'csv'].includes(input.format)) throw fault('RESULT_SELECTION_INVALID', 'Select a retained run, task and JSON or CSV format.');
          const result = await core.result(input);
          if (input.format === 'csv') {
            const name = String(result.filename ?? 'prices-result.csv').replace(/[^a-zA-Z0-9_.-]/g, '_');
            response.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
              'x-content-type-options': 'nosniff', 'content-disposition': 'attachment; filename="' + name + '"' });
            response.end(result.content); return;
          }
          send(response, 200, result); return;
        }
        throw fault('NOT_FOUND', 'Unknown operator operation.', 404);
      }
      if (request.method !== 'POST') throw fault('METHOD_NOT_ALLOWED', 'Use the declared operator method.', 405);
      const input = await body(request);
      if (action === 'configuration') { send(response, 200, await core.save(input)); return; }
      if (action === 'consumer') { send(response, 200, await core.saveConsumer(input)); return; }
      if (action === 'consumer/edition') { send(response, 201, await core.createConsumerEdition(input)); return; }
      if (action === 'consumer/review') { send(response, 200, await core.reviewConsumerEdition(input)); return; }
      if (action === 'plan') { send(response, 201, await core.plan(input)); return; }
      if (action === 'start') { send(response, 202, await core.start({ planId: input.planId })); return; }
      if (action === 'pause') { send(response, 200, await core.pause()); return; }
      if (action === 'resume') { send(response, 202, await core.resume({ runId: input.runId })); return; }
      throw fault('NOT_FOUND', 'Unknown operator operation.', 404);
    })().catch(error => {
      if (response.headersSent) { response.destroy(error); return; }
      const known = typeof error.code === 'string' && !/^E[A-Z]+$/.test(error.code);
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : known ? 400 : 500;
      send(response, status, { error: { code: known ? error.code : 'OPERATOR_FAILED',
        message: known ? error.message : 'The owning process could not complete this operation.' } });
      if (!known) process.stderr.write('Prices workbench: ' + String(error.stack ?? error) + '\n');
    });
  });
  server.requestTimeout = 120_000; server.headersTimeout = 30_000;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
  catch (error) { await core.close(); throw error; }
  origin = 'http://' + host + ':' + server.address().port;
  return Object.freeze({
    workbench: core, server, origin, operatorUrl: origin + PREFIX + '/#' + capability,
    close: () => closing ??= (async () => {
      available = false;
      const httpClosed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeIdleConnections();
      const deadline = setTimeout(() => server.closeAllConnections(), 65_000);
      try { await core.close(); await httpClosed; }
      finally { clearTimeout(deadline); }
      return { closed: true };
    })(),
  });
}
