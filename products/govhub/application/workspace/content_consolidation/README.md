# Content consolidation operator

This component belongs to the maintained GovHub workspace. Complete source feeds, mappings and review history live in its original SQLite object store. Files use its original content-addressed source store. The existing native worker owns execution, checkpoints, continuation and receiving artifacts. Drupal Migrate owns the actual destination changes, source/destination ID maps, row hashes, original messages and selected-row rollback.

## Complete operator workflow

1. Retain the actual Drupal target environment and original Drush profile in the existing environment register and Native configuration screen. Use the project’s installed executable, working directory and site URI. Enable the supplied `govhub_consolidation` module through the native runner’s documented installation entrypoint.
2. Open **Content consolidation**. Create the selected consolidation with its owner, actual target, site comparison ID, scope quantities and recovery instruction. The chosen target remains associated with that consolidation.
3. Retain each original CSV, JSON or JSON:API page in **Original sources**. Large media and backups use the original streaming source-root intake. For CSV, select the delimiter and quoting used by the original file, inspect its complete retained rows, and choose the key fields from its actual headers in their declared order. Create each feed edition using its actual source observation time, exact key fields and every original page in order. The operator can inspect all records and download every original file.
4. Prepare the complete mapping. Add each stable native migration, select its exact source edition, and map original fields or JSON pointers into Drupal’s source and destination properties. The direct-field editor adds ordinary field mappings. The full native process and destination definitions support relationships, ordered collections, translations, media and installed alias/redirect destinations. Stable migration IDs remain unchanged during source refresh.
5. Inspect the complete native preview, including missing or duplicate source keys, missing fields, selected media, dependencies, source lineages, update policies and agreed quantities. Save the whole mapping as an immutable edition. Review that exact saved edition; changed form fields are saved in a new edition before review.
6. Record the reviewer decision and actual operating instruction. Approval creates the frozen native plan for the selected target profile. Pre-existing target updates retain their explicit field-update policy and original target backup. Refresh of already migration-owned rows uses their existing native ID map. Records absent from a later feed remain in the target until an explicit selected rollback.
7. Open the native plan and start import, status or receiving. The original worker retains the actual native result and original artifacts. Use the native operation page for progress, complete map/message/JSON:API results and source files. Continue interrupted work through its original operation ID and checkpoint. Cancellation preserves the original native state.
8. Retain the corrected or refreshed feed edition. Compare the two original editions, update the selected edition in the existing stable native migrations, review that complete mapping and import the changed source. Inspect the resulting original target resources and unchanged native source/destination IDs.
9. Create the complete source-inclusive handover from the consolidation page and the original full editable backup from workspace settings. The recipient opens that complete copy using the same application and retained staff account, compares both source editions and native results, and creates a new handover. Native selected-row rollback remains separate from the existing whole-site recovery operation.

## Source identity

CSV strings retain leading zeroes. JSON keys are strings unless the operator explicitly selects decimal encoding of original integer keys. Compound key fields retain their declared order. Every original JSON:API page is checked against the previous page’s actual `links.next`, through its native terminal page. A literal top-level source field takes precedence; nested selection uses RFC6901 JSON pointers. No dot-path inference is made.

Each source edition retains all original rows, original file/hash and row number, full original JSON, key array and record hash. Source observation time stays distinct from local intake time. Duplicate/missing keys and declared count differences remain actionable within the saved edition. A correction creates a new edition and preserves its predecessor.

The native plan stores `source.id_order` and `process_order` explicitly because the original workspace canonicalizes JSON object keys. Runtime paths, receipts and observation metadata stay outside Drupal’s source-change calculation. The native plugin resolves verified selected file paths only during the actual import.

## Domain interfaces

Use the existing authenticated `POST /api/govhub/content/<action>` carrier, or `workspace.dispatch("content.<action>", payload, actor)`. The original operator/reviewer/admin roles remain unchanged. Every mutation carries a caller-held `request_key`; an exact retry returns its original result.

| Action | Input and result |
| --- | --- |
| `families.save` | `{label,environment_id,owner,comparison_id?,notes?,recovery_instruction?,limits?,request_key}` → `{family}`. Revision additionally carries `family_id,expected_revision`. Limit keys are `migrations,records,files,file_bytes,routes`; use the agreed scope measure. |
| `families.list` | `{}` → current compact family summaries. |
| `families.get` | `{family_id}` → current scope, complete edition metadata, mapping history, reviews, native plan summaries and original operations. |
| `sources.inspect` | `{files:[{file_id}],csv_options?,offset?,limit?}` → complete CSV scan, original ordered headers, exact file identities, selected row window, physical line spans and source issues. Read-only; `offset` is a nonnegative record offset and `limit` is 1–250, default 25. |
| `editions.create` | `{family_id,source_id,label,format,observed_at,record_keys,files:[{file_id,request_url?}],records_pointer?,key_encoding?,csv_options?,expected_records?,source_url?,source_owner?,license_reference?,retention_instruction?,request_key}` → retained edition metadata and original source issues. Formats are `CSV`, `JSON`, `JSON_API`; key encoding is `string` or explicit `decimal`. |
| `editions.get` | `{edition_id,offset?,limit?,query?}` → metadata, full original selected rows and pagination. |
| `editions.compare` | `{before_id,after_id}` → every added/removed/changed record, exact before/after fields and unchanged original keys. |
| `mappings.preview` | `{family_id,definition}` → complete native compilation, source lineage, quantities and issues. |
| `mappings.save` | `{family_id,label,definition,expected_mapping_id,request_key}` → immutable mapping and compilation. Use the current mapping ID or an empty string for the first mapping. |
| `mappings.get` | `{mapping_id}` → exact complete mapping and preview. |
| `reviews.save` | `{mapping_id,mapping_sha256,decision,reason,backup_file_id?,request_key}` → retained review and frozen native plan when approved. Decisions are `APPROVE` or `RETURN`. |
| `plans.get` | `{content_plan_id}` → native definition, complete source lineage and original mapping/review/source/profile identities. |
| `operations.create` | `{content_plan_id,plan_sha256,type,reason,content_selection?,request_key}` → original durable GovHub operation. Types are `CONTENT_IMPORT`, `CONTENT_STATUS`, `CONTENT_RECEIVE`, `CONTENT_ROLLBACK`. |

The original `operations.get`, `operations.cancel` and `operations.resume` continue to own native operation history and continuation. Rollback `content_selection` is `[{migration_id,source_ids:[exact strings in original order]}]`.

## Full native mapping

A mapping `definition` contains `migrations`, `files` and `routes` arrays. Each migration retains:

- `id`, `label`, `edition_id`: stable native migration identity and exact original source edition.
- `source_ids`: source-key property names in the original key order. Omission uses the original number of key fields.
- `projection`: native source-property names mapped to original literal fields or RFC6901 pointers. An empty object retains the complete original row.
- `process`, `process_order`: Drupal’s native mappings/process definitions and explicit processing order. `migration_lookup` selects declared migrations with `no_stub:true`; `sub_process` preserves relationship order.
- `destination`: installed `entity:<type>` plugin, native bundle and translation/update settings. `overwrite_properties:[]` deliberately means zero updated fields. Omit it for ordinary migration-owned refresh; reviewed pre-existing updates use a nonempty explicit property list.
- `migration_dependencies`: complete native required and optional dependency IDs.
- `receiving`: selected original native field names and optional language.
- `existing_target_policy`: `CREATE_ONLY`, `REVIEWED_FIELD_UPDATE`, `REUSE_SELECTED`. Policies remain specific to their own migrations.
- `removal_policy:RETAIN_TARGET`, optional `required_source_fields`, and optional `selected_keys` arrays for an explicit original record selection.

Each file is `{file_id,relative_path,media_type?,license?,source_url?}`. Each migration can declare `file_bindings: [{"source_ids":["original key"],"file_id":"retained-file-id"}]`. The compiler joins those reviewed bindings into projected native rows as `_govhub_file_id`; the original source feed remains byte-for-byte unchanged. The plugin supplies the verified `_govhub_source_path` for the core `file_copy` process. A caller may resolve its local file-name aliases into retained IDs before saving that mapping. The original file’s full bytes and use/path metadata remain in the handover.

Each route is `{old_url,new_url,migration_id,source_ids,langcode?}`. Configure the installed native alias or redirect entity migration explicitly. The receiving runner observes the original HTTP response and selected canonical route. JSON:API receiving uses the actual installed resource type, UUID and language-aware route. Optional Drush-profile `jsonapi_bearer_env` and `jsonapi_cookie_env` name existing private environment variables; values are read only by the selected native receiver.

## Complete receiving

The original `exports.create` payload is `{name,plan_ids:[],content_family_ids:[family_id],include_sources:true,request_key}`. A combined handover may select both ordinary cohort plans and content consolidations. The original handover JSON/HTML, complete record history, native operations, source manifest and selected original bytes remain intact. Added files are:

- `content-consolidation.json`: all family/source/mapping/review/native-plan editions.
- `content-source-records.csv`: every original selected source record and its file/row identity.
- `content-native-migrations.json`: the complete frozen native plans.
- `content-lineage.csv`: original row to native migration/source-ID associations.
- `CONTENT_RECEIVING.md`: the full receiving and reopen sequence.

The original full `workspace.backup` includes the database, staff state, registered sources and native journals. Its existing native storage lease preserves one coherent copy. Reopening source/runtime storage leaves the actual target/profile unchanged. Use the original backup’s relocation support for retained operation paths.

## Primary Drupal contracts

https://www.drupal.org/docs/drupal-apis/migrate-api/migrate-api-overview

https://api.drupal.org/api/drupal/core!modules!migrate!src!Plugin!migrate!process!MigrationLookup.php/class/MigrationLookup/11.x

https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/api-overview

## Combined handover and comparison

The original Complete handover page can select content consolidations and cutover cohorts together. Its retained edition displays both selections. The original `exports.compare` also compares each consolidation scope, source edition, mapping, review and frozen native plan. Source edition metadata and original hashes identify every added edition; use the source comparison view to open its full record changes.

`REUSE_SELECTED` links the reviewed exact existing target into its original native ID map without saving that entity. It preserves the existing values and revision timestamps and does not require a content-update backup. `REVIEWED_FIELD_UPDATE` names the exact destination properties that may change and retains the selected original target backup. With an explicit `selected_keys` list, issues on other retained rows remain visible on the original edition without preventing this selected import; feed pagination and declared-count completeness still apply to the full supplied source.

## Native migration identity and continuation

Native migration IDs begin with `govhub_` and contain at most 56 lowercase letters, digits or underscores. Keep the same ID across source refreshes to retain Drupal’s original ID map. Each configured target owns its migration namespace; another consolidation in the same target cannot take an existing migration’s original family or source-ID scheme.

`content.operations.create` accepts optional `content_row_limit` for `CONTENT_IMPORT`. Zero processes the full native pass. A positive integer lets core Migrate pause after that many rows while preserving its original source/destination map, row hashes and command result. Resume that same GovHub operation until the complete selected plan and actual receiving finish. The normal operator action uses a full pass.


## Complete public-source receiving case

The [Federal Register source workflow](sources/FEDERAL_REGISTER.md) includes a resumable original-feed/PDF acquisition command, a complete native Drupal schema provisioner and a generator for the existing receiving caller. The retained 12 October observations each contain the full 473-agency roster, all 103 records for the API's publication date 2026-10-13 and five original PDFs. The five native migrations cover agencies, files, media, documents and aliases; the complete selection contains 689 native rows. The case carries first import, independent source refresh and document-type enrichment, selected native rollback, restoration, full browser receiving and editable backup/reopen through the existing worker.

Use [RECEIVING_WORKFLOW.md](RECEIVING_WORKFLOW.md) for the actual original operation commands and full independent customer receiving. The receiving caller resolves source/media aliases, forwards the per-pass row limit and binds every selected rollback to its exact original request identity.

## Inspect and retain a CSV feed

Choose the already retained original file or complete ordered set of files in the edition form. The **Inspect complete CSV** action verifies those exact file bodies, reads the complete selected files, and displays the actual header order and full record count. Page through the original records or expand a record to read every original field. The display window limits how many records the browser draws; it does not limit the complete scan or the subsequent saved edition.

Set the format from the source's actual export specification. The editor offers comma, tab, semicolon, pipe or one custom delimiter; double quote, single quote, no quote or one custom quote character; and no escape, backslash or one custom escape character. The doubled-quote setting is explicit. Changing the selected file or format invalidates the prior inspection immediately. A late inspection response cannot replace the view for a newer selection.

The API retains these values in `csv_options`:

| Field | Default | Meaning |
| --- | --- | --- |
| `delimiter` | `","` | One original separator character. |
| `quotechar` | `"\""` | One original quote character, or JSON null for unquoted CSV. |
| `escapechar` | JSON null | One original escape character, or null for none. |
| `doublequote` | true | Whether two consecutive quote characters inside a quoted field mean one quote character. |

The default is the existing comma-separated, double-quoted interpretation. Parsing remains UTF-8 with an optional BOM. The operator does not guess a delimiter, trim a header or convert source strings into numbers. Empty or repeated headers, wrong field counts, invalid UTF-8 and malformed quoting return the original source problem. An incomplete scan has `complete:false`, `row_count:null`, the count of records actually observed before the error, and the exact retained file identity.

Choose each stable key from the actual header selector and use Up/Down to preserve compound-key order. The **Ordered key fields** control stores a JSON array, so commas and spaces in a column name remain part of that exact name. Existing simple comma-separated entries remain accepted for compatibility. An example with a literal comma in a header is `["Catalog, ID","Language"]`; that is a format example, not a claimed customer schema.

Saving an edition retains the normalized `csv_options`, each original file's `csv_headers` in source order, and each record's `source_line_start` and `source_line_end`. Line numbers count the physical original lines, including multi-line quoted fields; the existing `source_row` remains the logical record number within its file. The original file bytes, keys, row hashes and source-change calculation retain their existing meaning.

The saved source view, mapping lineage and complete source-inclusive export carry those physical line spans through receiving. The `content-source-records.csv` and `content-lineage.csv` exports append the two line fields after their existing columns. Older saved editions keep their prior data and default interpretation; the interface identifies their absent retained-header metadata, and their line fields remain blank. JSON and JSON:API sources retain their existing workflow and have no CSV-specific fields.

For a feed refresh, the edition form reuses the prior feed's exact key order, source ownership and selected CSV format. Select the new original file and supply its real observation time. The existing immutable edition comparison, mapping review, stable Drupal migration IDs, original import continuation, selected rollback and complete editable backup/reopen then operate on that new retained edition.
