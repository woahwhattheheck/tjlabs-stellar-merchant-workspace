import assert from 'node:assert/strict';
import { projectPublicGrantMarkdown } from './grant-publication-source.mjs';

const source = [
  '# Public grant reader',
  '',
  '[Review notes](https://tokenjunkielabs.slack.com/archives/C0PRIVATE/p1234567890123456)',
  '<https://chatgpt.com/space/page_private>',
  'Mail record: https://mail.google.com/mail/u/0/#inbox/private.',
  'Public source: https://developers.stellar.org/docs/learn/fundamentals.',
  'Lookalike: https://slack.com.example.invalid/private.',
  'message id `1a1234567890abcd` and thread `1a1234567890abce`',
  ''
].join('\n');

const projected = projectPublicGrantMarkdown(source);
assert.match(projected, /Review notes/);
assert.doesNotMatch(projected, /tokenjunkielabs\.slack\.com/);
assert.doesNotMatch(projected, /chatgpt\.com\/space/);
assert.doesNotMatch(projected, /mail\.google\.com\/mail/);
assert.equal((projected.match(/\[private workspace reference\]/g) ?? []).length, 2);
assert.match(projected, /Mail record: \[private workspace reference\]\./);
assert.match(projected, /https:\/\/developers\.stellar\.org\/docs\/learn\/fundamentals\./);
assert.match(projected, /https:\/\/slack\.com\.example\.invalid\/private\./);
assert.match(projected, /the original sent message and the original conversation/);
assert.equal(projectPublicGrantMarkdown(projected), projected);

process.stdout.write(JSON.stringify({
  labeledLinkPreserved: true,
  restrictedAutolinkRedacted: true,
  restrictedBareUrlRedacted: true,
  publicUrlsPreserved: true,
  lookalikeDomainPreserved: true,
  idempotent: true
}) + '\n');
