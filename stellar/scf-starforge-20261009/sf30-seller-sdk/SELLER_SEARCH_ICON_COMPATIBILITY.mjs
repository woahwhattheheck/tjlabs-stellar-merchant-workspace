import assert from 'node:assert/strict';
import { compileHttpSellerOffer } from './seller.mjs';
import { sanitizeResourceSearchMetadata } from '../../../scf46-stellar-bazaar/src/entry-identity.mjs';

const payment = {
  network: 'stellar:testnet', scheme: 'exact', amount: '1',
  asset: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
  payTo: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  maxTimeoutSeconds: 60,
};
const compile = iconUrl => compileHttpSellerOffer({
  url: 'https://seller.example/report', method: 'GET',
  description: 'Seller search icon compatibility', serviceName: 'Report seller',
  tags: ['report'], iconUrl, payment,
});

const source = new String('https://cdn.example/icon.svg?edition=1#mark');
const offer = compile(source.valueOf());
assert.equal(offer.resource.iconUrl, source.valueOf());
assert.equal(sanitizeResourceSearchMetadata(offer.resource).iconUrl, source.valueOf());
assert.deepEqual(offer.resource.tags, ['report']);

const mutable = {
  url: 'https://seller.example/detached', method: 'GET',
  description: 'Detached seller metadata', iconUrl: 'http://images.example/icon.png', payment,
};
const detached = compileHttpSellerOffer(mutable);
mutable.iconUrl = 'https://changed.example/icon.png';
assert.equal(detached.resource.iconUrl, 'http://images.example/icon.png');
assert.equal(sanitizeResourceSearchMetadata(detached.resource).iconUrl, detached.resource.iconUrl);

const invalid = [
  '', 'data:image/svg+xml;base64,PHN2Zy8+', 'javascript:alert(1)',
  'https://user:secret@cdn.example/icon.png', 'https://localhost/icon.png',
  'https://127.0.0.1/icon.png', 'https://2130706433/icon.png',
  'https://[::1]/icon.png', 'https://cdn.example/\u0000icon.png',
];
for (const iconUrl of invalid)
  assert.throws(() => compile(iconUrl), /iconUrl must be a safe public HTTP or HTTPS URL/);

const withoutIcon = compileHttpSellerOffer({
  url: 'https://seller.example/plain', method: 'GET',
  description: 'Offer without icon metadata', payment,
});
assert.equal(Object.hasOwn(withoutIcon.resource, 'iconUrl'), false);

console.log('seller-search-icon-compatibility: PASS');
