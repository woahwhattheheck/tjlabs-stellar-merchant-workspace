// SPDX-License-Identifier: MIT
// Focused offline startup of the original catalog owner, listeners and gateway.
// No SDK, signer material, RPC, settlement or catalog operation is invoked.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PaymentAutoCatalog } from '../../../stellar-forge/payment-auto-catalog/auto-catalog.mjs';
import { openNativeSettlementCatalog } from './catalog.mjs';
import { startFacilitatorServer } from './server.mjs';
import { openDiscovery } from '../sf60-durable-catalog-transaction/service.mjs';
import { makeFrontdoor } from '../sf58-dual-network-frontdoor/frontdoor.mjs';

const directory = await mkdtemp(join(tmpdir(), 'native-discovery-readiness-'));
const address = 'G' + 'A'.repeat(55);
const token = 'offline-readiness-contract-token';
const expected = { ready: true, x402Version: 2, catalogVersion: 0,
  resources: 0, observedResources: 0, unreadyResources: 0 };
const config = {
  schema: 'stellar-forge.native-facilitator.v1', network: 'stellar:testnet',
  signers: [{ address, secretEnv: 'UNUSED_OFFLINE_SIGNER' }],
  payments: { assets: ['C' + 'A'.repeat(55)], recipients: [address], maxAtomic: '1000' },
  limits: { maxTransactionFeeStroops: 100, drainGraceMs: 1000 },
  catalog: { directory, merchants: [{ sellerId: 'offline', signer: 'offline-source',
    origin: 'https://merchant.example', payTo: address }] },
};
let catalog, native, gateway, standalone;
let unexpectedPaymentCalls = 0;
const unavailable = () => { unexpectedPaymentCalls++; throw new Error('No payment call in startup check'); };
async function get(origin, path, headers) {
  const response = await fetch(origin + path, { headers });
  return { status: response.status, text: await response.text() };
}
try {
  assert.deepEqual(new PaymentAutoCatalog().discoveryReadiness(), expected);
  catalog = await openNativeSettlementCatalog(config);
  assert.deepEqual(catalog.discoveryReadiness(), expected);
  native = await startFacilitatorServer({ port: 0, facilitator: {
    catalog, verify: unavailable, settle: unavailable, getSupported: unavailable,
    status: () => ({ state: 'ACCEPTING' }), drainGraceMs: 1000,
    drain: async () => { await catalog.close(); return { drained: true }; },
  } });
  const ready = await get(native.url, '/discovery/readiness?network=stellar:testnet');
  assert.equal(ready.status, 200);
  assert.deepEqual(JSON.parse(ready.text), expected);
  assert.equal((await get(native.url, '/discovery/readiness?network=stellar:pubnet')).status, 400);
  assert.equal((await get(native.url, '/discovery/readiness?network=stellar:testnet&network=stellar:testnet')).status, 400);
  const listed = await get(native.url, '/discovery/resources?network=stellar:testnet');
  assert.equal(listed.status, 200);
  assert.deepEqual(JSON.parse(listed.text).items, []);

  gateway = makeFrontdoor({ allowLoopbackHttp: true, inboundToken: token,
    upstreams: { 'stellar:testnet': { origin: native.url }, 'stellar:pubnet': { origin: native.url } } });
  await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(0, '127.0.0.1', resolve); });
  const gatewayOrigin = `http://127.0.0.1:${gateway.address().port}`;
  const authorization = { authorization: `Bearer ${token}` };
  assert.equal((await get(gatewayOrigin, '/discovery/readiness?network=stellar:testnet')).status, 401);
  assert.equal((await get(gatewayOrigin, '/discovery/readiness', authorization)).status, 400);
  const forwarded = await get(gatewayOrigin, '/discovery/readiness?network=stellar:testnet', authorization);
  assert.deepEqual(forwarded, ready);
  await new Promise(resolve => gateway.close(resolve)); gateway = null;
  const drained = await native.close(); native = null;
  assert.equal(drained.drained, true);
  assert.throws(() => catalog.discoveryReadiness());

  // The standalone operator reopens this same untouched journal after the native
  // owner drains, exercising the other original createDiscoveryServer caller.
  standalone = await openDiscovery({ directory, createEmpty: true });
  const reopened = await get(standalone.origin, '/discovery/readiness');
  assert.deepEqual(reopened, ready);
  assert.equal((await get(standalone.origin, '/discovery/resources')).status, 200);
  await standalone.close(); standalone = null;
  assert.equal(unexpectedPaymentCalls, 0);
  console.log(JSON.stringify({ nativeStartup: true, durableOperatorReopen: true,
    facadeChain: true, readinessForwardedByteExact: true,
    networkAndBearerRestrictionsPreserved: true, drained: true,
    paymentCalls: 0, catalogOperations: 0 }));
} finally {
  if (gateway) await new Promise(resolve => gateway.close(resolve));
  if (native) await native.close();
  else if (catalog) await catalog.close();
  if (standalone) await standalone.close();
  await rm(directory, { recursive: true, force: true });
}
