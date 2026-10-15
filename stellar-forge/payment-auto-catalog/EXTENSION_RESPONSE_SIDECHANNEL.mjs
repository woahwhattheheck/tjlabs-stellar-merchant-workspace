// SPDX-License-Identifier: MIT
// Focused offline probe for the x402 v2 Bazaar EXTENSION-RESPONSES contract.
import assert from 'node:assert/strict';
import {
  EXTENSION_RESPONSES_HEADER,
  bazaarExtensionResponse,
  catalogResultToBazaarExtensionResponse,
  encodeBazaarExtensionResponses,
} from './extension-response.mjs';

const decode = value => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));

const success = catalogResultToBazaarExtensionResponse({ decision: 'accepted' });
assert.deepEqual(success, { status: 'success' });
const successHeader = encodeBazaarExtensionResponses(success);
assert.equal(successHeader.name, EXTENSION_RESPONSES_HEADER);
assert.deepEqual(decode(successHeader.value), { bazaar: { status: 'success' } });
assert.equal(successHeader.value, 'eyJiYXphYXIiOnsic3RhdHVzIjoic3VjY2VzcyJ9fQ==');

const rejected = catalogResultToBazaarExtensionResponse({
  decision: 'soft_drop',
  reason: 'info failed schema validation',
});
assert.deepEqual(rejected, {
  status: 'rejected',
  rejectedReason: 'info failed schema validation',
});
assert.deepEqual(decode(encodeBazaarExtensionResponses(rejected).value), { bazaar: rejected });

assert.deepEqual(bazaarExtensionResponse('processing'), { status: 'processing' });
assert.throws(() => bazaarExtensionResponse('success', 'not allowed'), /only valid/);
assert.throws(() => bazaarExtensionResponse('rejected'), /non-empty string/);
assert.throws(() => bazaarExtensionResponse('queued'), /Invalid Bazaar/);
assert.throws(() => catalogResultToBazaarExtensionResponse({ decision: 'unknown' }), /Unsupported/);

console.log(JSON.stringify({
  header: successHeader.name,
  success: decode(successHeader.value).bazaar.status,
  processing: bazaarExtensionResponse('processing').status,
  rejectionReason: rejected.rejectedReason,
  buyerForwarding: 'not_performed',
}));

