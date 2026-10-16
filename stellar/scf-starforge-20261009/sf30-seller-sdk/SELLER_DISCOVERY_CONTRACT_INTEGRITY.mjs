// MIT. Focused seller discovery contract-integrity guard.
import assert from 'node:assert/strict';
import { auditCatalogVisibility, compileHttpSellerOffer } from './seller.mjs';

const paymentOptions = ['DEMO_ASSET_A', 'DEMO_ASSET_B'].map(asset => ({
  scheme: 'exact', network: 'stellar:testnet', asset,
  amount: '1250000', payTo: 'DEMO_RECIPIENT',
  maxTimeoutSeconds: 60, extra: { tier: asset },
}));
const offer = compileHttpSellerOffer({
  url: 'https://seller.example/reports/current',
  routeTemplate: '/reports/:report_id',
  method: 'GET',
  description: 'Seller discovery contract integrity',
  queryParameters: [{
    name: 'format', type: 'string', description: 'Report format',
    example: 'summary', required: true,
  }],
  outputExample: { status: 'ready', rows: 3 },
  paymentOptions,
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
assert.equal(exact.matchingContracts, 1);
assert.equal(exact.matchingTermSets, 1);
assert.deepEqual(exact.paymentOptions.map(option => option.contractVisible), [true, true]);
assert.equal(exact.settlementAuthenticated, false);

const internal = auditCatalogVisibility({ resources: [structuredClone({
  ...row, resource: { url: row.resource },
})] }, offer);
assert.equal(internal.decision, 'VISIBLE_TERMS_MATCH_UNVERIFIED');

const contractDrift = structuredClone(row);
contractDrift.extensions.bazaar.routeTemplate = '/reports/:other_id';
const driftedContract = auditCatalogVisibility({ items: [contractDrift] }, offer);
assert.equal(driftedContract.decision, 'CONTRACT_DRIFT');
assert.equal(driftedContract.visible, true);
assert.equal(driftedContract.contractMatch, false);
assert.equal(driftedContract.termsMatch, false);
assert.equal(driftedContract.matchingTermSets, 1);
assert.deepEqual(driftedContract.paymentOptions.map(option => option.visible), [true, true]);
assert.deepEqual(driftedContract.paymentOptions.map(option => option.contractVisible), [false, false]);

const inputDrift = structuredClone(row);
inputDrift.extensions.bazaar.info.input.queryParams.format = 'full';
assert.equal(
  auditCatalogVisibility({ items: [inputDrift] }, offer).decision,
  'CONTRACT_DRIFT',
);

const termDrift = structuredClone(row);
termDrift.accepts[1].amount = '1250001';
const driftedTerms = auditCatalogVisibility({ items: [termDrift] }, offer);
assert.equal(driftedTerms.decision, 'TERMS_DRIFT');
assert.equal(driftedTerms.contractMatch, true);
assert.equal(driftedTerms.termsMatch, false);
assert.equal(driftedTerms.matchingTermSets, 0);

const bothDrift = structuredClone(contractDrift);
bothDrift.accepts[0].payTo = 'OTHER_RECIPIENT';
const driftedBoth = auditCatalogVisibility({ items: [bothDrift] }, offer);
assert.equal(driftedBoth.decision, 'CONTRACT_AND_TERMS_DRIFT');
assert.equal(driftedBoth.contractMatch, false);
assert.equal(driftedBoth.termsMatch, false);

const split = offer.accepts.map(accepts => ({
  ...structuredClone(row), accepts: [accepts],
}));
assert.equal(auditCatalogVisibility({ items: split }, offer).termsMatch, false);
assert.equal(auditCatalogVisibility({ items: [] }, offer).decision, 'NOT_INDEXED');

console.log(JSON.stringify({
  exactContractAndTerms: true,
  officialAndInternalEnvelopes: true,
  routeAndInputDriftRejected: true,
  termDriftDistinguished: true,
  combinedDriftDistinguished: true,
  splitRowsRejected: true,
  settlementAuthenticated: exact.settlementAuthenticated,
}));
