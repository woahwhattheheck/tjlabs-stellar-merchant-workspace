// SPDX-License-Identifier: MIT
// SCF/BAZAAR-SERVICE-METADATA-SOFT-DROP-20261015.
// Official x402 faa1c694c66a3732aaabbce93bdae140e521a67d;
// facilitator blob 083013ee19544e182c2e3185d7853309c34b9d9c.
import assert from 'node:assert/strict';
import { sanitizeResourceSearchMetadata } from './src/entry-identity.mjs';

for (const tags of [undefined, null, {}, 'Weather', [], ['', 17, false, null, '\n', 'é', 'a'.repeat(33)]]) {
  const input = { url: 'https://seller.example/weather', tags };
  const before = structuredClone(input);
  const output = sanitizeResourceSearchMetadata(input);
  assert.equal(Object.hasOwn(output, 'tags'), false);
  assert.equal(output.url, input.url);
  assert.deepEqual(input, before);
}
assert.equal(Object.hasOwn(sanitizeResourceSearchMetadata({}), 'tags'), false);

const input = { url: 'https://seller.example/weather', serviceName: 'Weather',
  tags: ['Weather', '', 'weather', 'Forecast', null, 'Alerts', 'Maps', 'Wind', 'Sixth'],
  iconUrl: 'https://seller.example/icon.png' };
const before = structuredClone(input);
const output = sanitizeResourceSearchMetadata(input);
assert.deepEqual(output.tags, ['Weather', 'Forecast', 'Alerts', 'Maps', 'Wind']);
assert.equal(output.serviceName, input.serviceName);
assert.equal(output.iconUrl, input.iconUrl);
output.tags[0] = 'changed';
assert.deepEqual(input, before);
