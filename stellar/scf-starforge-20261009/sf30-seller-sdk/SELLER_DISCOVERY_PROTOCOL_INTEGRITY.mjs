// MIT. Focused seller discovery protocol-integrity guard.
import assert from 'node:assert/strict';
import { auditCatalogVisibility, compileHttpSellerOffer } from './seller.mjs';

const offer = compileHttpSellerOffer({
  url: 'https://seller.example/reports/current',
  routeTemplate: '/reports/:report_id',
  method: 'GET',
  description: 'Seller discovery protocol integrity',
  queryParameters: [{
    name: 'format', type: 'string', description: 'Report format',
    example: 'summary', required: true,
  }],
  outputExample: { status: 'ready', rows: 3 },
  payment: {
    scheme: 'exact', network: 'stellar:testnet', asset: 'DEMO_ASSET',
    amount: '1250000', payTo: 'DEMO_RECIPIENT', maxTimeoutSeconds: 60,
  },
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
assert.equal(exact.contractMatch, true);
assert.equal(exact.termsMatch, true);

const retained = auditCatalogVisibility({ resources: [{
  ...structuredClone(row), resource: { url: row.resource },
}] }, offer);
assert.equal(retained.decision, 'VISIBLE_TERMS_MATCH_UNVERIFIED');

for (const mutation of [
  candidate => { candidate.x402Version = 1; },
  candidate => { delete candidate.x402Version; },
  candidate => { candidate.type = 'file'; },
  candidate => { delete candidate.type; },
]) {
  const candidate = structuredClone(row);
  mutation(candidate);
  const result = auditCatalogVisibility({ items: [candidate] }, offer);
  assert.equal(result.decision, 'NOT_INDEXED');
  assert.equal(result.visible, false);
  assert.equal(result.matchingRows, 0);
}

const invalidOffer = structuredClone(offer);
invalidOffer.x402Version = 1;
assert.throws(
  () => auditCatalogVisibility({ items: [row] }, invalidOffer),
  /Invalid seller offer/,
);

console.log(JSON.stringify({
  exactV2HttpAccepted: true,
  retainedEnvelopeAccepted: true,
  wrongVersionRejected: true,
  missingVersionRejected: true,
  wrongTypeRejected: true,
  missingTypeRejected: true,
  invalidSellerVersionRejected: true,
  settlementAuthenticated: exact.settlementAuthenticated,
}));

