# Complete offline recipient receiving

Use the actual selected customer catalog-bundle.jsonl, its original declared SHA-256 and a new private output directory. Preserve the original receiving operation when transferring execution to an equipped host.

The source contract is the maintained material-catalog bundle v1/v2 at the product's selected source commit. Original sources and later customer decisions come from that bundle. A previous export is reviewed at its own contained revision.

## Run the complete receiving course

Use the existing installed Playwright module and Chromium executable, or an explicitly assigned existing CDP browser:

```sh
node products/material-catalog/recipient/receive.mjs \
  --bundle /private/delivery/catalog-bundle.jsonl \
  --sha256 ORIGINAL_BUNDLE_SHA256 \
  --directory /private/delivery/offline-recipient-receiving \
  --playwright /absolute/installed/playwright/index.mjs \
  --executable /absolute/installed/chromium
```

For an assigned existing browser, replace --executable with --cdp and the actual endpoint. Coordinate the browser's original owner before using that route. The driver creates its own page and closes that page; it does not navigate an existing user tab or close the shared browser.

The driver creates a new receiving directory, builds a blank reader and a complete populated reader, then opens the actual local files. It uses the file chooser, every main tab, material search and detail, edition selection/comparison, original-table downloads, original source downloads and the complete-reader download. It independently checks downloaded bytes against the selected original source. It cold-opens the downloaded reader in a fresh page, checks its whole-bundle identity and downloads the original bundle again.

The resulting JSON records actual controls, downloaded file identities, browser errors and screenshot paths. It labels pixel review pending until the operator actually opens the images. It never turns a browser accessibility-tree check or model-only run into visual acceptance.

## Use exact supplied HTML in an assigned browser

The same course supports an equipped browser whose supported input is complete HTML on a fresh `about:blank` Page. This mode uses Playwright's ordinary `setContent` API. It supplies the already selected self-contained attachment; it makes no request to a local server, changes no browser restriction, and uses no proxy.

Retain the blank and populated HTML files, both declared SHA-256 values, and the exact original JSONL. The adapter checks each whole HTML file, requires its executable/template bytes to match the current complete reader modules, and confirms that the populated attachment embeds exactly the selected original bundle. A changed source edition or different embedded bundle fails before the receiving directory is created. The embedded payload filename must also match the selected original JSONL basename. Keep that original name when materializing saved bytes, or copy the same hash-verified bytes to that basename before this receiving. For the retained SAP handover selected in this operation, the populated attachment embeds `retained-customer-catalog.jsonl`; use that basename even when its saved-download display name differs. This affects only the local filename, not the original bundle bytes or history. Use the matching source closure; do not rewrite a historical attachment to make its hash agree.

With an already assigned Node Playwright context or fresh Page, import the original receiver directly:

```js
import {receiveRecipientBrowser} from './products/material-catalog/recipient/receive.mjs';

const report = await receiveRecipientBrowser({
  context: assignedContext,
  // Optional: page: assignedFreshAboutBlankPage,
  bundlePath: '/private/delivery/retained-customer-catalog.jsonl',
  bundleSha256: ORIGINAL_BUNDLE_SHA256,
  directory: '/private/delivery/offline-recipient-receiving',
  operationId: 'MATERIAL-CATALOG-OFFLINE-RECIPIENT-EE290-20261013',
  pageSource: 'supplied-html',
  suppliedHtml: {
    blank: {path: '/private/delivery/Material_Catalog_Reader.html', sha256: BLANK_HTML_SHA256},
    populated: {path: '/private/delivery/Material_Catalog_Complete.html', sha256: POPULATED_HTML_SHA256}
  }
});
```

The importing API launches no browser. It creates only its own fresh Pages in the assigned context and closes those Pages at the end. If the caller supplies a fresh Page, the API leaves it open and restores its viewport; it refuses a Page already displaying another document. Importing this module does not execute the CLI or terminate the caller. The standalone CDP CLI exits its own client with status 0 on completion or 1 after failure and owned-Page cleanup, leaving the assigned browser open.

The existing CLI accepts the same mode with an assigned browser:

```sh
node products/material-catalog/recipient/receive.mjs \
  --bundle /private/delivery/retained-customer-catalog.jsonl \
  --sha256 ORIGINAL_BUNDLE_SHA256 \
  --directory /private/delivery/offline-recipient-receiving \
  --playwright /absolute/installed/playwright/index.mjs \
  --cdp EXISTING_ASSIGNED_CDP_ENDPOINT \
  --page-source supplied-html \
  --blank-html /private/delivery/Material_Catalog_Reader.html \
  --blank-sha256 BLANK_HTML_SHA256 \
  --populated-html /private/delivery/Material_Catalog_Complete.html \
  --populated-sha256 POPULATED_HTML_SHA256 \
  --operation MATERIAL-CATALOG-OFFLINE-RECIPIENT-EE290-20261013
```

The default `file` mode retains direct local-file opening. The supplied mode first opens the exact blank attachment, uses its original file input, then opens the exact populated outgoing attachment on a separate fresh Page for the complete seven-section course. It reopens the actual downloaded recipient HTML on another fresh Page using that downloaded byte string, retains desktop and 390-pixel images of that reopened attachment, and exports the original bundle again. Both modes retain every table, source, decision, comparison and selected-edition download from the original course.

`RECEIVING.json` records the operation, selected page-source mode, exact rendered HTML identities, every retained download, and desktop/390-pixel screenshot identities. Its customer HTML is the actual browser download. A successful control course still records producer pixel review as pending. Open the returned images and all delivered attachments before marking visual completion.

A host with only Python Playwright can operate these same exact HTML files with `page.set_content(html, wait_until="load")`, the existing file inputs, buttons, and downloads. It must retain the complete original bytes and the same receiving outcomes below; this JavaScript module does not install Node or claim that a Python API accepts a JavaScript Page. Keep the current equipped owner and original operation when selecting the installed-language driver.

## Continue an interrupted original table-download phase

The importing API accepts `resumeBrowser: {recordSha256, receiverPreimageSha256}` for an original browser-only course that stopped after material selection and before completing every original table. Use the same operation, output directory, input basename/bytes, page-source mode and exact supplied HTML. Pin the full current failed `RECEIVING.json` bytes and its original receiver source hash before continuing. Keep every other selected source file identical. This option is separate from review-return and renewal; those optional phases remain unselected.

The continuation holds the existing receiving-directory lock, checks each accepted output and screenshot against its retained bytes/hash, and preserves the prior record in an exclusive `RECEIVING.before-browser-<recordSha256>.json` file. It records the exact receiver source transition and reuses accepted table downloads instead of replaying them. A completed or different phase, input, operation, HTML or source is refused. Preserve an uncertain attempt and reconcile its original owner before continuing; this API is not a general restart or an override for another writer.

For the remaining read-only downloads it opens ordinary fresh contexts on the same browser, with at most six new downloads per context. It restores the original populated reader and current tab/table, verifies the original bundle identity, and closes only its own pages and contexts. The caller's context stays open. No browser permission, policy or launch flag is changed. The final downloaded complete reader is independently cold-opened and its unchanged original bundle exported. `pendingDownload` and each accepted download are saved as progress. Historical failure fields remain in the record; use the current status, immutable prior record and continuation receipts to distinguish the attempts.

Keep the same original receiving directory and retained source/input/output custody. Do not invoke the completed one-shot caller again, rerun accepted controls, or infer completion of the separate supplier/native and author-adoption phases from this read-only suffix. Open every actual outgoing file and LOOK at the new captures before recording delivery completion.

## Inspect the actual rendered delivery

Open the retained desktop and 390-pixel screenshots. Look at the complete page, tabs, details, tables, labels, error text and download controls. Check both populated and empty/error states. Confirm that long identities wrap or scroll inside their intended area, the page itself stays usable on narrow screens, controls remain reachable and selected data is understandable.

Review the downloaded complete HTML by opening it, not only hashing it. Use its tabs and download the unchanged original bundle. Inspect the original source files and full record exports that matter to the customer. Check any shared attachment as a customer would open it before sending it.

If the original bundle includes supplier v2 histories, use its actual profile, plan/correction/review and recipient records. Read the saved global findings together with product findings. Do not infer overall readiness from a count of individually ready products.

Retain the completed report, images and customer HTML under the original delivery. Record actual pixel review and any fixes beside that operation. Keep source-only, browser-executed and visually-reviewed observations distinct so the next recipient can continue from the actual completed stage.

## Source and scope reference

The original core is under:
stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/
with transfer.mjs, workspace.mjs, mapping.mjs and supplier/{model,transfer,workspace}.mjs.
Supplier recipient rules remain in supplier/xchange/recipient.mjs and its original profile/processing modules.

The first source course uses the complete original 332,383-byte SAP reference handover, SHA-256 daeea21cee2c8512c9a8cab9cbbe04af3d625f57001ad262e276ebe939d80aa3: two source files, two 106-material editions, four catalogue revisions, 106 supplier-only changes and three contained customer-decision revisions. Its later operator note belongs to the following retained export and is not inserted into this earlier file.


## Named recipient review and original author adoption

The same original command accepts optional `--review-return`; the existing-context API accepts `reviewReturn: true`, and `resumeReviewReturn: true` continues that same directory. Both `file` and `supplied-html` use their original exact HTML-opening route for the working and onward readers. The optional native suffix needs the full published catalogue source, Node 22.16+ and the existing Linux `flock`; ordinary browser-only supplied-HTML receiving does not import its native module.

The suffix appends the full browser review, saved working-copy/cold-reopen, explicit author choices, original CLI transaction/replay and independent onward receiving course described in [REVIEW_RETURN.md](./REVIEW_RETURN.md). It keeps the same browser context and output directory, and creates declared private receiving copies rather than changing the live author database. Select this suffix before the existing course first starts. Following a lost suffix response, `--resume-review-return` continues the SAME directory and original request after checking input, source, built HTML and saved request/download identities. It holds the original directory flock and preserves every prior attempt. An earlier seven-section browser failure requires its own original phase reconciliation; never launch a replacement case to clear uncertainty.

The full output records the actual returned file, request, native Journal receipt, complete onward catalogue and desktop/narrow images. Inspect every retained image and delivered file before marking visual completion. A source-only pass is not a native or browser completion.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

