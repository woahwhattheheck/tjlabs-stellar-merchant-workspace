# Offline material catalogue recipient

Open a complete original material catalogue handover in one browser file. The reader includes material browsing, full edition comparisons, every retained customer-decision revision, supplier plan/correction/review/recipient records, original source downloads, and complete original table exports.

It operates entirely on the selected original JSONL bundle. The maintained Node/SQLite operator remains the authoring and receiving application. The reader also prepares named customer-match proposals and complete working reviews for explicit author receiving; the original catalogue remains unchanged until the operator adopts the reviewed request.

## Build and open

From the repository root, use Node 22.16 or newer:

```sh
node products/material-catalog/recipient/build.mjs \
  --output /private/delivery/Material_Catalog_Reader.html
```

Open that HTML directly in a modern browser, then choose the complete original material-catalog JSONL bundle. No server, account, remote dependency or network request is needed. The multi-file reader.html is the development shell; build the single HTML for file-based delivery.

To create a recipient file with the exact bundle already included:

```sh
node products/material-catalog/recipient/build.mjs \
  --bundle /private/delivery/catalog-bundle.jsonl \
  --output /private/delivery/Material_Catalog_Complete.html
```

The builder verifies the complete bundle before creating a new output file and refuses to overwrite an existing path. The returned manifest identifies the embedded original bytes. Keep the original JSONL beside the reader. Customer data stays in the selected private output; generic product source contains no customer bundle or account configuration.

## Use the complete workspace

**Overview** identifies the original catalogue, tenant, revision, export time, complete source byte count and whole-file SHA-256. Its table inventory includes every original v1 or v2 table. Download the unchanged original bundle, the inspection manifest, or a complete offline reader containing that same bundle.

**Materials** selects an exact retained edition. Search identifiers, descriptions, units and original attributes, page through the complete set and inspect a whole original record. Download every material record in the selected edition, or the explicitly labelled spreadsheet-safe CSV projection. Original fractions, decimal strings, nulls and source identifiers remain visible in the full record.

**Compare editions** compares both complete saved material sets. It includes added, removed, changed and unchanged materials and each changed original field. Open the full before/after pair or download the complete comparison. A previous customer decision remains attached to its original selected edition and material.

**Customer decisions** shows every revision actually present in the bundle, including the customer context, approval/rejection, selected material, original note and timestamp. Download the original decision-history JSONL. A later operator revision requires its later export.

**Supplier records** exposes all seven supplier tables: current plans and complete histories, current corrections and histories, immutable reviews, reviewed products, and recipient before/after records. Inspect whole profiles and saved global findings as well as individual product findings. Overall supplier readiness depends on the saved global error count; individually ready products alone do not establish that a submission can be delivered.

**Original sources** downloads every exact source byte stream. Source formats, names, original URLs, hashes and provenance remain in their complete manifests. **All retained records** makes every original table available with its exact stored record JSON.

## Review and return

**Review and return** creates a named review against the exact selected edition. Save complete proposal revisions, the original bundle and unfinished form as working JSON or a self-contained HTML. Return the full named review to the author, then compare it with the current complete author bundle and choose Keep current or Adopt separately for every context. The downloaded request is received through the original catalogue CLI and Journal; full return history travels in the existing decision history.

Follow [REVIEW_RETURN.md](./REVIEW_RETURN.md) for the complete colleague, author, replay and onward delivery workflow. Original browsing and source downloads remain available throughout.

## Integrity and receiving

The reader checks the original v1/v2 envelope, frame and row counts, table keys, contiguous source chunks, exact source-byte hashes and complete footer. It checks original material content seals, edition material roots/change counts, original catalogue and decision histories, saved supplier seals and retained reference/history relationships. It uses the existing MIT-licensed js-sha256 1.0.0 implementation with its original notice.

The original operator owns source interpretation, profile normalization, business-rule evaluation, exact correction projection, xChange FULL/CHANGE derivation, recipient processing, database import and concurrent revision handling. Open the complete bundle through its maintained importer when continuing editable work. A consistent byte hash describes the selected file; supplier and customer conclusions retain their original scope and dates.

The browser does not persist imported data in local storage or contact any server. Closing the tab discards its in-memory view and review. Use **Save complete working review**, **Save complete working HTML**, or **Download complete offline reader** before closing. These retain the entire original handover plus any current review and unfinished form. A browser file can contain the entire customer dataset, so deliver it through that customer's existing authorized destination.

The reader accepts complete bundles up to 256 MiB and original individual JSONL frames up to 8 MiB. It presents records in pages of 50 and never substitutes a partial file for a complete import. Memory holds the original bundle, parsed records and decoded source files; use the maintained streaming native importer for larger data.

## Complete customer receiving

Follow [RECEIVING.md](./RECEIVING.md) against the selected actual bundle. The receiving command builds both blank and populated HTML, exercises the real browser controls, downloads the original sources and complete records, reopens the generated recipient, and retains desktop/narrow screenshots. Inspect those actual images before marking the visual delivery complete.

An assigned browser can also receive the exact blank and populated attachments through the supplied-HTML mode and exported existing-context API described in RECEIVING.md. The complete source and embedded original bundle are checked before rendering, and the actual downloaded recipient is reopened through that same explicit transport.

The source shell and modules are maintained separately. The build embeds them without fetching packages or running hosted CI. It also preserves the original source notice in the resulting HTML.


## Following catalogue reviews

[Following-edition re-review](./FOLLOWING_EDITION_REVIEW.md) retains the complete previous working review and both original catalogues while the reviewer explicitly carries an unchanged proposal, revises against a selected current material, or leaves that proposal out with a reason. Full working JSON/HTML, old sources, choice history and every completed normal new-review return remain downloadable and reopenable. Original author comparison and native receiving remain authoritative. The same original course accepts the optional exact following bundle; no new runtime or customer operation is created.
