# Native commissioning and independent receipt

Requires Node20 or later. No package installation, network call, OAuth registration, API key or paid compute is required. Run in a private directory containing the complete source. The UI and domain modules share the same source.

## Whole course

    node native/run-costing-course.mjs /new/private/cpg-course

This invokes the actual production core with the authored scenario. It preserves a blank workspace, full two-edition example, exact source files, reports in JSON/Markdown/HTML/CSV, comparison, all check outcomes and a completion inventory. Output is create-only. Re-running against the same owned output validates equal files; a different output is never overwritten. A partial write is staged under a unique private name and published through a create-only link.

The pure course is also executable with an explicit V8 runtime adapter. Such execution is labelled source execution and is not an actual Node or browser claim. The actual native command records its Node version.

Checks cover the entire source/mapping/freeze/review/reopen workflow, exact large decimals, weighted charges, cumulative consumption and channel overdraw, missing fee coverage, currency mismatch, recipe/receipt dates, source pointer resolution, incomplete-edition reopen and exact operation replay. The dimensional example distinguishes 153 units × 12 oz ÷ 16 × 1.05 = 120.4875 lb from a 95% yield convention, which is 153 × 12 oz ÷ 16 ÷ 0.95 = 2295/19 lb.

## Ordinary owner workflow

    node native/costing-cli.mjs blank /private/blank.json "Selected CPG review"
    node native/costing-cli.mjs source /private/blank.json /private/receipts.csv /private/meta.json /private/with-source.json text/csv
    node native/costing-cli.mjs inspect /private/with-source.json SOURCE_ID /private/inspect.json /private/inspection.json
    node native/costing-cli.mjs map /private/with-source.json SOURCE_ID /private/mapping.json /private/mapped-rows.json
    node native/costing-cli.mjs save /private/with-source.json /private/edition-payload.json /private/save-meta.json /private/edition.json
    node native/costing-cli.mjs review /private/edition.json /private/review-payload.json /private/review-meta.json /private/reviewed.json
    node native/costing-cli.mjs compare /private/reviewed.json LEFT_EDITION RIGHT_EDITION /private/comparison.json
    node native/costing-cli.mjs receive /private/reviewed.json /new/private/independent-receipt

The source command's JSON output contains its sourceId and resulting rootSha256. Metadata files contain operationId, expectedRoot and an actual ISO timestamp selected by the operator. Each subsequent expectedRoot comes from the previous completed workspace. Operation IDs identify one exact payload and cannot be reused for different content.

Inspection options:

    {"format":"csv"}

JSON inspection may use arrayPointer. Mapping options explicitly name each destination field and source header:

    {"format":"csv","mapping":{"id":"Receipt ID","itemId":"Material","quantity":"Received quantity","unit":"UOM","invoiceAmount":"Invoice total","currency":"Currency","receivedDate":"Receipt date","chargesComplete":"Charges complete"}}

Use the full field contract in costing/input-fields.json. The map command does not guess missing business fields or write a completed edition. Combine selected mapped tables with an owner-reviewed input manifest, then preview in the desk before saving.

Edition payload:

    {"name":"Reviewed October scope","input":{"schema":"tjlabs.cpg-costing-input.v1","currency":"USD","asOf":"2026-10-14","lots":[]},"preparedBy":"Named operator","note":"Selected source scope"}

Populate all relevant tables; an empty or incomplete model does not produce a ready contribution. A corrected edition can include parentEditionId. Review payload names a frozen edition, decision, reviewer and note.

## Complete independent receipt

The receive command validates and replays the complete original workspace first. It writes every original byte stream under a numbered path and preserves original filenames, media types and hashes in originals/index.json. Every frozen edition retains input, report JSON, human-readable report, spreadsheet report and its parent comparison. All reviews remain present. COMPLETE.json lists exact output members.

No live accounting balance, inventory availability, food-safety approval, tax result, purchase order or external communication is created. The owner retains production and accounting authority. Customer data and source remain private.

The offline browser course is provided by the operator contribution. It must inspect desktop and narrow layout, source intake, pending invalid drafts, preview/freeze/review/compare, original download, working JSON and editable HTML reopen on the complete final source.
