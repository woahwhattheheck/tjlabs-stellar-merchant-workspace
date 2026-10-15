// SPDX-License-Identifier: MIT
// Focused offline contract probe for the official x402 Bazaar MCP toolName field.
import assert from 'node:assert/strict';
import { PaymentAutoCatalog, validateBazaarExtension } from './auto-catalog.mjs';

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

function payload(toolName, sequence, inputOverride = {}) {
  const input = {
    type: 'mcp',
    toolName,
    inputSchema: {
      type: 'object',
      properties: { vesselId: { type: 'string', description: 'Vessel identifier' } },
    },
    ...inputOverride,
  };
  const extension = { info: { input }, schema: INFO_SCHEMA };
  return {
    sequence,
    paymentPayload: {
      x402Version: 2,
      resource: { url: RESOURCE_URL, description: 'Official MCP seller resource' },
      accepted: TERMS,
      extensions: { bazaar: extension },
    },
    settlement: {
      status: 'settled',
      ...TERMS,
      origin: new URL(RESOURCE_URL).origin,
      sellerId: 'seller.example',
      signer: 'seller-test-signer',
      receiptURL: 'https://facilitator.example/receipts/stellar-testnet-1',
      receiptSha256: 'a'.repeat(64),
      observedAt: '2026-10-15T00:00:00.000Z',
    },
  };
}

const catalog = new PaymentAutoCatalog();
const inspect = payload('inspect_vessel', 1);
assert.deepEqual(validateBazaarExtension(inspect.paymentPayload.extensions.bazaar), { ok: true });
const first = catalog.ingest(inspect);
assert.equal(first.decision, 'accepted');
assert.equal(first.id, `mcp|${RESOURCE_URL}|inspect_vessel`);
assert.equal(first.catalogKey, first.id);
assert.equal(catalog.list().resources.length, 1);
assert.equal(
  catalog.search(new URLSearchParams({ query: 'inspect vessel' })).resources[0]
    .extensions.bazaar.info.input.toolName,
  'inspect_vessel',
);

const update = catalog.ingest(payload('inspect_vessel', 2));
assert.equal(update.decision, 'accepted');
assert.equal(update.reason, 'CORRECTION');
assert.equal(catalog.size, 1);

const dispatch = catalog.ingest(payload('dispatch_vessel', 3));
assert.equal(dispatch.decision, 'accepted');
assert.equal(dispatch.catalogKey, `mcp|${RESOURCE_URL}|dispatch_vessel`);
assert.equal(catalog.size, 2);
assert.equal(
  catalog.search(new URLSearchParams({ query: 'dispatch vessel' })).resources[0]
    .extensions.bazaar.info.input.toolName,
  'dispatch_vessel',
);

const alias = payload(undefined, 4, { tool: 'legacy_alias' });
delete alias.paymentPayload.extensions.bazaar.info.input.toolName;
const rejected = catalog.ingest(alias);
assert.equal(rejected.decision, 'soft_drop');
assert.equal(rejected.reason, 'INFO_SCHEMA_MISMATCH');
assert.equal(catalog.size, 2);

console.log(JSON.stringify({
  officialField: 'toolName',
  first: first.decision,
  update: update.reason,
  coexistence: catalog.size,
  legacyAlias: rejected.reason,
  search: 'ok',
}));

