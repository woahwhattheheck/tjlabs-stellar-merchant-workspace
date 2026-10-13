# ROZO in the configured Accounting and Buyer owners

ROZO's Finance tab uses the same configured Accounting workspace, Buyer expense server, native leases, source editions and Accountant handoffs as their existing tools. The ROZO journal retains each complete finance intent before its native owner is called. Request IDs, original revisions and selected workspace/source bindings travel with the operation.

## Start the complete application

Use the existing merchant host JSON. Its original configuration contains an Accounting workspace map and, when Buyer is selected, its original buyerExpenseConnection file. Select declared aliases rather than local workspace paths:

    rozo-payments serve --workspace /private/rozo --config /private/rozo-connections.json \
      --merchant-config /private/merchant.json --accounting merchant-books --buyer purchases

The usual complete source-manifest arguments still apply to a checked-out or installed application. The managed Applications form includes the original merchant configuration and the two aliases, pins both the host file and its referenced Buyer connection, and checks the started application's selected aliases. The installed ROZO selection includes the existing Buyer/Accounting source inventory, source-owned provider declarations, native Python receiving, Accountant source readers and original maintenance commands.

Accounting and Buyer remain optional for ordinary payment operations. In an Accounting alias with sourceMode buyer, the Finance tab uses the original Accountant and Buyer workflow; merchant source coding and closing use a merchant-mode Accounting alias.

## Original merchant report intake

In an existing merchant-mode Accounting definition, add a rozoSources map using the same host-relative path convention as other original source maps:

    "rozoSources": { "october": "./incoming/original-rozo-finance-source.json" }

The tool interface takes the configured alias, exact file SHA-256, name, provenance and explicit development or operational data context. Source bytes are read from the configured private host and verified before dispatch. Source files may be up to 64 MiB.

1. Open merchant_accounting_open for the Accounting alias.
2. Call merchant_accounting_rozo_source_preview with source and sourceSha256. Page the original movements.
3. Retain merchant_accounting_rozo_source_capture with that previewSha256, a stable requestId, expectedRevision and actor.
4. Use merchant_accounting_rozo_source_review to accept or reject the pending edition with its reason.

Successor editions retain their prior capture. A removed movement stays visible in history; previously issued periods preserve their original source. A report's original CSV and HTML are retained byte-for-byte with that saved report, so a later UI or renderer release does not rewrite historical evidence.

## Coding and periods

merchant_accounting_rozo_status provides summary counts or paged sources, captures, rows, periods, closes, reviews and requests. It returns the native Accounting revision and binding.

merchant_accounting_rozo_coding_save requires the current movementId, basisSha256 and expectedVersion, explicit recognitionDate, a reason and providerEvidenceAcknowledged:true. Allocate its exact original native amount across one to 200 lines. Each allocation has amount and accountCode, with optional costCenter, project and memo. Allocation totals must equal the original movement. Source payment, fee and payout movements keep their own identities and native units.

Create or revise a dated definition with merchant_accounting_rozo_period_save. A stable requestId preserves lost-response recovery; editing uses the original period id and expectedVersion.

For an unresolved or removed movement, merchant_accounting_rozo_disposition_save retains an explicit carry_forward or exclude_from_period decision for the selected period and source basis. It preserves the original missing flag and reason.

merchant_accounting_rozo_period_preview selects period {id,version}, sourceIds and dataContext. Page issues, lines, excluded, outside and sourceCaptures. Retain the exact contextSha256 in period_review, then issue period_close from its ready review. A correction uses period_reopen with the issued closeId and reason, retaining the entire previous close chain.

## Accountant and original files

merchant_accounting_rozo_accountant_prepare reviews an issued closeId and its exact sourceSha256. accountant_create retains that same source in the existing Accountant using id, name, actor and the current Accounting revision. The ordinary merchant_accounting_accountant, accountant_rows, accountant_preview and accountant_apply operations handle its bookkeeping return. Original payment classifications and native amounts remain protected by the original Accountant engine.

Use the existing merchant_accounting_file reader:

| kind | Required original selector | Content |
| --- | --- | --- |
| rozo-capture | rozoCaptureId | Complete original ROZO finance source |
| rozo-close | rozoCloseId | Issued original accountant source and close |
| accountant | handoffId, optional revisionId, file | Original Accountant packet, CSV, review and retained source |

The captured report downloads as original-rozo-finance-source.json; its original name remains in the capture. For Accountant packets, original-rozo-source.json contains the issued source. Preserve readId, selectors and expectedSha256 across chunks; file_release frees an unfinished temporary read. Native original files remain retained.

## Recovery and complete receiving

After an interrupted finance mutation, inspect merchant_accounting_rozo_request using its original requestId. Resume a pending original request with merchant_accounting_rozo_resume. This loads its retained complete intent rather than rebuilding the operation against changed data.

The Finance tab exposes the existing Buyer source capture, original coding and period workflow, native Accountant returns, and complete Buyer project archive. Original Buyer MCP operations and its existing expenses client remain available from the same package.

For the complete shared Accounting project, use its configured maintenance lifecycle: pause, review, backup, verify, restore and resume. Use the original returned job and backup identities, configured private passphrase environment, reviewed SHA-256 and intended original destination. An issued Accountant packet is one retained business output; the original encrypted Accounting backup carries its complete operating state, including ROZO source files, coding, requests and period history.

The application closes its original service and drains admitted finance operations before closing the configured merchant owners. A second operator or installed application must acquire the same native workspace leases before it can operate those original directories.
