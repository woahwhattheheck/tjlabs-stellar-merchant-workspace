# Import-to-host reconciliation — complete operator guide

Open output/Import_Host_Desk.html in a current desktop browser. The initial workspace is blank. An explicitly authored example is available under Open and restore; its import and host results are fictional.

## 1. Retain original sources

Enter an operation actor. Choose an original UTF-8 file or paste its complete original text, keep the filename, select its role, then Retain this complete original. Roles separate original source files, import payloads, host receipts, readback and notes. Loading a file fills a pending draft; retaining creates its immutable source record.

Select a retained source, choose JSON/CSV/TSV and any JSON array pointer, then inspect it. Source and result tables are paginated; every row remains in the working data and full exports. Exact numeric tokens, string identifiers, quoted CSV records and original references remain available. Download exact original returns the full original text. Invalid UTF-8 files are rejected without replacing current work. This desk's interpreted intake is text, not a binary-file decoder.

## 2. Capture the import in its real scope

Select the exact callback array or webhook envelope original. Enter application, tenant, environment, template ID and the external correlation ID explicitly. A callback is an array of records. A webhook contains import_id, template_id, row_count, imported_at and rows. Unknown original fields remain retained. Capture preserves these rows independently of any later host outcome.

Filio's published callback supplies validated rows. Whether the host accepted them is represented by separate actual host evidence. Credentials and live requests are outside the offline desk.

## 3. Map the source to the host contract

Select the captured import and give the mapping an identity and label. Complete keyPointers and fields in the editable mapping JSON. Add field mapping provides a structured editor; raw invalid mapping text remains recoverable.

Example shape only:

    {"keyPointers":["/sku"],"fields":[{"id":"sku","label":"SKU","sourcePointer":"/sku","targetPointer":"/sku","mode":"text"}]}

Typed mode preserves differences among number, string, boolean, null, array and object. Decimal mode explicitly permits mathematical equality of finite decimal/exponent values and strings. Text mode requires text. Neither the interface nor the domain invents business-key correspondence. Preview every key, field and finding before retaining the immutable mapping.

## 4. Prepare the complete host plan

Select the retained mapping. Prepare blank action rows creates one pending action for each original row; it does not choose the action. Select create, update or skip explicitly. Update requires the actual target record ID. Create leaves that identity to the host response. Skip retains its reason and original row.

Give the plan a named reviewer and note. Preview all findings. An unresolved active-row key, mapping or action defect prevents freezing. A parent plan can be selected for a new edition. Use selected as a new draft preserves the previous unfinished session and starts a distinct immutable record. Freezing prepares a plan; it does not execute or authorize a host write.

## 5. Reconcile actual retained host observations

Retain the complete actual host result and readback as sources. Their format is the authored host-adapter contract in integration/CORE_API.md; it is not a claimed Filio response schema.

The host-result source binds batch ID/hash, scope, attempt, observation time, provider reference and per-source-row accepted/rejected/uncertain/not-attempted results. Accepted rows identify actual target records. Readback identifies scope, observation time, explicitly requested IDs and complete observed target values.

Select these originals and the exact frozen plan. Preview every row. Matched, divergent, rejected, uncertain, unobserved and skipped outcomes remain separate. Missing or stale observation, duplicate target identities, source mismatches and incomplete coverage stay visible. Values shown as unobserved are not converted into null or zero. Freeze the complete observation edition after a named review.

## 6. Compare explicit editions

Select a baseline and candidate reconciliation. Suggest exact unique key pairs offers an editable starting point. Review pair correspondence, ambiguity and all unmatched populations. A changed source expectation and a changed target are separate facts from a changed result. Preview and freeze the whole comparison. Earlier imports, mappings, plans and observations remain unchanged.

## 7. Record named row decisions

Under Review and report, select the exact reconciliation or comparison. Every result keeps its source references and full review history. Select an actual row, status, owner, reviewer and reason. Appending a decision links to its prior review. It does not overwrite the original host observation or silently declare an uncertain write successful.

Complete report JSON retains every selected record and source reference. CSV contains full paired/unmatched populations and exact value text. Original source JSON remains the authority for numeric type and lexeme.

## 8. Save and reopen the full work

Complete working JSON includes immutable domain history, all raw form drafts, selections, actor, pending mappings/action rows/review notes and prior sessions. Editable HTML includes the same session and the exact complete application source. Domain workspace JSON contains the immutable domain only; use complete working JSON for unfinished work.

Successful import retains the prior session even when it has no operations. Restoring a prior session retains the current one. Failed receive/admission preserves the current committed state. Backups are direct snapshots, avoiding recursive duplication.

Browser storage is a convenience. If quota or another open tab prevents saving, the visible status says so and the entire current work remains in memory. Export it. Open and restore can download the exact saved browser original, open it, or explicitly select the current session while retaining the other. An unreadable saved browser value is preserved rather than overwritten.

The handover ZIP includes selected source, working JSON, editable HTML, selected report JSON/CSV and every original. Before a saved domain change, the whole handover is measured against 128 MiB and 2,000 members. The writer validates member paths and checksums. Use a separate workspace when complete scope is too large.

## Source build and receiving

Source preparation and reconciliation execute synchronously. The desk shows a working notice and saves pending input before starting an action. Larger scopes can occupy the browser while calculation runs; use the supplied native CLI for repeatable larger receiving. The retained capacity course records actual runtime and scope rather than promising an interactive latency.

No third-party installation or network call is required:

    node native/build-desk.mjs NEW_OUTPUT.html
    node native/receive-desk.mjs

The builder validates source-manifest.json and creates a new file. Source paths are sorted, so input insertion order does not change the resulting output. The existing full source receiving course and docs/BROWSER_RECEIVING.md follow the complete import-to-host workflow.

Filio public reference: https://www.usefilio.com/docs . Installation still requires selection of the actual released SDK and the customer's host contract. The public homepage uses publishableKey while the documentation uses apiKey. The documentation describes a signature header without publishing its complete verification format. The offline product preserves supplied originals and does not infer those live installation details.

## Materialize the complete source

Use the separately supplied unchanged helper before source extraction:

    python3 materialize-source.py COMPLETE_SOURCE.json NEW_DIRECTORY

It accepts the complete source object or its gzip+base64 envelope, checks member identities and publishes files without overwriting conflicting originals. The same helper is retained as native/materialize-source.py. Binary ZIP members are carried in the complete bank's binary_files array. The full technical parser ancestor and prior domain core sources are included in the native manifest and source export.
