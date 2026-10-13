# Open311 service requests and municipal assets

This is the Service assets section of the existing Municipal Asset Workspace. The original Open311 collector remains responsible for its connections, source requests, date windows, pagination and source reviews. This receiver joins its complete saved collection to the selected municipal project, inventory, mappings and operational work orders.

## Receive the actual source

In the original Open311 desk, finish or pause the selected collection and download its complete JSON export. Its schema is `commons.open311.collection-export.v1`. Preserve that original file and SHA256. Do not substitute the collection CSV, a screenshot, a summary or an individual provider page.

Open the existing municipal project. In **Inputs & mapping**, select **Service requests**, **open311-collection**, and the full original JSON. The current native input limit is32MiB. An oversized export is preserved in its original desk; select an actual smaller upstream collection with explicit query/coverage rather than trimming records or captures in this receiver.

Save the proposed request mapping. Keep original id→id, asset_id→asset_id, status→status with no identifier trimming or status aliases. The source-qualified ID includes both connection ID and original service-request ID. The original unqualified ID remains in the complete source row. Summary/date fields may select their existing source columns. No asset is inferred from location, name, coordinates or the source's internal review.

The importer retains every complete original HTTP body and checks its exact bytes and SHA256, the original source values, capture/window/query selection, full observed version index, selected latest records and window counts. The original creation operation is outside this collection-export contract; the receiver retains the actual supplied source operations without manufacturing that missing operation.

JavaScript upstream row digests remain recorded producer identities. Native association binding hashes independently cover the complete typed native row and exact selected mapping. Numeric JSON values such as47 and47.0 compare as the same finite source number; null, boolean, text, object keys and array order remain distinct. Complete original HTTP bytes preserve the original numeric spelling.

## Review each relationship

Open **Service assets**. The source panel shows original file/input/SHA, actual collection state, recorded coverage counts, and mapped inventory population. Limited, paused or interrupted collections retain their actual coverage. Even a resolved collection is a set of source observations, not a transactionally frozen municipal dataset.

Search and page through every selected request. Open **Review source and asset** to inspect the complete original row, every retained source version/occurrence, prior named decisions and the exact source/inventory/mapping binding.

Choose **linked**, **unlinked** or **deferred**. A linked decision must select exactly one current nonexcluded asset. Search the original inventory and use **Select this asset**; the engine independently rejects absent or ambiguous identities. Write the actual review reason. Operator attribution comes from the authenticated session.

Optional **Existing native work-order IDs** explicitly link one or more already imported orders to this request. Enter exact IDs, one per line, and use **Inspect selected native orders** to read their complete current rows before saving. Every chosen order must be unique and already belong to the selected asset. An order cannot simultaneously have another active named request association. Its original source request reference, native status and revision remain retained in the source and review snapshot. The current local mapped request_id uses this explicit association for the existing reconciliation and work-order workflow.

Unfinished reason, decision, exact asset and order IDs are saved in the same browser/project/source row. Download that draft when transferring the unfinished work. The draft is not an adopted association.

**Save named association review** uses the original project revision and original mutation writer. Its complete request is persisted before dispatch. A lost reply reuses that same operation/body/revision. The saved-request panel can download or retry the exact original. A confirmed returned rejection may be archived only after asking the original writer again; archived requests retain their original project and full body and remain downloadable in that project's Service assets view.

A changed request source, inventory, work-order selection or saved mapping makes an old decision stale. No stale override is applied. Reopen the complete current source and record a new decision. Selecting an older retained input/revision preserves its original history. The original source status and upstream internal review are never overwritten by local association decisions.

## Continue the same operational workflow

The existing **Assets & records**, **Review & repair**, **Work orders** and original native checker consume the current explicitly associated projection. Unlinked requests remain visible in the relationship findings. Review notes do not waive missing asset identities. Native work-order transition rules, expected revision, original returned result and apply-once behavior remain governed by the original application.

Prepared operational exports retain both the current local associations and the complete original source/reference snapshots. The original integration owner must map the selected local identity to the actual external API/CSV identity before an authorized outbound update. This receiver does not dispatch Open311 writes or replace the six existing desks.

## Native CLI and typed clients

The installed command uses the same original Python application and database:

```sh
starforge municipal-assets --python "$PYTHON" service-assets "$WORKSPACE" \
  --project "$PROJECT" import "$ORIGINAL_COLLECTION_JSON" \
  --expected-sha256 "$ORIGINAL_SHA256" --revision "$REVISION" \
  --actor "$ACTOR" --operation "$IMPORT_OPERATION"

starforge municipal-assets --python "$PYTHON" service-assets "$WORKSPACE" \
  --project "$PROJECT" mapping --revision "$REVISION_AFTER_IMPORT" \
  --actor "$ACTOR" --operation "$MAPPING_OPERATION"

starforge municipal-assets --python "$PYTHON" service-assets "$WORKSPACE" \
  --project "$PROJECT" view --row "$ORIGINAL_ROW"

starforge municipal-assets --python "$PYTHON" service-assets "$WORKSPACE" \
  --project "$PROJECT" review --row "$ORIGINAL_ROW" \
  --binding-sha256 "$DISPLAYED_BINDING_SHA256" --decision linked \
  --asset "$EXACT_ASSET_ID" --work-order "$EXACT_EXISTING_ORDER_ID" \
  --note "$REVIEW_REASON" --revision "$CURRENT_REVISION" \
  --actor "$ACTOR" --operation "$REVIEW_OPERATION"

starforge municipal-assets --python "$PYTHON" service-assets "$WORKSPACE" \
  --project "$PROJECT" export --kind handoff --revision "$CURRENT_REVISION" \
  --output "$NEW_COMPLETE_HANDOFF_ZIP"
```

Omit --work-order when no original order is selected. Repeat it for multiple exact orders. For unlinked/deferred omit both asset and order arguments. Use actual observed revisions; each successful mutation returns its original new revision. Rerun a lost-reply action with its original arguments. A committed import can recover its retained exact source bytes after the staging file moves, while its original filename/SHA/revision/operation remain the same.

Both typed clients expose serviceAssets() and reviewServiceAsset(). The existing merchant registration exposes merchant_municipal_assets_service_assets and merchant_municipal_assets_service_asset_review, with paged service_links in project_section. All actions use the original authenticated actor/managed instance and durable request transport. Configure a complete host-selected input as kind requests, format open311-collection. File transfer and editable handover use the established full-file transport.

## Full handoff and independent reopening

The existing complete report contains all current mapped requests/orders, source coverage, saved mappings, all named associations and their full original details. The normal handoff ZIP additionally includes:

- service-assets/review-history.json: full selected association history and source binding;
- service-assets/source-editions.json: exact identities and complete original metadata;
- service-assets/originals/: every request, inventory and work-order input referenced by retained reviews, plus the selected request source;
- original complete collection JSON, including raw HTTP bodies, source versions, coverage and operation records;
- the existing mapped CSVs, findings, repair proposals, original returned outcomes and full project history.

The ordinary SQLite backup retains every input version, mapping, named review and original operation. The installed stopped-workspace **handover** additionally preserves existing source/refresh/Maximo sidecars. Receive into a new private directory, open its own saved Application, inspect the same project IDs and current state, make an independent actual review, stop/reopen, and repeat the original receiving command. That replay preserves the later receiving edit.

## Original native receiving and rendered inspection

Join this whole extension to MCPHERSON-ASSET-WORKORDER-WORKSPACE-20261011-D1CC and SCF-MUNICIPAL-ASSET-ADOPTION-90ED-20261013. The asset-side extension identity is SCF-MUNICIPAL-SERVICE-ASSET-RECEIVING-90ED-20261013. The upstream8E5F/5403 collector and Boston104 programme retain their original source and native owner. Use their complete actual saved collection and the existing asset project's actual selected inventory; an absent known relationship should be recorded unlinked/deferred, not manufactured for a demo.

At an available point in that same equipped receiving programme, use the exact installed source to import/map/open a full actual collection; inspect a source version and coverage; save a justified link or an explicit unlinked review; exercise an applicable existing work-order association; reopen a saved unfinished note; recover the original committed request; select a distinct actual source or mapping and inspect its stale-review behavior; export/read complete files; independently receive and make a new saved review; then reopen and replay original receiving. Preserve the source owner's current operation and compute priority.

Before presenting the outgoing product or any attachment, actually open/run/render its exact version, LOOK at it and use it as a recipient. View the screenshots you capture. Inspect desktop and relevant narrow/mobile widths, populated/empty/loading/error states, source/version/asset/order controls, complete downloads and reopened working files. Open the usable contents of every ZIP/project and every applicable report/PDF page. Source review, HTTP results, schemas, tests, DOM counts, another peer's approval or unviewed captures cannot substitute for that observation. Repair real layout/control/output problems in the implementation and continue delivery.

Keep the interface readable industrial software. If adding voice/video, use high-quality generative voice/TTS/media and actually watch/listen to the final export. Retain the actual inspected views, complete files and original/reopened identities in the same receiving course; source publication is not a claim that this installed course has executed.
