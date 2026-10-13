# Compare complete Rialto catalogues and hand over customer work

The existing offline customer report can receive an earlier catalogue, compare every original resource identity and payment alternative, retain the review, and reopen it on another machine. The request editor remains attached to its exact embedded catalogue and original rows.

## Open a comparison

1. Capture the next catalogue into a new directory with the existing customer CLI. Open that directory's complete report.html.
2. In Catalogue changes and customer handover, choose the earlier edition's catalogue.json using Earlier complete catalogue.
3. Review both source names, exact SHA-256 digests, byte counts, observation times and page counts. Expand Complete source plans and coverage findings.
4. Use the change, resource-type, search and repeated-identity controls to find the relevant original resources. Review full original rows displays every before/after occurrence and all payment options.
5. Write the complete handover note and any notes for individual original identities.

The current report supplies the after edition. Receiving an earlier file preserves that file's exact UTF-8 text and bytes; it never reconstructs a smaller list of selected fields. A saved comparison from another report retains its own exact before and after sources.

## Interpret the original comparison

The report embeds the existing core compare() function. It uses the original resource URL plus toolName identity, and compares the complete ordered list of original rows associated with each identity.

| Display | Original result | Meaning |
|---|---|---|
| Only in after edition | added | This identity occurs in the after source and is absent from the before source. |
| Only in before edition | removed | This identity occurs in the before source and is absent from the after source. |
| Changed original content | changed | The full retained original row list differs. |
| Unchanged original content | unchanged | The full retained original row list is equal under the original canonical comparison. |

When an identity has exactly one occurrence in both editions, the table lists the changed top-level fields. Inspect its full rows to compare the exact payment requirements, metadata, extensions and other nested values. Repeated identities preserve each occurrence and its original order. A changed order or changed duplicate population can produce a changed result even when some occurrences remain equal.

A resource appearing only in one edition is a statement about these two captured sources. First compare the complete source plans, filters, enumeration flags and reported totals. Different network, type, payTo, pagination or other plan inputs remain visible as a scope difference. Incomplete enumeration and repeated identities remain separate from the added/removed/changed identity counts.

Rialto's offset catalogue has no provider snapshot token. Enumeration complete means the captured sequence reached its reported end; the observation interval and every source finding remain available. Changed source totals or an interrupted capture are part of interpreting the result.

Payment amounts remain exact atomic-unit strings with their original asset, network, recipient and scheme. The actual merchant challenge and original buyer still determine the terms for a customer request.

## Continue a customer request

When the comparison's after hash equals this report's embedded catalogue hash, choose the exact original row and select Review this current row in the request editor. Repeated resource identities offer separate original row choices, including source page and row positions.

The editor retains its current draft before switching rows. Selecting the row already open preserves its live fields. Catalogue comparison does not automatically select a new offer, change a cap, rewrite a body, send a request or replace the customer's intent. Continue through the existing editor's complete selection download and original customer CLI.

A comparison received from another catalogue edition remains fully reviewable. Its rows can enter this request editor only when they match the exact embedded after source. Open that edition's complete report to prepare one of its rows.

### Carried request drafts

Each downloaded comparison carries the current original request draft plus any drafts received earlier. A draft contains the catalogue hash, exact row index, original resource key, and complete current field values.

Carried drafts remain separate from the live editor. Restore selected carried request draft is enabled only for this exact catalogue hash and original row identity. Restoring one first retains the current editor draft in the comparison. Review the request and selected original payment option before downloading its customer selection.

The portable comparison can include private headers, request bodies and customer task details entered in the editor. Keep the complete receiving files with the customer work.

## Save, replace and reopen

Download complete comparison saves a JSON file containing both exact original catalogue source texts, their byte counts and hashes, the filter and page state, complete review notes and carried request drafts.

Download complete receiving report saves a self-contained HTML report with the same complete comparison. Open it in a current browser on the receiving machine. The original catalogue editor is included; the carried request drafts remain available for explicit restoration.

Complete saved comparison accepts the exported JSON in an existing report. Both source hashes, lengths, original row identities and complete notes are validated before replacing the displayed review. A rejected import preserves the open comparison.

The report also saves the active comparison in IndexedDB, scoped to its embedded catalogue hash. Reopening that report restores its complete view. Browser storage depends on the browser's local settings and available capacity; downloading the complete files provides a transferable copy.

Importing a replacement or starting a new comparison first retains the old complete review under Earlier saved comparisons. Choose an earlier entry to reopen it or download it directly. Opening a portable receiving HTML also retains any comparison already saved for that same report edition. If browser storage is unavailable, earlier views remain in the open report's memory and can be downloaded there.

Start a new comparison with this catalogue clears the active comparison and leaves the customer request editor intact. The earlier review stays available in the saved-comparison list.

## Print the complete selected view

The screen shows 50 comparison identities per page. Printing includes every identity matching the current change/type/search/repeated-identity filters. It includes the complete source descriptions and coverage findings, the overall handover note, each matching identity's review note, and the complete before/after original row lists.

The original resource catalogue is printed using its own current search/type filter. The editable request form is omitted from print. Use the complete JSON or receiving HTML to transfer exact machine-readable source bytes and draft fields.

## Existing command-line comparison

The existing command retains its original output contract:

```sh
starforge rialto-customer compare \
  --before /absolute/private/catalogue-001 \
  --after /absolute/private/catalogue-002 \
  --out /absolute/private/catalogue-change-001-002.json
```

This native comparison JSON contains the comparison result. The offline editor's Complete saved comparison input expects the separate complete review format described above, including both exact source files. To create an offline review from native captured directories, open the after report and choose the before catalogue.json.

## Receiving format and limits

The complete review schema is stellar-forge.rialto-catalogue-review.v1. Each before/after source has filename, utf8, bytes and sha256. The receiving browser parses the retained original catalogue, verifies its exact digest and byte count, validates ordered row identities, and invokes the original comparison function.

Each complete original catalogue is limited to 64 MiB. A complete imported review file is limited to 192 MiB. The report needs a current browser with Web Crypto; its optional local save uses IndexedDB. Core comparison and source reading are independent of the DOM and retain the original engine's semantics.

This feature adds comparison.mjs beside the original report.mjs. The report embeds the actual source comparison functions and its full UI at report generation; its resulting HTML has no runtime module fetch or network dependency.
