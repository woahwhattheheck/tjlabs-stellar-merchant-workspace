import assert from 'node:assert/strict';
import { projectCompletePublicGrantSourceIndex } from './grant-source-index-publication.mjs';

const source = {
  exactPrivateUrl: 'https://tokenjunkielabs.slack.com/archives/C0PRIVATE/p1234567890123456',
  narrative: 'Review [the source case](https://tokenjunkielabs.slack.com/archives/C0PRIVATE/p1234567890123456) and https://mail.google.com/mail/u/0/#inbox/private.',
  nested: [
    { note: 'Workspace <https://chatgpt.com/space/page_private>; public https://developers.stellar.org/docs.' },
    'Lookalike https://slack.com.example.invalid/private remains public.',
  ],
  count: 7,
  ready: true,
  empty: null,
};

const projected = projectCompletePublicGrantSourceIndex(source);
assert.equal(Object.hasOwn(projected, 'exactPrivateUrl'), false);
assert.doesNotMatch(JSON.stringify(projected), /tokenjunkielabs\.slack\.com|mail\.google\.com\/mail|chatgpt\.com\/space/);
assert.equal((projected.narrative.match(/\[private workspace reference\]/g) ?? []).length, 1);
assert.match(projected.narrative, /^Review the source case and \[private workspace reference\]\.$/);
assert.match(projected.nested[0].note, /Workspace \[private workspace reference\]; public https:\/\/developers\.stellar\.org\/docs\.$/);
assert.match(projected.nested[1], /https:\/\/slack\.com\.example\.invalid\/private/);
assert.deepEqual({ count: projected.count, ready: projected.ready, empty: projected.empty }, { count: 7, ready: true, empty: null });
assert.deepEqual(projectCompletePublicGrantSourceIndex(projected), projected);

process.stdout.write(JSON.stringify({
  exactPrivateFieldDropped: true,
  embeddedPrivateNavigationRedacted: true,
  publicAndLookalikeUrlsPreserved: true,
  nonStringMetadataPreserved: true,
  idempotent: true,
}) + '\n');
