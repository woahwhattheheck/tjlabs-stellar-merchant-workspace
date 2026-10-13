# Commerce export reconciliation and original case receiving

This contribution operates one selected pair of commerce/CRM exports and its reviewer return. It is an additive part of the original Merchant Support product. The example is authored receiving data, not Rigby customer data. The price and customer scope in commercial/Rigby are proposed.

## What is included

- commerce-reconciliation.mjs: one source comparison/review engine.
- commerce-reconciliation-cli.mjs: exact package creation, full receiving recomputation and original-case attachment.
- commerce-reconciliation-desk.html: complete local browser using the same engine and maintained strict UTF-8 SHA-256 implementation. It needs no network or login.
- commerce-receiving/example-input.json and example-review.json: explicitly authored original receiving exercise.
- commercial/Rigby: complete proposed scope, implementation plan, inputs and acceptance rows.

The browser contains the exact engine and the complete unchanged Commons host/connected_sha256.cjs at blob 00ea4654bc52f1025a04e9675e37d8c63cd40905, including its upstream MIT license. Its embedded engine is generated from the same full source with only module export keywords removed. It does not have another comparison implementation.

## Select and review in the browser

Open commerce-reconciliation-desk.html directly in a current browser. The page loads the authored example. Use Open complete retained input JSON for an actual saved selection, or replace each CSV and edit the complete input JSON's selected scope, reference, original capture timestamps and column mapping.

Every input declares amount_unit as major or minor and currency_scales explicitly. The input stores raw UTF-8 source content, original filenames, byte lengths and SHA-256 values. A CSV replacement updates only its original file content/name/identity; it does not invent a capture timestamp or extraction completeness. UTF-8 BOM is preserved. Malformed UTF-8 is rejected. Each export is bounded to 16 MiB and 50,000 records.

Choose Analyze selected exports. Duplicate exact keys remain findings; no row is silently preferred. Nonrepresentable currency precision is invalid. Amounts use exact decimal strings and BigInt minor units. Missing records from a partial scope are observed-only findings. The selected customer-key comparison does not authenticate a person; status comparisons require explicit equivalence pairs.

Save complete input. Record the actual reviewer, UTC time, decision authority and each selected issue's outcome/reason/source reference. Leave other issues pending. Save source-bound review. Report/CSV downloads show the current analyzed or recorded result; unsaved form dispositions enter the result only when Save source-bound review validates them. Keep both saved JSON files. The page is a local editor; the original case is the durable operating record.

### Complete browser working copies

The browser’s **Working copies** section retains the complete input text, including invalid or unfinished JSON, separately from the original analyzed input and last recorded review. It also keeps every raw disposition, reason and reference, the reviewer fields, and the original opened review text. Recording selected decisions does not remove unfinished notes on findings left pending. The report continues to show the last native analysis or recorded review; Save complete input and Save source-bound review retain their original strict validation.

Use **Download complete working copy** to keep all current fields in one JSON file. This remains available if local storage cannot open or a save fails. **Open complete working copy** validates the retained native source and recorded review before replacing any fields; unfinished input and review fields remain editable. The complete-copy receiver allows up to 512 MiB to carry original and editable source representations together. The existing 40 MiB input, 16 MiB review and 16 MiB CSV file limits remain unchanged. Every file is decoded as strict UTF-8; an optional leading BOM is removed only for JSON parsing, while original input/review text and CSV bytes remain retained.

Local copies are separate for each browser window. Saves use a serialized IndexedDB transaction and a revision comparison; a conflict preserves the other saved copy and leaves the current fields available for download or **Save as a separate copy**. Reloading forks the window’s last committed complete copy into a new local copy. **Saved local window copies** lists all retained copies with readable save dates and exact identity/revision details. Opening a copy or replacing input, analyzed source, or a recorded review downloads the complete preceding work and retains its original local copy before changing the active fields. Autosave does not disable typing, and the browser warns before leaving with fields that have neither committed locally nor been downloaded completely.

Working-copy files preserve editing state. Continue using the original validated input/review files and CLI review, inspect and attach commands for the complete native Merchant Support receiving package and case history.

## Create and inspect the complete original package

Use the complete installed Merchant Support distribution, including the original SF74, SF49 and their existing transitive dependencies. Add these files at their exact relative paths. Node 20 or newer provides the existing application's normal runtime; no npm dependency is introduced by this contribution.

Set SUPPORT to the absolute sf74-merchant-support-console directory in that distribution and PRIVATE to an existing canonical private parent. Use a new or exactly matching output directory.

```sh
node "$SUPPORT/commerce-reconciliation-cli.mjs" analyze \
  --input "$PRIVATE/commerce-input.json" --out "$PRIVATE/comparison"
node "$SUPPORT/commerce-reconciliation-cli.mjs" review \
  --input "$PRIVATE/commerce-input.json" --review "$PRIVATE/commerce-review.json" \
  --out "$PRIVATE/reviewed-comparison"
node "$SUPPORT/commerce-reconciliation-cli.mjs" inspect \
  --from "$PRIVATE/reviewed-comparison"
```

The package retains request.json, complete input.json, both original CSVs, deterministic result/HTML/CSV, review template, original reviewer return when selected and the exact manifest. Inspect verifies every member and reexecutes the original engine over the original source and return. It does not accept a self-consistent report that differs from its original input.


Original file decoding preserves an initial UTF-8 BOM. JSON parsing consumes that marker only for the parsed value; complete input/review files, CSV originals, their byte lengths and hashes, and original case material retain it unchanged. Invalid UTF-8 and JSON string escapes that cannot represent exact UTF-8 source text are rejected before packaging.


Repeat a partially completed package build with the same input/review bytes and directory. The existing immutable publisher verifies already written bytes; a different source requires a deliberately new package. Do not replace original files under a retained package.

## Attach to the original saved case

Select the actual case ID, saved revision, operator, task IDs if applicable and first UTC time before the first command. Preserve these values and one stable request ID.

```sh
node "$SUPPORT/commerce-reconciliation-cli.mjs" attach \
  --from "$PRIVATE/reviewed-comparison" --cases-dir "$CASES" \
  --case "$CASE_ID" --revision "$CASE_REVISION" \
  --request-id "$REQUEST_ID" --actor "$OPERATOR" \
  --recorded-at "$FIRST_UTC"
```

Attachment uses original operateCaseCommissioning/add_material and original case compare-and-save. It freezes attachment-request.json before dispatch. If the reply or local receipt is lost, repeat exactly that request. The native event hash binds the original type, actor, payload and recordedAt; expected revision does not change the identity. The original event is read before the current revision check. The case receipt retains that immutable result even if later edits changed the current case.

The complete material includes every package original. The existing 48 MiB inline material bound remains authoritative. For a larger complete packet, use the product's existing SF49 native source-bundle receive/attach route with its exact manifest and archive; do not truncate exports or split away originals. This CLI reports the limit instead of silently reducing the package.

A source correction means a new source-bound comparison/review and a new deliberate case action, preserving the prior material. It is not an overwrite of an issued review or case history.

## Full case and source receiving

Use the original implementation CLI and package receiver after obtaining the actual new saved case revision. This carries the complete case history, every retained native source bundle, historical editions and unassigned originals.

```sh
node "$SUPPORT/commissioning-cli.mjs" export \
  --cases-dir "$CASES" --case "$CASE_ID" --revision "$RECEIVING_CASE_REVISION" \
  --source-dir "$SOURCE_BUNDLES" --out "$PRIVATE/complete-case" \
  --export-id "$EXPORT_ID" --generated-at "$FIRST_EXPORT_UTC"
node "$SUPPORT/commissioning-cli.mjs" inspect-package \
  --from "$PRIVATE/complete-case" --sha256 "$PACKAGE_MANIFEST_SHA256"
node "$SUPPORT/commissioning-cli.mjs" receive-package \
  --from "$PRIVATE/complete-case" --sha256 "$PACKAGE_MANIFEST_SHA256" \
  --out "$PRIVATE/received-operation" --cases-dir "$RECEIVED_CASES" \
  --source-dir "$RECEIVED_SOURCE_BUNDLES" --request-id "$RECEIVE_REQUEST_ID" \
  --actor "$RECEIVING_OPERATOR"
```

Use the actual export result's manifest identity, not an inferred digest of another JSON. Preserve the original receiver request ID and complete input on retry. Open the received saved case through the installed Merchant Support host with its selected source and package directories. Inspect the original material, reviewer return and history; customer acceptance still uses the original explicit receiving action.

## Scope and truthful interpretation

This source performs read-only export reconciliation and case receiving. It is not a live Medusa/Dataverse connector or an automatic production repair. The paid proposed workshare adds the selected customer's source capture/adapter and at most one agreed recovery change inside its existing integration. No customer access, commercial agreement, remote mutation, production verification or accepted result is represented by the example.

The current checkpoint has actual pure-engine execution and complete JavaScript parsing. Native Node/filesystem/browser/case receiving remains pending an equipped original runtime. Its full two-module source received an independent transaction/precision/receiving review. Do not describe source review as an executed customer journey.
