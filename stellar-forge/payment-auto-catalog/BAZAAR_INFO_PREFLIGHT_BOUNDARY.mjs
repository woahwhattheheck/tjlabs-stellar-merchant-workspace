// SPDX-License-Identifier: MIT
// Focused offline probe for the pre-catalog Bazaar info JSON boundary.
import assert from 'node:assert/strict';
import { PaymentAutoCatalog, validateBazaarExtension } from './auto-catalog.mjs';

const MAX_INFO_DOCUMENT_BYTES = 65_536;
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['input'],
  properties: {
    input: {
      type: 'object',
      required: ['type', 'method'],
      properties: {
        type: { const: 'http' },
        method: { enum: ['GET', 'HEAD', 'DELETE'] },
      },
      additionalProperties: true,
    },
    output: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string' },
        example: {},
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

const makeInfo = padding => ({
  input: { type: 'http', method: 'GET' },
  output: { type: 'application/json', example: { padding } },
});
const emptyBytes = jsonBytes(makeInfo(''));
const exactBoundaryInfo = makeInfo('x'.repeat(MAX_INFO_DOCUMENT_BYTES - emptyBytes));
const oversizedInfo = makeInfo('x'.repeat(MAX_INFO_DOCUMENT_BYTES - emptyBytes + 1));
assert.equal(jsonBytes(exactBoundaryInfo), MAX_INFO_DOCUMENT_BYTES);
assert.equal(jsonBytes(oversizedInfo), MAX_INFO_DOCUMENT_BYTES + 1);
assert.deepEqual(validateBazaarExtension({ info: exactBoundaryInfo, schema }), { ok: true });
assert.deepEqual(validateBazaarExtension({ info: oversizedInfo, schema }), {
  ok: false,
  reason: 'INFO_SIZE_LIMIT',
});

for (const value of [undefined, 1n, () => {}, Symbol('not-json'), Number.NaN, Infinity]) {
  const info = makeInfo('ok');
  info.output.example.value = value;
  assert.deepEqual(validateBazaarExtension({ info, schema }), {
    ok: false,
    reason: 'INFO_NOT_JSON',
  });
}

const cyclicInfo = makeInfo('ok');
cyclicInfo.output.example.self = cyclicInfo.output.example;
assert.deepEqual(validateBazaarExtension({ info: cyclicInfo, schema }), {
  ok: false,
  reason: 'INFO_NOT_JSON',
});

const accepted = {
  network: 'stellar-testnet',
  scheme: 'exact',
  payTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  asset: 'native',
  amount: '1000',
};
const settlement = {
  status: 'settled',
  sellerId: 'merchant-example',
  signer: 'settlement-signer',
  origin: 'https://merchant.example',
  ...accepted,
  receiptSha256: 'a'.repeat(64),
  receiptURL: 'https://merchant.example/receipts/1',
  observedAt: '2026-10-15T00:00:00.000Z',
};
const paymentPayload = info => ({
  x402Version: 2,
  resource: { url: 'https://merchant.example/pay' },
  accepted,
  extensions: { bazaar: { info, schema } },
});

let catalogCalls = 0;
const catalog = {
  ingest() {
    catalogCalls += 1;
    return { decision: 'committed' };
  },
};
const autoCatalog = new PaymentAutoCatalog(catalog);
assert.deepEqual(autoCatalog.ingest({
  paymentPayload: paymentPayload(oversizedInfo),
  settlement,
  sequence: 1,
}), { decision: 'soft_drop', ok: false, reason: 'INFO_SIZE_LIMIT' });
assert.equal(catalogCalls, 0, 'oversized info must not reach catalog ingestion');

const cyclicPaymentInfo = makeInfo('ok');
cyclicPaymentInfo.output.example.self = cyclicPaymentInfo.output.example;
assert.deepEqual(autoCatalog.ingest({
  paymentPayload: paymentPayload(cyclicPaymentInfo),
  settlement,
  sequence: 2,
}), { decision: 'soft_drop', ok: false, reason: 'INFO_NOT_JSON' });
assert.equal(catalogCalls, 0, 'non-JSON info must not reach cloning or catalog ingestion');

console.log(JSON.stringify({
  exact65536ByteInfoAccepted: true,
  oversizedInfoSoftDropped: true,
  nonJsonInfoSoftDropped: true,
  cyclicInfoSoftDropped: true,
  rejectedInfoNoCatalogGrowth: true,
}));
