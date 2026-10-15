// SPDX-License-Identifier: MIT
// Focused offline probe for x402 Bazaar resource service-metadata soft-drop rules.
import assert from 'node:assert/strict';
import {
  isValidIconUrl,
  isValidServiceName,
  sanitizeResourceForCatalog,
  sanitizeResourceServiceMetadata,
  sanitizeTags,
} from './resource-service-metadata.mjs';

assert.equal(isValidServiceName('TJLabs Merchant'), true);
assert.equal(isValidServiceName(''), false);
assert.equal(isValidServiceName('x'.repeat(33)), false);
assert.equal(isValidServiceName('Mérchant'), false);
assert.equal(isValidServiceName('Merchant\nAdmin'), false);

assert.deepEqual(sanitizeTags([
  'Payments', 'payments', '', 'x'.repeat(33), 'Mérchant', 'Agents', 'Stellar',
  'Catalog', 'Settlement', 'ignored-after-five',
]), ['Payments', 'Agents', 'Stellar', 'Catalog', 'Settlement']);
assert.equal(sanitizeTags('Payments'), undefined);
assert.equal(sanitizeTags([7, '', 'Mérchant']), undefined);

assert.equal(isValidIconUrl('https://cdn.example.com/icons/merchant.png'), true);
for (const invalid of [
  'data:image/png;base64,abc',
  'file:///tmp/icon.png',
  'https://user@example.com/icon.png',
  'http://localhost/icon.png',
  'http://localhost.localdomain/icon.png',
  'http://ip6-localhost/icon.png',
  'http://127.0.0.1/icon.png',
  'http://[::1]/icon.png',
  'http://2130706433/icon.png',
  'http://0x7f000001/icon.png',
  'http://ｌｏｃａｌｈｏｓｔ/icon.png',
  'https://example.com/icon\n.png',
]) assert.equal(isValidIconUrl(invalid), false, invalid);

const raw = {
  url: 'https://merchant.example/pay',
  description: 'Merchant endpoint',
  mimeType: 'application/json',
  serviceName: 'Mérchant',
  tags: ['Payments', 'payments', 'Agents'],
  iconUrl: 'http://127.0.0.1/private.png',
};
assert.deepEqual(sanitizeResourceServiceMetadata(raw), { tags: ['Payments', 'Agents'] });
assert.deepEqual(sanitizeResourceForCatalog(raw), {
  url: raw.url,
  description: raw.description,
  mimeType: raw.mimeType,
  tags: ['Payments', 'Agents'],
});
assert.equal(raw.serviceName, 'Mérchant');
assert.equal(raw.iconUrl, 'http://127.0.0.1/private.png');

const valid = sanitizeResourceForCatalog({
  url: 'https://merchant.example/pay',
  serviceName: 'TJLabs Merchant',
  tags: ['Payments'],
  iconUrl: 'https://cdn.example.com/icons/merchant.png',
});
assert.deepEqual(valid, {
  url: 'https://merchant.example/pay',
  serviceName: 'TJLabs Merchant',
  tags: ['Payments'],
  iconUrl: 'https://cdn.example.com/icons/merchant.png',
});

console.log(JSON.stringify({
  validMetadataPreserved: true,
  invalidFieldsSoftDropped: true,
  tagsDeduplicatedAndLimited: true,
  unsafeIconUrlsRejected: 11,
  inputUnchanged: true,
}));
