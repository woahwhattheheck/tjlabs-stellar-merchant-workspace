# Complete live-collection comparison customer operation

This original customer operation receives the completed 830-row Orders collection, creates a second explicit country-field selection from the same five retained responses, and operates the entire comparison workflow through the original OData UI, native CLI, Analysis, reports, workbooks and workspace receivers.

The original completed collection operation remains the input. The new operation is `ODATA-LIVE-COMPARISON-CUSTOMER-F971-20261012-R1`. The second selection keeps OrderID and ShipCountry; the actual comparison identifies omitted fields with their original key, before value and null state. Both acquisitions and complete source files stay attached.

## Selected runtime and original input

Use the immutable complete comparison source plus its adjacent `comparison-customer.py` and `comparison-customer.mjs`. The host supplies an exact runtime inventory containing `source_ref` and `files`, with each original repository path, byte count, SHA256 and Git blob SHA. The Python operator verifies the entire selected inventory before entering the customer operation. Node24, the original installed seller dependencies, Python with openpyxl, the existing Playwright module and the actual Chromium executable are required.

The original completed checkpoint is `OData_Customer_Operation_Checkpoint_0140a6bea4f46da9.zip`, 6,842,636 bytes, SHA256 `0140a6bea4f46da94f222b14d409639b092d4cdd392f8e954081976056d97983`. Its member `operation/OData_Collection_Workspace.json` is the original selected transfer. Retain the actual member bytes and hash separately. The baseline collection is `northwind-orders-complete` in live service `orders`, SHA256 `f811529bf906eb890b6654839a5ec1d201f6c71fa79a752745675caf29cca994`.

Use one private output directory and this descriptor shape, filling only actual selected paths and original file identities:

~~~json
{
  "schema": "stellar-forge.odata-comparison-customer-input.v1",
  "operationId": "ODATA-LIVE-COMPARISON-CUSTOMER-F971-20261012-R1",
  "baseline": {"path": "/absolute/original/OData_Collection_Workspace.json", "bytes": 0, "sha256": "actual-member-sha256"},
  "serviceId": "orders",
  "beforeCollectionId": "northwind-orders-complete",
  "beforeSha256": "f811529bf906eb890b6654839a5ec1d201f6c71fa79a752745675caf29cca994",
  "expectedRows": 830,
  "afterCollectionId": "orders-country-projection",
  "afterFields": ["OrderID", "ShipCountry"],
  "comparisonId": "orders-projection-review",
  "title": "Original Orders: full source and customer country projection",
  "actor": "Customer receiving analyst",
  "outputDirectory": "/absolute/private/customer-operation",
  "playwright": "/absolute/installed/playwright/index.mjs",
  "chromium": "/absolute/installed/chrome-headless-shell"
}
~~~

The zero byte placeholder and illustrative paths above must be replaced with the actual input identities. Keep the complete original baseline source unchanged.

## One complete operation

Set SOURCE, INPUT, SOURCE_SELECTION, SOURCE_SELECTION_SHA256, SOURCE_REF and NODE to the actual selected values:

~~~sh
umask 077
python3 -B "$SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/examples/comparison-customer.py" \
  --checkout "$SOURCE" --input "$INPUT" --source-ref "$SOURCE_REF" \
  --source-selection "$SOURCE_SELECTION" --source-selection-sha256 "$SOURCE_SELECTION_SHA256" \
  --node "$NODE"
~~~

The original Node phase restores the complete baseline, selects both collections in the existing UI, creates the comparison, and saves an actual cell review through the original form. It retains the exact submitted request before sending it and retries that same saved request through the native API and CLI. Three additional real decisions cover the entity, column and comparison. It publishes the reviewed edition, saves a later handover note and publishes the later edition.

Both editions are received independently. Receiving the earlier matching edition preserves the later review history. The operator downloads the whole OData workspace and receives it through the actual Restore control, then reopens its original baseline collection, comparison and reviews.

The original Python Analysis phase registers the complete published source document, previews and imports its exact CSV projection, and operates two saved SQL queries. It compares every returned text/state cell with the original CSV and derives the complete field/state summary. The same result becomes a published two-section report and two-sheet workbook. Original report exports, full workbook handover, independent workbook receiving, complete Analysis archive/restore and restored query replay are included. Finally the Node phase restores the comparison directly from the Analysis-held source and receives the earlier edition again.

The final `OData_Complete_Comparison_Customer_Edition.zip` includes the report, workbook and full handovers, original changed-cell and summary exports, complete OData and Analysis workspaces, all saved reviews, screenshot, opening instructions and exact source/output identities. The complete exact selected runtime source, current customer receivers and guide are streamed into the same archive under `SOURCE/`; the member manifest binds every source byte. Opening instructions select that extracted source directory.

## Continue the same selected operation

Add `--resume` with the same input bytes, source inventory, source ref and private output directory. Keep those original paths when restoring its operation checkpoint. The controller holds one output OS lock and passes it into the original Node phases. A completed preparation reopens its saved identities. Original review requests and completed native job IDs remain selected; an explicitly resumed failed native job retains its prior outcome before selecting its next attempt.

The first successful Analysis restore receipt is retained; later per-call reuse observations do not rewrite the completed customer result. The original full workspace transfer bytes remain selected across a retry, including their first export timestamp. Complete final files are installed exclusively; packaging resumes its selected owned candidate and preserves a structurally complete mismatched archive for review.

The one-lifetime host must retain the entire output directory, native stdout/stderr and source selection before its private runtime ends, including after an unsuccessful phase. Receive that checkpoint into the same private output path and invoke the same operation with `--resume`. A new source version requires a concrete reviewed continuation of the existing original operation.

## Product source

The complete product API and source-format contract are in [COLLECTION_COMPARISONS.md](../COLLECTION_COMPARISONS.md). Comparison commands are also exposed through `odata-live comparison-create --help` and the other recognized comparison subcommands. The native customer operation performs one complete source-backed customer workflow and returns its actual retained results.
