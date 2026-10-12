// MIT. Local commissioning data for the complete merchant application.
// This module never contacts x402api, submits a payment or supplies a production
// trust anchor. Node generates a local Ed25519 key, independently selects its
// fingerprint, then signs the complete documented receipt for that scenario.
import { createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { canonicalJson, digestBytes, digestJson, verifyReceipt, verifyWebhook } from '../protocol.mjs';

const defaults = {
  tenantId: '11111111-2222-4333-8444-555555555555',
  paymentId: '44444444-5555-4666-8777-888888888888',
  orderId: '33333333-4444-4555-8666-777777777777',
  chargeId: '22222222-3333-4444-8555-666666666666',
  resourceId: '66666666-7777-4888-8999-000000000000',
  resourceVersion: 1,
  requestHash: 'sha256:' + 'c'.repeat(64),
  recipient: '0x1111111111111111111111111111111111111111',
  walletVersion: 1,
  network: 'eip155:8453',
  assetId: 'base-usdc-native',
  assetVersion: 1,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amountAtomic: '1000000',
  payer: '0x2222222222222222222222222222222222222222',
  transaction: '0x' + 'a'.repeat(64),
  blockNumber: '40000000',
  blockHash: '0x' + 'b'.repeat(64),
  logIndex: 0,
};
const body = value => Buffer.from(canonicalJson(value), 'utf8');

function signed(rawBody, deliveryId, secret, nowSeconds) {
  const seconds = String(nowSeconds);
  return {
    'content-type': 'application/json',
    'x-x402api-webhook-id': deliveryId,
    'x-x402api-webhook-timestamp': seconds,
    'x-x402api-webhook-key-version': '1',
    'x-x402api-webhook-signature': 'v1=' + createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(Buffer.from(seconds + '.', 'ascii')).update(rawBody).digest('hex'),
  };
}

export function createProtocolFixture({
  nowSeconds = Math.floor(Date.now() / 1000),
  expected: selected = {},
  resourceVersionId = '55555555-6666-4777-8888-999999999999',
  endpointId = '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
  resourceUrl = 'https://merchant.example/orders/commission-001',
  signingKeyVersion = 'commission-1',
  includePricing = true,
} = {}) {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error('Use the original commissioning time.');
  const expected = { ...defaults, ...selected };
  const timestamp = new Date(nowSeconds * 1000).toISOString();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicBytes = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const fingerprint = digestBytes(publicBytes);
  // The local fixture chooses this independent trust record before constructing
  // the signed receipt; the verifier never accepts a key from an untrusted body.
  const fingerprintsByVersion = Object.freeze({ [signingKeyVersion]: fingerprint });
  const secret = randomBytes(32).toString('hex');
  const secretsByVersion = Object.freeze({ '1': secret });
  const receipt = {
    receipt_version: 2, receipt_id: '88888888-9999-4aaa-8bbb-cccccccccccc', issuer: 'x402api.com',
    tenant: { id: expected.tenantId }, settlement: { job_id: expected.paymentId },
    order: { id: expected.orderId, challenge_id: expected.chargeId },
    resource: { id: expected.resourceId, version: expected.resourceVersion, request_hash: expected.requestHash },
    merchant: { wallet: expected.recipient, wallet_version: expected.walletVersion },
    payment: { network: expected.network, asset_id: expected.assetId, asset_version: expected.assetVersion,
      display_name: 'Commissioning asset', contract_address: expected.asset, amount_atomic: expected.amountAtomic,
      payer: expected.payer, transaction: expected.transaction, log_index: expected.logIndex ?? null },
    confirmed_block: { number: expected.blockNumber, hash: expected.blockHash }, settled_at: timestamp,
    signing_authority: { algorithm: 'Ed25519', key_version: signingKeyVersion,
      public_key_base64: publicBytes.toString('base64'), key_fingerprint: fingerprint },
  };
  if (includePricing) receipt.pricing = {
    policy: {}, network_fee_alternatives: [], eligible_alternatives: [],
    network_fee_alternatives_digest: digestJson([]), selected_fee_evidence: null,
    selected_fee_evidence_digest: null, listed_amount_atomic: expected.amountAtomic, fee_allowance_atomic: '0',
    settlement_amount_atomic: expected.amountAtomic, quote_expires_at: null,
  };
  const canonicalBytes = body(receipt);
  const receiptEnvelope = {
    id: receipt.receipt_id, order_id: expected.orderId, settlement_job_id: expected.paymentId, receipt,
    receipt_digest: digestBytes(canonicalBytes), signature: sign(null, canonicalBytes, privateKey).toString('base64'),
    signing_key_version: signingKeyVersion, settlement_amount_atomic: expected.amountAtomic, created_at: timestamp,
  };
  const payload = {
    amount_atomic: expected.amountAtomic, asset: expected.asset, block_hash: expected.blockHash,
    block_number: expected.blockNumber, fulfillment_status: 'delivering', network: expected.network,
    order_id: expected.orderId, payment_id: expected.paymentId, payer: expected.payer,
    payment_status: 'finalized', resource_version_id: resourceVersionId, transaction: expected.transaction,
  };
  const event = {
    event_id: '019fc8ab-1234-7abc-8def-0123456789ab', payload, payload_digest: digestJson(payload),
    schema_version: 1, tenant: { id: expected.tenantId }, timestamp, type: 'payment.finalized',
  };
  const paidRaw = body(event);
  const paid = { rawBody: paidRaw, headers: signed(paidRaw,
    'fulfillment:' + expected.tenantId + ':' + expected.orderId, secret, nowSeconds) };
  const testEvent = {
    deliveryId: '019fc8aa-1234-7abc-8def-0123456789ab',
    deliveryKey: 'webhook-test:019fc8aa-1234-7abc-8def-0123456789ab',
    eventId: '019fc8aa-1234-7abc-8def-0123456789ab',
    eventType: 'webhook.test_delivery', requestedAt: timestamp, schemaVersion: 1,
    tenantId: expected.tenantId, testMode: true,
  };
  const testRaw = body(testEvent);
  const test = { rawBody: testRaw, headers: signed(testRaw, testEvent.deliveryKey, secret, nowSeconds) };
  const ownershipEvent = {
    challenge: randomBytes(24).toString('base64url'), challenge_id: '99999999-aaaa-4bbb-8ccc-dddddddddddd',
    endpoint_id: endpointId, type: 'k1hub.webhook.endpoint_verification', version: 1,
  };
  const ownership = { rawBody: body(ownershipEvent), headers: {
    'content-type': 'application/json', 'x-x402api-webhook-verification-id': ownershipEvent.challenge_id,
  }, responseBody: { challenge: ownershipEvent.challenge } };
  const requirement = {
    scheme: 'exact', network: expected.network, amount: expected.amountAtomic, asset: expected.asset,
    payTo: expected.recipient, maxTimeoutSeconds: 300,
    extra: { commissioning: 'Retained extension for the local merchant journey' },
  };
  const paymentRequired = {
    x402Version: 2, resource: { url: resourceUrl, description: 'Local merchant commissioning', mimeType: 'application/json' },
    accepts: [requirement],
  };
  const order = {
    id: expected.orderId, resource_version_id: resourceVersionId, request_fingerprint: expected.requestHash,
    payment_identifier: 'chg_local_commissioning', buyer_payment_identifier: 'local-buyer-commissioning',
    status: 'paid', paid_at: timestamp, fulfilled_at: null, created_at: timestamp, updated_at: timestamp,
  };
  const verified = verifyReceipt({ envelope: receiptEnvelope, fingerprintsByVersion, expected });
  const verifiedEvent = verifyWebhook({ ...paid, secretsByVersion, endpointId,
    tenantId: expected.tenantId, nowSeconds });
  return {
    schema: 'stellar-forge.x402api-merchant-protocol-fixture.v1', mode: 'LOCAL_COMMISSIONING',
    nowSeconds, expected, resourceVersionId, endpointId, resourceUrl, order, requirement, paymentRequired,
    paymentRequiredHeader: body(paymentRequired).toString('base64'),
    fingerprintsByVersion, secretsByVersion, receiptEnvelope, receiptCanonicalBytes: canonicalBytes,
    paid, test, ownership, verifiedReceiptDigest: verified.receiptDigest, verifiedEventKind: verifiedEvent.kind,
  };
}

/** Exact public HMAC vectors, retained separately from the generated local
 * merchant scenario. Inject their documented historical time explicitly.
 * https://x402api.com/docs/payments/x402/webhooks
 */
export function publishedWebhookVectors() {
  const secret = '0123456789abcdef0123456789abcdef';
  const nowSeconds = 1785088860;
  const rawTest = '{"deliveryId":"019fc8aa-1234-7abc-8def-0123456789ab","deliveryKey":"webhook-test:019fc8aa-1234-7abc-8def-0123456789ab","eventId":"019fc8aa-1234-7abc-8def-0123456789ab","eventType":"webhook.test_delivery","requestedAt":"2026-07-26T18:01:00+00:00","schemaVersion":1,"tenantId":"11111111-2222-4333-8444-555555555555","testMode":true}';
  const rawPaid = '{"event_id":"019fc8ab-1234-7abc-8def-0123456789ab","payload":{"amount_atomic":"1000000","asset":"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB","block_hash":"5VfJ9wPq4DKDzX6XhQeW7nP4MZP8sXjT6BvGq2NxFhYk","block_number":"350000000","fulfillment_status":"delivering","network":"solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp","order_id":"33333333-4444-4555-8666-777777777777","payer":"7n4z4jgbQUG9EmfiWdvycqbGSwBgsTkFQ8FFkY47NNZi","payment_id":"44444444-5555-4666-8777-888888888888","payment_status":"finalized","resource_version_id":"55555555-6666-4777-8888-999999999999","transaction":"4Nd1mQPXW6P3V7bM9sK2F8hT5jCqLwRzYxAaEeUuGgHh"},"payload_digest":"sha256:54c53914b70e55cd22cf270cb3622e63ae211eab093ac7c69f866e25929e491b","schema_version":1,"tenant":{"id":"11111111-2222-4333-8444-555555555555"},"timestamp":"2026-07-26T18:01:00+00:00","type":"payment.finalized"}';
  return [
    { kind: 'test', rawBody: Buffer.from(rawTest), headers: {
      'content-type': 'application/json',
      'x-x402api-webhook-id': 'webhook-test:019fc8aa-1234-7abc-8def-0123456789ab',
      'x-x402api-webhook-timestamp': String(nowSeconds), 'x-x402api-webhook-key-version': '1',
      'x-x402api-webhook-signature': 'v1=c1fbcd7f31b3b6dc8700aaeaa2f4c7d336979c4fc705981a751ca144337ab4e8',
    }, secretsByVersion: { '1': secret }, tenantId: defaults.tenantId, nowSeconds },
    { kind: 'payment', rawBody: Buffer.from(rawPaid), headers: {
      'content-type': 'application/json',
      'x-x402api-webhook-id': 'fulfillment:11111111-2222-4333-8444-555555555555:33333333-4444-4555-8666-777777777777',
      'x-x402api-webhook-timestamp': String(nowSeconds), 'x-x402api-webhook-key-version': '1',
      'x-x402api-webhook-signature': 'v1=5028d021e3dcfebcdd41edf60e7b7f96d10d2d39ff95a765fda41fbf1284add8',
    }, secretsByVersion: { '1': secret }, tenantId: defaults.tenantId, nowSeconds },
  ];
}
