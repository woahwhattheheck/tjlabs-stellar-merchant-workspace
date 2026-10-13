# Federal Register public-source receiving

This source workflow supplies a complete real input set for the original content-consolidation receiver. It retains the Federal Register agency roster, every response page for one publication day, and selected official PDFs linked by those exact records. The existing GovHub worker and Drupal Migrate perform all target writes.

## Source acquisition

Run `python3 content_consolidation/sources/federal_register.py capture --source-root /absolute/source-root --directory federal-register/initial --capture-id fr-initial-20261012 --pdf-count 5`. The source root must be the original configured GovHub source root. The directory is a relative member of that root.

Without `--publication-date`, the command retains the publisher's newest-document discovery response and selects that record's actual publication date. It then follows every `next_page_url` for the selected day and checks the declared count, page count, stable publication date and terminal page. It never substitutes an arbitrary page for the complete feed. Original agency integer IDs are explicitly encoded as decimal strings; document numbers remain exact original strings.

Repeat the identical command to resume its original acquisition. A completed resource is reused only after its retained byte count and SHA-256 match. Requests, final public URLs, observation times and relevant response headers are retained with the original bytes. Interrupted GETs can be downloaded again; completed source bytes are never rewritten into a different observation.

For a fresh edition, choose a new capture directory and capture ID, and pass `--publication-date` with the exact day from the first capture. The first capture remains intact. The command retains a second independently observed roster, full publication-day feed and selected PDFs. Its output reports the actual date, counts and any agency labels the publisher has not assigned a normalized ID.

The default selects the first five available official PDF links in original document order. `--pdf-count` selects 1–250 files. The complete agency and document feeds remain retained regardless of the selected media count. `--max-total-bytes` sets the explicit acquisition budget; the default is 2 GiB. JSON/HTML responses may be at most 32 MiB each and individual PDFs at most 128 MiB. A larger source needs an explicitly equipped acquisition before selecting its bytes in the original case.

Each capture directory contains `capture.json`, its same-acquisition `capture-state.json`, and content-addressed original files under `objects/`. Paths in the capture are relative to the source root, so the source bundle can be reopened under a different absolute root without changing original bytes.

## Native schema and mapping

Use the existing equipped receiving target. After installing `govhub_consolidation`, run `drush php:script provision_federal_register --script-path=/absolute/content_consolidation/sources` through that target's real Drush. The provisioner creates the owned Federal Register vocabulary, node and media bundles through Drupal APIs, verifies existing field/source definitions and configures the receiving displays. The selected operator retains the original Drupal profile and native run.

| Migration suffix | Native destination | Original identity and content |
| --- | --- | --- |
| `agencies` | `taxonomy_term:fr_agencies` | Complete roster; exact decimal agency ID; original name. |
| `files` | `file` | Selected original document-number keys bound to retained official PDF bytes; stable `public://federal-register/` URI. |
| `media` | `media:fr_pdf` | Same document-number keys; actual file-map lookup into `field_fr_pdf_file`. |
| `documents` | `node:fr_document` | Every original document for the selected day; full title, abstract, date, ordered normalized agency relationships, selected PDF media and original source URL. |
| `aliases` | `path_alias` | Selected document-number keys; `/federal-register/<document-number>` resolves to the actual imported node. |

The default migration prefix is `govhub_fr_govhub`. Keep that prefix and the same family for every stage and continuation. Native entity destinations select `validate: true`. Each file copy is at the top level of its separate file migration; every copied row has an explicit reviewed retained-file binding. Nested media fields use original migration-map lookups.

Drupal's node-title storage is limited, so the native node title uses the complete document number. `field_fr_title` retains and displays the full original document title in a long text field. The original abstract is displayed as plain text. No source title is shortened to fit a different destination field.

Normalized agency IDs are looked up in original array order. Publisher agency labels without normalized IDs remain in the full original record and are listed in the capture. The optional relationship field does not create stub agencies. Required file and document lookups use `no_stub: true` followed by core `skip_on_empty(method: row)`; a missing lookup alone would return null.

The URL receiving selection checks the actual native alias response. Its old and canonical URL are the same selected alias in this example. Projects requiring HTTP redirects can supply their own separately reviewed route mapping through the existing consolidation UI.

## Build the complete original receiving case

Prepare `family.json` from the original configured family. It can select an existing `family_id`, or contain the actual original `content.families.save` request for the equipped environment. Include the family's agreed limits when selecting an existing family.

Run `python3 content_consolidation/sources/federal_register.py build-case --source-root /absolute/source-root --capture /absolute/source-root/federal-register/initial/capture.json --refresh-capture /absolute/source-root/federal-register/refresh/capture.json --family /private/family.json --base-url http://actual-drupal-host --output /private/federal-register-case.json`.

The generator verifies every retained byte and both complete source counts before it writes the case. Both acquisitions must be independently observed captures of the same publication day. The output is the exact `govhub.content-consolidation.receiving-case.v1` input consumed by `examples/native_receiving.py`; source paths, file aliases, edition aliases and per-migration media bindings already match that caller.

The default agreed selection is five migrations, at most 1,000 native migration rows, 250 media files, 2 GiB of selected media and 250 explicit routes. The native-row count includes agency, file, media, document and alias rows. The generator reports a scope mismatch with the complete captured inputs still retained. `--route-count` and `--pdf-count` make the selected work explicit; the original feeds remain complete.

## Receiving stages

1. **Initial:** prepare and review the original captured feeds and five native migrations. Import through the existing worker. The default `content_row_limit` is 100, so an incomplete native pass remains on its original operation and checkpoint. Resume that same operation through the caller until complete.
2. **Enrichment:** prepare the second actual source observation, inspect original source differences and review the mapping change. This stage maps the publisher's document type into `field_fr_document_type`. It preserves all native migration IDs, exact source IDs, original files and source history. Native Migrate handles both changed source rows and process-only changes.
3. **Selected rollback:** the generator writes a separate `-rollback-selection.json` containing the first selected PDF document's native node, media and file identities, plus its alias when selected. Pass that exact selection to the original caller with `execute enrichment --kind CONTENT_ROLLBACK --selection /private/federal-register-case-rollback-selection.json --reason "Receive the selected migration-owned document rollback."`. Preserve the original global workspace, account, case and receipt arguments. The native runner reverses dependencies and applies the existing maps' rollback actions.
4. **Restored:** prepare and review the retained enriched sources again through the `restored` stage. It reimports the selected migration-owned records using the same native IDs while retaining the prior rollback and operation history.
5. **Receive and reopen:** use the same caller's complete original handover and independent workspace receive flow, then run `web/receiving_browser.mjs` against that received case for desktop and 390-pixel operator receiving. Actual JSON:API entities, selected relationships, original PDF bytes, alias routes, source-inclusive exports and complete workspace reopen stay with the original receiving operation.

The receiving caller's stage and request identities are immutable. Keep both captures and all stages in the case before starting it. Use the original operation ID for continuation; a new capture or case does not replace an unfinished native command.

## Publisher references

- REST API and reuse information: https://www.federalregister.gov/reader-aids/developer-resources/rest-api
- Interactive API documentation: https://www.federalregister.gov/developers/documentation/api/v1
- Official API client and document-field definitions: https://github.com/usnationalarchives/federal_register

FederalRegister.gov describes its JSON/XML rendition as informational and links documents to their official govinfo PDFs. This workflow retains both the selected original JSON responses and those linked PDF bytes. Its interface uses the project's own industrial layout and does not reproduce NARA or OFR logos or seals.

## Retained 12 October 2026 input edition

The first actual acquisition and its independent refresh each retain 473 agencies and all 103 document records returned for the publisher-supplied publication date **2026-10-13**. The API and original PDF responses were observed on 12 October. The capture preserves that exact publisher date. Both queries reached the terminal first page with count 103. All document agency references resolve against the 473-record roster.

The selected original PDFs are documents `2026-20785`, `2026-20787`, `2026-20789`, `2026-20793` and `2026-20794`, totaling 1,473,244 bytes per observation. The retained source and PDF bytes are unchanged across the two observations; the enrichment stage therefore exercises a real mapping-only native update against independently re-observed original data.

The complete 22-member input bundle is `Federal_Register_Receiving_Inputs_20261012.zip`, 2,942,388 bytes, SHA-256 `2caa3cc4a7e0449403e939c59ecc57cfade705d377ae039a09583d9b218c4f21`. Its two original capture manifests are retained under `captures/` alongside this source. The five mappings select **689 native rows** and 103 explicit alias routes, within the original receiving scope.
