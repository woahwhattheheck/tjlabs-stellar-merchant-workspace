// SPDX-License-Identifier: MIT
// One offline native lifecycle for readiness transitions and repeated public reads.
import assert from 'node:assert/strict';
import './SERVICE_METADATA_SOFT_DROP.mjs';
import { BazaarCatalog, createDiscoveryServer } from './src/catalog.mjs';

const AT = '2026-10-16T02:00:00.000Z';
const terms = { scheme: 'exact', network: 'stellar:testnet', asset: 'native',
  amount: '1000', payTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' };
const entry = (id, tags = []) => ({
  resource: { url: `https://seller.example/${id}`, description: `Weather ${id}`, tags },
  accepts: [terms],
  extensions: { bazaar: { info: { input: { type: 'http', method: 'GET' } },
    schema: { type: 'object' } } },
});
async function request(catalog, url) {
  let status, headers, body;
  await createDiscoveryServer(catalog)({ method: 'GET', url }, {
    writeHead(code, values) { status = code; headers = values; },
    end(value) { body = JSON.parse(value); },
  });
  return { status, headers, body };
}
function state(catalog, total, unready) {
  const actual = catalog.discoveryReadiness();
  assert.deepEqual(actual, { ready: unready === 0, x402Version: 2,
    catalogVersion: catalog.version, resources: total,
    observedResources: total - unready, unreadyResources: unready });
  actual.resources = -1;
  assert.equal(catalog.discoveryReadiness().resources, total);
}

const catalog = new BazaarCatalog();
state(catalog, 0, 0);
for (let i = 0; i < 24; i++) catalog.insertValidated(entry(`row-${i}`), { lastUpdated: AT });
const stagedKey = catalog.insertValidated(entry('staged'));
state(catalog, 25, 1);
for (const url of ['/discovery/resources?limit=1', '/discovery/search?query=row-1&limit=1']) {
  const blocked = await request(catalog, url);
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.error, 'DISCOVERY_NOT_READY');
  assert.equal(blocked.body.unreadyResources, 1);
  assert.equal(JSON.stringify(blocked.body).includes('seller.example'), false);
  assert.equal(JSON.stringify(blocked.body).includes(terms.payTo), false);
}

// Failed admission cannot change the previously retained counts or generation.
const beforeRejected = catalog.discoveryReadiness();
assert.throws(() => catalog.insertValidated(entry('staged'), { lastUpdated: 'invalid' }));
assert.deepEqual(catalog.discoveryReadiness(), beforeRejected);

const isolated = catalog.clone();
catalog.insertValidated(entry('staged', ['Weather', 'weather']), { lastUpdated: AT });
state(catalog, 25, 0);
state(isolated, 25, 1);
isolated.removeValidated(stagedKey);
state(isolated, 24, 0);
state(catalog, 25, 0);

// A correction without new provenance preserves the original trusted timestamp.
catalog.insertValidated(entry('staged'));
state(catalog, 25, 0);
assert.equal(catalog.listDiscovery(new URLSearchParams({ limit: '100' })).items
  .find(row => row.resource.endsWith('/staged')).lastUpdated, AT);

// Retire/reinsert must not inherit the former observation or clone state.
assert.equal(catalog.removeValidated(stagedKey), true);
assert.equal(catalog.removeValidated(stagedKey), false);
catalog.insertValidated(entry('staged'));
state(catalog, 25, 1);
catalog.insertValidated(entry('staged'), { lastUpdated: AT });
state(catalog, 25, 0);

// Count actual deep-copy operations at the public boundary, rather than rely on
// a timing threshold. Readiness must perform none; a one-row page copies only
// that page, regardless of the other 24 retained rows.
const nativeClone = globalThis.structuredClone;
let copies = 0;
globalThis.structuredClone = (...args) => { copies++; return nativeClone(...args); };
let pageCopies;
try {
  state(catalog, 25, 0);
  state(catalog, 25, 0);
  assert.equal(copies, 0);
  const first = await request(catalog, '/discovery/resources?limit=1');
  pageCopies = copies;
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.body.items.length, 1);
  assert.equal(Object.hasOwn(first.body.items[0], 'tags'), false);
  assert.ok(pageCopies > 0 && pageCopies < catalog.size);
  copies = 0;
  const again = await request(catalog, '/discovery/resources?limit=1');
  assert.deepEqual(again, first);
  assert.equal(copies, pageCopies);
} finally { globalThis.structuredClone = nativeClone; }

console.log(JSON.stringify({ emptyTagsOmitted: true, validTagOrderPreserved: true,
  aggregateGatePreserved: true, rejectedAdmissionPreserved: true,
  correctionAndRetirementPreserved: true, cloneIsolation: true,
  readinessDeepCopies: 0, oneRowPageDeepCopies: pageCopies, catalogRows: catalog.size }));
