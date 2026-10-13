// MIT License. Complete local native customer journey for the merchant product.
// Runs the actual HTTP server, tenant client, SQLite store, Ed25519/HMAC verifier,
// configured file-delivery adapter and original SF31/SF88 file implementations.
// All payment responses and keys in this receiving directory are local fixtures.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { constants, watch, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, renameSync, lstatSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, unlink, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openMerchantWorkspace } from './workspace.mjs';
import { startMerchantServer, loadMerchantConfiguration } from './server.mjs';
import { createProvider } from './provider.mjs';
import { createProtocolFixture, publishedWebhookVectors } from './receiving-protocol.mjs';
import { verifyWebhook, verifyReceipt, canonicalJson, digestBytes } from './protocol.mjs';
import { createFulfillment, describeFile } from './fulfillment/file-delivery.mjs';

const OPERATION = 'SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012';
const options = parseArgs({ options: { directory: { type: 'string' }, phase: { type: 'string' } } }).values;
assert(options.directory && options.phase);
const ROOT = resolve(options.directory), PHASE = options.phase;
const SOURCE = process.env.MERCHANT_COMMISSION_SOURCE_SHA256;
const ATTEMPT = process.env.MERCHANT_COMMISSION_ATTEMPT;
assert.match(SOURCE ?? '', /^[0-9a-f]{64}$/);
assert.match(ATTEMPT ?? '', /^[0-9a-f-]{36}$/);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const exists = async path => { try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function syncDirectory(path) { const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY); try { await handle.sync(); } finally { await handle.close(); } }
async function directory(path) { await mkdir(path, { recursive: true, mode: 0o700 }); const info = await lstat(path); assert(info.isDirectory() && !info.isSymbolicLink() && !(info.mode & 0o077)); }
async function save(path, value, exact = false) {
  await directory(dirname(path));
  const raw = Buffer.isBuffer(value) ? value : bytes(value);
  if (exact && await exists(path)) { assert.deepEqual(await readFile(path), raw); return; }
  const temporary = path + '.' + randomUUID() + '.partial';
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path); await syncDirectory(dirname(path));
}
function revive(_key, value) { return value?.type === 'Buffer' && Array.isArray(value.data) ? Buffer.from(value.data) : value; }
async function readJSON(path) { return JSON.parse(await readFile(path, 'utf8'), revive); }
function synchronousRecord(path, value) {
  const temporary = path + '.' + randomUUID() + '.partial', fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, bytes(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(parent); } finally { closeSync(parent); }
}
async function audit(name, value) {
  await directory(join(ROOT, 'observations'));
  const handle = await open(join(ROOT, 'observations', name + '.jsonl'), 'a', 0o600);
  try { await handle.writeFile(JSON.stringify({ at: new Date().toISOString(), phase: PHASE, ...value }) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
async function auditRows(name) {
  const path = join(ROOT, 'observations', name + '.jsonl');
  return await exists(path) ? (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
const invoiceIds = [
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000003',
  'aaaaaaaa-0000-4000-8000-000000000004',
  'aaaaaaaa-0000-4000-8000-000000000005',
];
const providerId = (prefix, index) => prefix + '-0000-4000-8000-' + String(index + 1).padStart(12, '0');
function resign(fixture, secret) {
  for (const event of [fixture.paid, fixture.test]) {
    const timestamp = event.headers['x-x402api-webhook-timestamp'];
    event.headers['x-x402api-webhook-signature'] = 'v1=' + createHmac('sha256', secret)
      .update(timestamp + '.').update(event.rawBody).digest('hex');
  }
  fixture.secretsByVersion = { '1': secret };
  return fixture;
}
async function initialize() {
  await directory(ROOT); await directory(join(ROOT, 'observations')); await directory(join(ROOT, 'boundaries'));
  const path = join(ROOT, 'scenario.json');
  if (await exists(path)) { const original = await readJSON(path); assert.equal(original.operation, OPERATION); assert.equal(original.sourceSha256, SOURCE); return original; }
  let epoch = Math.floor(Date.now() / 1000); const fixtures = [];
  const template = { resourceId: '66666666-7777-4888-8999-000000000000',
    resourceVersionId: '55555555-6666-4777-8888-999999999999', resourceVersion: 1,
    feeMode: 'buyer_pays', fulfillmentMode: 'webhook', expiresInSeconds: 300,
    rails: [
      { assetId: 'base-usdc-native', assetVersion: 1, walletVersion: 1, label: 'Base USDC', decimals: 6,
        network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        recipient: '0x1111111111111111111111111111111111111111', maxTimeoutSeconds: 300 },
      { assetId: 'solana-usdt-native', assetVersion: 1, walletVersion: 1, label: 'Solana USDT', decimals: 6,
        network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', asset: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        recipient: '7n4z4jgbQUG9EmfiWdvycqbGSwBgsTkFQ8FFkY47NNZi', maxTimeoutSeconds: 300 },
    ] };
  for (let index = 0; index < invoiceIds.length; index++) {
    const fixturePath = join(ROOT, 'fixtures', String(index + 1) + '.json');
    let fixture;
    if (await exists(fixturePath)) fixture = await readJSON(fixturePath);
    else {
      fixture = createProtocolFixture({ nowSeconds: epoch, resourceVersionId: template.resourceVersionId,
        resourceUrl: 'https://merchant.example/orders/' + invoiceIds[index] + '/pay',
        signingKeyVersion: 'commission-' + (index + 1),
        expected: { orderId: providerId('bbbbbbbb', index), chargeId: providerId('cccccccc', index),
          paymentId: providerId('dddddddd', index), amountAtomic: String((index + 1) * 1000000),
          requestHash: digestBytes(randomBytes(32)), transaction: '0x' + String(index + 1).repeat(64),
          blockHash: '0x' + (index + 5).toString(16).repeat(64) } });
      fixture.order.payment_identifier = 'chg_local_commission_' + (index + 1);
      await save(fixturePath, fixture, true);
    }
    if (index === 0) epoch = fixture.nowSeconds;
    assert.equal(fixture.expected.orderId, providerId('bbbbbbbb', index));
    fixtures.push(fixture);
  }
  const nowSeconds = fixtures[0].nowSeconds, secret = fixtures[0].secretsByVersion['1'];
  const wrongPath = join(ROOT, 'fixtures', 'wrong-pinned-key.json');
  let wrong;
  if (await exists(wrongPath)) wrong = await readJSON(wrongPath);
  else { wrong = createProtocolFixture({ nowSeconds, expected: fixtures[0].expected,
    resourceVersionId: template.resourceVersionId, resourceUrl: fixtures[0].resourceUrl, signingKeyVersion: 'commission-1' });
    await save(wrongPath, wrong, true); }
  const customerFile = join(ROOT, 'customer', 'Merchant_Commissioned_Delivery.txt');
  const text = 'Merchant order delivery\nOriginal edition: SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012\n' +
    'This complete local commissioning file is the immutable product delivered after the original verified payment.\n\n' +
    Array.from({ length: 1024 }, (_, index) => 'Record ' + String(index + 1).padStart(4, '0') + ': selected source, exact amount, original payment and reusable customer output.\n').join('');
  await save(customerFile, Buffer.from(text), true);
  const described = await describeFile({ path: customerFile, contentType: 'text/plain', fileName: 'Merchant_Commissioned_Delivery.txt' });
  await save(join(ROOT, 'customer', 'delivery-manifest.json'), described.manifest, true);
  const fingerprints = Object.assign({}, ...fixtures.map(item => item.fingerprintsByVersion));
  const scenario = { schema: 'stellar-forge.merchant-native-receiving.v1', operation: OPERATION,
    mode: 'LOCAL_NATIVE_COMMISSIONING', sourceSha256: SOURCE, nowMs: nowSeconds * 1000,
    invoiceIds, credential: 'local_commission_tenant_' + randomBytes(16).toString('hex'),
    operatorToken: randomBytes(32).toString('hex'), webhookSecretsByVersion: { '1': secret },
    config: { tenantId: fixtures[0].expected.tenantId, publicOrigin: 'https://merchant.example', template,
      webhook: { endpointId: fixtures[0].endpointId }, receiptFingerprintsByVersion: fingerprints,
      receiptPinSource: 'Independently selected local commissioning Ed25519 public-key fingerprints',
      fulfillmentBinding: described.binding, maxResultBytes: 2 * 1024 * 1024 },
    delivery: { path: customerFile, manifest: join(ROOT, 'customer', 'delivery-manifest.json'),
      binding: described.binding, metadata: Object.values(described.manifest.files)[0] } };
  await save(path, scenario, true);
  const configuration = { ...scenario.config, tenantCredentialEnv: 'MERCHANT_LOCAL_TENANT', operatorTokenEnv: 'MERCHANT_LOCAL_OPERATOR',
    webhook: { ...scenario.config.webhook, secretEnvironmentByVersion: { '1': 'MERCHANT_LOCAL_WEBHOOK' } },
    fulfillmentModule: fileURLToPath(new URL('./fulfillment/file-delivery.mjs', import.meta.url)), fulfillmentOptions: { manifest: scenario.delivery.manifest } };
  const configuredPath = join(ROOT, 'customer', 'merchant.configuration.json'); await save(configuredPath, configuration, true);
  const configured = await loadMerchantConfiguration(configuredPath, { env: { MERCHANT_LOCAL_TENANT: scenario.credential,
    MERCHANT_LOCAL_OPERATOR: scenario.operatorToken, MERCHANT_LOCAL_WEBHOOK: secret } });
  const doctor = await configured.fulfillment.doctor({ binding: described.binding });
  await save(join(ROOT, 'observations', 'configured-delivery-doctor.json'), doctor, true);
  const published = publishedWebhookVectors().map(vector => {
    const verified = verifyWebhook({ ...vector, endpointId: fixtures[0].endpointId });
    assert.equal(verified.kind, vector.kind);
    return { kind: verified.kind, deliveryId: verified.deliveryId, bodySha256: verified.bodySha256 };
  });
  await save(join(ROOT, 'observations', 'published-hmac-vectors.json'), published, true);
  return scenario;
}
let scenario, fixtures, clock, behavior, currentWorkspace;
async function fixtureInputs() {
  scenario = await readJSON(join(ROOT, 'scenario.json'));
  assert.equal(scenario.operation, OPERATION); assert.equal(scenario.sourceSha256, SOURCE);
  fixtures = await Promise.all(invoiceIds.map((_id, index) => readJSON(join(ROOT, 'fixtures', String(index + 1) + '.json'))));
  fixtures.forEach(item => resign(item, scenario.webhookSecretsByVersion['1']));
  const savedClock = await exists(join(ROOT, 'clock.json')) ? await readJSON(join(ROOT, 'clock.json')) : null;
  clock = { now: savedClock?.now ?? scenario.nowMs };
  behavior = { receipt: 'valid', fingerprint: 'valid', paymentMode: 'normal' };
}
async function advance(milliseconds = 11000) { clock.now += milliseconds; await save(join(ROOT, 'clock.json'), clock); }
function fixtureForMerchant(id) { const index = invoiceIds.indexOf(id); assert(index >= 0); return fixtures[index]; }
function requestIdentity(fixture) { return { method: 'POST', url: fixture.resourceUrl, contentType: 'application/json',
  bodyBase64: Buffer.from(JSON.stringify({ order_id: invoiceIds[fixtures.indexOf(fixture)], reference: 'INVOICE-' + (fixtures.indexOf(fixture) + 1) })).toString('base64') }; }
function chargeFor(fixture, body) {
  const accepted = body.prices.map(price => {
    const rail = scenario.config.template.rails.find(item => item.assetId === price.asset_id); assert(rail);
    return { scheme: 'exact', network: rail.network, amount: price.amount_atomic, asset: rail.asset,
      payTo: rail.recipient, maxTimeoutSeconds: 300, extra: { localCommissioningProfile: 'native-receiving-v1' } };
  });
  const required = { x402Version: 2, resource: { url: body.resource_url, description: body.description, mimeType: body.content_type },
    accepts: accepted, extensions: { 'local-commissioning': { version: 1 } } };
  // Change object insertion order deliberately; semantic/header binding must use
  // the original canonical algorithm, rather than object insertion order.
  const projected = { accepts: required.accepts, extensions: required.extensions, resource: required.resource, x402Version: 2 };
  const timestamp = new Date(scenario.nowMs).toISOString();
  return { charge_id: fixture.expected.chargeId, charge_digest: digestBytes('local-charge-' + fixture.expected.chargeId),
    order_id: fixture.expected.orderId, status: 'payment_pending', resource_version_id: fixture.resourceVersionId,
    payment_identifier: fixture.order.payment_identifier, created_at: timestamp,
    expires_at: new Date(scenario.nowMs + 300000).toISOString(), requested_expires_in_seconds: 300,
    prices: body.prices, metadata: body.metadata, metadata_digest: digestBytes(canonicalJson(body.metadata)),
    eligible_alternatives: [], fee_policy: {}, fee_quote_digest: digestBytes('local-fixture-fee-quote'),
    payment_required: projected, payment_required_header: Buffer.from(canonicalJson(required)).toString('base64') };
}
async function providerServer() {
  const server = createServer(async (request, response) => {
    try {
      const body = Buffer.concat(await Array.fromAsync(request));
      assert.equal(request.headers.authorization, 'Bearer ' + scenario.credential);
      const record = { method: request.method, path: request.url, bodyBase64: body.toString('base64'), bodySha256: sha(body),
        headers: { idempotencyKey: request.headers['idempotency-key'] ?? null,
          paymentSignature: request.headers['payment-signature'] ?? null, contentType: request.headers['content-type'] ?? null } };
      let status = 200, value, headers = {}, fixture;
      if (request.method === 'POST' && request.url === '/v1/charges') {
        const input = JSON.parse(body);
        fixture = fixtureForMerchant(input.metadata.merchant_order_id);
        const order = currentWorkspace.store.getOrder(input.metadata.merchant_order_id, { private: true });
        assert.deepEqual(body, order.chargeRequestBytes);
        assert.equal(request.headers['idempotency-key'], order.chargeIdempotencyKey);
        assert.equal(request.headers['content-type'], 'application/json');
        status = 201; value = chargeFor(fixture, input);
      } else {
        fixture = fixtures.find(item => request.url.includes(item.expected.chargeId) ||
          request.url.includes(item.expected.orderId) || request.url.includes(item.expected.paymentId));
        assert(fixture, 'Original provider fixture must match the selected URL.');
        if (request.method === 'POST' && request.url === '/v1/charges/' + fixture.expected.chargeId + '/payments') {
          assert.equal(body.length, 0); assert.equal(request.headers['content-type'], undefined);
          const merchantId = invoiceIds[fixtures.indexOf(fixture)], order = currentWorkspace.store.getOrder(merchantId, { private: true });
          assert.equal(request.headers['payment-signature'], order.signature);
          const earlier = (await auditRows('provider-http')).filter(row => row.method === 'POST' && row.path === request.url);
          if (fixtures.indexOf(fixture) === 0 && earlier.length === 0) {
            status = 503; value = { error: 'local_original_outcome_pending' }; headers['Retry-After'] = '1';
          } else if (behavior.paymentMode === 'conflict') { status = 409; value = { error: 'local_original_replay_conflict', payment_id: fixture.expected.paymentId }; }
          else {
            value = { payment_id: fixture.expected.paymentId, transaction: fixture.expected.transaction };
            headers['PAYMENT-RESPONSE'] = Buffer.from(JSON.stringify({ success: true, transaction: fixture.expected.transaction })).toString('base64');
          }
        } else if (request.method === 'GET' && request.url === '/v1/orders/' + fixture.expected.orderId) {
          value = { ...fixture.order, ...(behavior.fingerprint === 'wrong' && fixture === fixtures[0] ? { request_fingerprint: 'sha256:' + 'e'.repeat(64) } : {}) };
        } else if (request.method === 'GET' && request.url === '/v1/payments/' + fixture.expected.paymentId + '/receipt') {
          value = behavior.receipt === 'wrong-pin' && fixture === fixtures[0] ?
            (await readJSON(join(ROOT, 'fixtures', 'wrong-pinned-key.json'))).receiptEnvelope : fixture.receiptEnvelope;
        } else if (request.method === 'GET' && request.url === '/v1/payments/' + fixture.expected.paymentId) {
          // Retained opaque reconciliation data; this fixture does not invent
          // fields needed for authorization from the unpublished payment schema.
          value = { local_commissioning: true, id: fixture.expected.paymentId };
        } else if (request.method === 'GET' && request.url === '/v1/charges/' + fixture.expected.chargeId) {
          const order = currentWorkspace.store.getOrder(invoiceIds[fixtures.indexOf(fixture)], { private: true });
          value = { ...order.charge, status: 'paid' };
        } else throw new Error('Unexpected local provider request.');
      }
      const raw = Buffer.from(JSON.stringify(value, null, 2) + '\n');
      await audit('provider-http', { ...record, status, responseBase64: raw.toString('base64'), responseSha256: sha(raw), responseHeaders: headers });
      response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      if (behavior.paymentMode === 'incomplete-200' && request.method === 'POST' && /\/payments$/.test(request.url) && status === 200) {
        response.flushHeaders(); response.write(raw.subarray(0, Math.floor(raw.length / 2)));
        setTimeout(() => response.destroy(), 25);
      } else response.end(raw);
    } catch (error) {
      await audit('provider-errors', { code: error.code ?? 'LOCAL_PROVIDER_ASSERTION', message: error.message });
      response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'LOCAL_PROVIDER_ASSERTION' }));
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const url = 'http://127.0.0.1:' + server.address().port;
  return { server, url, async close() { server.closeIdleConnections(); await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())); } };
}
function killAtBoundary(kind, detail = {}) {
  const marker = { schema: 'stellar-forge.merchant-native-interruption.v1', operation: OPERATION,
    sourceSha256: SOURCE, attempt: ATTEMPT, phase: PHASE, pid: process.pid, kind,
    workspace: join(ROOT, 'workspace'), ...detail, at: new Date().toISOString() };
  synchronousRecord(join(ROOT, 'boundaries', ATTEMPT + '.json'), marker);
  process.stdout.write(JSON.stringify({ state: 'INTENDED_NATIVE_INTERRUPTION', marker }) + '\n');
  process.kill(process.pid, 'SIGKILL');
}
async function application({ killHandler = false } = {}) {
  const upstream = await providerServer();
  const selected = await createFulfillment({ configuration: { manifest: scenario.delivery.manifest }, baseDirectory: ROOT });
  await selected.doctor({ binding: scenario.config.fulfillmentBinding });
  const fulfillment = {
    async fulfill(context) {
      await audit('handler-calls', { method: 'fulfill', paymentId: context.payment.id,
        merchantOrderId: context.order.id, binding: context.order.frozen.fulfillmentBinding, idempotencyKey: context.idempotencyKey });
      const result = await selected.fulfill(context);
      await save(join(ROOT, 'handler-returns', context.payment.id + '.json'), { paymentId: context.payment.id,
        binding: context.order.frozen.fulfillmentBinding, bytes: result.bytes.length, sha256: sha(result.bytes),
        contentType: result.contentType, fileName: result.fileName }, true);
      if (killHandler && context.payment.id === fixtures[1].expected.paymentId)
        killAtBoundary('HANDLER_RETURN_BEFORE_STORE', { paymentId: context.payment.id, resultSha256: sha(result.bytes) });
      return result;
    },
    async reconcile(context) {
      await audit('handler-calls', { method: 'reconcile', paymentId: context.payment.id,
        merchantOrderId: context.order.id, binding: context.order.frozen.fulfillmentBinding, idempotencyKey: context.idempotencyKey });
      return selected.reconcile(context);
    },
  };
  const provider = createProvider({ origin: upstream.url, credential: scenario.credential, allowLoopback: true, timeoutMs: 5000 });
  currentWorkspace = await openMerchantWorkspace({ directory: join(ROOT, 'workspace'), config: scenario.config,
    provider, webhookSecretsByVersion: scenario.webhookSecretsByVersion, fulfillment, clock: () => clock.now });
  const app = await startMerchantServer({ workspace: currentWorkspace, operatorToken: scenario.operatorToken, port: 0, intervalMs: 2147483647 });
  await app.runTick();
  return { ...app, upstream, async close() { await app.close(); await upstream.close(); } };
}
async function call(app, method, path, body = null, headers = {}, operator = true) {
  const raw = body === null ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const response = await fetch(app.url + path, { method, headers: {
    ...(operator ? { Authorization: 'Bearer ' + scenario.operatorToken } : {}),
    ...(body !== null && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(raw === undefined ? {} : { body: raw }), signal: AbortSignal.timeout(10000), redirect: 'manual' });
  const returned = Buffer.from(await response.arrayBuffer());
  let json = null; try { json = JSON.parse(returned); } catch {}
  await audit('merchant-http', { method, path, status: response.status, requestSha256: sha(raw ?? Buffer.alloc(0)),
    responseBytes: returned.length, responseSha256: sha(returned), responseHeaders: {
      contentType: response.headers.get('content-type'), paymentRequired: response.headers.get('payment-required'),
      paymentResponse: response.headers.get('payment-response'), contentSha256: response.headers.get('x-content-sha256') } });
  return { status: response.status, raw: returned, json, headers: response.headers };
}
async function createInvoice(app, index) {
  const id = invoiceIds[index], fixture = fixtures[index];
  let previous = null;
  try { previous = currentWorkspace.store.getOrder(id, { private: true }); }
  catch (error) { if (error.code !== 'MERCHANT_ORDER_NOT_FOUND') throw error; }
  const created = await call(app, 'POST', '/api/orders', { id, reference: 'INVOICE-' + (index + 1),
    title: 'Complete customer delivery ' + (index + 1), prices: [
      { assetId: 'base-usdc-native', amountAtomic: fixture.expected.amountAtomic },
      { assetId: 'solana-usdt-native', amountAtomic: String((index + 1) * 1250000) },
    ] });
  assert.equal(created.status, 201);
  const charged = await call(app, 'POST', '/api/orders/' + id + '/charge'); assert.equal(charged.status, 200);
  if (!previous?.charge) assert.equal(charged.json.order.state, 'AWAITING_PAYMENT');
  const order = currentWorkspace.store.getOrder(id, { private: true });
  assert.equal(order.frozen.fulfillmentBinding, scenario.config.fulfillmentBinding);
  assert.equal(order.charge.payment_required.accepts.length, 2);
  const envelope = await call(app, 'GET', '/api/orders/' + id + '/envelope');
  assert.equal(envelope.status, 200); assert.equal(typeof envelope.json.paymentRequired, 'string');
  assert.equal(envelope.json.paymentRequired, order.charge.payment_required_header);
  assert.deepEqual(JSON.parse(Buffer.from(envelope.json.paymentRequired, 'base64')), order.charge.payment_required);
  return { id, fixture, order, requestBody: Buffer.from(envelope.json.bodyBase64, 'base64'),
    signature: Buffer.from(JSON.stringify({ localCommissioning: true, buyerPaymentIdentifier: 'original_buyer_' + String(index + 1).padStart(16, '0'),
      chargeId: fixture.expected.chargeId })).toString('base64') };
}
async function submit(app, invoice) {
  const outcome = await call(app, 'POST', '/orders/' + invoice.id + '/pay', invoice.requestBody,
    { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': invoice.signature }, false);
  assert.equal(outcome.status, 202); return outcome;
}
async function finalized(app, fixture) {
  const response = await call(app, 'POST', '/webhooks/x402api', fixture.paid.rawBody, fixture.paid.headers, false);
  assert.equal(response.status, 200); await app.runTick(); return response;
}
async function callsFor(paymentId, method) { return (await auditRows('handler-calls')).filter(row => row.paymentId === paymentId && row.method === method); }
async function verifyDownload(app, index) {
  const id = invoiceIds[index], fixture = fixtures[index];
  const state = await call(app, 'GET', '/api/orders/' + id);
  assert.equal(state.json.order.state, 'COMPLETE', JSON.stringify(state.json));
  const saved = await currentWorkspace.result(id).verify();
  const result = await call(app, 'GET', '/api/orders/' + id + '/result');
  assert.equal(result.status, 200); assert.deepEqual(result.raw, await readFile(scenario.delivery.path));
  assert.equal(result.headers.get('x-content-sha256'), scenario.delivery.metadata.sha256);
  assert.equal((await callsFor(fixture.expected.paymentId, 'fulfill')).length, 1);
  const job = currentWorkspace.store.getFulfillment(fixture.expected.paymentId, { private: true });
  assert.equal(job.state, 'COMPLETE'); assert.equal(job.sha256, scenario.delivery.metadata.sha256);
  return { merchantOrderId: id, providerOrderId: fixture.expected.orderId, chargeId: fixture.expected.chargeId,
    paymentId: fixture.expected.paymentId, state: 'COMPLETE', bytes: result.raw.length, sha256: sha(result.raw),
    receiptDigest: state.json.order.receiptVerification.receiptDigest, resultPath: job.resultFile.path,
    handlerInvocations: 1, reconcileInvocations: (await callsFor(fixture.expected.paymentId, 'reconcile')).length };
}
async function originalJourney() {
  // Reopen the retained pending event with its original negative-case provider
  // selection before the server starts its first background reconciliation.
  const prior = await exists(join(ROOT, 'phase-original-progress.json')) ? await readJSON(join(ROOT, 'phase-original-progress.json')) : {};
  if (!prior.rejectedPin) behavior.receipt = 'wrong-pin';
  else if (!prior.rejectedRequest) behavior.fingerprint = 'wrong';
  let app = await application();
  try {
    const finishedPath = join(ROOT, 'phase-original.json');
    if (await exists(finishedPath)) {
      const original = await readJSON(finishedPath);
      assert.equal(original.operation, OPERATION); assert.equal(original.sourceSha256, SOURCE);
      assert.equal(original.state, 'COMPLETE'); await verifyDownload(app, 0);
      return;
    }
    const progressPath = join(ROOT, 'phase-original-progress.json');
    const progress = await exists(progressPath) ? await readJSON(progressPath) :
      { operation: OPERATION, sourceSha256: SOURCE };
    assert.equal(progress.operation, OPERATION); assert.equal(progress.sourceSha256, SOURCE);
    assert.equal((await call(app, 'GET', '/health', null, {}, false)).status, 200);
    assert.equal((await call(app, 'GET', '/', null, {}, false)).status, 200);
    const fixture = fixtures[0];
    const ownership = await call(app, 'POST', '/webhooks/x402api', fixture.ownership.rawBody, fixture.ownership.headers, false);
    assert.equal(ownership.status, 200); assert.deepEqual(ownership.json, fixture.ownership.responseBody);
    const test = await call(app, 'POST', '/webhooks/x402api', fixture.test.rawBody, fixture.test.headers, false);
    assert.equal(test.status, 200); await app.runTick();
    const invoice = await createInvoice(app, 0);
    if (!progress.negativeRequestChecked) {
      const invalid = await call(app, 'POST', '/orders/' + invoice.id + '/pay', Buffer.concat([invoice.requestBody, Buffer.from(' ')]),
        { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': invoice.signature }, false);
      assert.equal(invalid.status, 409);
      const challenge = await call(app, 'POST', '/orders/' + invoice.id + '/pay', invoice.requestBody, { 'Content-Type': 'application/json' }, false);
      assert.equal(challenge.status, 402); assert.equal(challenge.headers.get('payment-required'), invoice.order.charge.payment_required_header);
      progress.negativeRequestChecked = true; await save(progressPath, progress);
    }
    const originalReturns = currentWorkspace.store.history(invoice.id).filter(row => row.exchange?.kind === 'submit_payment');
    if (!originalReturns.some(row => row.exchange.status === 200)) {
      if (!originalReturns.length) {
        await submit(app, invoice);
        assert.equal(currentWorkspace.store.getOrder(invoice.id, { private: true }).state, 'PAYMENT_UNCERTAIN');
      }
      await advance(1500); await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
    }
    const paidPosts = (await auditRows('provider-http')).filter(row => row.path === '/v1/charges/' + fixture.expected.chargeId + '/payments');
    assert.deepEqual(paidPosts.map(row => row.status), [503, 200]);
    assert.deepEqual(paidPosts[0].headers, paidPosts[1].headers);
    assert.equal(paidPosts[0].bodyBase64, ''); assert.equal(paidPosts[1].bodyBase64, '');
    const changedHeader = { ...fixture.paid.headers, 'x-x402api-webhook-signature': 'v1=' + '0'.repeat(64) };
    const invalidWebhook = await call(app, 'POST', '/webhooks/x402api', fixture.paid.rawBody, changedHeader, false);
    assert.equal(invalidWebhook.status, 400, JSON.stringify(invalidWebhook.json));
    await save(join(ROOT, 'observations', 'invalid-webhook-rejection.json'), {
      status: invalidWebhook.status, response: invalidWebhook.json, rawSha256: sha(invalidWebhook.raw) }, true);
    let rejectedPin = progress.rejectedPin, rejectedRequest = progress.rejectedRequest;
    if (!rejectedPin) {
      behavior.receipt = 'wrong-pin'; await advance(); await finalized(app, fixture);
      assert.equal((await callsFor(fixture.expected.paymentId, 'fulfill')).length, 0);
      rejectedPin = currentWorkspace.inspect(invoice.id).order.lastError;
      const wrongEnvelope = (await readJSON(join(ROOT, 'fixtures', 'wrong-pinned-key.json'))).receiptEnvelope;
      assert.throws(() => verifyReceipt({ envelope: wrongEnvelope, fingerprintsByVersion: scenario.config.receiptFingerprintsByVersion, expected: fixture.expected }),
        error => error.code === 'X402API_DIGEST_MISMATCH' && error.field === 'independentFingerprint');
      assert.equal(rejectedPin?.code, 'X402API_DIGEST_MISMATCH', JSON.stringify(rejectedPin));
      progress.rejectedPin = rejectedPin; await save(progressPath, progress);
    }
    behavior.receipt = 'valid';
    if (!rejectedRequest) {
      behavior.fingerprint = 'wrong'; await advance();
      await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
      assert.equal((await callsFor(fixture.expected.paymentId, 'fulfill')).length, 0);
      rejectedRequest = currentWorkspace.inspect(invoice.id).order.lastError;
      assert(rejectedRequest && /REQUEST|BINDING/.test(rejectedRequest.code), JSON.stringify(rejectedRequest));
      progress.rejectedRequest = rejectedRequest; await save(progressPath, progress);
    }
    behavior.fingerprint = 'valid'; await advance();
    await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
    const completed = await verifyDownload(app, 0);
    await finalized(app, fixture); assert.equal((await callsFor(fixture.expected.paymentId, 'fulfill')).length, 1);
    const replay = await call(app, 'POST', '/orders/' + invoice.id + '/pay', invoice.requestBody,
      { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': invoice.signature }, false);
    assert.equal(replay.status, 200); assert.deepEqual(replay.raw, await readFile(scenario.delivery.path));
    await app.close(); app = await application();
    await verifyDownload(app, 0);
    await save(finishedPath, { operation: OPERATION, sourceSha256: SOURCE, state: 'COMPLETE',
      completed, rejectedPin, rejectedRequest, paidRequestStatuses: [503, 200], reopened: true });
  } finally { await app.close(); }
}
async function interruptHandler() {
  const app = await application({ killHandler: true });
  try { const invoice = await createInvoice(app, 1); await submit(app, invoice); await advance(); await finalized(app, invoice.fixture);
    throw new Error('The intended handler boundary did not interrupt the original process.'); }
  finally { await app.close(); }
}
async function resumeHandler() {
  await advance();
  const app = await application();
  try { await app.runTick(); const result = await verifyDownload(app, 1);
    assert.equal(result.reconcileInvocations, 1);
    await save(join(ROOT, 'phase-handler-resume.json'), { operation: OPERATION, sourceSha256: SOURCE, state: 'COMPLETE', result });
  } finally { await app.close(); }
}
async function interruptResult() {
  const app = await application();
  const fixture = fixtures[2], folder = join(ROOT, 'workspace', 'results', fixture.expected.paymentId);
  await directory(folder);
  const lockPath = join(folder, '.' + scenario.delivery.metadata.fileName + '.x402-download.lock');
  const observer = watch(folder, () => {
    try {
      const raw = readFileSync(lockPath);
      if (!raw.length) return;
      const reservation = JSON.parse(raw);
      if (reservation.reservationTag !== fixture.expected.paymentId || reservation.destination !== join(folder, scenario.delivery.metadata.fileName)) return;
      const job = currentWorkspace.store.getFulfillment(fixture.expected.paymentId, { private: true });
      if (job?.state !== 'RETURNED') return;
      const partial = lstatSync(reservation.partialPath);
      if (!partial.isFile() || partial.size > job.byteLength) return;
      killAtBoundary('SF31_ORIGINAL_RESERVATION', { paymentId: fixture.expected.paymentId,
        reservation, reservationSha256: sha(raw), partialBytes: partial.size, returnedSha256: job.sha256 });
    } catch (error) { if (!['ENOENT'].includes(error.code) && !(error instanceof SyntaxError)) throw error; }
  });
  try { const invoice = await createInvoice(app, 2); await submit(app, invoice); await advance(); await finalized(app, fixture);
    throw new Error('The original SF31 writer completed before its requested interruption was observed.'); }
  finally { observer.close(); await app.close(); }
}
async function resumeResult() {
  await advance();
  const app = await application();
  try {
    await app.runTick();
    const result = await verifyDownload(app, 2);
    assert.equal(result.reconcileInvocations, 0, 'Durable returned bytes must not call the handler again.');
    assert.equal((await readdir(join(ROOT, 'workspace', 'results', fixtures[2].expected.paymentId))).some(name => name.endsWith('.lock')), false);
    await save(join(ROOT, 'phase-result-resume.json'), { operation: OPERATION, sourceSha256: SOURCE, state: 'COMPLETE', result });
  } finally { await app.close(); }
}
async function paymentReturnRecovery() {
  let app = await application();
  try {
    const invoice = await createInvoice(app, 3), fixture = invoice.fixture;
    const originalAppend = currentWorkspace.store.appendExchange.bind(currentWorkspace.store);
    let armed = true;
    currentWorkspace.store.appendExchange = (id, exchange) => {
      const saved = originalAppend(id, exchange);
      if (armed && id === invoice.id && exchange.kind === 'submit_payment' && exchange.status === 200) {
        armed = false;
        synchronousRecord(join(ROOT, 'observations', 'payment-200-commit-interruption.json'), {
          operation: OPERATION, sourceSha256: SOURCE, phase: PHASE, attempt: ATTEMPT,
          kind: 'AFTER_ORIGINAL_EXCHANGE_COMMIT', exchangeId: saved.id,
          paymentId: fixture.expected.paymentId, status: saved.status, rawSha256: saved.rawSha256 });
        throw Object.assign(new Error('Selected local exception after the original exchange committed.'), { code: 'EIO' });
      }
      return saved;
    };
    await submit(app, invoice); assert.equal(armed, false);
    await advance(); await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
    let posts = (await auditRows('provider-http')).filter(row => row.path === '/v1/charges/' + fixture.expected.chargeId + '/payments');
    assert.equal(posts.length, 1);
    const retained = currentWorkspace.store.history(invoice.id).filter(row => row.exchange?.kind === 'submit_payment' && row.exchange.status === 200);
    assert.equal(retained.length, 1); assert.equal(currentWorkspace.providerReturns.size, 0);
    await app.close(); app = await application();
    await advance(); await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
    posts = (await auditRows('provider-http')).filter(row => row.path === '/v1/charges/' + fixture.expected.chargeId + '/payments');
    assert.equal(posts.length, 1);
    await advance(); await finalized(app, fixture);
    const result = await verifyDownload(app, 3);
    await save(join(ROOT, 'phase-payment-return.json'), { operation: OPERATION, sourceSha256: SOURCE, state: 'COMPLETE',
      result, observedPaymentPosts: 1, originalExchangeRecords: 1, originalResponseRecoveredAfterReopen: true });
  } finally { await app.close(); }
}
async function incompleteSuccessRecovery() {
  let app = await application();
  try {
    const invoice = await createInvoice(app, 4), fixture = invoice.fixture;
    behavior.paymentMode = 'incomplete-200';
    await submit(app, invoice);
    const original = currentWorkspace.store.history(invoice.id).find(row => row.exchange?.kind === 'submit_payment');
    assert.equal(original.exchange.status, 200); assert.equal(original.exchange.responseComplete, false);
    assert(original.exchange.raw.length > 0);
    assert.equal(currentWorkspace.store.getOrder(invoice.id, { private: true }).paymentId ?? null, null);
    behavior.paymentMode = 'normal'; await advance();
    await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
    const projection = currentWorkspace.store.getOrder(invoice.id, { private: true });
    assert(projection.providerCharge && projection.providerOrder);
    await app.close(); app = await application(); await advance();
    await call(app, 'POST', '/api/orders/' + invoice.id + '/reconcile');
    const posts = (await auditRows('provider-http')).filter(row => row.path === '/v1/charges/' + fixture.expected.chargeId + '/payments');
    assert.equal(posts.length, 1);
    await advance(); await finalized(app, fixture);
    const result = await verifyDownload(app, 4);
    await save(join(ROOT, 'phase-incomplete-success.json'), { operation: OPERATION, sourceSha256: SOURCE, state: 'COMPLETE',
      result, observedStatus: 200, originalResponseComplete: false, observedPaymentPosts: 1,
      originalRawPrefixBytes: original.exchange.raw.length, authorizedByOriginalFinalizedEvent: true });
  } finally { await app.close(); }
}
async function verifyAll() {
  const app = await application();
  try {
    const orders = []; for (let index = 0; index < invoiceIds.length; index++) orders.push(await verifyDownload(app, index));
    const provider = await auditRows('provider-http');
    assert.equal((await auditRows('provider-errors')).length, 0);
    const outcome = { schema: 'stellar-forge.merchant-native-receiving-result.v1', operation: OPERATION,
      mode: 'LOCAL_NATIVE_COMMISSIONING', sourceSha256: SOURCE, state: 'COMPLETE', native: {
        node: process.version, platform: process.platform, architecture: process.arch,
        database: join(ROOT, 'workspace', 'merchant.sqlite3') }, orders,
      source: { customerFile: scenario.delivery.path, fulfillmentBinding: scenario.config.fulfillmentBinding },
      providerCalls: provider.length, providerChargePosts: provider.filter(row => row.method === 'POST' && row.path === '/v1/charges').length,
      providerPaymentPosts: provider.filter(row => row.method === 'POST' && /\/payments$/.test(row.path)).length,
      webhookAuthentication: 'Raw HMAC with independent public test vectors', receiptAuthentication: 'Native Ed25519 with independently selected fingerprints',
      resultRetention: 'Original SF31 writer and SF88 VerifiedFile', completeAt: new Date().toISOString() };
    await save(join(ROOT, 'complete.json'), outcome);
    process.stdout.write(JSON.stringify(outcome) + '\n');
  } finally { await app.close(); }
}
try {
  if (PHASE === 'initialize') { await initialize(); }
  else {
    await fixtureInputs();
    if (PHASE === 'original') await originalJourney();
    else if (PHASE === 'handler-interrupt') await interruptHandler();
    else if (PHASE === 'handler-resume') await resumeHandler();
    else if (PHASE === 'result-interrupt') await interruptResult();
    else if (PHASE === 'result-resume') await resumeResult();
    else if (PHASE === 'payment-return') await paymentReturnRecovery();
    else if (PHASE === 'incomplete-success') await incompleteSuccessRecovery();
    else if (PHASE === 'verify') await verifyAll();
    else throw new Error('Unknown original receiving phase.');
  }
  process.stdout.write(JSON.stringify({ operation: OPERATION, sourceSha256: SOURCE, phase: PHASE, state: 'COMPLETE', attempt: ATTEMPT }) + '\n');
} catch (error) {
  await save(join(ROOT, 'phase-errors', ATTEMPT + '.json'), { operation: OPERATION, sourceSha256: SOURCE,
    phase: PHASE, attempt: ATTEMPT, state: 'FAILED', code: error.code ?? 'NATIVE_RECEIVING_FAILED', message: error.message, stack: error.stack });
  process.stderr.write(JSON.stringify({ phase: PHASE, code: error.code ?? 'NATIVE_RECEIVING_FAILED', message: error.message }) + '\n');
  process.exitCode = 1;
}
