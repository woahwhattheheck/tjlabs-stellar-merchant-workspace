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
