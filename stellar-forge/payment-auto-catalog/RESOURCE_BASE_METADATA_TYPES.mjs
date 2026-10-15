// SPDX-License-Identifier: MIT
// Focused offline probe for official x402 ResourceInfo optional-string semantics.
import assert from 'node:assert/strict';
import { PaymentAutoCatalog } from './auto-catalog.mjs';
import { sanitizeResourceForCatalog } from './resource-service-metadata.mjs';

const invalidValues = [null, undefined, 0, false, {}, []];
for (const field of ['description', 'mimeType']) {
  for (const value of invalidValues) {
    const raw = {
      url: 'https://merchant.example/pay',
      description: 'valid description',
      mimeType: 'application/json',
      [field]: value,
    };
    const sanitized = sanitizeResourceForCatalog(raw);
    assert.equal(Object.hasOwn(sanitized, field), false, `${field}:${String(value)}`);
    assert.equal(raw[field], value, 'input must remain unchanged');
  }
}

for (const value of ['', 'application/json', 'merchant endpoint']) {
  const sanitized = sanitizeResourceForCatalog({
    url: 'https://merchant.example/pay',
    description: value,
    mimeType: value,
  });
  assert.equal(sanitized.description, value);
  assert.equal(sanitized.mimeType, value);
}

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
        queryParams: { type: 'object' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

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
const makePaymentPayload = resource => ({
  x402Version: 2,
  resource,
  accepted,
  extensions: {
    bazaar: {
      info: { input: { type: 'http', method: 'GET', queryParams: {} } },
      schema,
    },
  },
});

let ingestCalls = 0;
let captured;
const catalog = {
  ingest(request) {
    ingestCalls += 1;
    captured = request;
    return { decision: 'committed', version: ingestCalls };
  },
};
const autoCatalog = new PaymentAutoCatalog(catalog);
const raw = {
  url: 'https://merchant.example/pay',
  description: null,
  mimeType: { unexpected: true },
  serviceName: 'Merchant Example',
  tags: ['Payments'],
};
const committed = autoCatalog.ingest({
  paymentPayload: makePaymentPayload(raw),
  settlement,
  sequence: 1,
});
assert.equal(committed.decision, 'committed');
assert.equal(ingestCalls, 1);
assert.equal(Object.hasOwn(captured.candidate.entry.resource, 'description'), false);
assert.equal(Object.hasOwn(captured.candidate.entry.resource, 'mimeType'), false);
assert.equal(captured.candidate.entry.resource.serviceName, 'Merchant Example');
assert.deepEqual(captured.candidate.entry.resource.tags, ['Payments']);
assert.equal(raw.description, null);
assert.deepEqual(raw.mimeType, { unexpected: true });

const rejected = autoCatalog.ingest({
  paymentPayload: makePaymentPayload([]),
  settlement,
  sequence: 2,
});
assert.deepEqual(rejected, {
  decision: 'reject',
  reason: 'PAYMENT_PAYLOAD_ENVELOPE_INVALID',
});
assert.equal(ingestCalls, 1, 'rejected envelope must not reach catalog ingestion');

console.log(JSON.stringify({
  optionalStringsPreservedIncludingEmpty: true,
  nullUndefinedAndNonStringsSoftDropped: true,
  settlementBackedCandidateSanitized: true,
  serviceMetadataPreserved: true,
  rejectedEnvelopeNoCatalogGrowth: true,
  inputUnchanged: true,
}));
