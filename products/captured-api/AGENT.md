# Complete merchant handover through the agent and terminal

The captured product's merchant agent can prepare, publish, transfer and receive
an entire reviewed collection. It uses the browser's saved draft editions,
original native jobs, exact archive bytes and receiving operations. A completed
transfer contains the selected merchant packages, source captures, both members
of each refresh, and all retained immutable reviews.

The twenty-eight `merchant_handover_*` tools are a source-owned companion of the
existing HAR workspace connection. Existing product setup and connection files
remain the starting point. The browser, agent, terminal and native handover CLI
all reach the original compilers and state writers.

## Connect the original products

Open the source and receiving products through their existing
`captured-api open` commands or saved **Applications → Captured API merchant**
entries. Keep their original private product/project directories. The product's
**Merchant handover** page and its authenticated API belong to the same session.

The default initialized merchant declares one workspace, `merchant`, in
`har-connections.json`. A merchant agent can work with every original workspace
already declared in that file. For direct transfer, its connection must also
declare the receiving product. Add that alias while preserving the complete
existing entries and their file/import/destination handles.

A separate private connection file can also select two existing products for
the terminal. It uses the original HAR schema:

~~~json
{
  "schema": "stellar-forge.har-workspace-connection.v1",
  "workspaces": {
    "source": {
      "label": "Original source merchant",
      "projectsDirectory": "/private/source-product/projects",
      "consoleUrlFile": "/private/source-product/console-url.txt"
    },
    "receiver": {
      "label": "Receiving merchant",
      "projectsDirectory": "/private/receiving-product/projects",
      "consoleUrlFile": "/private/receiving-product/console-url.txt"
    }
  }
}
~~~

Use the actual canonical private project paths and original private console URL
references. For receiving into another product, use its own product/project
directory. If Applications manages a product, review its updated connection
configuration through the existing saved application before the next start.

`merchant_handover_workspaces` lists the declared aliases.
`merchant_handover_info` opens one original connection and returns its
`productId`, project directory and active native job IDs. Select that exact
identity as `expectedProductId` on subsequent calls. Each accepted operation
keeps one original local URL/token and product binding for its whole lifetime.
The next operation rereads the original URL reference after a normal restart.

## The complete operating sequence

| Stage | Original operations and selection |
| --- | --- |
| Select the source | `info`, then all relevant `inventory` pages; keep package manifest SHA-256 values and capture/refresh review revisions |
| Save the collection | `draft_create` with kind `OUTGOING`, then `selection_save` with the complete selection and exact draft base revision |
| Prepare and review | `job_start` command `PREPARE` against the saved draft revision; use `job` and `document` pages to inspect the completed native review |
| Publish the collection | `job_start` command `PUBLISH`, selecting the completed PREPARE job and its exact `reviewSha256` |
| Transfer the whole file | `archive`, then `transfer` with source/receiving product identities, complete file bytes/SHA and one retained upload UUID |
| Open the received collection | `job_start` command `IMPORT` for the COMPLETE upload; inspect its original manifest through `document` |
| Save receiving names | `draft_create` with kind `RECEIVING`, then `receiving_save` using that IMPORT job, exact manifest and complete name map |
| Review the target | `job_start` command `REVIEW` against the saved receiving draft revision; page package/source/name results and resolve any actual conflict |
| Receive and operate | `job_start` command `RECEIVE` with the exact REVIEW job/hash; reopen the original saved merchant through `merchant_har_load` |
| Continue after restart | `received`, then `job_start` command `REOPEN` with its native `operationId`; the original source/package inspector reopens those received files |

The table abbreviates the common `merchant_handover_` tool prefix.
Every mutation uses a retained UUID. Save that ID and complete request before
sending it. A repeated save or job start reaches the same original native
operation, including after the first response is lost.

### Preserve complete selections

Outgoing selections name each saved package with its exact native
`manifestSha256`. Additional sources use `{kind,id,revision?}`. Source identity
and immutable review revision are independent of a package's mutable form.

Read the full saved form with `merchant_handover_draft` and
`view: "form"` before authoring a new complete selection. Keep all intended
packages and sources. The save selects `expectedRevision` and has its own
`requestId`. A later draft edit does not retarget an already retained job.

Inventory pages include a snapshot SHA. Continue the same snapshot across row
kinds and offsets. If the current inventory advances, reopen the first page or
use the already saved draft revision. Historical draft form pages stay bound to
their original edition while the current working draft advances.

A receiving name map addresses original package names. Omitted mappings retain
the original name. Explicit mappings choose each complete receiving name.
The native review reports existing equal packages, new packages, preserved or
merged reviews, and actual name/source conflicts.

## Compare the incoming edition before receiving

The existing receiving draft can retain a complete installed/incoming
comparison before its native receiving review:

| Stage | Original operation |
| --- | --- |
| Select the installed baselines | COMPARE through job_start with the saved receiving draft/revision and complete baselines map |
| Inspect exact changes | editions pages for routes, prices, settings, original source, facade, compiled configuration and native files |
| Review the chosen receiving version | edition_review with the full receiving form, actual draft base and original comparison hash |
| Save the complete decision | edition_save with the exact READY review and original request UUID |
| Receive the selected edition | Original REVIEW against the saved revision, then RECEIVE and REOPEN |
| Retain the full operator review | edition_file/edition_file_release or terminal edition-export for every complete original snapshot |

The table uses the common merchant_handover_ prefix. Comparison selects the
installed baseline independently from the receiving name, so an existing
merchant can remain available while the incoming version receives its own
native package name. The ordinary receiving writer retains source histories,
complete prices, plans and compiled bytes.

The [complete incoming-edition guide](EDITIONS.md) supplies full browser,
merchant-tool, typed-client and terminal examples, exact file acquisition and
saved-request recovery. The five edition tools join the original 23 handover
and draft-collaboration tools in the same provider.

## Ordinary terminal commands

Use the existing installed entrypoint:

~~~sh
starforge captured-api handover remote catalog

starforge captured-api handover remote call \
  --connection /private/handover-connections.json \
  --request /private/commands/source-info.json \
  --result /private/command-results/source-info
~~~

From a complete source checkout, the same entrypoint is:

~~~sh
node products/captured-api/handover-cli.mjs remote --help
~~~

The private command file is a complete typed tool request:

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_info",
  "arguments": {
    "workspace": "source"
  }
}
~~~

Use the exact returned identifiers below; uppercase values stand for those
returned original values. Generate each UUID once and retain it with the
complete command. The native catalog lists every field and size limit.

An outgoing draft creation and complete selection use separate original IDs:

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_draft_create",
  "arguments": {
    "workspace": "source",
    "expectedProductId": "SOURCE_PRODUCT_SHA256",
    "id": "OUTGOING_DRAFT_UUID",
    "kind": "OUTGOING",
    "label": "Reviewed supplier merchant"
  }
}
~~~

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_selection_save",
  "arguments": {
    "workspace": "source",
    "expectedProductId": "SOURCE_PRODUCT_SHA256",
    "id": "OUTGOING_DRAFT_UUID",
    "requestId": "SELECTION_SAVE_UUID",
    "expectedRevision": "DRAFT_REVISION_SHA256",
    "label": "Reviewed supplier merchant",
    "packages": [
      {
        "name": "supplier-api",
        "manifestSha256": "ORIGINAL_PACKAGE_MANIFEST_SHA256"
      }
    ],
    "sources": [
      {
        "kind": "refresh",
        "id": "ORIGINAL_REFRESH_ID",
        "revision": "ORIGINAL_SAVED_REVIEW_SHA256"
      }
    ]
  }
}
~~~

The next job uses the saved selection revision:

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_job_start",
  "arguments": {
    "workspace": "source",
    "expectedProductId": "SOURCE_PRODUCT_SHA256",
    "request": {
      "id": "PREPARE_JOB_UUID",
      "command": "PREPARE",
      "draftId": "OUTGOING_DRAFT_UUID",
      "revision": "SAVED_SELECTION_REVISION_SHA256"
    }
  }
}
~~~

A native job can return `RUNNING` while its retained writer continues.
Read the same job or wait for its exact request:

~~~sh
starforge captured-api handover remote wait \
  --connection /private/handover-connections.json \
  --workspace source --product SOURCE_PRODUCT_SHA256 \
  --job PREPARE_JOB_UUID --request-sha256 ORIGINAL_REQUEST_SHA256
~~~

After inspecting the completed review, start `PUBLISH` with a new job UUID,
`sourceJob: PREPARE_JOB_UUID` and the exact returned `reviewSha256`.
Keep the completed publication's original archive bytes/SHA.

### Complete direct transfer

~~~sh
starforge captured-api handover remote transfer \
  --connection /private/handover-connections.json \
  --workspace receiver --product RECEIVING_PRODUCT_SHA256 \
  --from-workspace source --from-product SOURCE_PRODUCT_SHA256 \
  --job PUBLISH_JOB_UUID \
  --file-sha256 ORIGINAL_ARCHIVE_SHA256 --file-bytes ORIGINAL_ARCHIVE_BYTES \
  --upload-id ORIGINAL_UPLOAD_UUID \
  --result /private/command-results/collection-transfer
~~~

The transfer reads the original source file in native authenticated byte ranges
and appends those bytes to the original receiving upload. It carries one chunk
at a time, up to 1 MiB, and finishes the receiving whole-file SHA-256. It returns
the source product/job/archive identity and receiving product/COMPLETE upload.

If the operation stops, repeat the exact command and result directory. A
retained partial chunk is finished from the same original source slice before
the transfer advances. The completed upload UUID then selects the native
`IMPORT` job.

### Move the same file through another host

Download the complete source file to a retained local directory:

~~~sh
starforge captured-api handover remote download \
  --connection /private/handover-connections.json \
  --workspace source --product SOURCE_PRODUCT_SHA256 \
  --job PUBLISH_JOB_UUID \
  --file-sha256 ORIGINAL_ARCHIVE_SHA256 --file-bytes ORIGINAL_ARCHIVE_BYTES \
  --directory /private/complete-handover-file \
  --result /private/command-results/collection-download
~~~

Move the returned whole `.sfhandover` file and its exact bytes/SHA to the
receiving host, then use that host's original connection:

~~~sh
starforge captured-api handover remote upload \
  --connection /private/receiving-connection.json \
  --workspace receiver --product RECEIVING_PRODUCT_SHA256 \
  --file /private/incoming/collection.sfhandover \
  --file-sha256 ORIGINAL_ARCHIVE_SHA256 --file-bytes ORIGINAL_ARCHIVE_BYTES \
  --upload-id ORIGINAL_UPLOAD_UUID \
  --result /private/command-results/collection-upload
~~~

A completed terminal download reply reopens its original retained file through
the native held-file verifier, even after the source console has stopped.
Download uses the same original resumable upload publisher locally. Upload
holds the selected original file descriptor, verifies its complete identity,
and transfers the original slices. Both preserve exact bytes across restart.

### Complete receiving

Start `IMPORT` in the receiving workspace using its COMPLETE upload UUID.
Retain the completed import job and returned handover manifest SHA. Create a
`RECEIVING` draft, then save its full name selection:

~~~json
{
  "schema": "stellar-forge.captured-handover-command.v1",
  "tool": "merchant_handover_receiving_save",
  "arguments": {
    "workspace": "receiver",
    "expectedProductId": "RECEIVING_PRODUCT_SHA256",
    "id": "RECEIVING_DRAFT_UUID",
    "requestId": "RECEIVING_SAVE_UUID",
    "expectedRevision": "RECEIVING_DRAFT_REVISION_SHA256",
    "label": "Received supplier merchant",
    "importJob": "IMPORT_JOB_UUID",
    "expectedManifestSha256": "ORIGINAL_HANDOVER_MANIFEST_SHA256",
    "names": {
      "supplier-api": "received-supplier-api"
    }
  }
}
~~~

The native imported collection supplies the source path. The agent tool selects
that retained import and never accepts a caller-provided filesystem source
directory.

Start `REVIEW` against the saved receiving draft revision. Read the full native
package/source results through `merchant_handover_job` views. For a name
conflict, author a new complete receiving form from the saved base and review
that new revision. Original receiving source histories are preserved.

Start `RECEIVE` with the exact completed REVIEW job and review SHA. The native
receiver adopts missing immutable source reviews and publishes the original
merchant packages under the reviewed names. Reopening the same receiving
operation preserves later receiving-only reviews. Use `merchant_har_load` with
the receiving workspace and saved package name to continue the original merchant
plan, route worksheet and captured source.

## Typed JavaScript and TypeScript client

The installed package exposes complete source and type declarations:

~~~js
import {openCapturedHandoverClient} from
  '@tokenjunkielabs/starforge-merchant/products/captured-api/handover-client';
import {MerchantCapturedHandovers} from
  '@tokenjunkielabs/starforge-merchant/products/captured-api/handover-agent';
~~~

From a source checkout, import those same modules under
`products/captured-api/`. The client accepts an original parsed HAR workspace
definition and an optional environment object. It verifies the original private
console and configured project directory before returning a pinned client.

~~~js
const source = await openCapturedHandoverClient(sourceDefinition, {
  expectedProductId: selectedSourceProductId
});
const receiver = await openCapturedHandoverClient(receiverDefinition, {
  expectedProductId: selectedReceivingProductId
});
try {
  const archive = await source.archive({
    id: publishedJobId,
    expectedSha256: publishedArchiveSha256,
    expectedBytes: publishedArchiveBytes
  });
  const transfer = await source.transferTo(receiver, {
    id: archive.id,
    expectedSha256: archive.sha256,
    expectedBytes: archive.bytes,
    uploadId: retainedUploadId
  });
  const importJob = await receiver.json('/jobs/start', {
    id: retainedImportJobId,
    command: 'IMPORT',
    uploadId: transfer.destination.upload.id
  });
  // Read the same native import job, then use its exact manifest in the
  // receiving draft, REVIEW and RECEIVE requests described above.
} finally {
  await Promise.all([source.close(), receiver.close()]);
}
~~~

| Client operation | Input/result |
| --- | --- |
| `openCapturedHandoverClient` | Original workspace definition and optional environment/expected product; returns one pinned client with its immutable `info` snapshot |
| `json` | Relative original handover route, optional native JSON body and request signal/timeout options |
| `archive` | Original PUBLISH job ID and exact file bytes/SHA → handover/manifest/file identity |
| `readArchive` | Exact archive, byte offset and limit → original `Buffer` from a validated native Range response |
| `transferTo` | Receiving pinned client, exact source archive and retained upload ID → both product identities and the original COMPLETE upload |
| `uploadFile` | Original file path/bytes/SHA and retained upload ID → held original source and complete remote upload |
| `downloadFile` | Exact published archive, private local directory and optional retained download ID → original local completed upload/file |
| `editionComparison` | Original COMPARE job/hash and selected section → retained installed/incoming change pages |
| `reviewReceivingDecision` / `saveReceivingDecision` | Exact current draft, comparison and complete receiving form → original READY review and saved draft edition |
| `readEditionFile` / `releaseEditionFile` | Exact comparison/file hashes and retained reader ID → bounded original file chunks and explicit partial-read release |
| `downloadEditionFile` | Original current/incoming/comparison file selection → full verified original `Buffer` |
| `close` | Stop admission, drain accepted transfers and finish owned file handles |

The typed agent class accepts the existing
`{harWorkspaces: parsedOriginalConnection}` configuration and exposes the same
twenty-eight typed `call(name, arguments)` operations. Its declaration keeps the
discriminated native job requests and complete selection fields.

## Retained state and recovery

| Event | Continue the original operation |
| --- | --- |
| Draft save response is lost | Replay the same complete form, original `requestId` and expected base revision |
| Another editor saves a later draft | Read that edition, preserve the current complete form, then save a new request against the chosen current base |
| Job start response is lost | Repeat the exact original job request and UUID |
| A job returns INTERRUPTED | Inspect its actual native error, correct the source issue and use `job_resume` with the same request SHA |
| File upload stops within a chunk | Reuse the same source/file hash/size/upload ID; the native uploader finishes that exact retained chunk |
| The browser restarts on another port | A new client operation reads the same original private URL reference |
| A terminal result already exists | The exact original command reopens its first saved reply; use a separate job read/wait for current progress |
| The receiving product restarts | Select the original receiving `operationId` and run native REOPEN |
| Stop arrives during transfer | The original provider and both clients drain accepted work and finish their own file handles before the product closes its native sessions |

Original browser/file APIs retain their existing shapes. Agent pages are
projections of those same records. The authenticated archive endpoint shares
the browser's original held-file Range sender and checks the selected product
and exact COMPLETE PUBLISH file. Native package and source receivers remain the
final writers throughout this workflow.

## Reconcile collaborative draft editions

The same companion provides **merchant_handover_merge_review**,
**merchant_handover_merge_save**, **merchant_handover_working_export** and
**merchant_handover_working_import**. A complete working form is compared with
its original base and the current saved edition. Review paged conflicts and
changes, choose CURRENT or WORKING explicitly where needed, and save the exact
READY review with its original request UUID.

The existing typed client exposes matching reviewDraftMerge, saveDraftMerge,
exportWorkingEdit and importWorkingEdit methods. The terminal adds
**working-export** and **working-import**, retaining exact whole edit files,
native replies, complete working forms and a prepared original review command.

[COLLABORATION.md](COLLABORATION.md) contains the full source-bound browser,
agent, typed and terminal walkthrough, including later-edition/restart
recovery and the continuation into the original package/receiving jobs.
