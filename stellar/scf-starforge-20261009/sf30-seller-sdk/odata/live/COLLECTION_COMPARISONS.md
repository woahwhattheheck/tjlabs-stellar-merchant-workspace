# Review and deliver complete OData live collection comparisons

The original live operator can compare two complete customer collections, inspect changes by declared entity key, retain review decisions, and deliver the whole comparison into another OData workspace or native Analysis. Both complete source collections travel with the result. A recipient can reopen every original row, source request, response, declaration and review version.

Use **Live services → Open → Compare complete live collections** in the installed OData application. The same operation is available through the installed `odata-live comparison-*` commands and the typed comparison exports. The original service/workspace owns this state and its operation lease.

## 1. Choose the customer question and source pair

Open the original service, then **Open comparisons and sources**. The before and after choices come from that service's completed live collections. Choose a comparison ID, a title that states the customer question, and optionally the delivered fields to examine. Every original declared key is included.

The source selection records each collection's manifest and analytical-source hashes, selected query, metadata, source binding, row/page count, provider counts, and first/last acquisition time. The caller must supply both reviewed manifest hashes; the operator captures these from the original collection choices before sending the create request.

Both sides must have the same service root, entity set, and ordered declared key names and underlying key types. Different queries, projections, metadata editions and acquisition windows stay visible. The engine reports a row as **before only** or **after only** when its key appears on just one selected side. Those labels describe membership in the customer selections; a changed filter or projection is not converted into a supplier deletion.

Each side remains a complete live acquisition across its own original pages. A paginated live result is not treated as an atomic supplier snapshot.

The same comparison ID resumes the same selected pair, title, fields and limits. A different selection uses another ID. The operator exposes an incomplete selection after interruption and can resume it from its retained original source identities.

## 2. Inspect exact source changes

The operator presents source summaries, acquisition windows, key declarations, provider counts, and paginated **Changed cells** or **All joined entities**. Each row keeps its original before/after row ordinal, declared type and raw parsed scalar. Selecting an entity or changed cell fills the corresponding review target.

The comparison distinguishes these states and changes:

| Source condition | Retained result |
| --- | --- |
| A key occurs on one side only | `before_only` / `after_only`; cells use `row_absent` on the other side. |
| A field is delivered on one side and outside the other's projection | `selection_changed` and `field_not_selected`. |
| An explicit source null changes to a value, or a value to null | `null_changed`; null remains distinct from an empty string. |
| The declared or underlying field type changes | `type_changed`; values retain both original type labels. |
| Original CSDL facets or field declaration change | `declaration_changed` with both complete source definitions. |
| Different source spellings have the same supported typed value | `spelling_changed` and typed equality true. |
| Supported typed values differ | `value_changed`. |
| A valid non-key source spelling has no supported exact normalization | `source_changed` and typed equality unknown. |

Decimal and Int64 values remain their original text. Their supported equality uses exact canonical decimal/integer tokens; no floating-point conversion is used. GUID key identity is case-insensitive. Date/time identity uses the original exact scalar rules, retaining fractional precision and offsets without Date/Number rounding. Raw source spelling is preserved in every output. Actual declared entity keys remain strict and must identify one entity per original collection.

A type or declaration change can be relevant even when a parsed scalar is unchanged. The output preserves that distinction. Review decisions and labels never remove original rows or alter derived cells.

The engine reads each verified original row stream into a private temporary SQLite index, then merges both key orders using binary UTF-8 order. It does not hold the full joined collection in a JavaScript Map. It closes its cursors and database before retiring only that operation's private working directory.

## 3. Save review work

Four review scopes are available:

| Scope | Original target |
| --- | --- |
| Whole comparison | The complete selected source pair and field scope. |
| Entity | One exact retained declared-key identity. |
| Field | One original selected field across the pair. |
| Cell | One exact retained entity key and selected field. |

Decisions are **note**, **accepted**, **investigate**, or **excluded from this review**, with an accountable reviewer and a substantive note. An exclusion is a review label; the original comparison still includes the source values and rows.

Each save records a stable request ID, the inspected review revision, target, decision, actor, note, request digest and saved version. New writes require the revision the operator actually opened. Repeating the same request ID and decision returns the original version even after a later reviewer has added more history. Reusing that ID for different content is rejected.

The browser retains the selected review request before sending it. **Retry the retained note against the current review** first opens the actual saved history, recognizes the original saved request when present, and otherwise retries the same decision against the newly inspected concurrency revision. The complete history remains downloadable as `reviews.json`.

CLI review input is an original JSON file, for example:

~~~json
{
  "requestId": "customer-orders-review-01",
  "expectedRevision": 0,
  "scope": "comparison",
  "status": "note",
  "actor": "Customer receiving analyst",
  "note": "Review the complete original source pair and its displayed query scopes."
}
~~~

For a cell review add the exact `entityKey` returned by the original rows endpoint and its `field`. Keep this file unchanged when reconciling an uncertain save. An explicit later decision gets a new request ID and the current saved revision.

## 4. Publish and receive a complete analytical edition

**Publish saved revision N** freezes that exact review history with the immutable comparison. Every published edition remains available after later review work. The source document includes:

- The complete changed-cell CSV with original value/state/type columns.
- The exact comparison manifest and original review history.
- The retained comparison transformation source.
- Ordered compressed source packets containing every comparison output, both full original collections, their original request/response chains and their own complete analytical documents.

The original native Analysis receiver registers `source.json` with all of its declared relative files. Use `comparison-analysis-mapping` with the actual registered source alias and its actual revision. The mapping imports all 13 columns as text, preserving exact source spellings and explicit state columns. Typed equality is the literal true/false text or an empty field for unknown; use the state/type columns alongside values.

~~~sh
starforge odata-live comparison-analysis-mapping \
  --source customer_orders_comparison \
  --revision 1 \
  --out /private/customer/mapping.json
~~~

The revision above is an example. Select the revision returned by the original source registration, and retain the mapping file as part of that customer operation.

A complete source transfer must include `source.json` and **every** listed file at its declared relative path. Downloading just the CSV provides a useful flat review table; full native reconstruction uses the complete source document closure. The operator lists every file, byte length and SHA-256.

To receive a published analytical comparison independently:

~~~sh
starforge odata-live comparison-restore \
  --manifest /private/received-edition/source.json \
  --sha256 ACTUAL_SOURCE_JSON_SHA256 \
  --out /private/received-comparison
~~~

The original receiver checks every declared file, every packet header and original ordered chunk, exact offsets, final file lengths/hashes, both complete collection inputs, the selected comparison, and original review targets. It replays the native comparison from those inputs before publishing a new complete data directory. A new edition arriving in an existing comparison still exhausts its complete packet stream before acceptance.

If an existing recipient has a longer matching review history, receiving an earlier edition retains that later work and also preserves the received edition. Matching history prefixes can be extended. Divergent history is reported with the original copies retained; it is not silently overwritten.

Receiving uses the immutable application source selected by the customer package, with Node 24 and its original comparison implementation. The transformation sources are retained inside the edition for byte-level provenance. Native replay checks their exact installed bytes before executing the reviewed implementation. Keep the selected source package/manifest with the customer edition when installing or replaying it; later source versions must preserve the v1 replay contract or supply their reviewed versioned reader. Uploaded transformation source is retained as data and is not automatically executed.

## 5. Original workspace commands

The original source operator, CLI and HTTP application share the existing workspace ownership and lease. Select a closed workspace when opening it from another native command.

~~~sh
starforge odata-live comparison-list \
  --workspace /private/odata-workspace --service orders

starforge odata-live comparison-create \
  --workspace /private/odata-workspace --service orders \
  --id orders-customer-review \
  --before orders-before --after orders-after \
  --before-sha256 ACTUAL_BEFORE_COLLECTION_SHA256 \
  --after-sha256 ACTUAL_AFTER_COLLECTION_SHA256 \
  --title "Customer Orders source comparison"

starforge odata-live comparison-inspect \
  --workspace /private/odata-workspace --service orders \
  --id orders-customer-review

starforge odata-live comparison-rows \
  --workspace /private/odata-workspace --service orders \
  --id orders-customer-review --kind cells --offset 0 --limit 100

starforge odata-live comparison-review \
  --workspace /private/odata-workspace --service orders \
  --id orders-customer-review --input /private/customer/review-01.json

starforge odata-live comparison-publish \
  --workspace /private/odata-workspace --service orders \
  --id orders-customer-review --revision ACTUAL_SAVED_REVISION

starforge odata-live comparison-files \
  --workspace /private/odata-workspace --service orders \
  --id orders-customer-review
~~~

For a source restored into an existing service, the comparison source binding and original operation must match that service:

~~~sh
starforge odata-live comparison-restore \
  --workspace /private/receiving-workspace --service orders \
  --id received-customer-review \
  --manifest /private/received-edition/source.json \
  --sha256 ACTUAL_SOURCE_JSON_SHA256
~~~

Standalone commands accept `--directory` for inspect/rows/review/publish/files. Standalone create takes `--before` and `--after` collection directories plus `--out`; restore takes the complete source and `--out`. Run `comparison-create --help` for the complete operator syntax. The same commands work directly with the selected source's `odata/live/collection-comparison-cli.mjs`.

## 6. Complete workspace backup and restore

The original **Download complete OData workspace** includes service profiles and packages, source connections/plans/editions, buyer/response work, all original live collections, and every comparison's complete source pair, current review history and published analytical editions.

Backup runs under the existing live state lease. A complete comparison contributes its entire declared file inventory. An interrupted create contributes only its retained service/selection records; an uncommitted derived working directory is not promoted into a completed result.

The original workspace restore validates comparison paths, exact source/service identity and whole declared closure before writing. It reopens the complete comparison and replays its source pair before publishing the receiving workspace state. It preserves the original service and collection owner code paths.

Browser workspace transfers up to 64 MiB use the existing Restore control. A larger complete export is routed by that control to the original native file command, while ordinary API mutations retain the 64 MiB ceiling. Use the command shown by the installed operator and select the exact saved workspace file. Partial uploads are not treated as a successful restore.

## 7. Limits and on-disk ownership

| Selected boundary | Maximum |
| --- | --- |
| Selected source fields, including original keys | 64 |
| Complete copied original inputs | 512 MiB, configurable downward |
| Complete derived output across entities, changed cells and CSV | 128 MiB, configurable downward |
| Changed cells | 1,000,000, configurable downward |
| Analysis mapped JSONL | 128 MiB total; 2 MiB per projected row |
| Analysis source descriptor | 1 MiB |
| Analysis source original roles | 32 |
| Complete Analysis document files | 256 MiB |
| One compressed source packet | 32 MiB compressed; 24 MiB decompressed |
| Review history | 10,000 versions; 16 MiB |
| Interactive row page | 1–500, default 100 |

The engine calculates actual CSV-to-Analysis projected row sizes before publishing its source. A limit failure leaves the original selected input and resumable operation state. Choose a smaller complete customer scope under a new comparison ID when a requested full result exceeds its explicit limit.

Each comparison has its own original `state.lock` lease. Complete derived data and each frozen analytical edition are prepared in an owned private stage, file/directory synced, then published atomically. The core handles the shared lease helper's nullable close contract. Only working directories that carry the exact same saved selection are retired during continuation.

The comparison does not create another merchant, payment ledger, dataset publisher or Analysis workspace model. It composes the original live collection, service operation sequence, native Analysis source document and workspace transfer owners.

## 8. Typed integration and original source

- `./seller/odata/live/collection-comparison`: create/open, original row reading, save review, publish, receive, mapping and complete file inventory.
- `./seller/odata/live/collection-comparison-store`: original service-bound create/open/review/publish/restore and complete workspace transfer hooks.
- `./seller/odata/live-operations`: the same seven service operations and original retained-file access used by the operator.
- `collection-comparison-engine.mjs`: exact key join, source-state comparison and bounded analytical projection.
- `public/comparison-view.mjs`: source selection, paginated original changes, review history, publication and complete files.

[Complete original live collections](COLLECTIONS.md) explains the original request/cursor/response chain. [The original customer receiving operation](examples/COLLECTION_CUSTOMER.md) supplies the complete Analysis/report/workbook transfer and installed source contract.
