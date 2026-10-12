# Federal funding reports

A funding report combines an award's original transaction history with an analyst's reviewed explanation. The complete delivery contains the report, exact monetary values, original award editions, every transaction source page and both observations used in a comparison. A receiving customer can open the report, extract all source files, and prepare a revised edition in the same application.

The existing **federal-awards** product supplies the private browser, command line, native merchant tools, managed Applications entry and portable workspace. The report service uses the original SF30 file-product merchant. Its customer catalog enters the original SF88 buyer review, payment and response-file workflow.

## Complete the analyst workflow

Open the saved Federal awards workspace and choose **Funding reports**.

1. In **Transactions**, capture the complete funding history for the selected original award. Inspect action dates, modification numbers, agency descriptions, separately reported award values and exact obligation amounts. Save the workshare assessment.
2. In **Funding reports**, select that completed capture. Select an earlier complete observation of the same award when the report should explain changes between observations.
3. Enter the public title, publisher, purpose, findings, implications and use terms. Prepare the complete draft. It binds the saved source assessment revision, original source fingerprint and every supplied public field.
4. Open **Review complete report**. The report includes the full chronological timeline, fiscal-year totals, source conflicts, repeated occurrences and original observation times. Download the HTML or CSV when useful for review.
5. Publish the exact reviewed report edition. If its local workshare assessment changed during preparation, reopen the current assessment and prepare the new draft.
6. Deliver the complete file directly, or prepare its merchant service with the selected public origin, path and payment terms.

The public report contains the text entered in its editor. The private assessment remains in the research workspace. Publishing selects an immutable report edition. Starting its merchant service makes that edition available through the configured original service.

### Interpreting the figures

All monetary values retain their original decimal strings. Unknown amounts stay unknown. The report distinguishes award obligations, transaction obligations, exercised value, all-options value and outlays.

Identical occurrences of a transaction remain available in the source and appear in the repeated-occurrence section. Conflicting versions remain available together; their affected amounts are excluded from known subtotals and prevent a complete net total. The fiscal-year view preserves ambiguity when conflicting dates cross a fiscal-year boundary.

A comparison describes two retained observations of the same award. Added records, changed fields, absences and unresolved conflicting records have separate meanings. The agency's action description remains separate from the numerical direction of an obligation. The original comparison engine supplies every value.

## Command line

All report commands use the original private research directory. Before installation, substitute:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/cli.mjs
~~~

for `starforge usaspending-research`.

Inspect the completed capture and its saved assessment:

~~~sh
starforge usaspending-research tx-state --workspace /private/federal-awards
starforge usaspending-research tx-summary \
  --workspace /private/federal-awards --capture RETAINED_CAPTURE_ID
~~~

Write a private report request using the returned capture identity and actual assessment revision. `operationId` is a stable identity for this complete input; reuse it when recovering the same request.

~~~json
{
  "operationId": "REPORT-SELECTED-ENGAGEMENT-01",
  "captureId": "RETAINED_CAPTURE_ID",
  "expectedReviewRevision": 1,
  "content": {
    "title": "Selected award funding history",
    "publisher": "Selected report publisher",
    "purpose": "Explain the selected award's recorded funding history for the intended reader.",
    "findings": "The reviewed findings, with original actions and amounts explained in context.",
    "implications": "The actions the reader should consider from these findings.",
    "useTerms": "The publisher's selected report-use and attribution terms."
  }
}
~~~

Add `beforeCaptureId` to compare another complete observation of the same award. Prepare and inspect the draft:

~~~sh
starforge usaspending-research report-prepare \
  --workspace /private/federal-awards --file /private/report-request.json
starforge usaspending-research report-draft \
  --workspace /private/federal-awards --report RETURNED_REPORT_ID
starforge usaspending-research report-export \
  --workspace /private/federal-awards --report RETURNED_REPORT_ID \
  --kind html --out /private/reviewed-report.html
starforge usaspending-research report-publish \
  --workspace /private/federal-awards --report RETURNED_REPORT_ID \
  --sha256 RETURNED_REVIEWED_REPORT_SHA256
~~~

Use `report-export --kind delivery` for the complete gzip file, `json` for the editable report packet or `csv` for spreadsheet-safe full transaction data. Output files are create-only and the command returns each file's size and SHA256.

### Report revisions

To revise a saved or received report, prepare a request containing `operationId`, `sourceReportId` and the complete new `content`. Original source packets and the preceding report identity remain in the successor. This also works in a receiving workspace that has the original report without a local provider-capture database.

Each report and its complete original delivery remain independently exportable. Reusing the same operation and input returns the same prepared report; changing input under an existing operation identity is rejected.

## Prepare the original merchant

Create a private merchant request with the published report ID, actual HTTPS origin, fixed report path and existing merchant's selected native payment object:

~~~json
{
  "reportId": "RETURNED_REPORT_ID",
  "origin": "https://reports.your-domain.example",
  "path": "/funding-reports/selected-award",
  "payment": {
    "scheme": "exact",
    "network": "stellar:testnet",
    "amount": "SELECTED_ATOMIC_AMOUNT",
    "asset": "SELECTED_STELLAR_ASSET",
    "payTo": "SELECTED_MERCHANT_ADDRESS",
    "maxTimeoutSeconds": 60
  }
}
~~~

Replace selection placeholders with the operator's actual terms, retaining any original `extra` fields required by the selected asset or payment flow. Mainnet operation uses its explicitly selected `stellar:pubnet` configuration. The original seller compiler validates the complete terms.

~~~sh
starforge usaspending-research report-merchant-prepare \
  --workspace /private/federal-awards --file /private/report-merchant.json
starforge usaspending-research report-merchant-catalog \
  --workspace /private/federal-awards --merchant RETURNED_MERCHANT_ID \
  --out /private/report-catalog.json
starforge usaspending-research report-merchant-serve \
  --workspace /private/federal-awards --merchant RETURNED_MERCHANT_ID \
  --port 8423 --facilitator SELECTED_HTTPS_FACILITATOR
~~~

The original service binds to loopback and uses the operator's HTTPS proxy for its public origin. Its standard `/_seller/health`, `/_seller/offers` and `/_seller/docs` endpoints describe the running service. The facilitator and signer retain their original setup and execution semantics.

A merchant preparation is keyed by the report and exact public route/payment selection. Repeating it verifies and reuses the completed original bundle. After an interrupted preparation or workspace move, the same selection recovers through a retained new preparation attempt. Existing outputs remain in the attempt history.

The complete delivery must fit the original single-asset limit of 16 MiB compressed and the report's 128 MiB decoded capacity. Selecting a smaller award edition can reduce the source package while retaining the selected award's complete transaction history.

## Receive through the original buyer

The report catalog is the original SF30 asset catalog. SF88 preparation binds the exact report file's size, SHA256 and media type into its normal response-file destination:

~~~sh
starforge buyer --prepare \
  --discovery /private/report-catalog.json --row 0 --accept 0 \
  --intent-id ORIGINAL_SELECTED_REPORT_INTENT \
  --url ACTUAL_SELECTED_REPORT_URL --method GET \
  --response-out /private/customer-files/report.funding-report.gz \
  --out /private/report-review.json
~~~

Use the existing [buyer workspace](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/README.md) or [commerce browser](../../stellar/scf-starforge-20261009/sf66-demo-launcher/COMMERCE_CONSOLE.md) to review and execute the selected operation. The original [durable inbox](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/QUEUE.md) retains the attempt, payment evidence, response file and any recovery.

When the original response file is saved, receive it by that same inbox and intent:

~~~sh
starforge usaspending-research report-adopt-buyer \
  --workspace /private/customer-research \
  --inbox /private/original-buyer-inbox \
  --intent ORIGINAL_SELECTED_REPORT_INTENT \
  --receiving-root /private/customer-files
~~~

This uses the original inbox reader and file verifier. It checks the selected intent, completed response, receiving root, full size and digest. It reads the same verified file descriptor and retains the original buyer outcome, payment terms, source snapshot and exact file alongside the report.

The browser provides this action when started with `--receiving-root`. It also accepts the complete original gzip file through **Open the complete file**:

~~~sh
starforge usaspending-research report-receive \
  --workspace /private/customer-research \
  --file /private/customer-files/report.funding-report.gz \
  --sha256 ORIGINAL_FILE_SHA256
~~~

Repeated receipt of the same original observation returns its saved receipt. Separate buyer intents or subsequent original inbox observations retain their own receipts.

## Extract, reopen and hand over the full work

~~~sh
starforge usaspending-research report-extract \
  --workspace /private/customer-research --report RECEIVED_REPORT_ID \
  --directory /private/received-report
~~~

The receiving directory contains:

| File | Use |
| --- | --- |
| `report.html` | Complete readable report, source chronology and comparison |
| `report.json` | Public report text, full source packets and exact analysis |
| `transactions.csv` | Complete spreadsheet-safe transaction occurrences |
| `before-transactions.csv` | Earlier occurrences when a comparison was selected |
| `source/award-edition-*.json` | Complete original award editions and source bytes |
| `source/transactions-after.json`, optional `source/transactions-before.json` | Full original transaction-capture packets |
| `source/after/`, optional `source/before/` | Every unchanged response page and acquisition record |
| `FR-….funding-report.gz` | Exact complete original report delivery |
| `receiving-selection.json`, `receiving-complete.json` | Selected receiving contents and completion |

Reusing the same directory checks existing files and fills missing files from the same selection. Changed existing files stay in place so the operator can choose a new directory for a separate delivery.

The original workspace backup includes report drafts, publications, complete original delivery bytes, receiving observations and merchant preparation history:

~~~sh
starforge usaspending-research backup \
  --workspace /private/customer-research --out /private/customer-workspace.json
starforge usaspending-research restore \
  --workspace /private/restored-customer --file /private/customer-workspace.json
starforge usaspending-research serve --workspace /private/restored-customer --port 0
~~~

Restore validates report source packets, analysis, exact delivery bytes, local source-review bindings and receipt identities. Older award-only and transaction workspaces remain readable.

## Native merchant tools and host handles

The existing `usa-spending-workspaces` provider exposes:

| Native action | Purpose |
| --- | --- |
| `merchant_usaspending_report_inventory` | Page reports and merchants with the original inventory snapshot |
| `merchant_usaspending_report_draft` | Read selected public content, source and receiving state |
| `merchant_usaspending_report_prepare` | Prepare or recover a complete original report input |
| `merchant_usaspending_report_publish` | Publish its exact reviewed report SHA256 |
| `merchant_usaspending_report_merchant_prepare` | Prepare under host-selected terms and the explicit report path |
| `merchant_usaspending_report_buyer_adopt` | Receive one original intent from a host-declared inbox |
| `merchant_usaspending_report_extract` | Receive all report files in a private workspace subdirectory |
| `merchant_usaspending_source_import` with source kind `funding-report` | Read a declared complete report file |
| `merchant_usaspending_export` | Retain `funding-report-delivery`, `funding-report-json`, `funding-report-html`, `funding-report-csv` or `funding-merchant-catalog` |
| `merchant_usaspending_file_read` | Transfer every original export byte through the existing resumable reader |

The workspace connection's optional `fundingReports.inboxes` maps aliases to `{directory, receivingRoot}`. Both are existing canonical private directories. Native calls select those aliases; merchant terms remain in the original `merchant` configuration. Direct report sources use the existing `sources` map with `kind: "funding-report"`, `file` and an optional expected `sha256`.

The saved managed **Applications → Federal awards and workshares** entry opens this same browser and database. The report paths are included in the selected product, original contribution and native provider.

## Complete original receiving program

The maintained `reports/run-native.mjs` receives the original award and transaction source packet into a private operation directory, prepares and publishes the report, exercises its browser API and CLI, transfers the complete native export, reopens the same report and restores its complete workspace.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/reports/run-native.mjs \
  --source /private/original-award-transaction-source.json \
  --out /private/funding-report-receiving
~~~

An existing public merchant selection can be supplied with `--merchant /private/original-report-merchant-selection.json`. An existing completed buyer operation can be joined with `--buyer-inbox`, `--buyer-intent` and `--buyer-receiving-root`. These selections stay bound to the operation directory on continuation. The program records the original service, buyer and receiving outcomes it executes.

### Received merchant workspaces

Workspace backup retains the complete report asset, exact merchant configuration and preparation history. When a workspace is restored in a new directory, its merchant catalog, prepare and serve commands regenerate the original bundle and catalog inside that receiving workspace. They preserve the earlier attempts as history and bind the regenerated asset, route, public origin and payment terms to the same report. Restored interrupted preparations release the former process owner so the receiving operator can continue the same merchant.
