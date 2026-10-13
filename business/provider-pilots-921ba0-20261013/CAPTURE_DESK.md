# BlockRun capture desk

This complete offline operator application opens the original BlockRun account capture, projects it with the maintained exact-decimal module, records a named review and gives the next operator a complete working HTML or JSON package.

## Open and use the desk

1. Open `BlockRun_Capture_Desk.html` in a browser. The delivered starting example is explicitly authored documentation data.
2. Choose **Import capture or desk JSON**. An original capture wrapper becomes a new retained capture; a complete desk package opens its whole history in a separate browser branch.
3. Use **Overview** to read the account/window, known priced and free cost, original summary calls, incomplete pages, pending amounts and provider credit decision.
4. Inspect **Usage rows**, **Media & corrections** and **Original pages**. Search or filter rows, open the exact original response text, or download an unchanged response and its complete wrapper.
5. Choose **Review** for the whole capture or a specific request. Enter the reviewer, status and note, then save. Previous reviews remain in **History**, including notes later corrected or cleared.
6. Use **Receive & export** to download working HTML and complete JSON. The recipient can open the HTML directly or import the JSON into this same application. Both retain every original capture and review event.

Review status is local operator metadata. It does not change a provider cost or blocked state and does not establish that a customer received useful output.

## Complete capture and comparison

The source capture schema is unchanged: `tjlabs.blockrun-usage-capture.v1`. Keep the account/key labels, UTC window, every exact requested URL, cursor, status and capture time, and each complete `responseText`. No API key belongs in those labels.

If a retained page has a non-null continuation cursor, Overview gives the maintained planner's exact next GET. Run that request through the existing account client and import a complete expanded wrapper. The desk does not execute the request. Previous captures and their independent reviews remain retained.

Capture comparison is available when the account, key label, UTC window and page size match exactly. It names added, removed and changed original row IDs. Different selections remain separate. This comparison never adds accounting totals across windows.

The original module preserves decimal tokens before interpretation. Signed corrections remain signed rows; pending costs are excluded from the known total; a media job groups its creates and polls. Calls come from the provider summary rather than a count reconstructed from rows. Missing days, partial cutoffs and differences between observed rows and the separately captured summary remain visible. A null remaining credit means unlimited; an explicit zero stays zero. The original `blocked` field stays the admission authority.

## Receiving and history

The desk JSON includes the complete state, all unchanged capture text, capture SHA-256 values and every review event. Events form a sequential hash-linked history. Receiving revalidates the package checksum, original projection identity, full history, capture membership and the provider projection before installing the desk.

These hashes detect accidental content changes; they are not provider signatures or authenticated reviewer identities. Reviewer names are entered by the operator. The captured wrapper remains a local account association.

Each browser tab uses a separate storage branch. It never overwrites another tab's branch. **Open saved branch** creates a new continuation while keeping the source branch. A received HTML always opens its embedded snapshot, not a different desk already stored by that browser. Browser storage may be disabled or full; the desk continues in memory and tells the operator to export. Downloading the complete package is the durable receiving step.

If a review form has an unsaved draft, capture navigation/import and exports ask the operator to save or discard it first. An asynchronous file read is adopted only while the same original view and saved revision remain selected. Invalid or altered packages leave the current desk intact.

The 32 MiB aggregate capture limit and 128-capture/10,000-event limits bound this operator profile. A full JSON desk package, including all review notes and JSON escaping, is limited to 64 MiB. Every proposed edit or capture import checks that exact exported size before it becomes current, so a saved desk remains receivable. Original per-response and page limits continue to come from the maintained BlockRun projection. Larger account deliveries can select a narrower window using the existing account client.

## Delivered files and installation

The package has no third-party dependency and makes no network request. Its HTML contains the complete original projection, review code, browser, styles, renderer, guide and authored example. **Download complete source JSON** provides those full source bodies and their hashes.

From the repository package directory with Node.js 18 or later:

~~~sh
node capture-desk-build.mjs --out /absolute/private/BlockRun_Capture_Desk.html
node capture-desk-build.mjs --input /absolute/private/received-desk.json --out /absolute/private/Received_BlockRun_Desk.html
~~~

The output is exclusive: an existing different file is preserved. An existing identical complete output reopens successfully. The builder reads the exact package leaves and the original projection identity, then writes the standalone file; it does not acquire provider credentials or invoke a provider.

An input can be the unchanged original capture wrapper or a complete received desk JSON. The original full repository package also retains its separate shared capture CLI:

~~~sh
node inspect-capture.mjs blockrun /absolute/private/blockrun-capture.json
~~~

The complete JSON and working HTML preserve all source captures. The CSV is a convenient current-row review view, with costs exported as `USD <exact decimal>` text and spreadsheet-formula prefixes escaped. It does not replace the full original capture. Printing gives a readable report; the full original response text remains in the complete files.

## Example and commercial continuation

The included authored example has two pages, six unique rows, three provider-reported calls, one media group and one correction. Known priced and free cost is exactly **USD 0.028100000000000001**, with zero difference against the supplied summary. No provider request or charge produced this documentation example.

The desk completes an operator-facing part of the existing [BlockRun pilot](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/e21a98293a7fbc585c2e698c8b83890e073d2822/business/provider-pilots-921ba0-20261013/BLOCKRUN.md). The original proposed fee remains USD 3,000 for 24 hours over five business days in an agreed slot, with USD 1,500 at kickoff and USD 1,500 on acceptance. The existing first contact and customer/account selection remain the same opportunity. Provider account access, usage charges, hosting and accepted useful customer output retain the responsibilities in that proposal.

License: MIT.
