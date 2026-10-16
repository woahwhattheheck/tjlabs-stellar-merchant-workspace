// MIT. Focused seller -> Bazaar catalog body-compatibility contract.
import assert from 'node:assert/strict';
import { BazaarCatalog } from '../../../scf46-stellar-bazaar/src/catalog.mjs';
import { validateBazaarExtension } from '../../../stellar-forge/payment-auto-catalog/schema-validation.mjs';
import { compileHttpSellerOffer, paymentRequiredResponse } from './seller.mjs';

const payment = {
  scheme: 'exact', network: 'stellar:testnet', asset: 'DEMO_ASSET',
  amount: '1250000', payTo: 'DEMO_RECIPIENT', maxTimeoutSeconds: 60,
};
const methods = ['POST', 'PUT', 'PATCH'];
const bodyTypes = ['json', 'form-data', 'text'];
const body = { record: 'example', count: 2 };
const observation = { lastUpdated: '2026-10-16T00:00:00.000Z' };

let accepted = 0;
for (const method of methods) {
  for (const bodyType of bodyTypes) {
    const source = {
      url: `https://seller.example/${method.toLowerCase()}-${bodyType}`,
      method, bodyType, body, description: 'Seller catalog body contract', payment,
    };
    const before = structuredClone(source);
    const offer = compileHttpSellerOffer(source);
    assert.deepEqual(source, before, 'seller input remains detached and unchanged');
    assert.notEqual(offer.extensions.bazaar.info.input.body, source.body);
    assert.deepEqual(offer.extensions.bazaar.info.input.body, body);
    assert.equal(offer.extensions.bazaar.schema.properties.input.properties.body.type, 'object');
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
    const page = catalog.listDiscovery(new URLSearchParams('limit=1'));
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].resource, offer.resource.url);
    assert.equal(page.items[0].extensions.bazaar.info.input.method, method);
    assert.equal(page.items[0].extensions.bazaar.info.input.bodyType, bodyType);
    accepted += 1;
  }
}

for (const invalid of ['not-an-object', 0, false, null, []]) {
  assert.throws(() => compileHttpSellerOffer({
    url: 'https://seller.example/rejected', method: 'POST', bodyType: 'json',
    body: invalid, description: 'Rejected seller body', payment,
  }), /requires a keyed object example body/);
}

for (const method of ['GET', 'HEAD', 'DELETE']) {
  assert.throws(() => compileHttpSellerOffer({
    url: `https://seller.example/${method.toLowerCase()}`,
    method, body, description: 'Bodyless seller method', payment,
  }), /must not declare a body/);
}

console.log(JSON.stringify({
  acceptedMethodBodyTypePairs: accepted,
  rejectedNonObjectBodies: 5,
  bodylessMethodsStillRejectBodies: 3,
  sellerInputDetached: true,
  bazaarExtensionValidated: true,
  trustedCatalogAdmission: true,
  officialDiscoveryReady: true,
  settlementAuthenticated: false,
}));
