# Maintain an existing collection review through a source edition

A catalogue can be corrected, reordered, expanded or delivered in another source format after an editor has already reviewed it. Collection Review keeps the complete earlier and replacement sources and asks the operator to decide which occurrences correspond. It saves the resulting editorial edition through the same original revision writer.

The source comparison does not fetch a website or change an institutional catalogue. Both complete sources must already be retained in the workspace. A structured metadata derivative must be described as a derivative; changing its format does not make it a new observation by the institution.

## Browser operation

1. Open the existing saved collection workspace. Resolve any pending save. Apply valid raw editorial JSON, or keep unfinished raw text in a working-copy download before choosing a different draft.
2. Add the complete replacement source. Clear **Select this source in the current review** when retaining it. Both source editions remain in the source list; the earlier edition stays selected.
3. Under **Maintain a source edition**, choose the earlier selected source and the retained replacement. Start the source comparison. This freezes the current editorial draft and its saved revision as the comparison basis.
4. Inspect the institutional metadata changes and the complete original occurrence list. Each occurrence retains its literal combined title/date, target URL, source ordinal and original source locator.
5. Choose a target occurrence or explicitly omit the earlier occurrence from the new review. Every earlier occurrence must be resolved. A replacement occurrence can be used at most once.
6. Choose the editorial fields, rights observation, story position and relationship endpoints to carry. Record the basis for changed correspondences and every dropped piece of existing work.
7. Prepare the reviewed edition. Read its complete comparison and the effects on reviews, rights, story order and relationships. Save the reviewed edition through the original pending-request writer.
8. Download the complete editable packet or ZIP. A colleague receives every original source, earlier review, correspondence decision and unfinished browser draft. Receiving preserves the colleague's currently selected saved revision.

### Correspondence is explicit

Suggestions compare literal title and URL. **Select unique exact matches** is an explicit operator action; it chooses only pairs whose literal title/URL combination occurs exactly once in each edition. It proposes carrying editorial fields, story position and relationship endpoints, with rights reset to unknown unless separately selected. It never uses URL alone as proof of correspondence.

Repeated URLs with different titles remain separate. Repeated identical title/URL pairs are ambiguous. Changed labels, dates embedded in labels, URLs and source positions are visible. The UI shows at most 50 candidate suggestions per earlier occurrence and the complete candidate count; select any retained replacement occurrence by its exact source ordinal. The full replacement source and its unmatched entries remain available.

Many-to-one mappings are refused. If an institution merged records, choose which earlier occurrence corresponds to the replacement and explicitly omit the other from this new edition, explaining the decision. Its original source and review remain in history. Split records likewise require an explicit one-to-one choice; additional replacement occurrences start unreviewed and can be edited after this edition is saved.

### Carrying editorial work

| Choice | Result |
| --- | --- |
| Editorial fields | The previous status, proposed title, summary and review note are copied to the selected replacement occurrence. |
| Recorded rights and basis | The original rights status, basis and source citation are copied with the editorial review. The operator must independently assess whether that observation applies to the replacement. |
| Story position | An original story item moves to the selected replacement in the same sequence. Its included editorial review must also be carried. |
| Relationship endpoints | An original relationship is retained only when every replaced endpoint is explicitly carried. Relationships between unaffected sources remain unchanged. |

Clearing a carry choice is an omission from the new edition. An existing review, nonempty rights observation, story item or affected relationship requires an explanatory note when dropped, even if the selected target has the same title and URL. Request preparation refuses an inconsistent story carry instead of silently dropping it.

Unmatched replacement records start without editorial review and do not enter the story automatically. The complete source still includes them. The comparison lists every currently unmatched replacement occurrence; these are not automatically proven additions to the institution's collection.

## Drafts, interrupted saves and receiving

The comparison belongs to the existing browser draft. It retains the exact basis state, all correspondence choices and notes, pagination/filter state, and any prepared request. Reloading the same browser copy restores that work. Complete working-copy downloads and ordinary workspace export preserve it as an unfinished copy.

Editing the main review after starting a comparison does not replace the comparison basis. **Refresh from current draft** explicitly updates that basis while retaining the correspondence choices for renewed review. Changed raw JSON must first be applied or preserved. Preparing and saving refuse a stale main-draft snapshot. Changing the recorded operator or revision note requires preparing the revised request before saving it.

The prepared request contains its original UUID, expected saved revision, timestamp, operator, note, complete input draft, both source IDs, complete correspondence decisions, plan digest and projected result. The existing pending record is persisted before save processing. Recover the same request after an uncertain result.

Recovery recognizes a previously saved original UUID before applying the expected-revision comparison. Replaying it preserves a later saved head. The browser adopts the projected state only while the original submitted main-draft snapshot is still selected; later local text remains on its own original basis. It never silently overwrites that text to display an earlier completion.

Each saved source-edition revision is verified against its retained complete sources. Receiving rebuilds the correspondence projection and requires the recorded result and plan digest to match. All older source bytes, root history, divergent revisions and unfinished copies use the existing full-workspace receiver. The receiver selects no incoming draft and dispatches no request.

## Installed CLI

Use the same installed collection-review command. All outputs are create-only; use distinct output filenames and retain the original request.

~~~sh
starforge collection-review source --project existing-workspace.json \
  --file replacement.json --format structured-json \
  --url https://example.org/original-catalogue \
  --observed-at ACTUAL_ISO_TIMESTAMP --out with-replacement.json

starforge collection-review compare-editions --project with-replacement.json \
  --from EARLIER_SOURCE_ID --to REPLACEMENT_SOURCE_ID --out edition-plan.json

starforge collection-review edition-report --project with-replacement.json \
  --plan edition-plan.json --out correspondence-review.html

starforge collection-review prepare-edition --project with-replacement.json \
  --plan edition-plan.json --actor "Actual editorial operator" \
  --note "Describe this reviewed source edition" --out original-edition-request.json

starforge collection-review save --project with-replacement.json \
  --request original-edition-request.json --out next-workspace.json

starforge collection-review export --project next-workspace.json \
  --native --out complete-collection-review.zip
~~~

The URL, timestamp and source IDs above are argument examples. Use the actual source locator and retained IDs. Edit every decision in edition-plan.json between comparison and preparation. An optional --draft argument to compare-editions selects a complete local editorial draft instead of the saved head. The plan's expectedRevision remains the original saved basis. A changed saved head requires explicit renewed preparation from the current workspace; it does not permit changing an already retained request body.

Use the existing receive command to merge a colleague's complete packet, report for the selected complete institutional review, and publication-check/publish for the existing public artifact gate. Source-edition handling does not remove or replace that gate.

## JavaScript API and complete export

The package's collection-review export includes collectionEditionReport and prepareCollectionEditionRequest alongside the existing writer and receiver. The /collection-review/editions export provides compareCollectionEditions, projectCollectionEdition, buildCollectionEditionTransition, validateCollectionEditionTransition and emptyEditionDecision. The low-level projection assumes source/state admission; the workspace API performs complete validation before operating.

The optional request.sourceEdition is part of the original hashed immutable revision. Complete exports contain one source-editions/REVISION.json comparison per saved transition, in addition to the original whole workspace, sources, structured review, CSV metadata, story and optional native Source Tables package. The comparison renderer is available at /collection-review/edition-report.

The existing limits continue: 4 MiB per retained source, 64 sources, 20,000 total retained occurrences, 1,000 revisions and 64 MiB for the complete workspace. A transition retains both source editions and the complete submitted editorial basis, so it consumes real workspace capacity. A refusal preserves the original usable workspace and draft. No automatic pruning or source replacement occurs.

## Operated example

The example source-edition course carries the already reviewed TMU 19-occurrence source into an explicitly derived structured metadata transport; Museum London's 25 occurrences stay selected unchanged. It preserves all 44 reviews, 14 story positions and 19 relationships, with every rights state unknown. The source titles, links and ordering come from the retained redacted example; no institution page was newly fetched.

The course executes the actual model, revision writer, replay, full packet reopening, local-head-preserving receiving and native ZIP generator in V8 with controlled platform adapters. Separate controlled inputs exercise changed/removal decisions, duplicate correspondence, missing reasons, rights choices, stale revisions and tampered receiving. This is source execution, not a native browser, installed process, new institutional observation or customer acceptance claim.


## Standing rendered-product and attachment rule

Before calling any client/prospect-facing app, website, dashboard, demo, report, presentation or export ready, the producing peer must actually open, run or render the exact outgoing version, look at its real rendered screen or screenshots, and operate the important controls. Check screenshare and relevant narrow/mobile widths; populated, empty, loading and error states; downloads, exports and reopening. Capturing screenshots without viewing them is insufficient.

Fix ugly, broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work. Code review, DOM counts, HTTP 200, tests and peer approval do not replace seeing the product.

All attachments must literally be opened, viewed, played or used in their final form as the recipient would: HTML, PDF, report, slides, spreadsheet, map, image, video, audio, archive and working project. Extract archives and open their contained deliverables and working project. Test results, checklists and captured-only images are not substitutes.

Use appropriate available high-quality generative media and natural voice when the deliverable calls for them. Watch and listen to the final exported media for pronunciation, pacing, timing and audio alignment. Keep building and fixing; do not substitute inspection theatre.

Apply the Ecosystem industrial-design standard: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve the real workflow, data and computation. Reviews should lead directly to repairs, not replace implementation or integration or create endless rechecks. Use focused validation only; no broad suite or separate verification product. An empty scientific Workspace image is not completed Workspace acceptance.

Persist the complete rule into every active owned instruction surface that the workflow actually consumes, including owned AGENTS/CLAUDE/GEMINI/rules, provider boot, Commons/cloud mirrors and build/receiving guides. Include the full rule, all-attachment requirement and final-media clarification in child assignments. Record the paths, selected versions and actual readback. Preserve historical/vendor policy and other owners' controls. Do not force a restart, create a new watcher or revive owner-stopped work.

Continue through the original Ecosystem product, native source/runtime, archive, browser and receiver owners. The October 13 14:00 UTC cutoff concerns that Ecosystem project only; it does not terminate other projects or this standing rule. The canonical machine policy remains with its existing owner at C:/Users/lucys/.commons/rendered-product-inspection-policy.md and its JSON companion.

### Exact Collection Review receiving course

The original producing/receiving operator opens the selected installed Collection Review version with its real example packet. Inspect the populated 44-occurrence desk and an empty workspace at desktop/screenshare and narrow/mobile widths. Open the complete earlier and replacement source metadata; inspect TMU's same-URL occurrences 6 and 11 separately. Start comparison, inspect all correspondence pages and metadata changes, use the explicit exact-match action, change one carry choice, require the actual omission note, and inspect the complete printable comparison.

Prepare and save the reviewed edition, reopen its original UUID result, and confirm later draft/raw text is preserved. Exercise one unresolved mapping, inconsistent story carry, changed operator/note and stale draft basis through their actual error controls. Download the editable working copy and full native archive, extract it, open the report and complete source-edition JSON, and reopen the actual working project in a fresh browser copy. Receive the same incoming history into a destination with a later local draft and confirm that the local selection and text remain while the incoming edition is explicitly selectable.

View the resulting screens and report, including a full-page/print rendering when appropriate, and repair observed layout or interaction defects on this same product. Record actual version, rendered artifact identity and outcomes. Until this course is actually operated and visually inspected, describe the result as source-integrated with its actual source-validation boundary; do not call it a rendered-ready application or final inspected attachment.
