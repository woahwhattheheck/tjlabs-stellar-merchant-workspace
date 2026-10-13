# Bank named source review and returned corrections

This workflow lets a named recipient inspect complete original bank source files, propose interpretation, inclusion and note changes, and return an ordered review history. The author compares that return with the actual current collection, explicitly keeps or adopts each proposed change, and prepares a new request for the original Bank source controller.

The original Bank collection, configured source controller and immutable preparation files remain authoritative. The offline recipient cannot import a statement, match a transaction, alter a balance or close an account. A submitted review is a proposal. An author decision produces a source request; the separate explicit execution of that request creates the corrected collection edition.

## Open the complete product

The installed author entry is the existing Source preparation desk under Bank statements. Select the complete original preparation and its collection output, then open named source review. The author desk preserves its configured workspace/session and original source operations.

The recipient entry is public/source-review.html. The author can deliver the generated self-contained recipient HTML, including the exact eight selected source members and the complete issued package. It uses the same domain and recipient UI without a merchant connection or financial credential.

The installed command is merchant-accounting-bank-source-review. Its module is stellar-forge/mcp-merchant-operator/accounting-bank-source-review-cli.mjs. The typed client is exported from ./merchant/accounting-bank-source-review; the pure domain is exported from ./merchant/bank-statements/source-review. The CLI uses the same pure domain as both desks and delegates source receiving/execution to accounting-bank-sources-cli.mjs. There is no alternate collection-edit implementation.

Open and use the exact recipient HTML, reports, working JSON and original attachments under the full owner instruction below before describing them as ready. Source-only checks and package creation do not establish rendered/native acceptance. The existing DFF77/Bank receiving owner continues the original course; this addition starts no second programme.

## Identity and authority

| Record | Retained identity and content |
| --- | --- |
| Preparation capsule | Original workspace, preparation UUID, request digest, operating-source digest, COMPLETE receipt and every receipt member with complete bytes and SHA-256 |
| Issued review | Author, named recipient, instructions, review UUID/time, exact capsule and collection ID/revision/file pin |
| Recipient edition | Full ordered history, issue digest, prior edition digest, reviewer, UUID/time, status, summary and every original item |
| Current source | Complete current capsule for the same original workspace and collection, with exact revision and file identity |
| Author comparison | Issued/current/proposed mapping, inclusion and note; conflict/adoption eligibility; current added item IDs |
| Author decision | Exact comparison digest, explicit choices, author/reason, decision UUID/time and exact new collection-edit request UUID/body |
| Forwarded operation | Original endpoint/workspace alias and token-variable name, unchanged request, same request/preparation UUID and full operation history |
| Corrected result | Original controller receipt and complete immutable files, including corrected collection and source reports |

Workspace identity is the original 64-character SHA-256 binding. Collection, item, issue, edition, decision and request identities are UUIDs. A configured workspace alias selects the existing connection and does not replace the identity inside the request.

Digests bind complete bytes/history. The named-recipient field records intended attribution; it is not a digital signature or independent identity verification. Use the existing authorized delivery channel for the named recipient.

## Supported sources and capacity

The selected maintained collection model accepts OFX, QFX, CSV and CAMT053 interpretations. It explicitly rejects PDF collections and directs them to the dedicated PDF working-copy desk. This workflow does not claim PDF inclusion/note adoption or supply a replacement PDF validator. PDF_SOURCE_NOT_READY retains the full original and directs the operator to that existing desk.

A capsule is the entire preparation inventory: request, intent, original inputs, reports, collection output and result. No file is removed to make a review fit.

| Complete object | Limit |
| --- | ---: |
| Issued/current capsule selected for review | 32 MiB |
| Issued/returned review package, including originals and every edition | 64 MiB |
| Complete browser working record | 256 MiB |
| CLI issued/returned/current/decision context including binding | 256 MiB |
| Recipient editions | 100 |
| Original collection items | 1,000 |
| Interpretation object | Original 131,072-character JSON boundary; original validator remains authoritative |

These are whole serialized object limits. Base64 and history consume space. A 32 MiB capsule does not mean 32 MiB of raw attachments plus reports fit. Capture computes encoded size and verifies the final serialized capsule. Larger preparations remain available through the original complete source receiver; this command rejects them without shortening them.

The original source request retains its 8,000,000-byte limit. Original file/collection/controller limits also apply. Before forwarding, the installed client checks that the complete decision is expressible as the exact maintained collection_edit request.

## Author: issue the original

Start from a COMPLETE preparation. Select its actual collection output, normally collection.json, inspect the full inventory, and name the reviewer and instructions. Choose an issue UUID/time once and retain the issued original.

The browser author desk retains the entire capsule. Its review records use a workspace/origin/review-ID namespace and the original atomic IndexedDB compare-and-save mechanism. The original Source preparation desk namespace remains separate. Another tab cannot silently replace a newer whole record.

For an installed operator/customer agent, capture downloads every actual receipt member with the maintained complete-file reader and rereads the receipt to ensure the preparation stayed unchanged:

~~~sh
merchant-accounting-bank-source-review capture \
  --url https://merchant.example/mcp --workspace customer-bank \
  --preparation 11111111-1111-4111-8111-111111111111 \
  --out /private/bank-review/current-capsule.json
~~~

The endpoint and IDs in these examples are placeholders; select the actual configured connection and original records. Tokens stay in MCP_ACCESS_TOKEN or --token-env NAME. Never put credentials in URLs, source JSON or command-line token arguments.

Issue locally with the UUID and UTC timestamp retained by the original work item:

~~~sh
merchant-accounting-bank-source-review issue \
  --capsule /private/bank-review/current-capsule.json \
  --name current-capsule.json --collection-file collection.json \
  --author "Account owner" --recipient "Named statement reviewer" \
  --purpose "Review source interpretation and explain each proposed correction." \
  --id 22222222-2222-4222-8222-222222222222 \
  --at 2026-10-13T12:00:00.000Z \
  --out /private/bank-review/issued-review.json
~~~

Issue performs no provider call. Rerun with the same identity/time only to reopen identical bytes. A different edition needs an explicitly selected new output; the issued original is never overwritten.

## Recipient: inspect, edit, save and return

Open the exact delivered recipient HTML or installed page. Choose the full issued review JSON and explicitly receive it. Verify reviewer, instructions, collection identity, preparation and whole source inventory.

Open/download the complete originals. Inspect mapping, inclusion and note for each relevant file; excluded items remain visible and retained. Explain proposals in comments. Apply complete raw mapping text before saving an edition. Unapplied text remains a draft and cannot silently become a submitted interpretation.

Save an unfinished draft edition or a submitted edition explicitly. Both retain every original and the full ordered history. Only a submitted edition can support an author decision. Download the full return and reopen it to confirm the intended edition and all originals.

Download a complete working record to preserve unfinished editor state too. Explicit working-record receiving adopts all validated source/history/draft fields, records original origin/revision/digest and archives a different existing current record whole before adoption. It avoids recursively embedding the incoming working JSON in itself, so a valid maximum-size record can reopen. If a save fails or another tab has advanced the record, retain the full rescue export before resolving the conflict. Do not clear the original draft to hide an error.

The CLI uses the same domain:

~~~sh
merchant-accounting-bank-source-review inspect --file /private/bank-review/issued-review.json
merchant-accounting-bank-source-review draft \
  --review /private/bank-review/issued-review.json \
  --out /private/bank-review/reviewer-draft.json
~~~

Edit the complete draft in an ordinary editor or customer agent. Keep reviewer, baseEditionSha256, all item IDs and full interpretations. Allowed item fields are exactly id, mapping, included, note and comment. Set rawMapping to null only after the intended complete interpretation has actually been applied.

~~~sh
merchant-accounting-bank-source-review edition \
  --review /private/bank-review/issued-review.json \
  --draft /private/bank-review/reviewer-draft.json \
  --status submitted \
  --id 33333333-3333-4333-8333-333333333333 \
  --at 2026-10-13T12:15:00.000Z \
  --out /private/bank-review/reviewer-return.json
~~~

Append another edition from the full prior return and a draft based on that actual head. An older draft on a different head fails; history is never reset.

## Author: compare the returned proposals with current work

A return does not replace the current collection. Capture the actual current COMPLETE preparation for the same original collection/workspace and preserve its full capsule beside the issued and returned files.

Select a submitted edition by its actual SHA-256:

~~~sh
merchant-accounting-bank-source-review compare \
  --issued /private/bank-review/issued-review.json \
  --returned /private/bank-review/reviewer-return.json \
  --current /private/bank-review/current-author-capsule.json \
  --edition ACTUAL_SUBMITTED_EDITION_SHA256 \
  --out /private/bank-review/comparison.json
~~~

The comparison shows issued/current/proposed values. A conflict means the current author changed the same field and the reviewer proposes a different value. A proposal already matching current still needs an explicit choice but needs no duplicate patch. Current added items and unrelated changes remain intact.

Adoption is blocked if the original item is missing or its complete original file changed. Keeping current remains possible. A different workspace/collection or an older current revision is rejected. These checks do not merge financial imports or substitute new source files.

Create a private selection JSON containing every proposed changed-field key:

~~~json
{
  "collectionFile": "collection.json",
  "editionSha256": "ACTUAL_SUBMITTED_EDITION_SHA256",
  "expectedComparisonSha256": "ACTUAL_COMPLETE_COMPARISON_SHA256",
  "choices": {
    "ORIGINAL_ITEM_UUID:included": "keep",
    "ORIGINAL_ITEM_UUID:note": "adopt"
  },
  "actor": "Account owner",
  "reason": "Keep current inclusion; adopt the reviewer explanation.",
  "id": "44444444-4444-4444-8444-444444444444",
  "requestId": "55555555-5555-4555-8555-555555555555",
  "createdAt": "2026-10-13T12:30:00.000Z"
}
~~~

Replace placeholder hashes/item keys with observed values. Preserve the two selected UUIDs and timestamp in this original file. The CLI requires them rather than creating a new identity on replay.

~~~sh
merchant-accounting-bank-source-review decide \
  --issued /private/bank-review/issued-review.json \
  --returned /private/bank-review/reviewer-return.json \
  --current /private/bank-review/current-author-capsule.json \
  --selection /private/bank-review/author-selection.json \
  --out /private/bank-review/author-decision.json
~~~

The domain recomputes the full comparison and validates the proposed whole collection through the original engine. Different comparison bytes require a deliberate new comparison. Every proposed changed field requires keep/adopt.

An all-keep or already-current decision has REVIEW_CLOSED_WITHOUT_EDIT and no new request. Otherwise EDIT_REQUEST_DRAFT carries the original chosen request UUID and collection_edit body, referencing the current preparation's immutable collection output and exact expectedRevision. Reviewer files never become financial records automatically.

## Retain, reconcile and explicitly forward

Use owner-controlled 0700 directories and 0600 source/output files. The CLI rejects symlinks, other owners and public permissions for these records.

Retain all four complete inputs and the configured connection locally:

~~~sh
merchant-accounting-bank-source-review retain \
  --issued /private/bank-review/issued-review.json \
  --returned /private/bank-review/reviewer-return.json \
  --current /private/bank-review/current-author-capsule.json \
  --decision /private/bank-review/author-decision.json \
  --dir /private/bank-review/forwarding \
  --url https://merchant.example/mcp --workspace customer-bank
~~~

This performs no provider call. It verifies the decision against all complete inputs and validates the exact maintained request. The forwarding record retains all original decision/request identities. Unknown or differing bytes remain untouched.

~~~sh
merchant-accounting-bank-source-review inspect-retained --dir /private/bank-review/forwarding
merchant-accounting-bank-source-review forward --dir /private/bank-review/forwarding
~~~

Inspect-retained is fully local/read-only. Forward defaults to reconcile: original request lookup with no source preparation/execution.

The CLI prepares the original retained operation in a private unpublished staging directory before selecting it. A process loss during this local stage cannot have a provider effect. A complete staged operation is adopted with its original body; incomplete owned attempts remain intact before preparing the same request. Once published, the original operation is reopened.

Receive original pinned input without executing the transformation:

~~~sh
merchant-accounting-bank-source-review forward \
  --dir /private/bank-review/forwarding --mode retain
~~~

Execute the source transformation explicitly:

~~~sh
merchant-accounting-bank-source-review forward \
  --dir /private/bank-review/forwarding --mode execute
~~~

Both delegate to the unchanged operation: original lookup first; exact prepare for NOT_FOUND/RETAINING; execute only PREPARED; reuse COMPLETE. Lost replies are reconciled by original ID/body, never a replacement request. A changed source/revision leaves the original failed operation retained; make a new explicit comparison/decision.

The maintained exclusive file lease preserves an active owner. A busy lease is not an invitation to remove the lock, infer safety from a PID or create a second forwarding directory.

COMPLETE here means a corrected source collection and reports. Statement import, matching, receipt application and account close remain separate original Bank workflows.

## Download and use the whole result

~~~sh
merchant-accounting-bank-source-review download \
  --dir /private/bank-review/forwarding \
  --out /private/bank-review/corrected-result
~~~

This uses the original whole-inventory download: every receipt member, full size/SHA checks, owned file-read cleanup, final COMPLETE receipt reread, export marker and preparation receipt. Reopen the corrected collection in the original desk and inspect accepted/retained fields, originals and reports. Keep the author decision beside the review history.

An all-keep decision has no new preparation. Use the already retained current capsule; the command declines to fabricate a result. A source result is not financial posting or target-native acceptance.

## Customer-agent interface

The typed client exposes the same issue/draft/edition/preview/decision verification functions. captureBankSourceReviewCapsule borrows the existing configured client; the caller disconnects it after its owned work. verifyBankSourceReviewForward accepts complete issued/returned/current bytes plus the decision, recomputes it and checks the exact maintained request without contacting a provider.

The retained CLI module exports:

- retainBankSourceReviewForward: retain full context and connection locally.
- inspectBankSourceReviewForward: inspect the full local context.
- forwardBankSourceReview: default reconcile; explicit retain/execute.
- downloadBankSourceReviewResult: download the whole original result.

A provided client must match the retained endpoint/workspace. The maintained operation validates that binding. Credentials remain in the environment/existing client. There are no new MCP tool names or a replacement source engine. The existing command/contribution/export inventory includes all three complete operator leaves.

## Recovery and original receiving

| Observed state | Continue the original work |
| --- | --- |
| Interrupted context retention | Rerun retain with exact files/target; identical files adopted, differing originals preserved |
| Interrupted local operation preparation | Adopt complete owned staging or retain incomplete attempt before preparing the same request |
| Lost prepare/execute reply | Reconcile original directory/request and preserve its actual lookup/history |
| RETAINING | Explicit retain/execute resumes exact original input receiving |
| COMPLETE replay | Reuse the original receipt and full immutable inventory |
| Stale comparison | Preserve old decision; compare actual current capsule and make a new explicit decision |
| Existing different output | Preserve it and select a distinct destination |
| Concurrent tab/process | Preserve conflict/rescue record; reconcile original owner rather than clearing history |
| PDF rejected | Keep the original and use dedicated PDF working-copy desk |
| Whole capacity exceeded | Keep every byte; use original full receiver or a separately scoped original collection |

The original receiving course should operate a named issue, draft/submitted return, concurrent current-field conflict, explicit keep/adopt, original collection_edit, complete output download and independent reopen. Keep issued/current/returned files complete. At desktop and narrow widths, inspect actual author/recipient screens, raw mapping controls, originals, recovery/error states, return JSON, self-contained HTML and working reopen. View screenshots that are captured. Continue within the original Bank course and repair concrete issues there.

## Readiness boundary

Pure source/domain checks establish only the actual original-mapping/history/request paths they execute. They do not establish browser rendering, offline file behavior, native filesystem receiving or financial outcomes. Record those results after the exact outgoing edition is actually operated and inspected. Do not add another programme or review queue to this source integration.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

