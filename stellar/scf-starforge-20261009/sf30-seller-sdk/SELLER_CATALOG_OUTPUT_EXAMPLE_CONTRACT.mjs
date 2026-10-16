// MIT. Focused seller output-example wire and Bazaar admission contract.
import assert from 'node:assert/strict';
import { BazaarCatalog } from '../../../scf46-stellar-bazaar/src/catalog.mjs';
import { validateBazaarExtension } from '../../../stellar-forge/payment-auto-catalog/schema-validation.mjs';
import { compileHttpSellerOffer, paymentRequiredResponse } from './seller.mjs';

const payment = {
  scheme: 'exact', network: 'stellar:testnet', asset: 'DEMO_ASSET',
  amount: '1250000', payTo: 'DEMO_RECIPIENT', maxTimeoutSeconds: 60,
};
const validExamples = [
  null,
  true,
  42.5,
  'completed',
  [1, { accepted: true }, null],
  { summary: 'ready', items: [{ id: 'A-1', score: 0.75 }] },
];
const observation = { lastUpdated: '2026-10-16T00:00:00.000Z' };

let accepted = 0;
for (const outputExample of validExamples) {
  const source = {
    url: `https://seller.example/result-${accepted}`,
    method: 'GET', description: 'Seller output example contract',
    outputExample, payment,
  };
  const offer = compileHttpSellerOffer(source);
  assert.deepEqual(offer.extensions.bazaar.info.output.example, outputExample);
  if (outputExample && typeof outputExample === 'object')
    assert.notEqual(offer.extensions.bazaar.info.output.example, outputExample);
  assert.deepEqual(validateBazaarExtension(offer.extensions.bazaar), { ok: true });

  const response = paymentRequiredResponse(offer);
  assert.equal(response.statusCode, 402);
  assert.deepEqual(JSON.parse(response.body), offer);

  const catalog = new BazaarCatalog();
  catalog.insertValidated(offer, observation);
  assert.deepEqual(catalog.discoveryReadiness(), {
    ready: true, x402Version: 2, catalogVersion: 1,
    resources: 1, observedResources: 1, unreadyResources: 0,
  });
  assert.equal(catalog.listDiscovery(new URLSearchParams('limit=1')).items.length, 1);
  accepted += 1;
}

const cycle = { accepted: true };
cycle.self = cycle;
const sparse = [];
sparse[1] = 'missing zero';
const accessor = {};
Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 'hidden work' });
const symbolKey = { accepted: true };
symbolKey[Symbol('private')] = 'not wire visible';
const inherited = Object.create({ inherited: true });
inherited.accepted = true;
const invalidExamples = [
  1n, NaN, Infinity, -Infinity, () => true, Symbol('not-json'),
  { omitted: undefined }, cycle, sparse, accessor, symbolKey,
  new Date('2026-10-16T00:00:00.000Z'), new Map([['accepted', true]]), inherited,
];
for (const outputExample of invalidExamples) {
  assert.throws(() => compileHttpSellerOffer({
    url: 'https://seller.example/rejected', method: 'GET',
    description: 'Rejected seller output example', outputExample, payment,
  }), /outputExample must contain only finite JSON values/);
}

const mutable = { nested: { status: 'ready' } };
const detached = compileHttpSellerOffer({
  url: 'https://seller.example/detached', method: 'GET',
  description: 'Detached seller output example', outputExample: mutable, payment,
});
mutable.nested.status = 'changed';
assert.equal(detached.extensions.bazaar.info.output.example.nested.status, 'ready');

assert.throws(() => compileHttpSellerOffer({
  url: 'https://seller.example/oversize', method: 'GET',
  description: 'Oversize seller output example',
  outputExample: { payload: 'x'.repeat(65_536) }, payment,
}), /Bazaar info exceeds 65536 bytes/);

console.log(JSON.stringify({
  acceptedJsonExamples: accepted,
  rejectedNonJsonExamples: invalidExamples.length,
  detachedExample: true,
  bazaarInfoLimitBytes: 65_536,
  responseRoundTrip: true,
  bazaarExtensionValidated: true,
  trustedCatalogAdmission: true,
  officialDiscoveryReady: true,
  settlementAuthenticated: false,
}));
