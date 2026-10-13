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

Retain the blank and populated HTML files, both declared SHA-256 values, and the exact original JSONL. The adapter checks each whole HTML file, requires its executable/template bytes to match the current four original reader modules, and confirms that the populated attachment embeds exactly the selected original bundle. A changed source edition or different embedded bundle fails before the receiving directory is created. The embedded payload filename must also match the selected original JSONL basename. Keep that original name when materializing saved bytes, or copy the same hash-verified bytes to that basename before this receiving. For the retained SAP handover selected in this operation, the populated attachment embeds `retained-customer-catalog.jsonl`; use that basename even when its saved-download display name differs. This affects only the local filename, not the original bundle bytes or history. Use the matching source closure; do not rewrite a historical attachment to make its hash agree.

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
