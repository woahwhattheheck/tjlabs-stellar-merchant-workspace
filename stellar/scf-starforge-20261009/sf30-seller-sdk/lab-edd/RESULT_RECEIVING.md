# Receive a completed Laboratory result

A customer can open a completed Laboratory result in one private folder, inspect
its original reviews, take the native receiving files, and reopen the same folder
on another machine. This workflow uses the existing complete-result verifier and
the original atomic file writer. It consumes the finished result from the local
application or the existing paid-job customer download.

The operation retains the exact complete ZIP and every original member. Current
and baseline native files have separate directories. The local entry page links
the original field editors, correspondence editor, decision files and full
receiving receipt.

## Open the customer folder

Use the maintained `laboratory-edd` installation containing this change:

```sh
starforge lab-edd open-result \
  --file /absolute/downloads/delivery-01.zip \
  --directory /absolute/private/delivery-01 \
  --expected-result-sha256 EXPECTED_COMPLETE_ZIP_SHA256 \
  --expected-job-id ORIGINAL_JOB_ID
```

Use the complete ZIP hash and job ID from the original customer download record.
A local result retains its original `local-<review-name>` job ID. If an older
result has no job identity, omit that optional expectation.

The command returns the absolute `entryPage`, `archivePath` and `receiptPath`.
Open `entryPage` in a browser. All links are relative to the received folder;
keep that complete folder together during a transfer.

The page shows **Files verified** separately from each edition's profile
disposition and native preparation. It offers:

- The unchanged current review and, when supplied, the baseline and complete
  correspondence reviews.
- Every prepared native file with its original filename and exact byte hash.
- Every original input, including selected field/correspondence input files.
- The complete saved JSON/CSV/TSV choices and original field comparison.
- The full result ZIP, original manifest and complete member inventory.

A `PREPARED` workbook can retain a `CORRECTION_REQUIRED` profile disposition.
A `REVIEW_REQUIRED` native preparation retains the original review and exact
preparation explanation. Receiving a folder preserves these states.

## Inspect rows and return customer findings

New receiving folders use layout 2. Open **Inspect all rows and customer findings**
from `index.html`, or open the returned `inspectionPage` (`inspect.html`) directly.
It is a self-contained offline page: no server, account, network request or new
Laboratory job is needed. Keep the complete folder beside it for the original
downloads. The original result ZIP, current/baseline reports and native files are
unchanged.

1. Select an edition and physical table, or search across every original and
   reviewed field value. The displayed row count always names the complete
   population and the selected subset. Paging displays 50 rows at a time without
   changing the retained population. Filters select changed rows, profile
   observations, or rows with customer findings.
2. Select a physical row. The inspector displays every exact header/key, original
   and reviewed value, and saved scientific choice. A field-name filter helps with
   wide worksheets; clear it to see all columns. Empty strings remain explicit.
   Expand cell details for the original workbook type, formula/cache and retained
   provenance. Limits, qualifiers, dates and units remain separate original cells;
   this view applies no implicit scientific interpretation.
3. Inspect all original/reviewed profile observations attached to the row. For a
   cross-profile result, expand its complete source entities, candidate groups and
   saved correspondence choices. The full source manifests, reports, lineage,
   decisions and original/prepared correspondence remain available at the bottom
   and in `inspection.json`.
4. Add a customer finding to the whole row or an exact field. Choose **Open**,
   **Resolved** or **Information**, write the reason and select **Save finding in
   this page**. A field finding binds its complete result identity, edition, table,
   physical record, original/reviewed row hashes and both exact values. Unfinished
   note edits remain attached to their targets when navigating. Save or remove
   them before downloading a complete handover.
5. Enter the reviewer, summary and explicit customer disposition. A completed
   disposition requires a reviewer and summary; acceptance also requires no open
   customer finding. This records the customer's findings review. It does not
   assert a successful EDP import, change profile errors, or replace the scientific
   decision/correspondence documents.
6. Download **editable findings JSON** and the **readable findings report**. The
   page keeps changes in memory until download. JSON is the complete editable
   handover; use **Reopen findings JSON** in the same result's inspector to continue.
   Another result, altered row/value, duplicate target or unknown field is refused
   before the current draft is replaced. Browser reload alone is not a save.

Receive the downloaded findings with the entire original delivery in a separate
immutable folder:

```sh
starforge lab-edd receive-findings \
  --directory /absolute/private/delivery-01 \
  --file /absolute/downloads/Laboratory_Customer_Findings.json \
  --output-directory /absolute/private/delivery-01-customer-review \
  --expected-result-sha256 EXPECTED_COMPLETE_ZIP_SHA256

starforge lab-edd reopen-result \
  --directory /absolute/private/delivery-01-customer-review \
  --expected-result-sha256 EXPECTED_COMPLETE_ZIP_SHA256
```

The command first cold-verifies the complete existing folder. It validates the
findings against those exact original/reviewed rows, then receives every original
ZIP member and both native families alongside `inspection.json`, `inspect.html`,
`customer-review.json` and `customer-review.html`. The final receiving receipt
binds all file bytes; its separate customer-document hash uses canonical JSON.
The original folder remains unchanged. Repeat receiving of the same findings into
the same successor resumes exact files; different findings need another output
folder. Transfer that whole successor and cold-reopen it through the same command.

The SDK exports `receiveLabCustomerReview({directory,file,outputDirectory,
expected,signal})` from `received-result.mjs`. `receiveLabResult` accepts an optional
complete `customerReview` object and `layoutVersion: 1 | 2`; a new folder defaults
to 2. `customer-review.mjs` exports the same pure findings normalizer used in the
offline browser, plus the complete inspection and exact-target helpers. Types are
provided beside both modules. Neither surface can modify the incoming scientific
result.

Historical layout-1 folders continue using their original exact page and receipt.
Open/reopen selects the recorded layout. To add the new operator to an old result,
receive its unchanged original ZIP into a new folder. No in-place layout migration
or receipt replacement occurs.

## Reopen, resume and transfer

A read-only reopen validates the complete original ZIP through `readLabResult`,
reconstructs the same folder identity and checks every managed file:

```sh
starforge lab-edd reopen-result \
  --directory /absolute/private/delivery-01 \
  --expected-result-sha256 EXPECTED_COMPLETE_ZIP_SHA256 \
  --expected-job-id ORIGINAL_JOB_ID
```

The output's `readOnly: true` identifies this completed reopen. No request,
merchant, payment, worker or laboratory computation is started.

If an initial folder write was interrupted, repeat the original `open-result`
command with the same result and directory. Exact completed files are retained;
missing files are written. The complete receipt is published only after all
managed bytes have been reread and verified. Once present, that receipt must
match the original result and every current file before reuse.

`binding.json` identifies the result before member publication. A different
result or an altered member is refused. Atomic temporary publication prevents a
partial final file from being mistaken for a completed member. Complete
publication leftovers with multiple links remain readable through the original
stable-file contract.

For a cold transfer, copy the complete folder while preserving its private
directory permissions. For example:

```sh
cp -a /absolute/private/delivery-01 /absolute/other-private/delivery-01

starforge lab-edd reopen-result \
  --directory /absolute/other-private/delivery-01 \
  --expected-result-sha256 EXPECTED_COMPLETE_ZIP_SHA256
```

The receiving identity contains relative managed paths and original content
identities. A different absolute receiving location therefore reopens the same
delivery. The chosen directory and each managed subdirectory must be real,
private directories owned by the current operator.

## Folder contract

| Path | Retained content |
| --- | --- |
| `original-result.zip` | The complete byte-identical incoming result |
| `result/` | Every original outer ZIP member, with its original relative name |
| `native/current/` | Every native current receiving member verified by the original reader |
| `native/baseline/` | Every native baseline receiving member, when present |
| `index.html` | Local customer entry page linking the original reports and files |
| `binding.json` | Original result, job, source, decision and review identities |
| `receipt.json` | Completed exact managed-file inventory and original preparation/profile states |

An original BIFF8 XLS remains in the complete result. Its separately named
`.xls.xlsx` native reissue retains the original source-file and conversion
metadata. The result reader verifies that complete conversion set before any
customer member is written. The current and baseline namespaces preserve both
families even when they contain equal filenames.

The receipt binds the archive SHA256 and bytes, the raw original manifest SHA256,
the original function and job, source/decision/review hashes, and all applicable
baseline/correspondence identities. Every managed file declaration has its exact
relative path, byte count, SHA256 and role. `managedFileBytes` is the sum of those
files; the receipt itself is an additional small JSON file.

The customer folder includes the original complete ZIP, its expanded members and
the independently accessible native members. Reserve disk for those actual
copies. The existing result limits remain 64 MiB for the compressed incoming ZIP,
128 original result members and 512 MiB for their complete decoded bytes. The receiver
uses the original verifier; it does not introduce another ZIP decoder or
scientific engine.

## Bind additional expected identities

The CLI accepts the following optional expectations:

| CLI option | Existing result identity |
| --- | --- |
| `--expected-result-sha256` | Exact complete ZIP SHA256 |
| `--expected-job-id` | Original `laboratoryReview` job ID |
| `--review` | Original saved review name |
| `--expected-source-sha256` | Current source/profile/encoding identity |
| `--expected-document-sha256` | Current normalized decision document |
| `--expected-review-sha256` | Current computed field review |
| `--expected-baseline-sha256` | Baseline source identity |
| `--expected-baseline-document-sha256` | Baseline field decisions |
| `--expected-baseline-review-sha256` | Baseline field review |
| `--expected-correspondence-review-sha256` | Complete explicit correspondence review |

The source identity differs from the incoming ZIP's own hash. Select the value
from its original source/review record. An expectation for a missing baseline or
correspondence fails before any result folder is written.

`--out NEW_JSON` retains the CLI summary in a new exclusive file. The complete
receipt always remains inside the customer folder. Existing CLI output commands
now use the same original atomic writer while keeping their exclusive-file
behavior.

## Typed SDK

```js
import {
  receiveLabResult,
  openReceivedLabResult,
} from '@tokenjunkielabs/starforge-merchant/seller/lab-edd/received-result';

const expected = {
  archiveSha256: originalDownload.sha256,
  jobId: originalJob.id,
  sourceSha256: originalReview.source.sourceSha256,
  reviewSha256: originalReview.reviewSha256,
};

const received = await receiveLabResult({
  file: '/absolute/downloads/delivery-01.zip',
  directory: '/absolute/private/delivery-01',
  expected,
  signal,
});

const reopened = await openReceivedLabResult({
  directory: received.directory,
  expected,
  signal,
});

console.log(reopened.entryPage, reopened.receipt.identity);
```

Use the actual original job/download/review objects from the caller. The example
names represent those retained records; the receiver does not fetch or purchase
them. The types expose each expected field, full receipt, native conversion
binding and resulting paths.

The SDK result-folder functions use Node built-ins and the already maintained
Lab/SF88 source. They need no Python process to reopen an already prepared XLSX
or XLS result. Existing file-reservation scope is honored by the original
`writeBytes` helper during publication.

## Continue the original supplier delivery

The full supplier-job continuation is
`MCCAMPBELL-LAB-MCP-RECEIVING-9F77-20261012`. Its two original vendor downloads
are retained in the supplied source package:

| Original input | Bytes | Exact ZIP SHA256 |
| --- | ---: | --- |
| `Equis3.zip` | 9,862 | `9253032d539ced2d60b04f1c3e9188dc55c8a2c0ce873c2e8cd4273f28db203d` |
| `Equis4_CSV.zip` | 10,432 | `a57c18f4bf8054503155e1c8ccdb0bf7b736e4cc5eefef5e8d4c61a145ed2879` |

They were retrieved from the original
[McCampbell EQuIS 3 download](https://www.mccampbell.com/EDDs/Equis3.zip) and
[EQuIS 4 CSV download](https://www.mccampbell.com/EDDs/Equis4_CSV.zip).
Their exact original source is retained at
`stellar/scf-starforge-20261009/sf30-seller-sdk/lab-edd/examples/mccampbell/`.
Each supplier edition's complete records, profile identity and counterpart choices
remain in the original laboratory operation. A completed model projection or
commercial case receipt is not that operation's completed job result.

The original
`stellar-forge/mcp-merchant-operator/lab-edd-receiving.mjs` already downloads
the full result through `downloadLaboratoryFile`, verifies it with
`readLabResult`, receives it into the independent original workspace and
cold-reopens both result records. Its completed `result.json` retains
`families[family.id].result.sha256` and both source identities. The corresponding
complete download directory is
`downloads/<family.id>-complete-native-result` under that original receiving
directory.

After that original programme returns `COMPLETE`, reuse its saved transfer.
The following is an additional customer delivery step in that same caller;
`family` is its original configured family and `completed` is its retained
complete receiving result. `reopenLaboratoryDownload` is the unchanged function
already imported by that operator.

```js
const saved = completed.families[family.id].result;
const transfer = await reopenLaboratoryDownload({
  directory: originalCompleteDownloadDirectory,
  expectedSha256: saved.sha256,
});

const delivery = await receiveLabResult({
  file: transfer.filename,
  directory: customerDeliveryDirectory,
  expected: {
    archiveSha256: saved.sha256,
    jobId: family.reference,
    sourceSha256: saved.currentSourceSha256,
    ...(saved.baselineSourceSha256
      ? { baselineSourceSha256: saved.baselineSourceSha256 }
      : {}),
  },
  signal,
});
```

The receiving step consumes the saved complete bytes. It preserves the original
reference, checkout, approved request, worker result and transfer journal.
If the original operation has not yet produced a complete result, keep this
customer step pending on that operation. The fixture below remains its separate
format acceptance input.

For a complete customer-folder acceptance on the finished supplier result,
run `received-result-receiving.mjs` with that returned `transfer.filename`,
its exact `saved.sha256`, a private receiving directory and a source-kind
description identifying the original complete supplier job. That programme
performs the same CLI receive, same-folder continuation, independent full copy
and fresh-process reopen while recording the real incoming job identity.

## Retained original native receiving

The complete operating exercise uses the exact
`DTS8D_Recorded_Literals_Complete_Result.zip` already produced by the original
eleven-command legacy receiving:

| Source fact | Retained value |
| --- | --- |
| Original result member | `cli/reviewed-result.zip` |
| Complete result | 138,994 bytes |
| SHA256 | `a38dea03a0d0e976c644e215bc7d360344eab2945326dd2836adaba72b6a85ac` |
| Original operation | `GEOTECH-DTS8D-LEGACY-XLS-9F77-20261012` |
| Source kind | Generated software-format fixture |
| Source coverage | Two physical observation rows, all 150 DTS fields |
| Native preparation | `PREPARED` |
| Profile disposition | `CORRECTION_REQUIRED`, all 48 observations retained |

The exact UTF-8 input carrier is public Git blob
`69fe34081ffe2fd8f88503593fc70d6ef99c0aad` in
`woahwhattheheck/public-commons-sprint-2026`. It contains the original complete
result bytes and source provenance. The fixture demonstrates format receiving;
the separate original supplier files retain their own full 500-result editions.

The complete result-folder receiving exercise opens that same retained result
through the current CLI, repeats the same folder to verify continuation, copies
the full received folder to an independent location and reopens it in a fresh
Node process. It preserves the original result and all outputs. Its final native
receipt records actual completion; source preparation alone is not that receipt.

Run the same complete receiving programme from the supplied source:

```sh
node /absolute/source/stellar/scf-starforge-20261009/sf30-seller-sdk/lab-edd/received-result-receiving.mjs \
  --file /absolute/retained/DTS8D_Recorded_Literals_Complete_Result.zip \
  --directory /absolute/private/customer-result-receiving \
  --expected-result-sha256 a38dea03a0d0e976c644e215bc7d360344eab2945326dd2836adaba72b6a85ac \
  --source-kind 'generated software-format fixture' \
  --operation-id LAB-RESULT-CUSTOMER-RECEIVING-9F77-20261012
```

The programme retains `input/complete-result.zip`, the complete `customer/`
and `independent-customer/` folders, all three original CLI outputs and their
command receipts, and `native-receiving.json`. Its immutable operation binding
includes the exact result and operative source hashes. Repeat the same command
to resume missing phases or verify an already completed result. A completed
CLI output can be recovered after interruption without inventing an observed
process exit. Cancellation drains the exact child before returning.

The same programme accepts another **already completed** Laboratory result
when its actual hash and source-kind description are supplied in a separate
receiving directory. Retain the original job and input identities. The original
full supplier-job operation must first produce its real result; the small
format fixture does not substitute for that full receiving.

For this retained 138,994-byte fixture, the source-only command closure has no
third-party Node dependency. The selected result-folder commands do not load
the merchant configuration compiler. Reserve memory and disk for the original
verifier and two complete result folders; final byte totals come from the
native receipt. Use the existing admitted execution route on a shared host.

The original paid Laboratory receiving operation and its source collector remain
independent continuations. This customer-folder workflow only consumes a
completed result.

## Complete offline operator receiving

The source includes `customer-review-receiving.mjs` for the entire customer journey.
It opens the real self-contained inspector through the supplied installed browser,
operates every physical row and every original/reviewed field, retains a pending
note across target changes, downloads and reopens the full editable findings and
readable report, and verifies the complete original ZIP download. It then invokes
the existing `receive-findings` CLI, copies every managed file to an independent
folder, cold-reopens it through both CLI and SDK, and replays the same findings
without overwriting the accepted handover.

Use the original retained result, its exact hash and source description. Select
the existing installed Playwright module and Chromium executable; this programme
does not acquire either dependency or invoke a Laboratory worker.

```sh
node /absolute/source/stellar/scf-starforge-20261009/sf30-seller-sdk/lab-edd/customer-review-receiving.mjs \
  --file /absolute/retained/DTS8D_Recorded_Literals_Complete_Result.zip \
  --directory /absolute/private/offline-customer-receiving \
  --expected-result-sha256 a38dea03a0d0e976c644e215bc7d360344eab2945326dd2836adaba72b6a85ac \
  --source-kind 'generated software-format fixture' \
  --playwright /absolute/installed/playwright/index.mjs \
  --chromium /absolute/installed/chromium \
  --operation-id LAB-RESULT-CUSTOMER-RECEIVING-9F77-20261012
```

The receiving directory binds all 29 operative source files, the original input,
and the selected runtime entry files. It contains the full `original-customer/`,
`findings-customer/` and `independent-findings-customer/` folders, complete browser
downloads, desktop/mobile screenshots, all CLI outputs and the final
`native-receiving.json`. That final receipt names the supplied source kind and
original job; an automated format receiving does not assert supplier acceptance.

A browser handover is published only after the complete course succeeds and the
captured browser closes. On continuation, the same completed handover and every
artifact are reread before reuse. A completed temporary handover can be recovered
after an interrupted atomic directory publication. Incomplete attempt directories
remain visibly separate and are never interpreted as completed browser output.
The independent folder copy resumes exact files through the original immutable
writer. An already completed course reopens all three folders and verifies every
retained output before returning.

Use the existing admitted execution route on a shared host, and preserve an
already-bound operation's exact command and source selection. This added customer
course must not replace the command in an older registered receiving record.
For the retained two-row format fixture, select a new owned output directory for
the current source continuation and budget for three complete folders, browser
downloads/screenshots and the native record copy. The browser and its runtime
need their normal memory reservation; available tmpfs capacity is not additional
cgroup memory. A full supplier result uses the same course only after the original
supplier job has actually completed, with resource needs based on that whole input.
