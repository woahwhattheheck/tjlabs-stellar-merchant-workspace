// MIT. Focused seller-to-catalog search-metadata compatibility.
import assert from 'node:assert/strict';
import { compileHttpSellerOffer } from './seller.mjs';

const base = {
  url: 'https://seller.example/reports/current',
  method: 'GET',
  description: 'Seller search metadata compatibility',
  payment: {
    scheme: 'exact',
    network: 'stellar:testnet',
    asset: 'DEMO_ASSET',
    amount: '1250000',
    payTo: 'DEMO_RECIPIENT',
    maxTimeoutSeconds: 60,
  },
};

const absent = compileHttpSellerOffer(base);
assert.equal(Object.hasOwn(absent.resource, 'tags'), false);

const empty = compileHttpSellerOffer({ ...base, tags: [] });
assert.equal(Object.hasOwn(empty.resource, 'tags'), false);

const supplied = ['Reports', 'Current'];
const tagged = compileHttpSellerOffer({ ...base, tags: supplied });
assert.deepEqual(tagged.resource.tags, supplied);
assert.notEqual(tagged.resource.tags, supplied);
supplied[0] = 'mutated';
assert.deepEqual(tagged.resource.tags, ['Reports', 'Current']);

assert.throws(
  () => compileHttpSellerOffer({ ...base, tags: ['Reports', 'reports'] }),
  /tags must be/,
);
assert.throws(
  () => compileHttpSellerOffer({ ...base, tags: [''] }),
  /tags must be/,
);

console.log(JSON.stringify({
  absentTagsOmitted: true,
  emptyTagsOmitted: true,
  validTagsPreserved: true,
  validTagsDetached: true,
  duplicateAndEmptyTagsRejected: true,
}));
