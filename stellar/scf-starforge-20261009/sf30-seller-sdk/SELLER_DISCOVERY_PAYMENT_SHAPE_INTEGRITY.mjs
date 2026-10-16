// MIT. Focused seller discovery payment-option shape guard.
import assert from 'node:assert/strict';
import { auditCatalogVisibility, compileHttpSellerOffer } from './seller.mjs';

const offer = compileHttpSellerOffer({
  url: 'https://seller.example/reports/current',
  routeTemplate: '/reports/:report_id',
  method: 'GET',
  description: 'Seller discovery payment shape integrity',
  queryParameters: [{
    name: 'format', type: 'string', description: 'Report format',
    example: 'summary', required: true,
  }],
  outputExample: { status: 'ready', rows: 3 },
  paymentOptions: [
    {
      scheme: 'exact', network: 'stellar:testnet', asset: 'DEMO_ASSET_A',
      amount: '1250000', payTo: 'DEMO_RECIPIENT_A', maxTimeoutSeconds: 60,
    },
    {
      scheme: 'exact', network: 'stellar:testnet', asset: 'DEMO_ASSET_B',
      amount: '2500000', payTo: 'DEMO_RECIPIENT_B', maxTimeoutSeconds: 90,
      extra: { tier: 'expanded' },
    },
  ],
});
const row = {
  resource: offer.resource.url,
  type: 'http',
  x402Version: 2,
  accepts: structuredClone(offer.accepts),
  extensions: structuredClone(offer.extensions),
  lastUpdated: '2026-10-16T00:00:00.000Z',
};

const exact = auditCatalogVisibility({ items: [structuredClone(row)] }, offer);
assert.equal(exact.decision, 'VISIBLE_TERMS_MATCH_UNVERIFIED');
assert.equal(exact.termsMatch, true);

for (const mutate of [
  candidate => { candidate.accepts[0].fee = '100'; },
  candidate => { candidate.accepts[1].memo = 'buyer-visible'; },
  candidate => { delete candidate.accepts[0].maxTimeoutSeconds; },
  candidate => { candidate.accepts[1] = 'not-an-option'; },
]) {
  const candidate = structuredClone(row);
  mutate(candidate);
  const result = auditCatalogVisibility({ items: [candidate] }, offer);
  assert.equal(result.visible, true);
  assert.equal(result.contractMatch, true);
  assert.equal(result.termsMatch, false);
  assert.equal(result.decision, 'TERMS_DRIFT');
  assert.equal(result.matchingTermSets, 0);
}

for (const mutate of [
  candidate => { candidate.accepts[0].fee = '100'; },
  candidate => { delete candidate.accepts[0].network; },
]) {
  const candidate = structuredClone(offer);
  mutate(candidate);
  assert.throws(
    () => auditCatalogVisibility({ items: [row] }, candidate),
    /Invalid seller offer/,
  );
}

console.log(JSON.stringify({
  exactPaymentShapeAccepted: true,
  extraTermsRejected: 2,
  missingRequiredTermsRejected: true,
  nonObjectTermsRejected: true,
  malformedSellerOffersRejected: 2,
  settlementAuthenticated: exact.settlementAuthenticated,
}));
