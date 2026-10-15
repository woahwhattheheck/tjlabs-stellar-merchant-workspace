// SPDX-License-Identifier: MIT
// One offline contract for an entry-level typical amount with no denomination.
import assert from 'node:assert/strict';
import { describeCatalogPricing } from './src/pricing.mjs';

const option = (network, asset, scheme = 'upto') => ({
  network, asset, scheme, amount: '1000', payTo: 'seller',
});
const entry = accepts => ({
  accepts, extensions: { bazaar: { pricing: { model: 'per-call', typical: '10' } } },
});
const selected = { network: 'stellar:testnet', asset: 'native' };
const native = option(selected.network, selected.asset);
const original = entry([native, option('stellar:testnet', 'issued:USD')]);
const originalBytes = JSON.stringify(original);

// A denomination filter selects one intact offer; it cannot qualify the
// entry-level typical scalar which was ambiguous on the original record.
for (const accepts of [
  original.accepts,
  [native, option('stellar:pubnet', 'native')],
]) {
  const row = entry(accepts);
  for (const filters of [{}, selected, { ...selected, scheme: 'upto', payTo: 'seller' }]) {
    const offers = describeCatalogPricing(row, filters, 50n);
    assert.ok(offers.length > 0);
    for (const offer of offers) {
      assert.equal(offer.sellerClaimedTypicalAtomic, null);
      assert.equal(offer.budgetAssessment, 'CEILING_ABOVE_BUDGET_COST_UNKNOWN');
      assert.equal(offer.observedSettledAmountAtomic, null);
    }
  }
}

// Several original offers with one denomination remain unambiguous. Scheme
// filtering still retains the original option and fixed-price semantics.
const same = entry([native, { ...native, amount: '2000', payTo: 'other' }]);
for (const offer of describeCatalogPricing(same, selected, 50n)) {
  assert.equal(offer.sellerClaimedTypicalAtomic, '10');
  assert.equal(offer.budgetAssessment, 'CEILING_ABOVE_BUDGET_SELLER_TYPICAL_WITHIN');
}
const fixed = describeCatalogPricing(entry([{ ...native, scheme: 'exact', amount: '20' }]),
  selected, 50n)[0];
assert.equal(fixed.sellerClaimedTypicalAtomic, null);
assert.equal(fixed.budgetAssessment, 'ADVERTISED_PRICE_WITHIN_BUDGET');
assert.deepEqual(describeCatalogPricing(original, { ...selected, payTo: 'missing' }, 50n), []);
assert.equal(JSON.stringify(original), originalBytes);

console.log(JSON.stringify({ filteredAmbiguousTypical: 'suppressed',
  sameDenominationTypical: 'preserved', fixedPrice: 'preserved',
  sameOptionFiltering: 'preserved', original: 'unchanged' }));
