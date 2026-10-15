// SPDX-License-Identifier: MIT
// Focused offline SF54 producer + SF58 frontdoor compatibility probe.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  MAX_HEADER_BYTES,
  validatedExtensionResponsesHeader,
} from './header.mjs';
import { encodeCatalogSidechannel } from './sidechannel.mjs';
import { makeFrontdoor } from '../sf58-dual-network-frontdoor/frontdoor.mjs';

const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
const officialBazaar = 'eyJiYXphYXIiOnsic3RhdHVzIjoic3VjY2VzcyJ9fQ==';
const empty = encode({});
const opaque = encode({
  'Vendor.Ext/v2': { status: 'ok', evidence: ['signed', { network: 'stellar' }] },
});

assert.equal(validatedExtensionResponsesHeader(officialBazaar), officialBazaar);
assert.equal(validatedExtensionResponsesHeader(empty), empty);
assert.equal(validatedExtensionResponsesHeader(opaque), opaque);

for (const invalid of [
  'not base64!',
  Buffer.from([0xc3, 0x28]).toString('base64'),
  Buffer.from('{', 'utf8').toString('base64'),
  encode(null),
  encode([]),
  'A'.repeat(MAX_HEADER_BYTES + 4),
]) assert.equal(validatedExtensionResponsesHeader(invalid), null);

const produced = encodeCatalogSidechannel({
  otherExtensionResponses: {
    'Vendor.Ext/v2': { status: 'ok', evidence: ['signed'] },
    '__future/1': { result: true },
  },
});
assert.deepEqual(JSON.parse(Buffer.from(produced.headerValue, 'base64').toString('utf8')), {
  'Vendor.Ext/v2': { status: 'ok', evidence: ['signed'] },
  '__future/1': { result: true },
});

const body = '{"success":true,"network":"stellar:testnet","extensions":{"bazaar":{"body":"separate"}}}';
let upstreamHeader = opaque;
const fetchImpl = async () => new Response(body, {
  status: 200,
  headers: { 'content-type': 'application/json', 'extension-responses': upstreamHeader },
});
const server = makeFrontdoor({
  upstreams: {
    'stellar:testnet': { origin: 'http://127.0.0.1:5101' },
    'stellar:pubnet': { origin: 'http://127.0.0.1:5102' },
  },
  allowLoopbackHttp: true,
  fetchImpl,
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const paymentRequest = JSON.stringify({
  paymentPayload: {
    x402Version: 2,
    accepted: { network: 'stellar:testnet', scheme: 'exact' },
  },
  paymentRequirements: { network: 'stellar:testnet', scheme: 'exact' },
});

try {
  for (const route of ['verify', 'settle']) {
    const response = await fetch(`http://127.0.0.1:${port}/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: paymentRequest,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('extension-responses'), opaque);
    assert.equal(await response.text(), body);
  }

  upstreamHeader = empty;
  const emptyResponse = await fetch(`http://127.0.0.1:${port}/settle`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: paymentRequest,
  });
  assert.equal(emptyResponse.headers.get('extension-responses'), empty);
  assert.equal(await emptyResponse.text(), body);

  upstreamHeader = 'not base64!';
  const malformedResponse = await fetch(`http://127.0.0.1:${port}/settle`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: paymentRequest,
  });
  assert.equal(malformedResponse.headers.get('extension-responses'), null);
  assert.equal(malformedResponse.status, 200);
  assert.equal(await malformedResponse.text(), body);
} finally {
  server.close();
  await once(server, 'close');
}

console.log(JSON.stringify({
  officialBazaar: 'preserved',
  emptyObject: 'preserved',
  opaqueExtension: 'preserved',
  verifyAndSettleBody: 'byte_exact',
  malformedOptionalHeader: 'dropped_without_payment_failure',
}));
