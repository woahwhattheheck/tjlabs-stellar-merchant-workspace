// SPDX-License-Identifier: MIT
// Focused offline contract probe for the official x402 Bazaar MCP Tool.inputSchema shape.
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

function payload(inputSchema, sequence) {
  const extension = {
    info: {
      input: {
        type: 'mcp',
        toolName: 'inspect_vessel',
        inputSchema,
      },
    },
    schema: INFO_SCHEMA,
  };
  return {
    extension,
    candidate: {
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
        receiptURL: `https://facilitator.example/receipts/stellar-testnet-${sequence}`,
        receiptSha256: sequence.toString(16).padStart(64, '0'),
        observedAt: '2026-10-15T00:00:00.000Z',
      },
    },
  };
}

const catalog = new PaymentAutoCatalog();
const conforming = payload({
  type: 'object',
  properties: {
    vesselId: { type: 'string', description: 'Vessel identifier' },
    includeHistory: true,
  },
  required: ['vesselId'],
}, 1);
assert.deepEqual(validateBazaarExtension(conforming.extension), { ok: true });
assert.equal(catalog.ingest(conforming.candidate).decision, 'accepted');
assert.equal(catalog.size, 1);

const malformed = [
  ['missing root type', {}, 'INFO_MCP_INPUT_SCHEMA_TYPE_INVALID'],
  ['non-object root type', { type: 'string' }, 'INFO_MCP_INPUT_SCHEMA_TYPE_INVALID'],
  ['non-object properties', { type: 'object', properties: [] }, 'INFO_MCP_INPUT_SCHEMA_PROPERTIES_INVALID'],
  ['non-schema property', { type: 'object', properties: { vesselId: 7 } }, 'INFO_MCP_INPUT_SCHEMA_PROPERTIES_INVALID'],
  ['non-string required name', { type: 'object', required: ['vesselId', 7] }, 'INFO_MCP_INPUT_SCHEMA_REQUIRED_INVALID'],
  ['duplicate required name', { type: 'object', required: ['vesselId', 'vesselId'] }, 'INFO_MCP_INPUT_SCHEMA_REQUIRED_INVALID'],
];

const observed = [];
for (const [name, inputSchema, expected] of malformed) {
  const invalid = payload(inputSchema, observed.length + 2);
  const validation = validateBazaarExtension(invalid.extension);
  assert.equal(validation.ok, false, name);
  assert.equal(validation.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH', name);
  assert.deepEqual(validation.errors, [expected], name);
  const ingestion = catalog.ingest(invalid.candidate);
  assert.equal(ingestion.decision, 'soft_drop', name);
  assert.equal(ingestion.reason, 'BAZAAR_SCHEMA_CONTRACT_MISMATCH', name);
  assert.deepEqual(ingestion.errors, [expected], name);
  assert.equal(catalog.size, 1, name);
  observed.push(expected);
}

console.log(JSON.stringify({
  conforming: 'accepted',
  rejected: observed,
  catalogSize: catalog.size,
}));
