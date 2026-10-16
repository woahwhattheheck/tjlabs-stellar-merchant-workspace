// MIT. Focused original public discovery → SF30 read-only visibility integration.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { BazaarCatalog, createDiscoveryServer } from '../../../scf46-stellar-bazaar/src/catalog.mjs';
import { compileHttpSellerOffer, auditCatalogVisibility, probeLocalVisibility } from './seller.mjs';

const offer = compileHttpSellerOffer({
  url: 'https://seller.example/zz-target', method: 'GET',
  description: 'Read-only discovery integration',
  paymentOptions: ['DEMO_ASSET_A', 'DEMO_ASSET_B'].map(asset => ({
    scheme: 'exact', network: 'stellar:testnet', asset,
    amount: '9007199254740993', payTo: 'DEMO_RECIPIENT',
    maxTimeoutSeconds: 60, extra: { label: asset },
  })),
});
const catalog = new BazaarCatalog();
const observation = { lastUpdated: '2026-10-16T00:00:00.000Z' };
for (let index = 0; index < 100; index++) {
  const other = structuredClone(offer);
  other.resource.url = `https://seller.example/resource-${String(index).padStart(3, '0')}`;
  catalog.insertValidated(other, observation);
}
catalog.insertValidated(offer, observation);
const page = catalog.listDiscovery(new URLSearchParams('offset=100&limit=1'));
assert.equal(page.items[0].resource, offer.resource.url);
assert.equal(auditCatalogVisibility(page, offer).decision, 'VISIBLE_TERMS_MATCH_UNVERIFIED');
assert.equal(auditCatalogVisibility(catalog.list(new URLSearchParams('offset=100')), offer).termsMatch, true);
const search = catalog.searchDiscovery(new URLSearchParams('query=zz-target'));
assert.equal(auditCatalogVisibility(search, offer).termsMatch, true);

const drift = structuredClone(page);
drift.items[0].accepts[1].amount = '9007199254740992';
assert.equal(auditCatalogVisibility(drift, offer).decision, 'TERMS_DRIFT');
const split = offer.accepts.map(accept => ({ ...page.items[0], accepts: [accept] }));
assert.equal(auditCatalogVisibility({ items: split }, offer).termsMatch, false);
assert.equal(auditCatalogVisibility({ items: [], resources: [offer] }, offer).decision, 'NOT_INDEXED');
assert.throws(() => auditCatalogVisibility({ items: null, resources: [offer] }, offer), /Invalid discovery/);

const requests = [];
const discovery = createDiscoveryServer(catalog);
const server = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url });
  return discovery(req, res);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}/`;
try {
  const result = await probeLocalVisibility(origin, offer);
  assert.equal(result.decision, 'VISIBLE_TERMS_MATCH_UNVERIFIED');
  assert.equal(result.pages, 2);
  assert.equal(result.matchingRows, 1);
  assert.equal(result.settlementAuthenticated, false);
  assert.deepEqual(result.paymentOptions.map(option => option.visible), [true, true]);
  assert.deepEqual(requests.map(request => new URL(request.path, origin).searchParams.get('offset')), ['0', '100']);
  assert.equal(requests.every(request => request.method === 'GET'), true);
  // An incomplete public catalog remains unavailable; visibility never bypasses it.
  const unobserved = structuredClone(offer);
  unobserved.resource.url = 'https://seller.example/unobserved';
  catalog.insertValidated(unobserved);
  await assert.rejects(probeLocalVisibility(origin, offer), /HTTP 503/);
  console.log(JSON.stringify({
    officialListAndSearch: true, retainedInternalList: true,
    publicHttpPages: result.pages, exactOptions: result.paymentOptions.length,
    driftAndSplitOffersRejected: true, readinessFailurePreserved: true,
    settlementAuthenticated: result.settlementAuthenticated,
  }));
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
