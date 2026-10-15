// SPDX-License-Identifier: MIT
// Focused offline probe for x402 Bazaar canonical catalog URLs.
import assert from 'node:assert/strict';
import { BazaarCatalog, validateCatalogEntry } from './src/catalog.mjs';
import { projectCatalogSearchEntry } from './src/entry-identity.mjs';

const offer = ({ url, type = 'http', method = 'GET', toolName, routeTemplate, description = url }) => ({
  resource: { url, description, mimeType: 'application/json' },
  accepts: [{ network: 'stellar:pubnet', scheme: 'exact', payTo: 'GSELLER', asset: 'USDC' }],
  extensions: {
    bazaar: {
      ...(routeTemplate === undefined ? {} : { routeTemplate }),
      info: { input: type === 'mcp'
        ? { type, toolName, inputSchema: { type: 'object' } }
        : { type, method } },
      schema: { type: 'object' }
    }
  }
});

const catalog = new BazaarCatalog();

const firstStatic = catalog.insertValidated(offer({
  url: 'https://seller.example/weather?city=SF#hourly',
  description: 'San Francisco weather'
}));
const correctedStatic = catalog.insertValidated(offer({
  url: 'https://seller.example/weather?city=NY#daily',
  description: 'Canonical weather'
}));
assert.equal(firstStatic, correctedStatic);
assert.equal(catalog.size, 1);
assert.equal(catalog.list().resources[0].resource.url, 'https://seller.example/weather');
assert.equal(catalog.list().resources[0].resource.description, 'Canonical weather');

const dynamicA = catalog.insertValidated(offer({
  url: 'https://seller.example/users/123?view=summary#top',
  routeTemplate: '/users/:userId'
}));
const dynamicB = catalog.insertValidated(offer({
  url: 'https://seller.example/users/456?view=full#bottom',
  routeTemplate: '/users/:userId'
}));
assert.equal(dynamicA, dynamicB);
assert.equal(catalog.size, 2);
assert.equal(catalog.list().resources.find(row => row.resource.url.includes('/users/')).resource.url,
  'https://seller.example/users/:userId');

const mcpA = catalog.insertValidated(offer({
  url: 'https://seller.example/mcp?session=one#tools', type: 'mcp', toolName: 'lookup'
}));
const mcpB = catalog.insertValidated(offer({
  url: 'https://seller.example/mcp?session=two#other', type: 'mcp', toolName: 'lookup'
}));
const mcpOther = catalog.insertValidated(offer({
  url: 'https://seller.example/mcp?session=three', type: 'mcp', toolName: 'quote'
}));
assert.equal(mcpA, mcpB);
assert.notEqual(mcpA, mcpOther);

const post = catalog.insertValidated(offer({
  url: 'https://seller.example/weather?city=LA', method: 'POST'
}));
assert.notEqual(post, correctedStatic);

const fallback = validateCatalogEntry(offer({
  url: 'https://seller.example/orders/123?expand=all#receipt',
  routeTemplate: '/../poison'
}));
assert.equal(fallback.entry.resource.url, 'https://seller.example/orders/123');
assert.equal(Object.hasOwn(fallback.entry.extensions.bazaar, 'routeTemplate'), false);

const mismatchCatalog = new BazaarCatalog();
const matched = mismatchCatalog.insertValidated(offer({
  url: 'https://seller.example/users/456?view=full', routeTemplate: '/users/:userId'
}));
const mismatched = mismatchCatalog.insertValidated(offer({
  url: 'https://seller.example/orders/123?view=full', routeTemplate: '/users/:userId'
}));
assert.notEqual(matched, mismatched);
assert.equal(mismatchCatalog.size, 2);
const mismatchRow = mismatchCatalog.list().resources.find(row => row.resource.url.includes('/orders/'));
assert.equal(mismatchRow.resource.url, 'https://seller.example/orders/123');
assert.equal(Object.hasOwn(mismatchRow.extensions.bazaar, 'routeTemplate'), false);

assert.throws(() => validateCatalogEntry(offer({
  url: 'https://seller.example/%252e%252e/admin?x=1#ignored'
})), /RESOURCE_PATH_DOT_SEGMENT/);
assert.throws(() => validateCatalogEntry(offer({
  url: 'https://seller.example/weather#bad fragment'
})), /RESOURCE_URL_UNSAFE_CHAR/);
assert.throws(() => validateCatalogEntry(offer({
  url: `https://seller.example/weather#${'a'.repeat(4096)}`
})), /RESOURCE_URL_TOO_LONG/);

for (const [candidate, expectedURL] of [
  [offer({ url: 'https://seller.example/weather?city=SF#hourly' }), 'https://seller.example/weather'],
  [offer({ url: 'https://seller.example/users/999?view=full#top', routeTemplate: '/users/:userId' }),
    'https://seller.example/users/:userId'],
  [offer({ url: 'https://seller.example/mcp?session=four#tools', type: 'mcp', toolName: 'lookup' }),
    'https://seller.example/mcp']
]) {
  const projected = projectCatalogSearchEntry(candidate);
  assert.equal(projected.entry.resource.url, expectedURL);
  assert.equal(projected.id, validateCatalogEntry(candidate).id);
}

assert.equal(catalog.size, 5);
console.log(JSON.stringify({
  static: correctedStatic,
  dynamic: dynamicA,
  mcp: [mcpB, mcpOther],
  post,
  rows: catalog.size,
  urls: catalog.list().resources.map(row => row.resource.url)
}));
