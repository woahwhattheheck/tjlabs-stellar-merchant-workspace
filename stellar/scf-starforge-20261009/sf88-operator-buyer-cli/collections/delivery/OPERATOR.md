# Complete customer result delivery

The Request Collections customer delivery desk packages the complete saved responses from selected original Inbox jobs. Open **Customer delivery** in the existing Collections workspace, or append `/customer-delivery` to the existing local origin and use the same private token. A recipient opens that page in the existing Collections receiving workspace.

This is a delivery operation. It reads the existing Collection and original Inbox evidence, uses the maintained InboxResponse verifier, and copies the verified response bytes. It does not enqueue, run, cancel, retry, settle or finalize a purchase. It does not contact a merchant or ledger.

## What the customer receives

One `<delivery-id>.ndjson` package contains:

- Every selected response that the original reader verifies, in its complete original byte representation.
- A customer review in JSON and an offline HTML viewer.
- The complete selected application source tree, with every file's byte count and SHA-256.
- Original collection, intent, job, configuration and capture digests; original saved outcome observations; and explicit unavailable-output states.
- A complete ordered manifest and final frame. Receiving verifies every member, all content digests, package digest and end of file.

The response names are neutral `responses/001.bin`, `002.bin` and so on. Names do not imply a type; open a response using the appropriate application for the purchased result. No response is rendered as HTML inside the desk.

Literal private Inbox evidence, execution configuration, operator identity, URLs/query strings, authorization headers, request bodies, tickets and local execution paths are excluded from the customer projection. The original raw capture remains in the private sender workspace. This exclusion does not redact the purchased response itself. The operator must choose responses appropriate for the receiving customer and review the selected source tree before preparing the package.

Source digests and recorded observations preserve origin and integrity. They are not a signature by a merchant, independent customer acceptance, a new settlement, grant eligibility evidence or new revenue. Settlement observations are copied from the maintained original evidence reader and explicitly described as retained observations.

## Prepare the source selection

Run the source command from the same installed application that serves Collections. Use the exact repository root containing `stellar/scf-starforge-20261009/sf88-operator-buyer-cli/`, or the installed package root containing both `source/stellar/` and the original package `LICENSE` and manifest. The executing module must belong to that exact tree. The source tree must be separate from the private Inbox, Collections and delivery directories.

```sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/delivery/cli.mjs source-manifest \
  --source-root /absolute/application \
  --output /absolute/private-review/customer-source.json
```

The output parent must already be a private directory. This command inventories the complete application tree, excluding only `.git`, `node_modules`, `__pycache__` and `.cache`. It rejects symbolic links, special files and named private-key/credential files. It requires the executing delivery implementation, original Collection/Inbox reader modules and the application license. The source manifest must live outside the selected tree. The source limit is 20,000 files and 128 MiB. No dependency installation is performed.

Keep private customer work outside application source. File-name checks are not a substitute for reviewing source contents. The exact manifest is rechecked before preparing a delivery; changed application source requires a new explicit source selection and review. An existing immutable delivery keeps its original source edition.

## Prepare a named delivery in the browser

1. Open the private Collections URL. Follow **Customer delivery**.
2. Select an existing collection. Select the original requests whose outputs belong in this customer's delivery. A request must already have an original Inbox job.
3. Choose a stable delivery ID, a customer-facing title and note.
4. Enter the absolute application source root and source manifest. Set the maximum response size the original reader may verify. The default is 256 MiB per response, with the original reader's 1 GiB aggregate verification bound.
5. Decide whether incomplete outputs are acceptable. With the default setting, the package completes only when every selected response is verified. An incomplete delivery, when explicitly permitted, visibly lists unavailable, not saved, over-limit or not requested outputs; those rows are never counted as included responses.
6. Review the selected jobs and source population. Prepare the package.
7. Download the complete `.ndjson` file. Send its exact SHA-256 and byte count alongside it using the existing customer relationship.

The browser saves the exact reviewed request in IndexedDB before preparation. A network failure leaves that request available under **Continue exact retained operation**. Preparing again uses the same delivery ID and request. It never silently creates another capture or another delivery after a saved capture exists.

The first exact native capture is retained before customer files are selected. If the application changes, the original response disappears, a local file fails verification, or an output is unavailable, the operation remains inspectable and the original request is preserved. Restore the exact selected input and continue that operation. To make a different selection or permit incompleteness, explicitly create a new delivery ID after reviewing it. Earlier named packages remain immutable.

## Receive independently

Start the existing receiving workspace:

```sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/cli.mjs serve \
  --receiving-directory /absolute/private-customer-receiving
```

Open `/customer-delivery` on its printed origin and use the same private workspace token.

1. Select the original package and paste the sender's SHA-256.
2. Choose **Verify and receive**.
3. The upload proceeds in exact 64 KiB chunks. Every chunk has its own SHA-256. The browser sends up to sixteen consecutive chunks (1 MiB of original bytes) per request, preserving each chunk's own offset and digest. Complete package verification must match the sender's digest before the received result is published.
4. Inspect the original intent IDs, outcome observations, complete-output flags, file lengths and digests.
5. Download a complete response or the customer review. The complete selected source tree and original package remain in the private receiving directory.
6. Reopen a previously received package using its package SHA-256. Reopening verifies the retained files again.

**Archive browser request** retains an exact local archived copy and clears only the active browser slot. It does not remove, cancel or replace a server-side named delivery or upload, whose outcome may still need inspection. Use a new delivery ID for a deliberately changed selection.

Interrupted uploads retain committed chunks, including a durably written prefix of an interrupted batch. Reselect the original file with the retained name and byte count and continue. The full final digest is authoritative; a same-sized replacement file cannot pass verification with different bytes. The upload/receiving operation keeps its original package identity. No received code is executed, no source Inbox is adopted and no payment credentials are required.

The recipient's raw package and members are under:

```text
<receiving-directory>/customer-delivery/received/<package-sha256>/
  receiving.json
  customer-delivery.ndjson
  result.json
  members/review.html
  members/review.json
  members/responses/...
  members/source/...
```

After a successful complete receive, opening `members/review.html` offline gives the response links and review without running a server. It is the fixed application-generated viewer. Keep the entire members directory together.

## Large-package transfer and recovery

The upload directory remains the original source of truth: `upload.json`, the immutable offset-named `.part` files and the completed package. The running controller keeps a bounded in-memory progress index for up to four uploads and 131,072 total chunk entries. It discards an entry when the upload directory's device/inode or modification/change time changes. Another maintained writer therefore causes an original-file census before continuation. Restarting, reopening or explicitly inspecting an upload also reads and hashes the retained chunks again.

An ordinary uninterrupted browser upload using 64 KiB parts reads each incoming chunk once, and assembly verifies every retained part and the sender's whole-package SHA-256. Reopening a published completed package verifies its original whole-file digest. Retrying an earlier chunk checks that exact retained part. A cache entry cannot authorize a different package or bypass final verification. In-place modification of an earlier part is detected on full inspection or final assembly; the cache does not claim continuous filesystem monitoring.

The original single-chunk route and default full native `parts` result remain available. The browser uses `?progress=compact`, which returns `partCount` with the original offset/size/digest fields instead of repeatedly returning the entire growing chunk census. The additive `uploads/:sha256/chunks` action accepts `{chunks:[{offset,base64,sha256}]}` with at most sixteen consecutive chunks. Only this batch route uses the existing host's explicit 2 MiB JSON-body option; the original 256 KiB default remains for other upload actions. It validates the whole batch before its first write, then retains each chunk through the original create-only writer. A process interruption can leave a committed prefix; continuing the same package inspects that prefix and resumes its next offset. The batch is not advertised as an all-or-nothing filesystem transaction.

## CLI and automation

The same module exports `openCustomerDelivery({collections, directory})`. Supply the already-open original Collections object; the caller owns it. The delivery module holds the maintained collection lease and original recovery lock while reading/preparing a package. A receiving-only model uses `collections:null`.

Commands:

```text
source-manifest --source-root ABS --output ABS
preview --directory ABS --request ABS_JSON
prepare --directory ABS --request ABS_JSON
list --directory ABS
show --directory ABS --id ID
inspect-package --file ABS
receive --receiving-directory ABS --file ABS --sha256 SHA
received --receiving-directory ABS --sha256 SHA
```

Preview request:

```json
{
  "id": "customer-october-results",
  "collectionId": "existing-original-collection",
  "expectedManifestSha256": "<original Collection SHA-256>",
  "title": "October complete results",
  "note": "Selected original customer outputs.",
  "intentIds": ["<original intent>"],
  "sourceRoot": "/absolute/application",
  "sourceManifest": "/absolute/private-review/customer-source.json",
  "maxVerifyBytes": 268435456,
  "allowIncomplete": false
}
```

Use the preview's exact `previewSha256` as `expectedPreviewSha256` in the otherwise unchanged prepare request. Retain that complete request before calling prepare. CLI output is JSON; errors return a nonzero exit status with an error code.

## Recovery and operating limits

- Source manifests and named packages are create-only. Existing bytes must match; they are never silently replaced.
- The browser requires a successful exact-scope IndexedDB read before allowing new mutations. A failed storage read retains an explicit retry path.
- The local listener retains the existing Collections bearer, loopback Host/Origin checks and shutdown ownership.
- A delivery supports 1–100 original requests, up to 20,000 source files, 2 GiB complete member content and a bounded base64-framed package. Browser downloads allocate a Blob; use the CLI and filesystem for very large deliveries.
- The original reader may mark a saved response unavailable or over its selected limit. These are delivery observations, not a reason to rerun the purchase.
- Both source and customer outputs remain full files. No sample, preview row limit or screenshot substitutes for a delivered response.
- Existing private Collection recovery, Shared Plans and Customer-use commissioning keep their original purposes and file formats. This customer package does not replace them.
