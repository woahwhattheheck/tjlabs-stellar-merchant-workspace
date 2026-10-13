# Reviewed Haystack projections

Use the projection workspace to turn an existing saved semantic model into a native Haystack grid, with an explicit mapping for every output tag and source-linked lineage for every row. The result remains in the same building turnover workspace with its original model, source bytes, reviews and delivery history.

Open `/projection.html` on the existing Haystack server. The native workspace and semantic modelling pages remain available from the header. Use the actual workspace origin and its current access token when one is configured.

## Select an original model and scope

Choose a saved semantic model and either its current saved head or a retained earlier version. The form displays the selected model/version and the workspace revision used by the draft. Select the actual entities that belong in this grid. Entity search covers names, labels, kinds, IDs and source references. **Select filtered** and **Clear filtered** apply to the complete filtered set, including rows beyond the displayed page.

The model and its source context are immutable inputs to a saved projection version. Opening another model does not silently reinterpret an existing projection. The previous draft is retained in the same browser draft store before the editor changes its selection.

An existing projection can be opened at its current head or a historical version. The saved version history retains its author, note, parents and provenance. Saving edits uses the head opened by the editor as its explicit concurrency condition. Review and publication select the exact saved version; a historical version cannot silently replace the current head.

## Map every output column

Columns are filtered and displayed twelve at a time; moving or removing one uses its original index in the complete profile. Add each output tag and select its source:

| Source | Selection |
| --- | --- |
| Entity | The selected model entity's id, name, label or kind |
| Point-list cell | One actual retained intake and original column index |
| Native source tag | One original native source and tag present in its retained rows |
| Attribute | An actual model attribute predicate |
| Relation | An actual model relationship predicate, with one target or all targets explicitly selected |
| Constant | Complete typed JSON authored for this column |

The field selectors are built from the selected model's retained context. They do not supply an assumed customer schema, native table or equipment hierarchy.

Choose a conversion for each column: preserve, string, number, boolean, marker, ref, date, time, dateTime, uri, symbol or json. Explicit blank handling is omit, null, error or keep. Whitespace trimming is a separate selection. Supply a unit, reference prefix, timezone or exact accepted boolean/marker text only when that mapping calls for it. An omitted unit is not guessed from the tag name.

The original native type rules and projection engine validate the resulting grid. A row or column diagnostic may prevent publication even though an editable projection version can be saved. Inspect the actual diagnostic instead of turning an unknown or unsupported input into zero or an empty string.

Column metadata can be edited as a complete native JSON object. The complete profile editor also retains optional grid metadata. Exporting a profile includes its exact model and version identities; importing a profile with a different selected model/version is rejected.

### Cell overrides

An override belongs to one selected entity and output tag. **Set typed JSON value** and **Remove cell** are distinct choices. Setting JSON null keeps a present null cell; removing a cell records its absence. The original source and conversion remain available in lineage.

A corrected return may retain an override for every cell. The override editor filters the entire set and displays 25 at a time, with shared entity/tag suggestions. Opening the complete profile shows all overrides; downloads and saved versions retain every one.

The complete profile is available as editable JSON for bulk work. Its ordinary controls remain the main way to select sources and conversions. Invalid JSON in a visible value field blocks preview and save rather than silently sending the previous parsed value.

## Inspect the complete preview

Preview binds the complete profile to the selected saved model/version and reviewed workspace revision. It returns the native grid, complete row/cell lineage, diagnostics, counts and source/output hashes.

The grid screen pages the full returned row set and supports text filtering and a rows-with-issues filter. Select a row to see its original source references, per-cell value, origin and issue. Download complete preview retains all rows and diagnostic details, including those outside the displayed page.

Editing the profile invalidates its current preview. Run preview again before relying on its displayed values. A workspace revision conflict leaves the draft intact. **Review current workspace revision** deliberately refreshes that concurrency selection; it does not change the original model version or projection head.

## Save, review and import

Enter the actual author and useful version note, then save the complete profile. Every mutation is retained locally before dispatch. The saved projection contains immutable versions and the original profile/model/source relationship.

A reviewer records **Ready** or **Changes needed** for the exact saved head with a note. Native-grid delivery requires a Ready review of that exact version; lineage and readable reports can also retain unresolved findings. The projection's diagnostics and native type checks remain authoritative. A review does not silently modify source data.

**Import reviewed grid** publishes the saved output through this workspace's existing native source import. Its result identifies the original projection version, review and imported source. The operator explicitly chooses whether the new source is selected in the native workspace. This local import does not contact a station or establish consumer acceptance.

Read the complete native import receipts and retained consumer-return records on the review and return screens. A consumer reference identifies the existing SCF-owned record; its meaning comes from that actual record, not from the presence of a text label in this application.

## Deliver complete files

Prepare a delivery from the selected saved version:

| Delivery | Available formats |
| --- | --- |
| Native grid | JSON |
| Source lineage | JSON, CSV |
| Projection report | JSON, HTML |

The ordinary delivery action retains the generated file and receipt in the same workspace. The browser reads the complete file in content-bound ranges and verifies its full byte count and SHA-256 before downloading it. Retained requests expose the same completed delivery for a later download; they do not regenerate a different edition.

Use **Compare retained versions** to read every difference between two saved versions. The comparison retains all entity changes and both complete profiles, even when a mapping change leaves the resulting cell values unchanged. The display pages 100 entities at a time; the download carries the whole comparison and selected before/after identities.

The existing complete workspace export carries the projection state and application source through the maintained portable receiver. A receiving operation reopens the original workspace identity; it does not replay a native publication or a consumer action. Keep the whole application source inventory when packaging this extension.

## Review a corrected consumer return

Open the original saved projection version, then select the complete returned native JSON grid. The original file bytes and SHA-256 remain attached to the draft.

Bind every incoming row to an actual original entity. All incoming rows and all original projected entities must be mapped one-to-one, with no duplicate entity binding. Added or removed entities need a separately reviewed projection rather than an incomplete returned-row set. For a large unchanged-ID return, explicitly select **Bind by exact native IDs**. It requires each incoming native reference to match one distinct original reference; unmatched or changed IDs stop the whole mapping. You can instead import/export the complete `{entityId,rowIndex}` JSON binding array, or choose individual entities. No mapping runs automatically; the application does not infer row identity from order or choose a nearest name match.

Preview the complete return to inspect its source, before/after values, changes and diagnostics. Enter the existing consumer record reference, then choose **Keep original** or **Adopt returned** for every row. The bulk buttons apply that explicit decision to the entire preview; each row remains individually adjustable.

Apply records the exact preview hash, expected original head, source bytes, row bindings, complete decisions, reviewer and note. A changed source, reference or binding invalidates the preview and must be reviewed again. A successful application creates a new saved projection version and retains the complete incoming source/history. The underlying semantic model and original source are not rewritten by a return decision.

A corrected return is source evidence. It does not create a separate station approval or mark a consumer's acceptance on their behalf.

## Original request recovery

The browser uses the existing operator IndexedDB database, its operations store and its drafts store. Immutable model, saved-result, profile and returned-file contexts are retained once under their original draft references. Frequent field edits are coalesced before writing the current draft; original mutation requests are still retained before any dispatch, and awaiting draft retention waits for the complete latest snapshot. Older inline draft records remain readable. Projection records are scoped to the original workspace. Access tokens remain in the current connection form.

If a response is interrupted, open **Retained requests** and select **Read receipt and continue**. The client reads the original operation receipt first. Only if that receipt is absent does it send the original action and arguments under the same operation ID and expected revision. It does not generate a replacement mutation or rebase an uncertain request automatically.

A completed request remains completed even when saving its browser acknowledgement or downloading its result encounters an error. Later draft edits are preserved when an older request is reconciled. Download the complete retained request when the original operation needs to be handed to another operator.

## Installed CLI

The existing `haystack` command and `cli.mjs` expose the additive projection commands. They use the original target selection, request-file retention, version checks, receipt writes and delivery downloads.

Read existing selections:

~~~sh
haystack projections --directory /absolute/existing-workspace
haystack projection --directory /absolute/existing-workspace --projection-id ORIGINAL_ID
~~~

Preview and save complete argument files:

~~~sh
haystack projection-preview --directory /absolute/existing-workspace --file preview-args.json
haystack projection-create --directory /absolute/existing-workspace --file create-args.json
haystack projection-save --directory /absolute/existing-workspace --file save-args.json
~~~

The preview file contains `modelId`, `versionId` and the complete `profile`. Create adds the actual `author` and optional `note`. Save also supplies `projectionId` and the exact `expectedHeadId`. These convenience files omit `operationId` and `expectedRevision`; select those using the ordinary CLI options. For an already retained full request, use the original `replay` command.

Review and import:

~~~sh
haystack projection-review --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --head-id ORIGINAL_HEAD --decision ready \
  --author "Actual reviewer" --note-file review-note.txt
haystack projection-publish --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --head-id ORIGINAL_HEAD \
  --author "Actual operator" --note-file import-note.txt --no-select
~~~

Use the exact current IDs from the original reads. These placeholders are field illustrations, not runnable customer inputs.

Deliver or compare:

~~~sh
haystack projection-grid --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --version-id ORIGINAL_VERSION --out native-grid.json
haystack projection-lineage --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --format csv --out source-lineage.csv
haystack projection-report --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --format html --out projection-report.html
haystack projection-compare --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --before BEFORE_VERSION --after AFTER_VERSION
~~~

Preview a corrected original return:

~~~sh
haystack projection-return-preview --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --version-id ORIGINAL_VERSION --file returned-grid.json \
  --bindings row-bindings.json --consumer-reference EXISTING_CONSUMER_RECORD
~~~

The bindings file is the complete array of `{entityId,rowIndex}` selections; rowIndex is zero-based in the actual incoming grid. Apply with its exact returned SHA and complete `{entityId,decision}` array:

~~~sh
haystack projection-return-apply --directory /absolute/existing-workspace \
  --projection-id ORIGINAL_ID --head-id ORIGINAL_HEAD --file returned-grid.json \
  --bindings row-bindings.json --decisions row-decisions.json --return-sha ACTUAL_PREVIEW_SHA \
  --consumer-reference EXISTING_CONSUMER_RECORD --author "Actual reviewer" --note-file decision-note.txt
~~~

Use `--url` or an existing `--connection` instead of `--directory` for the ordinary authenticated server. `--token-file`, original workspace/instance bindings, `--expected-revision`, `--request-file` and `replay` retain their existing semantics. List and comparison commands read all pages by default; `--page` selects one bounded page. Existing output files are reusable only when their complete bytes match.
