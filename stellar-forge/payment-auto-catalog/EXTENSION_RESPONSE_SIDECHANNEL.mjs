// SPDX-License-Identifier: MIT
// Focused offline probe for the x402 v2 Bazaar EXTENSION-RESPONSES contract.
import assert from 'node:assert/strict';
import {
  EXTENSION_RESPONSES_HEADER,
  bazaarExtensionResponse,
  catalogResultToBazaarExtensionResponse,
  composeBazaarExtensionResponses,
  encodeBazaarExtensionResponses,
} from './extension-response.mjs';

const decode = value => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));

const success = catalogResultToBazaarExtensionResponse({ decision: 'accepted' });
assert.deepEqual(success, { status: 'success' });
const successHeader = encodeBazaarExtensionResponses(success);
assert.equal(successHeader.name, EXTENSION_RESPONSES_HEADER);
assert.deepEqual(decode(successHeader.value), { bazaar: { status: 'success' } });
assert.equal(successHeader.value, 'eyJiYXphYXIiOnsic3RhdHVzIjoic3VjY2VzcyJ9fQ==');

const existingResponses = {
  'payment-identifier': {
    payer: 'GABCD',
    evidence: ['signed', { network: 'stellar' }],
  },
  bazaar: { status: 'success', stale: true },
  trace: { id: 'trace-7' },
};
const existingSnapshot = structuredClone(existingResponses);
const composed = composeBazaarExtensionResponses(
  bazaarExtensionResponse('rejected', 'catalog policy rejected'),
  existingResponses,
);
assert.deepEqual(composed, {
  'payment-identifier': existingSnapshot['payment-identifier'],
  trace: existingSnapshot.trace,
  bazaar: { status: 'rejected', rejectedReason: 'catalog policy rejected' },
});
assert.deepEqual(existingResponses, existingSnapshot);
assert.notEqual(composed['payment-identifier'], existingResponses['payment-identifier']);
assert.notEqual(
  composed['payment-identifier'].evidence,
  existingResponses['payment-identifier'].evidence,
);
existingResponses['payment-identifier'].evidence[1].network = 'mutated';
assert.equal(composed['payment-identifier'].evidence[1].network, 'stellar');

const composedHeader = encodeBazaarExtensionResponses(
  bazaarExtensionResponse('processing'),
  { 'payment-identifier': { accepted: true } },
);
assert.deepEqual(decode(composedHeader.value), {
  'payment-identifier': { accepted: true },
  bazaar: { status: 'processing' },
});

const rejected = catalogResultToBazaarExtensionResponse({
  decision: 'soft_drop',
  reason: 'info failed schema validation',
});
assert.deepEqual(rejected, {
  status: 'rejected',
  rejectedReason: 'info failed schema validation',
});
assert.deepEqual(decode(encodeBazaarExtensionResponses(rejected).value), { bazaar: rejected });

const rejectedWithoutReason = bazaarExtensionResponse('rejected');
assert.deepEqual(rejectedWithoutReason, { status: 'rejected' });
assert.deepEqual(decode(encodeBazaarExtensionResponses(rejectedWithoutReason).value), {
  bazaar: { status: 'rejected' },
});
assert.deepEqual(bazaarExtensionResponse('rejected', ''), {
  status: 'rejected',
  rejectedReason: '',
});
assert.throws(() => bazaarExtensionResponse('rejected', null), /string when present/);
assert.throws(() => bazaarExtensionResponse('rejected', 7), /string when present/);

assert.deepEqual(bazaarExtensionResponse('processing'), { status: 'processing' });
assert.throws(() => bazaarExtensionResponse('success', 'not allowed'), /only valid/);
assert.throws(() => bazaarExtensionResponse('queued'), /Invalid Bazaar/);
assert.throws(() => catalogResultToBazaarExtensionResponse({ decision: 'unknown' }), /Unsupported/);
assert.throws(() => composeBazaarExtensionResponses(success, null), /keyed object/);
assert.throws(() => composeBazaarExtensionResponses(success, []), /keyed object/);
assert.throws(
  () => composeBazaarExtensionResponses(success, { invalid: undefined }),
  /JSON values/,
);
assert.throws(
  () => composeBazaarExtensionResponses(success, { invalid: new Date() }),
  /JSON values/,
);
const cyclicResponses = {};
cyclicResponses.self = cyclicResponses;
assert.throws(
  () => composeBazaarExtensionResponses(success, cyclicResponses),
  /must not be cyclic/,
);
assert.throws(
  () => composeBazaarExtensionResponses(success, { invalid: [,] }),
  /dense JSON arrays/,
);
let accessorReads = 0;
const accessorArray = [];
Object.defineProperty(accessorArray, '0', {
  enumerable: true,
  get: () => {
    accessorReads += 1;
    return 'unsafe';
  },
});
accessorArray.length = 1;
assert.throws(
  () => composeBazaarExtensionResponses(success, { invalid: accessorArray }),
  /dense JSON arrays/,
);
assert.equal(accessorReads, 0);

console.log(JSON.stringify({
  header: successHeader.name,
  success: decode(successHeader.value).bazaar.status,
  processing: bazaarExtensionResponse('processing').status,
  rejectionReason: rejected.rejectedReason,
  rejectedWithoutReason: decode(
    encodeBazaarExtensionResponses(rejectedWithoutReason).value,
  ).bazaar,
  emptyReason: bazaarExtensionResponse('rejected', '').rejectedReason,
  buyerForwarding: 'not_performed',
}));
