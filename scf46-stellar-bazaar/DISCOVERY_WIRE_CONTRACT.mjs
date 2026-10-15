// SPDX-License-Identifier: MIT
// Focused offline probe for the pinned official x402 Bazaar discovery wire contract.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BazaarCatalog, createDiscoveryServer } from './src/catalog.mjs';
import { PaymentAutoCatalog } from '../stellar-forge/payment-auto-catalog/auto-catalog.mjs';
import { DurableCatalogTransaction } from '../stellar/scf-starforge-20261009/sf60-durable-catalog-transaction/journal.mjs';

const TERMS = { scheme: 'exact', network: 'stellar:testnet', asset: 'native', amount: '1000',
  payTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' };
const AT = ['2026-10-15T10:00:00.000Z','2026-10-15T11:00:00.000Z'];

function entry({ url, type = 'http', toolName, description }) {
  const input = type === 'mcp'
    ? { type, toolName, inputSchema: { type: 'object', properties: {} } }
    : { type, method: 'GET' };
  return {
    resource: { url, description, mimeType: 'application/json', serviceName: 'Wire Contract', tags: ['x402'] },
    accepts: [TERMS],
    extensions: { bazaar: { info: { input }, schema: { type: 'object' } } },
  };
}

async function request(handler, url) {
  let status, headers, body;
  await handler({ method: 'GET', url }, {
    writeHead(code, values) { status = code; headers = values; },
    end(value) { body = value; },
  });
  return { status, headers, body: JSON.parse(body) };
}

const catalog = new BazaarCatalog();
catalog.insertValidated(entry({ url: 'https://seller.example/weather?city=SF#hourly',
  description: 'Weather over HTTP' }), { lastUpdated: AT[0] });
catalog.insertValidated(entry({ url: 'https://seller.example/mcp?session=one', type: 'mcp',
  toolName: 'lookup', description: 'Lookup tool' }), { lastUpdated: AT[0] });
catalog.insertValidated(entry({ url: 'https://seller.example/mcp?session=two', type: 'mcp',
  toolName: 'quote', description: 'Quote tool' }), { lastUpdated: AT[1] });

// Existing internal consumers retain the nested entry envelope byte-for-byte.
const internal = catalog.list(new URLSearchParams({ limit: '10' }));
assert.deepEqual(Object.keys(internal).sort(), ['pagination','resources']);
assert.equal(typeof internal.resources[0].resource, 'object');
assert.equal(Object.hasOwn(internal.resources[0], 'lastUpdated'), false);
const internalSearch = catalog.search(new URLSearchParams({ query: 'weather', limit: '10' }));
assert.deepEqual(Object.keys(internalSearch).sort(), ['pagination','partialResults','resources']);
assert.equal(typeof internalSearch.resources[0].resource, 'object');
const internalPricing = catalog.pricing(new URLSearchParams({ limit: '10' }));
assert.deepEqual(Object.keys(internalPricing).sort(), ['pagination','pricingViewVersion','resources']);
assert.equal(typeof internalPricing.resources[0].resource, 'object');

const handler = createDiscoveryServer(catalog);
const ready = await request(handler, '/discovery/readiness');
assert.equal(ready.status, 200);
assert.deepEqual(ready.body, { ready: true, x402Version: 2, catalogVersion: 3,
  resources: 3, observedResources: 3, unreadyResources: 0 });
const listed = await request(handler, '/discovery/resources?limit=10');
assert.equal(listed.status, 200);
assert.equal(listed.headers['cache-control'], 'no-store');
assert.deepEqual(Object.keys(listed.body).sort(), ['items','pagination','x402Version']);
assert.equal(listed.body.x402Version, 2);
assert.equal(listed.body.items.length, 3);
for (const row of listed.body.items) {
  assert.equal(typeof row.resource, 'string');
  assert.equal(row.x402Version, 2);
  assert.ok(['http','mcp'].includes(row.type));
  assert.match(row.lastUpdated, /^2026-10-15T1[01]:00:00\.000Z$/);
  assert.equal(Array.isArray(row.accepts), true);
}
assert.equal(new Set(listed.body.items.filter(row => row.type === 'mcp')
  .map(row => row.extensions.bazaar.info.input.toolName)).size, 2);

const searched = await request(handler, '/discovery/search?query=weather&limit=10');
assert.equal(searched.body.x402Version, 2);
assert.equal(Array.isArray(searched.body.resources), true);
assert.equal(Object.hasOwn(searched.body, 'items'), false);
assert.equal(searched.body.resources[0].resource, 'https://seller.example/weather');

// Wire rows are detached from authoritative internal entries.
listed.body.items[0].accepts[0].payTo = 'mutated';
listed.body.items[0].extensions.bazaar.info.input.type = 'mutated';
const listedAgain = catalog.listDiscovery(new URLSearchParams({ limit: '10' }));
assert.equal(listedAgain.items.some(row => row.accepts[0].payTo === 'mutated'), false);
assert.equal(listedAgain.items.some(row => row.type === 'mutated'), false);

// Internal callers may stage a structurally valid row before they have trusted
// source provenance. The aggregate preflight makes that incomplete public-wire
// state explicit without leaking the row or its payment terms.
const incomplete = new BazaarCatalog();
incomplete.insertValidated(entry({ url: 'https://unobserved.example/weather',
  description: 'Internal staging row' }));
const incompleteReadiness = await request(createDiscoveryServer(incomplete), '/discovery/readiness');
assert.equal(incompleteReadiness.status, 503);
assert.deepEqual(incompleteReadiness.body, { ready: false, x402Version: 2, catalogVersion: 1,
  resources: 1, observedResources: 0, unreadyResources: 1 });
assert.equal(JSON.stringify(incompleteReadiness.body).includes('unobserved.example'), false);

// Public list/search enforce the aggregate gate. Pagination or a selective
// query cannot hide the incomplete row and expose a deceptively ready subset.
incomplete.insertValidated(entry({ url: 'https://ready.example/weather',
  description: 'Observed ready weather row' }), { lastUpdated: AT[0] });
const incompleteHandler = createDiscoveryServer(incomplete);
for (const path of ['/discovery/resources?limit=1',
  '/discovery/search?query=observed%20ready&limit=1']) {
  const blocked = await request(incompleteHandler, path);
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.error, 'DISCOVERY_NOT_READY');
  assert.deepEqual({ ready: blocked.body.ready, x402Version: blocked.body.x402Version,
    catalogVersion: blocked.body.catalogVersion, resources: blocked.body.resources,
    observedResources: blocked.body.observedResources,
    unreadyResources: blocked.body.unreadyResources },
  { ready: false, x402Version: 2, catalogVersion: 2,
    resources: 2, observedResources: 1, unreadyResources: 1 });
  assert.equal(JSON.stringify(blocked.body).includes('ready.example'), false);
  assert.equal(JSON.stringify(blocked.body).includes('unobserved.example'), false);
  assert.equal(JSON.stringify(blocked.body).includes(TERMS.payTo), false);
  assert.equal(JSON.stringify(blocked.body).includes('observed ready'), false);
}

// The production settlement path carries trusted observedAt and only accepted
// corrections replace it; a stale conflicting write cannot move lastUpdated.
const INFO_SCHEMA = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
  required: ['input'], properties: { input: { type: 'object', required: ['type','toolName','inputSchema'],
    properties: { type: { const: 'mcp' }, toolName: { type: 'string' }, inputSchema: { type: 'object' } } } } };
function settled(sequence, observedAt, description = 'Settlement catalog tool') {
  const resource = 'https://settled.example/mcp';
  return { sequence,
    paymentPayload: { x402Version: 2, resource: { url: resource, description }, accepted: TERMS,
      extensions: { bazaar: { info: { input: { type: 'mcp', toolName: 'inspect',
        inputSchema: { type: 'object', properties: {} } } }, schema: INFO_SCHEMA } } },
    settlement: { status: 'settled', ...TERMS, origin: new URL(resource).origin,
      sellerId: 'settled.example', signer: 'settled-test-signer',
      receiptURL: `https://facilitator.example/receipts/${sequence}`,
      receiptSha256: sequence.toString(16).padStart(64, '0'), observedAt } };
}
const acceptedCatalog = new PaymentAutoCatalog();
assert.equal(acceptedCatalog.ingest(settled(1, AT[0])).decision, 'accepted');
assert.equal(acceptedCatalog.ingest(settled(2, AT[1])).decision, 'accepted');
assert.equal(acceptedCatalog.listDiscovery().items[0].lastUpdated, AT[1]);
const stale = acceptedCatalog.ingest(settled(1, '2026-10-15T12:00:00.000Z', 'Conflicting stale row'));
assert.notEqual(stale.decision, 'accepted');
assert.equal(acceptedCatalog.listDiscovery().items[0].lastUpdated, AT[1]);

// The production durable owner rebuilds the private timestamp projection from
// the retained accepted provenance after a real close/reopen boundary.
const directory = await mkdtemp(join(tmpdir(), 'starforge-discovery-wire-'));
let durable;
try {
  durable = await DurableCatalogTransaction.open(directory);
  const durableEntry = entry({ url: 'https://durable.example/weather', description: 'Durable weather' });
  const result = await durable.ingest({ sellerId: 'durable.example', sequence: 1, entry: durableEntry }, {
    sellerId: 'durable.example', signer: 'durable-test-signer',
    allowedOrigins: new Set(['https://durable.example']), allowedRecipients: new Set([TERMS.payTo]),
    allowedNetworks: new Set([TERMS.network]), allowedSchemes: new Set([TERMS.scheme]),
  }, { authority: 'signed_export', sellerId: 'durable.example',
    sourceURL: 'https://durable.example/catalog/export-1.json', sourceSha256: 'd'.repeat(64),
    observedAt: AT[0] });
  assert.equal(result.decision, 'accepted');
  assert.equal(durable.listDiscovery().items[0].lastUpdated, AT[0]);
  await durable.close(); durable = null;
  durable = await DurableCatalogTransaction.open(directory);
  assert.equal(durable.listDiscovery().items[0].lastUpdated, AT[0]);
} finally {
  if (durable) await durable.close();
  await rm(directory, { recursive: true, force: true });
}

console.log(JSON.stringify({ officialVersion: listed.body.x402Version,
  listEnvelope: 'items', searchEnvelope: 'resources', rows: listed.body.items.length,
  mcpTools: 2, internalShapePreserved: true, detached: true,
  readiness: ready.body, incompleteReadiness: incompleteReadiness.body,
  incompletePublicDiscoveryBlocked: true,
  correctionTimestamp: AT[1], staleTimestampPreserved: true, durableReopen: true }));
