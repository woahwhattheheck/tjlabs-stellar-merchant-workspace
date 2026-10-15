// SPDX-License-Identifier: MIT
// Focused offline probe for x402 verify/settle EXTENSION-RESPONSES intake.
import assert from 'node:assert/strict';
import {
  EXTENSION_RESPONSES_HEADER,
  MAX_EXTENSION_RESPONSES_HEADER_BYTES,
  attachFacilitatorExtensionResponses,
  decodeExtensionResponsesHeader,
  encodeBazaarExtensionResponses,
  facilitatorResultForBuyer,
} from './extension-response.mjs';

const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

const officialSuccess = 'eyJiYXphYXIiOnsic3RhdHVzIjoic3VjY2VzcyJ9fQ==';
assert.deepEqual(decodeExtensionResponsesHeader(officialSuccess), {
  bazaar: { status: 'success' },
});

const sourceSidechannel = JSON.parse(
  '{"payment-identifier":{"status":"success","evidence":["signed",{"network":"stellar"}]},"bazaar":{"status":"processing"},"__proto__":{"polluted":true}}',
);
const sidechannelHeader = encode(sourceSidechannel);
const verifyBody = {
  isValid: true,
  extensions: { bazaar: { bodyState: 'verify-only' }, receipt: { id: 'body-7' } },
  extensionResponses: { spoofed: true },
};
const settleBody = {
  success: true,
  transaction: 'stellar-testnet-7',
  extensions: { bazaar: { bodyState: 'settle-only' } },
};

const verified = attachFacilitatorExtensionResponses(verifyBody, sidechannelHeader);
const settled = attachFacilitatorExtensionResponses(settleBody, sidechannelHeader);
for (const result of [verified, settled]) {
  assert.deepEqual(result.extensionResponses.bazaar, { status: 'processing' });
  assert.deepEqual(result.extensionResponses['payment-identifier'], {
    status: 'success',
    evidence: ['signed', { network: 'stellar' }],
  });
  assert.equal(Object.hasOwn(result.extensionResponses, '__proto__'), true);
  assert.deepEqual(result.extensionResponses.__proto__, { polluted: true });
  assert.equal(Object.prototype.polluted, undefined);
}
assert.deepEqual(verified.extensions, verifyBody.extensions);
assert.deepEqual(settled.extensions, settleBody.extensions);
assert.notEqual(verified.extensions, verifyBody.extensions);
assert.notEqual(verified.extensionResponses, settled.extensionResponses);
assert.notEqual(
  verified.extensionResponses['payment-identifier'].evidence,
  settled.extensionResponses['payment-identifier'].evidence,
);
verified.extensionResponses['payment-identifier'].evidence[1].network = 'mutated';
assert.equal(settled.extensionResponses['payment-identifier'].evidence[1].network, 'stellar');
assert.equal(sourceSidechannel['payment-identifier'].evidence[1].network, 'stellar');

assert.deepEqual(attachFacilitatorExtensionResponses(verifyBody, undefined), {
  isValid: true,
  extensions: verifyBody.extensions,
});
assert.deepEqual(attachFacilitatorExtensionResponses(verifyBody, 'not base64!'), {
  isValid: true,
  extensions: verifyBody.extensions,
});

let spoofReads = 0;
const accessorSpoof = { success: true };
Object.defineProperty(accessorSpoof, 'extensionResponses', {
  enumerable: true,
  get: () => {
    spoofReads += 1;
    return { attacker: true };
  },
});
assert.deepEqual(attachFacilitatorExtensionResponses(accessorSpoof, undefined), { success: true });
assert.deepEqual(facilitatorResultForBuyer(accessorSpoof), { success: true });
assert.equal(spoofReads, 0);
const cyclicSpoof = { success: true };
cyclicSpoof.extensionResponses = cyclicSpoof;
assert.deepEqual(attachFacilitatorExtensionResponses(cyclicSpoof, undefined), { success: true });
assert.deepEqual(facilitatorResultForBuyer(cyclicSpoof), { success: true });

const invalidUtf8 = Buffer.from([0xc3, 0x28]).toString('base64');
for (const invalid of [
  invalidUtf8,
  Buffer.from('{', 'utf8').toString('base64'),
  encode(null),
  encode('scalar'),
  encode([{}]),
  'A'.repeat(MAX_EXTENSION_RESPONSES_HEADER_BYTES + 1),
]) {
  assert.equal(decodeExtensionResponsesHeader(invalid), undefined);
  assert.equal(attachFacilitatorExtensionResponses({ success: true }, invalid).success, true);
}
const deeplyNestedJson = `{"nested":${'['.repeat(5500)}0${']'.repeat(5500)}}`;
const deeplyNestedHeader = Buffer.from(deeplyNestedJson, 'utf8').toString('base64');
assert.equal(deeplyNestedHeader.length < MAX_EXTENSION_RESPONSES_HEADER_BYTES, true);
assert.equal(decodeExtensionResponsesHeader(deeplyNestedHeader), undefined);
assert.throws(
  () => decodeExtensionResponsesHeader(officialSuccess, { maxHeaderBytes: 0 }),
  /positive safe integer/,
);
assert.throws(
  () => encodeBazaarExtensionResponses(
    { status: 'success' },
    { sibling: { payload: 'x'.repeat(MAX_EXTENSION_RESPONSES_HEADER_BYTES) } },
  ),
  /exceeds maxHeaderBytes/,
);

const buyerResult = facilitatorResultForBuyer(verified);
assert.deepEqual(buyerResult.extensions, verifyBody.extensions);
assert.equal(Object.hasOwn(buyerResult, 'extensionResponses'), false);
const buyerWire = JSON.stringify(buyerResult);
assert.equal(buyerWire.includes('extensionResponses'), false);
assert.equal(buyerWire.includes('verify-only'), true);

console.log(JSON.stringify({
  header: EXTENSION_RESPONSES_HEADER,
  verifyAttached: Object.hasOwn(verified, 'extensionResponses'),
  settleAttached: Object.hasOwn(settled, 'extensionResponses'),
  opaqueSibling: verified.extensionResponses['payment-identifier'].status,
  bodyExtensionsPreserved: buyerResult.extensions.bazaar.bodyState,
  buyerSidechannelExcluded: !Object.hasOwn(buyerResult, 'extensionResponses'),
}));
