# Compare incoming merchant editions and receive the chosen version

Use **Merchant handover → Incoming editions** in the receiving Captured API
product to compare a delivered collection with its installed merchant packages.
The comparison retains complete installed and incoming plans, API declarations,
facades, compiled configuration and file identities. Exact atomic prices remain
decimal strings throughout review.

The operator chooses the installed baseline for each incoming merchant, reads
the retained changes, reviews receiving names and saves that decision as an
ordinary immutable handover draft edition. The original REVIEW, RECEIVE and
REOPEN operations then deliver the complete native sources and packages.

The same workflow is available through five edition tools within the existing
28-tool handover provider, the typed client and the original terminal. All use
the same product, saved drafts, original compilers and receiving writer.

## Start with the original delivered collection

Open the receiving product through its ordinary command or saved
**Applications → Captured API merchant** entry. Keep the original product and
projects directories.

1. Open **Merchant handover** and upload the complete .sfhandover file.
2. Finish its original upload, then run **Import**. Inspect the retained
   merchant and source collection.
3. Open the imported collection as a **RECEIVING** draft. Its source directory,
   handover manifest SHA-256 and complete incoming-name map come from the
   original completed import.
4. Save the receiving draft before comparing. Retain that draft ID and exact
   saved revision.

[HANDOVER.md](HANDOVER.md) describes full collection publication, streamed
upload, immutable source histories and native receiving. [AGENT.md](AGENT.md)
covers the same complete source-to-receiver transfer through declared product
connections.

An existing saved receiving draft is also a valid starting point. Its original
form and source spelling remain in its history. The comparison resolves that
source to the same native directory while retaining the exact authored form.

## Compare in the browser

In the saved receiving draft, open **Incoming editions**.

### Choose the installed baselines

Select **Load installed merchant choices**. For each incoming merchant, choose
the installed package to compare:

| Choice | Retained meaning |
| --- | --- |
| Default | Compare the current receiving name, or the incoming name when no explicit mapping exists |
| Named installed merchant | Compare that exact package name and its complete native file identity |
| Named slot that is absent | Retain the absence of that selected installed name |
| No installed baseline | Review the incoming merchant as a complete new edition |

The baseline and receiving destination are independent. For example, compare
incoming supplier-api with installed supplier-api-v1, then choose
supplier-api-v2 as its receiving name. Both native immutable packages remain
available to the merchant and release workflow.

Choose **Compare this saved receiving edition**. The original COMPARE job keeps
the selected draft revision, incoming manifest and installed baselines.
**Operations** retains its request and progress. Reopening a completed
comparison returns the same original snapshots.

The baseline controls apply to the next comparison. **Reset baseline choices
for next comparison** restores the default mapping without changing earlier
comparisons. A saved source change can therefore start a new complete
comparison while retaining the prior decision history.

### Read the complete differences

Select a compared merchant and page through its sections:

| Section | Original values retained and compared |
| --- | --- |
| Routes | Every selected method/path, exact atomic price, added or removed route, and changed operation fields |
| Merchant settings | Complete plan fields outside the selected route array, including payment and server configuration |
| Source | Full original OpenAPI globals and all path declarations, including shared definitions |
| Contract | Complete generated facade globals and path declarations |
| Configuration | Original selections, route bindings, upstreams, preview configuration and source revision |
| Files | Original native member names, byte counts and SHA-256 values |

Changed fields carry their full before and after values. An absent value is
distinct from an explicitly present null or empty value. Authentication,
transport, caching, availability, request/response policies and other authored
operation fields remain in the complete plan.

For a new merchant, the installed snapshot contains null and the incoming
edition supplies the complete values. For a source-only handover, the comparison
retains the collection binding and source count; the original native receiving
review covers its source histories.

Use **Download full current JSON**, **Download full incoming JSON** or
**Download full comparison JSON** to keep the complete selected JSON record.
Each download uses the original retained file reader, exact file SHA-256 and
bounded chunks. The browser checks the complete bytes before offering the file.

### Save the receiving decision

Choose each incoming merchant's receiving name in the same working form.
Select **Review selected receiving names**. This reads the original compared
source and installed baseline again, and runs the native receiving review
against the complete proposed form.

Review lists actual existing equal packages, available new names and native
source/name conflicts. Where a different immutable package already occupies a
target name, choose a new receiving name and review again.

After a READY result, select **Save reviewed receiving decision**. The saved
edition retains:

- The original comparison job and comparison SHA-256.
- The exact current draft base and complete chosen form.
- The native receiving review SHA-256.
- The original request UUID and immutable decision record.

Changing the label, name mapping, selected comparison or current draft requires
reviewing that complete choice again. The displayed previous review remains
available while the working form advances.

Select **Review this saved decision for receiving**. This starts the original REVIEW
job against that exact saved revision. Inspect its native result, then use the
existing **Receive reviewed collection** action with its original review hash.
Open the completed entry under **Received**, or start REOPEN for its retained
operation ID. Continue through the original source, worksheet, merchant and
release controls using the received package.

## Operate the same comparison through the merchant agent

Use the original workspace alias and product identity from
merchant_handover_info. Retain every UUID and full request before sending it.
Uppercase identifiers below mean actual values returned by the existing
product. Generate each new UUID once.

### Retain the original comparison

Start COMPARE after the receiving draft is saved:

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_job_start",
  "arguments": {
    "workspace": "receiver",
    "expectedProductId": "RECEIVING_PRODUCT_SHA256",
    "request": {
      "id": "COMPARE_JOB_UUID",
      "command": "COMPARE",
      "draftId": "RECEIVING_DRAFT_UUID",
      "revision": "SAVED_RECEIVING_REVISION_SHA256",
      "baselines": {
        "supplier-api": "supplier-api-v1"
      }
    }
  }
}
~~~

An empty baselines object uses the complete saved receiving map. A null value
selects no installed baseline for that incoming merchant. Keys must be incoming
package names from the original collection.

Read merchant_handover_job for the same ID, or use the original wait command
with its request SHA-256. Continue an interrupted job with
merchant_handover_job_resume and the same original request hash. Retain the
completed comparisonSha256.

Read all package pages with merchant_handover_editions:

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_editions",
  "arguments": {
    "workspace": "receiver",
    "expectedProductId": "RECEIVING_PRODUCT_SHA256",
    "id": "COMPARE_JOB_UUID",
    "view": "packages",
    "offset": 0,
    "limit": 50,
    "expectedComparisonSha256": "ORIGINAL_COMPARISON_SHA256"
  }
}
~~~

For one merchant, add its incoming name and select routes, settings, source,
contract, configuration or files. Continue offsets with the same comparison
hash. The summary view exposes the retained collection binding and package
file identities.

### Review and save the full receiving form

Read the original receiving draft's complete form before authoring a decision.
Preserve its original bundle and manifest and every intended name mapping.
The imported source directory in this example is the value returned by the
original draft; use that original value in the complete request.

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_edition_review",
  "arguments": {
    "workspace": "receiver",
    "expectedProductId": "RECEIVING_PRODUCT_SHA256",
    "id": "RECEIVING_DRAFT_UUID",
    "expectedRevision": "CURRENT_RECEIVING_REVISION_SHA256",
    "comparisonId": "COMPARE_JOB_UUID",
    "comparisonSha256": "ORIGINAL_COMPARISON_SHA256",
    "form": {
      "label": "Supplier API next merchant edition",
      "bundle": "/private/receiving-product/ORIGINAL_IMPORTED_COLLECTION",
      "manifestSha256": "ORIGINAL_HANDOVER_MANIFEST_SHA256",
      "names": {
        "supplier-api": "supplier-api-v2"
      }
    }
  }
}
~~~

Keep the complete READY response and reviewSha256. Save through
merchant_handover_edition_save with those identical arguments plus the retained
requestId and returned reviewSha256. That response identifies the ordinary
saved draft revision.

The current draft may have acquired unrelated valid edits since COMPARE.
Review uses its actual current revision and complete proposed form, preserving
the same incoming source and installed comparison. A changed installed package
or incoming collection requires a new COMPARE job for the changed originals.

If save loses its response, repeat that exact saved request before creating
another decision. The writer resolves its original immutable UUID first and
returns the saved edition even after later drafts or source activity.

Start the existing REVIEW command using the saved revision, then RECEIVE with
the original completed REVIEW job and native review SHA-256. REOPEN selects the
saved receiving operation ID. [AGENT.md](AGENT.md#complete-receiving) contains
those original request and full collection operations.

### Read complete original JSON files

Each package row lists the current, incoming and comparison file metadata.
merchant_handover_edition_file accepts:

| Field | Value |
| --- | --- |
| id | Original completed COMPARE job UUID |
| name | Original incoming package name |
| side | current, incoming or comparison |
| expectedComparisonSha256 | Original retained comparison hash |
| expectedSha256 | Selected original file hash |
| offset | Next original byte offset, initially 0 |
| limit | Chunk size from 1 to 196608 bytes |
| readId | Original retained reader ID after its first response |

Decode the returned base64 bytes and continue nextOffset until complete.
Verify the assembled byte count and SHA-256 against the selected file. A
completed read releases automatically. For an abandoned partial read, call
merchant_handover_edition_file_release with id, comparisonSha256 and readId.

The native reader holds one original file snapshot across its chunk calls.
An expired reader can reopen the same original file/hash at the retained byte
offset. The typed full-file method and terminal perform this continuation and
whole-file verification.

## Export the whole comparison from an ordinary terminal

The original terminal accepts all typed commands through remote call. The
complete export command retains every merchant and all three files:

~~~sh
starforge captured-api handover remote edition-export \
  --connection /private/handover-connections.json \
  --workspace receiver --product RECEIVING_PRODUCT_SHA256 \
  --job COMPARE_JOB_UUID \
  --comparison-sha256 ORIGINAL_COMPARISON_SHA256 \
  --directory /private/edition-review/supplier-next
~~~

The selected directory belongs to this original retained export operation.
Its publication includes:

~~~text
native-inputs/edition-index.json
native-inputs/supplier-api-current.json
native-inputs/supplier-api-incoming.json
native-inputs/supplier-api-comparison.json
~~~

Every additional selected merchant receives the same complete three-file set.
The index contains the original comparison result, product/source/draft binding
and original file metadata. Each JSON record retains its original context and
full data. The result lists all published paths, byte counts and hashes.

The terminal publishes the immutable index first. If interrupted, repeat the
exact command and output directory. It verifies existing complete files, resumes
their original publication, then fetches only missing files from the same
completed job. After all files are retained, the exact command reopens and
verifies the complete export even when the product host is stopped.

For a complete customer delivery, retain the original .sfhandover archive as
well. Its original package files, captures, immutable source reviews and native
manifests are the input to RECEIVE. The edition export supplies the full
operator review beside that original delivery.

## Use the maintained typed client

Import the source-owned client and its declarations from
handover-client.mjs. Connect with the original HAR connection and expected
product identity:

~~~js
import { openCapturedHandoverClient } from
  './products/captured-api/handover-client.mjs';

const client = await openCapturedHandoverClient(receiverDefinition, {
  expectedProductId: receivingProductId
});

try {
  const page = await client.editionComparison({
    id: comparisonId,
    view: 'packages',
    expectedComparisonSha256: comparisonSha256
  });

  const row = page.rows[0];
  const incoming = await client.downloadEditionFile({
    id: comparisonId,
    name: row.name,
    side: 'incoming',
    expectedComparisonSha256: comparisonSha256,
    expectedSha256: row.files.incoming.sha256
  });

  // incoming.content is the complete verified original Buffer.
  // Retain the entire selected form and actual current draft revision.
  const reviewed = await client.reviewReceivingDecision(decision);
  if (reviewed.state === 'READY') {
    const saved = await client.saveReceivingDecision({
      ...decision,
      requestId: retainedSaveRequestId,
      reviewSha256: reviewed.reviewSha256
    });
    // Use saved.revision for the original REVIEW job.
  }
} finally {
  await client.close();
}
~~~

receiverDefinition is the original parsed HAR workspace entry containing its
projectsDirectory and consoleUrlFile or consoleUrlEnv. [AGENT.md](AGENT.md#typed-javascript-and-typescript-client)
shows the maintained connection and client imports. The full-file method keeps one accepted
operation through every native chunk and returns the exact file identity and
Buffer. Client close drains accepted work and closes retained local file/read
owners. The original product controls its browser and merchant lifetime.

The complete comparison types are in edition-comparison.d.mts. The pure
compareCapturedMerchantEditions model is available through the installed
./products/captured-api/edition-comparison export. It accepts the complete native
snapshots described above, retaining explicit absent/present fields and decimal
price strings. Product source preparation and original native inspection
provide those snapshots.

## Recover the original work

| Event | Original continuation |
| --- | --- |
| Browser navigates to another draft | Reopen the original draft's retained Incoming editions entry and selected comparison |
| Browser displays a historical edition | Background save completion records its result while preserving that historical view |
| Comparison stops during publication | Resume the same COMPARE job and request SHA; its first complete retained snapshots remain selected |
| Installed baseline or incoming source changes | Start a new comparison for those actual originals; earlier complete comparisons remain readable |
| Receiving decision loses its reply | Repeat the identical edition-save UUID, base, comparison, form and review SHA |
| Peer saves another draft edition | Review the complete decision against the actual current draft revision; combine intended edits through the existing collaboration workbench |
| Native REVIEW stops | Continue its original saved receiving revision and retained job |
| RECEIVE loses its reply | Repeat the same original RECEIVE request; its native operation reopens completed members |
| Original delivered bundle moves after receiving | REOPEN the original receiving operation and installed native files |
| Complete comparison export stops | Repeat the exact terminal command and retained output directory |
| Product host stops after the export completes | Reopen the same complete terminal export; its original local files are verified |

[COLLABORATION.md](COLLABORATION.md) covers complete working-form exchange and
conflict choices. [OPERATING.md](OPERATING.md) connects the received merchant to
source refresh, exact pricing, reusable operator procedures, customer delivery
and the native release lifecycle.
