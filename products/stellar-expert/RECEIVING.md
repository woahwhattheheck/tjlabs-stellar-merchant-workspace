# Receive the installed StellarExpert and NWS products

`receive-installed.mjs` runs the complete original installed workflow against one or both selected products. It is an operating programme for an equipped original runtime. Supply existing workspace/source/export/customer identities from the original product owner.

The programme uses each selected READY installation and original Applications controller. It does not build another distribution. Its initial run IDs belong to two explicit launches of the same saved application. If an incomplete owned launch was closed during cleanup, a continuation records a linked replacement run only after reading that original closure. Source editions, customer intents, receipt IDs and saved application identities remain unchanged.

## Private inputs

Save a private JSON object:

```json
{
  "schema": "stellar-forge.two-product-installed-receiving.v1",
  "operationId": "stellar-nws-installed-receiving-20261012",
  "directory": "/absolute/private/installed-receiving",
  "playwrightModule": "/absolute/existing/playwright",
  "chromiumExecutable": "/absolute/existing/chromium",
  "products": [
    {
      "request": {
        "schema": "stellar-forge.selected-product-request.v1",
        "product": "stellar-expert",
        "operationId": "ORIGINAL_APPLICATION_SAVE_UUID",
        "managerDirectory": "/absolute/private/runtime-manager",
        "runtimeDirectory": "/absolute/private/stellar-expert-runtime",
        "expectedSourceCommit": "FULL_SELECTED_COMMIT",
        "label": "Stellar asset investigation",
        "alias": "assets",
        "workspaceId": "ORIGINAL_WORKSPACE_UUID",
        "settings": {
          "workspaceDirectory": "/absolute/private/original-stellar-workspace",
          "inboxDirectory": "/absolute/private/original-buyer-inbox",
          "port": 0
        }
      },
      "operationDirectory": "/absolute/private/stellar-expert-operation",
      "runIds": ["ORIGINAL_FIRST_RUN_UUID", "ORIGINAL_REOPEN_RUN_UUID"],
      "editionId": "ORIGINAL_EDITION_SHA256",
      "receiptId": "buyer-ORIGINAL_RECEIPT",
      "intentIds": ["ORIGINAL_PAGE_ONE_INTENT", "ORIGINAL_PAGE_TWO_INTENT"],
      "expectedRows": 100,
      "exportIds": ["export-ORIGINAL_COMPLETE_JSON_EXPORT"]
    }
  ]
}
```

The NWS entry has the same shape with request product `nws`, its original workspace/receipt/edition/export IDs, and its actual customer row count. A two-product receiving operation includes both entries. Each request names the actual source commit of its own selected runtime. The two READY installations may come from different accepted cuts.

The application request's optional private merchant runtime file can be retained in `settings.releaseRuntimeFile` when needed by the selected original workspace. This receiving operation reads saved source and completed customer data; it issues no source capture or buyer purchase.

Paths must be real, private directories owned by the current operator. Create the original Runtime Workspace first, or point at the existing manager. The programme retains all phases in `journal.json` and uses the original Linux file lease.

## Run and continue

Run through the existing equipped native worker with the same private input file:

```sh
node products/stellar-expert/receive-installed.mjs /absolute/private/receiving-inputs.json
```

Retain the operation ID, input hash, journal and original Applications state if the carrier disconnects. Reconcile the existing process before resuming the same programme. It reuses saved reviews, application IDs, original start requests, file manifests and verified download prefixes. A successfully completed result returns its original completion without another operating run.

## Complete operating path

For each selected product, the programme:

1. Inspects the original READY/runtime/source-selection binding and attaches it to the original Runtime Workspace.
2. Performs the saved Applications review, Save/adopt and original managed attachment.
3. Starts the selected original application, checks its actual startup record and authenticates the workspace UUID.
4. Opens the original operator browser at desktop and 390-pixel widths, visiting all five StellarExpert or seven NWS sections.
5. Connects the original merchant adapter, reads every advertised product tool descriptor, and checks the original source edition and completed customer receipt.
6. Receives every original source page, every supplied complete export and all five original customer files through the original retained-file client. For NWS revalidation, a differing retained wire representation is received separately.
7. Verifies each received manifest and payload offline.
8. Closes the merchant and stops the original Applications run, then repeats the installed open/file path on the same workspace after reopening. The existing source/customer manifests remain identical.
9. Closes every owned browser, MCP and original application lifetime before writing COMPLETE.

A source/layout/tool/file error preserves the original error and every cleanup failure. The journal identifies the exact receiving selection and completed stages. A wait for the original managed attachment or application startup returns continuation state while retaining the original operation.

## Artifacts and handover

The private result contains the selected runtime and application/workspace IDs, actual source pages, original ordered customer intents, row counts, tool inventory, file metadata, two original run histories and the final operating handover.

Screenshots are stored under the relevant product folder, with run, viewport and section in each filename. Source files, customer files and complete exports have separate retained transfer directories. Every output uses its original source hash or transfer manifest.

The product handover `handover.json` remains private. It includes paths and selected operational inputs needed to reopen the same installation. The source repository contains the programme and its input schema; the equipped worker owns its actual execution and completion receipt.
