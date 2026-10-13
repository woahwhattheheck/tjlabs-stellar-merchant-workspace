# Complete grant review with bounded working memory

The submission and review models retain the same complete draft exports, historical editions, action chain, review choices, source identities and receiving envelopes. Existing customer work opens through the same browser, CLI and source receiving routes.

## What changed

The submission counter counts words, Unicode code points, UTF-16 units and UTF-8 bytes in one pass. It uses the same ECMAScript whitespace definition and the original UTF-8 counting rule. It does not create a full character array or split the document into retained word strings.

Review validation still verifies every original draft and every action. It stores compact edition metadata and retains at most two decoded editions in its local reader while replaying events. The shared capture cache has at most two entries with an aggregate 8 MiB serialized-content allowance. Those limits bound cache retention; they are not claims about the JavaScript process's total heap, and they do not change the 16 MiB draft or 64 MiB review receiving allowances.

Each validation call reuses already computed descriptors for the exact immutable edition, format and target. The local descriptor cache holds at most 64 entries with a 2 MiB accounting allowance for their text and metadata. Full binding bodies remain temporary. Application bindings omit excluded version-history fields before building their canonical representation, rather than cloning all historical versions and discarding them. Readiness labels do not materialize complete application bindings.

Import returns its own parsed, validated review. Export freezes the same complete JSON representation before the asynchronous hash and builds the original envelope from that representation, without an additional decoded copy of the entire round. Applying an action releases the earlier replay reader before validating the complete successor.

## Original data and output contracts

The public function names, arguments, schema names, return fields, review limits, event order and exported JSON member order are unchanged. Every received capture is still bound to its complete original bytes and SHA-256. All source Markdown byte counts, SHA-256 identities and Git blob identities are still checked. Every historical action digest, previous digest, actor, revision and target binding is replayed.

A cache hit requires the exact original export text and draft digest. Decoded drafts are owned JSON parsed inside the module and frozen before reuse. Per-call edition records retain the original capture metadata, and no cache is persisted into a customer draft or review.

An explicit receive still compares both the preceding and incoming draft. Carry-forward decisions require identical target bindings. Previously resolved changes reopen when their target or source context changes. Same-request replay preserves later work.

## Receiving and native operation

Continue the selected complete customer operation through its maintained receiving programme. A compatible runtime update must retain its original application and review inputs, source selection, operation ID and request IDs. Preserve the preceding source bytes and update the runtime's complete file manifest when selecting the corrected core.

A saved programme whose submission core predates newer product-source extensions can apply the exact counter-only change to that selected original module. Do not replace that older core with a current module unless all of the current module's declared imports are selected together. The review core can use the complete postimage when its selected preimage matches the original module.

If a previous native operation has an unknown outcome, reconcile its original process, journal and saved output before dispatching it again. This implementation changes memory allocation, not the existing operation or save-recovery interface.

## Validation boundary

The complete source changes preserve the original schema and canonical hashing algorithm. Source grammar and full preimage preservation were checked during composition. The complete saved customer operation remains the meaningful runtime validation; no successful native or browser continuation is asserted by this guide.
