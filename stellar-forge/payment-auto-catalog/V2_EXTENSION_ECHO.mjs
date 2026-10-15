// SPDX-License-Identifier: MIT
// Focused offline contract probe for the official x402 v2 extension echo.
import assert from 'node:assert/strict';
import { PaymentAutoCatalog } from './auto-catalog.mjs';

const RESOURCE_URL = 'https://seller.example/mcp';
const TERMS = {
  scheme: 'exact',
  network: 'stellar:testnet',
  asset: 'native',
  amount: '1000',
  payTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
};
const INFO_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['input'],
  properties: {
    input: {
      type: 'object',
      required: ['type', 'toolName', 'inputSchema'],
      properties: {
        type: { const: 'mcp' },
        toolName: { type: 'string' },
        inputSchema: { type: 'object' },
      },
    },
  },
};

function candidate(sequence, opaqueExtensions = {}) {
  const bazaar = {
    info: {
      input: {
        type: 'mcp',
        toolName: 'inspect_vessel',
        inputSchema: {
          type: 'object',
          properties: { vesselId: { type: 'string' } },
          required: ['vesselId'],
        },
      },
    },
    schema: INFO_SCHEMA,
  };
  return {
    sequence,
    paymentPayload: {
      x402Version: 2,
      resource: { url: RESOURCE_URL, description: 'Official extension echo resource' },
      accepted: TERMS,
      extensions: { bazaar, ...opaqueExtensions },
    },
    settlement: {
      status: 'settled',
      ...TERMS,
      origin: new URL(RESOURCE_URL).origin,
      sellerId: 'seller.example',
      signer: 'seller-test-signer',
      receiptURL: `https://facilitator.example/receipts/stellar-testnet-${sequence}`,
      receiptSha256: sequence.toString(16).padStart(64, '0'),
      observedAt: '2026-10-15T00:00:00.000Z',
    },
  };
}

const catalog = new PaymentAutoCatalog();
const source = candidate(1, {
  'payment-identifier': {
    id: 'checkout-20261015-0001',
    metadata: { cart: ['vessel-inspection'], attempt: 1 },
  },
  'offer-receipt': {
    receipt: 'receipt-0001',
    attestations: [{ issuer: 'facilitator.example', status: 'settled' }],
  },
});
const expectedExtensions = structuredClone(source.paymentPayload.extensions);
const accepted = catalog.ingest(source);
assert.equal(accepted.decision, 'accepted');
assert.equal(catalog.size, 1);

const byPaymentIdentifier = catalog.list(new URLSearchParams({
  extensions: 'payment-identifier',
}));
assert.equal(byPaymentIdentifier.resources.length, 1);
assert.deepEqual(byPaymentIdentifier.resources[0].extensions, expectedExtensions);

const byOfferReceipt = catalog.search(new URLSearchParams({
  query: 'official extension echo',
  extensions: 'offer-receipt',
}));
assert.equal(byOfferReceipt.resources.length, 1);
assert.deepEqual(byOfferReceipt.resources[0].extensions, expectedExtensions);

assert.equal(catalog.list(new URLSearchParams({ extensions: 'missing-extension' })).resources.length, 0);
assert.equal(catalog.search(new URLSearchParams({
  query: 'official extension echo',
  extensions: 'missing-extension',
})).resources.length, 0);

source.paymentPayload.extensions['payment-identifier'].id = 'mutated';
source.paymentPayload.extensions['offer-receipt'].attestations[0].status = 'mutated';
source.paymentPayload.extensions.bazaar.info.input.toolName = 'mutated';
assert.deepEqual(catalog.list().resources[0].extensions, expectedExtensions);

const malformed = candidate(2);
delete malformed.paymentPayload.extensions.bazaar.info.input.toolName;
const malformedResult = catalog.ingest(malformed);
assert.equal(malformedResult.decision, 'soft_drop');
assert.equal(malformedResult.reason, 'INFO_SCHEMA_MISMATCH');
assert.equal(catalog.size, 1);

const oversizeCatalog = new PaymentAutoCatalog();
const oversizeResult = oversizeCatalog.ingest(candidate(1, {
  'offer-receipt': { opaque: 'x'.repeat(70_000) },
}));
assert.equal(oversizeResult.decision, 'quarantine');
assert.equal(oversizeResult.reason, 'METADATA_DOCUMENT_LIMIT');
assert.equal(oversizeCatalog.size, 0);

const nonJsonCatalog = new PaymentAutoCatalog();
const nonJsonResult = nonJsonCatalog.ingest(candidate(1, {
  'offer-receipt': { opaque: 1n },
}));
assert.equal(nonJsonResult.decision, 'quarantine');
assert.equal(nonJsonResult.reason, 'METADATA_NOT_SERIALIZABLE');
assert.equal(nonJsonCatalog.size, 0);

console.log(JSON.stringify({
  echo: accepted.decision,
  keys: Object.keys(expectedExtensions).sort(),
  listFilter: byPaymentIdentifier.resources.length,
  searchFilter: byOfferReceipt.resources.length,
  malformed: malformedResult.reason,
  oversize: oversizeResult.reason,
  nonJson: nonJsonResult.reason,
  detached: true,
}));
